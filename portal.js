/* =====================================================================
   PORTAL DEL COLABORADOR
   ===================================================================== */
const P = { me: null, turno: null, view: 'inicio', timers: [] };
const VW = {};
const NAVP = [
  { id: 'inicio', ic: '🏠', t: 'Inicio' }, { id: 'registros', mod: 'asistencia', ic: '🕒', t: 'Mis registros y horas' },
  { id: 'permisos', ic: '📝', t: 'Permisos e incapacidades' }, { id: 'nomina', mod: 'nomina', ic: '💵', t: 'Desprendibles y certificado' },
  { id: 'documentos', mod: 'documentos', ic: '✍️', t: 'Documentos y firma' }, { id: 'adelantos', mod: 'adelantos', ic: '⚡', t: 'Adelantos de sueldo' },
  { id: 'objetivos', mod: 'objetivos', ic: '🎯', t: 'Objetivos' }, { id: 'reconocimientos', mod: 'reconocimientos', ic: '⭐', t: 'Reconocimientos' },
  { id: 'encuestas', mod: 'encuestas', ic: '📋', t: 'Encuestas' }, { id: 'beneficios', mod: 'beneficios', ic: '🎁', t: 'Beneficios' },
  { id: 'denuncias', mod: 'denuncias', ic: '🛡️', t: 'Canal de denuncias' }, { id: 'chat', mod: 'comunicacion', ic: '💬', t: 'Chat con administración' },
  { id: 'perfil', ic: '👤', t: 'Mi perfil y tag NFC' }
];
const modOnP = m => !m || CFG.modulos[m] !== false;
const card = (t, body) => `<div class="card mb">${t ? `<h3>${t}</h3>` : ''}${body}</div>`;
const ph = (t, sub) => `<div class="page-head"><h1>${t}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;
const err = e => isMissingTable(e) ? 'Falta una tabla en la base de datos (ejecute schema.sql).' : errMsg(e);

async function bootPortal() {
  registerSW();
  $('#loginForm').onsubmit = async ev => {
    ev.preventDefault(); const er = $('#lErr'); er.classList.add('hidden');
    try {
      const ced = $('#lCed').value.replace(/\D/g, ''), pw = $('#lPass').value;
      const { data, error } = await sb.from('colaboradores').select('*').eq('cedula', ced).maybeSingle(); if (error) throw error;
      const ok = data && (data.pass_hash ? data.pass_hash === await hashPass(pw) : pw === data.cedula);
      if (!ok) throw new Error('Cédula o contraseña incorrectos.');
      if (data.estado !== 'activo') throw new Error('Su usuario está inactivo. Comuníquese con Talento Humano.');
      localStorage.setItem('rrhh_colab', data.id); await start(data);
    } catch (e) { er.textContent = err(e); er.classList.remove('hidden'); }
  };
  $('#btnInstall').onclick = e => { e.preventDefault(); installApp(); };
  $('#btnOut').onclick = e => { e.preventDefault(); localStorage.removeItem('rrhh_colab'); location.reload(); };
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  try { const id = localStorage.getItem('rrhh_colab'); if (id) { const { data } = await sb.from('colaboradores').select('*').eq('id', id).maybeSingle(); if (data && data.estado === 'activo') return start(data); } } catch (e) { }
  localStorage.removeItem('rrhh_colab');
}
async function start(me) {
  P.me = me; try { await loadConfig(); } catch (e) { }
  await refreshMe();
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#brName').textContent = CFG.empresa.nombre || 'Cashless Colombia'; nav(); go(P.view);
}
async function refreshMe() {
  const { data } = await sb.from('colaboradores').select('*').eq('id', P.me.id).single(); if (data) P.me = data;
  if (P.me.turno_id) { const { data: t } = await sb.from('turnos').select('*').eq('id', P.me.turno_id).maybeSingle(); P.turno = t; } else P.turno = null;
  $('#uAv').outerHTML = avatarHtml(P.me).replace('class="avatar', 'id="uAv" class="avatar'); $('#uName').textContent = nombreCompleto(P.me);
}
function nav() {
  $('#nav').innerHTML = NAVP.filter(i => modOnP(i.mod)).map(i => `<a data-v="${i.id}" class="${P.view === i.id ? 'active' : ''}"><span>${i.ic}</span>${i.t}</a>`).join('');
  $$('#nav a').forEach(a => a.onclick = () => { go(a.dataset.v); $('#sidebar').classList.remove('open'); });
}
async function go(id) {
  const it = NAVP.find(i => i.id === id); if (!it || !modOnP(it.mod)) id = 'inicio';
  P.timers.forEach(clearInterval); P.timers = []; P.view = id; nav(); $('#pTitle').textContent = NAVP.find(i => i.id === id).t;
  const el = $('#view'); el.innerHTML = '<div class="empty">Cargando…</div>';
  try { await VW[id](el); } catch (e) { console.error(e); el.innerHTML = `<div class="card"><h2>No se pudo cargar</h2><p class="muted">${h(err(e))}</p></div>`; }
}
const rangoMes = () => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth(), 1)), ymd(n)]; };

/* ---------------- INICIO ---------------- */
VW.inicio = async el => {
  await refreshMe(); const me = P.me, hoy = ymd(new Date()), lun = ymd(mondayOf(new Date())), asis = modOnP('asistencia');
  const marks = asis ? await fetchMarcas([me.id], lun, hoy) : [], t = P.turno, r = calcHoras(marks, getTurnoHist(marks, t), lun, hoy, new Date());
  const dia = r.dias[hoy], lim = jornadaSemanal(new Date()) * 60, hm_ = marks.filter(m => m.fecha === hoy), ing = hm_.find(m => m.tipo === 'ingreso'), sal = [...hm_].reverse().find(m => m.tipo === 'salida'), last = hm_[hm_.length - 1];
  const { data: coms } = modOnP('comunicacion') ? await sb.from('comunicados').select('*').order('fijado', { ascending: false }).order('created_at', { ascending: false }).limit(4) : { data: [] };
  el.innerHTML = `<div class="card mb"><div class="row" style="gap:16px">${avatarHtml(me, 'lg')}<div class="grow"><h1 style="font-size:22px">¡Hola, ${h(me.nombres.split(' ')[0])}!</h1><div class="muted">${h(me.cargo || '')} · ${h(me.area || '')}</div>
      <div class="mt"><span class="badge blue">Turno: ${h(t?.nombre || 'Sin turno')} · ${turnoTxt(t)}</span> ${me.nfc_tag ? '<span class="badge green">Tag NFC asignado</span>' : '<span class="badge amber">Sin tag NFC</span>'}</div></div></div></div>
    ${asis ? `<div class="kpis mb"><div class="card kpi"><div><div class="v">${hm(dia?.total || 0)}</div><div class="l">Horas trabajadas hoy</div></div><div class="ic">⏱</div></div>
      <div class="card kpi"><div><div class="v">${hm(r.totalMin)}</div><div class="l">Horas de la semana (máx. ${lim / 60} h)</div></div><div class="ic">📆</div></div>
      <div class="card kpi"><div><div class="v">${ing ? fmtTime(ing.ts) : '—'}</div><div class="l">Ingreso de hoy ${ing ? '· ' + (PUNT_LABEL.ingreso[ing.puntualidad] || '') : ''}</div></div><div class="ic">🟢</div></div>
      <div class="card kpi"><div><div class="v">${last?.tipo === 'salida' ? fmtTime(sal.ts) : (last ? 'En turno' : '—')}</div><div class="l">Salida de hoy</div></div><div class="ic">🔴</div></div></div>
      ${card('Progreso semanal', `<div class="bar"><i style="width:${Math.min(100, r.totalMin / lim * 100)}%"></i></div><div class="small muted mt">${hm(r.totalMin)} de ${hm(lim)} · extras acumuladas: ${hm(r.extraMin)}</div>`)}
      ${card('Marcaciones de hoy', hm_.length ? `<table><tbody>${hm_.map(m => `<tr><td width="90"><span class="badge ${m.tipo === 'ingreso' ? 'green' : 'red'}">${m.tipo}</span></td><td>${fmtTime(m.ts)}</td><td>${puntBadge(m)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Aún no hay marcaciones hoy.</div>')}` : ''}
    ${(coms || []).length ? card('📢 Comunicados', coms.map(c => `<div style="margin-bottom:12px">${c.fijado ? '📌 ' : ''}<b>${h(c.titulo)}</b><div class="small muted">${fmtDT(c.created_at)}</div><div>${h(c.mensaje)}</div></div>`).join('')) : ''}`;
};

/* ---------------- REGISTROS Y HORAS ---------------- */
VW.registros = async el => {
  const [d0, d1] = P.rango || rangoMes(); const me = P.me, t = P.turno;
  el.innerHTML = ph('Mis registros y horas', 'Cálculo bajo la legislación laboral colombiana (Ley 2101/2021 y Ley 2466/2025)') +
    `<div class="card mb"><div class="row"><div><label>Desde</label><input type="date" id="rD" value="${d0}"></div><div><label>Hasta</label><input type="date" id="rH" value="${d1}"></div><div style="align-self:end"><button class="btn primary" id="rGo">Consultar</button></div><div style="align-self:end"><button class="btn ok" id="rPdf">⬇ Descargar PDF</button></div></div></div><div id="rOut"></div>`;
  let cur = null;
  const run = async () => {
    const d = $('#rD').value, hh = $('#rH').value; if (!d || !hh || d > hh) return toast('Rango inválido', 'err'); P.rango = [d, hh];
    const marks = await fetchMarcas([me.id], ymd(mondayOf(parseYmd(d))), hh), res = calcHoras(marks, getTurnoHist(marks, t), d, hh, new Date()), inR = marks.filter(m => m.fecha >= d && m.fecha <= hh), rows = filasDias(res, inR); cur = { d, hh, res, inR };
    const T = res.total;
    $('#rOut').innerHTML = `<div class="kpis mb"><div class="card kpi"><div><div class="v">${dec(res.totalMin)}</div><div class="l">Horas laboradas</div></div></div><div class="card kpi"><div><div class="v">${res.diasMarcados}</div><div class="l">Días marcados</div></div></div><div class="card kpi"><div><div class="v">${dec(res.extraMin)}</div><div class="l">Horas extras</div></div></div></div>
    ${card('Detalle legal de horas', `<div class="grid2">${CATS.map(k => `<div class="row between" style="border-bottom:1px solid var(--line);padding:6px 0"><span>${CAT_LABEL[k]} <span class="small muted">(${(factorTotal(k, hh) * 100).toFixed(0)}%)</span></span><b>${dec(T[k])} h</b></div>`).join('')}</div>`)}
    <div class="card flush mb"><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Ingreso</th><th>Salida</th><th>Estado</th><th class="num">Total</th><th class="num">Extras</th><th class="num">Dom/Fest</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td>${x.dow} ${fmtDate(x.fecha)}</td><td>${fmtTime(x.ing?.ts)}</td><td>${x.sal ? fmtTime(x.sal.ts) : (x.sinSalida ? '<span class="badge red">Sin salida</span>' : '—')}</td><td>${x.ing ? puntBadge(x.ing) : '—'}</td><td class="num">${hm(x.total)}</td><td class="num">${hm(x.extra)}</td><td class="num">${hm(x.dom)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin marcaciones en el rango</td></tr>'}</tbody></table></div></div>
    ${card('Detalle de marcaciones', `<table><tbody>${inR.map(m => `<tr><td>${fmtDate(m.fecha)}</td><td>${fmtTime(m.ts)}</td><td><span class="badge ${m.tipo === 'ingreso' ? 'green' : 'red'}">${m.tipo}</span></td><td>${puntBadge(m)}</td><td class="small muted">${h(m.nota || '')}</td></tr>`).join('') || '<tr><td class="empty">Sin marcaciones</td></tr>'}</tbody></table>`)}`;
  };
  $('#rGo').onclick = run; $('#rPdf').onclick = async () => { if (!cur) await run(); pdfReporteIndividual(me, t, cur.d, cur.hh, cur.res, cur.inR); };
  run();
};

/* ---------------- PERMISOS ---------------- */
const TIPOS_PERM = [['permiso_remunerado', 'Permiso remunerado'], ['permiso_no_remunerado', 'Permiso no remunerado'], ['ausencia_temporal', 'Ausencia temporal (salgo y regreso)'], ['incapacidad', 'Incapacidad médica'], ['licencia', 'Licencia (luto, maternidad, paternidad…)'], ['vacaciones', 'Vacaciones'], ['otro', 'Otro documento']];
VW.permisos = async el => {
  const { data, error } = await sb.from('permisos').select('*').eq('colaborador_id', P.me.id).order('created_at', { ascending: false }); if (error) throw error;
  el.innerHTML = ph('Permisos e incapacidades', 'Solicite un permiso y adjunte el soporte si es necesario') +
    card('Nueva solicitud', `<form id="pF"><div class="grid2"><div class="field"><label>Tipo</label><select id="pT">${TIPOS_PERM.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></div><div></div>
    <div class="field" id="pDW"><label>Desde</label><input type="date" id="pD" value="${ymd(new Date())}" required></div><div class="field" id="pHW"><label>Hasta</label><input type="date" id="pH" value="${ymd(new Date())}" required></div>
    <div class="field full hidden" id="pAus"><div class="card" style="background:#f7f8fd"><b>Ausencia temporal</b><div class="hint mb">Use esta opción si necesita salir durante la jornada. Debe coincidir con lo que marque en el checador: al salir, su marcación quedará enlazada a esta solicitud y su regreso se comparará con el tiempo indicado.</div>
      <div class="grid3"><div class="field"><label>Fecha</label><input type="date" id="aF" value="${ymd(new Date())}" min="${ymd(new Date())}"></div><div class="field"><label>Hora de salida</label><input type="time" id="aH" value="${pad(new Date().getHours())}:${pad(new Date().getMinutes())}"></div>
      <div class="field"><label>¿Cuánto tiempo?</label><div class="row" style="flex-wrap:nowrap"><input type="number" id="aD" min="5" step="5" value="60"><select id="aU" style="width:110px"><option value="1">minutos</option><option value="60">horas</option></select></div></div></div>
      <label>¿Regresa el mismo día?</label><div class="row"><label class="chk"><input type="radio" name="aR" value="si" checked> Sí, regreso hoy</label><label class="chk"><input type="radio" name="aR" value="no"> No, ya no regreso hoy</label></div></div></div>
    <div class="field full"><label>Motivo</label><textarea id="pM" required></textarea></div>
    <div class="field full"><label>Documento adjunto (PDF o imagen, opcional)</label><input type="file" id="pF1" accept="image/*,application/pdf"><div class="hint">Para incapacidades adjunte la incapacidad expedida por la EPS/IPS.</div></div></div><button class="btn primary">Enviar solicitud</button></form>`) +
    card('Mis solicitudes', data.length ? `<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Fechas</th><th>Motivo</th><th>Doc.</th><th>Estado</th></tr></thead><tbody>${data.map(p => `<tr><td>${h(p.tipo.replace(/_/g, ' '))}</td><td>${p.tipo === 'ausencia_temporal' ? `${fmtDate(p.fecha_inicio)}<div class="small muted">Sale ${tShort(p.hora_salida)} · ${p.duracion_min >= 60 && p.duracion_min % 60 === 0 ? p.duracion_min / 60 + ' h' : p.duracion_min + ' min'} · ${p.regresa_mismo_dia === false ? 'no regresa hoy' : 'regresa hoy'}</div>${p.marcacion_salida_id ? '<div class="small"><span class="badge green">Salida marcada en checador</span></div>' : ''}${p.marcacion_regreso_id ? '<div class="small"><span class="badge green">Regreso marcado</span></div>' : ''}` : `${fmtDate(p.fecha_inicio)} → ${fmtDate(p.fecha_fin)}`}</td><td>${h(p.motivo || '')}${p.respuesta ? `<div class="small muted">Respuesta: ${h(p.respuesta)}</div>` : ''}</td><td>${p.documento_url ? `<a href="${h(p.documento_url)}" target="_blank" rel="noopener">📎</a>` : '—'}</td><td><span class="badge ${p.estado === 'aceptado' ? 'green' : p.estado === 'rechazado' ? 'red' : 'amber'}">${p.estado}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="muted">Aún no ha enviado solicitudes.</div>');
  const esAus = () => $('#pT').value === 'ausencia_temporal';
  $('#pT').onchange = () => { $('#pAus').classList.toggle('hidden', !esAus()); $('#pDW').classList.toggle('hidden', esAus()); $('#pHW').classList.toggle('hidden', esAus()); $('#pD').required = $('#pH').required = !esAus(); };
  $('#pF').onsubmit = async ev => {
    ev.preventDefault(); const b = $('#pF button'); b.disabled = true;
    try {
      let d = $('#pD').value, hh = $('#pH').value, extra = {};
      if (esAus()) {
        d = hh = $('#aF').value; const dur = Math.round(Number($('#aD').value) * Number($('#aU').value));
        if (!d || !$('#aH').value) throw new Error('Indique la fecha y la hora de salida.'); if (!(dur >= 5)) throw new Error('Indique cuánto tiempo estará ausente (mínimo 5 minutos).');
        if (d < ymd(new Date())) throw new Error('La fecha no puede ser anterior a hoy.');
        extra = { hora_salida: $('#aH').value, duracion_min: dur, regresa_mismo_dia: document.querySelector('input[name=aR]:checked').value === 'si' };
      }
      if (hh < d) throw new Error('La fecha final no puede ser anterior a la inicial.');
      const f = $('#pF1').files[0]; let url = null; if (f) { if (f.size > 8 * 1048576) throw new Error('El archivo supera 8 MB.'); url = await uploadDoc(f, 'permisos/' + P.me.id); }
      const { error } = await sb.from('permisos').insert({ colaborador_id: P.me.id, tipo: $('#pT').value, fecha_inicio: d, fecha_fin: hh, motivo: $('#pM').value.trim(), documento_url: url, documento_nombre: f?.name || null, ...extra });
      if (error) throw error;
      notify('permiso', `📝 Solicitud de permiso: ${nombreCompleto(P.me)}`, esAus() ? `Ausencia temporal ${fmtDate(d)} · sale ${extra.hora_salida} · ${extra.duracion_min} min · ${extra.regresa_mismo_dia ? 'regresa hoy' : 'no regresa hoy'}` : `${$('#pT').selectedOptions[0].text} · ${fmtDate(d)} a ${fmtDate(hh)}`, P.me.id);
      toast('Solicitud enviada', 'ok'); go('permisos');
    } catch (e) { toast(err(e), 'err'); b.disabled = false; }
  };
};

/* ---------------- NÓMINA / CERTIFICADO ---------------- */
VW.nomina = async el => {
  const { data, error } = await sb.from('nominas').select('*').eq('colaborador_id', P.me.id).order('periodo', { ascending: false }); if (error) throw error;
  el.innerHTML = ph('Desprendibles y certificado laboral') +
    (modOnP('certificados') ? card('Certificado laboral', `<p class="muted">Descargue su certificado laboral con los datos registrados en la empresa.</p><div class="row"><button class="btn primary" id="c1">📄 Con salario</button><button class="btn" id="c0">📄 Sin salario</button></div>`) : '') +
    card('Desprendibles de nómina', data.length ? `<table><thead><tr><th>Periodo</th><th class="num">Devengado</th><th class="num">Deducciones</th><th class="num">Neto</th><th></th></tr></thead><tbody>${data.map(n => `<tr><td>${fmtDate(n.datos.ini)} – ${fmtDate(n.datos.fin)}</td><td class="num">${money(n.datos.devengado)}</td><td class="num">${money(n.datos.deducciones)}</td><td class="num"><b>${money(n.neto)}</b></td><td class="right"><button class="btn sm" data-n="${n.id}">⬇ PDF</button></td></tr>`).join('')}</tbody></table>` : '<div class="muted">Aún no hay desprendibles publicados.</div>');
  $('#c1')?.addEventListener('click', () => pdfCertificado(P.me, true)); $('#c0')?.addEventListener('click', () => pdfCertificado(P.me, false));
  $$('[data-n]', el).forEach(b => b.onclick = () => pdfDesprendible(P.me, data.find(n => n.id === b.dataset.n).datos));
};

/* ---------------- DOCUMENTOS Y FIRMA ---------------- */
VW.documentos = async el => {
  const { data, error } = await sb.from('documentos').select('*').eq('colaborador_id', P.me.id).order('created_at', { ascending: false }); if (error) throw error;
  el.innerHTML = ph('Documentos y firma', 'Consulte y firme electrónicamente los documentos que le asigna la empresa') +
    card('', data.length ? `<table><thead><tr><th>Documento</th><th>Archivo</th><th>Firma</th></tr></thead><tbody>${data.map(d => `<tr><td><b>${h(d.titulo)}</b><div class="small muted">${h(d.tipo || '')}</div></td><td>${d.url ? `<a href="${h(d.url)}" target="_blank" rel="noopener">📎 Abrir</a>` : '—'}</td><td>${!d.requiere_firma ? '<span class="badge">No requiere</span>' : d.firmado ? `<span class="badge green">Firmado ${fmtDT(d.firmado_at)}</span>` : `<button class="btn sm primary" data-f="${d.id}">✍️ Firmar</button>`}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">No tiene documentos asignados.</div>');
  $$('[data-f]', el).forEach(b => b.onclick = () => {
    const d = data.find(x => x.id === b.dataset.f);
    const m = modal({
      title: 'Firmar documento', html: `<p><b>${h(d.titulo)}</b></p><div class="field"><label>Escriba su nombre completo como firma</label><input id="fn" placeholder="${h(nombreCompleto(P.me))}"></div><label class="chk"><input type="checkbox" id="fa"> He leído y acepto el contenido del documento.</label>`,
      buttons: [{ t: 'Cancelar' }, { t: 'Firmar', cls: 'primary', fn: async () => { const n = $('#fn', m.el).value.trim(); if (n.length < 5 || !$('#fa', m.el).checked) { toast('Escriba su nombre y acepte el documento', 'err'); return false; } const { error } = await sb.from('documentos').update({ firmado: true, firma_texto: n, firmado_at: new Date().toISOString() }).eq('id', d.id); if (error) { toast(err(error), 'err'); return false; } notify('otro', `✍️ Documento firmado: ${nombreCompleto(P.me)}`, d.titulo, P.me.id); toast('Documento firmado', 'ok'); go('documentos'); } }]
    });
  });
};

/* ---------------- ADELANTOS ---------------- */
VW.adelantos = async el => {
  const { data, error } = await sb.from('adelantos').select('*').eq('colaborador_id', P.me.id).order('created_at', { ascending: false }); if (error) throw error;
  el.innerHTML = ph('Adelantos de sueldo', 'Los adelantos aprobados se descuentan en su próxima nómina') +
    card('Solicitar adelanto', `<form id="aF"><div class="grid2"><div class="field"><label>Monto (COP)</label><input type="number" id="aM" min="1" step="1000" required></div><div class="field"><label>Motivo</label><input id="aMo"></div></div><button class="btn primary">Solicitar</button></form>`) +
    card('Mis solicitudes', data.length ? `<table><thead><tr><th>Fecha</th><th class="num">Monto</th><th>Motivo</th><th>Estado</th></tr></thead><tbody>${data.map(a => `<tr><td>${fmtDate(a.created_at.slice(0, 10))}</td><td class="num">${money(a.monto)}</td><td>${h(a.motivo || '')}</td><td><span class="badge ${{ pendiente: 'amber', aprobado: 'blue', rechazado: 'red', descontado: 'green' }[a.estado]}">${a.estado}</span></td></tr>`).join('')}</tbody></table>` : '<div class="muted">Sin solicitudes.</div>');
  $('#aF').onsubmit = async ev => {
    ev.preventDefault(); const monto = Number($('#aM').value);
    if (monto > Number(P.me.salario)) return toast('El monto no puede superar su salario', 'err');
    const { error } = await sb.from('adelantos').insert({ colaborador_id: P.me.id, monto, motivo: $('#aMo').value.trim() || null }); if (error) return toast(err(error), 'err');
    notify('adelanto', `⚡ Solicitud de adelanto: ${nombreCompleto(P.me)}`, money(monto), P.me.id); toast('Solicitud enviada', 'ok'); go('adelantos');
  };
};

/* ---------------- OBJETIVOS / RECONOCIMIENTOS / BENEFICIOS ---------------- */
VW.objetivos = async el => {
  const { data, error } = await sb.from('objetivos').select('*').eq('colaborador_id', P.me.id).order('created_at', { ascending: false }); if (error) throw error;
  el.innerHTML = ph('Objetivos', 'Sus metas y avance') + (data.map(o => card(`${h(o.titulo)} <span class="badge ${o.estado === 'cumplido' ? 'green' : o.estado === 'vencido' ? 'red' : 'blue'}">${o.estado.replace('_', ' ')}</span>`, `<p class="muted">${h(o.descripcion || '')}</p><div class="bar"><i style="width:${o.progreso}%"></i></div><div class="row between mt"><span class="small muted">${o.progreso}% ${o.fecha_limite ? '· límite ' + fmtDate(o.fecha_limite) : ''}</span><input type="range" min="0" max="100" step="5" value="${o.progreso}" data-o="${o.id}" style="width:200px" ${o.estado === 'cumplido' ? 'disabled' : ''}></div>`)).join('') || card('', '<div class="muted">No tiene objetivos asignados.</div>'));
  $$('[data-o]', el).forEach(r => r.onchange = async () => { const v = Number(r.value); await sb.from('objetivos').update({ progreso: v, estado: v >= 100 ? 'cumplido' : 'en_curso' }).eq('id', r.dataset.o); toast('Avance actualizado', 'ok'); go('objetivos'); });
};
VW.reconocimientos = async el => {
  const { data, error } = await sb.from('reconocimientos').select('*').eq('colaborador_id', P.me.id).order('created_at', { ascending: false }); if (error) throw error;
  el.innerHTML = ph('Reconocimientos') + (data.map(r => card('', `<div class="row"><div style="font-size:38px">${h(r.icono || '⭐')}</div><div><b>${h(r.titulo)}</b><div class="muted">${h(r.mensaje || '')}</div><div class="small muted">${fmtDate(r.created_at.slice(0, 10))}</div></div></div>`)).join('') || card('', '<div class="muted">Aún no tiene reconocimientos.</div>'));
};
VW.beneficios = async el => {
  const { data, error } = await sb.from('beneficios').select('*').eq('activo', true).order('created_at', { ascending: false }); if (error) throw error;
  el.innerHTML = ph('Beneficios') + `<div class="grid2">${data.map(b => card(`🎁 ${h(b.titulo)}`, `<span class="badge blue">${h(b.categoria || 'General')}</span><p>${h(b.descripcion || '')}</p>${b.vigencia ? `<div class="small muted">Vigente hasta ${fmtDate(b.vigencia)}</div>` : ''}`)).join('') || card('', '<div class="muted">Sin beneficios publicados.</div>')}</div>`;
};

/* ---------------- ENCUESTAS ---------------- */
VW.encuestas = async el => {
  const [e, r] = await Promise.all([sb.from('encuestas').select('*').eq('activa', true).order('created_at', { ascending: false }), sb.from('encuesta_respuestas').select('encuesta_id').eq('colaborador_id', P.me.id)]);
  if (e.error) throw e.error; const hechas = new Set((r.data || []).map(x => x.encuesta_id));
  el.innerHTML = ph('Encuestas', 'Su opinión nos ayuda a mejorar') + (e.data.map(en => card(h(en.titulo), hechas.has(en.id) ? '<span class="badge green">✔ Ya respondió</span>' : `<p class="muted">${h(en.descripcion || '')}</p><form data-e="${en.id}">${(en.preguntas || []).map((q, i) => `<div class="field"><label style="font-size:14px;color:var(--text)">${i + 1}. ${h(q)}</label><div class="row">${[1, 2, 3, 4, 5].map(v => `<label class="chk"><input type="radio" name="q${i}" value="${v}" required> ${v}</label>`).join('')}<span class="small muted">(1 = muy malo · 5 = excelente)</span></div></div>`).join('')}<div class="field"><label>Comentario (opcional)</label><textarea name="com"></textarea></div><button class="btn primary">Enviar respuestas</button></form>`)).join('') || card('', '<div class="muted">No hay encuestas activas.</div>'));
  $$('form[data-e]', el).forEach(f => f.onsubmit = async ev => {
    ev.preventDefault(); const en = e.data.find(x => x.id === f.dataset.e);
    const resp = (en.preguntas || []).map((_, i) => Number(f.querySelector(`input[name=q${i}]:checked`)?.value || 0));
    const { error } = await sb.from('encuesta_respuestas').insert({ encuesta_id: en.id, colaborador_id: P.me.id, respuestas: resp, comentario: f.com.value.trim() || null }); if (error) return toast(err(error), 'err'); toast('¡Gracias por responder!', 'ok'); go('encuestas');
  });
};

/* ---------------- DENUNCIAS ---------------- */
VW.denuncias = async el => {
  const { data, error } = await sb.from('denuncias').select('*').eq('colaborador_id', P.me.id).order('created_at', { ascending: false }); if (error) throw error;
  el.innerHTML = ph('Canal de denuncias', 'Reporte de forma confidencial cualquier situación que afecte el ambiente laboral') +
    card('Nuevo reporte', `<form id="dF"><div class="grid2"><div class="field"><label>Tipo</label><select id="dT">${['Acoso laboral', 'Acoso sexual', 'Discriminación', 'Fraude o corrupción', 'Seguridad y salud en el trabajo', 'Otro'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="field"><label class="chk" style="margin-top:26px"><input type="checkbox" id="dA"> Enviar de forma anónima</label></div><div class="field full"><label>Descripción de los hechos</label><textarea id="dD" required></textarea></div></div><button class="btn primary">Enviar reporte</button><div class="hint mt">Los reportes anónimos no quedan asociados a su usuario y no podrá consultarlos después.</div></form>`) +
    card('Mis reportes', data.length ? data.map(d => `<div style="border-bottom:1px solid var(--line);padding:10px 0"><div class="row between"><b>${h(d.tipo)}</b><span class="badge ${{ recibida: 'amber', en_revision: 'blue', cerrada: 'green' }[d.estado]}">${d.estado.replace('_', ' ')}</span></div><div class="small muted">${fmtDT(d.created_at)}</div><div>${h(d.descripcion)}</div>${d.respuesta ? `<div class="card mt" style="background:#f7f8fd"><b>Respuesta:</b> ${h(d.respuesta)}</div>` : ''}</div>`).join('') : '<div class="muted">Sin reportes.</div>');
  $('#dF').onsubmit = async ev => {
    ev.preventDefault(); const an = $('#dA').checked;
    const { error } = await sb.from('denuncias').insert({ colaborador_id: an ? null : P.me.id, anonima: an, tipo: $('#dT').value, descripcion: $('#dD').value.trim() }); if (error) return toast(err(error), 'err');
    notify('denuncia', '🛡️ Nuevo reporte en el canal de denuncias', `${$('#dT').value}${an ? ' (anónimo)' : ''}`, an ? null : P.me.id); toast('Reporte enviado', 'ok'); go('denuncias');
  };
};

/* ---------------- CHAT ---------------- */
VW.chat = async el => {
  el.innerHTML = ph('Chat con administración', 'Conversación privada con Talento Humano') + `<div class="card flush"><div class="chat-pane" style="height:calc(100vh - 260px);min-height:360px"><div class="msgs" id="ms"></div><form class="chat-in" id="cf"><input id="mi" placeholder="Escriba un mensaje…" autocomplete="off"><button class="btn primary">Enviar</button></form></div></div>`;
  const load = async () => {
    const { data } = await sb.from('mensajes').select('*').eq('colaborador_id', P.me.id).order('created_at'); const box = $('#ms'); if (!box) return;
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 80 || !box.children.length;
    box.innerHTML = (data || []).map(m => `<div class="msg ${m.remitente === 'colaborador' ? 'me' : ''}">${h(m.texto)}<small>${fmtDT(m.created_at)}</small></div>`).join('') || '<div class="empty">Escriba su primer mensaje al administrador</div>';
    if (atEnd) box.scrollTop = box.scrollHeight;
    if ((data || []).some(m => m.remitente === 'admin' && !m.leido)) await sb.from('mensajes').update({ leido: true }).eq('colaborador_id', P.me.id).eq('remitente', 'admin').eq('leido', false);
  };
  $('#cf').onsubmit = async ev => {
    ev.preventDefault(); const t = $('#mi').value.trim(); if (!t) return; $('#mi').value = '';
    const { error } = await sb.from('mensajes').insert({ colaborador_id: P.me.id, remitente: 'colaborador', texto: t }); if (error) return toast(err(error), 'err');
    notify('mensaje', `💬 Mensaje de ${nombreCompleto(P.me)}`, t.slice(0, 80), P.me.id); load();
  };
  load(); P.timers.push(setInterval(load, 4000));
};

/* ---------------- PERFIL ---------------- */
VW.perfil = async el => {
  await refreshMe(); const m = P.me, ro = (l, v) => `<div class="field"><label>${l}</label><input value="${h(v || '')}" disabled></div>`;
  el.innerHTML = ph('Mi perfil', 'Actualice sus datos de contacto y su foto') +
    card('', `<div class="row" style="gap:18px;align-items:flex-start"><div id="prevF">${avatarHtml(m, 'lg')}</div><div class="grow"><div class="field"><label>Foto (enlace de Google Drive)</label><input id="fFoto" value="${h(m.foto_url || '')}" placeholder="https://drive.google.com/file/d/…/view"><div class="hint">En Drive: clic derecho → Compartir → “Cualquier persona con el enlace” → Copiar enlace, y péguelo aquí.</div></div></div></div>`) +
    card('Datos personales', `<div class="grid2">${ro('Nombre', nombreCompleto(m))}${ro('Cédula', m.cedula)}${ro('Cargo', m.cargo)}${ro('Área', m.area)}${ro('Contrato', m.tipo_contrato)}${ro('Fecha de ingreso', fmtDate(m.fecha_ingreso))}
      <div class="field"><label>Correo</label><input id="fCor" type="email" value="${h(m.correo || '')}"></div><div class="field"><label>Teléfono</label><input id="fTel" value="${h(m.telefono || '')}"></div>
      <div class="field"><label>Fecha de nacimiento</label><input id="fNac" type="date" value="${h((m.fecha_nacimiento || '').slice(0, 10))}" max="${ymd(new Date())}"></div><div></div>
      <div class="field full"><label>Dirección</label><input id="fDir" value="${h(m.direccion || '')}"></div><div class="field"><label>Banco</label><input id="fBan" value="${h(m.banco || '')}"></div><div class="field"><label>Cuenta bancaria</label><input id="fCta" value="${h(m.cuenta_bancaria || '')}"></div></div><button class="btn primary" id="sP">Guardar cambios</button>`) +
    card('Mi tag NFC', m.nfc_tag ? `<span class="badge green">Asignado</span> <code style="margin-left:8px">${h(m.nfc_tag)}</code><p class="hint">Use este tag en el checador para registrar su ingreso y salida. Si lo pierde, avise a Talento Humano para reasignarlo.</p>` : '<span class="badge amber">Sin tag asignado</span><p class="hint">Solicite su tag a Talento Humano. Mientras tanto puede registrar su salida con su cédula en el checador.</p>') +
    card('Cambiar contraseña', `<div class="grid2"><div class="field"><label>Contraseña actual</label><input id="pw0" type="password" autocomplete="current-password"></div><div></div><div class="field"><label>Nueva contraseña</label><input id="pw1" type="password" autocomplete="new-password"></div><div class="field"><label>Repetir</label><input id="pw2" type="password" autocomplete="new-password"></div></div><button class="btn" id="sPw">Cambiar contraseña</button>`);
  $('#sP').onclick = async () => {
    const v = { foto_url: $('#fFoto').value.trim() || null, correo: $('#fCor').value.trim() || null, telefono: $('#fTel').value.trim() || null, direccion: $('#fDir').value.trim() || null, fecha_nacimiento: $('#fNac').value || null, banco: $('#fBan').value.trim() || null, cuenta_bancaria: $('#fCta').value.trim() || null };
    const { error } = await sb.from('colaboradores').update(v).eq('id', m.id); if (error) return toast(err(error), 'err'); toast('Perfil actualizado', 'ok'); go('perfil');
  };
  $('#sPw').onclick = async () => {
    const a = $('#pw0').value, b = $('#pw1').value, c = $('#pw2').value;
    const okA = m.pass_hash ? m.pass_hash === await hashPass(a) : a === m.cedula;
    if (!okA) return toast('La contraseña actual no es correcta', 'err'); if (b.length < 4) return toast('Mínimo 4 caracteres', 'err'); if (b !== c) return toast('No coinciden', 'err');
    const { error } = await sb.from('colaboradores').update({ pass_hash: await hashPass(b) }).eq('id', m.id); if (error) return toast(err(error), 'err'); toast('Contraseña actualizada', 'ok');
    ['pw0', 'pw1', 'pw2'].forEach(i => $('#' + i).value = '');
  };
};
