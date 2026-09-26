/* =====================================================================
   PROCESOS DE SELECCIÓN Y CONTRATACIÓN
   Módulo independiente: usa solo las tablas vacantes, candidatos y candidato_eventos (schema_seleccion.sql).
   Los aspirantes no suben archivos: comparten el enlace de Google Drive de su hoja de vida.
   ===================================================================== */
const ETAPAS = [
  ['nuevo', 'Nuevo', '📥'], ['preseleccion', 'Aceptado (preselección)', '✔️'], ['pruebas', 'Pruebas', '🧪'], ['entrevista', 'Entrevista', '🗣️'],
  ['referencias', 'Referencias y antecedentes', '🔎'], ['examen_medico', 'Examen médico de ingreso', '🩺'], ['oferta', 'Oferta', '📄'], ['contratado', 'Contratado', '🎉'], ['descartado', 'Descartado', '✖️']];
const ETAPA = Object.fromEntries(ETAPAS.map(e => [e[0], e]));
const CHECK = [
  ['cedula', 'Copia de la cédula de ciudadanía'], ['estudios', 'Certificados de estudios / hoja de vida con soportes'], ['laborales', 'Certificaciones laborales'],
  ['referencias', 'Referencias personales y laborales verificadas'], ['antecedentes', 'Antecedentes verificados (con autorización del candidato)'],
  ['medico', 'Examen médico ocupacional de ingreso'], ['banco', 'Certificación bancaria'], ['eps', 'Afiliación a EPS'], ['pension', 'Afiliación a fondo de pensiones'],
  ['arl', 'Afiliación a ARL (antes de iniciar labores)'], ['caja', 'Afiliación a caja de compensación'], ['contrato', 'Contrato de trabajo firmado'],
  ['datos', 'Autorización de tratamiento de datos personales'], ['induccion', 'Inducción programada'], ['dotacion', 'Entrega de dotación / activos']];
const SEL = { tab: 'candidatos', vac: '', q: '', vista: 'tablero', V: [], C: [] };
const vacDe = id => SEL.V.find(v => v.id === id);
const hace = ts => { const d = Math.floor((Date.now() - new Date(ts)) / 864e5); return d <= 0 ? 'Hoy' : d === 1 ? 'Ayer' : `Hace ${d} días`; };
const colorDe = s => PAL[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];
const avCand = (c, big) => `<div class="avatar ${big ? 'lg' : ''}" style="background:${colorDe(c.nombres + (c.apellidos || ''))}">${h(((c.nombres || '?')[0] + ((c.apellidos || '')[0] || '')).toUpperCase())}</div>`;
const nomCand = c => `${c.nombres || ''} ${c.apellidos || ''}`.trim();
const estrellas = n => '★'.repeat(n) + '<span style="color:#d5d9e8">' + '★'.repeat(5 - n) + '</span>';
const soloNum = v => String(v || '').replace(/\D/g, '');
function driveId(u) { const m = String(u || '').match(/\/d\/([\w-]{10,})/) || String(u || '').match(/[?&]id=([\w-]{10,})/); return m ? m[1] : null; }
function driveDescarga(u) { const id = driveId(u); if (!id) return u; return /docs\.google\.com\/document/.test(u) ? `https://docs.google.com/document/d/${id}/export?format=pdf` : `https://drive.google.com/uc?export=download&id=${id}`; }
function drivePreview(u) { const id = driveId(u); if (!id) return null; if (/docs\.google\.com\/document/.test(u)) return `https://docs.google.com/document/d/${id}/preview`; return `https://drive.google.com/file/d/${id}/preview`; }
const urlOk = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol); } catch (e) { return false; } };
const portalUrl = id => location.href.split('#')[0].replace(/[^/]*$/, '') + 'postulacion.html' + (id ? '?v=' + id : '');

async function selCargar() {
  const [v, c] = await Promise.all([sb.from('vacantes').select('*').order('created_at', { ascending: false }), sb.from('candidatos').select('*').order('created_at', { ascending: false })]);
  if (v.error) throw v.error; if (c.error) throw c.error; SEL.V = v.data; SEL.C = c.data;
}

VIEWS.seleccion = async el => {
  try { await selCargar(); } catch (e) {
    if (isMissingTable(e)) { el.innerHTML = pageHead('Procesos de selección', 'Reclutamiento y contratación de personal') + `<div class="card"><h3>Falta crear las tablas del módulo</h3><p class="muted">Abra <b>Supabase → SQL Editor</b>, pegue el contenido del archivo <code>schema_seleccion.sql</code> y ejecútelo. Solo crea tablas nuevas (vacantes, candidatos y candidato_eventos); no toca las existentes. Luego recargue esta pestaña.</p></div>`; return; }
    throw e;
  }
  const tabs = [['vacantes', 'Vacantes'], ['candidatos', 'Candidatos'], ['portal', 'Portal de empleo'], ['indicadores', 'Indicadores'], ['guia', 'Guía del proceso']];
  const nuevos = SEL.C.filter(c => c.etapa === 'nuevo').length;
  el.innerHTML = pageHead('Procesos de selección', 'Reclutamiento y contratación: de la vacante al nuevo colaborador', nuevos ? `<span class="badge amber">${nuevos} candidato(s) nuevo(s)</span>` : '') +
    `<div class="tabs">${tabs.map(t => `<div class="tab ${SEL.tab === t[0] ? 'active' : ''}" data-t="${t[0]}">${t[1]}</div>`).join('')}</div><div id="sBody"></div>`;
  $$('.tab', el).forEach(t => t.onclick = () => { SEL.tab = t.dataset.t; go('seleccion'); });
  ({ vacantes: selVacantes, candidatos: selCandidatos, portal: selPortal, indicadores: selIndicadores, guia: selGuia })[SEL.tab]($('#sBody'));
};
const recargarSel = () => go('seleccion');

/* ---------------- VACANTES ---------------- */
const F_VAC = () => [
  { k: 'titulo', l: 'Nombre de la vacante', req: true, full: true }, { k: 'area', l: 'Área' }, { k: 'cargo', l: 'Cargo' }, { k: 'ciudad', l: 'Ciudad' },
  { k: 'modalidad', l: 'Modalidad', type: 'select', opts: ['Presencial', 'Híbrido', 'Remoto'].map(x => [x, x]) },
  { k: 'tipo_contrato', l: 'Tipo de contrato', type: 'select', opts: CONTRATOS.map(x => [x, x]) }, { k: 'cupos', l: 'Cupos', type: 'number', def: 1, min: 1 },
  { k: 'salario_min', l: 'Salario mínimo (COP)', type: 'number' }, { k: 'salario_max', l: 'Salario máximo (COP)', type: 'number' },
  { k: 'solicitante', l: 'Solicitante (requisición)' }, { k: 'fecha_limite', l: 'Fecha límite para postular', type: 'date' },
  { k: 'estado', l: 'Estado', type: 'select', opts: [['abierta', 'Abierta'], ['borrador', 'Borrador'], ['pausada', 'Pausada'], ['cerrada', 'Cerrada']] },
  { k: 'descripcion', l: 'Descripción de la vacante', type: 'textarea', full: true }, { k: 'funciones', l: 'Funciones del cargo', type: 'textarea', full: true },
  { k: 'requisitos', l: 'Requisitos (estudios, experiencia)', type: 'textarea', full: true }, { k: 'competencias', l: 'Competencias', type: 'textarea', full: true },
  { k: 'publica', l: 'Publicar en el portal de empleo', type: 'checkbox', def: true, full: true }];
function formVacante(v) {
  const F = F_VAC();
  const m = modal({
    title: v ? 'Editar vacante' : 'Nueva vacante', wide: true, html: formHtml(F, v || {}), buttons: [{ t: 'Cancelar' }, {
      t: 'Guardar', cls: 'primary', fn: async () => {
        const o = readForm(m.el, F); if (!o) return false; o.cupos = o.cupos || 1;
        const { error } = v ? await sb.from('vacantes').update(o).eq('id', v.id) : await sb.from('vacantes').insert(o);
        if (error) { toast(dbErr(error), 'err'); return false; } toast('Vacante guardada', 'ok'); recargarSel();
      }
    }]
  });
}
function selVacantes(el) {
  const EST = { abierta: 'green', borrador: '', pausada: 'amber', cerrada: 'red' };
  el.innerHTML = `<div class="row between mb"><span class="muted small">${SEL.V.length} vacante(s)</span><button class="btn primary" id="vN">+ Nueva vacante</button></div>
  <div class="grid2">${SEL.V.map(v => {
    const cs = SEL.C.filter(c => c.vacante_id === v.id), cont = cs.filter(c => c.etapa === 'contratado').length;
    return `<div class="card"><div class="row between"><h3>${h(v.titulo)}</h3><span class="badge ${EST[v.estado]}">${v.estado}</span></div>
      <div class="small muted mt">${[v.area, v.cargo, v.ciudad, v.modalidad, v.tipo_contrato].filter(Boolean).map(h).join(' · ')}</div>
      <div class="mt">${v.salario_min || v.salario_max ? `<b>${v.salario_min ? money(v.salario_min) : ''}${v.salario_min && v.salario_max ? ' – ' : ''}${v.salario_max ? money(v.salario_max) : ''}</b> · ` : ''}${cont}/${v.cupos} cupo(s) cubierto(s) ${v.publica ? '· <span class="badge blue">Publicada</span>' : ''}</div>
      <div class="row mt small">${ETAPAS.filter(e => cs.some(c => c.etapa === e[0])).map(e => `<span class="badge">${e[2]} ${cs.filter(c => c.etapa === e[0]).length}</span>`).join('') || '<span class="muted">Sin candidatos aún</span>'}</div>
      <div class="row mt"><button class="btn sm primary" data-c="${v.id}">Ver candidatos (${cs.length})</button><button class="btn sm" data-e="${v.id}">Editar</button><button class="btn sm" data-l="${v.id}">🔗 Copiar enlace</button>
        ${v.estado === 'abierta' ? `<button class="btn sm" data-s="${v.id}|cerrada">Cerrar</button>` : `<button class="btn sm" data-s="${v.id}|abierta">Abrir</button>`}<button class="icon-btn" data-x="${v.id}">🗑</button></div></div>`;
  }).join('') || '<div class="card empty" style="grid-column:1/-1">Cree su primera vacante para empezar a recibir postulaciones.</div>'}</div>`;
  $('#vN').onclick = () => formVacante();
  $$('[data-e]', el).forEach(b => b.onclick = () => formVacante(vacDe(b.dataset.e)));
  $$('[data-c]', el).forEach(b => b.onclick = () => { SEL.vac = b.dataset.c; SEL.tab = 'candidatos'; go('seleccion'); });
  $$('[data-l]', el).forEach(b => b.onclick = () => { navigator.clipboard?.writeText(portalUrl(b.dataset.l)); toast('Enlace de postulación copiado', 'ok'); });
  $$('[data-s]', el).forEach(b => b.onclick = async () => { const [id, est] = b.dataset.s.split('|'); await sb.from('vacantes').update({ estado: est }).eq('id', id); recargarSel(); });
  $$('[data-x]', el).forEach(b => b.onclick = async () => { if (!await confirmDlg('¿Eliminar la vacante? Los candidatos quedarán sin vacante asignada.')) return; const { error } = await sb.from('vacantes').delete().eq('id', b.dataset.x); if (error) return toast(dbErr(error), 'err'); recargarSel(); });
}

/* ---------------- CANDIDATOS (tablero) ---------------- */
function selCandidatos(el) {
  const q = SEL.q.toLowerCase();
  const lista = SEL.C.filter(c => (!SEL.vac || c.vacante_id === SEL.vac) && (!q || `${nomCand(c)} ${c.cedula || ''} ${c.correo || ''}`.toLowerCase().includes(q)));
  el.innerHTML = `<div class="row mb"><div><label>Vacante</label><select id="sV"><option value="">Todas</option>${SEL.V.map(v => `<option value="${v.id}" ${SEL.vac === v.id ? 'selected' : ''}>${h(v.titulo)}</option>`).join('')}</select></div>
    <div class="grow"><label>Buscar</label><input id="sQ" value="${h(SEL.q)}" placeholder="Nombre, cédula o correo"></div>
    <div class="seg" style="align-self:end" id="sVis"><span data-v="tablero" class="${SEL.vista === 'tablero' ? 'on' : ''}">Tablero</span><span data-v="lista" class="${SEL.vista === 'lista' ? 'on' : ''}">Lista</span></div>
    <button class="btn primary" style="align-self:end" id="sN">+ Nuevo candidato</button></div>
    ${SEL.vista === 'tablero' ? `<div class="kanban">${ETAPAS.map(([k, l, ic]) => { const cs = lista.filter(c => c.etapa === k); return `<div class="kcol" data-k="${k}"><h3><span>${ic} ${l}</span><span class="badge">${cs.length}</span></h3>${cs.map(c => `<div class="kcard" draggable="true" data-id="${c.id}">${avCand(c)}<div class="grow" style="min-width:0"><b>${h(nomCand(c))}</b><small>${h(vacDe(c.vacante_id)?.titulo || 'Sin vacante')}</small><small>🕒 ${hace(c.etapa_at)}</small>${c.calificacion ? `<small style="color:#f59e0b">${estrellas(c.calificacion)}</small>` : ''}</div></div>`).join('') || '<div class="small muted center" style="padding:14px">Arrastre candidatos aquí</div>'}</div>`; }).join('')}</div>`
      : `<div class="card flush"><div class="table-wrap"><table><thead><tr><th>Candidato</th><th>Vacante</th><th>Etapa</th><th>Contacto</th><th>Calificación</th><th>Aplicó</th><th></th></tr></thead><tbody>${lista.map(c => `<tr><td><div class="person">${avCand(c)}<div><b>${h(nomCand(c))}</b><span>${h(c.fuente || '')}</span></div></div></td><td>${h(vacDe(c.vacante_id)?.titulo || '—')}</td><td><span class="badge blue">${ETAPA[c.etapa][2]} ${ETAPA[c.etapa][1]}</span></td><td class="small">${h(c.correo || '')}<div class="muted">${h(c.telefono || '')}</div></td><td style="color:#f59e0b">${estrellas(c.calificacion)}</td><td>${hace(c.created_at)}</td><td class="right"><button class="btn sm" data-id="${c.id}">Abrir</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin candidatos</td></tr>'}</tbody></table></div></div>`}`;
  $('#sV').onchange = e => { SEL.vac = e.target.value; selCandidatos(el); };
  $('#sQ').oninput = debounce(e => { SEL.q = e.target.value; selCandidatos(el); $('#sQ').focus(); }, 300);
  $$('#sVis span', el).forEach(s => s.onclick = () => { SEL.vista = s.dataset.v; selCandidatos(el); });
  $('#sN').onclick = () => formCand();
  $$('.kcard,[data-id].btn', el).forEach(k => k.onclick = () => detalleCand(k.dataset.id));
  $$('.kcard', el).forEach(k => k.ondragstart = ev => { ev.dataTransfer.setData('text/plain', k.dataset.id); });
  $$('.kcol', el).forEach(col => {
    col.ondragover = ev => { ev.preventDefault(); col.classList.add('over'); }; col.ondragleave = () => col.classList.remove('over');
    col.ondrop = async ev => { ev.preventDefault(); col.classList.remove('over'); const c = SEL.C.find(x => x.id === ev.dataTransfer.getData('text/plain')); if (c && c.etapa !== col.dataset.k) { await moverEtapa(c, col.dataset.k); recargarSel(); } };
  });
}
async function moverEtapa(c, etapa) {
  const extra = {};
  if (etapa === 'descartado') { const mot = await pedirMotivo(); if (mot === null) return false; extra.motivo_descarte = mot; }
  const { error } = await sb.from('candidatos').update({ etapa, etapa_at: new Date().toISOString(), ...extra }).eq('id', c.id);
  if (error) { toast(dbErr(error), 'err'); return false; }
  await sb.from('candidato_eventos').insert({ candidato_id: c.id, tipo: 'etapa', titulo: `Movido a: ${ETAPA[etapa][1]}`, detalle: extra.motivo_descarte || null, autor: S.admin?.nombre || S.admin?.usuario });
  c.etapa = etapa; return true;
}
const pedirMotivo = () => new Promise(res => {
  const m = modal({ title: 'Descartar candidato', html: `<div class="field"><label>Motivo del descarte</label><select id="mo">${['No cumple el perfil', 'Expectativa salarial', 'Reprobó pruebas', 'Reprobó entrevista', 'Referencias negativas', 'Desistió del proceso', 'Vacante cubierta', 'Otro'].map(x => `<option>${x}</option>`).join('')}</select></div>`, buttons: [{ t: 'Cancelar', fn: () => res(null) }, { t: 'Descartar', cls: 'danger solid', fn: () => res($('#mo', m.el).value) }] });
});
const F_CAND = () => [
  { k: 'nombres', l: 'Nombres', req: true }, { k: 'apellidos', l: 'Apellidos' }, { k: 'cedula', l: 'Cédula' }, { k: 'correo', l: 'Correo', type: 'email' }, { k: 'telefono', l: 'Teléfono / WhatsApp' }, { k: 'ciudad', l: 'Ciudad' },
  { k: 'vacante_id', l: 'Vacante', type: 'select', opts: [['', '— Sin vacante —'], ...SEL.V.map(v => [v.id, v.titulo])] }, { k: 'salario_aspirado', l: 'Salario aspirado (COP)', type: 'number' },
  { k: 'hoja_vida_url', l: 'Enlace de Drive de la hoja de vida', full: true, hint: 'El archivo debe estar compartido como “Cualquier persona con el enlace”.' }, { k: 'documentos_url', l: 'Enlace de Drive de otros documentos', full: true }, { k: 'linkedin_url', l: 'LinkedIn / portafolio', full: true },
  { k: 'fuente', l: 'Fuente', type: 'select', opts: ['Portal de empleo', 'Servicio Público de Empleo', 'LinkedIn', 'Computrabajo / elempleo', 'Referido', 'Redes sociales', 'Universidad / SENA', 'Otro'].map(x => [x, x]), def: 'Referido' }];
function formCand(c) {
  const F = F_CAND();
  const m = modal({
    title: c ? 'Editar datos del candidato' : 'Nuevo candidato', wide: true, html: formHtml(F, c || { vacante_id: SEL.vac }), buttons: [{ t: 'Cancelar' }, {
      t: 'Guardar', cls: 'primary', fn: async () => {
        const o = readForm(m.el, F); if (!o) return false; o.vacante_id = o.vacante_id || null; o.cedula = o.cedula ? soloNum(o.cedula) : null;
        for (const k of ['hoja_vida_url', 'documentos_url', 'linkedin_url']) if (o[k] && !urlOk(o[k])) { toast('Los enlaces deben empezar por http:// o https://', 'err'); return false; }
        const { error } = c ? await sb.from('candidatos').update(o).eq('id', c.id) : await sb.from('candidatos').insert({ ...o, acepta_datos: true });
        if (error) { toast(dbErr(error), 'err'); return false; } toast('Candidato guardado', 'ok'); recargarSel();
      }
    }]
  });
}

/* ---------------- DETALLE DEL CANDIDATO ---------------- */
async function detalleCand(id) {
  let c = SEL.C.find(x => x.id === id); if (!c) return;
  const m = modal({ title: 'Candidato', wide: true, html: '<div class="empty">Cargando…</div>', buttons: [{ t: 'Cerrar', fn: () => { recargarSel(); } }] });
  const pintar = async () => {
    const { data: ev } = await sb.from('candidato_eventos').select('*').eq('candidato_id', c.id).order('created_at', { ascending: false });
    const v = vacDe(c.vacante_id), chk = c.checklist || {}, hechos = CHECK.filter(x => chk[x[0]]).length, agenda = (ev || []).filter(e => e.tipo !== 'etapa'), hist = (ev || []).filter(e => e.tipo === 'etapa');
    const prev = drivePreview(c.hoja_vida_url);
    m.body.innerHTML = `<div class="row" style="gap:16px;align-items:flex-start">${avCand(c, true)}<div class="grow"><h2>${h(nomCand(c))}</h2><div class="muted">${h(v?.titulo || 'Sin vacante')}${v?.area ? ' · ' + h(v.area) : ''} · aplicó ${hace(c.created_at).toLowerCase()} · ${h(c.fuente || '')}</div>
        <div class="row mt"><select id="dE" style="width:auto">${ETAPAS.map(e => `<option value="${e[0]}" ${c.etapa === e[0] ? 'selected' : ''}>${e[2]} ${e[1]}</option>`).join('')}</select><span id="dSt" style="color:#f59e0b;font-size:20px;cursor:pointer" title="Calificar">${[1, 2, 3, 4, 5].map(n => `<span data-n="${n}" style="${n <= c.calificacion ? '' : 'color:#d5d9e8'}">★</span>`).join('')}</span>
        ${c.acepta_datos ? '<span class="badge green">Autorizó datos (Ley 1581)</span>' : '<span class="badge amber">Sin autorización de datos</span>'}</div></div>
        <div class="row"><button class="btn sm" id="dEd">Editar datos</button></div></div>
      <div class="grid3 mt"><div><label>Correo</label>${c.correo ? `<a href="mailto:${h(c.correo)}">${h(c.correo)}</a>` : '—'}</div><div><label>Teléfono</label>${c.telefono ? `${h(c.telefono)} <a href="https://wa.me/57${soloNum(c.telefono).replace(/^57/, '')}" target="_blank" rel="noopener">WhatsApp</a>` : '—'}</div><div><label>Ciudad</label>${h(c.ciudad || '—')}</div>
        <div><label>Cédula</label>${h(c.cedula || '—')}</div><div><label>Salario aspirado</label>${c.salario_aspirado ? money(c.salario_aspirado) : '—'}</div><div><label>LinkedIn / portafolio</label>${c.linkedin_url ? `<a href="${h(c.linkedin_url)}" target="_blank" rel="noopener">Abrir</a>` : '—'}</div></div>
      <div class="card mt" style="background:#f7f8fd"><h3>📎 Documentos</h3><div class="row mt">
        ${c.hoja_vida_url ? `<a class="btn primary sm" href="${h(c.hoja_vida_url)}" target="_blank" rel="noopener">👁 Ver hoja de vida</a><a class="btn sm" href="${h(driveDescarga(c.hoja_vida_url))}" target="_blank" rel="noopener">⬇ Descargar</a>${prev ? '<button class="btn sm" id="dPv">Vista previa aquí</button>' : ''}` : '<span class="muted">El candidato no compartió hoja de vida</span>'}
        ${c.documentos_url ? `<a class="btn sm" href="${h(c.documentos_url)}" target="_blank" rel="noopener">📁 Otros documentos</a>` : ''}</div><div id="dPrev"></div></div>
      <div class="grid2 mt"><div class="card"><h3>📅 Entrevistas, pruebas y seguimiento</h3>
        <div style="margin:10px 0">${agenda.map(e => `<div style="border-bottom:1px solid var(--line);padding:8px 0"><div class="row between"><b>${{ entrevista: '🗣️', prueba: '🧪', referencia: '🔎', nota: '📝' }[e.tipo]} ${h(e.titulo)}</b><button class="icon-btn" data-ex="${e.id}">🗑</button></div>
          <div class="small muted">${e.fecha ? fmtDT(e.fecha) : ''} ${e.entrevistador ? '· ' + h(e.entrevistador) : ''} ${e.modalidad ? '· ' + h(e.modalidad) : ''} ${e.enlace ? `· <a href="${h(e.enlace)}" target="_blank" rel="noopener">enlace</a>` : ''}</div>${e.detalle ? `<div class="small">${h(e.detalle)}</div>` : ''}
          ${e.tipo !== 'nota' ? `<select class="rs" data-er="${e.id}" style="width:auto;margin-top:4px;padding:4px 8px">${['pendiente', 'aprobado', 'no aprobado'].map(r => `<option ${e.resultado === r ? 'selected' : ''}>${r}</option>`).join('')}</select>` : ''}</div>`).join('') || '<div class="muted small">Sin actividades registradas.</div>'}</div>
        <details><summary class="btn sm">+ Agendar / registrar</summary><div class="mt"><div class="grid2"><div class="field"><label>Tipo</label><select id="eT"><option value="entrevista">Entrevista</option><option value="prueba">Prueba</option><option value="referencia">Verificación de referencia</option><option value="nota">Nota</option></select></div><div class="field"><label>Título</label><input id="eTi" placeholder="Ej.: Entrevista con RRHH"></div>
          <div class="field"><label>Fecha y hora</label><input type="datetime-local" id="eF"></div><div class="field"><label>Entrevistador / responsable</label><input id="eEn"></div><div class="field"><label>Modalidad</label><select id="eMo"><option>Presencial</option><option>Virtual</option><option>Telefónica</option></select></div><div class="field"><label>Enlace (videollamada)</label><input id="eEl"></div>
          <div class="field full"><label>Detalle / resultado</label><textarea id="eDe"></textarea></div></div><button class="btn primary sm" id="eAdd">Guardar</button></div></details></div>
      <div class="card"><h3>✅ Checklist de contratación <span class="badge blue">${hechos}/${CHECK.length}</span></h3><div class="bar mt"><i style="width:${hechos / CHECK.length * 100}%"></i></div>
        <div class="mt">${CHECK.map(([k, l]) => `<label class="chk" style="padding:4px 0"><input type="checkbox" data-ck="${k}" ${chk[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div></div></div>
      <div class="grid2 mt"><div class="card"><h3>📝 Notas del reclutador</h3><textarea id="dNo" class="mt" placeholder="Impresiones, fortalezas, alertas…">${h(c.notas || '')}</textarea><button class="btn sm mt" id="dNs">Guardar notas</button></div>
        <div class="card"><h3>🕘 Historial de etapas</h3><div class="mt small">${hist.map(e => `<div style="padding:4px 0">• ${h(e.titulo)}${e.detalle ? ` <span class="muted">(${h(e.detalle)})</span>` : ''} <span class="muted">— ${fmtDT(e.created_at)}${e.autor ? ' · ' + h(e.autor) : ''}</span></div>`).join('') || '<span class="muted">Sin movimientos</span>'}</div></div></div>
      <div class="row mt" style="justify-content:flex-end">${c.colaborador_id ? '<span class="badge green">Ya es colaborador</span>' : c.etapa !== 'contratado' ? '<button class="btn ok" id="dHi">🎉 Contratar y crear colaborador</button>' : ''}${c.etapa !== 'descartado' ? '<button class="btn danger" id="dDe">Descartar</button>' : ''}<button class="icon-btn" id="dDel" title="Eliminar candidato">🗑</button></div>`;
    $('#dE', m.el).onchange = async e => { if (await moverEtapa(c, e.target.value)) { toast('Etapa actualizada', 'ok'); } await refrescar(); };
    $$('#dSt span[data-n]', m.el).forEach(s => s.onclick = async () => { const n = Number(s.dataset.n); c.calificacion = c.calificacion === n ? 0 : n; await sb.from('candidatos').update({ calificacion: c.calificacion }).eq('id', c.id); pintar(); });
    $('#dEd', m.el).onclick = () => formCand(c);
    $('#dPv', m.el)?.addEventListener('click', () => { $('#dPrev', m.el).innerHTML = `<iframe src="${h(prev)}" style="width:100%;height:460px;border:1px solid var(--line);border-radius:10px;margin-top:10px" allow="autoplay"></iframe><div class="hint">Si no carga, verifique que el archivo esté compartido con “Cualquier persona con el enlace”.</div>`; });
    $('#eAdd', m.el).onclick = async () => {
      const t = $('#eTi', m.el).value.trim(); if (!t) return toast('Escriba un título', 'err'); const f = $('#eF', m.el).value;
      const { error } = await sb.from('candidato_eventos').insert({ candidato_id: c.id, tipo: $('#eT', m.el).value, titulo: t, fecha: f ? new Date(f).toISOString() : null, entrevistador: $('#eEn', m.el).value.trim() || null, modalidad: $('#eMo', m.el).value, enlace: $('#eEl', m.el).value.trim() || null, detalle: $('#eDe', m.el).value.trim() || null, resultado: 'pendiente', autor: S.admin?.nombre });
      if (error) return toast(dbErr(error), 'err'); pintar();
    };
    $$('[data-ex]', m.el).forEach(b => b.onclick = async () => { await sb.from('candidato_eventos').delete().eq('id', b.dataset.ex); pintar(); });
    $$('[data-er]', m.el).forEach(s => s.onchange = async () => { await sb.from('candidato_eventos').update({ resultado: s.value }).eq('id', s.dataset.er); toast('Resultado guardado', 'ok'); });
    $$('[data-ck]', m.el).forEach(i => i.onchange = async () => { c.checklist = { ...(c.checklist || {}), [i.dataset.ck]: i.checked }; await sb.from('candidatos').update({ checklist: c.checklist }).eq('id', c.id); pintar(); });
    $('#dNs', m.el).onclick = async () => { c.notas = $('#dNo', m.el).value; const { error } = await sb.from('candidatos').update({ notas: c.notas }).eq('id', c.id); toast(error ? dbErr(error) : 'Notas guardadas', error ? 'err' : 'ok'); };
    $('#dDe', m.el)?.addEventListener('click', async () => { if (await moverEtapa(c, 'descartado')) { toast('Candidato descartado', 'ok'); await refrescar(); } });
    $('#dDel', m.el).onclick = async () => { if (!await confirmDlg('¿Eliminar definitivamente a este candidato y su historial?')) return; await sb.from('candidatos').delete().eq('id', c.id); m.close(); recargarSel(); };
    $('#dHi', m.el)?.addEventListener('click', () => contratarCand(c, async () => { await refrescar(); }));
  };
  const refrescar = async () => { const { data } = await sb.from('candidatos').select('*').eq('id', c.id).single(); if (data) { c = data; const i = SEL.C.findIndex(x => x.id === c.id); if (i >= 0) SEL.C[i] = c; } pintar(); };
  pintar();
}
async function contratarCand(c, done) {
  const v = vacDe(c.vacante_id), ced = soloNum(c.cedula);
  if (!ced) return toast('Complete la cédula del candidato (Editar datos) antes de contratar', 'err');
  if (!await confirmDlg(`Se creará el colaborador <b>${h(nomCand(c))}</b> (C.C. ${ced}) con cargo <b>${h(v?.cargo || v?.titulo || 'por definir')}</b> y fecha de ingreso de hoy. Podrá completar el resto de sus datos (turno, EPS, banco…) en Colaboradores → Editar.`, 'Contratar', false)) return;
  const { error } = await sb.from('colaboradores').insert({ cedula: ced, nombres: c.nombres, apellidos: c.apellidos || '', cargo: v?.cargo || v?.titulo || null, area: v?.area || null, tipo_contrato: v?.tipo_contrato || 'Término indefinido', fecha_ingreso: ymd(new Date()), salario: c.salario_aspirado || v?.salario_max || v?.salario_min || CFG.params.smmlv, correo: c.correo || null, telefono: c.telefono || null, estado: 'activo', rol: 'Colaborador' });
  if (error) return toast(dbErr(error), 'err');
  const { data: nuevo } = await sb.from('colaboradores').select('id').eq('cedula', ced).maybeSingle();
  await sb.from('candidatos').update({ etapa: 'contratado', etapa_at: new Date().toISOString(), colaborador_id: nuevo?.id || null }).eq('id', c.id);
  await sb.from('candidato_eventos').insert({ candidato_id: c.id, tipo: 'etapa', titulo: 'Movido a: Contratado', detalle: 'Creado como colaborador', autor: S.admin?.nombre });
  const cont = SEL.C.filter(x => x.vacante_id === c.vacante_id && x.etapa === 'contratado').length + 1;
  if (v && cont >= v.cupos && v.estado === 'abierta') { await sb.from('vacantes').update({ estado: 'cerrada' }).eq('id', v.id); toast('Cupos cubiertos: la vacante se cerró automáticamente'); }
  toast('🎉 Colaborador creado. Contraseña inicial del portal: su cédula', 'ok'); await loadBase(); done && done();
}

/* ---------------- PORTAL DE EMPLEO ---------------- */
function selPortal(el) {
  const pub = SEL.V.filter(v => v.publica && v.estado === 'abierta');
  el.innerHTML = `<div class="grid2"><div class="card"><h3>Portal de empleo para aspirantes</h3><p class="muted">Comparta este enlace en redes, portales de empleo o por WhatsApp. Los aspirantes ven las vacantes abiertas y publicadas y se postulan con sus datos.</p>
    <div class="row"><input id="pU" readonly value="${h(portalUrl())}"><button class="btn primary" id="pC">Copiar</button></div><div class="row mt"><a class="btn" href="${h(portalUrl())}" target="_blank" rel="noopener">Abrir portal</a></div>
    <div class="card mt" style="background:#f7f8fd"><b>📎 Sin subir archivos</b><p class="small muted" style="margin:6px 0 0">El aspirante <b>no sube</b> su hoja de vida: pega el enlace de Google Drive (compartido como “Cualquier persona con el enlace”). Usted la visualiza o descarga desde la tarjeta del candidato.</p></div></div>
    <div class="card"><h3>Vacantes publicadas (${pub.length})</h3>${pub.map(v => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><div><b>${h(v.titulo)}</b><div class="small muted">${[v.area, v.ciudad, v.modalidad].filter(Boolean).map(h).join(' · ')}</div></div><button class="btn sm" data-l="${v.id}">🔗 Enlace</button></div>`).join('') || '<div class="muted mt">No hay vacantes abiertas y publicadas. Cree una en la pestaña Vacantes.</div>'}</div></div>`;
  $('#pC').onclick = () => { navigator.clipboard?.writeText($('#pU').value); toast('Enlace copiado', 'ok'); };
  $$('[data-l]', el).forEach(b => b.onclick = () => { navigator.clipboard?.writeText(portalUrl(b.dataset.l)); toast('Enlace de la vacante copiado', 'ok'); });
}

/* ---------------- INDICADORES ---------------- */
function selIndicadores(el) {
  if (!window.Chart) { el.innerHTML = '<div class="card">No se pudo cargar la librería de gráficos.</div>'; return; }
  const C = SEL.C, cont = C.filter(c => c.etapa === 'contratado'), tm = cont.length ? avg(cont.map(c => (new Date(c.etapa_at) - new Date(c.created_at)) / 864e5)) : 0;
  const K = (ic, v, l) => `<div class="card kpi"><div><div class="v">${v}</div><div class="l">${l}</div></div><div class="ic">${ic}</div></div>`;
  el.innerHTML = `<div class="kpis">${K('📂', SEL.V.filter(v => v.estado === 'abierta').length, 'Vacantes abiertas')}${K('🧑', C.length, 'Candidatos totales')}${K('🎉', cont.length, 'Contratados')}${K('📈', C.length ? Math.round(cont.length / C.length * 100) + '%' : '0%', 'Conversión a contratación')}${K('⏱', tm ? tm.toFixed(1) + ' días' : '—', 'Tiempo medio de contratación')}</div>
    <div class="grid2 mt">${acard('Embudo de selección', cbox('sEmb', 320))}${acard('Candidatos por fuente', C.length ? cbox('sFue', 320) : vacio())}</div>
    <div class="grid2 mt">${acard('Candidatos por vacante', C.length ? cbox('sVac', 300) : vacio())}${acard('Motivos de descarte', C.some(c => c.etapa === 'descartado') ? cbox('sDes', 300) : vacio('Sin candidatos descartados'))}</div>`;
  hbar('sEmb', ETAPAS.map(e => e[1]), ETAPAS.map(e => C.filter(c => c.etapa === e[0]).length), '#7c6cff');
  if (C.length) { const f = {}; C.forEach(c => f[c.fuente || 'Otro'] = (f[c.fuente || 'Otro'] || 0) + 1); donut('sFue', Object.keys(f), Object.values(f));
    const pv = {}; C.forEach(c => { const t = vacDe(c.vacante_id)?.titulo || 'Sin vacante'; pv[t] = (pv[t] || 0) + 1; }); hbar('sVac', Object.keys(pv), Object.values(pv), '#22c55e'); }
  const dm = {}; C.filter(c => c.etapa === 'descartado').forEach(c => dm[c.motivo_descarte || 'Sin motivo'] = (dm[c.motivo_descarte || 'Sin motivo'] || 0) + 1); if (Object.keys(dm).length) donut('sDes', Object.keys(dm), Object.values(dm));
}

/* ---------------- GUÍA DEL PROCESO ---------------- */
function selGuia(el) {
  const pasos = [
    ['Requisición y perfil del cargo', 'Un jefe solicita la vacante; RRHH define funciones, requisitos (estudios, experiencia), competencias y rango salarial. Esto se registra en la pestaña Vacantes.'],
    ['Publicación y fuentes de reclutamiento', 'Se publica en el portal de empleo propio, redes, bolsas de empleo y referidos. Las vacantes deben reportarse también al Servicio Público de Empleo, que ofrece el servicio gratuito de intermediación.'],
    ['Recepción y preselección', 'Los aspirantes se postulan con el enlace de Drive de su hoja de vida. El reclutador revisa el perfil frente a los requisitos y mueve a “Aceptado (preselección)” o descarta con motivo.'],
    ['Pruebas', 'Pruebas de conocimientos, técnicas, psicotécnicas o de competencias, según el cargo. Registre la fecha y el resultado en la tarjeta del candidato.'],
    ['Entrevistas', 'Entrevista con RRHH (motivación, competencias, expectativas) y con el jefe inmediato (ajuste técnico y al equipo). Agéndelas en el candidato con enlace de videollamada si es virtual.'],
    ['Referencias y antecedentes', 'Verificación de referencias laborales y personales y de estudios, siempre con autorización del candidato y respetando el tratamiento de datos personales (Ley 1581 de 2012).'],
    ['Examen médico ocupacional de ingreso', 'El empleador lo ordena y lo paga (Res. 2346 de 2007). No se pueden exigir pruebas de embarazo ni de VIH como condición de ingreso.'],
    ['Oferta y negociación', 'Se comunica la oferta: cargo, salario, tipo de contrato, fecha de ingreso y beneficios. El candidato acepta o desiste.'],
    ['Contratación', 'Contrato de trabajo firmado (escrito, obligatorio para término fijo y obra o labor), afiliación a EPS, pensión, caja de compensación y ARL (antes de iniciar labores). Use el checklist y el botón “Contratar” para crear al colaborador.'],
    ['Inducción y periodo de prueba', 'Inducción, entrega de dotación y activos. El periodo de prueba, si se pacta por escrito, no puede exceder 2 meses (Código Sustantivo del Trabajo, art. 76 y siguientes).']];
  el.innerHTML = `<div class="card mb"><h3>¿Cómo funciona un proceso de reclutamiento y selección en Colombia?</h3><p class="muted">Etapas típicas: recepción de hojas de vida, pruebas, entrevistas, verificación de referencias, examen médico y decisión de contratar. Este tablero replica ese flujo: arrastre a cada candidato entre columnas.</p></div>
    <div class="steps">${pasos.map((p, i) => `<div class="step"><div class="n">${i + 1}</div><b>${p[0]}</b><p class="small muted" style="margin:6px 0 0">${p[1]}</p></div>`).join('')}</div>
    <div class="card mt"><h3>Fuentes consultadas</h3><ul class="small">
      <li><a href="https://www.mintrabajo.gov.co/documents/20147/73553081/02EE2023410600000025760+PROCESO+DE+SELECCION+Y+CONTRATACION+PRUEBAS+PSICOACTIVAS.pdf" target="_blank" rel="noopener">Ministerio del Trabajo — Proceso de selección y contratación</a></li>
      <li><a href="http://www.scielo.org.co/scielo.php?script=sci_arttext&pid=S1657-62762012000100005" target="_blank" rel="noopener">SciELO Colombia — El proceso de selección y contratación del personal</a></li>
      <li><a href="https://www.buk.co/blog/pruebas-de-selecci%C3%B3n-de-personal-elegir-para-vacante" target="_blank" rel="noopener">Buk — Pruebas de selección de personal (guía Colombia)</a></li>
      <li><a href="https://www.sgs.com/es-co/nuestra-empresa/carrera-profesional/proceso-de-seleccion-de-personal" target="_blank" rel="noopener">SGS Colombia — Proceso de selección de personal</a></li></ul>
      <p class="hint">Esta guía es orientativa; confirme los requisitos vigentes con el Ministerio del Trabajo o su asesor jurídico.</p></div>`;
}
