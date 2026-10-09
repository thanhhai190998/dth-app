// Service worker: cho phép cài app và mở được khi mạng yếu.
// Khi phát hành bản mới, tăng số phiên bản dưới đây để máy người dùng tải lại.
const CACHE = 'app-v0.1.0';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/config.js', 'js/util.js', 'js/perm.js', 'js/vault.js', 'js/schema.js', 'js/api.js', 'js/mock.js',
  'js/store.js', 'js/views.js', 'js/dash.js', 'js/admin.js', 'js/main.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

// Ưu tiên mạng (luôn có bản mới nhất), mất mạng hoặc chậm quá 4 giây thì dùng bản đã lưu.
// Dữ liệu (Apps Script) và đăng nhập Google không đi qua cache.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'));
    const timer = setTimeout(() => fromCache().then(r => { if (!done && r) { done = true; resolve(r); } }), 4000);
    fetch(e.request).then(r => {
      clearTimeout(timer);
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      if (!done) { done = true; resolve(r); }
    }).catch(() => { clearTimeout(timer); fromCache().then(r => { if (!done) { done = true; resolve(r || Response.error()); } }); });
  }));
});
