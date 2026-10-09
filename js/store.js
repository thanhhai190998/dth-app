// Bộ đệm dữ liệu phía app: tải bảng theo nhu cầu, tính cột ảo, định dạng hiển thị.
// Dữ liệu tải về được lưu lâu dài trên máy (IndexedDB): mở app / mở mục lần sau hiện ngay bản đã lưu,
// đồng thời hỏi máy chủ ngầm phía sau — có thay đổi thì tự vẽ lại trang đang xem.
(function () {
  const T = () => window.SCHEMA.tables;

  // ---- Kho lưu trên máy (IndexedDB, khoá theo chế độ + email để mỗi người một kho) ----
  const IDB = {
    p: null,
    open() {
      if (!this.p) this.p = new Promise(res => {
        try {
          const r = indexedDB.open('dth-app', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('kv');
          r.onsuccess = () => res(r.result);
          r.onerror = r.onblocked = () => res(null);
        } catch (e) { res(null); }
      });
      return this.p;
    },
    async run(mode, fn) {
      const db = await this.open(); if (!db) return null;
      return new Promise(res => {
        try { const tx = db.transaction('kv', mode), q = fn(tx.objectStore('kv')); tx.oncomplete = () => res(q ? q.result : null); tx.onerror = tx.onabort = () => res(null); }
        catch (e) { res(null); }
      });
    },
    get(k) { return this.run('readonly', s => s.get(k)); },
    set(k, v) { return this.run('readwrite', s => s.put(v, k)); },
    del(k) { return this.run('readwrite', s => s.delete(k)); },
    clear() { return this.run('readwrite', s => s.clear()); }
  };
  const ns = () => window.APP_CONFIG.mode + '|' + ((window.App && App.user && App.user.email) || '') + '|t:';
  const CHUNK = 6;   // số bảng tối đa trong 1 lần gọi ngầm

  const DB = (window.DB = {
    data: {}, pending: {}, fresh: new Set(), queue: new Set(), track: new Set(), noBatch: false,
    onChange: null,   // main.js đặt: (danh sách bảng vừa đổi) => vẽ lại trang đang xem

    // Lấy 1 bảng: có trong bộ nhớ / trên máy thì trả ngay (rồi cập nhật ngầm), chưa có thì chờ máy chủ.
    // force = luôn lấy bản mới nhất từ máy chủ.
    async load(t, force) {
      this.track.add(t);
      if (force) { await this.fetch([t]); return this.data[t] || []; }
      if (this.data[t] || await this.fromDisk(t)) { this.later(t); return this.data[t]; }
      await this.fetch([t]);
      return this.data[t] || [];
    },

    // Tải bảng + các bảng nó cần (tham chiếu, cột ảo, bảng con) — các bảng còn thiếu gộp trong 1 lần gọi
    async loadDeps(t, withRelated) {
      const def = T()[t]; if (!def) throw new Error('Không có bảng ' + t);
      const set = new Set([t, ...(def.needs || [])]);
      def.fields.forEach(f => f.ref && set.add(f.ref));
      if (withRelated) (def.related || []).forEach(r => {
        set.add(r.t);
        (T()[r.t].needs || []).forEach(n => set.add(n));
      });
      const ts = [...set], miss = [];
      ts.forEach(x => this.track.add(x));
      await Promise.all(ts.map(async x => { if (!this.data[x] && !await this.fromDisk(x)) miss.push(x); }));
      if (miss.length) await this.fetch(miss).catch(e => { console.warn(miss, e); miss.forEach(x => { this.data[x] = this.data[x] || []; }); });
      ts.forEach(x => this.later(x));
    },

    async fromDisk(t) {
      const c = await IDB.get(ns() + t);
      if (c && Array.isArray(c.rows) && !this.data[t]) this.data[t] = c.rows;
      return !!this.data[t];
    },
    persist(t) { IDB.set(ns() + t, { rows: this.data[t] || [], at: Date.now() }); },

    // Hẹn cập nhật ngầm (mỗi bảng 1 lần trong 1 phiên mở app)
    later(t) {
      if (this.fresh.has(t) || this.pending[t] || this.queue.has(t)) return;
      this.queue.add(t);
      clearTimeout(this._qt);
      this._qt = setTimeout(async () => {
        const ts = [...this.queue]; this.queue.clear();
        this.setBusy(1);
        try { for (let i = 0; i < ts.length; i += CHUNK) await this.fetch(ts.slice(i, i + CHUNK), true).catch(() => {}); }
        finally { this.setBusy(-1); }
      }, 60);
    },
    busy: 0, onBusy: null,   // main.js: hiện thanh mỏng "đang cập nhật" khi cập nhật ngầm
    setBusy(d) { this.busy += d; if (this.onBusy) this.onBusy(this.busy > 0); },

    // Tải từ máy chủ; bảng đang được tải thì chờ chung lần gọi đó
    fetch(ts, background) {
      const waits = [], todo = [];
      ts.forEach(t => (this.pending[t] ? waits.push(this.pending[t]) : todo.push(t)));
      if (todo.length) {
        const p = this.request(todo).then(res => this.apply(res, background));
        todo.forEach(t => { this.pending[t] = p; });
        p.catch(() => {}).then(() => todo.forEach(t => { if (this.pending[t] === p) delete this.pending[t]; }));
        waits.push(p);
      }
      return Promise.all(waits);
    },
    async request(ts) {
      if (ts.length > 1 && !this.noBatch && API.batch) {
        try { return await API.batch(ts); }
        catch (e) { if (!/Thao tác không hợp lệ/.test(e.message)) throw e; this.noBatch = true; }   // máy chủ bản cũ chưa có "batch"
      }
      const out = {};
      await Promise.all(ts.map(t => API.list(t).then(r => { out[t] = r; })));
      return out;
    },
    apply(res, background) {
      const changed = [];
      Object.keys(res).forEach(t => {
        const rows = res[t];
        if (!Array.isArray(rows)) { console.warn(t, rows && rows.error); if (!this.data[t]) this.data[t] = []; return; }
        const had = this.data[t];
        this.fresh.add(t);
        if (had && JSON.stringify(had) === JSON.stringify(rows)) return;
        this.data[t] = rows;
        this.persist(t);
        if (had && background) changed.push(t);
      });
      if (changed.length && this.onChange) this.onChange(changed);
    },

    // Sau khi trang đầu đã hiện: tải ngầm mọi bảng được phép → lần đầu mở mục nào cũng nhanh;
    // bảng đã mất quyền thì xoá khỏi máy
    prefetch() {
      Object.keys(T()).forEach(t => {
        if (permTableLevel(App.user, t) > 0) this.later(t);
        else { IDB.del(ns() + t); delete this.data[t]; }
      });
    },

    invalidate(t) { delete this.data[t]; this.fresh.delete(t); },
    clear() { this.data = {}; this.fresh.clear(); },
    // Xoá mọi dữ liệu lưu tạm trên máy (bảng + ảnh) — dùng khi đăng xuất / đổi người
    async wipe() {
      this.clear();
      await IDB.clear();
      try { await caches.delete('img-v1'); } catch (e) { /* bỏ qua */ }
    },
    async diskUsage() {
      try { const e = await navigator.storage.estimate(); return e.usage || 0; } catch (e) { return 0; }
    },
    rows(t) { return this.data[t] || []; },
    keyField(t) { return T()[t].key; },
    keyOf(t, r) { return r && r[T()[t].key]; },
    get(t, k) {
      if (k == null || k === '') return null;
      const kf = T()[t].key;
      return this.rows(t).find(r => String(r[kf]) === String(k)) || null;
    },
    field(t, n) { return T()[t].fields.find(f => f.n === n); },

    // Giá trị (kể cả cột ảo)
    val(t, r, n) {
      const f = this.field(t, n);
      if (f && f.v) { try { return f.v(r, this); } catch (e) { console.warn(e); return ''; } }
      return r[n];
    },
    title(t, r) {
      if (!r) return '';
      const def = T()[t];
      try { return String(def.title(r, this) ?? '') || '(không tên)'; } catch (e) { return String(this.keyOf(t, r)); }
    },
    sub(t, r) { const def = T()[t]; try { return def.sub ? String(def.sub(r, this) ?? '') : ''; } catch (e) { return ''; } },
    badge(t, r) { const def = T()[t]; try { return def.badge ? def.badge(r, this) : null; } catch (e) { return null; } },

    // Hiển thị 1 giá trị dạng HTML an toàn (ảnh/file/mã hoá xử lý riêng ở views)
    // plain = true: không tạo link (dùng bên trong dòng danh sách vốn đã là link)
    show(t, r, n, plain) {
      const f = this.field(t, n); if (!f) return U.esc(r[n]);
      const v = this.val(t, r, n);
      if (v === '' || v == null) return '';
      if (plain && (f.t === 'email' || f.t === 'phone' || f.t === 'url')) return U.esc(v);
      switch (f.t) {
        case 'date': return U.esc(U.fmtDate(v));
        case 'datetime': return U.esc(U.fmtDateTime(v));
        case 'expiry': return U.esc(U.parseDate(v) ? U.fmtDate(v) : v);
        case 'price': return U.esc(U.money(v));
        case 'number': return U.esc(U.int(v));
        case 'ref': { const rr = this.get(f.ref, v); return U.esc(rr ? this.title(f.ref, rr) : v); }
        case 'email': return `<a href="mailto:${U.esc(v)}">${U.esc(v)}</a>`;
        case 'phone': return `<a href="tel:${U.esc(String(v).replace(/\s/g, ''))}">${U.esc(v)}</a>`;
        case 'url': { const u = /^https?:\/\//i.test(v) ? v : 'https://' + v; return `<a href="${U.esc(u)}" target="_blank" rel="noopener">${U.esc(v)}</a>`; }
        default: return U.esc(v).replace(/\n/g, '<br>');
      }
    },

    async add(t, row) {
      const saved = await API.add(t, this.keyField(t), row);
      (this.data[t] = this.data[t] || []).push(saved);
      this.persist(t);
      return saved;
    },
    async update(t, row) {
      const saved = await API.update(t, this.keyField(t), row);
      const arr = this.data[t] || [], kf = this.keyField(t);
      const i = arr.findIndex(r => String(r[kf]) === String(saved[kf]));
      if (i >= 0) arr[i] = saved; else arr.push(saved);
      this.data[t] = arr;
      this.persist(t);
      return saved;
    },
    async remove(t, key) {
      await API.remove(t, this.keyField(t), key);
      const kf = this.keyField(t);
      this.data[t] = (this.data[t] || []).filter(r => String(r[kf]) !== String(key));
      this.persist(t);
    }
  });

  // ---- Ảnh / file: tải qua API (có kiểm tra quyền) ----
  // size: 'thumb' (ảnh nhỏ trong danh sách) · 'preview' (ảnh xem lớn, đã thu nhỏ ~1600px) · 'full' (file gốc).
  // Ảnh nhỏ + ảnh xem lớn được lưu trên máy (Cache Storage 'img-v1'); ảnh nhỏ được gom ~10 ảnh / 1 lần gọi.
  const IMG = 'img-v1';
  const mem = new Map();
  const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); };
  // Khoá gồm cả giá trị ô ảnh → đổi ảnh khác thì tự tải lại, không dùng nhầm ảnh cũ
  const keyOf = (t, key, field, size) => { const r = DB.get(t, key); return ['img', t, key, field, size, hash(r ? r[field] : '')].map(encodeURIComponent).join('/'); };
  async function diskGet(k) { try { const r = await (await caches.open(IMG)).match(k); return r ? await r.blob() : null; } catch (e) { return null; } }
  async function diskPut(k, b) { try { await (await caches.open(IMG)).put(k, new Response(b, { headers: { 'Content-Type': b.type } })); } catch (e) { /* đầy bộ nhớ → bỏ qua */ } }

  let q = [], qt = null, noFiles = false;
  const one = g => API.file(g.t, DB.keyField(g.t), g.key, g.field, true).then(g.ok, g.no);
  function thumb(t, key, field) {
    return new Promise((ok, no) => { q.push({ t, key, field, ok, no }); clearTimeout(qt); qt = setTimeout(flush, 25); });
  }
  function flush() {
    const all = q; q = [];
    for (let i = 0; i < all.length; i += 10) send(all.slice(i, i + 10));
  }
  async function send(g) {
    if (noFiles || !API.files || g.length === 1) return g.forEach(one);
    try {
      const res = await API.files(g.map(x => ({ table: x.t, keyField: DB.keyField(x.t), key: x.key, field: x.field })), 'thumb');
      g.forEach((x, i) => { const f = res[i]; if (f && f.error) x.no(new Error(f.error)); else x.ok(f || null); });
    } catch (e) {
      if (/Thao tác không hợp lệ/.test(e.message)) { noFiles = true; g.forEach(one); }   // máy chủ bản cũ chưa có "files"
      else g.forEach(x => x.no(e));
    }
  }

  window.Files = {
    url(t, key, field, size) {
      size = size === true ? 'thumb' : size || 'full';
      const ck = keyOf(t, key, field, size);
      if (mem.has(ck)) return mem.get(ck);
      const p = (async () => {
        if (size !== 'full') { const b = await diskGet(ck); if (b) return URL.createObjectURL(b); }
        const f = size === 'thumb' ? await thumb(t, key, field) : await API.file(t, DB.keyField(t), key, field, false, size);
        if (!f) return null;
        const b = U.b64ToBlob(f.data, f.mime);
        if (size !== 'full') diskPut(ck, b);
        return URL.createObjectURL(b);
      })();
      mem.set(ck, p);
      p.catch(() => mem.delete(ck));
      return p;
    },
    // Ảnh đã có sẵn (trong phiên) — dùng làm ảnh mờ tạm khi chờ ảnh lớn
    ready(t, key, field, size) { return mem.get(keyOf(t, key, field, size)) || null; },
    forget(t, key) { const p = ['img', t, key].map(encodeURIComponent).join('/') + '/'; [...mem.keys()].filter(k => k.startsWith(p)).forEach(k => mem.delete(k)); },
    async open(t, key, field) {
      try {
        U.toast('Đang mở file…');
        const u = await this.url(t, key, field, 'full');
        if (!u) return U.toast('Không tìm thấy file', 'err');
        const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { U.toast(e.message, 'err'); }
    }
  };
})();
