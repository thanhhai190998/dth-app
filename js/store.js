// Bộ đệm dữ liệu phía app: tải bảng theo nhu cầu, tính cột ảo, định dạng hiển thị
(function () {
  const T = () => window.SCHEMA.tables;

  const DB = (window.DB = {
    data: {}, pending: {},

    async load(t, force) {
      if (!force && this.data[t]) return this.data[t];
      if (this.pending[t]) return this.pending[t];
      this.pending[t] = API.list(t)
        .then(rows => { this.data[t] = rows || []; return this.data[t]; })
        .finally(() => { delete this.pending[t]; });
      return this.pending[t];
    },

    // Tải bảng + các bảng nó cần (tham chiếu, cột ảo, bảng con)
    async loadDeps(t, withRelated) {
      const def = T()[t]; if (!def) throw new Error('Không có bảng ' + t);
      const set = new Set([t, ...(def.needs || [])]);
      def.fields.forEach(f => f.ref && set.add(f.ref));
      if (withRelated) (def.related || []).forEach(r => {
        set.add(r.t);
        (T()[r.t].needs || []).forEach(n => set.add(n));
      });
      await Promise.all([...set].map(x => this.load(x).catch(e => { console.warn(x, e); this.data[x] = this.data[x] || []; })));
    },

    invalidate(t) { delete this.data[t]; },
    clear() { this.data = {}; },
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
      return saved;
    },
    async update(t, row) {
      const saved = await API.update(t, this.keyField(t), row);
      const arr = this.data[t] || [], kf = this.keyField(t);
      const i = arr.findIndex(r => String(r[kf]) === String(saved[kf]));
      if (i >= 0) arr[i] = saved; else arr.push(saved);
      return saved;
    },
    async remove(t, key) {
      await API.remove(t, this.keyField(t), key);
      const kf = this.keyField(t);
      this.data[t] = (this.data[t] || []).filter(r => String(r[kf]) !== String(key));
    }
  });

  // Ảnh / file: tải qua API (có kiểm tra quyền), nhớ tạm trong phiên
  const cache = new Map();
  window.Files = {
    async url(t, key, field, thumb) {
      const ck = [t, key, field, thumb ? 1 : 0].join('|');
      if (cache.has(ck)) return cache.get(ck);
      const p = API.file(t, DB.keyField(t), key, field, thumb).then(f => {
        if (!f) return null;
        return URL.createObjectURL(U.b64ToBlob(f.data, f.mime));
      });
      cache.set(ck, p);
      p.catch(() => cache.delete(ck));
      return p;
    },
    forget(t, key) { [...cache.keys()].filter(k => k.startsWith(t + '|' + key + '|')).forEach(k => cache.delete(k)); },
    async open(t, key, field) {
      try {
        U.toast('Đang mở file…');
        const u = await this.url(t, key, field, false);
        if (!u) return U.toast('Không tìm thấy file', 'err');
        const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { U.toast(e.message, 'err'); }
    }
  };
})();
