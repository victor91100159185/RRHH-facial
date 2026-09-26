/* Service Worker - Cashless Colombia RRHH
   - Archivos de la app: red primero, cache como respaldo (siempre la ultima version)
   - Librerias CDN y fuentes: cache primero
   - Supabase (API/Storage): nunca se cachea */
const VERSION = 'rrhh-v1.4.0';
const SHELL = ['./', './index.html', './admin.html', './colaborador.html', './manifest.json',
  './app.css', './core.js', './face.js', './docs.js', './admin.js', './asistencia.js', './modulos.js', './analitica.js', './organigrama.js', './cumpleanos.js', './alertas.js', './seleccion.js', './portal.js', './postulacion.html',
  './logo.png', './icon-96.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './tapwork_logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('lottie.host')) return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return res; }).catch(() => r)));
  }
});

