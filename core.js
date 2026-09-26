/* =====================================================================
   CASHLESS COLOMBIA · RRHH — núcleo compartido (admin, colaborador, checador)
   ===================================================================== */
const SUPABASE_URL = 'https://drwjqyymljkzqqahqqfr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyd2pxeXltbGprenFxYWhxcWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNTUzNTgsImV4cCI6MjEwNTgzMTM1OH0.j-OvrlVVXSxwc237pSW1bll0ntWrHKCzWuqoWZn589Y';
const PASS_SALT = 'cashless-rrhh';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- utilidades DOM ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const money = n => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function toast(msg, kind = '') {
  let w = $('.toast-wrap');
  if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; document.body.appendChild(w); }
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; w.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

/** modal({title, html, buttons:[{t,cls,fn}], wide}) → {el, body, close}. fn puede devolver false para no cerrar. */
function modal({ title, html = '', buttons = [], wide = false }) {
  const back = document.createElement('div'); back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><div class="modal-head"><h2>${title || ''}</h2><button class="icon-btn" data-x>✕</button></div><div class="modal-body"></div><div class="modal-foot"></div></div>`;
  const body = $('.modal-body', back), foot = $('.modal-foot', back);
  if (typeof html === 'string') body.innerHTML = html; else body.appendChild(html);
  const m = { el: back, body, close: () => back.remove() };
  $('[data-x]', back).onclick = m.close;
  buttons.forEach(b => {
    const bt = document.createElement('button'); bt.className = 'btn ' + (b.cls || ''); bt.textContent = b.t;
    bt.onclick = async () => { bt.disabled = true; try { const r = b.fn ? await b.fn(m) : undefined; if (r !== false) m.close(); } finally { bt.disabled = false; } };
    foot.appendChild(bt);
  });
  if (!buttons.length) foot.remove();
  document.body.appendChild(back);
  return m;
}
const confirmDlg = (msg, ok = 'Confirmar', danger = true) => new Promise(res => {
  modal({ title: 'Confirmar', html: `<p>${msg}</p>`, buttons: [{ t: 'Cancelar', fn: () => res(false) }, { t: ok, cls: danger ? 'danger solid' : 'primary', fn: () => res(true) }] });
});

/* ---------- hash de contraseñas ---------- */
function sha256js(ascii) { // respaldo cuando crypto.subtle no está disponible
  const rr = (v, a) => (v >>> a) | (v << (32 - a));
  const K = [], H = [];
  let p = 0, c = {};
  for (let cand = 2; p < 64; cand++) if (!c[cand]) { for (let i = 0; i < 313; i += cand) c[i] = cand; H[p] = (Math.pow(cand, .5) * 4294967296) | 0; K[p++] = (Math.pow(cand, 1 / 3) * 4294967296) | 0; }
  const bytes = unescape(encodeURIComponent(ascii)); let len = bytes.length * 8; const w = [];
  let s = bytes + '\x80'; while (s.length % 64 - 56) s += '\x00';
  for (let i = 0; i < s.length; i++) w[i >> 2] |= s.charCodeAt(i) << ((3 - i) % 4) * 8;
  w[w.length] = Math.floor(len / 4294967296); w[w.length] = len | 0;
  let hh = H.slice(0, 8);
  for (let j = 0; j < w.length;) {
    const wk = w.slice(j, j += 16), old = hh.slice(0); hh = hh.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = wk[i - 15], w2 = wk[i - 2], a = hh[0], e = hh[4];
      const t1 = hh[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hh[5]) ^ (~e & hh[6])) + K[i] +
        (wk[i] = i < 16 ? wk[i] : (wk[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + wk[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hh[1]) ^ (a & hh[2]) ^ (hh[1] & hh[2]));
      hh = [(t1 + t2) | 0].concat(hh); hh[4] = (hh[4] + t1) | 0; hh.length = 8;
    }
    for (let i = 0; i < 8; i++) hh[i] = (hh[i] + old[i]) | 0;
  }
  let out = ''; for (let i = 0; i < 8; i++) for (let j = 3; j + 1; j--) { const b = (hh[i] >> (j * 8)) & 255; out += (b < 16 ? 0 : '') + b.toString(16); }
  return out;
}
async function hashPass(pw) {
  const txt = PASS_SALT + ':' + pw;
  try {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* usa respaldo */ }
  return sha256js(txt);
}

/* ---------- fechas ---------- */
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const w = x.getDay(); x.setDate(x.getDate() - (w === 0 ? 6 : w - 1)); return x; };
const fmtDate = s => { const d = typeof s === 'string' ? parseYmd(s) : s; return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const fmtDateLong = s => { const d = typeof s === 'string' ? parseYmd(s) : s; return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
const fmtDT = ts => ts ? new Date(ts).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const hm = min => { min = Math.round(min || 0); return `${Math.floor(min / 60)}h ${pad(min % 60)}m`; };
const dec = min => (Math.round((min || 0) / 60 * 100) / 100).toFixed(2);
const tMin = t => { if (!t) return null; const [a, b] = String(t).split(':').map(Number); return a * 60 + b; };   // 'HH:MM' → minutos
const tAt = (fecha, t) => { const [a, b] = String(t).split(':').map(Number); const d = parseYmd(fecha); d.setHours(a, b, 0, 0); return d; };
const tShort = t => String(t || '').slice(0, 5);
const daysIn = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5) + 1;

/* ---------- enlaces de Google Drive ---------- */
function driveUrl(link) {
  if (!link) return '';
  link = link.trim();
  const m = link.match(/\/d\/([\w-]{10,})/) || link.match(/[?&]id=([\w-]{10,})/);
  if (/drive\.google\.com|docs\.google\.com/.test(link) && m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w600`;
  return link;
}
const initials = c => ((c.nombres || '?')[0] + ((c.apellidos || '')[0] || '')).toUpperCase();
function avatarHtml(c, cls = '') {
  const u = driveUrl(c.foto_url);
  return `<div class="avatar ${cls}">${u ? `<img src="${h(u)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.textContent='${h(initials(c))}'">` : h(initials(c))}</div>`;
}
const nombreCompleto = c => `${c.nombres || ''} ${c.apellidos || ''}`.trim();

/* ---------- configuración / parámetros ---------- */
const DEFAULT_MODULOS = { asistencia: true, nomina: true, certificados: true, documentos: true, activos: true, adelantos: true, objetivos: true, reconocimientos: true, encuestas: true, beneficios: true, denuncias: true, comunicacion: true, parametros: true };
const DEFAULT_PARAMS = { smmlv: 1750905, aux_transporte: 249095, recargo_nocturno: .35, extra_diurna: .25, extra_nocturna: .75, hora_nocturna_inicio: 19, hora_nocturna_fin: 6, salud_empleado: .04, pension_empleado: .04, salud_empleador: .085, pension_empleador: .12, caja: .04, sena: .02, icbf: .03, cesantias: .0833, int_cesantias: .01, prima: .0833, vacaciones: .0417, tolerancia_min: 5, horas_mes_override: null };
const DEFAULT_EMPRESA = { nombre: 'Cashless Colombia S.A.S.', nit: '', direccion: '', ciudad: 'Bogotá D.C.', telefono: '', correo: '', representante: 'Representante Legal', cargo_rep: 'Gerente de Talento Humano', exonerado_114_1: true };
const DEFAULT_TURNO = { id: null, nombre: 'Horario por defecto', tipo: 'partida', hora_inicio: '08:00', hora_fin: '17:00', almuerzo_inicio: '12:00', almuerzo_fin: '13:00', tolerancia_min: 5, dias: [1, 2, 3, 4, 5] };
const CFG = { modulos: { ...DEFAULT_MODULOS }, params: { ...DEFAULT_PARAMS }, empresa: { ...DEFAULT_EMPRESA } };
async function loadConfig() {
  const { data, error } = await sb.from('config').select('*');
  if (error) throw error;
  (data || []).forEach(r => { if (CFG[r.clave]) CFG[r.clave] = { ...CFG[r.clave], ...r.valor }; });
  return CFG;
}
async function saveConfig(clave, valor) {
  CFG[clave] = valor;
  const { error } = await sb.from('config').upsert({ clave, valor, updated_at: new Date().toISOString() });
  if (error) throw error;
}
async function notify(tipo, titulo, detalle, colaborador_id) {
  await sb.from('notificaciones').insert({ tipo, titulo, detalle, colaborador_id: colaborador_id || null });
}
async function uploadDoc(file, carpeta) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${carpeta}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await sb.storage.from('documentos').upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return sb.storage.from('documentos').getPublicUrl(path).data.publicUrl;
}

/* =====================================================================
   NORMATIVA LABORAL COLOMBIANA (vigente a la fecha consultada)
   Fuentes: Ministerio del Trabajo · Ley 2101/2021 (jornada) · Ley 2466/2025 (reforma laboral)
   ===================================================================== */
/** Jornada máxima semanal legal (Ley 2101 de 2021, reducción gradual) */
function jornadaSemanal(fecha) {
  const d = typeof fecha === 'string' ? parseYmd(fecha) : fecha;
  const t = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  if (t >= 20260715) return 42;
  if (t >= 20250715) return 44;
  if (t >= 20240715) return 46;
  if (t >= 20230715) return 47;
  return 48;
}
/** Recargo dominical/festivo (Ley 2466 de 2025, art. 14): 75% → 80% (jul-2025) → 90% (jul-2026) → 100% (jul-2027) */
function recDominical(fecha) {
  const d = typeof fecha === 'string' ? parseYmd(fecha) : fecha;
  const t = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  if (t >= 20270701) return 1.00;
  if (t >= 20260701) return .90;
  if (t >= 20250701) return .80;
  return .75;
}
/** Horas mensuales de referencia = (jornada semanal / 6) × 30 */
const horasMes = (fecha, P = CFG.params) => Number(P.horas_mes_override) || (jornadaSemanal(fecha) / 6) * 30;

const _festCache = {};
function festivos(y) {
  if (_festCache[y]) return _festCache[y];
  const S = new Set(); const add = d => S.add(ymd(d));
  const nextMon = d => { const w = d.getDay(); return addDays(d, (8 - w) % 7); };
  [[0, 1], [4, 1], [6, 20], [7, 7], [11, 8], [11, 25]].forEach(([m, d]) => add(new Date(y, m, d)));       // fijos
  [[0, 6], [2, 19], [5, 29], [7, 15], [9, 12], [10, 1], [10, 11]].forEach(([m, d]) => add(nextMon(new Date(y, m, d)))); // Ley Emiliani
  // Pascua (algoritmo gregoriano anónimo)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const mes = Math.floor((hh + l - 7 * m + 114) / 31), dia = ((hh + l - 7 * m + 114) % 31) + 1;
  const pascua = new Date(y, mes - 1, dia);
  add(addDays(pascua, -3)); add(addDays(pascua, -2));                               // Jueves y Viernes Santo
  add(addDays(pascua, 43)); add(addDays(pascua, 64)); add(addDays(pascua, 71));     // Ascensión, Corpus, Sagrado Corazón
  return (_festCache[y] = S);
}
const esFestivo = d => festivos(d.getFullYear()).has(ymd(d));
const esDomFest = d => d.getDay() === 0 || esFestivo(d);
const listaFestivos = y => [...festivos(y)].sort();

/* ---------- turnos ---------- */
function turnoMinutos(t) { // minutos ordinarios programados por día
  t = t || DEFAULT_TURNO;
  let a = tMin(t.hora_inicio), b = tMin(t.hora_fin); if (b <= a) b += 1440;
  let m = b - a;
  if (t.tipo === 'partida' && t.almuerzo_inicio && t.almuerzo_fin) m -= Math.max(0, tMin(t.almuerzo_fin) - tMin(t.almuerzo_inicio));
  return m;
}
/** Copia inmutable del turno que se guarda en cada marcación (el historial no cambia si luego se edita o cambia el turno) */
const snapTurno = t => {
  t = t || DEFAULT_TURNO; const s = x => x ? String(x).slice(0, 5) : null;
  return { id: t.id || null, nombre: t.nombre, tipo: t.tipo, hora_inicio: s(t.hora_inicio), hora_fin: s(t.hora_fin), almuerzo_inicio: s(t.almuerzo_inicio), almuerzo_fin: s(t.almuerzo_fin), tolerancia_min: t.tolerancia_min ?? 5, dias: t.dias || [1, 2, 3, 4, 5] };
};
/** Resuelve el turno de cada fecha con el que quedó guardado en sus marcaciones; si no hay copia usa el turno actual */
function getTurnoHist(marks, actual, turnos = []) {
  const by = {};
  for (const m of marks) { if (by[m.fecha]) continue; const t = m.turno || (m.turno_id && turnos.find(x => x.id === m.turno_id)); if (t) by[m.fecha] = t; }
  return f => by[f] || actual || null;
}
const turnoTxt = t => !t ? 'Sin turno (08:00–17:00)' : t.tipo === 'partida' ? `${tShort(t.hora_inicio)}–${tShort(t.almuerzo_inicio)} / ${tShort(t.almuerzo_fin)}–${tShort(t.hora_fin)}` : `${tShort(t.hora_inicio)}–${tShort(t.hora_fin)}`;

/** Clasifica ingreso/salida frente al turno con tolerancia. Devuelve {puntualidad, diff_min} */
function evaluarPuntualidad(tipo, ts, esperada, tol) {
  const diff = Math.round((new Date(ts) - esperada) / 60000);
  let p = 'a_tiempo';
  if (diff > tol) p = 'tarde'; else if (diff < -tol) p = 'temprano';
  return { puntualidad: p, diff_min: diff };
}
const PUNT_LABEL = {
  ingreso: { temprano: 'Llegó temprano', a_tiempo: 'A tiempo', tarde: 'Llegó tarde' },
  salida: { temprano: 'Salida anticipada', a_tiempo: 'A tiempo', tarde: 'Salió después' }
};
const PUNT_CLS = { temprano: 'blue', a_tiempo: 'green', tarde: 'red' };
function puntBadge(m) {
  if (!m || !m.puntualidad) return '<span class="muted">—</span>';
  const cls = m.tipo === 'salida' && m.puntualidad === 'tarde' ? 'amber' : m.tipo === 'salida' && m.puntualidad === 'temprano' ? 'red' : PUNT_CLS[m.puntualidad];
  const d = m.diff_min; const extra = d && m.puntualidad !== 'a_tiempo' ? ` (${d > 0 ? '+' : ''}${d} min)` : '';
  return `<span class="badge ${cls}">${PUNT_LABEL[m.tipo][m.puntualidad]}${extra}</span>`;
}

/* =====================================================================
   MOTOR DE HORAS
   marks: marcaciones de UN colaborador, con turno resuelto por getTurno(fecha)
   Devuelve por día los minutos por categoría:
     OD  ordinaria diurna            ON  recargo nocturno (ordinaria nocturna)
     ODF ordinaria dominical/fest.   ONF nocturna dominical/festiva
     ED  extra diurna                EN  extra nocturna
     EDF extra diurna dom/fest.      ENF extra nocturna dom/fest.
   ===================================================================== */
const CATS = ['OD', 'ON', 'ODF', 'ONF', 'ED', 'EN', 'EDF', 'ENF'];
const CAT_LABEL = { OD: 'Ordinarias diurnas', ON: 'Recargo nocturno', ODF: 'Dominical/festivo diurno', ONF: 'Dominical/festivo nocturno', ED: 'Extra diurna', EN: 'Extra nocturna', EDF: 'Extra diurna dom/fest', ENF: 'Extra nocturna dom/fest' };
const emptyCats = () => Object.fromEntries(CATS.map(c => [c, 0]));

function buildSegments(marks, getTurno, ahora) {
  const sorted = [...marks].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const raw = []; let open = null;
  for (const m of sorted) {
    if (m.tipo === 'ingreso') { if (!open) open = m; }
    else if (open) { raw.push({ ini: new Date(open.ts), fin: new Date(m.ts), fecha: open.fecha, abierta: false }); open = null; }
  }
  if (open) raw.push({ ini: new Date(open.ts), fin: (ahora && open.fecha === ymd(ahora)) ? new Date(ahora) : null, fecha: open.fecha, abierta: true });
  const segs = [];
  for (const r of raw) {
    if (!r.fin) { segs.push({ ...r, sinSalida: true, fin: r.ini }); continue; }
    const t = getTurno(r.fecha) || DEFAULT_TURNO;
    let ini = r.ini;
    const prog = tAt(r.fecha, t.hora_inicio);
    if (ini < prog && (prog - ini) < 12 * 3600e3) ini = prog;          // llegada anticipada no se cuenta como tiempo laborado
    if (r.fin <= ini) { segs.push({ ...r, ini, fin: ini }); continue; }
    if (t.tipo === 'partida' && t.almuerzo_inicio && t.almuerzo_fin) {   // no salió a almorzar → se asume salida y regreso
      const ls = tAt(r.fecha, t.almuerzo_inicio), le = tAt(r.fecha, t.almuerzo_fin);
      if (ini <= ls && r.fin >= le) { segs.push({ ...r, ini, fin: ls, fecha: r.fecha }); segs.push({ ...r, ini: le, fin: r.fin, fecha: r.fecha }); continue; }
    }
    segs.push({ ...r, ini });
  }
  return segs;
}

/** Devuelve {dias:{fecha:{min:{cats},total,ini,fin,abierta,sinSalida,marcas}}, totales} solo para fechas en [desde,hasta] */
function calcHoras(marks, getTurno, desde, hasta, ahora, P = CFG.params) {
  const segs = buildSegments(marks, getTurno, ahora);
  const nIni = P.hora_nocturna_inicio ?? 19, nFin = P.hora_nocturna_fin ?? 6;
  const dias = {}; const ordDia = {}, ordSem = {};
  segs.sort((a, b) => a.ini - b.ini);
  for (const s of segs) {
    const f = s.fecha; const d = dias[f] || (dias[f] = { fecha: f, min: emptyCats(), total: 0, ini: null, fin: null, abierta: false, sinSalida: false });
    if (s.sinSalida) { d.sinSalida = true; continue; }
    if (!d.ini || s.ini < d.ini) d.ini = s.ini; if (!d.fin || s.fin > d.fin) d.fin = s.fin; if (s.abierta) d.abierta = true;
    const t = getTurno(f) || DEFAULT_TURNO;
    const limDia = turnoMinutos(t);
    const wk = ymd(mondayOf(parseYmd(f))); const limSem = jornadaSemanal(f) * 60;
    for (let ms = s.ini.getTime(); ms < s.fin.getTime(); ms += 60000) {
      const dt = new Date(ms); const hr = dt.getHours();
      const noc = hr >= nIni || hr < nFin; const fes = esDomFest(dt);
      const od = ordDia[f] || 0, os = ordSem[wk] || 0;
      const extra = od >= limDia || os >= limSem;
      if (!extra) { ordDia[f] = od + 1; ordSem[wk] = os + 1; }
      const cat = (extra ? 'E' : 'O') + (noc ? 'N' : 'D') + (fes ? 'F' : '');
      const key = { OD: 'OD', ON: 'ON', ODF: 'ODF', ONF: 'ONF', ED: 'ED', EN: 'EN', EDF: 'EDF', ENF: 'ENF' }[cat];
      d.min[key]++; d.total++;
    }
  }
  const total = emptyCats(); let totalMin = 0, diasMarcados = 0;
  Object.keys(dias).forEach(f => {
    if (f < desde || f > hasta) { delete dias[f]; return; }
    const d = dias[f]; totalMin += d.total; if (d.total > 0 || d.abierta) diasMarcados++;
    CATS.forEach(c => total[c] += d.min[c]);
  });
  const extraMin = total.ED + total.EN + total.EDF + total.ENF;
  return { dias, total, totalMin, extraMin, diasMarcados };
}

/** Valor a pagar de cada categoría (adicional al salario mensual ordinario) */
function factoresCat(fecha, P = CFG.params) {
  const rd = recDominical(fecha), rn = P.recargo_nocturno, ed = P.extra_diurna, en = P.extra_nocturna;
  return {
    OD: 0, ON: rn, ODF: rd, ONF: rd + rn,                         // recargo sobre hora ya cubierta por salario
    ED: 1 + ed, EN: 1 + en, EDF: 1 + rd + ed, ENF: 1 + rd + en   // hora extra completa (valor 100% + recargo)
  };
}
/** Factor TOTAL sobre hora ordinaria (para mostrar en tablas de parámetros) */
function factorTotal(cat, fecha, P = CFG.params) {
  const f = factoresCat(fecha, P); return ['ED', 'EN', 'EDF', 'ENF'].includes(cat) ? f[cat] : 1 + f[cat];
}

/* =====================================================================
   NÓMINA
   ===================================================================== */
function periodoRango(anio, mes, tipo) { // tipo: M | Q1 | Q2  (mes 1-12)
  const last = new Date(anio, mes, 0).getDate();
  const a = tipo === 'Q2' ? 16 : 1, b = tipo === 'Q1' ? 15 : last;
  return { ini: `${anio}-${pad(mes)}-${pad(a)}`, fin: `${anio}-${pad(mes)}-${pad(b)}`, base: tipo === 'M' ? 30 : 15, id: `${anio}-${pad(mes)}-${tipo}` };
}
function fspTasa(ibcMensual, P) {
  const r = ibcMensual / P.smmlv;
  if (r < 4) return 0; if (r < 16) return .01; if (r <= 17) return .012; if (r <= 18) return .014; if (r <= 19) return .016; if (r <= 20) return .018; return .02;
}
const ARL_TASA = { 1: .00522, 2: .01044, 3: .02436, 4: .0435, 5: .0696 };

function calcNomina({ colab, per, horas, permisos = [], adelantos = [], bonif = 0, otrosDesc = 0, P = CFG.params, emp = CFG.empresa }) {
  const sal = Number(colab.salario) || 0, smmlv = P.smmlv, base = per.base;
  const vh = sal / horasMes(per.ini, P);
  // días desde vinculación
  const ing = colab.fecha_ingreso ? colab.fecha_ingreso.slice(0, 10) : per.ini;
  let offset = 0; if (ing > per.ini) offset = Math.min(base, daysIn(per.ini, ing) - 1);
  // novedades
  let dnr = 0, dinc = 0, dlic = 0;
  permisos.filter(p => p.estado === 'aceptado').forEach(p => {
    const a = p.fecha_inicio > per.ini ? p.fecha_inicio : per.ini, b = p.fecha_fin < per.fin ? p.fecha_fin : per.fin;
    if (a > b) return; const n = daysIn(a, b);
    if (p.tipo === 'permiso_no_remunerado') dnr += n; else if (p.tipo === 'incapacidad') dinc += n; else if (p.tipo === 'licencia' || p.tipo === 'vacaciones') dlic += n;
  });
  const diasCont = Math.max(0, base - offset);
  dnr = Math.min(dnr, diasCont); dinc = Math.min(dinc, diasCont - dnr);
  const diasPag = Math.max(0, diasCont - dnr - dinc);
  const diaSal = sal / 30;
  const basico = diaSal * diasPag;
  const incap = dinc ? Math.max(diaSal * dinc * (2 / 3), (smmlv / 30) * dinc) : 0;
  const aux = sal <= 2 * smmlv ? (P.aux_transporte / 30) * diasPag : 0;
  // horas extras y recargos
  const det = []; let extras = 0;
  if (horas) {
    const fx = factoresCat(per.fin, P);
    CATS.forEach(c => { const m = horas.total[c]; if (!m || !fx[c]) return; const v = (m / 60) * vh * fx[c]; extras += v; det.push({ cat: c, min: m, factor: fx[c], valor: v }); });
  }
  const salarial = basico + incap + extras + bonif;
  const devengado = salarial + aux;
  let ibc = Math.min(Math.max(salarial, smmlv * base / 30), 25 * smmlv);
  if (dnr + dinc >= base) ibc = 0;
  const salud = ibc * P.salud_empleado, pension = ibc * P.pension_empleado, fsp = ibc * fspTasa(ibc * 30 / base, P);
  const adel = adelantos.filter(a => a.estado === 'aprobado').reduce((s, a) => s + Number(a.monto), 0);
  const deducciones = salud + pension + fsp + adel + otrosDesc;
  const neto = devengado - deducciones;
  // aportes del empleador
  const exon = emp.exonerado_114_1 && sal < 10 * smmlv;
  const eSalud = exon ? 0 : ibc * P.salud_empleador, ePens = ibc * P.pension_empleador, arl = ibc * (ARL_TASA[colab.riesgo_arl] || ARL_TASA[1]);
  const caja = ibc * P.caja, sena = exon ? 0 : ibc * P.sena, icbf = exon ? 0 : ibc * P.icbf;
  const baseP = salarial + aux;
  const ces = baseP * P.cesantias, ints = baseP * P.int_cesantias, prima = baseP * P.prima, vac = salarial * P.vacaciones;
  const aportes = eSalud + ePens + arl + caja + sena + icbf;
  return {
    periodo: per.id, ini: per.ini, fin: per.fin, base, vh, dias: { pagados: diasPag, incapacidad: dinc, noRemunerado: dnr, licencia: dlic },
    basico, incap, aux, extras, extrasDet: det, bonif, salarial, devengado, ibc,
    salud, pension, fsp, adelantos: adel, otrosDesc, deducciones, neto,
    empleador: { salud: eSalud, pension: ePens, arl, caja, sena, icbf, aportes, exonerado: exon },
    prov: { cesantias: ces, intereses: ints, prima, vacaciones: vac, total: ces + ints + prima + vac },
    costoTotal: devengado + aportes + ces + ints + prima + vac
  };
}

/* ---------- utilidades de datos ---------- */
async function fetchMarcas(colabIds, desde, hasta) {
  let q = sb.from('marcaciones').select('*').gte('fecha', desde).lte('fecha', hasta).order('ts');
  if (colabIds && colabIds.length === 1) q = q.eq('colaborador_id', colabIds[0]);
  else if (colabIds && colabIds.length) q = q.in('colaborador_id', colabIds);
  // paginación (Supabase limita a 1000 filas por consulta)
  const out = []; let from = 0;
  for (; ;) { const { data, error } = await q.range(from, from + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; from += 1000; }
  return out;
}
const groupBy = (arr, k) => arr.reduce((o, x) => ((o[typeof k === 'function' ? k(x) : x[k]] ||= []).push(x), o), {});
const mkGetTurno = (turnos, colab) => { const t = turnos.find(x => x.id === colab.turno_id) || null; return () => t; };
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const normTag = s => String(s || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
/** Lee un tag NFC con Web NFC (Chrome Android). Devuelve {stop()} */
async function nfcScan(onTag, onError) {
  if (!('NDEFReader' in window)) throw new Error('Este dispositivo/navegador no soporta lectura NFC (use Chrome en Android con NFC activo).');
  const ctrl = new AbortController(); const r = new NDEFReader();
  await r.scan({ signal: ctrl.signal });
  r.onreading = e => onTag(normTag(e.serialNumber));
  r.onreadingerror = () => onError && onError('No se pudo leer el tag, intente de nuevo.');
  return { stop: () => ctrl.abort() };
}
const errMsg = e => (e && (e.message || e.error_description)) || String(e);
const isMissingTable = e => e && /relation|does not exist|schema cache|Could not find/i.test(errMsg(e));

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => { });
}
let _deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); _deferredInstall = e; document.dispatchEvent(new Event('installable')); });
async function installApp() {
  if (_deferredInstall) { _deferredInstall.prompt(); await _deferredInstall.userChoice; _deferredInstall = null; }
  else modal({ title: 'Instalar aplicación', html: '<p>En <b>Chrome (Android)</b>: menú ⋮ → <i>Instalar aplicación</i>.<br>En <b>iPhone</b>: Compartir → <i>Añadir a pantalla de inicio</i>.<br>En <b>PC</b>: icono de instalar en la barra de direcciones.</p>', buttons: [{ t: 'Entendido', cls: 'primary' }] });
}
