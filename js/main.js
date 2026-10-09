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
      document.querySelector('.top').classList.toggle('flat', !!opt.home);
      if (!opt.home) App.hero('');
      document.title = opt.home ? C.appName : title + ' · ' + C.appName;
      App.lockIcon();
      App.navActive();
    },
    // Vùng nền màu phía trên (chỉ trang chủ)
    hero(html) { const h = document.getElementById('hero'); h.innerHTML = html; h.hidden = !html; },
    // Thanh điều hướng dưới cùng (điện thoại) + menu trượt (máy tính: cố định bên trái)
    buildNav() {
      const q = App.user.quyen || {}, can = k => App.user.admin || Perm.rank(q[k]) > 0;
      const items = [
        { href: '#/', ic: 'home', l: 'Trang chủ' },
        can('Cong_viec') && { href: '#/i/Cong_viec', ic: 'box', l: 'Transmittal' },
        can('DASH_CANHBAO') && { href: '#/i/DASH_CANHBAO', ic: 'bell', l: 'Nhắc việc' },
        { href: '#menu', ic: 'menu', l: 'Menu', menu: true }
      ].filter(Boolean);
      const bn = document.getElementById('bnav');
      bn.innerHTML = items.map(i => `<a href="${i.href}" ${i.menu ? 'data-menu' : ''}>${Icon(i.ic)}<span>${i.l}</span></a>`).join('');
      bn.querySelector('[data-menu]').onclick = e => { e.preventDefault(); App.toggleDrawer(); };
      document.getElementById('menuBtn').innerHTML = Icon('menu');
      document.getElementById('menuBtn').onclick = () => App.toggleDrawer();
      document.getElementById('scrim').onclick = () => App.closeDrawer();
      document.addEventListener('keydown', e => { if (e.key === 'Escape') App.closeDrawer(); });
      document.body.classList.add('has-bnav', 'has-drawer');
      App.renderDrawer();
    },
    renderDrawer() {
      const esc = U.esc, dr = document.getElementById('drawer');
      // Nhóm nào đang mở (mặc định gập hết cho gọn; nhóm chứa trang đang xem tự mở)
      const opened = App.drOpened();
      // "Cài đặt" đã có ở chân menu → không lặp lại trong nhóm Quản trị
      const groups = Views.navGroups().map(g => ({ ...g, items: g.items.filter(it => it.href !== '#/settings') }));
      dr.innerHTML = `<div class="dr-h"><img src="icons/icon.svg" width="30" height="30" alt=""><b>${esc(C.appName)}</b>
          <button type="button" class="dr-x" aria-label="Đóng menu">${Icon('x')}</button></div>
        <label class="dr-search">${Icon('search')}<input type="search" placeholder="Tìm mục…" autocomplete="off"></label>
        <nav class="dr-nav"><a class="dr-i" href="#/"><span class="dr-ic">${Icon('home', 'sm')}</span><span>Trang chủ</span></a>
        ${groups.map(g => `<div class="dr-g ${opened.includes(g.key) ? '' : 'closed'}" data-g="${g.key}" style="--gc:${g.color}">
          <button type="button" class="dr-gh"><span class="gic">${Icon(g.ic)}</span><span class="dr-gl">${esc(g.label)}</span>
            <span class="cnt">${g.items.length}</span><span class="dr-ch">${Icon('chevron')}</span></button>
          <div class="dr-items">${g.items.map(it => `<a class="dr-i" href="${Views.hrefOf(it)}" data-s="${esc(U.norm(it.label + ' ' + (it.desc || '')))}">
            <span class="dr-ic">${Icon(it.ic, 'sm')}</span><span>${esc(it.label)}</span></a>`).join('')}</div></div>`).join('')}
        </nav>
        <div class="dr-f"><a class="dr-i" href="#/settings"><span class="dr-ic">${Icon('gear', 'sm')}</span><span>Cài đặt</span></a></div>`;
      dr.querySelector('.dr-x').onclick = () => App.closeDrawer();
      dr.querySelectorAll('.dr-gh').forEach(b => b.onclick = () => {
        const g = b.closest('.dr-g'), open = !g.classList.toggle('closed');
        const now = App.drOpened().filter(k => k !== g.dataset.g).concat(open ? [g.dataset.g] : []);
        try { localStorage.setItem('pwa-drawer-open', JSON.stringify(now)); } catch (e) { /* bỏ qua */ }
      });
      const inp = dr.querySelector('.dr-search input');
      inp.oninput = () => {
        const s = U.norm(inp.value.trim());
        dr.classList.toggle('searching', !!s);
        dr.querySelectorAll('.dr-g').forEach(g => {
          let n = 0;
          g.querySelectorAll('.dr-i').forEach(a => { const on = !s || a.dataset.s.includes(s); a.hidden = !on; if (on) n++; });
          g.hidden = !n;
        });
      };
      dr.querySelectorAll('a.dr-i').forEach(a => a.addEventListener('click', () => { inp.value = ''; inp.oninput(); App.closeDrawer(); }));
      App.navActive();
    },
    // Nhóm trong menu người dùng tự mở (mặc định gập hết cho gọn)
    drOpened() { try { return JSON.parse(localStorage.getItem('pwa-drawer-open') || '[]'); } catch (e) { return []; } },
    toggleDrawer() { document.body.classList.contains('dr-open') ? App.closeDrawer() : App.openDrawer(); },
    openDrawer() { document.body.classList.add('dr-open'); },
    closeDrawer() { document.body.classList.remove('dr-open'); },
    navActive() {
      const nav = document.getElementById('bnav'), h = location.hash || '#/';
      const isHome = h === '#/' || h === '#' || h === '';
      nav.hidden = /^#\/(f|admin\/u)\//.test(h);
      nav.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href');
        a.classList.toggle('on', href === '#menu' ? false : href === '#/' ? isHome : h.startsWith(href));
      });
      document.querySelectorAll('#drawer a.dr-i').forEach(a => {
        const href = a.getAttribute('href');
        a.classList.toggle('on', href === '#/' ? isHome : h === href || h.startsWith(href + '?'));
      });
      // Nhóm chứa trang đang xem tự mở; rời trang thì trả về trạng thái người dùng đã chọn
      const opened = App.drOpened();
      document.querySelectorAll('#drawer .dr-g').forEach(g =>
        g.classList.toggle('closed', !opened.includes(g.dataset.g) && !g.querySelector('a.dr-i.on')));
    },
    loading() { App.main.innerHTML = '<div class="center pad"><span class="spin"></span></div>'; },
    // Giao diện: '' = theo máy, 'light', 'dark' (nhớ trên từng máy)
    theme() { try { return localStorage.getItem('pwa-theme') || ''; } catch (e) { return ''; } },
    setTheme(t) {
      try { if (t) localStorage.setItem('pwa-theme', t); else localStorage.removeItem('pwa-theme'); } catch (e) { /* bỏ qua */ }
      if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    },
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

  // Font chữ từ Google Fonts (thêm ?font=system vào địa chỉ để xem bằng font mặc định của máy)
  function loadFont() {
    const f = new URLSearchParams(location.search).get('font') ?? C.font;
    if (!f || f === 'system') return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.crossOrigin = 'anonymous';   // để service worker lưu được font (dùng khi mất mạng)
    l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;500;600;700;800&display=swap';
    document.head.appendChild(l);
    document.documentElement.style.setProperty('--font', `'${f}', system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`);
  }

  async function start() {
    loadFont();
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
    document.getElementById('avatar').textContent = ((window.Auth && Auth.name) || App.user.name || App.user.email || '?').trim().charAt(0).toUpperCase();
    await DB.load('ALBUM').catch(() => {});   // menu cần danh sách album
    App.buildNav();
    window.addEventListener('hashchange', () => { App.closeDrawer(); route(); });
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
