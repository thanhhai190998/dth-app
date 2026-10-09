// =====================================================================
//  API THẬT: gọi Apps Script (Google Sheets) + đăng nhập Google
//  Mọi yêu cầu đều kèm ID token Google; Apps Script kiểm tra token và
//  bảng phân quyền trước khi trả dữ liệu.
// =====================================================================
(function () {
  const CFG = () => window.APP_CONFIG;

  function decodeJwt(t) {
    const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '==='.slice((b.length + 3) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  }

  const Auth = (window.Auth = {
    token: null, exp: 0, email: '', name: '', picture: '',
    restore() {
      try {
        const s = JSON.parse(localStorage.getItem('pwa-auth') || 'null');
        if (s && s.t) { this.hint = String(decodeJwt(s.t).email || '').toLowerCase(); this.set(s.t, true); }   // hint: email lần đăng nhập trước (kể cả khi token đã hết hạn)
      } catch (e) { /* bỏ qua */ }
    },
    valid() { return !!this.token && this.exp * 1000 > Date.now() + 60000; },
    set(cred, silent) {
      const p = decodeJwt(cred);
      if (p.exp * 1000 <= Date.now() + 60000) { if (silent) return; }
      this.token = cred; this.exp = p.exp; this.email = p.email; this.name = p.name || ''; this.given = p.given_name || ''; this.picture = p.picture || '';
      try { localStorage.setItem('pwa-auth', JSON.stringify({ t: cred })); } catch (e) { /* bỏ qua */ }
    },
    clear() {
      this.token = null; this.exp = 0;
      try { localStorage.removeItem('pwa-auth'); } catch (e) { /* bỏ qua */ }
    },
    signOut() {
      this.clear();
      try { google.accounts.id.disableAutoSelect(); } catch (e) { /* bỏ qua */ }
    },
    // Hiện màn hình đăng nhập Google, chờ đến khi có token
    signIn() {
      if (this._waiting) return this._waiting;
      this._waiting = new Promise((resolve, reject) => {
        const box = document.getElementById('login');
        box.hidden = false;
        const start = () => {
          google.accounts.id.initialize({
            client_id: CFG().googleClientId,
            auto_select: true,
            callback: r => { this.set(r.credential); box.hidden = true; this._waiting = null; resolve(); }
          });
          google.accounts.id.renderButton(document.getElementById('gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'vi' });
          google.accounts.id.prompt();
        };
        if (window.google && google.accounts) return start();
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = start;
        s.onerror = () => { this._waiting = null; reject(new Error('Không tải được dịch vụ đăng nhập Google — kiểm tra mạng')); };
        document.head.appendChild(s);
      });
      return this._waiting;
    }
  });

  async function call(action, payload, retry = true) {
    if (!CFG().apiUrl) throw new Error('Chưa cấu hình apiUrl trong js/config.js');
    if (!Auth.valid()) await Auth.signIn();
    let res;
    try {
      // Không đặt Content-Type → text/plain, tránh preflight CORS với Apps Script
      res = await fetch(CFG().apiUrl, { method: 'POST', body: JSON.stringify(Object.assign({ action, token: Auth.token }, payload || {})) });
    } catch (e) { throw new Error('Mất kết nối máy chủ'); }
    const j = await res.json();
    if (!j.ok) {
      if (j.error === 'AUTH' && retry) { Auth.clear(); return call(action, payload, false); }
      const err = new Error(j.error === 'NOT_ALLOWED' ? 'Tài khoản ' + (j.email || '') + ' chưa được cấp quyền dùng app' : j.error);
      err.code = j.error; throw err;
    }
    return j.data;
  }

  window.LiveAPI = {
    me: () => call('me'),
    list: t => call('list', { table: t }),
    add: (t, keyField, row) => call('add', { table: t, keyField, row }),
    update: (t, keyField, row) => call('update', { table: t, keyField, row }),
    remove: (t, keyField, key) => call('remove', { table: t, keyField, key }),
    upload: (t, field, name, dataUrl) => { const p = U.dataUrlParts(dataUrl); return call('upload', { table: t, field, name, mime: p.mime, data: p.data }); },
    file: (t, keyField, key, field, thumb, size) => call('file', { table: t, keyField, key, field, thumb: !!thumb, size }),
    files: (items, size) => call('files', { items, size }),
    batch: ts => call('batch', { tables: ts }),
    users: () => call('users'),
    saveUser: u => call('saveUser', { user: u }),
    deleteUser: email => call('deleteUser', { email }),
    getConfig: k => call('getConfig', { key: k }),
    setConfig: (k, v) => call('setConfig', { key: k, value: v }),
    songs: () => call('songs'),
    audio: id => call('audio', { id }),
    musicGet: () => call('musicGet'),
    musicSave: d => call('musicSave', d),
    signOut: () => Auth.signOut()
  };
})();
