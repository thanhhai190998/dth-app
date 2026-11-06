// =====================================================================
//  HIỆU ỨNG ĐỘNG — mức "Đầy đủ" (mặc định) / "Nhẹ" (chỉ chuyển trang như bản 0.16) / "Tắt"
//  Nhớ trên từng máy (localStorage 'pwa-fx'). Máy đặt "giảm chuyển động" (prefers-reduced-motion) → như Tắt.
//  Gồm: gợn sóng khi bấm nút · ánh sáng theo chuột trên thẻ · thẻ hiện dần khi cuộn tới · thanh biểu đồ mọc lên ·
//  dòng bảng trượt vào lần lượt · dòng/sự kiện vừa lưu sáng lên · pháo giấy khi hoàn thành transmittal/task ·
//  đổi Sáng/Tối lan tròn từ chỗ bấm. Phần chỉ cần CSS nằm ở cuối css/app.css (mục "Hiệu ứng động").
// =====================================================================
(function () {
  const KEY = 'pwa-fx';
  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  const Fx = window.Fx = {
    level() { try { const v = localStorage.getItem(KEY); return v === 'lite' || v === 'off' ? v : 'full'; } catch (e) { return 'full'; } },
    setLevel(v) {
      try { if (v === 'full') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch (e) { /* bỏ qua */ }
      apply();
    },
    full: () => Fx.level() === 'full' && !rm.matches,
    off: () => Fx.level() === 'off' || rm.matches,
    owner: null   // bảng Transmittal: dòng (tài liệu) → id transmittal, để tô sáng đúng các dòng vừa lưu
  };
  const apply = () => {
    const l = rm.matches ? 'off' : Fx.level(), b = document.body;
    b.classList.toggle('fx-full', l === 'full');
    b.classList.toggle('fx-off', l === 'off');
  };
  apply();
  if (rm.addEventListener) rm.addEventListener('change', apply);

  // ---- Gợn sóng khi bấm (vòng tròn loang từ đúng chỗ bấm) ----
  const RIP = '.btn, .segb, .chip, .chip2, .cib, .hact, .kcard, .dr-i, .dr-gh, .fab, .ibtn2, .ibtn3, .ag, .xchip';
  document.addEventListener('pointerdown', e => {
    if (e.button > 0 || !document.body.classList.contains('fx-full')) return;
    const el = e.target.closest && e.target.closest(RIP);
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const x = e.clientX - r.left, y = e.clientY - r.top, d = 2 * Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
    const w = document.createElement('span'), s = document.createElement('i');
    w.className = 'fx-rw'; w.setAttribute('aria-hidden', 'true');
    s.style.cssText = `width:${d}px;height:${d}px;left:${x - d / 2}px;top:${y - d / 2}px`;
    w.appendChild(s); el.appendChild(w);
    setTimeout(() => w.remove(), 700);
  }, { passive: true });

  // ---- Ánh sáng theo chuột trên thẻ số liệu / thao tác nhanh / thẻ dashboard ----
  const SPOT = '.kcard, .hact, .dcard';
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || !document.body.classList.contains('fx-full')) return;
    const el = e.target.closest && e.target.closest(SPOT);
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
  }, { passive: true });

  // ---- Thẻ nằm dưới màn hình: hiện dần (trượt lên) khi cuộn tới ----
  let io = null;
  const REV = '.dash > .card, .hcol > *, .settings > *, #view > .card';
  const reveal = v => {
    if (io) { io.disconnect(); io = null; }
    if (!('IntersectionObserver' in window)) return;
    const H = innerHeight, els = [...v.querySelectorAll(REV)].filter(el => el.getBoundingClientRect().top > H - 10);
    if (!els.length) return;
    io = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting) return;
      bars(en.target);
      en.target.classList.add('fx-rvin'); io.unobserve(en.target);
      setTimeout(() => en.target.classList.remove('fx-rv', 'fx-rvin'), 1400);   // xong thì trả lại như thường (hover, vẽ lại ngầm)
    }), { rootMargin: '0px 0px -30px 0px' });
    els.forEach(el => { el.classList.add('fx-rv'); io.observe(el); });
  };
  // Thanh ngang (.hb-f) và cột SVG (.cx-bar) mọc lần lượt: đánh số thứ tự cho độ trễ
  const bars = box => {
    box.querySelectorAll('.hbars').forEach(h => h.querySelectorAll('.hb-f').forEach((f, i) => f.style.setProperty('--i', Math.min(i, 12))));
    box.querySelectorAll('svg').forEach(s => s.querySelectorAll('.cx-bar').forEach((f, i) => f.style.setProperty('--i', Math.min(i, 24))));
  };

  // ---- Vừa lưu: dòng trong bảng / thẻ chi tiết / sự kiện lịch sáng lên một nhịp ----
  let last = null;   // { t, k, at, l (đã tô ở danh sách), d (đã tô ở trang chi tiết) }
  Fx.flash = els => {
    if (Fx.off()) return;
    [...(els && els.length != null ? els : [els])].filter(Boolean).forEach(el => {
      el.classList.remove('fx-flash'); void el.offsetWidth; el.classList.add('fx-flash');
      setTimeout(() => el.classList.remove('fx-flash'), 1800);
    });
  };
  const flashSaved = v => {
    if (!last || Date.now() - last.at > 120000) return;
    const [path] = location.hash.split('?'), k = String(last.k);
    if (!last.d && path === '#/r/' + last.t + '/' + encodeURIComponent(k)) { last.d = 1; Fx.flash(v.querySelector('.dhero')); }
    else if (!last.l && path === '#/i/' + last.t) {
      last.l = 1;
      const own = Fx.owner;
      Fx.flash([...v.querySelectorAll('tr[data-k]')].filter(tr => tr.dataset.k === k || (own && String(own(tr.dataset.k)) === k)));
    }
  };

  // ---- Pháo giấy: hoàn thành transmittal (có Ngày hoàn thành) / task (Đang xử lý → Đã xử lý) / lần kiểm tra vật tư ----
  const DONE = {
    Cong_viec: (a, b) => !a.Ngay_hoan_thanh && !!b.Ngay_hoan_thanh,
    Cong_viec_duoc_giao: (a, b) => (a.Trang_thai === 'Đang xử lý' && !!b.Trang_thai && b.Trang_thai !== 'Đang xử lý') || (!a.Ngay_hoan_thanh && !!b.Ngay_hoan_thanh),
    Kiem_tra_hang: (a, b) => !a.Ngay_hoan_thanh && !!b.Ngay_hoan_thanh
  };
  const PAL = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#facc15'];
  Fx.confetti = () => {
    if (!Fx.full() || document.hidden) return;
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1), sc = Math.min(1.25, Math.max(.75, H / 820));
    const c = document.createElement('canvas');
    c.className = 'fx-conf'; c.width = W * dpr; c.height = H * dpr; c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const R = (a, b) => a + Math.random() * (b - a), N = W < 600 ? 90 : 150;
    const ps = Array.from({ length: N }, (_, i) => {   // hai ống pháo ở hai góc dưới, bắn chéo vào giữa
      const left = i % 2 === 0;
      return { x: left ? R(-10, W * .08) : R(W * .92, W + 10), y: H + R(0, 20), vx: (left ? 1 : -1) * R(3, 10) * sc * Math.max(.8, W / 1400),
        vy: -R(13, 21) * sc, r: R(0, 6.28), vr: R(-.25, .25), w: R(6, 10), h: R(9, 15), col: PAL[i % PAL.length], round: Math.random() < .25, sw: R(0, 6.28) };
    });
    const t0 = performance.now(), D = 2800;
    const step = t => {
      const k = (t - t0) / D;
      g.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.vy += .38 * sc; p.vx *= .985; p.vy *= .985; p.x += p.vx + Math.sin(p.sw += .1) * .6; p.y += p.vy; p.r += p.vr;
        g.save(); g.globalAlpha = k > .75 ? Math.max(0, (1 - k) / .25) : 1;
        g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.col;
        if (p.round) { g.beginPath(); g.arc(0, 0, p.w / 2, 0, 6.29); g.fill(); }
        else { g.scale(1, Math.cos(p.sw)); g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        g.restore();
      }
      if (k < 1) requestAnimationFrame(step); else c.remove();
    };
    requestAnimationFrame(step);
  };

  // Gắn vào DB.add / DB.update: nhớ dòng vừa lưu (để tô sáng) + bắn pháo giấy khi chuyển sang hoàn thành
  const hook = name => {
    const orig = DB[name];
    DB[name] = async function (t, row) {
      const kf = DB.keyField(t), was = name === 'update' && row && row[kf] != null ? DB.get(t, row[kf]) : null, prev = was ? { ...was } : null;
      const saved = await orig.call(this, t, row);
      try {
        const s = saved || row;
        last = { t, k: s[kf], at: Date.now() };
        if (prev && DONE[t] && DONE[t](prev, s)) setTimeout(Fx.confetti, 250);
      } catch (e) { /* hiệu ứng không được làm hỏng việc lưu */ }
      return saved;
    };
  };
  if (window.DB) { hook('add'); hook('update'); }

  // ---- Đổi Sáng/Tối: màu mới lan tròn từ đúng chỗ bấm (View Transitions; trình duyệt cũ thì đổi ngay) ----
  Fx.themeSwap = (fn, ev) => {
    if (!Fx.full() || !document.startViewTransition) return fn();
    const x = ev && ev.clientX ? ev.clientX : innerWidth / 2, y = ev && ev.clientY ? ev.clientY : 0;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)), de = document.documentElement;
    de.classList.add('fx-vt');
    const vt = document.startViewTransition(fn);
    vt.ready.then(() => de.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
    vt.finished.finally(() => de.classList.remove('fx-vt'));
  };

  // ---- Gọi sau mỗi lần mở trang (main.js route); keep = vẽ lại ngầm → không chạy hiệu ứng vào trang ----
  Fx.afterRoute = keep => {
    if (keep) return;
    const v = document.getElementById('view');
    flashSaved(v);
    Fx.owner = null;
    if (io) { io.disconnect(); io = null; }
    if (!Fx.full()) return;
    const b = document.body;
    b.classList.remove('fx-enter'); void b.offsetWidth; b.classList.add('fx-enter');
    clearTimeout(Fx._t); Fx._t = setTimeout(() => b.classList.remove('fx-enter'), 1700);
    bars(v);
    v.querySelectorAll('.dt tbody tr[data-k]').forEach((tr, i) => { if (i < 18) tr.style.setProperty('--i', i); });
    reveal(v);
  };
})();
