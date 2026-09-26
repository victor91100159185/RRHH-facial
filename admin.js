/* =====================================================================
   PANEL DE ADMINISTRACIÓN — shell, sesión, campana, resumen, colaboradores, configuración
   ===================================================================== */
const S = { admin: null, colabs: [], turnos: [], admins: [], view: 'resumen', timers: [] };
const VIEWS = {};
const NAV = [
  { id: 'resumen', ic: '📊', t: 'Resumen' }, { id: 'colaboradores', ic: '🧑‍💼', t: 'Colaboradores' }, { id: 'reportes', ic: '📤', t: 'Reportes' },
  { g: 'Administrativo', items: [
    { id: 'nomina', mod: 'nomina', ic: '💵', t: 'Nómina' }, { id: 'asistencia', mod: 'asistencia', ic: '🕒', t: 'Asistencia' }, { id: 'turnos', mod: 'asistencia', ic: '🗓️', t: 'Crear turno' },
    { id: 'documentos', mod: 'documentos', ic: '✍️', t: 'Documentos y firma' }, { id: 'activos', mod: 'activos', ic: '💻', t: 'Activos' },
    { id: 'adelantos', mod: 'adelantos', ic: '⚡', t: 'Adelantos de sueldo' }] },
  { g: 'Talento', items: [
    { id: 'objetivos', mod: 'objetivos', ic: '🎯', t: 'Objetivos' }, { id: 'reconocimientos', mod: 'reconocimientos', ic: '⭐', t: 'Reconocimientos' },
    { id: 'encuestas', mod: 'encuestas', ic: '📋', t: 'Encuestas' }, { id: 'beneficios', mod: 'beneficios', ic: '🎁', t: 'Beneficios' },
    { id: 'cumpleanos', mod: 'cumpleanos', ic: '🎂', t: 'Cumpleaños' }, { id: 'seleccion', mod: 'seleccion', ic: '🧑‍💼', t: 'Procesos de selección' }] },
  { g: 'Cultura', items: [
    { id: 'denuncias', mod: 'denuncias', ic: '🛡️', t: 'Canal de denuncias' }, { id: 'comunicacion', mod: 'comunicacion', ic: '💬', t: 'Comunicación' }] },
  { g: 'Información', items: [{ id: 'parametros', mod: 'parametros', ic: '⚖️', t: 'Parámetros legales' }] },
  { g: 'Sistema', items: [{ id: 'config', ic: '⚙️', t: 'Configuración' }] }
];
const modOn = m => !m || CFG.modulos[m] !== false;
const colabById = id => S.colabs.find(c => c.id === id);
const turnoById = id => S.turnos.find(t => t.id === id) || null;
const activos = () => S.colabs.filter(c => c.estado === 'activo');
const areas = () => [...new Set(S.colabs.map(c => c.area).filter(Boolean))].sort();

/* ---------- helpers de formularios ---------- */
function fld(f, v) {
  const id = 'f_' + f.k; const val = v ?? f.def ?? '';
  const cls = 'field' + (f.full ? ' full' : '');
  if (f.type === 'checkbox') return `<div class="${cls}"><label class="chk"><input type="checkbox" id="${id}" ${v ?? f.def ? 'checked' : ''}> ${f.l}</label></div>`;
  let inp;
  if (f.type === 'textarea') inp = `<textarea id="${id}" placeholder="${h(f.ph || '')}">${h(val)}</textarea>`;
  else if (f.type === 'select' || f.type === 'colab') {
    const opts = f.type === 'colab' ? [['', '— Seleccione —'], ...S.colabs.filter(c => c.estado === 'activo' || c.id === v).map(c => [c.id, `${nombreCompleto(c)} (${c.cedula})`])] : f.opts;
    inp = `<select id="${id}">${opts.map(o => `<option value="${h(o[0])}" ${String(o[0]) === String(val) ? 'selected' : ''}>${h(o[1])}</option>`).join('')}</select>`;
  } else inp = `<input id="${id}" type="${f.type || 'text'}" value="${h(val)}" placeholder="${h(f.ph || '')}" ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''}>`;
  return `<div class="${cls}"><label>${f.l}${f.req ? ' *' : ''}</label>${inp}${f.hint ? `<div class="hint">${f.hint}</div>` : ''}</div>`;
}
const formHtml = (fields, vals = {}) => `<div class="grid2">${fields.map(f => fld(f, vals[f.k])).join('')}</div>`;
function readForm(root, fields) {
  const o = {};
  for (const f of fields) {
    const el = $('#f_' + f.k, root); if (!el) continue;
    if (f.type === 'file') { o[f.k] = el.files[0] || null; continue; }
    let v = f.type === 'checkbox' ? el.checked : el.value.trim();
    if (f.req && (v === '' || v == null)) { toast(`Falta: ${f.l}`, 'err'); el.focus(); return null; }
    if (f.type === 'number') v = v === '' ? null : Number(v);
    else if (v === '' && f.type !== 'checkbox') v = null;
    o[f.k] = v;
  }
  return o;
}
const dbErr = e => {
  if (e && e.code === '23505') return 'Ya existe un registro con ese valor único (cédula, usuario o tag NFC).';
  if (isMissingTable(e)) return 'Falta una tabla en la base de datos: ejecute schema.sql en Supabase.';
  return errMsg(e);
};

/* ---------- arranque / sesión ---------- */
async function bootAdmin() {
  registerSW();
  $('#loginForm').onsubmit = async ev => {
    ev.preventDefault(); const err = $('#lErr'); err.classList.add('hidden');
    try {
      const u = $('#lUser').value.trim().toLowerCase(), hash = await hashPass($('#lPass').value);
      const { data, error } = await sb.from('admins').select('*').eq('usuario', u).maybeSingle();
      if (error) throw error;
      if (!data || !data.activo || data.pass_hash !== hash) throw new Error('Usuario o contraseña incorrectos.');
      localStorage.setItem('rrhh_admin', JSON.stringify({ id: data.id }));
      await startApp(data);
    } catch (e) { err.textContent = dbErr(e); err.classList.remove('hidden'); }
  };
  try {
    const s = JSON.parse(localStorage.getItem('rrhh_admin') || 'null');
    if (s?.id) { const { data } = await sb.from('admins').select('*').eq('id', s.id).maybeSingle(); if (data && data.activo) return startApp(data); }
  } catch (e) { }
  localStorage.removeItem('rrhh_admin');
}
async function startApp(admin) {
  S.admin = admin;
  try { await loadConfig(); await loadBase(); } catch (e) { toast(dbErr(e), 'err'); }
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#uName').textContent = admin.nombre || admin.usuario; $('#uAv').textContent = (admin.nombre || admin.usuario || 'A')[0].toUpperCase();
  paintBrand(); buildNav(); wireTopbar(); startBell();
  if (typeof iniciarAlertaCumple === 'function') iniciarAlertaCumple();
  go(location.hash.slice(1) || 'resumen');
}
async function loadBase() {
  const [c, t, a] = await Promise.all([
    sb.from('colaboradores').select('*').order('nombres'), sb.from('turnos').select('*').order('nombre'),
    sb.from('admins').select('id,usuario,nombre,colaborador_id,activo,created_at').order('created_at')]);
  if (c.error) throw c.error; if (t.error) throw t.error; if (a.error) throw a.error;
  S.colabs = c.data; S.turnos = t.data; S.admins = a.data;
}
function paintBrand() { $('#brName').textContent = CFG.empresa.nombre || 'Cashless Colombia'; $('#brNit').textContent = CFG.empresa.nit ? 'NIT ' + CFG.empresa.nit : ''; }
function buildNav() {
  const link = i => modOn(i.mod) ? `<a data-v="${i.id}" class="${S.view === i.id ? 'active' : ''}"><span>${i.ic}</span>${i.t}</a>` : '';
  $('#nav').innerHTML = NAV.map(n => n.g ? (n.items.some(i => modOn(i.mod)) ? `<div class="nav-group">${n.g}</div>` + n.items.map(link).join('') : '') : link(n)).join('');
  $$('#nav a').forEach(a => a.onclick = () => { go(a.dataset.v); $('#sidebar').classList.remove('open'); });
}
function wireTopbar() {
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#btnInstall').onclick = e => { e.preventDefault(); installApp(); };
  $('#tInstall').onclick = installApp;
  $('#helpBtn').onclick = () => modal({ title: 'Ayuda', html: '<p><b>Resumen:</b> estado del día. <b>Colaboradores:</b> altas, edición, tag NFC. <b>Asistencia:</b> marcaciones, turnos. <b>Reportes:</b> PDF/Excel. <b>Configuración:</b> active o desactive módulos, administradores y datos de empresa.</p><p>El checador está en <code>index.html</code> y el portal del colaborador en <code>colaborador.html</code>; los tres usan la misma base de datos.</p>', buttons: [{ t: 'Cerrar', cls: 'primary' }] });
  $('#gSearch').oninput = debounce(e => { const q = e.target.value; if (q.length > 1) { S.q = q; if (S.view !== 'colaboradores') go('colaboradores'); else { const i = $('#cSearch'); if (i) { i.value = q; i.dispatchEvent(new Event('input')); } } } }, 350);
  $('#userChip').onclick = ev => {
    ev.stopPropagation(); const b = $('#userBox'); b.classList.toggle('hidden');
    b.innerHTML = `<div class="it" style="display:block"><b>${h(S.admin.nombre || S.admin.usuario)}</b><small>@${h(S.admin.usuario)}</small></div>
      <div class="it" style="cursor:pointer" id="mPass">🔑 Cambiar mi contraseña</div><div class="it" style="cursor:pointer" id="mOut">⏻ Cerrar sesión</div>`;
    $('#mPass').onclick = () => cambiarPass(S.admin.id); $('#mOut').onclick = () => { localStorage.removeItem('rrhh_admin'); location.reload(); };
  };
  $('#bellBtn').onclick = ev => { ev.stopPropagation(); $('#bellBox').classList.toggle('hidden'); paintBell(); };
  document.addEventListener('click', e => { if (!e.target.closest('.dropdown')) { $('#bellBox').classList.add('hidden'); $('#userBox').classList.add('hidden'); } });
}
async function go(id) {
  const item = NAV.flatMap(n => n.items || [n]).find(i => i.id === id);
  if (!item || !modOn(item.mod)) id = 'resumen';
  S.timers.forEach(clearInterval); S.timers = [];
  S.view = id; location.hash = id; buildNav();
  const el = $('#view'); el.innerHTML = '<div class="empty">Cargando…</div>';
  try { await VIEWS[id](el); }
  catch (e) { console.error(e); el.innerHTML = `<div class="card"><h2>No se pudo cargar</h2><p class="muted">${h(dbErr(e))}</p></div>`; }
}
const pageHead = (t, sub, right = '') => `<div class="page-head row between"><div><h1>${t}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row">${right}</div></div>`;

/* ---------- contraseñas ---------- */
function cambiarPass(adminId, titulo = 'Cambiar contraseña') {
  const m = modal({
    title: titulo, html: `<div class="field"><label>Nueva contraseña</label><input id="np1" type="password" autocomplete="new-password"></div><div class="field"><label>Repetir contraseña</label><input id="np2" type="password" autocomplete="new-password"></div>`,
    buttons: [{ t: 'Cancelar' }, {
      t: 'Guardar', cls: 'primary', fn: async () => {
        const a = $('#np1', m.el).value, b = $('#np2', m.el).value;
        if (a.length < 4) { toast('Mínimo 4 caracteres', 'err'); return false; } if (a !== b) { toast('Las contraseñas no coinciden', 'err'); return false; }
        const { error } = await sb.from('admins').update({ pass_hash: await hashPass(a) }).eq('id', adminId);
        if (error) { toast(dbErr(error), 'err'); return false; } toast('Contraseña actualizada', 'ok');
      }
    }]
  });
}

/* ---------- campana de alertas ---------- */
const BELL = { items: [], seen: new Set(), first: true };
function startBell() { pollBell(); S.bellTimer && clearInterval(S.bellTimer); S.bellTimer = setInterval(pollBell, 7000); }
async function pollBell() {
  const { data, error } = await sb.from('notificaciones').select('*').order('created_at', { ascending: false }).limit(40);
  if (error) return;
  const nuevos = data.filter(n => !n.leida && !BELL.seen.has(n.id));
  data.forEach(n => BELL.seen.add(n.id));
  if (!BELL.first && nuevos.length) { nuevos.slice(0, 3).forEach(n => toast(n.titulo)); beep(); }
  BELL.first = false; BELL.items = data;
  const c = data.filter(n => !n.leida).length; const d = $('#bellDot'); d.textContent = c > 99 ? '99+' : c; d.classList.toggle('hidden', !c);
  if (!$('#bellBox').classList.contains('hidden')) paintBell();
  if (S.view === 'comunicacion' && S.onNewMsg) S.onNewMsg(data);
}
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .35); o.start(); o.stop(a.currentTime + .35); } catch (e) { } }
function paintBell() {
  const b = $('#bellBox');
  b.innerHTML = `<div class="it" style="justify-content:space-between;align-items:center"><b>Alertas</b><button class="btn sm" id="bAll">Marcar todas leídas</button></div>` +
    (BELL.items.length ? BELL.items.map(n => `<div class="it ${n.leida ? '' : 'new'}" data-id="${n.id}" style="cursor:pointer"><div><b style="font-size:13px">${h(n.titulo)}</b><small>${h(n.detalle || '')}</small><small>${fmtDT(n.created_at)}</small></div></div>`).join('') : '<div class="empty">Sin alertas</div>');
  $('#bAll').onclick = async () => { await sb.from('notificaciones').update({ leida: true }).eq('leida', false); pollBell(); };
  $$('.it[data-id]', b).forEach(it => it.onclick = async () => { await sb.from('notificaciones').update({ leida: true }).eq('id', it.dataset.id); pollBell(); });
}

/* =====================================================================
   RESUMEN
   ===================================================================== */
VIEWS.resumen = async el => {
  const hoy = ymd(new Date()), ini7 = ymd(addDays(new Date(), -6)), asis = modOn('asistencia');
  const [marks7, perm] = await Promise.all([asis ? fetchMarcas(null, ini7, hoy) : [], sb.from('permisos').select('id,colaborador_id').eq('estado', 'pendiente')]);
  const act = activos(), marks = marks7.filter(m => m.fecha === hoy), byC = groupBy(marks, 'colaborador_id');
  const presentes = act.filter(c => { const ms = byC[c.id]; return ms && ms[ms.length - 1].tipo === 'ingreso'; });
  const conIngreso = act.filter(c => (byC[c.id] || []).some(m => m.tipo === 'ingreso'));
  const tardes = act.filter(c => { const f = (byC[c.id] || []).find(m => m.tipo === 'ingreso'); return f && f.puntualidad === 'tarde'; });
  const dow = new Date().getDay();
  const esperados = act.filter(c => (turnoById(c.turno_id)?.dias || DEFAULT_TURNO.dias).includes(dow));
  const ausentes = esperados.filter(c => !byC[c.id]);
  const dias7 = Array.from({ length: 7 }, (_, i) => ymd(addDays(new Date(), i - 6)));
  const cnt7 = dias7.map(d => new Set(marks7.filter(m => m.fecha === d && m.tipo === 'ingreso').map(m => m.colaborador_id)).size);
  const max7 = Math.max(1, ...cnt7);
  const porArea = {}; presentes.forEach(c => porArea[c.area || 'Sin área'] = (porArea[c.area || 'Sin área'] || 0) + 1);
  const K = (ic, v, l) => `<div class="card kpi"><div><div class="v">${v}</div><div class="l">${l}</div></div><div class="ic">${ic}</div></div>`;
  el.innerHTML = pageHead('Resumen', `${fmtDateLong(new Date())} · vista general de su equipo`) +
    `<div class="kpis">${K('🧑‍💼', act.length, 'Colaboradores activos')}${asis ? K('🟢', presentes.length, 'Presentes ahora') + K('📥', conIngreso.length, 'Ingresos hoy') + K('⏰', tardes.length, 'Llegadas tarde hoy') + K('🚫', ausentes.length, 'Sin marcar (turno hoy)') : ''}${K('📝', perm.data?.length || 0, 'Permisos pendientes')}</div>` +
    (asis ? `<div class="grid2 mt"><div class="card"><h3>Asistencia últimos 7 días</h3><div style="display:flex;gap:10px;align-items:flex-end;height:150px;margin-top:14px">${cnt7.map((n, i) => `<div style="flex:1;text-align:center"><div style="height:${Math.round(n / max7 * 110)}px;background:linear-gradient(180deg,var(--accent),var(--primary));border-radius:6px 6px 0 0;min-height:3px"></div><b>${n}</b><div class="small muted">${DIAS[parseYmd(dias7[i]).getDay()]} ${dias7[i].slice(8)}</div></div>`).join('')}</div></div>
      <div class="card"><h3>Presentes por área</h3><div style="margin-top:12px;display:grid;gap:10px">${Object.entries(porArea).map(([a, n]) => `<div><div class="row between small"><b>${h(a)}</b><span>${n}</span></div><div class="bar"><i style="width:${n / presentes.length * 100}%"></i></div></div>`).join('') || '<div class="empty">Nadie ha ingresado aún</div>'}</div></div></div>
      <div class="card flush mt"><div style="padding:16px 18px"><h3>Ingresos y salidas de hoy</h3></div><div class="table-wrap"><table><thead><tr><th>Colaborador</th><th>Área</th><th>Tipo</th><th>Hora</th><th>Estado</th><th>Origen</th></tr></thead><tbody>
      ${[...marks].reverse().slice(0, 40).map(m => { const c = colabById(m.colaborador_id); return c ? `<tr><td><div class="person">${avatarHtml(c)}<div><b>${h(nombreCompleto(c))}</b><span>${h(c.cargo || '')}</span></div></div></td><td>${h(c.area || '')}</td><td><span class="badge ${m.tipo === 'ingreso' ? 'green' : 'red'}">${m.tipo === 'ingreso' ? 'Ingreso' : 'Salida'}</span></td><td>${fmtTime(m.ts)}</td><td>${puntBadge(m)}</td><td>${m.origen}</td></tr>` : ''; }).join('') || '<tr><td colspan="6" class="empty">Sin marcaciones hoy</td></tr>'}
      </tbody></table></div></div>` : `<div class="card mt"><p class="muted">El módulo de control de asistencia está deshabilitado. Puede activarlo en <b>Configuración</b>.</p></div>`);
  el.insertAdjacentHTML('beforeend', '<div id="anal"></div>');
  renderAnalitica($('#anal'));
};

/* =====================================================================
   COLABORADORES
   ===================================================================== */
const CONTRATOS = ['Término indefinido', 'Término fijo', 'Obra o labor', 'Aprendizaje', 'Prestación de servicios'];
VIEWS.colaboradores = async el => {
  await loadBase();
  const { data: pend } = await sb.from('permisos').select('*').eq('estado', 'pendiente').order('created_at');
  const pendBy = groupBy(pend || [], 'colaborador_id');
  const adminBy = Object.fromEntries(S.admins.filter(a => a.colaborador_id).map(a => [a.colaborador_id, a]));
  const sinFecha = S.colabs.filter(c => c.estado === 'activo' && !c.fecha_nacimiento).length;
  el.innerHTML = pageHead('Colaboradores', 'Ficha maestra del personal activo e inactivo') +
    (sinFecha ? `<div class="card mb" style="background:#fff8e6;border-color:#f59e0b"><div class="row between"><span>🎂 <b>${sinFecha}</b> colaborador(es) no tienen fecha de nacimiento. Complétela para el calendario y las alertas de cumpleaños.</span><button class="btn sm primary" id="bFN">Completar ahora</button></div></div>` : '') +
    `<div class="row between mb"><input id="cSearch" style="max-width:360px" placeholder="Buscar por nombre, cargo o área…" value="${h(S.q || '')}">
      <div class="row"><button class="btn danger" id="bDelAll">🗑 Borrar todos los registros</button><button class="btn primary" id="bNew">+ Nuevo colaborador</button></div></div>
    <div class="card flush"><div class="table-wrap"><table><thead><tr><th>Colaborador</th><th>Área</th><th>Contrato</th><th>Ingreso</th><th class="num">Salario base</th><th>Tag NFC</th><th>Estado</th><th></th></tr></thead><tbody id="cBody"></tbody></table></div></div>`;
  const paint = () => {
    const q = ($('#cSearch').value || '').toLowerCase(); S.q = '';
    const list = S.colabs.filter(c => !q || `${nombreCompleto(c)} ${c.cargo || ''} ${c.area || ''} ${c.cedula}`.toLowerCase().includes(q));
    $('#cBody').innerHTML = list.map(c => {
      const ad = adminBy[c.id], pe = pendBy[c.id];
      return `<tr><td><div class="person">${avatarHtml(c)}<div><b>${h(nombreCompleto(c))}</b><span>${h(c.cargo || '')} · C.C. ${h(c.cedula)}</span></div></div></td>
      <td>${h(c.area || '')}</td><td>${h(c.tipo_contrato)}</td><td>${fmtDate(c.fecha_ingreso)}</td><td class="num">${money(c.salario)}</td>
      <td><span class="badge ${c.nfc_tag ? 'blue' : ''}">${c.nfc_tag ? 'Asignado' : 'Sin registrar'}</span></td>
      <td><span class="badge ${c.estado === 'activo' ? 'green' : 'red'}">${c.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
      <td><div class="row" style="flex-wrap:nowrap;justify-content:flex-end">
        ${pe ? `<button class="btn sm ok" data-a="perm" data-id="${c.id}">📎 Permiso aceptado…</button>` : ''}
        <button class="btn sm" data-a="ver" data-id="${c.id}">Ver perfil</button><button class="btn sm" data-a="edit" data-id="${c.id}">Editar</button>
        ${ad ? `<button class="btn sm primary" data-a="admin" data-id="${c.id}">🔑 Admin</button>` : `<button class="btn sm" data-a="admin" data-id="${c.id}">Dar acceso admin</button>`}
        <button class="btn sm" data-a="estado" data-id="${c.id}">${c.estado === 'activo' ? 'Inactivar' : 'Activar'}</button>
        <button class="icon-btn" title="Eliminar" data-a="del" data-id="${c.id}">🗑</button></div></td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Sin colaboradores. Cree el primero con “+ Nuevo colaborador”.</td></tr>';
    $$('#cBody [data-a]').forEach(b => b.onclick = () => accionColab(b.dataset.a, colabById(b.dataset.id), { pendBy, adminBy }));
  };
  $('#cSearch').oninput = paint; paint();
  $('#bNew').onclick = () => formColab();
  $('#bFN')?.addEventListener('click', () => { S.bdMes = 'todos'; go('cumpleanos'); });
  $('#bDelAll').onclick = borrarRegistros;
};
async function accionColab(a, c, ctx) {
  if (a === 'edit') return formColab(c);
  if (a === 'ver') return perfilColab(c);
  if (a === 'perm') return revisarPermisos(c, ctx.pendBy[c.id]);
  if (a === 'estado') {
    const { error } = await sb.from('colaboradores').update({ estado: c.estado === 'activo' ? 'inactivo' : 'activo' }).eq('id', c.id);
    if (error) return toast(dbErr(error), 'err'); toast('Estado actualizado', 'ok'); return go('colaboradores');
  }
  if (a === 'del') {
    if (!await confirmDlg(`¿Eliminar a <b>${h(nombreCompleto(c))}</b>? Se borrarán <b>todos sus datos</b> (marcaciones, permisos, nómina, chat, etc.). Esta acción no se puede deshacer.`, 'Eliminar definitivamente')) return;
    const { error } = await sb.from('colaboradores').delete().eq('id', c.id);
    if (error) return toast(dbErr(error), 'err'); toast('Colaborador eliminado', 'ok'); return go('colaboradores');
  }
  if (a === 'admin') {
    const ad = ctx.adminBy[c.id];
    if (ad) {
      const m = modal({ title: `Acceso de administrador · ${h(nombreCompleto(c))}`, html: `<p>Usuario: <b>${h(ad.usuario)}</b></p>`, buttons: [{ t: 'Cerrar' }, { t: 'Restablecer contraseña', fn: () => { cambiarPass(ad.id, 'Nueva contraseña del administrador'); } }, { t: 'Quitar acceso admin', cls: 'danger solid', fn: async () => { if (ad.id === S.admin.id) { toast('No puede quitarse su propio acceso', 'err'); return false; } await sb.from('admins').delete().eq('id', ad.id); toast('Acceso retirado', 'ok'); go('colaboradores'); } }] });
      return;
    }
    return crearAdminDialog({ usuario: c.cedula, nombre: nombreCompleto(c), colaborador_id: c.id }, () => go('colaboradores'));
  }
}
function crearAdminDialog(pre = {}, done) {
  const F = [{ k: 'usuario', l: 'Usuario', req: true }, { k: 'nombre', l: 'Nombre' }, { k: 'pass', l: 'Contraseña', type: 'password', req: true, full: true }];
  const m = modal({
    title: 'Nuevo administrador', html: formHtml(F, pre), buttons: [{ t: 'Cancelar' }, {
      t: 'Crear', cls: 'primary', fn: async () => {
        const v = readForm(m.el, F); if (!v) return false; if (v.pass.length < 4) { toast('Contraseña de mínimo 4 caracteres', 'err'); return false; }
        const { error } = await sb.from('admins').insert({ usuario: v.usuario.toLowerCase(), nombre: v.nombre, pass_hash: await hashPass(v.pass), colaborador_id: pre.colaborador_id || null });
        if (error) { toast(dbErr(error), 'err'); return false; } toast('Administrador creado', 'ok'); done && done();
      }
    }]
  });
}
async function borrarRegistros() {
  const m = modal({
    title: 'Borrar todos los registros de asistencia', html: `<p>Se eliminarán <b>todas las marcaciones</b> de <b>todos</b> los colaboradores. Los colaboradores no se borran.</p><div class="field"><label>Escriba BORRAR para confirmar</label><input id="cf"></div>`,
    buttons: [{ t: 'Cancelar' }, { t: 'Borrar todo', cls: 'danger solid', fn: async () => { if ($('#cf', m.el).value !== 'BORRAR') { toast('Confirmación incorrecta', 'err'); return false; } const { error } = await sb.from('marcaciones').delete().not('id', 'is', null); if (error) { toast(dbErr(error), 'err'); return false; } toast('Registros eliminados', 'ok'); } }]
  });
}

/* ---------- formulario de colaborador ---------- */
const F_COLAB = () => [
  { k: 'cedula', l: 'Cédula', req: true, ph: 'Solo números' }, { k: 'nombres', l: 'Nombres', req: true },
  { k: 'apellidos', l: 'Apellidos' }, { k: 'cargo', l: 'Cargo' }, { k: 'area', l: 'Área' },
  { k: 'tipo_contrato', l: 'Tipo de contrato', type: 'select', opts: CONTRATOS.map(x => [x, x]) },
  { k: 'fecha_nacimiento', l: 'Fecha de nacimiento', type: 'date', max: ymd(new Date()), hint: 'Se usa para el calendario de cumpleaños y la alerta de recordatorio.' },
  { k: 'fecha_ingreso', l: 'Fecha de ingreso', type: 'date', req: true, def: ymd(new Date()) },
  { k: 'salario', l: 'Salario base (COP)', type: 'number', step: 1, def: CFG.params.smmlv, req: true },
  { k: 'estado', l: 'Estado', type: 'select', opts: [['activo', 'Activo'], ['inactivo', 'Inactivo']] },
  { k: 'genero', l: 'Género', type: 'select', opts: [['', 'No indicado'], ['Mujer', 'Mujer'], ['Hombre', 'Hombre'], ['No binario', 'No binario']] },
  { k: 'correo', l: 'Correo', type: 'email' }, { k: 'telefono', l: 'Teléfono' },
  { k: 'rol', l: 'Rol', type: 'select', opts: [['Colaborador', 'Colaborador'], ['Administrador', 'Administrador']], hint: 'Si elige “Administrador” y aún no tiene acceso, al guardar se le pedirá crear su usuario y contraseña.' },
  { k: 'supervisor', l: 'Supervisor' },
  { k: 'turno_id', l: 'Turno / horario', type: 'select', opts: [['', 'Sin turno asignado (horario por defecto 08:00–17:00)'], ...S.turnos.filter(t => t.activo).map(t => [t.id, `${t.nombre} · ${t.tipo === 'partida' ? 'partido' : 'continuo'} ${turnoTxt(t)}`])], full: true, hint: 'Con este horario el sistema calcula si llegó tarde o salió antes de tiempo. ¿No aparece el turno? Créelo en la pestaña “Crear turno”. Si cambia el turno de un colaborador, solo aplica a marcaciones futuras: los registros anteriores conservan el turno con el que se hicieron.' },
  { k: 'riesgo_arl', l: 'Riesgo ARL (1-5)', type: 'select', opts: [1, 2, 3, 4, 5].map(x => [x, 'Clase ' + x]) },
  { k: 'eps', l: 'EPS' }, { k: 'pension', l: 'Fondo de pensión' }, { k: 'caja', l: 'Caja de compensación' }, { k: 'cesantias', l: 'Fondo de cesantías' },
  { k: 'banco', l: 'Banco' }, { k: 'cuenta_bancaria', l: 'Cuenta bancaria' }, { k: 'direccion', l: 'Dirección', full: true },
  { k: 'foto_url', l: 'Foto (enlace de Google Drive)', full: true, hint: 'Comparta la imagen en Drive como “Cualquier persona con el enlace” y pegue el enlace.' }
];
function formColab(c) {
  const F = F_COLAB(); let tag = c?.nfc_tag || '', nfcCtl = null;
  if (!c) F.find(f => f.k === 'fecha_nacimiento').req = true;   // obligatoria al registrar; al editar antiguos no bloquea el guardado
  const m = modal({
    title: c ? `Editar · ${h(nombreCompleto(c))}` : 'Nuevo colaborador', wide: true,
    html: formHtml(F, c || {}) + `<div class="card" style="margin-top:6px;background:#f7f8fd"><label>Tag NFC (marcación de ingreso y salida)</label>
      <div class="row"><button class="btn" id="bNfc" type="button">📡 Asignar tag NFC</button><input id="tagIn" style="max-width:260px" placeholder="UID del tag (o escríbalo)" value="${h(tag)}"><button class="btn sm danger" id="bTagX" type="button">Quitar</button></div>
      <div class="hint" id="nfcMsg">La cédula debe estar diligenciada antes de grabar el tag. Presione el botón una sola vez y acerque el tag al lector NFC del celular; no vuelva a presionar mientras diga “Acerque el tag…”.</div></div>
      <div class="card" style="margin-top:10px;background:#f7f8fd"><label>Reconocimiento facial (ingreso y salida)</label>
      ${c ? `<div class="row"><span class="badge" id="faceSt">Consultando…</span><button class="btn" id="bFace" type="button">🙂 Registrar rostro</button><button class="btn sm danger" id="bFaceX" type="button" style="display:none">Eliminar rostro</button></div>
      <label class="row" style="gap:8px;margin-top:8px;font-weight:400"><input type="checkbox" id="faceOk" style="width:auto"> El colaborador autoriza el tratamiento de su dato biométrico facial para el control de asistencia (Ley 1581 de 2012).</label>
      <div class="hint">Se guardan solo plantillas matemáticas del rostro, no fotografías. Requiere HTTPS y permiso de cámara.</div>` : '<div class="hint">Guarde primero al colaborador; luego edítelo para registrar su rostro.</div>'}</div>`,
    buttons: [{ t: 'Cancelar', fn: () => nfcCtl?.stop() }, {
      t: 'Guardar', cls: 'primary', fn: async () => {
        const v = readForm(m.el, F); if (!v) return false;
        v.cedula = v.cedula.replace(/\D/g, ''); if (!v.cedula) { toast('La cédula debe ser numérica', 'err'); return false; }
        v.turno_id = v.turno_id || null; v.riesgo_arl = Number(v.riesgo_arl) || 1; v.foto_url = v.foto_url || null;
        v.nfc_tag = normTag($('#tagIn', m.el).value) || null;
        if (v.nfc_tag) { const { data: o } = await sb.from('colaboradores').select('id,nombres,apellidos').eq('nfc_tag', v.nfc_tag).neq('id', c?.id || '00000000-0000-0000-0000-000000000000').maybeSingle(); if (o) { toast(`Ese tag ya está asignado a ${nombreCompleto(o)}`, 'err'); return false; } }
        if (c && (c.turno_id || null) !== v.turno_id) {
          const nuevo = turnoById(v.turno_id)?.nombre || 'Sin turno (horario por defecto)', ant = turnoById(c.turno_id)?.nombre || 'Sin turno';
          if (!await confirmDlg(`Va a cambiar el turno de <b>${h(nombreCompleto(c))}</b> de <b>${h(ant)}</b> a <b>${h(nuevo)}</b>.<br><br>El cambio aplica desde la próxima marcación. Los registros anteriores <b>no se modifican</b>: conservan el turno, la hora y la puntualidad con que se hicieron.`, 'Cambiar turno', false)) return false;
        }
        nfcCtl?.stop();
        const res = c ? await sb.from('colaboradores').update(v).eq('id', c.id).select().single() : await sb.from('colaboradores').insert(v).select().single();
        if (res.error) { toast(dbErr(res.error), 'err'); return false; }
        toast('Colaborador guardado', 'ok');
        await loadBase();
        if (v.rol === 'Administrador' && !S.admins.some(a => a.colaborador_id === res.data.id)) crearAdminDialog({ usuario: v.cedula, nombre: nombreCompleto(v), colaborador_id: res.data.id }, () => go('colaboradores'));
        go('colaboradores');
      }
    }]
  });
  if (c) {
    const pintaFace = async () => { const n = await FACE.count(c.id).catch(() => 0), st = $('#faceSt', m.el); if (!st) return; st.className = 'badge ' + (n ? 'green' : 'amber'); st.textContent = n ? `Rostro registrado (${n} muestras)` : 'Sin rostro registrado'; $('#bFaceX', m.el).style.display = n ? '' : 'none'; $('#bFace', m.el).textContent = n ? '🙂 Volver a registrar' : '🙂 Registrar rostro'; };
    pintaFace();
    $('#bFace', m.el).onclick = async () => {
      if (!$('#faceOk', m.el).checked) return toast('Marque la autorización de tratamiento de datos biométricos', 'err');
      try { const n = await FACE.enroll(c.id, S.admin?.usuario); if (n) toast(`Rostro registrado (${n} muestras)`, 'ok'); } catch (e) { toast(errMsg(e), 'err'); }
      pintaFace();
    };
    $('#bFaceX', m.el).onclick = async () => { if (!await confirmDlg('¿Eliminar el rostro registrado de este colaborador?', 'Eliminar')) return; try { await FACE.remove(c.id); toast('Rostro eliminado', 'ok'); } catch (e) { toast(errMsg(e), 'err'); } pintaFace(); };
  }
  let scanning = false;
  $('#bTagX', m.el).onclick = () => { $('#tagIn', m.el).value = ''; };
  $('#bNfc', m.el).onclick = async () => {
    if (scanning) return;                                            // evita doble activación del lector
    const ced = $('#f_cedula', m.el).value.trim(); if (!ced) { toast('Primero diligencie la cédula', 'err'); return; }
    scanning = true; const msg = $('#nfcMsg', m.el); msg.textContent = 'Acerque el tag…';
    try {
      nfcCtl = await nfcScan(async t => {
        if (!scanning) return; scanning = false; nfcCtl.stop();
        $('#tagIn', m.el).value = t;
        const { data: o } = await sb.from('colaboradores').select('nombres,apellidos,id').eq('nfc_tag', t).maybeSingle();
        msg.textContent = o && o.id !== c?.id ? `⚠ Ese tag ya pertenece a ${nombreCompleto(o)}.` : `✔ Tag leído: ${t}`;
      }, e => { msg.textContent = e; });
    } catch (e) { scanning = false; msg.textContent = errMsg(e) + ' También puede escribir el UID manualmente.'; }
  };
}

async function perfilColab(c) {
  const lun = mondayOf(new Date()), hoy = ymd(new Date());
  const [marks, perm, noms] = await Promise.all([fetchMarcas([c.id], ymd(lun), hoy), sb.from('permisos').select('*').eq('colaborador_id', c.id).order('created_at', { ascending: false }).limit(8), sb.from('nominas').select('periodo').eq('colaborador_id', c.id).limit(1)]);
  const t = turnoById(c.turno_id), r = calcHoras(marks, getTurnoHist(marks, t, S.turnos), ymd(lun), hoy, new Date());
  const row = (a, b) => `<div><label>${a}</label><div>${h(b || '—')}</div></div>`;
  const m = modal({
    title: 'Perfil del colaborador', wide: true,
    html: `<div class="row" style="gap:18px;align-items:flex-start">${avatarHtml(c, 'lg')}<div class="grow"><h2>${h(nombreCompleto(c))}</h2><div class="muted">${h(c.cargo || '')} · ${h(c.area || '')}</div>
      <div class="mt"><span class="badge ${c.estado === 'activo' ? 'green' : 'red'}">${c.estado}</span> <span class="badge blue">${h(c.rol)}</span> ${c.nfc_tag ? `<span class="badge blue">NFC ${h(c.nfc_tag)}</span>` : '<span class="badge">Sin tag NFC</span>'}</div></div></div>
      <div class="grid3 mt">${row('Cédula', c.cedula)}${row('Contrato', c.tipo_contrato)}${row('Ingreso', fmtDate(c.fecha_ingreso))}${row('Salario', money(c.salario))}${row('Correo', c.correo)}${row('Teléfono', c.telefono)}${row('Supervisor', c.supervisor)}${row('Turno', t ? `${t.nombre} · ${turnoTxt(t)}` : 'Sin turno')}${row('EPS', c.eps)}${row('Pensión', c.pension)}${row('Caja', c.caja)}${row('Banco / cuenta', `${c.banco || ''} ${c.cuenta_bancaria || ''}`)}</div>
      ${modOn('asistencia') ? `<div class="card mt" style="background:#f7f8fd"><b>Semana actual:</b> ${hm(r.totalMin)} laboradas · ${hm(r.extraMin)} extras · ${r.diasMarcados} días marcados</div>` : ''}
      <h3 class="mt">Permisos recientes</h3>${(perm.data || []).map(p => `<div class="small">• ${p.tipo.replace(/_/g, ' ')} ${fmtDate(p.fecha_inicio)}–${fmtDate(p.fecha_fin)} <span class="badge">${p.estado}</span></div>`).join('') || '<div class="muted small">Sin solicitudes</div>'}`,
    buttons: [{ t: 'Cerrar' }, ...(modOn('certificados') ? [{ t: '📄 Certificado laboral', fn: async () => { await pdfCertificado(c, true); return false; } }] : []), { t: 'Editar', cls: 'primary', fn: () => formColab(c) }]
  });
}

/* ---------- revisión de permisos (doc adjunto) ---------- */
function docPreview(p) {
  if (!p.documento_url) return '<div class="muted small">Sin documento adjunto</div>';
  const isImg = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(p.documento_url);
  return `<div class="mt">${isImg ? `<img src="${h(p.documento_url)}" style="max-width:100%;max-height:300px;border-radius:10px;border:1px solid var(--line)">` : ''}<div><a href="${h(p.documento_url)}" target="_blank" rel="noopener">📎 Ver documento adjunto${p.documento_nombre ? ' (' + h(p.documento_nombre) + ')' : ''}</a></div></div>`;
}
function revisarPermisos(c, lista) {
  const cont = document.createElement('div');
  cont.innerHTML = lista.map(p => `<div class="card" style="margin-bottom:12px" data-p="${p.id}">
    <div class="row between"><b>${h(p.tipo.replace(/_/g, ' '))}</b><span class="badge amber">pendiente</span></div>
    <div class="small muted">${p.tipo === 'ausencia_temporal' ? `${fmtDate(p.fecha_inicio)} · sale a las ${tShort(p.hora_salida)} · ${p.duracion_min} min · ${p.regresa_mismo_dia === false ? 'NO regresa hoy' : 'regresa hoy'}` : `${fmtDate(p.fecha_inicio)} → ${fmtDate(p.fecha_fin)} · ${daysIn(p.fecha_inicio, p.fecha_fin)} día(s)`}</div>
    ${p.tipo === 'ausencia_temporal' ? `<div class="small">${p.marcacion_salida_id ? '<span class="badge green">Salida ya marcada en el checador</span>' : '<span class="badge amber">Aún no marca la salida</span>'} ${p.marcacion_regreso_id ? '<span class="badge green">Regreso marcado</span>' : ''}</div>` : ''}<p>${h(p.motivo || '')}</p>${docPreview(p)}
    <div class="grid2 mt"><div><label>Tratamiento</label><select class="tp"><option value="permiso_remunerado">Permiso remunerado</option><option value="permiso_no_remunerado">Permiso NO remunerado</option><option value="ausencia_temporal">Ausencia temporal</option><option value="incapacidad">Incapacidad (66,67%)</option><option value="licencia">Licencia</option><option value="vacaciones">Vacaciones</option><option value="otro">Otro</option></select></div>
    <div><label>Respuesta al colaborador</label><input class="rs" placeholder="Opcional"></div></div>
    <div class="row mt"><button class="btn ok" data-r="aceptado">Aceptar</button><button class="btn danger" data-r="rechazado">Rechazar</button></div></div>`).join('');
  $$('[data-p]', cont).forEach(card => { const p = lista.find(x => x.id === card.dataset.p); $('.tp', card).value = p.tipo; });
  const m = modal({ title: `Permisos pendientes · ${h(nombreCompleto(c))}`, html: cont, wide: true, buttons: [{ t: 'Cerrar' }] });
  $$('[data-r]', cont).forEach(b => b.onclick = async () => {
    const card = b.closest('[data-p]'), estado = b.dataset.r, resp = $('.rs', card).value.trim();
    const { error } = await sb.from('permisos').update({ estado, tipo: $('.tp', card).value, respuesta: resp || null, resuelto_at: new Date().toISOString() }).eq('id', card.dataset.p);
    if (error) return toast(dbErr(error), 'err');
    await sb.from('mensajes').insert({ colaborador_id: c.id, remitente: 'admin', texto: `Su solicitud de permiso fue ${estado.toUpperCase()}.${resp ? ' ' + resp : ''}` });
    toast('Solicitud ' + estado, 'ok'); m.close(); go('colaboradores');
  });
}

/* =====================================================================
   CONFIGURACIÓN: módulos, empresa, administradores
   ===================================================================== */
const MODS = [
  ['asistencia', '🕒 Control de asistencia', 'Checador NFC/cédula, turnos, marcaciones y cálculo de horas. Si se desactiva, el checador deja de registrar.'],
  ['nomina', '💵 Nómina y parafiscales', 'Liquidación, aportes, provisiones y desprendibles.'],
  ['certificados', '📄 Certificados laborales', 'Generación de certificados (admin y portal del colaborador).'],
  ['documentos', '✍️ Documentos y firma', ''], ['activos', '💻 Activos', ''], ['adelantos', '⚡ Adelantos de sueldo', ''],
  ['objetivos', '🎯 Objetivos', ''], ['reconocimientos', '⭐ Reconocimientos', ''], ['encuestas', '📋 Encuestas', ''], ['beneficios', '🎁 Beneficios', ''],
  ['cumpleanos', '🎂 Cumpleaños', 'Tarjetas de cumpleaños por mes y fecha.'], ['seleccion', '🧑‍💼 Procesos de selección', 'Vacantes, candidatos (enlaces de Drive), entrevistas y contratación. Requiere schema_seleccion.sql.'],
  ['denuncias', '🛡️ Canal de denuncias', ''], ['comunicacion', '💬 Comunicación (chat y comunicados)', ''], ['parametros', '⚖️ Parámetros legales', '']
];
VIEWS.config = async el => {
  await loadBase();
  const E = CFG.empresa;
  const FE = [{ k: 'nombre', l: 'Razón social', req: true }, { k: 'nit', l: 'NIT' }, { k: 'ciudad', l: 'Ciudad' }, { k: 'direccion', l: 'Dirección' }, { k: 'telefono', l: 'Teléfono' }, { k: 'correo', l: 'Correo' }, { k: 'representante', l: 'Representante legal' }, { k: 'cargo_rep', l: 'Cargo del firmante' }, { k: 'exonerado_114_1', l: 'Exonerado de salud/SENA/ICBF (art. 114-1 E.T., sociedades)', type: 'checkbox', full: true }];
  el.innerHTML = pageHead('Configuración', 'Active o desactive módulos, edite los datos de la empresa y gestione administradores') +
    `<div class="grid2"><div class="card"><h3>Módulos opcionales</h3><p class="muted small">Los módulos desactivados desaparecen del panel, del portal del colaborador y del checador. Los datos no se borran.</p>
      ${MODS.map(([k, t, d]) => `<div class="pill-toggle"><div><b>${t}</b>${d ? `<div class="small muted">${d}</div>` : ''}</div><label class="switch"><input type="checkbox" data-m="${k}" ${modOn(k) ? 'checked' : ''}><span></span></label></div>`).join('')}</div>
    <div style="display:grid;gap:16px;align-content:start"><div class="card"><h3>Datos de la empresa</h3><div class="mt" id="fEmp">${formHtml(FE, E)}</div><button class="btn primary" id="sEmp">Guardar empresa</button></div>
    <div class="card"><div class="row between"><h3>Administradores</h3><button class="btn primary sm" id="nAdm">+ Nuevo administrador</button></div>
      <table class="mt"><tbody>${S.admins.map(a => `<tr><td><b>${h(a.nombre || a.usuario)}</b><div class="small muted">@${h(a.usuario)}${a.colaborador_id ? ' · colaborador' : ''}</div></td><td class="right"><button class="btn sm" data-pw="${a.id}">Contraseña</button> <button class="btn sm danger" data-del="${a.id}">Eliminar</button></td></tr>`).join('')}</tbody></table>
      <p class="hint">Contraseña inicial del administrador principal: <b>1234</b> — cámbiela desde aquí o desde el menú de usuario.</p></div></div></div>`;
  $$('[data-m]', el).forEach(i => i.onchange = async () => {
    try { await saveConfig('modulos', { ...CFG.modulos, [i.dataset.m]: i.checked }); buildNav(); toast(i.checked ? 'Módulo activado' : 'Módulo desactivado', 'ok'); } catch (e) { toast(dbErr(e), 'err'); i.checked = !i.checked; }
  });
  $('#sEmp').onclick = async () => { const v = readForm($('#fEmp'), FE); if (!v) return; try { await saveConfig('empresa', { ...CFG.empresa, ...v }); paintBrand(); toast('Empresa guardada', 'ok'); } catch (e) { toast(dbErr(e), 'err'); } };
  $('#nAdm').onclick = () => crearAdminDialog({}, () => go('config'));
  $$('[data-pw]', el).forEach(b => b.onclick = () => cambiarPass(b.dataset.pw, 'Cambiar contraseña del administrador'));
  $$('[data-del]', el).forEach(b => b.onclick = async () => {
    if (b.dataset.del === S.admin.id) return toast('No puede eliminarse a sí mismo', 'err');
    if (S.admins.length < 2) return toast('Debe existir al menos un administrador', 'err');
    if (!await confirmDlg('¿Eliminar este administrador?')) return;
    const { error } = await sb.from('admins').delete().eq('id', b.dataset.del); if (error) return toast(dbErr(error), 'err'); go('config');
  });
};
