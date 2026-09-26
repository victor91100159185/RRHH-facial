/* =====================================================================
   MÓDULOS ADMINISTRATIVOS: Nómina · Parámetros legales · Comunicación · módulos CRUD opcionales
   ===================================================================== */
const colabCell = id => { const c = colabById(id); return c ? `<div class="person">${avatarHtml(c)}<div><b>${h(nombreCompleto(c))}</b><span>${h(c.area || c.cargo || '')}</span></div></div>` : '<span class="muted">—</span>'; };
const mensajeA = (colabId, texto) => sb.from('mensajes').insert({ colaborador_id: colabId, remitente: 'admin', texto });

/* =====================================================================
   NÓMINA
   ===================================================================== */
const NOM = { anio: new Date().getFullYear(), mes: new Date().getMonth() + 1, tipo: 'M', rows: null, per: null, tab: 'liq' };
VIEWS.nomina = async el => {
  await loadBase();
  const tabs = [['liq', 'Liquidación'], ['apo', 'Parafiscales y aportes'], ['hist', 'Desprendibles'], ['cert', 'Certificados laborales']].filter(t => t[0] !== 'cert' || modOn('certificados'));
  el.innerHTML = pageHead('Nómina', 'Liquidación bajo la legislación laboral colombiana, aportes, provisiones y desprendibles') +
    `<div class="tabs">${tabs.map(t => `<div class="tab ${NOM.tab === t[0] ? 'active' : ''}" data-t="${t[0]}">${t[1]}</div>`).join('')}</div><div id="nBody"></div>`;
  $$('.tab', el).forEach(t => t.onclick = () => { NOM.tab = t.dataset.t; go('nomina'); });
  const body = $('#nBody');
  if (NOM.tab === 'cert') return nomCert(body);
  if (NOM.tab === 'hist') return nomHist(body);
  nomFiltros(body, NOM.tab === 'apo' ? nomAportes : nomLiq);
};
function nomFiltros(body, render) {
  body.innerHTML = `<div class="card mb"><div class="row"><div><label>Año</label><input type="number" id="nA" value="${NOM.anio}" style="width:100px"></div>
    <div><label>Mes</label><select id="nM">${MESES.map((m, i) => `<option value="${i + 1}" ${NOM.mes === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div><label>Periodo</label><select id="nT"><option value="M">Mensual</option><option value="Q1">1ª quincena</option><option value="Q2">2ª quincena</option></select></div>
    <div style="align-self:end"><button class="btn primary" id="nGo">Calcular nómina</button></div>
    <div class="grow"></div><div class="small muted" style="max-width:420px">Jornada máx. ${jornadaSemanal(new Date())} h/sem · recargo dominical/festivo ${(recDominical(new Date()) * 100).toFixed(0)}% · SMMLV ${money(CFG.params.smmlv)} · aux. transporte ${money(CFG.params.aux_transporte)}</div></div></div><div id="nOut"></div>`;
  $('#nT').value = NOM.tipo;
  $('#nGo').onclick = async () => {
    NOM.anio = Number($('#nA').value); NOM.mes = Number($('#nM').value); NOM.tipo = $('#nT').value;
    $('#nOut').innerHTML = '<div class="empty">Calculando con las marcaciones del periodo…</div>';
    try { await nomCalcular(); render($('#nOut')); } catch (e) { $('#nOut').innerHTML = `<div class="card">${h(dbErr(e))}</div>`; }
  };
  if (NOM.rows) render($('#nOut')); else $('#nOut').innerHTML = '<div class="empty">Seleccione el periodo y presione “Calcular nómina”.</div>';
}
async function nomCalcular() {
  const per = NOM.per = periodoRango(NOM.anio, NOM.mes, NOM.tipo);
  const list = activos().filter(c => (c.fecha_ingreso || '').slice(0, 10) <= per.fin);
  const [rep, perm, adel, saved] = await Promise.all([
    modOn('asistencia') ? computeReport(list, per.ini, per.fin) : Promise.resolve(null),
    sb.from('permisos').select('*').eq('estado', 'aceptado').lte('fecha_inicio', per.fin).gte('fecha_fin', per.ini),
    modOn('adelantos') ? sb.from('adelantos').select('*').or(`estado.eq.aprobado,and(estado.eq.descontado,nomina_periodo.eq.${per.id})`) : Promise.resolve({ data: [] }),
    sb.from('nominas').select('*').eq('periodo', per.id)]);
  if (perm.error) throw perm.error; if (adel.error) throw adel.error; if (saved.error) throw saved.error;
  const sv = Object.fromEntries((saved.data || []).map(s => [s.colaborador_id, s]));
  NOM.rows = list.map((c, i) => {
    const r = { c, horas: rep ? rep[i].res : null, permisos: (perm.data || []).filter(p => p.colaborador_id === c.id), adelantos: (adel.data || []).filter(a => a.colaborador_id === c.id).map(a => ({ ...a, estado: 'aprobado' })), bonif: sv[c.id]?.datos?.bonif || 0, otros: sv[c.id]?.datos?.otrosDesc || 0, saved: !!sv[c.id] };
    r.n = calcNomina({ colab: c, per, horas: r.horas, permisos: r.permisos, adelantos: r.adelantos, bonif: r.bonif, otrosDesc: r.otros }); return r;
  });
}
const sum = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
function nomLiq(out) {
  const R = NOM.rows, per = NOM.per;
  out.innerHTML = `<div class="row mb"><button class="btn primary" id="nSave">💾 Guardar liquidación (publicar desprendibles)</button><button class="btn ok" id="nXls">⬇ Exportar Excel</button>${R.some(r => r.saved) ? '<span class="badge green">Periodo ya liquidado — puede recalcular y volver a guardar</span>' : ''}</div>
  <div class="card flush"><div class="table-wrap"><table><thead><tr><th>Colaborador</th><th class="num">Días</th><th class="num">Salario devengado</th><th class="num">Extras y recargos</th><th class="num">Aux. transp.</th><th class="num">Bonificación</th><th class="num">Total devengado</th><th class="num">Salud+Pensión+FSP</th><th class="num">Adelantos</th><th class="num">Otros desc.</th><th class="num">NETO</th><th></th></tr></thead><tbody>
  ${R.map((r, i) => `<tr data-i="${i}"><td><b style="font-weight:600">${h(nombreCompleto(r.c))}</b><div class="small muted">${money(r.c.salario)}</div></td><td class="num">${r.n.dias.pagados}</td><td class="num">${money(r.n.basico + r.n.incap)}</td><td class="num">${money(r.n.extras)}</td><td class="num">${money(r.n.aux)}</td>
  <td class="num"><input type="number" class="bn" value="${r.bonif}" style="width:100px;text-align:right"></td><td class="num">${money(r.n.devengado)}</td><td class="num">${money(r.n.salud + r.n.pension + r.n.fsp)}</td><td class="num">${money(r.n.adelantos)}</td>
  <td class="num"><input type="number" class="od" value="${r.otros}" style="width:100px;text-align:right"></td><td class="num"><b>${money(r.n.neto)}</b></td><td><button class="btn sm" data-p="${i}">Desprendible</button></td></tr>`).join('') || '<tr><td colspan="12" class="empty">Sin colaboradores activos</td></tr>'}
  </tbody><tfoot><tr><td><b>TOTALES</b></td><td></td><td class="num"><b>${money(sum(R, r => r.n.basico + r.n.incap))}</b></td><td class="num"><b>${money(sum(R, r => r.n.extras))}</b></td><td class="num"><b>${money(sum(R, r => r.n.aux))}</b></td><td class="num"><b>${money(sum(R, r => r.n.bonif))}</b></td><td class="num"><b>${money(sum(R, r => r.n.devengado))}</b></td><td class="num"><b>${money(sum(R, r => r.n.salud + r.n.pension + r.n.fsp))}</b></td><td class="num"><b>${money(sum(R, r => r.n.adelantos))}</b></td><td class="num"><b>${money(sum(R, r => r.n.otrosDesc))}</b></td><td class="num"><b>${money(sum(R, r => r.n.neto))}</b></td><td></td></tr></tfoot></table></div></div>
  <p class="hint">Horas extras y recargos calculados con las marcaciones del periodo (Ley 2101/2021 y Ley 2466/2025). Incapacidades a 66,67% y permisos no remunerados se descuentan según los permisos aceptados. Los adelantos aprobados se descuentan automáticamente.</p>`;
  const recalc = i => { const r = R[i]; r.n = calcNomina({ colab: r.c, per, horas: r.horas, permisos: r.permisos, adelantos: r.adelantos, bonif: r.bonif, otrosDesc: r.otros }); nomLiq(out); };
  $$('tr[data-i]', out).forEach(tr => { const i = Number(tr.dataset.i); $('.bn', tr).onchange = e => { R[i].bonif = Number(e.target.value) || 0; recalc(i); }; $('.od', tr).onchange = e => { R[i].otros = Number(e.target.value) || 0; recalc(i); }; });
  $$('[data-p]', out).forEach(b => b.onclick = () => pdfDesprendible(R[b.dataset.p].c, R[b.dataset.p].n));
  $('#nSave').onclick = async () => {
    if (!R.length) return; if (!await confirmDlg(`¿Guardar la liquidación de ${R.length} colaboradores del periodo ${per.id}? Los adelantos aprobados quedarán marcados como descontados.`, 'Guardar', false)) return;
    const { error } = await sb.from('nominas').upsert(R.map(r => ({ periodo: per.id, colaborador_id: r.c.id, datos: r.n, neto: Math.round(r.n.neto), estado: 'liquidada' })), { onConflict: 'periodo,colaborador_id' });
    if (error) return toast(dbErr(error), 'err');
    const ids = R.flatMap(r => r.adelantos.map(a => a.id)); if (ids.length) await sb.from('adelantos').update({ estado: 'descontado', nomina_periodo: per.id }).in('id', ids);
    R.forEach(r => r.saved = true); toast('Liquidación guardada · desprendibles disponibles para los colaboradores', 'ok'); nomLiq(out);
  };
  $('#nXls').onclick = () => xlsxReporte(`nomina_${per.id}.xlsx`, { Nómina: [['Colaborador', 'Cédula', 'Salario base', 'Días', 'Básico', 'Incapacidad', 'Extras y recargos', 'Aux. transporte', 'Bonificación', 'Total devengado', 'IBC', 'Salud', 'Pensión', 'FSP', 'Adelantos', 'Otros desc.', 'NETO'], ...R.map(r => [nombreCompleto(r.c), r.c.cedula, +r.c.salario, r.n.dias.pagados, Math.round(r.n.basico), Math.round(r.n.incap), Math.round(r.n.extras), Math.round(r.n.aux), r.n.bonif, Math.round(r.n.devengado), Math.round(r.n.ibc), Math.round(r.n.salud), Math.round(r.n.pension), Math.round(r.n.fsp), r.n.adelantos, r.n.otrosDesc, Math.round(r.n.neto)])] });
}
function nomAportes(out) {
  const R = NOM.rows, e = r => r.n.empleador;
  const cols = [['IBC', r => r.n.ibc], ['Salud (8,5%)', r => e(r).salud], ['Pensión (12%)', r => e(r).pension], ['ARL', r => e(r).arl], ['Caja (4%)', r => e(r).caja], ['SENA (2%)', r => e(r).sena], ['ICBF (3%)', r => e(r).icbf], ['Total aportes', r => e(r).aportes], ['Cesantías', r => r.n.prov.cesantias], ['Int. cesantías', r => r.n.prov.intereses], ['Prima', r => r.n.prov.prima], ['Vacaciones', r => r.n.prov.vacaciones], ['Costo total empleador', r => r.n.costoTotal]];
  out.innerHTML = `<div class="card flush"><div class="table-wrap"><table><thead><tr><th>Colaborador</th>${cols.map(c => `<th class="num">${c[0]}</th>`).join('')}</tr></thead><tbody>
  ${R.map(r => `<tr><td><b style="font-weight:600">${h(nombreCompleto(r.c))}</b>${e(r).exonerado ? '<div class="small muted">Exonerado art. 114-1</div>' : ''}</td>${cols.map(c => `<td class="num">${money(c[1](r))}</td>`).join('')}</tr>`).join('')}</tbody>
  <tfoot><tr><td><b>TOTALES</b></td>${cols.map(c => `<td class="num"><b>${money(sum(R, c[1]))}</b></td>`).join('')}</tr></tfoot></table></div></div>
  <p class="hint">Aportes del empleador sobre el IBC (mín. 1 SMMLV, máx. 25 SMMLV). Sociedades con empleados que devengan menos de 10 SMMLV están exoneradas de salud, SENA e ICBF (art. 114-1 E.T.; configurable en Configuración → Empresa). Provisiones sobre salario + auxilio de transporte (vacaciones solo sobre salario).</p>`;
}
async function nomHist(el) {
  const { data, error } = await sb.from('nominas').select('*').order('periodo', { ascending: false }); if (error) throw error;
  const pers = [...new Set(data.map(n => n.periodo))]; const sel = NOM.hp && pers.includes(NOM.hp) ? NOM.hp : pers[0];
  el.innerHTML = pers.length ? `<div class="row mb"><div><label>Periodo liquidado</label><select id="hP">${pers.map(p => `<option ${p === sel ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>
  <div class="card flush"><table><thead><tr><th>Colaborador</th><th class="num">Devengado</th><th class="num">Deducciones</th><th class="num">Neto</th><th></th></tr></thead><tbody>${data.filter(n => n.periodo === sel).map(n => { const c = colabById(n.colaborador_id); return c ? `<tr><td>${colabCell(c.id)}</td><td class="num">${money(n.datos.devengado)}</td><td class="num">${money(n.datos.deducciones)}</td><td class="num"><b>${money(n.neto)}</b></td><td class="right"><button class="btn sm" data-p="${n.id}">⬇ Desprendible PDF</button> <button class="icon-btn" data-x="${n.id}">🗑</button></td></tr>` : ''; }).join('')}</tbody></table></div>` : '<div class="card empty">Aún no hay liquidaciones guardadas.</div>';
  if (!pers.length) return;
  $('#hP').onchange = e => { NOM.hp = e.target.value; nomHist(el); };
  $$('[data-p]', el).forEach(b => b.onclick = () => { const n = data.find(x => x.id === b.dataset.p); pdfDesprendible(colabById(n.colaborador_id), n.datos); });
  $$('[data-x]', el).forEach(b => b.onclick = async () => { if (!await confirmDlg('¿Eliminar esta liquidación?')) return; await sb.from('nominas').delete().eq('id', b.dataset.x); nomHist(el); });
}
function nomCert(el) {
  el.innerHTML = `<div class="card flush"><table><thead><tr><th>Colaborador</th><th>Cargo</th><th>Ingreso</th><th>Estado</th><th></th></tr></thead><tbody>${S.colabs.map(c => `<tr><td>${colabCell(c.id)}</td><td>${h(c.cargo || '')}</td><td>${fmtDate(c.fecha_ingreso)}</td><td><span class="badge ${c.estado === 'activo' ? 'green' : 'red'}">${c.estado}</span></td><td class="right"><button class="btn sm" data-c="${c.id}" data-s="1">📄 Con salario</button> <button class="btn sm" data-c="${c.id}" data-s="0">📄 Sin salario</button></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-c]', el).forEach(b => b.onclick = () => pdfCertificado(colabById(b.dataset.c), b.dataset.s === '1'));
}

/* =====================================================================
   PARÁMETROS LEGALES
   ===================================================================== */
VIEWS.parametros = async el => {
  const P = CFG.params, hoy = new Date(), y = S.festY || hoy.getFullYear();
  const FP = [['smmlv', 'Salario mínimo (SMMLV)'], ['aux_transporte', 'Auxilio de transporte'], ['recargo_nocturno', 'Recargo nocturno (0,35 = 35%)'], ['extra_diurna', 'Extra diurna (0,25)'], ['extra_nocturna', 'Extra nocturna (0,75)'], ['hora_nocturna_inicio', 'Inicio jornada nocturna (hora)'], ['hora_nocturna_fin', 'Fin jornada nocturna (hora)'], ['salud_empleado', 'Salud empleado'], ['pension_empleado', 'Pensión empleado'], ['salud_empleador', 'Salud empleador'], ['pension_empleador', 'Pensión empleador'], ['caja', 'Caja de compensación'], ['sena', 'SENA'], ['icbf', 'ICBF'], ['cesantias', 'Cesantías'], ['int_cesantias', 'Intereses cesantías (mensual)'], ['prima', 'Prima'], ['vacaciones', 'Vacaciones'], ['tolerancia_min', 'Tolerancia por defecto (min)'], ['horas_mes_override', 'Horas/mes (vacío = automático)']]
    .map(([k, l]) => ({ k, l, type: 'number', step: 'any' }));
  el.innerHTML = pageHead('Parámetros legales', 'Normativa laboral colombiana aplicada por el sistema (Ministerio del Trabajo)') +
    `<div class="kpis mb"><div class="card kpi"><div><div class="v">${jornadaSemanal(hoy)} h</div><div class="l">Jornada máxima semanal (Ley 2101/2021)</div></div><div class="ic">🕒</div></div>
    <div class="card kpi"><div><div class="v">${(recDominical(hoy) * 100).toFixed(0)}%</div><div class="l">Recargo dominical y festivo (Ley 2466/2025)</div></div><div class="ic">📅</div></div>
    <div class="card kpi"><div><div class="v">${P.hora_nocturna_inicio}:00–0${P.hora_nocturna_fin}:00</div><div class="l">Jornada nocturna</div></div><div class="ic">🌙</div></div>
    <div class="card kpi"><div><div class="v">${money(P.smmlv)}</div><div class="l">SMMLV · aux. transporte ${money(P.aux_transporte)}</div></div><div class="ic">💵</div></div></div>
    <div class="grid2"><div class="card"><h3>Recargos y horas extras vigentes hoy</h3><table class="mt"><thead><tr><th>Concepto</th><th class="num">Factor total s/ hora ordinaria</th></tr></thead><tbody>
      <tr><td>Hora ordinaria diurna</td><td class="num">100%</td></tr>${CATS.filter(c => c !== 'OD').map(c => `<tr><td>${CAT_LABEL[c]}</td><td class="num">${(factorTotal(c, hoy) * 100).toFixed(0)}%</td></tr>`).join('')}</tbody></table>
      <p class="hint">Recargo nocturno 35% · extra diurna 25% · extra nocturna 75% · dominical/festivo ${(recDominical(hoy) * 100).toFixed(0)}% (se suman entre sí).</p></div>
    <div class="card"><h3>Cronograma de reformas</h3><table class="mt"><thead><tr><th>Desde</th><th>Jornada semanal</th><th>Recargo dominical</th></tr></thead><tbody>
      ${[['15-jul-2023', 47, '75%'], ['1-jul-2025 / 15-jul-2025', 44, '80%'], ['1-jul-2026 / 15-jul-2026', 42, '90%'], ['1-jul-2027', 42, '100%']].map(r => `<tr><td>${r[0]}</td><td>${r[1]} h</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
      <p class="hint">Fuentes: <a href="https://www.mintrabajo.gov.co" target="_blank" rel="noopener">Ministerio del Trabajo</a> — Ley 2101 de 2021 (reducción gradual de jornada), Ley 2466 de 2025 (reforma laboral: jornada nocturna desde las 7:00 p.m. y recargo dominical gradual), Decretos 1469 y 1470 de 2025 (SMMLV y auxilio de transporte 2026).</p></div></div>
    <div class="grid2 mt"><div class="card"><div class="row between"><h3>Festivos en Colombia</h3><select id="fY" style="width:100px">${[y - 1, y, y + 1].map(v => `<option ${v === y ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div class="mt small" style="columns:2">${listaFestivos(y).map(f => `<div>${DIAS[parseYmd(f).getDay()]} ${fmtDate(f)}</div>`).join('')}</div><p class="hint">Calculados con la Ley Emiliani (Ley 51 de 1983).</p></div>
    <div class="card"><h3>Valores configurables</h3><div class="mt" id="fP">${formHtml(FP, P)}</div><button class="btn primary" id="sP">Guardar parámetros</button><button class="btn" id="rP">Restaurar valores 2026</button></div></div>`;
  el.querySelector('.page-head').insertAdjacentHTML('afterend', '<div id="orgWrap"></div>'); renderOrganigrama($('#orgWrap'));
  $('#fY').onchange = e => { S.festY = Number(e.target.value); go('parametros'); };
  $('#sP').onclick = async () => { const v = readForm($('#fP'), FP); if (!v) return; try { await saveConfig('parametros', { ...CFG.params, ...v }); toast('Parámetros guardados', 'ok'); go('parametros'); } catch (e) { toast(dbErr(e), 'err'); } };
  $('#rP').onclick = async () => { if (!await confirmDlg('¿Restaurar los valores legales 2026?', 'Restaurar', false)) return; await saveConfig('parametros', { ...DEFAULT_PARAMS }); go('parametros'); };
};

/* =====================================================================
   COMUNICACIÓN: chat privado + comunicados
   ===================================================================== */
VIEWS.comunicacion = async el => {
  const tab = S.comTab || 'chat';
  el.innerHTML = pageHead('Comunicación', 'Chat privado con colaboradores y cartelera de comunicados') +
    `<div class="tabs"><div class="tab ${tab === 'chat' ? 'active' : ''}" data-t="chat">Chat privado</div><div class="tab ${tab === 'com' ? 'active' : ''}" data-t="com">Comunicados</div></div><div id="cBodyC"></div>`;
  $$('.tab', el).forEach(t => t.onclick = () => { S.comTab = t.dataset.t; go('comunicacion'); });
  if (tab === 'com') return crudView(CRUDS.comunicados)($('#cBodyC'));
  chatAdmin($('#cBodyC'));
};
function chatAdmin(el) {
  let sel = S.chatSel || null;
  el.innerHTML = `<div class="card flush chat"><div class="chat-list" id="cl"></div><div class="chat-pane"><div id="chH" style="padding:12px 16px;border-bottom:1px solid var(--line)" class="muted">Seleccione un colaborador</div><div class="msgs" id="ms"></div><form class="chat-in" id="cf"><input id="mi" placeholder="Escriba un mensaje…" autocomplete="off"><button class="btn primary">Enviar</button></form></div></div>`;
  const list = async () => {
    const { data } = await sb.from('mensajes').select('colaborador_id,remitente,leido,created_at,texto').order('created_at', { ascending: false }).limit(500);
    const last = {}, unread = {}; (data || []).forEach(m => { last[m.colaborador_id] ||= m; if (m.remitente === 'colaborador' && !m.leido) unread[m.colaborador_id] = (unread[m.colaborador_id] || 0) + 1; });
    const cs = [...activos()].sort((a, b) => (last[b.id]?.created_at || '').localeCompare(last[a.id]?.created_at || '') || a.nombres.localeCompare(b.nombres));
    $('#cl').innerHTML = cs.map(c => `<div class="ci ${sel === c.id ? 'active' : ''}" data-id="${c.id}">${avatarHtml(c)}<div class="grow" style="min-width:0"><b style="font-weight:600">${h(nombreCompleto(c))}</b><div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h(last[c.id]?.texto || 'Sin mensajes')}</div></div>${unread[c.id] ? `<span class="badge red">${unread[c.id]}</span>` : ''}</div>`).join('');
    $$('#cl .ci').forEach(ci => ci.onclick = () => { sel = S.chatSel = ci.dataset.id; list(); msgs(); });
  };
  const msgs = async () => {
    if (!sel) return; const c = colabById(sel); $('#chH').innerHTML = `<b>${h(nombreCompleto(c))}</b> <span class="muted small">· ${h(c.cargo || '')}</span>`;
    const { data } = await sb.from('mensajes').select('*').eq('colaborador_id', sel).order('created_at');
    const box = $('#ms'), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 80 || !box.children.length;
    box.innerHTML = (data || []).map(m => `<div class="msg ${m.remitente === 'admin' ? 'me' : ''}">${h(m.texto)}<small>${fmtDT(m.created_at)}</small></div>`).join('') || '<div class="empty">Inicie la conversación</div>';
    if (atEnd) box.scrollTop = box.scrollHeight;
    if ((data || []).some(m => m.remitente === 'colaborador' && !m.leido)) { await sb.from('mensajes').update({ leido: true }).eq('colaborador_id', sel).eq('remitente', 'colaborador').eq('leido', false); list(); }
  };
  $('#cf').onsubmit = async e => { e.preventDefault(); const t = $('#mi').value.trim(); if (!sel || !t) return; $('#mi').value = ''; const { error } = await mensajeA(sel, t); if (error) return toast(dbErr(error), 'err'); msgs(); list(); };
  list(); msgs(); S.timers.push(setInterval(() => { list(); msgs(); }, 4000));
}

/* =====================================================================
   MÓDULOS CRUD GENÉRICOS
   ===================================================================== */
function crudView(cfg) {
  return async el => {
    await loadBase();
    const { data, error } = await sb.from(cfg.tabla).select('*').order(cfg.order || 'created_at', { ascending: false }); if (error) throw error;
    const inner = !el.id || el.id !== 'view';   // se usa dentro de otra vista
    el.innerHTML = (inner ? '' : pageHead(cfg.titulo, cfg.sub)) +
      `<div class="row between mb"><span class="muted small">${data.length} registro(s)</span>${cfg.noNew ? '' : `<button class="btn primary" id="cNew">+ ${cfg.nuevo || 'Nuevo'}</button>`}</div>
      <div class="card flush"><div class="table-wrap"><table><thead><tr>${cfg.cols.map(c => `<th>${c[0]}</th>`).join('')}<th></th></tr></thead><tbody>
      ${data.map(r => `<tr>${cfg.cols.map(c => `<td>${c[1](r)}</td>`).join('')}<td class="right" style="white-space:nowrap">${(cfg.acciones ? cfg.acciones(r) : []).map((a, i) => `<button class="btn sm ${a.cls || ''}" data-a="${i}" data-id="${r.id}">${a.t}</button>`).join(' ')} <button class="btn sm" data-e="${r.id}">Editar</button> <button class="icon-btn" data-x="${r.id}">🗑</button></td></tr>`).join('') || `<tr><td colspan="${cfg.cols.length + 1}" class="empty">Sin registros</td></tr>`}</tbody></table></div></div>`;
    const reload = () => cfg.reload ? cfg.reload() : (el.id === 'view' ? go(S.view) : crudView(cfg)(el));
    const abrir = row => {
      const F = row ? (cfg.editFields || cfg.fields) : cfg.fields, vals = row ? (cfg.fromDb ? cfg.fromDb(row) : row) : {};
      const m = modal({
        title: `${row ? 'Editar' : 'Nuevo'} · ${cfg.titulo}`, html: formHtml(F, vals), buttons: [{ t: 'Cancelar' }, {
          t: 'Guardar', cls: 'primary', fn: async () => {
            let v = readForm(m.el, F); if (!v) return false;
            try {
              for (const f of F) if (f.type === 'file') { const file = v[f.k]; delete v[f.k]; if (file) v[f.to || 'url'] = await uploadDoc(file, cfg.tabla); }
              if (cfg.toDb) v = cfg.toDb(v);
              const { data: saved, error } = row ? await sb.from(cfg.tabla).update(v).eq('id', row.id).select().single() : await sb.from(cfg.tabla).insert(v).select().single();
              if (error) throw error;
              if (cfg.after) await cfg.after(saved, !row, row);
            } catch (e) { toast(dbErr(e), 'err'); return false; }
            toast('Guardado', 'ok'); reload();
          }
        }]
      });
    };
    $('#cNew', el)?.addEventListener('click', () => abrir());
    $$('[data-e]', el).forEach(b => b.onclick = () => abrir(data.find(r => r.id === b.dataset.e)));
    $$('[data-x]', el).forEach(b => b.onclick = async () => { if (!await confirmDlg('¿Eliminar este registro?')) return; const { error } = await sb.from(cfg.tabla).delete().eq('id', b.dataset.x); if (error) return toast(dbErr(error), 'err'); reload(); });
    $$('[data-a]', el).forEach(b => b.onclick = async () => { const r = data.find(x => x.id === b.dataset.id); await cfg.acciones(r)[Number(b.dataset.a)].fn(r); reload(); });
  };
}
const estadoBadge = (v, map = {}) => `<span class="badge ${map[v] || ''}">${h(String(v).replace(/_/g, ' '))}</span>`;
const linkDoc = u => u ? `<a href="${h(u)}" target="_blank" rel="noopener">📎 Ver</a>` : '<span class="muted">—</span>';
const cortar = (s, n = 70) => h(String(s || '').length > n ? String(s).slice(0, n) + '…' : s || '');

const CRUDS = {
  documentos: {
    tabla: 'documentos', titulo: 'Documentos y firma', sub: 'Contratos y documentos que el colaborador puede consultar y firmar desde su portal', nuevo: 'Nuevo documento',
    fields: [{ k: 'colaborador_id', l: 'Colaborador', type: 'colab', req: true, full: true }, { k: 'titulo', l: 'Título', req: true }, { k: 'tipo', l: 'Tipo', type: 'select', opts: ['Contrato', 'Otrosí', 'Política', 'Reglamento', 'Autorización', 'Otro'].map(x => [x, x]) }, { k: 'url', l: 'Enlace al documento (Drive, etc.)', full: true }, { k: 'archivo', l: 'o subir archivo', type: 'file', to: 'url', full: true }, { k: 'requiere_firma', l: 'Requiere firma del colaborador', type: 'checkbox', def: true }],
    cols: [['Colaborador', r => colabCell(r.colaborador_id)], ['Documento', r => `<b style="font-weight:600">${h(r.titulo)}</b><div class="small muted">${h(r.tipo || '')}</div>`], ['Archivo', r => linkDoc(r.url)], ['Firma', r => r.requiere_firma ? (r.firmado ? `<span class="badge green">Firmado</span><div class="small muted">${fmtDT(r.firmado_at)} · ${h(r.firma_texto || '')}</div>` : '<span class="badge amber">Pendiente</span>') : '<span class="badge">No requiere</span>']]
  },
  activos: {
    tabla: 'activos', titulo: 'Activos', sub: 'Equipos y elementos entregados al personal', nuevo: 'Nuevo activo',
    fields: [{ k: 'nombre', l: 'Activo', req: true }, { k: 'tipo', l: 'Tipo' }, { k: 'serial', l: 'Serial / placa' }, { k: 'colaborador_id', l: 'Asignado a', type: 'colab' }, { k: 'fecha_entrega', l: 'Fecha de entrega', type: 'date' }, { k: 'estado', l: 'Estado', type: 'select', opts: [['asignado', 'Asignado'], ['devuelto', 'Devuelto'], ['dañado', 'Dañado'], ['perdido', 'Perdido']] }, { k: 'notas', l: 'Notas', type: 'textarea', full: true }],
    cols: [['Activo', r => `<b style="font-weight:600">${h(r.nombre)}</b><div class="small muted">${h(r.tipo || '')} ${h(r.serial || '')}</div>`], ['Responsable', r => colabCell(r.colaborador_id)], ['Entrega', r => r.fecha_entrega ? fmtDate(r.fecha_entrega) : '—'], ['Estado', r => estadoBadge(r.estado, { asignado: 'blue', devuelto: 'green', 'dañado': 'red', perdido: 'red' })]]
  },
  adelantos: {
    tabla: 'adelantos', titulo: 'Adelantos de sueldo', sub: 'Solicitudes de los colaboradores; los aprobados se descuentan automáticamente en la nómina', nuevo: 'Registrar adelanto',
    fields: [{ k: 'colaborador_id', l: 'Colaborador', type: 'colab', req: true, full: true }, { k: 'monto', l: 'Monto (COP)', type: 'number', req: true, min: 1 }, { k: 'estado', l: 'Estado', type: 'select', opts: [['pendiente', 'Pendiente'], ['aprobado', 'Aprobado'], ['rechazado', 'Rechazado'], ['descontado', 'Descontado']] }, { k: 'motivo', l: 'Motivo', type: 'textarea', full: true }],
    cols: [['Colaborador', r => colabCell(r.colaborador_id)], ['Monto', r => `<b>${money(r.monto)}</b>`], ['Motivo', r => cortar(r.motivo)], ['Fecha', r => fmtDate(r.created_at.slice(0, 10))], ['Estado', r => estadoBadge(r.estado, { pendiente: 'amber', aprobado: 'blue', rechazado: 'red', descontado: 'green' })]],
    acciones: r => r.estado === 'pendiente' ? [{ t: 'Aprobar', cls: 'ok', fn: async r => { await sb.from('adelantos').update({ estado: 'aprobado' }).eq('id', r.id); await mensajeA(r.colaborador_id, `Su adelanto de ${money(r.monto)} fue APROBADO y se descontará en su próxima nómina.`); } }, { t: 'Rechazar', cls: 'danger', fn: async r => { await sb.from('adelantos').update({ estado: 'rechazado' }).eq('id', r.id); await mensajeA(r.colaborador_id, `Su solicitud de adelanto de ${money(r.monto)} fue RECHAZADA.`); } }] : []
  },
  objetivos: {
    tabla: 'objetivos', titulo: 'Objetivos', sub: 'Metas asignadas a cada colaborador y su avance', nuevo: 'Nuevo objetivo',
    fields: [{ k: 'colaborador_id', l: 'Colaborador', type: 'colab', req: true, full: true }, { k: 'titulo', l: 'Objetivo', req: true, full: true }, { k: 'descripcion', l: 'Descripción', type: 'textarea', full: true }, { k: 'progreso', l: 'Progreso (%)', type: 'number', min: 0, max: 100, def: 0 }, { k: 'fecha_limite', l: 'Fecha límite', type: 'date' }, { k: 'estado', l: 'Estado', type: 'select', opts: [['en_curso', 'En curso'], ['cumplido', 'Cumplido'], ['vencido', 'Vencido'], ['cancelado', 'Cancelado']] }],
    cols: [['Colaborador', r => colabCell(r.colaborador_id)], ['Objetivo', r => `<b style="font-weight:600">${h(r.titulo)}</b><div class="small muted">${cortar(r.descripcion)}</div>`], ['Avance', r => `<div class="bar" style="width:120px"><i style="width:${r.progreso}%"></i></div><span class="small">${r.progreso}%</span>`], ['Límite', r => r.fecha_limite ? fmtDate(r.fecha_limite) : '—'], ['Estado', r => estadoBadge(r.estado, { en_curso: 'blue', cumplido: 'green', vencido: 'red' })]]
  },
  reconocimientos: {
    tabla: 'reconocimientos', titulo: 'Reconocimientos', sub: 'Reconozca públicamente los logros de su equipo', nuevo: 'Nuevo reconocimiento',
    fields: [{ k: 'colaborador_id', l: 'Colaborador', type: 'colab', req: true, full: true }, { k: 'icono', l: 'Insignia', type: 'select', opts: ['⭐', '🏆', '🎖️', '🚀', '💡', '🤝', '❤️'].map(x => [x, x]) }, { k: 'titulo', l: 'Título', req: true }, { k: 'mensaje', l: 'Mensaje', type: 'textarea', full: true }],
    cols: [['Colaborador', r => colabCell(r.colaborador_id)], ['Reconocimiento', r => `<span style="font-size:20px">${h(r.icono || '⭐')}</span> <b style="font-weight:600">${h(r.titulo)}</b><div class="small muted">${cortar(r.mensaje)}</div>`], ['Fecha', r => fmtDate(r.created_at.slice(0, 10))]],
    after: async (row, nuevo) => { if (nuevo) await mensajeA(row.colaborador_id, `${row.icono || '⭐'} ¡Recibiste un reconocimiento: ${row.titulo}!`); }
  },
  encuestas: {
    tabla: 'encuestas', titulo: 'Encuestas', sub: 'Clima laboral y satisfacción (preguntas en escala de 1 a 5)', nuevo: 'Nueva encuesta',
    fields: [{ k: 'titulo', l: 'Título', req: true, full: true }, { k: 'descripcion', l: 'Descripción', type: 'textarea', full: true }, { k: 'preguntasTxt', l: 'Preguntas (una por línea)', type: 'textarea', req: true, full: true }, { k: 'activa', l: 'Encuesta activa', type: 'checkbox', def: true }],
    fromDb: r => ({ ...r, preguntasTxt: (r.preguntas || []).join('\n') }),
    toDb: v => { const o = { ...v, preguntas: String(v.preguntasTxt || '').split('\n').map(s => s.trim()).filter(Boolean) }; delete o.preguntasTxt; return o; },
    cols: [['Encuesta', r => `<b style="font-weight:600">${h(r.titulo)}</b><div class="small muted">${cortar(r.descripcion)}</div>`], ['Preguntas', r => (r.preguntas || []).length], ['Estado', r => r.activa ? '<span class="badge green">Activa</span>' : '<span class="badge">Cerrada</span>']],
    acciones: r => [{ t: '📊 Resultados', fn: async r => { await resultadosEncuesta(r); } }]
  },
  beneficios: {
    tabla: 'beneficios', titulo: 'Beneficios', sub: 'Convenios y beneficios disponibles para el personal', nuevo: 'Nuevo beneficio',
    fields: [{ k: 'titulo', l: 'Beneficio', req: true, full: true }, { k: 'categoria', l: 'Categoría' }, { k: 'vigencia', l: 'Vigente hasta', type: 'date' }, { k: 'descripcion', l: 'Descripción', type: 'textarea', full: true }, { k: 'activo', l: 'Activo', type: 'checkbox', def: true }],
    cols: [['Beneficio', r => `🎁 <b style="font-weight:600">${h(r.titulo)}</b><div class="small muted">${cortar(r.descripcion)}</div>`], ['Categoría', r => h(r.categoria || '')], ['Vigencia', r => r.vigencia ? fmtDate(r.vigencia) : 'Indefinida'], ['Estado', r => r.activo ? '<span class="badge green">Activo</span>' : '<span class="badge">Inactivo</span>']]
  },
  denuncias: {
    tabla: 'denuncias', titulo: 'Canal de denuncias', sub: 'Reportes confidenciales de los colaboradores (pueden ser anónimos)', noNew: true,
    fields: [{ k: 'estado', l: 'Estado', type: 'select', opts: [['recibida', 'Recibida'], ['en_revision', 'En revisión'], ['cerrada', 'Cerrada']] }, { k: 'respuesta', l: 'Respuesta / gestión', type: 'textarea', full: true }],
    cols: [['Fecha', r => fmtDT(r.created_at)], ['Denunciante', r => r.anonima ? '<span class="badge">Anónimo</span>' : colabCell(r.colaborador_id)], ['Tipo', r => h(r.tipo || '')], ['Descripción', r => cortar(r.descripcion, 120)], ['Estado', r => estadoBadge(r.estado, { recibida: 'amber', en_revision: 'blue', cerrada: 'green' })]]
  },
  comunicados: {
    tabla: 'comunicados', titulo: 'Comunicados', sub: 'Cartelera visible para todos los colaboradores', nuevo: 'Nuevo comunicado',
    fields: [{ k: 'titulo', l: 'Título', req: true, full: true }, { k: 'mensaje', l: 'Mensaje', type: 'textarea', req: true, full: true }, { k: 'fijado', l: 'Fijar arriba', type: 'checkbox' }],
    cols: [['Comunicado', r => `${r.fijado ? '📌 ' : ''}<b style="font-weight:600">${h(r.titulo)}</b><div class="small muted">${cortar(r.mensaje, 110)}</div>`], ['Publicado', r => fmtDT(r.created_at)]],
    reload: () => go('comunicacion'),
    after: async (row, nuevo) => { if (nuevo) notify('otro', '📢 Comunicado publicado', row.titulo, null); }
  }
};
['documentos', 'activos', 'adelantos', 'objetivos', 'reconocimientos', 'encuestas', 'beneficios', 'denuncias'].forEach(k => VIEWS[k] = crudView(CRUDS[k]));

async function resultadosEncuesta(enc) {
  const { data } = await sb.from('encuesta_respuestas').select('*').eq('encuesta_id', enc.id);
  const n = data?.length || 0;
  modal({
    title: `Resultados · ${h(enc.titulo)}`, wide: true, buttons: [{ t: 'Cerrar', cls: 'primary' }],
    html: `<p><b>${n}</b> respuesta(s) de ${activos().length} colaboradores activos.</p>${(enc.preguntas || []).map((p, i) => { const vals = (data || []).map(r => Number((r.respuestas || [])[i])).filter(Boolean), avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; return `<div class="mb"><div class="row between"><span>${h(p)}</span><b>${avg ? avg.toFixed(2) : '—'} / 5</b></div><div class="bar"><i style="width:${avg / 5 * 100}%"></i></div></div>`; }).join('')}
      ${(data || []).filter(r => r.comentario).length ? '<h3>Comentarios</h3>' + data.filter(r => r.comentario).map(r => `<div class="card" style="margin-bottom:8px">${h(r.comentario)}</div>`).join('') : ''}`
  });
}
