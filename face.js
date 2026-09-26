/* Reconocimiento facial · @vladmandic/human (corre 100% en el navegador, sin enviar imágenes a ningún servidor)
   - Detección + malla 3D + embedding (faceres) + antispoof + liveness
   - FACE.verify(): identifica al colaborador con anti-suplantación (foto/pantalla) y desafío de giro de cabeza
   - FACE.enroll(): captura guiada de varias plantillas con consentimiento
   Requiere core.js (sb, modal, toast, h, $, CFG) y HTTPS para acceder a la cámara. */
const FACE = (() => {
  const VER = '3.3.6';
  const LIB = `https://cdn.jsdelivr.net/npm/@vladmandic/human@${VER}/dist/human.js`;
  const MODELS = `https://cdn.jsdelivr.net/npm/@vladmandic/human@${VER}/models/`;
  const P = () => ({ umbral: .65, margen: .04, real: .5, live: .5, frames: 3, desafio: true, giro: .3, timeout: 25000, ...(CFG.params.facial || {}) });
  let human = null, loading = null, gallery = null, galleryAt = 0;

  const loadScript = src => new Promise((ok, ko) => { if (window.Human) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar la librería de reconocimiento facial. Verifique la conexión.')); document.head.appendChild(s); });

  async function init(onMsg = () => { }) {
    if (human) return human;
    return loading ||= (async () => {
      onMsg('Cargando modelos de reconocimiento facial…');
      await loadScript(LIB);
      const hu = new Human.Human({
        modelBasePath: MODELS, backend: 'webgl', async: true, warmup: 'none', cacheSensitivity: 0,
        filter: { enabled: true, equalization: false },
        face: {
          enabled: true, detector: { rotation: true, maxDetected: 2, minConfidence: .5 }, mesh: { enabled: true }, iris: { enabled: false },
          description: { enabled: true }, antispoof: { enabled: true }, liveness: { enabled: true }, emotion: { enabled: false }, attention: { enabled: false }
        },
        body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false }
      });
      await hu.load(); await hu.warmup();
      return human = hu;
    })().catch(e => { loading = null; throw e; });
  }

  async function openCam() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara (se requiere HTTPS).');
    try { return await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
    catch (e) { throw new Error(e.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Habilítelo en el navegador.' : 'No se pudo abrir la cámara: ' + errMsg(e)); }
  }

  /** Galería de plantillas (todos los colaboradores). Se cachea 5 min. */
  async function loadGallery(force) {
    if (!force && gallery && Date.now() - galleryAt < 300000) return gallery;
    const { data, error } = await sb.from('rostros').select('colaborador_id,embedding');
    if (error) throw error;
    gallery = (data || []).filter(r => Array.isArray(r.embedding) && r.embedding.length > 100); galleryAt = Date.now();
    return gallery;
  }

  /** Mejor coincidencia por colaborador → {id, sim, segunda} */
  function match(emb) {
    const best = {};
    for (const g of gallery) { const s = human.match.similarity(emb, g.embedding); if (!(g.colaborador_id in best) || s > best[g.colaborador_id]) best[g.colaborador_id] = s; }
    const r = Object.entries(best).sort((a, b) => b[1] - a[1]);
    return r.length ? { id: r[0][0], sim: r[0][1], segunda: r[1] ? r[1][1] : 0 } : { id: null, sim: 0, segunda: 0 };
  }

  /** Calidad mínima de un fotograma: un solo rostro, grande, centrado y nítido. */
  function calidad(res, vw, vh) {
    const f = res.face || [];
    if (!f.length) return { ok: false, msg: 'Acérquese y mire a la cámara' };
    if (f.length > 1) return { ok: false, msg: 'Debe haber una sola persona frente a la cámara' };
    const r = f[0], [x, y, w, hh] = r.box;
    if (!r.embedding || (r.faceScore ?? 0) < .7) return { ok: false, msg: 'Mejore la iluminación y mire de frente' };
    if (w < vw * .2 || hh < vh * .25) return { ok: false, msg: 'Acérquese un poco más' };
    if (w > vw * .8) return { ok: false, msg: 'Aléjese un poco' };
    const cx = x + w / 2, cy = y + hh / 2;
    if (Math.abs(cx - vw / 2) > vw * .25 || Math.abs(cy - vh / 2) > vh * .3) return { ok: false, msg: 'Centre su rostro en el óvalo' };
    return { ok: true, f: r };
  }

  const CSS = `<style>
    .fc-wrap{position:relative;width:100%;max-width:520px;margin:0 auto;border-radius:20px;overflow:hidden;background:#000;aspect-ratio:4/3}
    .fc-wrap video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
    .fc-oval{position:absolute;inset:8% 22%;border:4px solid rgba(255,255,255,.8);border-radius:50%;box-shadow:0 0 0 999px rgba(0,0,0,.45);transition:.2s}
    .fc-wrap.ok .fc-oval{border-color:#22c55e}.fc-wrap.bad .fc-oval{border-color:#ef4444}
    .fc-msg{text-align:center;font-weight:700;margin-top:12px;min-height:24px}
    .fc-bar{height:8px;border-radius:99px;background:#e5e9f7;margin-top:10px;overflow:hidden}.fc-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#2563eb,#7c3aed);transition:.2s}
  </style>`;
  const camHtml = `${CSS}<div class="fc-wrap" id="fcW"><video id="fcV" playsinline muted autoplay></video><div class="fc-oval"></div></div><div class="fc-msg" id="fcM">Iniciando cámara…</div><div class="fc-bar"><i id="fcB"></i></div>`;

  /** Abre el modal con cámara. run(ctx) hace el trabajo. */
  async function session({ title, run, extra = '' }) {
    let stream = null, cancelled = false;
    const m = modal({ title, html: camHtml + extra, buttons: [{ t: 'Cancelar', fn: () => { cancelled = true; } }] });
    const origClose = m.close; m.close = () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()); origClose(); };
    $('[data-x]', m.el).onclick = m.close;
    const msg = t => { const e = $('#fcM', m.el); if (e) e.textContent = t; }, bar = p => { const e = $('#fcB', m.el); if (e) e.style.width = Math.round(p * 100) + '%'; }, state = s => { const w = $('#fcW', m.el); if (w) w.className = 'fc-wrap ' + (s || ''); };
    try {
      await init(msg); if (cancelled) return null;
      stream = await openCam(); if (cancelled) { stream.getTracks().forEach(t => t.stop()); return null; }
      const v = $('#fcV', m.el); v.srcObject = stream; await v.play().catch(() => { });
      const out = await run({ m, video: v, msg, bar, state, isOpen: () => !cancelled && document.body.contains(m.el) });
      return out;
    } catch (e) { msg(errMsg(e)); state('bad'); throw e; }
    finally { stream?.getTracks().forEach(t => t.stop()); if (document.body.contains(m.el)) m.close(); }
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /** VERIFICACIÓN: devuelve {colaborador_id, similitud} o lanza Error. */
  async function verify() {
    const p = P(); await loadGallery(true);
    if (!gallery.length) throw new Error('No hay rostros registrados. Registre el rostro en Administración → Colaboradores.');
    const r = await session({
      title: 'Reconocimiento facial', run: async ({ video, msg, bar, state, isOpen }) => {
        let cand = null, streak = 0, yawMin = 9, yawMax = -9, giroOk = !p.desafio, simSum = 0, spoof = 0;
        const t0 = Date.now(); msg('Mire a la cámara');
        while (isOpen() && Date.now() - t0 < p.timeout) {
          if (!video.videoWidth) { await sleep(100); continue; }
          const res = await human.detect(video), q = calidad(res, video.videoWidth, video.videoHeight);
          if (!q.ok) { state(''); msg(q.msg); streak = 0; cand = null; await sleep(80); continue; }
          const f = q.f, mt = match(f.embedding);
          const conocido = mt.id && mt.sim >= p.umbral && (mt.sim - mt.segunda) >= p.margen;
          if (!conocido) { state('bad'); msg('Rostro no reconocido…'); streak = 0; cand = null; await sleep(120); continue; }
          if ((f.real ?? 1) < p.real || (f.live ?? 1) < p.live) { state('bad'); msg('No se detecta una persona real. Sin fotos ni pantallas.'); if (++spoof > 8) throw new Error('Posible suplantación detectada (foto o pantalla).'); streak = 0; await sleep(120); continue; }
          if (cand !== mt.id) { cand = mt.id; streak = 0; yawMin = 9; yawMax = -9; giroOk = !p.desafio; simSum = 0; }
          streak++; simSum += mt.sim; state('ok');
          const yaw = f.rotation?.angle?.yaw ?? 0; yawMin = Math.min(yawMin, yaw); yawMax = Math.max(yawMax, yaw);
          if (p.desafio && !giroOk && (yawMax - yawMin) >= p.giro) giroOk = true;
          if (p.desafio && !giroOk) { msg('✔ Reconocido · gire lentamente la cabeza hacia un lado y vuelva al centro'); bar(Math.min(.6, (yawMax - yawMin) / p.giro * .6)); }
          else if (p.desafio && Math.abs(yaw) > .18) { msg('Vuelva a mirar al frente'); bar(.75); }
          else if (streak >= p.frames) { bar(1); return { colaborador_id: cand, similitud: simSum / streak }; }
          else { msg('Verificando…'); bar(.75 + streak / p.frames * .2); }
          await sleep(60);
        }
        if (!isOpen()) return null;
        throw new Error('No fue posible verificar su identidad. Intente de nuevo o use el tag / cédula.');
      }
    });
    return r;
  }

  /** ENROLAMIENTO: captura N plantillas. Devuelve {plantillas:[{embedding,calidad}]} */
  async function enroll(colabId, quien, N = 5) {
    await loadGallery(true);
    const p = P(), ok = [];
    const r = await session({
      title: 'Registrar rostro', run: async ({ video, msg, bar, state, isOpen }) => {
        const pasos = ['de frente', 'de frente, sonría un poco', 'girando levemente a la izquierda', 'girando levemente a la derecha', 'de frente, sin lentes ni gorra'];
        let last = 0; const t0 = Date.now();
        while (isOpen() && ok.length < N && Date.now() - t0 < 90000) {
          msg(`Muestra ${ok.length + 1} de ${N}: mire ${pasos[ok.length] || 'de frente'}`);
          if (!video.videoWidth) { await sleep(100); continue; }
          const res = await human.detect(video), q = calidad(res, video.videoWidth, video.videoHeight);
          if (!q.ok) { state(''); msg(q.msg); await sleep(100); continue; }
          const f = q.f;
          if ((f.real ?? 1) < p.real || (f.live ?? 1) < p.live) { state('bad'); msg('No se detecta una persona real'); await sleep(150); continue; }
          const yaw = Math.abs(f.rotation?.angle?.yaw ?? 0);
          if (ok.length < 2 && yaw > .3) { msg('Mire de frente a la cámara'); await sleep(100); continue; }
          if (Date.now() - last < 900) { await sleep(60); continue; }
          const otro = gallery.find(g => g.colaborador_id !== colabId && human.match.similarity(f.embedding, g.embedding) >= p.umbral);
          if (otro) throw new Error('Este rostro ya está registrado para otro colaborador.');
          state('ok'); ok.push({ embedding: Array.from(f.embedding), calidad: +(f.faceScore ?? 0).toFixed(3) }); last = Date.now(); bar(ok.length / N);
        }
        if (!isOpen()) return null;
        if (ok.length < N) throw new Error('No se completó la captura. Intente de nuevo con mejor iluminación.');
        return { plantillas: ok };
      }
    });
    if (!r) return null;
    await sb.from('rostros').delete().eq('colaborador_id', colabId);
    const { error } = await sb.from('rostros').insert(r.plantillas.map(t => ({ colaborador_id: colabId, embedding: t.embedding, calidad: t.calidad, registrado_por: quien || null })));
    if (error) throw error;
    gallery = null; return r.plantillas.length;
  }

  const count = async colabId => { const { count: n } = await sb.from('rostros').select('id', { count: 'exact', head: true }).eq('colaborador_id', colabId); return n || 0; };
  const remove = async colabId => { const { error } = await sb.from('rostros').delete().eq('colaborador_id', colabId); if (error) throw error; gallery = null; };
  const hasAny = async () => { try { return (await loadGallery()).length > 0; } catch (e) { return false; } };

  return { verify, enroll, count, remove, hasAny, init };
})();
