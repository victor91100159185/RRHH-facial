/* =====================================================================
   ALERTA SONORA DE CUMPLEAÑOS — un día antes, 2 veces al día, con voz
   ===================================================================== */
const BDAY_HORAS = [9, 15];                                   // horas del día en que se repite la alerta
const bdayOn = () => localStorage.getItem('rrhh_bday_alert') !== 'off';
const esBisiesto = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
function cumplenManana() {
  const m = addDays(new Date(), 1), mm = m.getMonth(), dd = m.getDate();
  return activos().filter(c => {
    if (!c.fecha_nacimiento) return false; const n = parseYmd(c.fecha_nacimiento);
    if (n.getMonth() === mm && n.getDate() === dd) return true;
    return n.getMonth() === 1 && n.getDate() === 29 && !esBisiesto(m.getFullYear()) && mm === 1 && dd === 28;   // 29-feb en años no bisiestos
  });
}
let _ac = null;
function sonidoFuerte() {                                      // sirena de 6 pitidos a volumen alto
  return new Promise(res => {
    try {
      _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); if (_ac.state === 'suspended') _ac.resume();
      const t0 = _ac.currentTime + .05;
      for (let i = 0; i < 6; i++) {
        const o = _ac.createOscillator(), g = _ac.createGain(); o.type = 'square'; o.frequency.value = i % 2 ? 988 : 1319;
        o.connect(g); g.connect(_ac.destination); const t = t0 + i * .42;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.55, t + .03); g.gain.setValueAtTime(.55, t + .3); g.gain.linearRampToValueAtTime(0, t + .38);
        o.start(t); o.stop(t + .4);
      }
      setTimeout(res, 2700);
    } catch (e) { res(); }
  });
}
function decir(txt) {
  return new Promise(res => {
    try {
      const u = new SpeechSynthesisUtterance(txt); u.lang = 'es-CO'; u.volume = 1; u.rate = .95; u.pitch = 1;
      const vs = speechSynthesis.getVoices(), v = vs.find(x => /es[-_]CO/i.test(x.lang)) || vs.find(x => /^es/i.test(x.lang)); if (v) u.voice = v;
      u.onend = res; u.onerror = res; speechSynthesis.cancel(); speechSynthesis.speak(u); setTimeout(res, 15000);
    } catch (e) { res(); }
  });
}
async function reproducirCumple(lista) {
  const nombres = lista.map(c => nombreCompleto(c));
  const previo = document.getElementById('bdayBanner'); if (previo) previo.remove();
  const b = document.createElement('div'); b.id = 'bdayBanner';
  b.style.cssText = 'position:sticky;top:0;z-index:40;background:linear-gradient(90deg,#f59e0b,#ec4899);color:#fff;padding:12px 18px;display:flex;gap:12px;align-items:center;justify-content:space-between;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.2)';
  b.innerHTML = `<span>🎂 Recordatorio: mañana cumple años ${nombres.map(h).join(', ')}</span><span style="display:flex;gap:8px"><button class="btn sm" id="bdR">🔊 Repetir</button><button class="btn sm" id="bdX">✕</button></span>`;
  const host = $('.main') || document.body; host.insertBefore(b, host.firstChild);
  $('#bdX').onclick = () => b.remove();
  const sonar = async () => { await sonidoFuerte(); for (const n of nombres) await decir(`Te recuerdo que ${n} cumple años mañana`); };
  $('#bdR').onclick = sonar;
  const bloqueado = navigator.userActivation && !navigator.userActivation.hasBeenActive;
  if (bloqueado) {                                             // el navegador exige un clic antes de permitir audio
    $('#bdR').textContent = '🔊 Clic para escuchar';
    if (window.__bdayFn) document.removeEventListener('pointerdown', window.__bdayFn);   // evita acumular avisos pendientes
    window.__bdayFn = () => sonar(); document.addEventListener('pointerdown', window.__bdayFn, { once: true });
  } else sonar();
}
function chequearCumple(forzar = false) {
  if (!forzar && !bdayOn()) return;
  let lista = cumplenManana();
  if (!lista.length) { if (!forzar) return; lista = activos().filter(c => c.fecha_nacimiento).slice(0, 1); if (!lista.length) return toast('Registre alguna fecha de nacimiento para probar la alerta', 'err'); }
  if (!forzar) {
    const now = new Date(), hr = now.getHours(), pasados = BDAY_HORAS.filter(x => hr >= x); if (!pasados.length) return;
    const slot = pasados[pasados.length - 1], key = 'rrhh_bday_' + ymd(now);
    let hechos = []; try { hechos = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { }
    if (hechos.includes(slot)) return;                          // esta franja ya sonó hoy
    localStorage.setItem(key, JSON.stringify([...new Set([...hechos, ...pasados])]));
    Object.keys(localStorage).filter(k => k.startsWith('rrhh_bday_2') && k !== key).forEach(k => localStorage.removeItem(k));
  }
  reproducirCumple(lista);
}
function iniciarAlertaCumple() {
  try { speechSynthesis.getVoices(); } catch (e) { }
  setTimeout(() => chequearCumple(), 2000); if (S.bdayTimer) clearInterval(S.bdayTimer); S.bdayTimer = setInterval(() => chequearCumple(), 60000);
}
