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

  // ---------------- "HAY DÙNG": đếm số lần mở từng mục (lưu trên máy này) ----------------
  const VISIT_KEY = 'pwa-visits', TAB_KEY = 'pwa-home-tab';
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } } };
  V.visit = key => { const v = store.get(VISIT_KEY, {}); v[key] = (v[key] || 0) + 1; store.set(VISIT_KEY, v); };
  const DEFAULT_FAV = ['Cong_viec', 'Document_no_In', 'Cong_viec_duoc_giao', 'DASH_CANHBAO', 'GIAODICH_THUCHI', 'Kiem_tra_hang', 'TAIKHOAN_MATKHAU', 'BANGCAP'];
  function frequent(all, n = 8) {
    const v = store.get(VISIT_KEY, {}), byKey = new Map(all.map(it => [it.key, it]));
    const top = Object.entries(v).sort((a, b) => b[1] - a[1]).map(([k]) => byKey.get(k)).filter(Boolean);
    const out = [];
    for (const it of [...top, ...DEFAULT_FAV.map(k => byKey.get(k)).filter(Boolean), ...all]) if (!out.includes(it) && out.length < n) out.push(it);
    return out;
  }

  function greeting() {
    const h = new Date().getHours();
    const hello = h < 11 ? 'Chào buổi sáng' : h < 13 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    const name = (window.Auth && Auth.given) || App.user.name || (App.user.email || '').split('@')[0];
    const day = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
    return { hello, name, day: day.charAt(0).toUpperCase() + day.slice(1) };
  }

  // Ô gọn kiểu màn hình điện thoại: biểu tượng + tên
  const mini = it => `<a class="mt" href="${V.hrefOf(it)}" style="--gc:${it.color || 'var(--g7)'}" title="${esc(it.desc || it.label)}">
    <span class="mt-ic">${Icon(it.ic)}</span><span class="mt-l">${esc(it.label)}</span></a>`;

  V.home = async () => {
    App.head(window.APP_CONFIG.appName, { home: true });
    App.loading();
    await DB.load('ALBUM').catch(() => {});
    const groups = V.navGroups(), all = groups.flatMap(g => g.items);

    const can = t => permTableLevel(App.user, t);
    const kpis = [
      { id: 'tr', ts: ['Cong_viec'], label: 'Transmittal đang xử lý', ic: 'box', href: '#/i/Cong_viec' },
      { id: 'od', ts: ['Cong_viec'], label: 'Quá hạn trả lời', ic: 'alert', href: '#/i/DASH_CONGVIEC' },
      { id: 'tk', ts: ['Cong_viec_duoc_giao'], label: 'Task đang làm', ic: 'check', href: '#/i/Cong_viec_duoc_giao' },
      { id: 'ex', ts: ['BANGCAP', 'Chungchi_congviec'], label: 'Giấy tờ sắp hết hạn', ic: 'clock', href: '#/i/DASH_CANHBAO' }
    ].filter(k => k.ts.some(t => can(t) > 0));
    const quick = [
      { t: 'Cong_viec', label: 'Transmittal' }, { t: 'GIAODICH_THUCHI', label: 'Thu / chi' },
      { t: 'Cong_viec_duoc_giao', label: 'Task' }, { t: 'Kiem_tra_hang', label: 'Kiểm tra vật tư' }
    ].filter(q => can(q.t) === 2);

    const g = greeting();
    App.hero(`<div class="hero-in ${kpis.length ? 'with-kpi' : ''}">
      <div class="hday">${esc(g.day)}</div>
      <h1 class="hhello">${esc(g.hello)}, ${esc(g.name)}</h1>
      <label class="hsearch">${Icon('search')}<input type="search" id="hq" placeholder="Tìm nhanh một mục…" autocomplete="off"></label>
    </div>`);

    let tab = store.get(TAB_KEY, 'g4');
    if (!groups.some(x => x.key === tab)) tab = groups[0] && groups[0].key;
    let html = '';
    if (kpis.length) html += `<div class="kpi-row">${kpis.map(k => `<a class="kcard" href="${k.href}" data-k="${k.id}">
      <span class="kic">${Icon(k.ic)}</span><span class="kn"><span class="skel"></span></span><span class="kl">${esc(k.label)}</span></a>`).join('')}</div>`;
    if (quick.length) html += `<div class="quick"><span class="qt">Thêm nhanh</span>${quick.map(q =>
      `<a class="qbtn" href="#/f/${q.t}/new">${Icon('plus')}${esc(q.label)}</a>`).join('')}</div>`;
    if (!groups.length) html += '<div class="empty">Tài khoản của bạn chưa được cấp quyền mục nào. Hãy liên hệ quản trị viên.</div>';
    else {
      html += `<section class="hsec" id="hfav"><div class="hsec-h"><h2>${Icon('star', 'sm')} Hay dùng</h2><span class="muted small">tự cập nhật theo số lần bạn mở</span></div>
        <div class="mgrid">${frequent(all).map(mini).join('')}</div></section>`;
      html += `<section class="hsec" id="hall"><div class="hsec-h"><h2>Tất cả mục</h2></div>
        <div class="gtabs">${groups.map(x => `<button type="button" class="gtab ${x.key === tab ? 'on' : ''}" data-t="${x.key}" style="--gc:${x.color}">
          <span class="gt-ic">${Icon(x.ic)}</span>${esc(x.label)}<b>${x.items.length}</b></button>`).join('')}</div>
        <div class="mgrid" id="gitems"></div></section>`;
      html += `<section class="hsec" id="hres" hidden><div class="hsec-h"><h2>Kết quả tìm</h2></div><div class="mgrid" id="ritems"></div></section>`;
    }
    App.main.innerHTML = html;

    // Tab nhóm
    const drawTab = () => {
      const gr = groups.find(x => x.key === tab); const box = document.getElementById('gitems');
      if (box && gr) box.innerHTML = gr.items.map(mini).join('');
    };
    App.main.querySelectorAll('.gtab').forEach(b => b.onclick = () => {
      tab = b.dataset.t; store.set(TAB_KEY, tab);
      App.main.querySelectorAll('.gtab').forEach(x => x.classList.toggle('on', x === b));
      drawTab();
      centerTab(b, true);
    });
    // Đưa tab đang chọn vào giữa dải tab (chỉ cuộn ngang, không kéo trang)
    const centerTab = (b, smooth) => { const bar = b && b.parentElement; if (!bar) return;
      bar.scrollTo({ left: b.offsetLeft - bar.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' }); };
    centerTab(App.main.querySelector('.gtab.on'));
    drawTab();

    // Tìm nhanh: hiện kết quả từ mọi nhóm
    const hq = document.getElementById('hq');
    hq.oninput = () => {
      const q = U.norm(hq.value.trim());
      const res = q ? all.filter(it => U.norm(it.label + ' ' + (it.desc || '')).includes(q)) : [];
      ['hfav', 'hall'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = !!q; });
      App.main.querySelectorAll('.kpi-row, .quick').forEach(el => { el.hidden = !!q; });
      const rs = document.getElementById('hres');
      if (rs) { rs.hidden = !q; document.getElementById('ritems').innerHTML = res.length ? res.map(mini).join('') : '<div class="muted small">Không có mục nào khớp</div>'; }
      document.querySelector('.hero-in').classList.toggle('with-kpi', kpis.length > 0 && !q);
    };

    // Số liệu trong ngày (tải sau, không chặn trang)
    if (kpis.length) {
      const need = [...new Set(kpis.flatMap(k => k.ts).filter(t => can(t) > 0))];
      await Promise.all(need.map(t => DB.loadDeps(t).catch(() => {})));
      const set = (id, n, warn) => {
        const card = App.main.querySelector(`[data-k="${id}"]`); if (!card) return;
        card.querySelector('.kn').textContent = n;
        card.classList.toggle('warn', !!warn && n > 0);
        card.classList.toggle('good', !!warn && n === 0);
      };
      const pending = DB.rows('Cong_viec').filter(r => !r.Ngay_hoan_thanh);
      set('tr', pending.length);
      set('od', pending.filter(r => SCHEMA.transStatus(r, DB) === 'Quá hạn').length, true);
      set('tk', DB.rows('Cong_viec_duoc_giao').filter(r => r.Trang_thai === 'Đang xử lý').length);
      set('ex', ['BANGCAP', 'Chungchi_congviec'].flatMap(t => DB.rows(t))
        .filter(r => { const n = SCHEMA.expiryDays(r.NgayHetHan); return n != null && n <= window.APP_CONFIG.expiryWarnDays; }).length, true);
    }
  };

  // ---------------- DANH SÁCH ----------------
  V.list = async key => {
    const it = V.findItem(key);
    if (!it || !canItem(it)) return App.notFound();
    V.visit(key);
    if (it.type === 'dash') return Dash.render(it);
    if (it.type === 'music') return Music.render(it);
    const t = it.table, def = TT()[t], L = def.list || {};
    App.head(it.label, { back: true });
    App.loading();
    await DB.loadDeps(t);
    const sorts = V.sortOptions(t);
    const st = (V.state[key] = V.state[key] || { q: '', f: null, s: sorts[0].id });
    const canAdd = App.user.admin || (it.album ? Perm.rank(quyen()[it.perm]) === 2 : tableLv(t) === 2);
    const addHref = `#/f/${t}/new` + (it.album ? '?Album=' + enc(it.album) : '');
    const chipField = L.type === 'gallery' || L.type === 'calendar' ? null : (L.filter || L.group);

    App.main.innerHTML = `<div class="lbar">
        <label class="lsearch">${Icon('search')}<input type="search" placeholder="Tìm trong ${esc(it.label.toLowerCase())}…" value="${esc(st.q)}"></label>
        ${sorts.length > 1 ? `<select class="lsort" title="Sắp xếp">${sorts.map(s => `<option value="${s.id}" ${s.id === st.s ? 'selected' : ''}>${esc(s.l)}</option>`).join('')}</select>` : ''}
        ${canAdd ? `<a class="btn ladd" href="${addHref}">${Icon('plus')}Thêm</a>` : ''}
      </div>
      <div class="chips-row" id="chips"></div><div id="lst"></div>
      ${canAdd ? `<a class="fab" href="${addHref}" title="Thêm mới" style="--gc:${it.color || 'var(--pri)'}">${Icon('plus')}</a>` : ''}`;
    App.main.classList.toggle('has-fab', canAdd);

    const base = () => V.filterRows(it, '');
    const drawChips = () => {
      const box = document.getElementById('chips');
      if (!chipField) { box.hidden = true; return; }
      const all = base(), counts = new Map();
      all.forEach(r => { const g = groupValue(t, r, chipField); counts.set(g, (counts.get(g) || 0) + 1); });
      if (counts.size < 2) { box.hidden = true; st.f = null; return; }
      const keys = V.orderGroups(t, chipField, [...counts.keys()]);
      box.innerHTML = [`<button class="chip2 ${st.f == null ? 'on' : ''}" data-f="">Tất cả <b>${all.length}</b></button>`,
        ...keys.map(k => `<button class="chip2 ${st.f === k ? 'on' : ''}" data-f="${esc(k)}">${esc(k || '(trống)')} <b>${counts.get(k)}</b></button>`)].join('');
      box.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
        st.f = b.dataset.f === '' ? null : b.dataset.f;
        drawChips(); draw();
      });
    };
    const draw = () => {
      let rows = V.filterRows(it, st.q);
      if (chipField && st.f != null) rows = rows.filter(r => groupValue(t, r, chipField) === st.f);
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
    drawChips(); draw();
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
      const nq = U.norm(query);
      const fs = def.fields.filter(f => !f.enc && f.t !== 'image' && f.t !== 'file');
      rows = rows.filter(r => U.norm([DB.title(t, r), DB.sub(t, r), ...fs.map(f =>
        f.t === 'ref' ? DB.title(f.ref, DB.get(f.ref, r[f.n])) : DB.val(t, r, f.n))].join(' ')).includes(nq));
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
      return keys.map(g => `<details class="lgrp" open><summary>${esc(g || '(trống)')} <span class="cnt">${groups.get(g).length}</span></summary>
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
        input = `<div class="inl"><input ${nm} type="date" value="${esc(U.isoOf(v))}"><button type="button" class="qd" data-today="${esc(f.n)}">Hôm nay</button></div>`;
        break;
      case 'datetime':
        input = `<div class="inl"><input ${nm} type="datetime-local" value="${esc(U.toLocalInput(v))}"><button type="button" class="qd" data-now="${esc(f.n)}">Bây giờ</button></div>`;
        break;
      case 'expiry': {
        const no = v !== '' && !U.parseDate(v);
        input = `<div class="inl wrap"><input ${nm} type="date" value="${esc(U.isoOf(v))}" ${no ? 'disabled' : ''}>
          <label class="chk qd"><input type="checkbox" data-noexp="${esc(f.n)}" ${no ? 'checked' : ''}> Không thời hạn</label></div>`;
        break;
      }
      case 'enum':
        if (f.other) input = `<input ${nm} list="dl_${esc(f.n)}" value="${esc(v)}" placeholder="Chọn hoặc gõ"><datalist id="dl_${esc(f.n)}">${f.opts.map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
        else if (f.opts.length <= SEG_MAX) input = seg([...f.opts, ...(v && !f.opts.includes(v) ? [v] : [])].map(o => ({ v: o, l: o })), v);
        else input = `<select ${nm}><option value=""></option>${[...f.opts, ...(v && !f.opts.includes(v) ? [v] : [])].map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        break;
      case 'ref': {
        const rows = DB.rows(f.ref).slice().sort((a, b) => DB.title(f.ref, a).localeCompare(DB.title(f.ref, b), 'vi', { numeric: true }));
        if (rows.length && rows.length <= SEG_MAX && (!v || DB.get(f.ref, v))) {
          input = seg(rows.map(x => ({ v: String(DB.keyOf(f.ref, x)), l: DB.title(f.ref, x) })), v);
        } else {
          input = `<select ${nm}><option value=""></option>${rows.map(x => { const k = String(DB.keyOf(f.ref, x)); return `<option value="${esc(k)}" ${k === String(v) ? 'selected' : ''}>${esc(DB.title(f.ref, x))}</option>`; }).join('')}
            ${v && !DB.get(f.ref, v) ? `<option value="${esc(v)}" selected>${esc(v)}</option>` : ''}</select>`;
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
          input = `<input ${nm} type="${type}" ${im} value="${esc(v)}" ${ro}>`;
        }
      }
    }
    return `<div class="fld" data-f="${esc(f.n)}"><span class="lbl">${esc(f.l)}${f.req ? ' <b class="req">*</b>' : ''}</span>${input}</div>`;
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

    App.main.innerHTML = `<form class="fwrap" novalidate>
      <div class="card form">${main.map(f => fieldInput(t, f, r, isNew, def)).join('')}</div>
      ${att.length ? `<div class="card form"><div class="fsec"><span class="gic" style="--gc:${meta.color}">${Icon('file')}</span>Đính kèm</div>
        ${att.map(f => fieldInput(t, f, r, isNew, def)).join('')}</div>` : ''}
      <div class="fbar"><button type="button" class="btn ghost" data-cancel>Huỷ</button><button class="btn" type="submit">${Icon('check')} Lưu</button></div></form>`;
    const form = App.main.querySelector('form');
    V.hydrate(form);
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
    form.querySelectorAll('[data-today]').forEach(b => b.onclick = () => { byName(b.dataset.today).value = U.today(); dirty = true; });
    form.querySelectorAll('[data-now]').forEach(b => b.onclick = () => { byName(b.dataset.now).value = U.toLocalInput(new Date()); dirty = true; });
    form.querySelectorAll('[data-noexp]').forEach(c => {
      c.onchange = () => { const d = byName(c.dataset.noexp); d.disabled = c.checked; if (c.checked) d.value = ''; };
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

    form.onsubmit = async e => {
      e.preventDefault();
      form.querySelectorAll('.fld.err').forEach(b => b.classList.remove('err'));
      const out = {}, missing = [], uploads = [];
      for (const f of fields) {
        const el = byName(f.n);
        let val;
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
      if (missing.length) {
        missing.forEach(f => markErr(f, 'Bắt buộc nhập'));
        q('.fld.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return U.toast('Còn ' + missing.length + ' mục bắt buộc chưa nhập', 'err');
      }
      const k = isNew ? (def.keyEditable ? out[def.key] : U.uid()) : key;
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
        if (isNew) await DB.add(t, out); else await DB.update(t, out);
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
