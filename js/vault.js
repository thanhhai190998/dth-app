// =====================================================================
//  MÃ HOÁ BẰNG MẬT KHẨU CHỦ (chạy hoàn toàn trên máy người dùng)
//  - Khoá AES-GCM 256 bit sinh từ mật khẩu chủ bằng PBKDF2-SHA256.
//  - Google Sheet / Apps Script chỉ thấy chuỗi "enc1:...", không đọc được.
//  - Quên mật khẩu chủ = KHÔNG khôi phục được dữ liệu đã mã hoá.
// =====================================================================
(function () {
  const PREFIX = 'enc1:';
  const CHECK = 'vault-ok';
  const ITER = 600000;
  const te = new TextEncoder(), td = new TextDecoder();
  const b64e = a => btoa(String.fromCharCode(...a));
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function derive(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(salt), iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encWith(key, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(String(text))));
    return PREFIX + b64e(iv) + ':' + b64e(ct);
  }
  async function decWith(key, v) {
    const [iv, ct] = String(v).slice(PREFIX.length).split(':');
    return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(iv) }, key, b64d(ct)));
  }

  const V = (window.Vault = {
    key: null, cfg: null, timer: null, onChange: null,
    isEnc: v => typeof v === 'string' && v.startsWith(PREFIX),
    isSet() { return !!(this.cfg && this.cfg.salt); },
    isOpen() { return !!this.key; },

    // Tạo cấu hình mới từ mật khẩu chủ (lưu cfg vào _CAUHINH, không chứa mật khẩu)
    async create(pass) {
      const salt = b64e(crypto.getRandomValues(new Uint8Array(16)));
      const key = await derive(pass, salt, ITER);
      return { v: 1, salt, iter: ITER, check: await encWith(key, CHECK) };
    },

    async unlock(pass) {
      if (!this.isSet()) throw new Error('Chưa đặt mật khẩu chủ');
      const key = await derive(pass, this.cfg.salt, this.cfg.iter);
      try { if (await decWith(key, this.cfg.check) !== CHECK) throw 0; }
      catch (e) { throw new Error('Sai mật khẩu chủ'); }
      this.key = key; this.touch(); this.onChange && this.onChange();
    },

    lock() { this.key = null; clearTimeout(this.timer); this.onChange && this.onChange(); },

    touch() {
      if (!this.key) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.lock(), (window.APP_CONFIG.autoLockMinutes || 5) * 60000);
    },

    async enc(text) { if (!this.key) throw new Error('Chưa mở khoá'); this.touch(); return encWith(this.key, text); },
    async dec(v) {
      if (!this.isEnc(v)) return v;
      if (!this.key) throw new Error('Chưa mở khoá');
      this.touch();
      try { return await decWith(this.key, v); } catch (e) { return '⚠ (không giải mã được)'; }
    },

    // Hỏi mật khẩu chủ nếu đang khoá. Trả về true nếu đã mở.
    async ensureOpen() {
      if (this.key) { this.touch(); return true; }
      if (!this.isSet()) { U.toast('Chưa đặt mật khẩu chủ — vào Cài đặt để đặt', 'err'); return false; }
      for (;;) {
        const r = await U.ask({ title: 'Mở khoá dữ liệu bảo mật', fields: [{ name: 'p', label: 'Mật khẩu chủ', type: 'password' }], ok: 'Mở khoá' });
        if (!r) return false;
        try { await this.unlock(r.p); return true; } catch (e) { U.toast(e.message, 'err'); }
      }
    }
  });

  // Mọi thao tác chạm/gõ đều gia hạn thời gian tự khoá
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => V.touch(), { passive: true }));
})();
