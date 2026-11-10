/* Doo Doo Town offline cache.
   Pages and scripts: network first (so updates show up right away), cache when offline.
   Art and sound: served from the cache, refreshed in the background. */
const CACHE = 'ddt-v2';
const CORE = ['./', './index.html', './app.html', './play.html', './arcade/index.html', './arcade/games.js',
  './story/job.html', './story/stop.html', './story/coffee.html', './story/fluffernutter.html', './story/alien.html',
  './js/calls.js', './js/drive3d.js', './js/music.js', './js/placeholders.js', './js/sfx.js', './js/state.js',
  './assets/PressStart2P.ttf', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  const path = new URL(r.url).pathname, code = r.mode === 'navigate' || /\.(html|js|webmanifest)$/.test(path) || path.endsWith('/');
  if (code) {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); return res; })
      .catch(() => caches.match(r, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(r).then(hit => {
      const net = fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
