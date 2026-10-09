// Khởi động app, điều hướng (router), thanh tiêu đề
(function () {
  const C = window.APP_CONFIG;
  window.API = C.mode === 'live' ? window.LiveAPI : window.MockAPI;

  const App = (window.App = {
    user: null, installPrompt: null,
    main: document.getElementById('view'),

    head(title, opt = {}) {
      document.getElementById('title').textContent = title;
      document.getElementById('back').hidden = !opt.back;
      document.getElementById('logo').hidden = !!opt.back;
      document.title = opt.home ? C.appName : title + ' · ' + C.appName;
      App.lockIcon();
    },
    loading() { App.main.innerHTML = '<div class="center pad"><span class="spin"></span></div>'; },
    notFound() { App.head('Không tìm thấy', { back: true }); App.main.innerHTML = '<div class="empty">Không có trang này hoặc bạn không có quyền truy cập.</div>'; },
    lockIcon() {
      const b = document.getElementById('lock');
      b.hidden = !Vault.isSet();
      b.textContent = Vault.isOpen() ? '🔓' : '🔒';
      b.title = Vault.isOpen() ? 'Đang mở khoá dữ liệu bảo mật — bấm để khoá' : 'Dữ liệu bảo mật đang khoá — bấm để mở';
    }
  });

  async function route() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = h.split('?');
    const p = path.split('/').filter(Boolean).map(decodeURIComponent);
    const params = new URLSearchParams(qs || '');
    window.scrollTo(0, 0);
    try {
      if (!p.length) return await Views.home();
      if (p[0] === 'i') return await Views.list(p[1]);
      if (p[0] === 'r') return await Views.detail(p[1], p[2]);
      if (p[0] === 'f') return await Views.form(p[1], p[2], params);
      if (p[0] === 'admin' && !p[1]) return await Admin.users();
      if (p[0] === 'admin' && p[1] === 'u') return await Admin.user(p[2]);
      if (p[0] === 'settings') return await Admin.settings();
      App.notFound();
    } catch (e) {
      console.error(e);
      App.main.innerHTML = `<div class="empty err">⚠️ ${U.esc(e.message)}<br><button class="btn" onclick="location.reload()">Thử lại</button></div>`;
    }
  }

  async function start() {
    document.documentElement.style.setProperty('--pri', C.primaryColor);
    document.getElementById('appname').textContent = C.appName;
    if (C.mode === 'demo') document.body.classList.add('is-demo');
    document.getElementById('back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/'));
    document.getElementById('lock').onclick = async () => { if (Vault.isOpen()) Vault.lock(); else await Vault.ensureOpen(); };
    document.getElementById('menu').onclick = () => { location.hash = '#/settings'; };
    Vault.onChange = () => App.lockIcon();

    if (C.mode === 'live') Auth.restore();
    App.loading();
    try {
      App.user = await API.me();
      const v = await API.getConfig('vault').catch(() => null);
      if (v) Vault.cfg = typeof v === 'string' ? JSON.parse(v) : v;
    } catch (e) {
      App.head(C.appName, { home: true });
      App.main.innerHTML = `<div class="empty err">⚠️ ${U.esc(e.message)}<br><br>
        ${C.mode === 'demo' ? '<button class="btn" onclick="localStorage.removeItem(\'pwa-demo-user\');location.reload()">Quay lại tài khoản chủ (demo)</button>'
          : '<button class="btn" onclick="API.signOut();location.reload()">Đăng nhập tài khoản khác</button>'}</div>`;
      return;
    }
    document.getElementById('avatar').textContent = (App.user.name || App.user.email || '?').trim().charAt(0).toUpperCase();
    window.addEventListener('hashchange', route);
    route();
  }

  // Cài app (Android/PC) + service worker để chạy như app và mở nhanh
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); App.installPrompt = e; });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            const b = document.getElementById('update'); b.hidden = false;
            b.onclick = () => { nw.postMessage('skip'); };
          }
        });
      });
    }).catch(e => console.warn('SW', e));
    // Chỉ tải lại khi CẬP NHẬT bản mới (không tải lại ở lần mở đầu tiên — tránh cắt ngang lúc đăng nhập)
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  }

  start();
})();
