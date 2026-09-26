/* =====================================================================
   ANALÍTICA DE PERSONAL (pestaña Resumen) — gráficos con Chart.js
   Usa marcaciones reales de la base de datos (puntualidad, demoras, horas) y la ficha de colaboradores
   ===================================================================== */
const CH = {};
const PAL = ['#7c6cff', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#a855f7', '#14b8a6', '#f97316', '#ef4444', '#94a3b8'];
function chart(id, cfg) {
  const c = document.getElementById(id); if (!c || !window.Chart) return;
  if (CH[id]) CH[id].destroy();
  cfg.options = { responsive: true, maintainAspectRatio: false, ...(cfg.options || {}) };
  CH[id] = new Chart(c, cfg);
}
const cbox = (id, h = 280) => `<div class="chartbox" style="height:${h}px"><canvas id="${id}"></canvas></div>`;
const acard = (t, body, sub = '') => `<div class="card"><div class="row between"><h3>${t}</h3>${sub}</div><div class="mt">${body}</div></div>`;
const vacio = (m = 'No hay datos para este módulo') => `<div class="empty">${m}</div>`;
const AX = { grid: { color: '#eef0f7' }, ticks: { color: '#6b7694', font: { size: 11 } } };
const donut = (id, labels, data, colors = PAL) => chart(id, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] }, options: { cutout: '62%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, color: '#6b7694' } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} (${(c.raw / c.dataset.data.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%)` } } } } });
const hbar = (id, labels, data, color = '#7c6cff', unit = '') => chart(id, { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 6, barThickness: 16 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw}${unit}` } } }, scales: { x: { ...AX, beginAtZero: true }, y: { ...AX, grid: { display: false } } } } });
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

async function renderAnalitica(el) {
  if (!window.Chart) { el.innerHTML = '<div class="card mt"><p class="muted">No se pudo cargar la librería de gráficos (se requiere conexión a internet).</p></div>'; return; }
  const periodo = S.anaDias || 30;
  el.innerHTML = `<div class="row between mt" style="margin-top:28px"><div><h1 style="font-size:22px">Analítica de personal</h1><p class="muted" style="margin:4px 0 0">Datos reales de ingresos, salidas y ficha de colaboradores</p></div>
    <div class="seg" id="anaSeg">${[7, 30, 90].map(d => `<span data-d="${d}" class="${d === periodo ? 'on' : ''}">${d} días</span>`).join('')}</div></div>
    ${modOn('asistencia') ? '<div id="anaAsis"><div class="empty">Calculando analítica de asistencia…</div></div>' : ''}
    <div id="anaEquipo"></div>`;
  $$('#anaSeg span', el).forEach(s => s.onclick = () => { S.anaDias = Number(s.dataset.d); renderAnalitica(el); });
  analiticaEquipo($('#anaEquipo'));
  if (modOn('asistencia')) { try { await analiticaAsistencia($('#anaAsis'), periodo); } catch (e) { $('#anaAsis').innerHTML = `<div class="card">${h(dbErr(e))}</div>`; } }
}

/* ---------------- ASISTENCIA ---------------- */
async function analiticaAsistencia(el, N) {
  const now = new Date(), hoy = ymd(now), d90 = ymd(addDays(now, -89)), ini = ymd(addDays(now, -(N - 1)));
  const marks = await fetchMarcas(null, d90, hoy);
  const act = new Map(S.colabs.map(c => [c.id, c]));
  // primer ingreso de cada colaborador por día (con puntualidad evaluada)
  const primeros = {}; marks.forEach(m => { if (m.tipo === 'ingreso' && m.puntualidad && act.has(m.colaborador_id)) { const k = m.colaborador_id + '|' + m.fecha; if (!primeros[k]) primeros[k] = m; } });
  const ing = Object.values(primeros), enP = ing.filter(m => m.fecha >= ini);
  if (!enP.length) { el.innerHTML = `<div class="card mt"><div class="empty">Aún no hay marcaciones en los últimos ${N} días para analizar.</div></div>`; return; }
  const tarde = enP.filter(m => m.puntualidad === 'tarde'), aT = enP.filter(m => m.puntualidad === 'a_tiempo'), temp = enP.filter(m => m.puntualidad === 'temprano');
  const salidasAnt = marks.filter(m => m.fecha >= ini && m.tipo === 'salida' && m.puntualidad === 'temprano' && act.has(m.colaborador_id));
  const pctPunt = Math.round((aT.length + temp.length) / enP.length * 100);
  // horas (motor legal)
  const rep = await computeReport(activos(), ini, hoy);
  const totH = sum(rep, r => r.res.totalMin) / 60, extH = sum(rep, r => r.res.extraMin) / 60;
  const K = (ic, v, l) => `<div class="card kpi"><div><div class="v">${v}</div><div class="l">${l}</div></div><div class="ic">${ic}</div></div>`;

  // demoras por colaborador
  const por = {}; enP.forEach(m => { (por[m.colaborador_id] ||= []).push(m); });
  const rank = Object.entries(por).map(([id, ms]) => { const t = ms.filter(m => m.puntualidad === 'tarde'); return { id, n: t.length, min: sum(t, m => m.diff_min), prom: t.length ? avg(t.map(m => m.diff_min)) : 0, dias: ms.length }; }).filter(r => r.n).sort((a, b) => b.min - a.min);
  // "más de lo habitual": últimos 7 días vs. historial previo (hasta 90 días)
  const ini7 = ymd(addDays(now, -6)), alertas = [];
  Object.keys(por).length; const porAll = {}; ing.forEach(m => (porAll[m.colaborador_id] ||= []).push(m));
  Object.entries(porAll).forEach(([id, ms]) => {
    const rec = ms.filter(m => m.fecha >= ini7), base = ms.filter(m => m.fecha < ini7);
    if (rec.length < 2 || base.length < 5) return;
    const dr = avg(rec.map(m => Math.max(m.diff_min, 0))), db = avg(base.map(m => Math.max(m.diff_min, 0)));
    if (dr - db >= 5) alertas.push({ id, hab: db, rec: dr, delta: dr - db, tard7: rec.filter(m => m.puntualidad === 'tarde').length });
  });
  alertas.sort((a, b) => b.delta - a.delta);
  // tendencia diaria
  const dias = []; for (let i = N - 1; i >= 0; i--) dias.push(ymd(addDays(now, -i)));
  const asis = dias.map(d => new Set(marks.filter(m => m.fecha === d && m.tipo === 'ingreso').map(m => m.colaborador_id)).size);
  const tard = dias.map(d => enP.filter(m => m.fecha === d && m.puntualidad === 'tarde').length);
  // por día de la semana y por hora de ingreso
  const wd = [1, 2, 3, 4, 5, 6, 0].map(w => tarde.filter(m => parseYmd(m.fecha).getDay() === w).length);
  const buckets = {}; enP.forEach(m => { const d = new Date(m.ts), b = d.getHours() * 60 + (d.getMinutes() >= 30 ? 30 : 0); buckets[b] = (buckets[b] || 0) + 1; });
  const bk = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  // horas por área y extras por persona
  const areaH = {}; rep.forEach(r => { const a = r.colab.area || 'Sin área'; areaH[a] = (areaH[a] || 0) + r.res.totalMin / 60; });
  const topExtra = rep.map(r => ({ n: nombreCompleto(r.colab), e: r.res.extraMin / 60 })).filter(x => x.e > 0).sort((a, b) => b.e - a.e).slice(0, 8);
  const antic = Object.entries(groupBy(salidasAnt, 'colaborador_id')).map(([id, ms]) => ({ id, n: ms.length })).sort((a, b) => b.n - a.n).slice(0, 8);
  const nm = id => nombreCompleto(act.get(id) || {});

  el.innerHTML = `<div class="kpis mt">${K('✅', pctPunt + '%', 'Puntualidad (a tiempo o temprano)')}${K('⏰', tarde.length, 'Llegadas tarde')}${K('⌛', tarde.length ? Math.round(avg(tarde.map(m => m.diff_min))) + ' min' : '0 min', 'Demora promedio al llegar tarde')}${K('🚪', salidasAnt.length, 'Salidas anticipadas')}${K('🕒', totH.toFixed(0) + ' h', 'Horas laboradas')}${K('➕', extH.toFixed(1) + ' h', 'Horas extras')}</div>
    <div class="grid2 mt">${acard('Puntualidad en el ingreso', cbox('cPunt'))}${acard('Asistencia y tardanzas por día', cbox('cTrend'))}</div>
    <div class="grid2 mt">${acard('¿Quién demora más? (minutos acumulados de retraso)', rank.length ? cbox('cRank', Math.max(220, rank.slice(0, 10).length * 34 + 40)) : vacio('Nadie ha llegado tarde en este periodo 🎉'))}
      ${acard('Demorando más de lo habitual', alertas.length ? `<table><thead><tr><th>Colaborador</th><th class="num">Habitual</th><th class="num">Últimos 7 días</th><th class="num">Variación</th></tr></thead><tbody>${alertas.slice(0, 8).map(a => `<tr><td>${colabCell(a.id)}</td><td class="num">${a.hab.toFixed(1)} min</td><td class="num">${a.rec.toFixed(1)} min</td><td class="num"><span class="badge red">+${a.delta.toFixed(1)} min</span></td></tr>`).join('')}</tbody></table><p class="hint">Compara el retraso promedio de los últimos 7 días con su historial de los 90 días anteriores (mínimo 5 registros previos y 2 recientes).</p>` : vacio('Nadie está demorando más de lo habitual'), '<span class="badge amber">7 días vs. historial</span>')}</div>
    <div class="grid2 mt">${acard('Llegadas tarde por día de la semana', cbox('cWd'))}${acard('Distribución de la hora de ingreso', cbox('cHora'))}</div>
    <div class="grid2 mt">${acard('Horas laboradas por área', Object.keys(areaH).length ? cbox('cArea') : vacio())}${acard('Más horas extras', topExtra.length ? cbox('cExtra', Math.max(220, topExtra.length * 34 + 40)) : vacio('Sin horas extras en el periodo'))}</div>
    ${antic.length ? `<div class="grid2 mt">${acard('Salidas anticipadas por colaborador', cbox('cAnt', Math.max(200, antic.length * 34 + 40)))}<div></div></div>` : ''}`;

  donut('cPunt', ['A tiempo', 'Temprano', 'Tarde'], [aT.length, temp.length, tarde.length], ['#22c55e', '#3b82f6', '#ef4444']);
  chart('cTrend', { data: { labels: dias.map(d => d.slice(5)), datasets: [{ type: 'bar', label: 'Tardanzas', data: tard, backgroundColor: '#ef4444', borderRadius: 4, order: 2 }, { type: 'line', label: 'Asistentes', data: asis, borderColor: '#7c6cff', backgroundColor: '#7c6cff', tension: .3, pointRadius: N > 30 ? 0 : 3, order: 1 }] }, options: { plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } }, scales: { x: { ...AX, ticks: { ...AX.ticks, maxTicksLimit: 12 } }, y: { ...AX, beginAtZero: true, ticks: { ...AX.ticks, precision: 0 } } } } });
  if (rank.length) { const top = rank.slice(0, 10); chart('cRank', { type: 'bar', data: { labels: top.map(r => nm(r.id)), datasets: [{ data: top.map(r => r.min), backgroundColor: '#ec4899', borderRadius: 6, barThickness: 16 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => { const r = top[c.dataIndex]; return ` ${r.min} min en ${r.n} llegada(s) tarde · prom. ${r.prom.toFixed(1)} min`; } } } }, scales: { x: { ...AX, beginAtZero: true }, y: { ...AX, grid: { display: false } } } } }); }
  chart('cWd', { type: 'bar', data: { labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], datasets: [{ data: wd, backgroundColor: '#f59e0b', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ...AX, grid: { display: false } }, y: { ...AX, beginAtZero: true, ticks: { ...AX.ticks, precision: 0 } } } } });
  chart('cHora', { type: 'bar', data: { labels: bk.map(b => `${pad(Math.floor(b / 60))}:${pad(b % 60)}`), datasets: [{ data: bk.map(b => buckets[b]), backgroundColor: '#3b82f6', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ...AX, grid: { display: false } }, y: { ...AX, beginAtZero: true, ticks: { ...AX.ticks, precision: 0 } } } } });
  if (Object.keys(areaH).length) chart('cArea', { type: 'bar', data: { labels: Object.keys(areaH), datasets: [{ data: Object.values(areaH).map(v => Math.round(v * 10) / 10), backgroundColor: '#22c55e', borderRadius: 6 }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw} h` } } }, scales: { x: { ...AX, grid: { display: false } }, y: { ...AX, beginAtZero: true } } } });
  if (topExtra.length) hbar('cExtra', topExtra.map(x => x.n), topExtra.map(x => Math.round(x.e * 10) / 10), '#a855f7', ' h');
  if (antic.length) hbar('cAnt', antic.map(a => nm(a.id)), antic.map(a => a.n), '#f97316', ' salida(s)');
}

/* ---------------- EQUIPO (People analytics) ---------------- */
function analiticaEquipo(el) {
  const act = activos(), hoy = new Date();
  if (!act.length) { el.innerHTML = ''; return; }
  const cnt = (arr, f) => { const o = {}; arr.forEach(x => { const k = f(x) || 'Sin dato'; o[k] = (o[k] || 0) + 1; }); return o; };
  const edad = c => c.fecha_nacimiento ? Math.floor((hoy - parseYmd(c.fecha_nacimiento)) / (365.25 * 864e5)) : null;
  const conEdad = act.filter(c => c.fecha_nacimiento), edades = conEdad.map(edad);
  const tramos = [['18-25 años', 0, 25], ['26-35 años', 26, 35], ['36-45 años', 36, 45], ['46-55 años', 46, 55], ['Mayor de 55', 56, 200]];
  const gen = c => { const y = parseYmd(c.fecha_nacimiento).getFullYear(); return y <= 1964 ? 'Baby boomers' : y <= 1980 ? 'Generación X' : y <= 1996 ? 'Millennials' : 'Generación Z'; };
  const antig = c => (hoy - parseYmd(c.fecha_ingreso)) / (365.25 * 864e5);
  const rangosA = [['< 1 año', 0, 1], ['1 a 2 años', 1, 2], ['2 a 5 años', 2, 5], ['5 a 10 años', 5, 10], ['> 10 años', 10, 99]];
  const smm = CFG.params.smmlv, rangosS = [['≤ 1 SMMLV', 0, 1.0001], ['1 – 2 SMMLV', 1.0001, 2], ['2 – 3 SMMLV', 2, 3], ['3 – 4 SMMLV', 3, 4], ['> 4 SMMLV', 4, 999]];
  const ordenados = [...act].sort((a, b) => a.fecha_ingreso.localeCompare(b.fecha_ingreso));
  const lista = (arr) => arr.map(c => `<div class="row between" style="padding:8px 0;border-bottom:1px solid #f0f2f9">${colabCell(c.id)}<span class="small muted">${fmtDate(c.fecha_ingreso)}</span></div>`).join('');
  const dims = { 'Área': c => c.area, 'Cargo': c => c.cargo, 'Contrato': c => c.tipo_contrato, 'Turno': c => turnoById(c.turno_id)?.nombre || 'Sin turno' };
  const dimActual = S.anaDim && dims[S.anaDim] ? S.anaDim : 'Área';
  const antigMedia = avg(act.map(antig));
  el.innerHTML = `<div class="grid2 mt">
    ${acard('Género', cbox('cGen', 260))}
    ${acard('Edad media del equipo', conEdad.length ? `<div class="row" style="justify-content:space-around;align-items:center;height:260px"><div class="center"><div style="font-size:64px;font-weight:800;color:var(--navy);line-height:1">${Math.round(avg(edades))}</div><div class="muted">años</div></div><div class="small muted" style="max-width:220px">Calculada con la fecha de nacimiento de ${conEdad.length} de ${act.length} colaboradores activos.</div></div>` : vacio('Registre la fecha de nacimiento de los colaboradores'))}</div>
    <div class="card mt"><div class="row between"><h3>Empleados por:</h3><div class="seg" id="dimSeg">${Object.keys(dims).map(k => `<span data-k="${k}" class="${k === dimActual ? 'on' : ''}">${k}</span>`).join('')}</div></div>
      <div class="grid2 mt"><div>${cbox('cDim', 300)}</div><div>${cbox('cDimB', 300)}</div></div></div>
    <div class="grid2 mt">${acard('Empleados por edad', conEdad.length ? cbox('cEdad', 280) : vacio())}${acard('Generaciones', conEdad.length ? cbox('cGener', 280) : vacio())}</div>
    <div class="grid2 mt">${acard('Antigüedad de los empleados en la empresa', cbox('cAntig', 260), `<span class="small muted">Media: <b>${antigMedia.toFixed(1)} años</b></span>`)}${acard('Empleados por rango salarial', cbox('cSal', 260))}</div>
    <div class="grid2 mt">${acard('Empleados más recientes', lista([...ordenados].reverse().slice(0, 5)))}${acard('Empleados más antiguos', lista(ordenados.slice(0, 5)))}</div>`;

  const g = cnt(act, c => c.genero); const gc = { Hombre: '#3b82f6', Mujer: '#a855f7', 'No binario': '#f59e0b', 'Sin dato': '#cbd5e1' };
  donut('cGen', Object.keys(g), Object.values(g), Object.keys(g).map(k => gc[k] || '#94a3b8'));
  const pintaDim = () => { const o = cnt(act, dims[dimActual]), ent = Object.entries(o).sort((a, b) => b[1] - a[1]); donut('cDim', ent.map(e => e[0]), ent.map(e => e[1])); hbar('cDimB', ent.map(e => e[0]), ent.map(e => e[1]), '#7c6cff'); };
  pintaDim(); $$('#dimSeg span', el).forEach(s => s.onclick = () => { S.anaDim = s.dataset.k; analiticaEquipo(el); });
  if (conEdad.length) {
    const tr = tramos.map(t => edades.filter(e => e >= t[1] && e <= t[2]).length); donut('cEdad', tramos.map(t => t[0]), tr, ['#e04d9b', '#cf4cf0', '#a855f7', '#8b5cf6', '#4f80f7']);
    const gg = cnt(conEdad, gen), ord = ['Baby boomers', 'Generación X', 'Millennials', 'Generación Z'].filter(k => gg[k]); donut('cGener', ord, ord.map(k => gg[k]), ['#6d83e8', '#e8d98a', '#9fdfca', '#9dbdf0']);
  }
  chart('cAntig', { type: 'bar', data: { labels: rangosA.map(r => r[0]), datasets: [{ data: rangosA.map(r => act.filter(c => antig(c) >= r[1] && antig(c) < r[2]).length), backgroundColor: '#f97316', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ...AX, grid: { display: false } }, y: { ...AX, beginAtZero: true, ticks: { ...AX.ticks, precision: 0 } } } } });
  hbar('cSal', rangosS.map(r => r[0]), rangosS.map(r => act.filter(c => c.salario / smm >= r[1] && c.salario / smm < r[2]).length), '#84cc16');
}
