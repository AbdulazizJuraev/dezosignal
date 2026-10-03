/* DezoSignal — ilova qobig'ini keshlaydi (telefonga o'rnatish uchun). Narxlar har doim internetdan. */
const CACHE = 'ds-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/signal.js', 'js/app.js', 'icon.svg', 'icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  // avval internet (yangi versiya darhol), internet bo'lmasa — kesh
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
