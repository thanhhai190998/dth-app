// Màn hình: trang chủ (menu), danh sách, chi tiết, form thêm/sửa
(function () {
  const S = () => window.SCHEMA, TT = () => window.SCHEMA.tables;
  const esc = U.esc, enc = encodeURIComponent;
  const V = (window.Views = { state: {} });

  const quyen = () => App.user.quyen || {};
  const canItem = it => App.user.admin || Perm.rank(quyen()[it.perm]) > 0;
  const tableLv = t => permTableLevel(App.user, t);
  const rowLv = (t, r) => permRowLevel(App.user, t, r, (pt, k) => DB.get(pt, k));
  const fileName = p => String(p || '').split('/').pop().replace(/^[0-9a-f]{8}\./, '');

  V.items = () => S().groupsWithAlbums(DB);
  V.findItem = key => {
    for (const g of V.items()) for (const it of g.items) if (it.key === key) return it;
    if (TT()[key]) return { key, type: 'table', table: key, label: TT()[key].label, perm: key, ic: 'folder' };
    return null;
  };

  V.badgeHtml = b => b && b.text ? `<span class="badge ${esc(b.cls || '')}">${esc(b.text)}</span>` : '';
  V.imgTag = (t, r, field, cls) => `<img class="${cls || 'th'}" data-img="${esc(t)}|${esc(DB.keyOf(t, r))}|${esc(field)}" alt="">`;

  // Tải ảnh thật (qua API có kiểm tra quyền) cho mọi <img data-img> — chỉ tải khi ảnh sắp hiện trên màn hình
  const loadImg = img => {
    const [t, key, field] = img.dataset.img.split('|');
    const fail = mark => img.replaceWith(Object.assign(document.createElement('span'), { className: 'noimg ' + img.className, textContent: mark }));
    Files.url(t, key, field, 'thumb').then(u => { if (u) img.src = u; else fail('🖼️'); }).catch(() => fail('⚠️'));
  };
  const imgIO = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { imgIO.unobserve(e.target); loadImg(e.target); } }), { rootMargin: '400px 0px' })
    : null;
  V.hydrate = root => {
    root.querySelectorAll('img[data-img]:not([data-loading])').forEach(img => {
      img.dataset.loading = '1';
      img.decoding = 'async';
      const [t, key, field] = img.dataset.img.split('|');
      if (img.classList.contains('big')) img.onclick = () => V.lightbox(t, key, field);
      if (imgIO) imgIO.observe(img); else loadImg(img);
    });
  };
  // Xem ảnh lớn: ảnh luôn vừa màn hình; chụm 2 ngón / chạm đúp / lăn chuột để phóng to ngay trong khung
  // (chặn trình duyệt phóng to cả trang — trước đây thoát ra thì giao diện app bị phóng theo).
  // Hiện ngay ảnh nhỏ đã có (mờ), tải bản ~1600px rồi thay vào.
  V.lightbox = async (t, key, field) => {
    const bg = document.createElement('div');
    bg.className = 'lightbox';
    bg.innerHTML = `<div class="lb-stage"><span class="spin"></span></div>
      <button type="button" class="lb-x" aria-label="Đóng">${Icon('x')}</button>
      <div class="lb-hint">Chụm 2 ngón hoặc chạm đúp để phóng to · chạm ra ngoài ảnh để đóng</div>`;
    document.body.appendChild(bg);
    const stage = bg.querySelector('.lb-stage');
    const onKey = e => { if (e.key === 'Escape') close(); };
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    document.addEventListener('keydown', onKey);
    bg.querySelector('.lb-x').onclick = close;
    const show = (u, low) => { stage.innerHTML = `<img class="${low ? 'lb-low' : ''}" src="${u}" alt="" draggable="false">${low ? '<span class="spin"></span>' : ''}`; };
    const lowP = Files.ready(t, key, field, 'thumb');
    if (lowP) lowP.then(u => { if (u && stage.querySelector('.spin')) show(u, true); }).catch(() => {});
    try {
      const u = await Files.url(t, key, field, 'preview');
      if (!bg.isConnected) return;
      if (!u) { stage.textContent = 'Không tải được ảnh'; return; }
      show(u, false);
      zoomable(stage, stage.querySelector('img'), close);
    } catch (e) { stage.textContent = e.message; }
  };

  // Phóng to / kéo ảnh trong khung xem (ngón tay, chuột, bánh xe)
  function zoomable(stage, img, close) {
    let s = 1, tx = 0, ty = 0, g = null, lastTap = 0;
    const pts = new Map();
    const apply = () => {
      const r = stage.getBoundingClientRect(), w = img.offsetWidth * s, h = img.offsetHeight * s;
      const mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (h - r.height) / 2);
      tx = Math.min(mx, Math.max(-mx, tx)); ty = Math.min(my, Math.max(-my, ty));
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      stage.classList.toggle('zoomed', s > 1.01);
    };
    const rel = (x, y) => { const r = stage.getBoundingClientRect(); return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 }; };
    // Phóng quanh điểm p (toạ độ tính từ tâm khung): giữ nguyên điểm ảnh đang nằm dưới p
    const zoomAt = (p, ns) => { ns = Math.min(5, Math.max(1, ns)); tx = p.x - (p.x - tx) * ns / s; ty = p.y - (p.y - ty) * ns / s; s = ns; if (s === 1) tx = ty = 0; apply(); };
    const pair = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, m: rel((a.x + b.x) / 2, (a.y + b.y) / 2) }; };

    stage.addEventListener('pointerdown', e => {
      try { stage.setPointerCapture(e.pointerId); } catch (er) { /* bỏ qua */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const p = pair(); g = { pinch: true, d0: p.d, m0: p.m, s0: s, tx0: tx, ty0: ty, moved: true }; }
      else if (pts.size === 1) g = { pinch: false, x0: e.clientX, y0: e.clientY, tx0: tx, ty0: ty, t0: Date.now(), moved: false, onImg: e.target === img };
    });
    stage.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.pinch && pts.size === 2) {
        const p = pair(), ns = Math.min(5, Math.max(1, g.s0 * p.d / g.d0));
        tx = p.m.x - (g.m0.x - g.tx0) * ns / g.s0; ty = p.m.y - (g.m0.y - g.ty0) * ns / g.s0; s = ns;
        apply();
      } else if (!g.pinch) {
        const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
        if (Math.hypot(dx, dy) > 8) g.moved = true;
        if (s > 1) { tx = g.tx0 + dx; ty = g.ty0 + dy; apply(); }
      }
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (!g) return;
      if (g.pinch) { if (pts.size === 0) { g = null; if (s < 1.05) zoomAt({ x: 0, y: 0 }, 1); } return; }
      const tap = !g.moved && Date.now() - g.t0 < 350;
      if (tap) {
        const now = Date.now();
        if (now - lastTap < 300) { lastTap = 0; zoomAt(rel(e.clientX, e.clientY), s > 1.01 ? 1 : 2.5); }   // chạm đúp
        else {
          lastTap = now;
          if (!g.onImg && s <= 1.01) setTimeout(() => { if (lastTap === now) close(); }, 300);   // chạm ra ngoài ảnh → đóng
        }
      }
      g = null;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(rel(e.clientX, e.clientY), s * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); }, { passive: false });
  }

  // ---------------- TRANG CHỦ ----------------
  // ---------------- MENU: các nhóm/mục người dùng được xem (dùng cho trang chủ + menu trượt) ----------------
  V.navGroups = () => {
    const groups = V.items().map(g => ({ ...g, items: g.items.filter(canItem) })).filter(g => g.items.length);
    if (App.user.admin) groups.push({ key: 'adm', label: 'Quản trị', ic: 'shield', color: 'var(--g7)', items: [
      { key: '_admin', label: 'Phân quyền', ic: 'shield', desc: 'Người dùng & quyền', href: '#/admin', color: 'var(--g7)' },
      { key: 'ALBUM', label: 'Quản lý album', ic: 'image', desc: 'Thêm, sửa album ảnh', color: 'var(--g7)' },
      { key: '_settings', label: 'Cài đặt', ic: 'gear', desc: 'Mật khẩu chủ, cài app', href: '#/settings', color: 'var(--g7)' }
    ] });
    return groups;
  };
  V.hrefOf = it => it.href || '#/i/' + enc(it.key);

  function greeting() {
    const h = new Date().getHours();
    const hello = h < 11 ? 'Chào buổi sáng' : h < 13 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    const name = (window.Auth && Auth.given) || App.user.name || (App.user.email || '').split('@')[0];
    const day = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
    return { hello, name, day: day.charAt(0).toUpperCase() + day.slice(1) };
  }

  // ---------------- TRANG CHỦ: bảng điều khiển công việc (bố cục như app Phòng TCXL) ----------------
  // Ảnh đầu trang · 4 ô số liệu · 2 cột: trái = Transmittal (đang xử lý, gấp nhất trên cùng, rồi các bản vừa xong);
  // phải = Thao tác nhanh + Nhắc việc. Chỉ hiện phần người dùng được xem. Tìm mục / mọi mục: menu trái (☰).
  V.home = async () => {
    App.head(window.APP_CONFIG.appName, { home: true });
    App.loading();
    const groups = V.navGroups();
    const can = t => permTableLevel(App.user, t);
    const kpis = [
      // Đang làm / đã xong của transmittal và task (đếm như Dashboard công việc; transmittal đã chuyển không tính là đã xử lý)
      { id: 'tr', ts: ['Cong_viec'], label: 'Transmittal đang xử lý', ic: 'box', c: 'var(--pri)', href: '#/i/Cong_viec?Status=' + encodeURIComponent('Đang xử lý') },
      { id: 'trd', ts: ['Cong_viec'], label: 'Tổng số transmittal đã xử lý', ic: 'send', c: 'var(--g3)', href: '#/i/Cong_viec?Status=' + encodeURIComponent('Hoàn thành') },
      { id: 'tk', ts: ['Cong_viec_duoc_giao'], label: 'Task đang làm', ic: 'check', c: 'var(--g1)', href: '#/i/Cong_viec_duoc_giao' },
      { id: 'tkd', ts: ['Cong_viec_duoc_giao'], label: 'Tổng số task đã xử lý', ic: 'trophy', c: 'var(--g4)', href: '#/i/Cong_viec_duoc_giao' }
    ].filter(k => k.ts.some(t => can(t) > 0));
    // Thao tác nhanh: chỉ hiện việc người dùng được thêm
    const acts = [
      { t: 'Cong_viec', ic: 'box', c: 'var(--pri)', l: 'Thêm transmittal', d: 'Transmittal nhà thầu gửi, tự tính hạn trả lời' },
      { t: 'Cong_viec_duoc_giao', ic: 'check', c: 'var(--g1)', l: 'Thêm task', d: 'Việc được giao thêm' },
      { t: 'GIAODICH_THUCHI', ic: 'swap', c: 'var(--g3)', l: 'Ghi thu / chi', d: 'Thu nhập, chi tiêu' },
      { t: 'Kiem_tra_hang', ic: 'inspect', c: 'var(--g4)', l: 'Kiểm tra vật tư', d: 'Kiểm đếm, mở kiện, ảnh hiện trường' }
    ].filter(a => can(a.t) === 2);
    // Nhắc việc: giấy tờ sắp hết hạn, lịch 7 ngày tới, hẹn trả nợ 14 ngày tới, task đang làm (như trang Cảnh báo & nhắc việc)
    const DOCS = ['BANGCAP', 'Chungchi_congviec', 'Quyet_dinh'].filter(t => can(t) > 0);
    const remTs = [...DOCS, ...['Calendar', 'GIAODICH_VAY_MUON', 'Cong_viec_duoc_giao'].filter(t => can(t) > 0)];
    const trOk = can('Cong_viec') > 0;
    const warnIt = V.findItem('DASH_CANHBAO');
    // Khoảng thời gian (nhớ trong phiên): transmittal theo ngày nhận tài liệu, task theo ngày giao; Nhắc việc không lọc
    const hst = (V.state._home = V.state._home || { rg: { p: 'all', from: '', to: '' } }), rg = hst.rg;
    const inR = v => V.inRange(rg, v), rgTxt = V.rangeText(rg);

    const g = greeting();
    // Ảnh nhà máy bên phải, mờ dần vào nền màu (css .hero-img); thanh tiêu đề trong suốt phía trên ảnh (main.js App.topTint)
    App.hero(`<div class="hero-img" aria-hidden="true"></div><div class="hero-in ${kpis.length ? 'with-kpi' : ''}">
      <div class="hday">${esc(g.day)}</div>
      <h1 class="hhello">${esc(g.hello)}, ${esc(g.name)}</h1>
      <p class="hsub">Transmittal, công việc được giao, tài chính và hồ sơ cá nhân</p>
      ${kpis.length || trOk ? `<div class="hrange">${V.rangeBox(rg, 'Lọc số liệu: transmittal theo ngày nhận tài liệu, task theo ngày giao')}</div>` : ''}
    </div>`);
    V.rangeWire(document.getElementById('hero'), rg, () => V.home());

    let html = '';
    if (kpis.length) html += `<div class="kpi-row home">${kpis.map(k => `<a class="kcard" href="${k.href}" data-k="${k.id}" style="--kc:${k.c}">
      <span class="kic">${Icon(k.ic)}</span><span class="kl">${esc(k.label)}</span><span class="kn"><span class="skel"></span></span></a>`).join('')}</div>`;
    if (!groups.length) html += '<div class="empty">Tài khoản của bạn chưa được cấp quyền mục nào. Hãy liên hệ quản trị viên.</div>';
    else {
      // Thẻ cuối mỗi cột kéo dài, các dòng giãn đều → đáy 2 cột luôn bằng nhau (css .hcols)
      const L = [], R = [];
      if (trOk) L.push(`<section class="card hcard"><div class="hch"><h2>${Icon('box', 'sm')} Transmittal</h2><span class="muted small" id="htrn"></span>${rgTxt ? `<span class="hrg">${esc(rgTxt)}</span>` : ''}
        <a class="small hmore" href="#/i/Cong_viec">Xem tất cả →</a></div>
        <div class="hlist" id="htr"><span class="skel"></span></div></section>`);
      if (acts.length) R.push(`<section class="card hcard hq"><div class="hch"><h2>${Icon('plus', 'sm')} Thao tác nhanh</h2></div>
        <div class="${acts.length > 3 ? 'hq-g' : ''}">${acts.map(a => `<a class="hact" href="#/f/${a.t}/new" style="--ac:${a.c}"><span class="hai">${Icon(a.ic)}</span>
          <span class="hat"><b>${esc(a.l)}</b><small>${esc(a.d)}</small></span>${Icon('chevron', 'sm')}</a>`).join('')}</div></section>`);
      if (remTs.length) R.push(`<section class="card hcard"><div class="hch"><h2>${Icon('bell', 'sm')} Nhắc việc</h2>
        ${warnIt && canItem(warnIt) ? '<a class="small hmore" href="#/i/DASH_CANHBAO">Cảnh báo &amp; nhắc việc →</a>' : ''}</div>
        <div class="hlist" id="hrem"><span class="skel"></span></div></section>`);
      if (L.length || R.length) html += `<div class="hcols${L.length && R.length ? '' : ' one'}">${[L, R].filter(c => c.length).map(c => `<div class="hcol">${c.join('')}</div>`).join('')}</div>`;
    }
    App.main.innerHTML = html;

    // Số liệu (tải sau, không chặn trang)
    const need = [...new Set([...kpis.flatMap(k => k.ts), ...(trOk ? ['Cong_viec'] : []), ...remTs])].filter(t => can(t) > 0);
    if (!need.length) return;
    await Promise.all(need.map(t => DB.loadDeps(t).catch(() => {})));
    if (!App.main.querySelector('.kpi-row, .hcard')) return;   // đã sang trang khác trong lúc chờ
    const C = window.APP_CONFIG, today = U.today(), left = d => U.daysBetween(today, d);
    // Ô số liệu: đếm lên khi vừa mở trang
    const set = (id, n) => { const card = App.main.querySelector(`[data-k="${id}"]`); if (card) App.countTo(card.querySelector('.kn'), n, id); };
    const tr = DB.rows('Cong_viec').filter(r => inR(r.Date_Incoming)), pending = tr.filter(SCHEMA.transPending);
    const tk = DB.rows('Cong_viec_duoc_giao').filter(r => inR(r.Ngay_giao));
    set('tr', pending.length);
    set('trd', tr.filter(r => r.Ngay_hoan_thanh && !SCHEMA.transferred(r)).length);
    set('tk', tk.filter(r => r.Trang_thai === 'Đang xử lý').length);
    set('tkd', tk.filter(r => r.Trang_thai !== 'Đang xử lý' && (r.Trang_thai || r.Ngay_hoan_thanh)).length);   // "Đã xử lý" hoặc trạng thái tự ghi khác

    const tl = App.main.querySelector('#htr'), rl = App.main.querySelector('#hrem');
    let drawTr = () => {}, drawRem = () => {}, nTr = 0, nRem = 0;
    if (tl) {
      // Đang xử lý: hạn gần nhất (quá hạn) lên đầu; sau đó các bản đã xử lý / đã chuyển gần đây nhất
      const dl = r => U.isoOf(DB.val('Cong_viec', r, 'Deadline')) || '9999';
      const done = r => String(r.Ngay_hoan_thanh || r.Date_Incoming || '');
      const rows = [...pending.sort((a, b) => dl(a).localeCompare(dl(b))),
        ...tr.filter(r => !SCHEMA.transPending(r)).sort((a, b) => done(b).localeCompare(done(a)))];
      const hn = App.main.querySelector('#htrn'); if (hn) hn.textContent = pending.length ? pending.length + ' đang xử lý' : '';
      nTr = Math.min(rows.length, 20);
      drawTr = m => { tl.innerHTML = rows.length ? `<div class="hrow2 tr hth"><span>Số transmittal</span><span>Gói</span><span class="hin">Ngày nhận</span><span class="hdl">Hạn trả lời</span><span class="hn">Trạng thái</span></div>`
        + rows.slice(0, m).map(r => { const g = String(r.Goi_thau || ''), b = TT().Cong_viec.badge(r, DB);
          return `<a class="hrow2 tr" href="#/r/Cong_viec/${enc(DB.keyOf('Cong_viec', r))}" title="${esc(DB.title('Cong_viec', r))}">
            <b class="hg">${esc(DB.title('Cong_viec', r))}</b><span class="htag" style="--tc:${g ? toneOf(g.slice(0, 5)) : 'var(--muted)'}">${esc(g.slice(0, 5))}</span>
            <span class="hs hin">${esc(U.fmtDate(r.Date_Incoming))}</span><span class="hs hdl">${esc(U.fmtDate(DB.val('Cong_viec', r, 'Deadline')))}</span>
            <span class="hn">${V.badgeHtml(b)}</span></a>`; }).join('')
          + (rows.length > m ? `<div class="muted small hrest">+ ${U.int(rows.length - m)} transmittal khác — <a href="#/i/Cong_viec">xem danh sách</a></div>` : '')
        : `<div class="muted small hrest">${rgTxt ? 'Không có transmittal nào nhận trong ' + esc(rgTxt) : 'Chưa có transmittal nào'}</div>`; };
    }

    if (rl) {
      // Mỗi dòng: nội dung · loại · ngày · còn / quá N ngày. Có hạn thì gấp nhất lên đầu; task (không có hạn) xếp sau, giao lâu nhất trước
      const R = [];
      const due = (n, soon) => n < 0 ? { text: 'Quá ' + (-n) + ' ngày', cls: 'bad' } : { text: n === 0 ? 'Hôm nay' : 'Còn ' + n + ' ngày', cls: n <= soon ? 'warn' : 'info' };
      DOCS.forEach(t => DB.rows(t).forEach(r => { const n = SCHEMA.expiryDays(r.NgayHetHan);
        if (n != null && n <= C.expiryWarnDays) R.push({ t, r, l: 'Giấy tờ', k: 'doc', d: r.NgayHetHan, dl: 'hết hạn', n, b: n < 0 ? { text: 'Hết hạn', cls: 'bad' } : due(n, 30) }); }));
      if (can('Calendar') > 0) DB.rows('Calendar').forEach(r => { const n = left(r.NgayBatDau);
        if (n >= 0 && n <= 7) R.push({ t: 'Calendar', r, l: 'Lịch', k: 'cal', d: r.NgayBatDau, dl: 'bắt đầu', n, b: due(n, 1) }); });
      if (can('GIAODICH_VAY_MUON') > 0) {
        const owing = id => { const p = DB.get('NGUOI_VAY_MUON', id); return p ? U.num(DB.val('NGUOI_VAY_MUON', p, 'HoNoMinh')) + U.num(DB.val('NGUOI_VAY_MUON', p, 'MinhNoHo')) : 0; };
        DB.rows('GIAODICH_VAY_MUON').forEach(r => { const n = r.NgayHenTra ? left(r.NgayHenTra) : null;
          if (n != null && n <= 14 && owing(r.NguoiID) > 0) R.push({ t: 'GIAODICH_VAY_MUON', r, l: 'Trả nợ', k: 'debt', d: r.NgayHenTra, dl: 'hẹn trả', n, b: due(n, 3) }); });
      }
      if (can('Cong_viec_duoc_giao') > 0) DB.rows('Cong_viec_duoc_giao').filter(r => r.Trang_thai === 'Đang xử lý')
        .forEach(r => R.push({ t: 'Cong_viec_duoc_giao', r, l: 'Task', k: 'task', d: r.Ngay_giao, dl: 'giao ngày', n: null, b: { text: 'Đang làm', cls: 'muted' } }));
      R.sort((a, b) => (a.n == null) - (b.n == null) || (a.n != null ? a.n - b.n : String(a.d || '').localeCompare(String(b.d || ''))));
      nRem = Math.min(R.length, 12);
      drawRem = m => { rl.innerHTML = R.length ? `<div class="hrow2 rem hth"><span>Nội dung</span><span>Loại</span><span class="hn">Thời hạn</span></div>`
        + R.slice(0, m).map(x => `<a class="hrow2 rem" href="#/r/${x.t}/${enc(DB.keyOf(x.t, x.r))}" title="${esc(DB.title(x.t, x.r) + (x.d ? ' · ' + x.dl + ' ' + (x.k === 'cal' ? U.fmtDateTime(x.d) : U.fmtDate(x.d)) : ''))}">
            <b class="hg">${esc(DB.title(x.t, x.r))}</b><span class="htag t-${x.k}">${esc(x.l)}</span><span class="hn">${V.badgeHtml(x.b)}</span></a>`).join('')
          + (R.length > m ? `<div class="muted small hrest">+ ${U.int(R.length - m)} mục khác${warnIt && canItem(warnIt) ? ' — <a href="#/i/DASH_CANHBAO">xem tất cả</a>' : ''}</div>` : '')
        : `<div class="hok">${Icon('check', 'sm')} Không có gì cần nhắc — tốt lắm!</div>`; };
    }

    // Vừa 1 màn hình (máy tính, 2 cột): vẽ tối đa 20 transmittal / 12 nhắc việc rồi bớt dần dòng ở cột cao hơn tới khi cả trang
    // kể cả chân trang không phải cuộn (tối thiểu 3 dòng mỗi bảng). Điện thoại / cửa sổ hẹp (1 cột) cuộn bình thường, 10 / 6 dòng.
    // Đổi cỡ cửa sổ thì tính lại.
    const fit = () => {
      if (!document.body.contains(tl || rl)) return;   // đã sang trang khác
      const cols = App.main.querySelector('.hcols'), wide = cols && innerWidth > 860;
      let a = wide ? nTr : Math.min(nTr, 10), b = wide ? nRem : Math.min(nRem, 6);
      drawTr(a); drawRem(b);
      if (!wide) return;
      const colH = el => el ? el.closest('.hcol').offsetHeight : 0;
      cols.classList.add('fit');   // đo chiều cao tự nhiên từng cột (không kéo giãn cho bằng nhau)
      // Đo theo chiều cao thật của nội dung, bỏ min-height của main (tính từ --hero-h, biến này chỉ cập nhật ở khung hình sau)
      App.main.style.minHeight = '0px';
      for (let i = 0; i < 40 && document.documentElement.scrollHeight - innerHeight > 1; i++) {
        if (a > 3 && (colH(tl) >= colH(rl) || b <= 3)) drawTr(--a);
        else if (b > 3) drawRem(--b);
        else break;
      }
      // màn hình quá thấp, bớt tới tối thiểu vẫn phải cuộn → thôi bớt, hiện như điện thoại
      if (document.documentElement.scrollHeight - innerHeight > 1) { drawTr(Math.min(nTr, 10)); drawRem(Math.min(nRem, 6)); }
      App.main.style.minHeight = '';
      cols.classList.remove('fit');
    };
    V._homeFit = fit;
    fit();
    if (document.fonts) document.fonts.ready.then(fit);
    if (!V._homeFitBound) { V._homeFitBound = true; let tm; window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(() => V._homeFit(), 150); }); }
  };

  // ---------------- DANH SÁCH ----------------
  V.list = async key => {
    const it = V.findItem(key);
    if (!it || !canItem(it)) return App.notFound();
    if (it.type === 'dash') return Dash.render(it);
    if (it.type === 'music') return Music.render(it);
    if (it.table === 'Cong_viec' && window.TransGrid) return TransGrid.render(it);   // Transmittal: bảng kiểu Access, mỗi tài liệu 1 dòng
    const t = it.table, def = TT()[t], L = def.list || {};
    if (L.type !== 'gallery') return V.gridList(it);   // mọi danh sách khác (trừ album ảnh): bảng kiểu Access
    // Album ảnh: lưới ảnh như cũ
    App.head(it.label, { back: true });
    App.loading();
    await DB.loadDeps(t);
    const sorts = V.sortOptions(t);
    const st = (V.state[key] = V.state[key] || { q: '', f: null, s: sorts[0].id });
    const canAdd = App.user.admin || (it.album ? Perm.rank(quyen()[it.perm]) === 2 : tableLv(t) === 2);
    const addHref = `#/f/${t}/new` + (it.album ? '?Album=' + enc(it.album) : '');
    const chipField = L.type === 'gallery' || L.type === 'calendar' ? null : (L.filter || L.group);
    const dateF = L.range && L.sort && DB.field(t, L.sort);
    st.rg = st.rg || { p: 'all', from: '', to: '' };

    App.main.innerHTML = `<div class="lbar">
        <label class="lsearch">${Icon('search')}<input type="search" placeholder="Tìm trong ${esc(it.label.toLowerCase())}…" value="${esc(st.q)}"></label>
        ${sorts.length > 1 ? `<select class="lsort" title="Sắp xếp">${sorts.map(s => `<option value="${s.id}" ${s.id === st.s ? 'selected' : ''}>${esc(s.l)}</option>`).join('')}</select>` : ''}
        ${canAdd ? `<a class="btn ladd" href="${addHref}">${Icon('plus')}Thêm</a>` : ''}
      </div>
      ${dateF ? `<div class="lfil">
        <label class="tsel" title="Lọc theo ${esc(dateF.l.toLowerCase())}">${Icon('calendar')}<select id="tsel" aria-label="Khoảng thời gian">
          ${RANGES.map(([v, l]) => `<option value="${v}" ${v === st.rg.p ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <span class="trng" id="trng" ${st.rg.p === 'custom' ? '' : 'hidden'}>
          ${V.dateInput('id="tfrom"', st.rg.from, { label: 'Từ ngày' })}<span>→</span>${V.dateInput('id="tto"', st.rg.to, { label: 'Đến ngày' })}</span>
      </div>` : ''}
      <div class="chips-row" id="chips"></div><div class="lsum" id="lsum" hidden></div><div id="lst"></div>
      ${canAdd ? `<a class="fab" href="${addHref}" title="Thêm mới" style="--gc:${it.color || 'var(--pri)'}">${Icon('plus')}</a>` : ''}`;
    App.main.classList.toggle('has-fab', canAdd);

    // Lọc thời gian: dòng không có ngày bị loại khi đang chọn 1 khoảng
    const inRange = r => {
      if (!dateF) return true;
      const [a, b] = V.rangeOf(st.rg); if (!a && !b) return true;
      const v = U.isoOf(DB.val(t, r, L.sort)); if (!v) return false;
      return (!a || v >= a) && (!b || v <= b);
    };
    const base = () => V.filterRows(it, '').filter(inRange);
    const drawChips = () => {
      const box = document.getElementById('chips');
      if (!chipField) { box.hidden = true; return; }
      const all = base(), groups = new Map();
      all.forEach(r => { const g = groupValue(t, r, chipField); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
      if (groups.size < 2 && st.f == null) { box.hidden = true; return; }
      box.hidden = false;
      const n = rs => esc(L.sum ? V.fmtSum(t, V.sumOf(t, rs), true) : String(rs.length));   // có cột cộng → nút lọc hiện tổng (vd tổng kiện)
      const keys = V.orderGroups(t, chipField, [...groups.keys()]);
      if (st.f != null && !groups.has(st.f)) keys.push(st.f);
      box.innerHTML = [`<button class="chip2 ${st.f == null ? 'on' : ''}" data-f="">Tất cả <b>${L.sumSplit ? all.length : n(all)}</b></button>`,
        ...keys.map(k => `<button class="chip2 ${st.f === k ? 'on' : ''}" data-f="${esc(k)}">${esc(k || '(trống)')} <b>${n(groups.get(k) || [])}</b></button>`)].join('');
      box.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
        st.f = b.dataset.f === '' ? null : b.dataset.f;
        drawChips(); draw();
      });
    };
    // Dòng tổng: số dòng + tổng cột cộng + khoảng thời gian đang lọc
    const drawSum = rows => {
      const box = document.getElementById('lsum'), [a, b] = V.rangeOf(st.rg), on = a || b;
      box.hidden = !(L.sum || on);
      if (box.hidden) return;
      const span = on ? (a && b ? `${U.fmtDate(a)} → ${U.fmtDate(b)}` : a ? 'từ ' + U.fmtDate(a) : 'đến ' + U.fmtDate(b)) : 'mọi thời gian';
      let tot = '';
      if (L.sumSplit && st.f != null && chipField === L.sumSplit[0]) tot = ` · tổng <b>${esc(V.fmtSum(t, V.sumOf(t, rows)))}</b>`;   // đang lọc riêng Thu hoặc Chi
      else if (L.sumSplit) {   // vd Thu chi: cộng thu, trừ chi — không cộng chung 2 loại
        const [col, plus, minus] = L.sumSplit, by = v => V.sumOf(t, rows.filter(r => String(r[col]) === v)), p = by(plus), m = by(minus);
        tot = ` · ${esc(plus.toLowerCase())} <b>${esc(V.fmtSum(t, p))}</b> · ${esc(minus.toLowerCase())} <b>${esc(V.fmtSum(t, m))}</b>`
          + (st.f == null ? ` · chênh lệch <b class="${p - m < 0 ? 'neg' : 'pos'}">${p - m < 0 ? '−' : ''}${esc(V.fmtSum(t, Math.abs(p - m)))}</b>` : '');
      } else if (L.sum) tot = ` · tổng <b>${esc(V.fmtSum(t, V.sumOf(t, rows)))}</b>`;
      box.innerHTML = `${Icon('chart', 'sm')}<span><b>${rows.length}</b> ${esc(L.countUnit || 'mục')}${tot}
        <span class="muted">· ${esc(span)}${st.f != null ? ' · ' + esc(st.f || '(trống)') : ''}${st.q ? ' · khớp "' + esc(st.q) + '"' : ''}</span></span>`;
    };
    const draw = () => {
      let rows = V.filterRows(it, st.q).filter(inRange);
      if (chipField && st.f != null) rows = rows.filter(r => groupValue(t, r, chipField) === st.f);
      drawSum(rows);
      const flat = chipField && st.f != null && chipField === L.group;
      document.getElementById('lst').innerHTML = rows.length
        ? V.renderRows(t, rows, { flat, sortBy: st.s, item: it })
        : `<div class="lempty"><span class="tic" style="--gc:${it.color || 'var(--g7)'}">${Icon(it.ic || 'folder')}</span>
            <div>${st.q || st.f != null ? 'Không có mục nào khớp' : 'Chưa có dữ liệu'}</div>
            ${canAdd && !st.q ? `<a class="btn" href="${addHref}">${Icon('plus')}Thêm mới</a>` : ''}</div>`;
      V.hydrate(App.main);
    };
    App.main.querySelector('.lsearch input').oninput = e => { st.q = e.target.value; draw(); };
    const ss = App.main.querySelector('.lsort');
    if (ss) ss.onchange = () => { st.s = ss.value; draw(); };
    if (dateF) {
      V.dates(App.main);
      const sel = document.getElementById('tsel'), rng = document.getElementById('trng'), fr = document.getElementById('tfrom'), to = document.getElementById('tto');
      sel.onchange = () => {
        st.rg.p = sel.value;
        if (sel.value === 'custom' && !st.rg.from && !st.rg.to) {   // gợi ý sẵn: đầu tháng này → hôm nay
          const d = new Date(); st.rg.from = fr.value = U.iso(new Date(d.getFullYear(), d.getMonth(), 1)); st.rg.to = to.value = U.today();
          fr._sync(); to._sync();
        }
        rng.hidden = sel.value !== 'custom';
        drawChips(); draw();
      };
      fr.onchange = to.onchange = () => { st.rg.from = fr.value; st.rg.to = to.value; drawChips(); draw(); };
    }
    drawChips(); draw();
  };

  // ---------------- DANH SÁCH DẠNG BẢNG (kiểu MS Access, như app Phòng TCXL — js/grid.js) ----------------
  // Chọn / đổi thứ tự cột, sắp xếp + lọc từng cột (lưu trên máy), xuất Excel; dòng tổng (list.sum, list.sumSplit),
  // lọc thời gian (list.range). Cột mặc định: list.tcols trong schema.js. Mở kèm bộ lọc: #/i/<mục>?<cột>=<giá trị>
  V.gridList = async it => {
    const key = it.key, t = it.table, def = TT()[t], L = def.list || {};
    App.head(it.label, { back: true });
    App.loading();
    await DB.loadDeps(t);
    const st = (V.state[key] = V.state[key] || {});
    st.q = st.q || ''; st.flt = st.flt || {}; st.rg = st.rg || { p: 'all', from: '', to: '' };
    if (st.sort === undefined) st.sort = L.sort ? { n: L.sort, dir: L.desc ? -1 : 1 } : null;
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');
    if ([...qs.keys()].length) {
      st.flt = {}; st.top = 0;
      qs.forEach((v, k) => { if (DB.field(t, k)) st.flt[k] = { vals: [v === '' || v === '(trống)' ? Grid.EMPTY : v] }; });
      st.q = qs.get('q') || '';
      history.replaceState(null, '', '#/i/' + enc(key));
    }
    const canAdd = App.user.admin || (it.album ? Perm.rank(quyen()[it.perm]) === 2 : tableLv(t) === 2);
    const addHref = `#/f/${t}/new` + (it.album ? '?Album=' + enc(it.album) : '');
    const dateF = L.range && L.sort && DB.field(t, L.sort);

    App.main.innerHTML = `<div class="lbar">
        <label class="lsearch">${Icon('search')}<input type="search" placeholder="Tìm trong ${esc(it.label.toLowerCase())}…" value="${esc(st.q)}"></label>
        <button type="button" class="btn ghost ladd" data-cols title="Chọn cột hiển thị, đổi thứ tự cột">${Icon('cols')}<span>Cột</span></button>
        <button type="button" class="btn ghost ladd" data-xlsx title="Xuất Excel các dòng đang hiện (theo bộ lọc)">${Icon('download')}<span>Xuất Excel</span></button>
        ${canAdd ? `<a class="btn ladd" href="${addHref}">${Icon('plus')}<span>Thêm</span></a>` : ''}
      </div>
      ${dateF ? `<div class="lfil">${V.rangeBox(st.rg, 'Lọc theo ' + dateF.l.toLowerCase())}</div>` : ''}
      <div class="lsum" id="lsum"></div><div class="gfbar" id="gfbar" hidden></div>
      <div class="gwrap" id="grid"></div>
      ${canAdd ? `<a class="fab" href="${addHref}" title="Thêm mới" style="--gc:${it.color || 'var(--pri)'}">${Icon('plus')}</a>` : ''}`;
    App.main.classList.toggle('has-fab', canAdd);

    // Lọc thời gian: dòng không có ngày bị loại khi đang chọn 1 khoảng
    const inRange = r => !dateF || V.inRange(st.rg, DB.val(t, r, L.sort));
    // Dòng tổng: số dòng + tổng cột cộng (Thu chi: thu · chi · chênh lệch) + khoảng thời gian / chữ đang tìm
    const drawSum = rows => {
      const [a, b] = V.rangeOf(st.rg), on = a || b;
      const span = on ? (a && b ? `${U.fmtDate(a)} → ${U.fmtDate(b)}` : a ? 'từ ' + U.fmtDate(a) : 'đến ' + U.fmtDate(b)) : '';
      let tot = '';
      if (L.sumSplit) {
        const [col, plus, minus] = L.sumSplit, fc = st.flt[col];
        if (fc && fc.vals && fc.vals.length === 1) tot = ` · tổng <b>${esc(V.fmtSum(t, V.sumOf(t, rows)))}</b>`;   // đang lọc riêng Thu hoặc Chi
        else {
          const by = v => V.sumOf(t, rows.filter(r => String(r[col]) === v)), p = by(plus), m = by(minus);
          tot = ` · ${esc(plus.toLowerCase())} <b>${esc(V.fmtSum(t, p))}</b> · ${esc(minus.toLowerCase())} <b>${esc(V.fmtSum(t, m))}</b>`
            + ` · chênh lệch <b class="${p - m < 0 ? 'neg' : 'pos'}">${p - m < 0 ? '−' : ''}${esc(V.fmtSum(t, Math.abs(p - m)))}</b>`;
        }
      } else if (L.sum) tot = ` · tổng <b>${esc(V.fmtSum(t, V.sumOf(t, rows)))}</b>`;
      const all = V.filterRows(it, '').length, notes = [span, st.q ? 'khớp "' + st.q + '"' : '', rows.length < all ? 'trong ' + U.int(all) : ''].filter(Boolean);
      document.getElementById('lsum').innerHTML = `${Icon('table', 'sm')}<span><b>${U.int(rows.length)}</b> ${esc(L.countUnit || 'mục')}${tot}
        ${notes.length ? `<span class="muted">· ${notes.map(esc).join(' · ')}</span>` : ''}</span>`;
    };
    // Các bộ lọc cột đang dùng: mỗi cái 1 nhãn (bấm để bỏ) + Xoá tất cả
    const drawFbar = () => {
      const box = document.getElementById('gfbar'), act = Grid.active(st.flt);
      box.hidden = !act.length;
      box.innerHTML = `${Icon('filter', 'sm')}${act.map(n => `<button type="button" class="xchip" data-xf="${esc(n)}" title="Bỏ lọc cột này">${esc(n === '_badge' ? L.badgeLabel || 'Trạng thái' : Grid.short(DB.field(t, n).l))}: <b>${esc(Grid.summary(t, n, st.flt[n]))}</b> ${Icon('x', 'sm')}</button>`).join('')}
        ${act.length > 1 ? '<button type="button" class="linkbtn" data-xall>Xoá tất cả lọc</button>' : ''}`;
      box.querySelectorAll('[data-xf]').forEach(b => b.onclick = () => { delete st.flt[b.dataset.xf]; st.top = 0; draw(); });
      const xa = box.querySelector('[data-xall]'); if (xa) xa.onclick = () => { st.flt = {}; st.top = 0; draw(); };
    };
    let shown = [];
    const draw = () => {
      const empty = st.q || Grid.active(st.flt).length || (dateF && st.rg.p !== 'all') ? 'Không có dòng nào khớp — bỏ bớt bộ lọc'
        : `Chưa có dữ liệu${canAdd ? ` · <a href="${addHref}">Thêm mới</a>` : ''}`;
      drawFbar();
      const grid = document.getElementById('grid');
      shown = Grid.mount(grid, { t, st, rows: V.filterRows(it, st.q).filter(inRange), onFilter: draw, empty });
      drawSum(shown);
      Grid.fit(grid); grid.dispatchEvent(new Event('scroll'));   // dòng tổng vừa vẽ đẩy bảng xuống → tính lại chiều cao
    };
    let qt = null;
    App.main.querySelector('.lsearch input').oninput = e => { st.q = e.target.value; st.top = 0; clearTimeout(qt); qt = setTimeout(draw, 150); };
    App.main.querySelector('[data-cols]').onclick = () => Grid.chooser(t, draw);
    App.main.querySelector('[data-xlsx]').onclick = async e => {
      const b = e.currentTarget, html = b.innerHTML;
      if (!shown.length) return U.toast('Không có dòng nào để xuất');
      b.disabled = true; b.innerHTML = `${Icon('download')}<span>Đang xuất…</span>`;
      try { await Grid.xlsx(t, shown, { name: it.label }); U.toast(`Đã xuất ${U.int(shown.length)} dòng ra Excel`, 'ok'); }
      catch (er) { U.toast(er.message, 'err'); }
      finally { b.disabled = false; b.innerHTML = html; }
    };
    V.rangeWire(App.main, st.rg, () => { st.top = 0; draw(); });
    draw();
  };

  // Tổng cột số (list.sum) của các dòng; tiền → "1.200.000 ₫", số → "308 kiện"
  V.sumOf = (t, rows) => { const n = (TT()[t].list || {}).sum; return n ? rows.reduce((a, r) => a + U.num(DB.val(t, r, n)), 0) : rows.length; };
  V.fmtSum = (t, v, short) => {
    const L = TT()[t].list || {}, f = L.sum && DB.field(t, L.sum);
    if (f && f.t === 'price') return U.money(v);
    return U.int(v) + (L.unit && !short ? ' ' + L.unit : '');
  };

  // Bộ lọc thời gian (danh sách list.range, Dashboard công việc, trang chủ)
  const RANGES = [['all', 'Mọi thời gian'], ['m0', 'Tháng này'], ['m1', 'Tháng trước'], ['q0', 'Quý này'], ['m3', '3 tháng gần đây'],
    ['m12', '12 tháng gần đây'], ['y0', 'Năm nay'], ['y1', 'Năm trước'], ['custom', 'Chọn từ ngày… đến ngày…']];
  // Ô chọn khoảng thời gian dùng chung: V.rangeBox(rg) → HTML (ô chọn + 2 ô ngày khi "Chọn từ ngày…"), V.rangeWire(root, rg, onChange)
  // gắn sự kiện; rg = { p, from, to } (yyyy-mm-dd) được sửa trực tiếp. V.inRange(rg, ngày) → ngày có nằm trong khoảng không
  // (đang chọn 1 khoảng thì dòng không có ngày bị loại).
  V.rangeBox = (rg, title) => `<span class="rgbox"><label class="tsel" title="${esc(title || 'Khoảng thời gian')}">${Icon('calendar')}<select data-rg aria-label="Khoảng thời gian">
      ${RANGES.map(([v, l]) => `<option value="${v}" ${v === rg.p ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <span class="trng" data-rgc ${rg.p === 'custom' ? '' : 'hidden'}>
      ${V.dateInput('data-rgf', rg.from, { label: 'Từ ngày' })}<span>→</span>${V.dateInput('data-rgt', rg.to, { label: 'Đến ngày' })}</span></span>`;
  V.rangeWire = (root, rg, onChange) => {
    const box = root.querySelector('.rgbox'); if (!box) return;
    V.dates(box);
    const sel = box.querySelector('[data-rg]'), rng = box.querySelector('[data-rgc]'), fr = box.querySelector('[data-rgf]'), to = box.querySelector('[data-rgt]');
    sel.onchange = () => {
      rg.p = sel.value;
      if (sel.value === 'custom' && !rg.from && !rg.to) {   // gợi ý sẵn: đầu tháng này → hôm nay
        const d = new Date(); rg.from = fr.value = U.iso(new Date(d.getFullYear(), d.getMonth(), 1)); rg.to = to.value = U.today();
        fr._sync(); to._sync();
      }
      rng.hidden = sel.value !== 'custom';
      onChange();
    };
    fr.onchange = to.onchange = () => { rg.from = fr.value; rg.to = to.value; onChange(); };
  };
  V.inRange = (rg, v) => {
    const [a, b] = V.rangeOf(rg); if (!a && !b) return true;
    const d = U.isoOf(v); return !!d && (!a || d >= a) && (!b || d <= b);
  };
  V.rangeText = rg => {   // "tháng này" / "01/10/2026 → 31/10/2026" (để ghi chú số liệu đang lọc)
    if (!rg || rg.p === 'all') return '';
    if (rg.p !== 'custom') return (RANGES.find(x => x[0] === rg.p) || ['', ''])[1].toLowerCase();
    const [a, b] = V.rangeOf(rg);
    return a && b ? `${U.fmtDate(a)} → ${U.fmtDate(b)}` : a ? 'từ ' + U.fmtDate(a) : b ? 'đến ' + U.fmtDate(b) : '';
  };
  V.rangeOf = rg => {   // → [từ, đến] dạng yyyy-mm-dd ('' = không giới hạn)
    const d = new Date(), y = d.getFullYear(), m = d.getMonth(), iso = U.iso;
    switch (rg && rg.p) {
      case 'm0': return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
      case 'm1': return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
      case 'q0': { const q = Math.floor(m / 3) * 3; return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))]; }
      case 'm3': return [iso(new Date(y, m - 2, 1)), iso(new Date(y, m + 1, 0))];
      case 'm12': return [iso(new Date(y, m - 11, 1)), iso(new Date(y, m + 1, 0))];
      case 'y0': return [y + '-01-01', y + '-12-31'];
      case 'y1': return [(y - 1) + '-01-01', (y - 1) + '-12-31'];
      case 'custom': return [rg.from || '', rg.to || ''];
      default: return ['', ''];
    }
  };

  // Các kiểu sắp xếp cho 1 bảng: theo ngày (mới/cũ) nếu có, và theo tên
  V.sortOptions = t => {
    const L = TT()[t].list || {}, f = L.sort && DB.field(t, L.sort);
    const isDate = f && /^(date|datetime|expiry)$/.test(f.t);
    const o = [];
    if (isDate) {
      const a = { id: 'd-desc', l: 'Mới nhất' }, b = { id: 'd-asc', l: 'Cũ nhất' };
      if (L.desc) o.push(a, b); else o.push(b, a);
    } else if (f && (f.t === 'number' || f.t === 'price')) o.push({ id: 'def', l: 'Mặc định' });   // vd thứ tự album
    o.push({ id: 'az', l: 'Tên A → Z' });
    return o;
  };

  V.orderGroups = (t, field, keys) => {
    const L = TT()[t].list || {}, f = DB.field(t, field);
    const order = (field === L.group && L.groupOrder) || (f && f.opts) || null;
    return keys.sort((a, b) => {
      if (order) { const ia = order.indexOf(a), ib = order.indexOf(b); if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); }
      return a.localeCompare(b, 'vi', { numeric: true });
    });
  };

  V.filterRows = (it, query) => {
    const t = it.table, def = TT()[t];
    let rows = DB.rows(t);
    if (it.album) rows = rows.filter(r => r.Album === it.album);
    if (query) {
      const fs = def.fields.filter(f => !f.enc && f.t !== 'image' && f.t !== 'file');
      rows = rows.filter(r => {
        const text = [DB.title(t, r), DB.sub(t, r)], dates = [];
        fs.forEach(f => {
          const v = f.t === 'ref' ? DB.title(f.ref, DB.get(f.ref, r[f.n])) : DB.val(t, r, f.n);
          if (/^(date|datetime|expiry)$/.test(f.t) || U.isDateLike(v)) dates.push(f.t === 'datetime' ? U.fmtDateTime(v) : U.fmtDate(v));   // ngày → dd/mm/yyyy, tách riêng
          else text.push(v);
        });
        return U.match(text.join(' '), query, dates.join(' '));
      });
    }
    return rows;
  };

  function cmp(a, b, type) {
    if (type === 'date' || type === 'datetime' || type === 'expiry') {
      const x = U.parseDate(a), y = U.parseDate(b);
      return (x ? x.getTime() : -Infinity) - (y ? y.getTime() : -Infinity) || 0;
    }
    if (type === 'number' || type === 'price') return U.num(a) - U.num(b);
    return String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true });
  }

  function groupValue(t, r, g) {
    const f = DB.field(t, g), v = DB.val(t, r, g);
    if (f && f.t === 'ref') { const rr = DB.get(f.ref, v); return rr ? DB.title(f.ref, rr) : (v || ''); }
    return v == null ? '' : String(v);
  }

  // Biểu tượng + màu của mục chứa bảng t (dùng cho dòng không có ảnh)
  const metaOf = t => {
    for (const g of V.items()) for (const it of g.items) if (it.table === t) return { ic: it.ic, color: it.color };
    return { ic: 'folder', color: 'var(--g7)' };
  };
  // Chữ cái đầu của họ + tên: "Trần Văn An" → "TA"
  const initials = s => {
    const w = String(s || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
    return (w.length > 1 ? w[0].charAt(0) + w[w.length - 1].charAt(0) : (w[0] || '?').charAt(0)).toUpperCase();
  };
  // Màu cố định theo giá trị (vd mỗi gói thầu một màu)
  const TONES = ['var(--g0)', 'var(--g3)', 'var(--g4)', 'var(--g1)', 'var(--g5)', 'var(--g2)', 'var(--g7)'];
  const toneOf = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TONES[h % TONES.length]; };

  // Ô đầu dòng: ảnh → giá trị ngắn (vd mã gói) → chữ cái đầu → biểu tượng mục
  function leadHtml(t, r, meta, cls = '', noImg = false) {
    const def = TT()[t], L = def.list || {};
    const leadVal = L.lead && r[L.lead] ? String(r[L.lead]).slice(0, 5) : '';
    if (!noImg && def.img && r[def.img]) return V.imgTag(t, r, def.img);
    if (leadVal) return `<span class="lead tx ${cls}" style="--gc:${toneOf(leadVal)}">${esc(leadVal)}</span>`;
    if (L.avatar === 'initials') return `<span class="lead av ${cls}" style="--gc:${meta.color}">${esc(initials(DB.title(t, r)))}</span>`;
    return `<span class="lead ${cls}" style="--gc:${meta.color}">${Icon(meta.ic)}</span>`;
  }

  function rowHtml(t, r, meta) {
    const def = TT()[t], L = def.list || {};
    const cols = (meta.compact ? [] : L.cols || []).map(c => {
      const f = DB.field(t, c); if (!f || c === meta.skip) return '';
      const v = f.enc ? (r[c] ? '••••••' : '') : DB.show(t, r, c, true);
      return v ? `<span><i>${esc(f.l)}</i> ${v}</span>` : '';
    }).filter(Boolean).join('');
    const sub = DB.sub(t, r), title = DB.title(t, r), b = DB.badge(t, r);
    return `<a class="row" href="#/r/${t}/${enc(DB.keyOf(t, r))}" ${b && b.cls ? `data-tone="${esc(b.cls)}"` : ''}>${leadHtml(t, r, meta)}
      <div class="row-main"><div class="row-title">${esc(title)}</div>
      ${sub ? `<div class="row-sub">${esc(sub)}</div>` : ''}${cols ? `<div class="row-meta">${cols}</div>` : ''}</div>
      ${V.badgeHtml(b)}</a>`;
  }

  V.renderRows = (t, rows, opts = {}) => {
    const def = TT()[t], L = def.list || {};
    if (!rows.length) return '<div class="empty">Chưa có dữ liệu</div>';
    const meta = Object.assign({}, opts.item ? { ic: opts.item.ic || 'folder', color: opts.item.color || 'var(--g7)' } : metaOf(t), { skip: opts.skip, compact: opts.compact });
    const row = r => rowHtml(t, r, meta);
    rows = rows.slice();
    const sb = opts.sortBy || (L.sort ? (L.desc ? 'd-desc' : 'def') : null);
    if (sb === 'az') rows.sort((a, b) => DB.title(t, a).localeCompare(DB.title(t, b), 'vi', { numeric: true }));
    else if (sb !== 'none' && L.sort) {
      const f = DB.field(t, L.sort), dir = sb === 'd-desc' || (sb !== 'd-asc' && L.desc) ? -1 : 1;
      rows.sort((a, b) => cmp(DB.val(t, a, L.sort), DB.val(t, b, L.sort), f && f.t) * dir);
    }

    if (L.type === 'gallery' && !opts.flat) {
      return `<div class="gallery">${rows.map(r => `<a class="ph" href="#/r/${t}/${enc(DB.keyOf(t, r))}">
        ${r.Hinh_anh ? V.imgTag(t, r, 'Hinh_anh') : `<span class="noimg th">${Icon('image')}</span>`}
        ${r.Mo_ta ? `<span class="cap">${esc(r.Mo_ta)}</span>` : ''}</a>`).join('')}</div>`;
    }
    if (L.type === 'calendar' && !opts.flat) {
      const now = U.parseDate(U.today());
      const up = rows.filter(r => (U.parseDate(r.NgayKetThuc || r.NgayBatDau) || 0) >= now);
      const past = rows.filter(r => !up.includes(r)).reverse();
      const sec = (title, rs) => rs.length ? `<details class="lgrp" open><summary>${title} <span class="cnt">${rs.length}</span></summary>${rs.map(row).join('')}</details>` : '';
      return sec('Sắp tới', up) + sec('Đã qua', past);
    }
    if (L.group && !opts.flat) {
      const groups = new Map();
      rows.forEach(r => { const g = groupValue(t, r, L.group); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
      const keys = V.orderGroups(t, L.group, [...groups.keys()]);
      // Có cột cộng (vd số kiện): tiêu đề nhóm hiện tổng, kèm số dòng
      const head = rs => L.sum ? `<span class="cnt">${esc(V.fmtSum(t, V.sumOf(t, rs)))}</span><span class="gsub">${rs.length} ${esc(L.countUnit || 'mục')}</span>`
        : `<span class="cnt">${rs.length}</span>`;
      return keys.map(g => `<details class="lgrp" open><summary>${esc(g || '(trống)')} ${head(groups.get(g))}</summary>
        ${groups.get(g).map(row).join('')}</details>`).join('');
    }
    return `<div class="rows">${rows.map(row).join('')}</div>`;
  };

  // ---------------- CHI TIẾT ----------------
  V.detail = async (t, key) => {
    const def = TT()[t];
    if (!def) return App.notFound();
    App.head(def.label, { back: true });
    App.loading();
    await DB.loadDeps(t, true);
    const r = DB.get(t, key);
    if (!r) { App.main.innerHTML = '<div class="empty">Không tìm thấy bản ghi (có thể đã bị xoá hoặc bạn không có quyền xem).</div>'; return; }
    const lv = rowLv(t, r), D = def.detail || {}, meta = metaOf(t);
    const title = DB.title(t, r), sub = DB.sub(t, r), badge = DB.badge(t, r);
    const imgs = def.fields.filter(f => f.t === 'image' && r[f.n]);
    const stats = (D.stats || []).map(n => DB.field(t, n)).filter(f => f && !f.enc && DB.show(t, r, f.n) !== '');
    const skip = new Set([...(D.hide || []), ...stats.map(f => f.n)]);

    // Phần đầu: biểu tượng, tiêu đề, nhãn tình trạng, nút sửa/xoá, ảnh, các mốc quan trọng
    let html = `<div class="card dhero" style="--gc:${meta.color}">
      <div class="dh-top">${leadHtml(t, r, meta, 'big', true)}
        <div class="dh-main"><h2 class="dtitle">${esc(title)}</h2>${sub ? `<div class="dsub">${esc(sub)}</div>` : ''}${V.badgeHtml(badge)}</div>
        ${lv >= 2 ? `<div class="dh-act"><a class="ibtn2" href="#/f/${t}/${enc(key)}" title="Sửa">${Icon('edit')}</a>
          <button class="ibtn2 danger" data-del title="Xoá">${Icon('trash')}</button></div>` : ''}
      </div>
      ${imgs.length ? `<div class="dimgs">${imgs.map(f => `<figure>${V.imgTag(t, r, f.n, 'big')}<figcaption>${esc(f.l)}</figcaption></figure>`).join('')}</div>` : ''}
      ${stats.length ? `<div class="dstats">${stats.map(f => `<div class="dstat"><span class="sl">${esc(f.l)}</span><span class="sv">${DB.show(t, r, f.n, true)}</span></div>`).join('')}</div>` : ''}
    </div>`;

    // Các thông tin còn lại: nhãn bên trái, giá trị bên phải (giá trị dài thì xuống dòng)
    const rowsHtml = def.fields.filter(f => f.t !== 'image' && !skip.has(f.n)).map(f => {
      const raw = r[f.n];
      let v, stack = false;
      if (f.enc) {
        if (!raw) return '';
        v = `<span class="secret" data-enc="${esc(f.n)}">••••••••</span>
          <button class="ibtn3" data-reveal="${esc(f.n)}" title="Hiện">${Icon('eye')}</button>
          ${Vault.isEnc(raw) ? '' : '<span class="badge warn" title="Giá trị này đang lưu dạng chữ thường">chưa mã hoá</span>'}`;
      } else if (f.t === 'file') {
        if (!raw) return '';
        v = `<button class="fchip" data-file="${esc(f.n)}">${Icon('file')}<span>${esc(fileName(raw))}</span>${Icon('open', 'sm')}</button>`;
      } else {
        v = DB.show(t, r, f.n);
        if (v === '' || v == null) return '';
        if (String(DB.val(t, r, f.n)).trim() === title.trim()) return '';   // trùng tiêu đề → bỏ
        if (f.t === 'phone') v += ` <a class="ibtn3" href="tel:${esc(String(raw).replace(/\s/g, ''))}" title="Gọi">${Icon('phone')}</a>`;
        if (f.t === 'email') v += ` <a class="ibtn3" href="mailto:${esc(raw)}" title="Gửi email">${Icon('mail')}</a>`;
        stack = f.t === 'longtext' || String(DB.val(t, r, f.n)).length > 38;
      }
      return `<div class="frow ${stack ? 'stack' : ''}"><span class="fk">${esc(f.l)}</span><span class="fv">${v}</span></div>`;
    }).join('');
    if (rowsHtml) html += `<div class="card dfields">${rowsHtml}</div>`;

    for (const rel of def.related || []) {
      if (tableLv(rel.t) < 1) continue;
      const rows = DB.rows(rel.t).filter(x => String(x[rel.fk]) === String(key));
      const rm = metaOf(rel.t);
      html += `<section class="card rel"><div class="rel-h"><span class="gic" style="--gc:${rm.color}">${Icon(rm.ic)}</span>
        <h3>${esc(rel.l)}</h3><span class="cnt">${rows.length}</span>
        ${tableLv(rel.t) === 2 ? `<a class="btn sm" href="#/f/${rel.t}/new?${enc(rel.fk)}=${enc(key)}">${Icon('plus', 'sm')} Thêm</a>` : ''}</div>
        ${rows.length ? V.renderRows(rel.t, rows, { flat: true, skip: rel.fk }) : '<div class="muted small rel-empty">Chưa có</div>'}</section>`;
    }
    App.main.innerHTML = html;
    V.hydrate(App.main);

    App.main.querySelectorAll('[data-file]').forEach(b => b.onclick = () => Files.open(t, key, b.dataset.file));
    App.main.querySelectorAll('[data-reveal]').forEach(btn => btn.onclick = async () => {
      const n = btn.dataset.reveal, span = App.main.querySelector(`[data-enc="${CSS.escape(n)}"]`);
      if (btn.dataset.shown) { span.textContent = '••••••••'; btn.innerHTML = Icon('eye'); delete btn.dataset.shown; return; }
      let val = r[n];
      if (Vault.isEnc(val)) { if (!(await Vault.ensureOpen())) return; val = await Vault.dec(val); }
      span.textContent = val; btn.innerHTML = Icon('x'); btn.title = 'Ẩn'; btn.dataset.shown = '1';
      if (navigator.clipboard && !btn.nextElementSibling?.dataset?.copy) {
        const c = Object.assign(document.createElement('button'), { className: 'ibtn3', title: 'Sao chép', innerHTML: Icon('copy') });
        c.dataset.copy = '1';
        c.onclick = () => navigator.clipboard.writeText(span.textContent).then(() => U.toast('Đã sao chép'));
        btn.after(c);
      }
      setTimeout(() => { if (btn.isConnected && btn.dataset.shown) btn.click(); }, 30000);
    });
    const del = App.main.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      if (!(await U.confirm('Xoá "' + title + '"? Thao tác này không hoàn tác được.'))) return;
      try { await DB.remove(t, key); U.toast('Đã xoá', 'ok'); history.back(); } catch (e) { U.toast(e.message, 'err'); }
    };
  };

  // ---------------- FORM THÊM / SỬA ----------------
  const SEG_MAX = 6;   // danh sách chọn có ≤ 6 lựa chọn → hiện thành nút bấm thay vì danh sách thả xuống

  // Ô ngày luôn hiện dd/mm/yyyy (ô ngày gốc của trình duyệt hiện theo ngôn ngữ máy, vd mm/dd/yyyy trên máy tiếng Anh).
  // Ô gốc (ẩn, nằm dưới biểu tượng lịch) vẫn giữ giá trị yyyy-mm-dd để lưu và để mở bảng chọn ngày.
  V.dateInput = (attrs, iso, o = {}) => {
    const dt = !!o.time;
    return `<span class="dinp ${dt ? 'dt' : ''}"><input type="text" class="dtxt" inputmode="numeric" autocomplete="off" maxlength="${dt ? 16 : 10}"
        placeholder="${dt ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy'}" value="${esc(iso ? (dt ? U.fmtDateTime(iso) : U.fmtDate(iso)) : '')}" ${o.disabled ? 'disabled' : ''} ${o.label ? `aria-label="${esc(o.label)}"` : ''}>
      <span class="dbtn" aria-hidden="true">${Icon('calendar')}</span>
      <input type="${dt ? 'datetime-local' : 'date'}" class="dnat" ${attrs} value="${esc(iso || '')}" tabindex="-1" title="Chọn trên lịch" ${o.disabled ? 'disabled' : ''}></span>`;
  };
  V.dates = root => root.querySelectorAll('.dinp').forEach(box => {
    if (box._bound) return; box._bound = true;
    const txt = box.querySelector('.dtxt'), nat = box.querySelector('.dnat'), dt = box.classList.contains('dt');
    const show = () => { txt.value = nat.value ? (dt ? U.fmtDateTime(nat.value) : U.fmtDate(nat.value)) : ''; txt.disabled = nat.disabled; box.classList.remove('bad'); };
    nat._sync = show;   // gọi sau khi code khác đổi nat.value / nat.disabled (nút "Hôm nay", "Không thời hạn"…)
    nat.addEventListener('change', show);
    nat.addEventListener('click', () => { try { nat.showPicker(); } catch (e) { /* trình duyệt tự mở */ } });
    // Đọc chữ dd/mm/yyyy [hh:mm]; final = rời ô / Enter → báo lỗi nếu sai, chuẩn hoá 1/2/2026 → 01/02/2026
    const parse = final => {
      const v = txt.value.trim();
      if (!v) { box.classList.remove('bad'); if (nat.value) { nat.value = ''; if (final) nat.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
      const d = m && new Date(+m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
      if (!(d && d.getDate() === +m[1] && d.getMonth() === m[2] - 1 && (m[4] == null || (+m[4] < 24 && +m[5] < 60)))) {
        if (final) box.classList.add('bad');
        return;
      }
      box.classList.remove('bad');
      const iso = dt ? U.toLocalInput(d) : U.iso(d);
      if (nat.value !== iso) nat.value = iso;
      if (final) nat.dispatchEvent(new Event('change', { bubbles: true }));
    };
    // Gõ liền chữ số (11102026) → tự chèn "/", " ", ":"; tự gõ dấu "/" kiểu 5/3/2026 thì để nguyên, rời ô mới chuẩn hoá
    const auto = /^\d+$|^\d{2}\/\d{0,3}$|^\d{2}\/\d{2}\/\d{0,5}$|^\d{2}\/\d{2}\/\d{4} \d{0,3}$|^\d{2}\/\d{2}\/\d{4} \d{2}:\d{0,3}$/;
    txt.addEventListener('input', e => {
      const v = txt.value;
      if (!(e.inputType || '').startsWith('delete') && auto.test(v)) {
        const d = v.replace(/\D/g, '').slice(0, dt ? 12 : 8);
        let s = d.slice(0, 2);
        if (d.length > 2) s += '/' + d.slice(2, 4);
        if (d.length > 4) s += '/' + d.slice(4, 8);
        if (dt && d.length > 8) s += ' ' + d.slice(8, 10);
        if (dt && d.length > 10) s += ':' + d.slice(10, 12);
        if (v.endsWith('/') && (d.length === 2 || d.length === 4)) s += '/';   // giữ dấu "/" vừa gõ
        txt.value = s;
      }
      parse(false);
    });
    txt.addEventListener('blur', () => parse(true));
    txt.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); parse(true); } });
  });

  // Lựa chọn của ô "chọn hoặc gõ thêm" (giống AppSheet "cho phép giá trị khác"): các giá trị khai báo trong schema
  // + mọi giá trị đã từng nhập trong dữ liệu (hay dùng xếp trước); trùng chữ hoa/thường hoặc dấu chỉ giữ 1
  V.enumOpts = (t, f) => {
    const cnt = new Map();
    DB.rows(t).forEach(r => { const v = String(r[f.n] ?? '').trim(); if (v) cnt.set(v, (cnt.get(v) || 0) + 1); });
    const seen = new Set(), out = [];
    const add = v => { const k = U.norm(v).trim(); if (v && !seen.has(k)) { seen.add(k); out.push(v); } };
    f.opts.forEach(add);
    [...cnt.keys()].sort((a, b) => cnt.get(b) - cnt.get(a) || a.localeCompare(b, 'vi')).forEach(add);
    return out;
  };

  // Ô chọn trong danh sách có sẵn, gõ để tìm (thay <select>: ô chọn gốc chỉ nhảy theo chữ cái đầu — gõ "22" không ra "T22").
  // Chỉ nhận giá trị có trong danh sách; opts = [{ v: giá trị lưu, l: chữ hiện, s: dòng phụ }]
  V.pickInput = (nm, v, opts) => {
    const cur = opts.find(o => String(o.v) === String(v));
    return `<div class="cbx pick" data-opts="${esc(JSON.stringify(opts))}">
      <input type="text" class="ptxt" value="${esc(cur ? cur.l : '')}" placeholder="Bấm để chọn hoặc gõ để tìm" autocomplete="off" role="combobox" aria-expanded="false">
      <input type="hidden" ${nm} value="${esc(cur ? cur.v : '')}">
      <button type="button" class="cbx-tg" tabindex="-1" aria-label="Mở danh sách">${Icon('chevron')}</button><div class="cbx-pop" role="listbox" hidden></div></div>`;
  };
  V.pickers = root => root.querySelectorAll('.cbx.pick').forEach(box => {
    const txt = box.querySelector('.ptxt'), hid = box.querySelector('input[type=hidden]'), pop = box.querySelector('.cbx-pop');
    const opts = JSON.parse(box.dataset.opts || '[]');
    let act = -1, items = [], all = true;
    const label = () => { const o = opts.find(x => String(x.v) === hid.value); return o ? o.l : ''; };
    const draw = () => {
      items = all || !txt.value.trim() ? opts : opts.filter(o => U.match(o.l + ' ' + (o.s || '') + ' ' + o.v, txt.value));
      pop.innerHTML = items.length ? items.map((o, i) => `<button type="button" class="cbx-o ${i === act ? 'on' : ''} ${String(o.v) === hid.value ? 'sel' : ''}" data-i="${i}" role="option">
          <span>${esc(o.l)}${o.s ? `<small>${esc(o.s)}</small>` : ''}</span>${String(o.v) === hid.value ? Icon('check', 'sm') : ''}</button>`).join('')
        : '<div class="cbx-empty">Không có lựa chọn nào khớp</div>';
    };
    const open = showAll => {
      all = showAll; act = -1; draw();
      if (pop.hidden) { pop.hidden = false; box.classList.add('open'); txt.setAttribute('aria-expanded', 'true'); requestAnimationFrame(() => pop.scrollIntoView({ block: 'nearest' })); }
    };
    const close = () => { pop.hidden = true; box.classList.remove('open'); txt.setAttribute('aria-expanded', 'false'); };
    const set = o => {
      const v = o ? String(o.v) : '';
      txt.value = o ? o.l : '';
      if (hid.value !== v) { hid.value = v; hid.dispatchEvent(new Event('input', { bubbles: true })); hid.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    const pick = i => { if (items[i]) set(items[i]); close(); };
    txt.addEventListener('focus', () => { open(true); txt.select(); });
    txt.addEventListener('click', () => { if (pop.hidden) open(true); });
    txt.addEventListener('input', () => open(false));
    txt.addEventListener('keydown', e => {
      if (pop.hidden) { if (e.key === 'ArrowDown') { e.preventDefault(); open(true); } return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); act = Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); draw();
        const on = pop.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); pick(act >= 0 ? act : 0); }
      else if (e.key === 'Escape') { e.preventDefault(); txt.value = label(); close(); }
      else if (e.key === 'Tab') close();
    });
    // Rời ô: xoá trống = bỏ chọn; gõ dở mà chỉ khớp đúng 1 lựa chọn thì chọn luôn; còn lại trả về lựa chọn cũ
    txt.addEventListener('blur', () => setTimeout(() => {
      close();
      const q = txt.value.trim();
      if (!q) return set(null);
      if (q === label()) return;
      const m = opts.filter(o => U.match(o.l + ' ' + (o.s || '') + ' ' + o.v, q));
      if (m.length === 1) set(m[0]); else txt.value = label();
    }, 150));
    box.querySelector('.cbx-tg').addEventListener('click', () => { if (pop.hidden) { txt.focus(); open(true); } else close(); });
    pop.addEventListener('mousedown', e => e.preventDefault());
    pop.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) pick(+b.dataset.i); });
  });

  // Ô chọn có thể gõ giá trị mới (thay <datalist> — trình duyệt hiện lẫn thành "Saved data", thiếu ô tìm)
  V.combo = root => root.querySelectorAll('.cbx:not(.pick)').forEach(box => {
    const inp = box.querySelector('input'), pop = box.querySelector('.cbx-pop'), opts = JSON.parse(box.dataset.opts || '[]');
    let act = -1, items = [], all = true;
    const draw = () => {
      const q = U.norm(inp.value.trim()), exact = q && opts.some(o => U.norm(o) === q);
      items = (q && !all ? opts.filter(o => U.match(o, inp.value)) : opts).map(v => ({ v }));
      if (q && !exact) items.push({ v: inp.value.trim(), add: true });   // "Thêm mới" ở cuối — tránh lỡ chọn khi đã có giá trị gần đúng
      pop.innerHTML = items.length ? items.map((o, i) => `<button type="button" class="cbx-o ${o.add ? 'add' : ''} ${i === act ? 'on' : ''} ${!o.add && U.norm(o.v) === q ? 'sel' : ''}" data-i="${i}" role="option">
          ${o.add ? `${Icon('plus', 'sm')}<span>Thêm mới: <b>${esc(o.v)}</b></span>` : `<span>${esc(o.v)}</span>${U.norm(o.v) === q ? Icon('check', 'sm') : ''}`}</button>`).join('')
        : '<div class="cbx-empty">Chưa có lựa chọn nào — gõ để thêm mới</div>';
    };
    const open = showAll => {
      all = showAll; act = -1; draw();
      if (pop.hidden) { pop.hidden = false; box.classList.add('open'); inp.setAttribute('aria-expanded', 'true'); requestAnimationFrame(() => pop.scrollIntoView({ block: 'nearest' })); }
    };
    const close = () => { pop.hidden = true; box.classList.remove('open'); inp.setAttribute('aria-expanded', 'false'); };
    let picking = false;
    const pick = i => {
      const o = items[i]; if (!o) return;
      inp.value = o.v; picking = true; inp.dispatchEvent(new Event('input', { bubbles: true })); picking = false;   // báo form "đã sửa"
      close();
    };
    inp.addEventListener('focus', () => open(true));
    inp.addEventListener('click', () => { if (pop.hidden) open(true); });
    inp.addEventListener('input', () => { if (!picking) open(false); });
    inp.addEventListener('keydown', e => {
      if (pop.hidden) { if (e.key === 'ArrowDown') { e.preventDefault(); open(true); } return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); act = Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); draw();
        const on = pop.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); if (act >= 0) pick(act); else close(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') close();
    });
    box.querySelector('.cbx-tg').addEventListener('click', () => { if (pop.hidden) { inp.focus(); open(true); } else close(); });
    pop.addEventListener('mousedown', e => e.preventDefault());   // bấm vào danh sách không làm mất con trỏ ở ô nhập
    pop.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) pick(+b.dataset.i); });
    inp.addEventListener('blur', () => setTimeout(close, 150));
  });
  const moneyFmt = d => d ? new Intl.NumberFormat('vi-VN').format(Number(d)) : '';

  function fieldInput(t, f, r, isNew, def) {
    const v = r[f.n] ?? '';
    const nm = `name="${esc(f.n)}"`;
    const ro = def.keyEditable && f.n === def.key && !isNew ? 'readonly' : '';
    const seg = (opts, cur) => `<div class="seg" data-seg="${esc(f.n)}" ${f.req ? 'data-req="1"' : ''}><input type="hidden" ${nm} value="${esc(cur)}">
      ${opts.map(o => `<button type="button" class="segb ${String(o.v) === String(cur) ? 'on' : ''}" data-v="${esc(o.v)}">${esc(o.l)}</button>`).join('')}</div>`;
    let input;
    switch (f.t) {
      case 'longtext': input = `<textarea ${nm} rows="3">${esc(v)}</textarea>`; break;
      case 'price':
        input = `<div class="inl money"><input ${nm} type="text" inputmode="numeric" autocomplete="off" data-money value="${esc(moneyFmt(v === '' ? '' : Math.round(U.num(v))))}"><span class="unit">₫</span></div>`;
        break;
      case 'number': input = `<input ${nm} type="number" step="any" inputmode="decimal" value="${v === '' ? '' : esc(U.num(v))}">`; break;
      case 'date':
        input = `<div class="inl">${V.dateInput(nm, U.isoOf(v))}<button type="button" class="qd" data-today="${esc(f.n)}">Hôm nay</button></div>`;
        break;
      case 'datetime':
        input = `<div class="inl">${V.dateInput(nm, U.toLocalInput(v), { time: true })}<button type="button" class="qd" data-now="${esc(f.n)}">Bây giờ</button></div>`;
        break;
      case 'expiry': {
        const no = v !== '' && !U.parseDate(v);
        input = `<div class="inl wrap">${V.dateInput(nm, U.isoOf(v), { disabled: no })}
          <label class="chk qd"><input type="checkbox" data-noexp="${esc(f.n)}" ${no ? 'checked' : ''}> Không thời hạn</label></div>`;
        break;
      }
      case 'enum':
        if (f.other) input = `<div class="cbx" data-opts="${esc(JSON.stringify(V.enumOpts(t, f)))}">
          <input ${nm} value="${esc(v)}" placeholder="Chọn hoặc gõ để thêm mới" autocomplete="off" role="combobox" aria-expanded="false" ${f.req ? 'required' : ''}>
          <button type="button" class="cbx-tg" tabindex="-1" aria-label="Mở danh sách">${Icon('chevron')}</button><div class="cbx-pop" role="listbox" hidden></div></div>`;
        else if (f.opts.length <= SEG_MAX) input = seg([...f.opts, ...(v && !f.opts.includes(v) ? [v] : [])].map(o => ({ v: o, l: o })), v);
        else input = V.pickInput(nm, v, [...f.opts, ...(v && !f.opts.includes(v) ? [v] : [])].map(o => ({ v: o, l: o })));
        break;
      case 'ref': {
        const rows = DB.rows(f.ref).slice().sort((a, b) => DB.title(f.ref, a).localeCompare(DB.title(f.ref, b), 'vi', { numeric: true }));
        if (rows.length && rows.length <= SEG_MAX && (!v || DB.get(f.ref, v))) {
          input = seg(rows.map(x => ({ v: String(DB.keyOf(f.ref, x)), l: DB.title(f.ref, x) })), v);
        } else {
          const opts = rows.map(x => ({ v: String(DB.keyOf(f.ref, x)), l: DB.title(f.ref, x), s: DB.sub(f.ref, x) }));
          if (v && !DB.get(f.ref, v)) opts.push({ v: String(v), l: String(v) });
          input = V.pickInput(nm, v, opts);
        }
        break;
      }
      case 'image':
        input = `<div class="up">${v && !isNew ? `<span class="upcur">${V.imgTag(t, r, f.n, 'th')}<label class="chk"><input type="checkbox" data-clear="${esc(f.n)}"> Xoá ảnh</label></span>` : ''}
          <span class="uppre" data-pre="${esc(f.n)}" hidden></span>
          <label class="upbox">${Icon('image')}<span data-upl="${esc(f.n)}">${v ? 'Đổi ảnh' : 'Chụp hoặc chọn ảnh'}</span><input type="file" accept="image/*" data-up="${esc(f.n)}" hidden></label></div>`;
        break;
      case 'file':
        input = `<div class="up">${v ? `<span class="upcur"><span class="fchip">${Icon('file')}<span>${esc(fileName(v))}</span></span><label class="chk"><input type="checkbox" data-clear="${esc(f.n)}"> Xoá file</label></span>` : ''}
          <label class="upbox">${Icon('file')}<span data-upl="${esc(f.n)}">${v ? 'Đổi file' : 'Chọn file'}</span><input type="file" data-up="${esc(f.n)}" hidden></label></div>`;
        break;
      default: {
        if (f.enc) {
          const isE = Vault.isEnc(v);
          input = `<div class="inl"><input ${nm} type="password" autocomplete="new-password" data-enc="1" value="${isE ? '' : esc(v)}"
            placeholder="${isE ? '•••••••• đã mã hoá — để trống nếu giữ nguyên' : ''}">
            <button type="button" class="ibtn3" data-eye="${esc(f.n)}" ${isE ? 'data-dec="1"' : ''} title="Hiện">${Icon('eye')}</button></div>`;
        } else {
          const type = { email: 'email', url: 'url', phone: 'tel' }[f.t] || 'text';
          const im = f.t === 'phone' ? 'inputmode="tel"' : '';
          input = `<input ${nm} type="${type}" ${im} value="${esc(v)}" ${ro} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>`;
        }
      }
    }
    return `<div class="fld" data-f="${esc(f.n)}"><span class="lbl">${esc(f.l)}${f.req ? ' <b class="req">*</b>' : ''}</span>${input}${f.hint ? `<small class="fhint">${esc(f.hint)}</small>` : ''}</div>`;
  }

  // ---------- Bảng con nhập nhiều dòng trong form (schema `inline`, vd tài liệu trong transmittal) ----------
  // Mỗi dòng 1 bản ghi của bảng con: ô chữ, cột chọn (enum không "khác") là ô chọn. Dán nhiều dòng từ Excel (cột cách nhau bằng Tab)
  // vào một ô → tự tách thành nhiều dòng, điền từ cột đó sang phải. Lưu: thêm mới / sửa dòng có thay đổi / xoá dòng đã bỏ.
  const inlineCell = (IL, c, i, v) => {
    const f = DB.field(IL.t, c.n) || {}, a = `data-c="${esc(c.n)}" data-i="${i}" aria-label="${esc(c.l)}"`;
    if (f.t === 'enum' && !f.other) return `<select ${a}><option value="">${esc(c.l)}…</option>${f.opts.map(o => `<option ${String(o) === String(v ?? '') ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    return `<input type="text" ${a} placeholder="${esc(c.l)}" value="${esc(v ?? '')}" autocomplete="off">`;
  };
  const inlineRow = (IL, d) => `<div class="irow" data-r ${d && DB.keyOf(IL.t, d) ? `data-id="${esc(DB.keyOf(IL.t, d))}"` : ''}><span class="ino"></span>
    ${IL.cols.map((c, i) => inlineCell(IL, c, i, d && d[c.n])).join('')}
    <button type="button" class="ibtn3 idel" data-idel title="Bỏ dòng này" aria-label="Bỏ dòng này">${Icon('x', 'sm')}</button></div>`;
  function inlineCard(IL, rows) {
    return `<div class="card form ilist" style="--icols:${IL.cols.map(c => c.w || '1fr').join(' ')}">
      <div class="fsec"><span class="gic" style="--gc:var(--pri)">${Icon(IL.ic || 'file')}</span>${esc(IL.label)}<span class="cnt" data-icnt>0</span></div>
      <p class="muted small ihint">Mỗi dòng 1 ${esc(IL.unit)}. Có thể chép nhiều dòng từ Excel (các cột ${IL.cols.map(c => c.l).join(' · ')}) rồi dán vào ô ${esc(IL.cols[0].l)}.</p>
      <div class="irows"><div class="irow ihd" aria-hidden="true"><span>#</span>${IL.cols.map(c => `<span>${esc(c.l)}${c === IL.cols[0] ? ' <b class="req">*</b>' : ''}</span>`).join('')}<span></span></div>
        <div data-ilist>${(rows.length ? rows : [null]).map(d => inlineRow(IL, d)).join('')}</div></div>
      <button type="button" class="btn ghost sm iadd" data-iadd>${Icon('plus', 'sm')}Thêm ${esc(IL.unit)}</button></div>`;
  }
  function inlineWire(form, IL, touch) {
    const box = form.querySelector('[data-ilist]'), cnt = form.querySelector('[data-icnt]');
    const renum = () => {
      const rs = [...box.querySelectorAll('.irow')];
      rs.forEach((el, i) => { el.querySelector('.ino').textContent = i + 1; });
      cnt.textContent = rs.filter(el => [...el.querySelectorAll('[data-c]')].some(x => x.value.trim())).length;
    };
    const add = after => { const tmp = document.createElement('div'); tmp.innerHTML = inlineRow(IL, null); const el = tmp.firstElementChild;
      if (after) after.after(el); else box.appendChild(el); renum(); return el; };
    const setVal = (el, i, v) => {
      const x = el.querySelector(`[data-i="${i}"]`); if (!x) return;
      if (x.tagName === 'SELECT') {   // "FA" / "fa: for approval" → "FA: For Approval"
        const n = U.norm(v), o = [...x.options].find(o => o.value && (U.norm(o.value) === n || U.norm(o.value.split(':')[0]) === n || U.norm(o.value).startsWith(n)));
        x.value = o ? o.value : '';
      } else x.value = v;
    };
    form.querySelector('[data-iadd]').onclick = () => { add().querySelector('[data-c]').focus(); touch(); };
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-idel]'); if (!b) return;
      b.closest('.irow').remove(); if (!box.children.length) add(); renum(); touch();
    });
    box.addEventListener('input', e => { const el = e.target.closest('.irow'); if (el) { el.classList.remove('err'); el.title = ''; } renum(); });
    box.addEventListener('change', renum);
    // Dán nhiều dòng / nhiều cột (từ Excel) → tách thành các dòng, điền từ ô đang dán sang phải
    box.addEventListener('paste', e => {
      const x = e.target.closest('[data-c]'); if (!x) return;
      const txt = (e.clipboardData || window.clipboardData).getData('text') || '';
      if (!/[\t\n]/.test(txt.replace(/\r?\n$/, ''))) return;   // dán 1 ô bình thường
      e.preventDefault();
      const lines = txt.replace(/\r/g, '').split('\n').filter(l => l.trim());
      let el = x.closest('.irow'); const i0 = +x.dataset.i;
      lines.forEach((ln, j) => {
        if (j > 0) { const nx = el.nextElementSibling; el = nx && ![...nx.querySelectorAll('[data-c]')].some(y => y.value.trim()) ? nx : add(el); }
        ln.split('\t').forEach((v, m) => setVal(el, i0 + m, v.trim()));
      });
      renum(); touch();
      U.toast(`Đã dán ${lines.length} dòng`, 'ok');
    });
    renum();
  }
  // Dòng đang nhập (bỏ dòng trống): { el, no, id, v: { cột: giá trị } }
  const inlineRows = (form, IL) => [...form.querySelectorAll('[data-ilist] .irow')].map((el, i) => ({
    el, no: i + 1, id: el.dataset.id || '', v: Object.fromEntries(IL.cols.map(c => [c.n, el.querySelector(`[data-c="${CSS.escape(c.n)}"]`).value.trim()]))
  })).filter(x => Object.values(x.v).some(Boolean));
  async function inlineSave(IL, k, out, iRows, iOld, iDel, btn) {
    const kf = DB.keyField(IL.t), n = iRows.length + iDel.length;
    let i = 0;
    const step = () => { btn.textContent = `Đang lưu ${IL.unit} ${++i}/${n}…`; };
    try {
      for (const x of iRows) {
        const cur = x.id && iOld.find(o => String(o[kf]) === x.id);
        if (cur) {
          step();
          if (IL.cols.some(c => String(cur[c.n] ?? '') !== x.v[c.n])) { const s = await DB.update(IL.t, { ...cur, ...x.v }); Object.assign(cur, s); }
        } else {
          step();
          const row = { [kf]: U.uid(), [IL.fk]: k, ...x.v };
          if (IL.date) row[IL.date[0]] = out[IL.date[1]] || U.today();
          const s = await DB.add(IL.t, row);
          iOld.push(s); x.id = String(s[kf]); x.el.dataset.id = x.id;   // lỗi ở dòng sau → bấm Lưu lại không thêm trùng
        }
      }
      for (const o of iDel) { step(); await DB.remove(IL.t, o[kf]); iOld.splice(iOld.indexOf(o), 1); }
    } catch (e) {
      throw new Error(`Đã lưu thông tin chính nhưng chưa lưu xong ${IL.unit} (${e.message}) — bấm Lưu để thử lại`);
    }
  }

  V.form = async (t, key, params) => {
    const def = TT()[t];
    if (!def) return App.notFound();
    const isNew = key === 'new';
    App.head((isNew ? 'Thêm ' : 'Sửa ') + def.label.toLowerCase(), { back: true });
    App.loading();
    await DB.loadDeps(t);
    const old = isNew ? null : DB.get(t, key);
    if (!isNew && !old) { App.main.innerHTML = '<div class="empty">Không tìm thấy bản ghi.</div>'; return; }
    const r = old ? { ...old } : {};
    const fields = def.fields.filter(f => !f.v);
    if (isNew) fields.forEach(f => {
      if (params.has(f.n)) r[f.n] = params.get(f.n);
      else if (f.init === 'today') r[f.n] = U.today();
      else if (f.init != null) r[f.n] = f.init;
    });
    const main = fields.filter(f => f.t !== 'image' && f.t !== 'file');
    const att = fields.filter(f => f.t === 'image' || f.t === 'file');
    const meta = metaOf(t);
    // Bảng con nhập ngay trong form (vd transmittal → nhiều tài liệu đến): chỉ khi được sửa bảng con
    const IL = def.inline && (App.user.admin || tableLv(def.inline.t) === 2) ? def.inline : null;
    let iOld = [];
    if (IL) { await DB.loadDeps(IL.t).catch(() => {}); iOld = isNew ? [] : DB.rows(IL.t).filter(x => String(x[IL.fk]) === String(key)); }
    // Cột mới chưa thêm vào Google Sheet → máy chủ bỏ qua giá trị (mất khi tải lại) → báo trước
    const have = DB.rows(t);
    const noCol = window.APP_CONFIG.mode === 'live' && have.length ? fields.filter(f => have.every(x => !(f.n in x))) : [];

    App.main.innerHTML = `<form class="fwrap" novalidate>
      ${noCol.length ? `<div class="card fwarn">${Icon('alert')}<span>Google Sheet (tab <b>${esc(def.sheet || t)}</b>) chưa có cột
        ${noCol.map(f => `<b>${esc(f.n)}</b>`).join(', ')} — ${esc(noCol.map(f => f.l).join(', '))} sẽ không được lưu.
        Thêm tên cột đó vào hàng tiêu đề (hàng 1) của tab rồi tải lại app.</span></div>` : ''}
      <div class="card form">${main.map(f => fieldInput(t, f, r, isNew, def)).join('')}</div>
      ${IL ? inlineCard(IL, iOld) : ''}
      ${att.length ? `<div class="card form"><div class="fsec"><span class="gic" style="--gc:${meta.color}">${Icon('file')}</span>Đính kèm</div>
        ${att.map(f => fieldInput(t, f, r, isNew, def)).join('')}</div>` : ''}
      <div class="fbar"><button type="button" class="btn ghost" data-cancel>Huỷ</button><button class="btn" type="submit">${Icon('check')} Lưu</button></div></form>`;
    const form = App.main.querySelector('form');
    V.hydrate(form);
    V.combo(form);
    V.pickers(form);
    V.dates(form);
    const q = sel => form.querySelector(sel);
    const byName = n => q(`[name="${CSS.escape(n)}"]`);
    let dirty = false;
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('change', () => { dirty = true; });

    form.querySelector('[data-cancel]').onclick = async () => {
      if (dirty && !(await U.confirm('Bỏ những thay đổi vừa nhập?'))) return;
      history.back();
    };
    // Nút chọn nhanh (thay danh sách thả xuống khi ít lựa chọn)
    form.querySelectorAll('.seg').forEach(s => s.addEventListener('click', e => {
      const b = e.target.closest('.segb'); if (!b) return;
      const hid = s.querySelector('input[type=hidden]'), on = b.classList.contains('on');
      if (on && s.dataset.req) return;
      s.querySelectorAll('.segb').forEach(x => x.classList.remove('on'));
      if (!on) b.classList.add('on');
      hid.value = on ? '' : b.dataset.v;
      dirty = true; s.closest('.fld').classList.remove('err');
    }));
    // Số tiền: tự thêm dấu chấm phân cách hàng nghìn
    form.querySelectorAll('[data-money]').forEach(inp => {
      inp.addEventListener('input', () => { const d = inp.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''); inp.value = moneyFmt(d); });
    });
    form.querySelectorAll('[data-today]').forEach(b => b.onclick = () => { const d = byName(b.dataset.today); d.value = U.today(); d._sync && d._sync(); dirty = true; });
    form.querySelectorAll('[data-now]').forEach(b => b.onclick = () => { const d = byName(b.dataset.now); d.value = U.toLocalInput(new Date()); d._sync && d._sync(); dirty = true; });
    form.querySelectorAll('[data-noexp]').forEach(c => {
      c.onchange = () => { const d = byName(c.dataset.noexp); d.disabled = c.checked; if (c.checked) d.value = ''; d._sync && d._sync(); };
    });
    form.querySelectorAll('[data-eye]').forEach(b => b.onclick = async () => {
      const inp = byName(b.dataset.eye);
      if (b.dataset.dec && !inp.value) {
        if (!(await Vault.ensureOpen())) return;
        inp.value = await Vault.dec(old[b.dataset.eye]); delete b.dataset.dec;
      }
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    // Xem trước ảnh / tên file vừa chọn
    form.querySelectorAll('[data-up]').forEach(inp => inp.onchange = () => {
      const n = inp.dataset.up, file = inp.files[0], lbl = q(`[data-upl="${CSS.escape(n)}"]`), pre = q(`[data-pre="${CSS.escape(n)}"]`);
      if (!file) return;
      lbl.textContent = file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name;
      if (pre && file.type.startsWith('image/')) { pre.innerHTML = `<img class="th" src="${URL.createObjectURL(file)}" alt="">`; pre.hidden = false; }
      dirty = true; inp.closest('.fld').classList.remove('err');
    });

    const markErr = (f, msg) => {
      const box = q(`.fld[data-f="${CSS.escape(f.n)}"]`); if (!box) return;
      box.classList.add('err');
      if (!box.querySelector('.ferr')) box.insertAdjacentHTML('beforeend', `<small class="ferr">${esc(msg)}</small>`);
    };
    form.addEventListener('input', e => { const b = e.target.closest('.fld'); if (b) b.classList.remove('err'); });
    if (IL) inlineWire(form, IL, () => { dirty = true; });
    let savedKey = null;   // bản ghi chính đã lưu xong (bảng con lỗi giữa chừng) → bấm Lưu lại chỉ cập nhật, không tạo trùng

    form.onsubmit = async e => {
      e.preventDefault();
      form.querySelectorAll('.fld.err').forEach(b => b.classList.remove('err'));
      const out = {}, missing = [], uploads = [], badDate = [];
      for (const f of fields) {
        const el = byName(f.n);
        let val;
        if (el && el.closest('.dinp.bad')) { badDate.push(f); continue; }   // chữ ngày gõ chưa đúng dd/mm/yyyy
        if (f.t === 'image' || f.t === 'file') {
          const up = q(`[data-up="${CSS.escape(f.n)}"]`), clr = q(`[data-clear="${CSS.escape(f.n)}"]`);
          if (up.files[0]) { uploads.push([f, up.files[0]]); val = r[f.n] || 'x'; }
          else if (clr && clr.checked) val = '';
          else { if (f.req && !r[f.n]) missing.push(f); continue; }
        } else if (f.t === 'expiry') {
          val = q(`[data-noexp="${CSS.escape(f.n)}"]`).checked ? 'Không thời hạn' : el.value;
        } else if (f.enc) {
          if (el.value === '' && Vault.isEnc(r[f.n])) continue;   // giữ nguyên giá trị đã mã hoá
          val = el.value;
        } else if (f.t === 'price') { const d = el.value.replace(/\D/g, ''); val = d === '' ? '' : Number(d); }
        else if (f.t === 'number') val = el.value === '' ? '' : Number(el.value);
        else if (f.t === 'datetime') val = el.value ? el.value.replace('T', ' ') : '';
        else val = el.value.trim();
        if (f.req && (val === '' || val == null)) missing.push(f);
        out[f.n] = val;
      }
      if (badDate.length) {
        badDate.forEach(f => markErr(f, 'Ngày chưa đúng — nhập theo dd/mm/yyyy' + (f.t === 'datetime' ? ' hh:mm' : '')));
        q('.fld.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return U.toast('Có ngày nhập chưa đúng dạng dd/mm/yyyy', 'err');
      }
      if (missing.length) {
        missing.forEach(f => markErr(f, 'Bắt buộc nhập'));
        q('.fld.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return U.toast('Còn ' + missing.length + ' mục bắt buộc chưa nhập', 'err');
      }
      // Bảng con: dòng trống bỏ qua; dòng thiếu cột đầu (vd Mã tài liệu) hoặc trùng nhau → báo, không lưu
      const iRows = IL ? inlineRows(form, IL) : [];
      if (IL) {
        const c0 = IL.cols[0], seen = new Map(), bad = [];
        iRows.forEach(x => {
          const k0 = U.norm(x.v[c0.n]);
          if (!k0) bad.push([x, 'Thiếu ' + c0.l.toLowerCase()]);
          else if (seen.has(k0)) bad.push([x, 'Trùng ' + c0.l.toLowerCase() + ' với dòng ' + seen.get(k0)]);
          else seen.set(k0, x.no);
        });
        if (bad.length) {
          bad.forEach(([x, m]) => { x.el.classList.add('err'); x.el.title = m; });
          bad[0][0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return U.toast(`Dòng ${bad[0][0].no}: ${bad[0][1]}`, 'err');
        }
      }
      const iDel = IL ? iOld.filter(o => !iRows.some(x => x.id && x.id === String(DB.keyOf(IL.t, o)))) : [];
      if (iDel.length && !(await U.confirm(`Xoá ${iDel.length} ${IL.unit} đã bỏ khỏi danh sách (${iDel.map(o => o[IL.cols[0].n]).filter(Boolean).slice(0, 3).join(', ')}${iDel.length > 3 ? '…' : ''})?`))) return;
      const k = savedKey || (isNew ? (def.keyEditable ? out[def.key] : U.uid()) : key);
      out[def.key] = k;

      const btn = q('button[type=submit]');
      const label = btn.innerHTML;
      btn.disabled = true; btn.textContent = 'Đang lưu…';
      try {
        // Mã hoá các cột bảo mật trước khi gửi đi
        for (const f of fields.filter(f => f.enc)) {
          const v = out[f.n];
          if (typeof v !== 'string' || v === '' || Vault.isEnc(v)) continue;
          if (Vault.isSet()) {
            if (!(await Vault.ensureOpen())) throw new Error('Cần mở khoá mật khẩu chủ để lưu dữ liệu bảo mật');
            out[f.n] = await Vault.enc(v);
          } else if (!(await U.confirm('Chưa đặt mật khẩu chủ nên "' + f.l + '" sẽ lưu dạng chữ thường. Vẫn lưu?'))) throw new Error('Đã huỷ');
        }
        for (const [f, file] of uploads) {
          if (file.size > 25 * 1024 * 1024) throw new Error(f.l + ': file lớn hơn 25 MB');
          const isImg = f.t === 'image' && /^image\/(jpeg|png|webp|heic|heif)/.test(file.type);
          const du = isImg ? await U.resizeImage(file, window.APP_CONFIG.mode === 'demo' ? 900 : 1600) : await U.readDataUrl(file);
          const name = isImg ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
          btn.textContent = 'Đang tải ' + f.l.toLowerCase() + '…';
          out[f.n] = await API.upload(t, f.n, name, du);
        }
        if (isNew && !savedKey) await DB.add(t, out); else await DB.update(t, out);
        savedKey = k;
        if (IL) await inlineSave(IL, k, out, iRows, iOld, iDel, btn);
        Files.forget(t, k);
        dirty = false;
        U.toast('Đã lưu', 'ok');
        location.replace('#/r/' + t + '/' + enc(k));
      } catch (err) {
        if (err.message !== 'Đã huỷ') U.toast(err.message, 'err');
        btn.disabled = false; btn.innerHTML = label;
      }
    };
  };
})();
