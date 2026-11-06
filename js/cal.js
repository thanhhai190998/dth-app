// Lịch (bảng Calendar): xem theo Tháng / Tuần / Danh sách (bảng kiểu Access — views.js gridList).
// Bấm ô ngày (Tháng) hoặc khung giờ trống (Tuần) để thêm sự kiện ngay trên lịch; bấm sự kiện để xem / sửa / xoá.
// Nhắc lịch: trước giờ bắt đầu theo cột "Nhắc trước" (trống = mặc định của máy này) → thẻ nhắc trong app + thông báo của máy
// (Windows / Android / iPhone đã cài app) khi đang dùng cửa sổ khác. Chỉ nhắc được khi app đang mở (kể cả thu nhỏ, chạy nền).
(function () {
  const esc = U.esc, enc = encodeURIComponent, T = 'Calendar';
  const pad = n => String(n).padStart(2, '0');
  const DOW = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  const DOW_S = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const HOUR = 48;   // chiều cao 1 giờ ở chế độ Tuần (px)
  const COLORS = ['var(--g0)', 'var(--g2)', 'var(--g4)', 'var(--g5)', 'var(--g1)', 'var(--g8)', 'var(--g3)', 'var(--g7)'];
  const Cal = (window.Cal = {});
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } };
  const tableLv = () => permTableLevel(App.user, T);
  const rowLv = r => permRowLevel(App.user, T, r, (pt, k) => DB.get(pt, k));
  const isPhone = () => matchMedia('(max-width: 759px)').matches;

  // ---------------- Ngày giờ ----------------
  const dkey = d => U.iso(d);   // 'yyyy-mm-dd'
  const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
  const monday = d => addD(sod(d), -((d.getDay() + 6) % 7));
  const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const store = d => dkey(d) + ' ' + hm(d);   // giá trị lưu 'yyyy-mm-dd HH:mm' (giống form)
  const dowOf = d => DOW[(d.getDay() + 6) % 7];
  const ddmm = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1);

  // ---------------- Nhắc trước ----------------
  Cal.LEADS = ['Không nhắc', 'Đúng giờ', '5 phút', '10 phút', '15 phút', '30 phút', '1 giờ', '2 giờ', '1 ngày', '2 ngày'];
  const DEF_LEADS = [5, 10, 15, 30, 60, 120, 1440];
  // '15 phút' → 15, '1 giờ' → 60, '1 ngày' → 1440, 'Đúng giờ' → 0, 'Không nhắc' → null, trống / không hiểu → undefined (= mặc định)
  const leadMin = v => {
    const s = U.norm(v).trim();
    if (!s) return undefined;
    if (/khong/.test(s)) return null;
    if (/dung gio/.test(s)) return 0;
    const m = s.match(/(\d+)\s*(phut|gio|ngay)/);
    return m ? +m[1] * { phut: 1, gio: 60, ngay: 1440 }[m[2]] : undefined;
  };
  const leadText = m => m == null ? 'Không nhắc' : m === 0 ? 'Đúng giờ' : m % 1440 === 0 ? m / 1440 + ' ngày' : m % 60 === 0 ? m / 60 + ' giờ' : m + ' phút';
  Cal.cfg = () => Object.assign({ on: true, def: 15 }, lsGet('pwa-cal-noti', {}));
  const setCfg = o => lsSet('pwa-cal-noti', Object.assign(Cal.cfg(), o));
  const leadOf = r => { const m = leadMin(r.Nhac_truoc); return m === undefined ? Cal.cfg().def : m; };

  // ---------------- Sự kiện ----------------
  const colorOf = s => { let h = 0; for (const c of U.norm(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const evOf = r => {
    const s = U.parseDate(r.NgayBatDau);
    if (!s) return null;
    let e = U.parseDate(r.NgayKetThuc);
    const noEnd = !e || e <= s;
    if (noEnd) e = new Date(s.getTime() + 3600000);   // không có giờ kết thúc → vẽ 1 tiếng
    const last = new Date(e.getTime() - 60000);         // kết thúc đúng 00:00 → vẫn thuộc ngày trước
    return { r, id: String(DB.keyOf(T, r)), title: String(r.TenSuKien || '(Không tên)'), s, e, last, noEnd, multi: dkey(s) !== dkey(last), color: colorOf(r.TenSuKien) };
  };
  const allEvents = q => DB.rows(T).map(evOf).filter(ev => ev && (!q || U.match(ev.title, q))).sort((a, b) => a.s - b.s || a.title.localeCompare(b.title, 'vi'));
  const order = (a, b) => (b.multi - a.multi) || (a.s - b.s) || a.title.localeCompare(b.title, 'vi');
  const onDay = (evs, d) => { const a = sod(d), b = addD(a, 1); return evs.filter(ev => ev.s < b && ev.last >= a).sort(order); };

  // "Hôm nay · 08:00–09:30", "Thứ Bảy 12/12 · 07:00 → 13/12 17:00"
  const whenText = ev => {
    const n = U.daysBetween(U.today(), dkey(ev.s));
    const day = n === 0 ? 'Hôm nay' : n === 1 ? 'Ngày mai' : n === -1 ? 'Hôm qua' : dowOf(ev.s) + ' ' + U.fmtDate(ev.s);
    return day + ' · ' + hm(ev.s) + (ev.noEnd ? '' : ev.multi ? ' → ' + ddmm(ev.e) + ' ' + hm(ev.e) : '–' + hm(ev.e));
  };
  // Còn bao lâu: "còn 25 phút", "còn 3 giờ 10 phút", "còn 2 ngày", "đang diễn ra", "đã qua"
  const relText = (ev, now = Date.now()) => {
    if (now >= ev.e.getTime()) return 'Đã qua';
    if (now >= ev.s.getTime()) return 'Đang diễn ra';
    const m = Math.ceil((ev.s - now) / 60000);
    if (m < 60) return 'Còn ' + m + ' phút';
    if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return 'Còn ' + h + ' giờ' + (r ? ' ' + r + ' phút' : ''); }
    const d = U.daysBetween(U.today(), dkey(ev.s));
    return d === 1 ? 'Ngày mai' : 'Còn ' + d + ' ngày';
  };

  // ---------------- Trang Lịch ----------------
  Cal.render = async it => {
    const key = it.key;
    const st = (Views.state[key] = Views.state[key] || {});
    st.mode = st.mode || lsGet('pwa-cal-mode', 'month');
    st.cur = st.cur || U.today();   // tháng / tuần đang xem chứa ngày này
    st.sel = st.sel || U.today();   // ngày đang chọn (danh sách bên phải / bên dưới)
    st.q = st.q || '';
    // #/i/Calendar?e=<id> (bấm thẻ nhắc / thông báo) → mở đúng ngày + hộp xem sự kiện; ?d=yyyy-mm-dd → mở ngày đó
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');
    const openId = qs.get('e');
    if (qs.get('d') && U.parseDate(qs.get('d'))) st.cur = st.sel = U.isoOf(qs.get('d'));
    if (openId || qs.get('d')) { history.replaceState(null, '', '#/i/' + enc(key)); if (st.mode === 'list') st.mode = 'month'; }
    const setMode = m => { st.mode = m; lsSet('pwa-cal-mode', m); Cal.render(it); };

    if (st.mode === 'list') {   // bảng kiểu Access như các mục khác + nút đổi chế độ xem
      await Views.gridList(it);
      const bar = App.main.querySelector('.lbar');
      if (bar) {
        bar.insertAdjacentHTML('afterbegin', modeSeg(st.mode));
        bar.querySelector('.cmode').onclick = e => { const b = e.target.closest('[data-m]'); if (b && b.dataset.m !== st.mode) setMode(b.dataset.m); };
      }
      return;
    }

    App.head(it.label, { back: true });
    App.loading();
    await DB.loadDeps(T);
    const canAdd = App.user.admin || tableLv() === 2;
    if (openId) {
      const r = DB.get(T, openId), ev = r && evOf(r);
      if (ev) st.cur = st.sel = dkey(ev.s);
    }
    App.main.innerHTML = `<div class="calw ${st.mode === 'week' ? 'is-week' : 'is-month'}">
      <div class="cbar">
        <div class="cnav">
          <button type="button" class="cib" data-nav="-1" title="${st.mode === 'week' ? 'Tuần trước' : 'Tháng trước'}">${Icon('chevron')}</button>
          <button type="button" class="cib" data-nav="1" title="${st.mode === 'week' ? 'Tuần sau' : 'Tháng sau'}">${Icon('chevron')}</button>
          <button type="button" class="btn ghost ctoday" data-today>Hôm nay</button>
          <h2 class="ctitle" id="ctitle"></h2>
        </div>
        <label class="lsearch csearch">${Icon('search')}<input type="search" placeholder="Tìm trong lịch…" value="${esc(st.q)}"></label>
        ${modeSeg(st.mode)}
        ${canAdd ? `<button type="button" class="btn cadd" data-add>${Icon('plus')}<span>Thêm</span></button>` : ''}
      </div>
      <div class="cbody"><div class="cmain" id="cmain"></div><aside class="cside" id="cside"></aside></div>
      ${canAdd ? `<button type="button" class="fab" data-add title="Thêm sự kiện" style="--gc:${it.color || 'var(--pri)'}">${Icon('plus')}</button>` : ''}
    </div>`;
    App.main.classList.toggle('has-fab', canAdd);
    const root = App.main.querySelector('.calw'), main = root.querySelector('#cmain'), side = root.querySelector('#cside');
    let evs = [];

    // Mở hộp thêm: ngày k (giờ min tính từ 0:00 nếu bấm khung giờ); không có giờ → hôm nay: giờ chẵn kế tiếp, ngày khác: 08:00
    const presetFor = (k, min) => {
      const d = U.parseDate(k) || new Date();
      let s;
      if (min != null) s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, min);
      else if (k === U.today()) { const n = new Date(); s = new Date(n.getFullYear(), n.getMonth(), n.getDate(), Math.min(23, n.getHours() + 1)); }
      else s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8);
      return { s, e: new Date(s.getTime() + 3600000) };
    };
    const after = saved => { if (saved) { const ev = evOf(saved); if (ev) st.sel = dkey(ev.s); } draw(); Cal.tick(); };
    const addAt = (k, min) => { if (canAdd) editor(null, presetFor(k, min), after); };
    const view = id => { const r = DB.get(T, id); if (r) viewer(r, after); };

    const draw = () => {
      evs = allEvents(st.q);
      if (st.mode === 'week') drawWeek(); else drawMonth();
      drawSide();
    };

    // ---- Tháng ----
    const drawMonth = () => {
      const cur = U.parseDate(st.cur), first = new Date(cur.getFullYear(), cur.getMonth(), 1), last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      const start = monday(first), weeks = Math.ceil((U.daysBetween(start, last) + 1) / 7), today = U.today();
      const nIn = evs.filter(ev => ev.s <= addD(last, 1) && ev.last >= first).length;
      root.querySelector('#ctitle').innerHTML = `Tháng ${cur.getMonth() + 1}, ${cur.getFullYear()}<small>${nIn ? nIn + ' sự kiện' : 'Chưa có sự kiện'}</small>`;
      let h = `<div class="cm-h">${DOW.map((d, i) => `<span class="${i > 4 ? 'we' : ''}"><b class="lg">${d}</b><b class="sm">${DOW_S[i]}</b></span>`).join('')}</div>
        <div class="cm-g" style="--wk:${weeks}">`;
      for (let i = 0; i < weeks * 7; i++) {
        const d = addD(start, i), k = dkey(d), list = onDay(evs, d);
        const cls = [d.getMonth() !== cur.getMonth() && 'out', k === today && 'today', k === st.sel && 'sel', i % 7 > 4 && 'we', k < today && 'pastd'].filter(Boolean).join(' ');
        h += `<div class="cm-d ${cls}" data-d="${k}">
          <div class="cm-dh"><button type="button" class="cm-n" data-wk="${k}" title="Xem tuần này">${d.getDate() === 1 ? '1/' + (d.getMonth() + 1) : d.getDate()}</button>
            ${canAdd ? `<span class="cm-p" title="Thêm sự kiện ngày ${U.fmtDate(d)}">${Icon('plus')}</span>` : ''}</div>
          <div class="cm-ev">${list.map(ev => chip(ev, d)).join('')}</div></div>`;
      }
      main.innerHTML = h + '</div>';
      fit();
    };
    const chip = (ev, d) => {
      const first = dkey(ev.s) === dkey(d), lastDay = dkey(ev.last) === dkey(d), past = ev.e < Date.now();
      return `<button type="button" class="ce ${ev.multi ? 'mul' : ''} ${ev.multi && !first ? 'cont' : ''} ${ev.multi && !lastDay ? 'more' : ''} ${past ? 'past' : ''}"
        data-e="${esc(ev.id)}" style="--ec:${ev.color}" title="${esc(ev.title + ' — ' + whenText(ev))}">
        ${first ? `<span class="ct">${hm(ev.s)}</span>` : ''}<span class="cn">${esc(ev.title)}</span></button>`;
    };
    // Ô ngày không đủ chỗ → ẩn bớt, thêm "+N nữa" (bấm = chọn ngày, danh sách đủ ở cột bên)
    const fitCells = () => {
      if (isPhone()) return;
      main.querySelectorAll('.cm-ev').forEach(box => {
        const chips = [...box.querySelectorAll('.ce')];
        box.querySelector('.cmore')?.remove();
        chips.forEach(c => { c.hidden = false; });
        if (!chips.length || box.scrollHeight <= box.clientHeight + 1) return;
        const ch = chips[0].offsetHeight + 3, fitN = Math.max(0, Math.floor(box.clientHeight / ch) - 1);
        chips.slice(fitN).forEach(c => { c.hidden = true; });
        box.insertAdjacentHTML('beforeend', `<button type="button" class="cmore" data-more="${box.parentNode.dataset.d}">+${chips.length - fitN} nữa</button>`);
      });
    };

    // ---- Tuần ----
    const drawWeek = () => {
      const a = monday(U.parseDate(st.cur)), days = [...Array(7)].map((_, i) => addD(a, i)), today = U.today(), z = days[6];
      root.querySelector('#ctitle').innerHTML = (a.getMonth() === z.getMonth() ? pad(a.getDate()) : ddmm(a)) + ' – ' + U.fmtDate(z)
        + `<small>Tuần ${weekNo(a)}</small>`;
      if (isPhone()) {   // điện thoại: 7 ngày xếp dọc, mỗi ngày 1 danh sách
        main.innerHTML = `<div class="cwl">${days.map(d => {
          const k = dkey(d), list = onDay(evs, d);
          return `<div class="cwl-d ${k === today ? 'today' : ''} ${k === st.sel ? 'sel' : ''}" data-d="${k}">
            <div class="cwl-h"><b>${dowOf(d)}</b><span>${U.fmtDate(d)}</span>${canAdd ? `<button type="button" class="cib sm" data-addd="${k}" title="Thêm sự kiện ngày ${U.fmtDate(d)}">${Icon('plus')}</button>` : ''}</div>
            ${list.length ? list.map(ev => agRow(ev, d)).join('') : '<div class="ag-empty">Không có sự kiện</div>'}</div>`;
        }).join('')}</div>`;
        return;
      }
      const alls = days.map(d => onDay(evs, d).filter(ev => ev.multi));
      let h = `<div class="cw" style="--hh:${HOUR}px">
        <div class="cw-h"><span class="cw-g"></span>${days.map((d, i) => `<button type="button" class="cw-dh ${dkey(d) === today ? 'today' : ''} ${dkey(d) === st.sel ? 'sel' : ''} ${i > 4 ? 'we' : ''}" data-pick="${dkey(d)}">
          <small>${DOW_S[i]}</small><b>${d.getDate()}</b></button>`).join('')}</div>
        ${alls.some(x => x.length) ? `<div class="cw-all"><span class="cw-g">Nhiều ngày</span>${days.map((d, i) => `<div class="cw-ad" data-d="${dkey(d)}">${alls[i].map(ev => chip(ev, d)).join('')}</div>`).join('')}</div>` : ''}
        <div class="cw-s" id="cws"><div class="cw-b"><div class="cw-hrs">${[...Array(24)].map((_, i) => `<span>${i ? pad(i) + ':00' : ''}</span>`).join('')}</div>`;
      days.forEach(d => {
        const k = dkey(d), list = onDay(evs, d).filter(ev => !ev.multi);
        h += `<div class="cw-col ${k === today ? 'today' : ''} ${(d.getDay() + 6) % 7 > 4 ? 'we' : ''}" data-col="${k}">${lanes(list).map(({ ev, lane, of }) => {
          const top = (ev.s.getHours() * 60 + ev.s.getMinutes()) / 60 * HOUR;
          const end = Math.min(24 * 60, (ev.e - sod(d)) / 60000), hgt = Math.max(22, end / 60 * HOUR - top - 2);
          const lc = Math.max(1, Math.floor((hgt - 22) / 15));   // số dòng tên vừa ô (chừa 1 dòng giờ)
          return `<button type="button" class="cwe ${ev.e < Date.now() ? 'past' : ''} ${hgt < 40 ? 'short' : ''}" data-e="${esc(ev.id)}" title="${esc(ev.title + ' — ' + whenText(ev))}"
            style="--ec:${ev.color};--lc:${lc};top:${top}px;height:${hgt}px;left:calc(${lane / of * 100}% + 2px);width:calc(${100 / of}% - 4px)">
            <b>${esc(ev.title)}</b><span>${hm(ev.s)}${ev.noEnd ? '' : '–' + hm(ev.e)}</span></button>`;
        }).join('')}${k === today ? '<i class="cw-now"></i>' : ''}</div>`;
      });
      main.innerHTML = h + '</div></div></div>';
      const sc = main.querySelector('#cws');
      nowLine();
      fit();   // đặt chiều cao khung cuộn trước rồi mới cuộn
      // Cuộn tới giờ của sự kiện sớm nhất trong tuần (mặc định 07:00); lần sau giữ nguyên chỗ đang cuộn
      const early = Math.min(7, ...days.flatMap(d => onDay(evs, d).filter(ev => !ev.multi && dkey(ev.s) === dkey(d)).map(ev => ev.s.getHours())));
      sc.scrollTop = st.wtop != null ? st.wtop : Math.max(0, early - 0.5) * HOUR;
      sc.onscroll = () => { st.wtop = sc.scrollTop; };
    };
    // Sự kiện chồng giờ nhau → chia cột (mỗi nhóm chồng nhau chia đều bề ngang)
    const lanes = list => {
      const out = [];
      let group = [], ends = [], gEnd = 0;
      const flush = () => { group.forEach(x => { x.of = ends.length; }); group = []; ends = []; };
      list.slice().sort((a, b) => a.s - b.s || b.e - a.e).forEach(ev => {
        const s = ev.s.getTime(), e = Math.max(ev.e.getTime(), s + 30 * 60000);
        if (group.length && s >= gEnd) flush();
        let lane = ends.findIndex(x => x <= s);
        if (lane < 0) { lane = ends.length; ends.push(e); } else ends[lane] = e;
        gEnd = group.length ? Math.max(gEnd, e) : e;
        const x = { ev, lane, of: 1 }; group.push(x); out.push(x);
      });
      flush();
      return out;
    };
    const weekNo = d => {   // số tuần ISO (tuần bắt đầu thứ Hai)
      const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
      return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
    };
    const nowLine = () => { const l = main.querySelector('.cw-now'); if (l) { const n = new Date(); l.style.top = (n.getHours() * 60 + n.getMinutes()) / 60 * HOUR + 'px'; } };
    Cal._nowLine = nowLine;

    // ---- Cột bên: ngày đang chọn · sắp tới (hoặc kết quả tìm) · nhắc lịch ----
    const agRow = (ev, d) => {
      const t = ev.multi ? (d && dkey(d) !== dkey(ev.s) ? (dkey(d) === dkey(ev.last) ? 'đến ' + hm(ev.e) : 'cả ngày') : 'từ ' + hm(ev.s)) : hm(ev.s) + (ev.noEnd ? '' : '–' + hm(ev.e));
      return `<button type="button" class="ag ${ev.e < Date.now() ? 'past' : ''}" data-e="${esc(ev.id)}" style="--ec:${ev.color}"><span class="ag-t">${t}</span><span class="ag-n">${esc(ev.title)}</span></button>`;
    };
    const drawSide = () => {
      const sd = U.parseDate(st.sel), list = onDay(evs, sd), now = Date.now();
      const n = U.daysBetween(U.today(), st.sel);
      let h = Cal.cfg().on && notiState() === 'default' ? `<section class="cs-card cs-ask">${Icon('bell')}<div><b>Bật thông báo nhắc lịch</b>
          <span>Máy sẽ báo trước giờ bắt đầu, kể cả khi bạn đang dùng cửa sổ khác</span></div><button type="button" class="btn sm" data-nperm>Cho phép</button></section>` : '';
      h += `<section class="cs-card cs-day"><div class="cs-h"><div><small>${n === 0 ? 'Hôm nay' : n === 1 ? 'Ngày mai' : n === -1 ? 'Hôm qua' : 'Ngày đã chọn'}</small>
          <b>${dowOf(sd)}, ${U.fmtDate(sd)}</b></div>${canAdd ? `<button type="button" class="cib" data-addd="${st.sel}" title="Thêm sự kiện ngày này">${Icon('plus')}</button>` : ''}</div>
        ${list.length ? list.map(ev => agRow(ev, sd)).join('') : `<div class="ag-empty">Không có sự kiện${canAdd ? ` · <button type="button" class="linkbtn" data-addd="${st.sel}">Thêm</button>` : ''}</div>`}</section>`;
      if (st.q) {
        const found = evs.slice().sort((a, b) => b.s - a.s);
        h += `<section class="cs-card"><div class="cs-h"><b>Kết quả tìm “${esc(st.q)}”</b><span class="cs-n">${found.length}</span></div>
          ${found.length ? found.slice(0, 40).map(ev => `<button type="button" class="ag up" data-go="${esc(ev.id)}" style="--ec:${ev.color}">
            <span class="ag-n">${esc(ev.title)}</span><span class="ag-w">${esc(whenText(ev))}</span></button>`).join('') : '<div class="ag-empty">Không có sự kiện nào khớp</div>'}</section>`;
      } else {
        const up = allEvents('').filter(ev => ev.e.getTime() > now && ev.s.getTime() - now < 14 * 86400000).slice(0, 6);
        h += `<section class="cs-card"><div class="cs-h"><b>Sắp tới</b><span class="cs-n">14 ngày</span></div>
          ${up.length ? up.map(ev => { const rt = relText(ev, now), hot = ev.s.getTime() - now < 86400000;
            return `<button type="button" class="ag up" data-go="${esc(ev.id)}" style="--ec:${ev.color}">
              <span class="ag-n">${esc(ev.title)}</span><span class="ag-w">${esc(whenText(ev))}</span><span class="ag-r ${hot ? 'hot' : ''}">${esc(rt)}</span></button>`; }).join('')
            : '<div class="ag-empty">Không có sự kiện nào trong 14 ngày tới</div>'}</section>`;
      }
      h += notiCard();
      side.innerHTML = h;
      wireNoti(side, drawSide);
    };

    // ---- Thao tác ----
    const nav = dir => {
      const c = U.parseDate(st.cur);
      st.cur = dkey(st.mode === 'week' ? addD(c, 7 * dir) : new Date(c.getFullYear(), c.getMonth() + dir, 1));
      draw();
    };
    root.querySelectorAll('[data-nav]').forEach(b => { b.onclick = () => nav(+b.dataset.nav); });
    root.querySelector('[data-today]').onclick = () => { st.cur = st.sel = U.today(); st.wtop = null; draw(); };
    root.querySelector('.cmode').onclick = e => { const b = e.target.closest('[data-m]'); if (b && b.dataset.m !== st.mode) setMode(b.dataset.m); };
    root.querySelectorAll('[data-add]').forEach(b => { b.onclick = () => addAt(st.sel); });
    let qt = null;
    root.querySelector('.csearch input').oninput = e => { st.q = e.target.value.trim(); clearTimeout(qt); qt = setTimeout(draw, 150); };
    const pick = k => {   // chọn ngày: tô ô, vẽ lại cột bên (không vẽ lại cả lịch)
      st.sel = k;
      main.querySelectorAll('.sel').forEach(x => x.classList.remove('sel'));
      main.querySelectorAll(`[data-d="${k}"], [data-pick="${k}"]`).forEach(x => x.classList.add('sel'));
      drawSide();
    };
    root.onclick = e => {
      const tg = e.target;
      const ev = tg.closest('[data-e]'); if (ev) return view(ev.dataset.e);
      const go = tg.closest('[data-go]');
      if (go) {   // sự kiện ở danh sách Sắp tới / Kết quả tìm → nhảy lịch tới ngày đó rồi mở
        const r = DB.get(T, go.dataset.go), x = r && evOf(r);
        if (x) { st.cur = st.sel = dkey(x.s); st.wtop = null; draw(); view(x.id); }
        return;
      }
      const ad = tg.closest('[data-addd]'); if (ad) return addAt(ad.dataset.addd);
      const more = tg.closest('[data-more]'); if (more) { pick(more.dataset.more); if (isPhone()) side.scrollIntoView({ behavior: 'smooth' }); return; }
      const wk = tg.closest('[data-wk]'); if (wk && !isPhone()) { st.cur = st.sel = wk.dataset.wk; st.wtop = null; setMode('week'); return; }
      const pk = tg.closest('[data-pick]'); if (pk) return pick(pk.dataset.pick);
      const col = tg.closest('[data-col]');
      if (col) {   // khung giờ trống → thêm sự kiện từ nửa giờ đó
        const y = e.clientY - col.getBoundingClientRect().top;
        pick(col.dataset.col);
        return addAt(col.dataset.col, Math.max(0, Math.min(23 * 60 + 30, Math.floor(y / HOUR * 2) * 30)));
      }
      const cell = tg.closest('.cm-d[data-d], .cwl-d[data-d], .cw-ad[data-d]');
      if (cell) {
        const k = cell.dataset.d, was = st.sel === k;
        pick(k);
        // Máy tính: bấm ô ngày = thêm ngay. Điện thoại: chạm lần 1 chọn ngày (xem danh sách bên dưới), chạm lần 2 mới thêm
        if (!isPhone() || was) addAt(k);
      }
    };
    // Điện thoại: vuốt ngang để sang tháng / tuần khác
    let sx = null, sy = null;
    main.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    main.addEventListener('touchend', e => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) nav(dx < 0 ? 1 : -1);
    }, { passive: true });

    // Lịch kéo dài tới sát chân trang (máy tính); điện thoại: cao theo nội dung
    const fit = () => {
      const g = main.querySelector(st.mode === 'week' ? '#cws' : '.cm-g');
      side.style.maxHeight = '';
      if (!g) return;
      if (isPhone()) { g.style.height = ''; return; }
      const foot = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--foot-h')) || 0;
      const h = Math.max(st.mode === 'week' ? 320 : 6 * 84, innerHeight - (g.getBoundingClientRect().top + window.scrollY) - foot - 14);
      g.style.height = h + 'px';
      const gr = g.getBoundingClientRect(), sr = side.getBoundingClientRect();
      if (sr.left >= gr.right) side.style.maxHeight = (gr.bottom - sr.top) + 'px';   // cột bên nằm cạnh lịch → cao bằng lịch, tự cuộn
      if (st.mode !== 'week') fitCells();
    };
    Cal._fit = () => { if (document.body.contains(root)) fit(); };
    if (!Cal._rz) { Cal._rz = true; let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => Cal._fit && Cal._fit(), 120); }); }

    draw();
    if (document.fonts) document.fonts.ready.then(() => Cal._fit());
    if (openId) view(openId);
  };

  const modeSeg = m => `<div class="seg mini cmode" role="tablist">${[['month', 'Tháng'], ['week', 'Tuần'], ['list', 'Danh sách']].map(([v, l]) =>
    `<button type="button" class="segb ${v === m ? 'on' : ''}" data-m="${v}">${l}</button>`).join('')}</div>`;

  // ---------------- Hộp xem sự kiện ----------------
  const modal = (html, cls) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-bg calbg';
    wrap.innerHTML = `<div class="modal ${cls || ''}" role="dialog">${html}</div>`;
    document.body.appendChild(wrap);
    const close = () => { wrap.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape' && [...document.querySelectorAll('.modal-bg')].pop() === wrap) close(); };
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    wrap.querySelectorAll('[data-x]').forEach(b => { b.onclick = close; });
    return { wrap, box: wrap.firstElementChild, close };
  };
  const viewer = (r, after) => {
    const ev = evOf(r);
    if (!ev) return;
    const id = ev.id, lv = rowLv(r), lead = leadOf(r), own = leadMin(r.Nhac_truoc) !== undefined;
    const rel = relText(ev);
    const m = modal(`<div class="calv-h" style="--ec:${ev.color}"><span class="calv-dot"></span><h3>${esc(ev.title)}</h3>
        ${lv >= 2 ? `<button type="button" class="cib" data-ed title="Sửa">${Icon('edit')}</button><button type="button" class="cib" data-del title="Xoá">${Icon('trash')}</button>` : ''}
        <button type="button" class="cib" data-x title="Đóng">${Icon('x')}</button></div>
      <div class="calv-r">${Icon('clock')}<div><b>${esc(dowOf(ev.s))}, ${U.fmtDate(ev.s)}</b><span>${ev.multi ? `${hm(ev.s)} → ${dowOf(ev.e)}, ${U.fmtDate(ev.e)} ${hm(ev.e)}` : hm(ev.s) + (ev.noEnd ? ' (chưa có giờ kết thúc)' : ' – ' + hm(ev.e))}</span></div></div>
      <div class="calv-r">${Icon('bell')}<div><b>${lead == null ? 'Không nhắc' : 'Nhắc trước ' + leadText(lead)}</b><span>${own ? 'Đặt riêng cho sự kiện này' : 'Theo mặc định trên máy này'}${Cal.cfg().on ? '' : ' · nhắc lịch trên máy này đang tắt'}</span></div></div>
      <div class="calv-st ${rel === 'Đã qua' ? 'past' : rel === 'Đang diễn ra' ? 'now' : ''}">${esc(rel)}</div>
      <div class="row-end"><a class="btn ghost" href="#/r/${T}/${enc(id)}">Trang chi tiết</a>${lv >= 2 ? `<button type="button" class="btn" data-ed>${Icon('edit')}Sửa</button>` : ''}</div>`, 'calv');
    m.box.querySelector('.row-end a').onclick = () => m.close();
    m.box.querySelectorAll('[data-ed]').forEach(b => { b.onclick = () => { m.close(); editor(r, null, after); }; });
    const del = m.box.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      if (!(await U.confirm('Xoá sự kiện "' + ev.title + '"?'))) return;
      try { await DB.remove(T, id); m.close(); U.toast('Đã xoá', 'ok'); after(null); } catch (e) { U.toast(e.message, 'err'); }
    };
  };

  // ---------------- Hộp thêm / sửa sự kiện ----------------
  const editor = (r, preset, after) => {
    const isNew = !r, hasLead = !!DB.field(T, 'Nhac_truoc'), have = DB.rows(T);
    const noCol = window.APP_CONFIG.mode === 'live' && have.length && have.every(x => !('Nhac_truoc' in x));   // máy chủ chỉ ghi cột đã có trên Sheet
    const v = r ? { ...r } : { TenSuKien: '', NgayBatDau: store(preset.s), NgayKetThuc: store(preset.e), Nhac_truoc: '' };
    const m = modal(`<form novalidate>
      <div class="calv-h"><span class="gic" style="--gc:var(--g4)">${Icon('calendar')}</span><h3>${isNew ? 'Thêm sự kiện' : 'Sửa sự kiện'}</h3>
        <button type="button" class="cib" data-x title="Đóng">${Icon('x')}</button></div>
      <label class="fld"><span>Tên sự kiện</span><input name="TenSuKien" value="${esc(v.TenSuKien)}" placeholder="Vd: Họp giao ban" autocomplete="off" maxlength="200"></label>
      <div class="calm-2">
        <div class="fld"><span>Bắt đầu</span>${Views.dateInput('name="NgayBatDau"', U.toLocalInput(v.NgayBatDau), { time: true, label: 'Bắt đầu' })}</div>
        <div class="fld"><span>Kết thúc</span>${Views.dateInput('name="NgayKetThuc"', U.toLocalInput(v.NgayKetThuc), { time: true, label: 'Kết thúc' })}</div>
      </div>
      <div class="calm-q"><span>Thời lượng</span>${[[30, '30 phút'], [60, '1 giờ'], [120, '2 giờ'], [240, '4 giờ'], ['day', 'Cả ngày']].map(([d, l]) =>
        `<button type="button" class="chip2" data-dur="${d}" ${d === 'day' ? 'title="07:00 – 17:00"' : ''}>${l}</button>`).join('')}</div>
      ${noCol ? `<div class="fwarn">${Icon('alert')}<span>Tab <b>Calendar</b> trên Google Sheet chưa có cột <b>Nhac_truoc</b> — "Nhắc trước" riêng cho sự kiện chưa lưu được (vẫn nhắc theo mặc định của máy). Thêm tiêu đề cột này vào tab là dùng được.</span></div>` : ''}
      ${hasLead ? `<div class="fld"><span>Nhắc trước</span><select name="Nhac_truoc">${['', ...Cal.LEADS].map(o =>
        `<option value="${esc(o)}" ${o === String(v.Nhac_truoc || '') ? 'selected' : ''}>${o ? esc(o) : 'Mặc định của máy (' + esc(leadText(Cal.cfg().def)) + ')'}</option>`).join('')}</select></div>` : ''}
      <div class="row-end"><button type="button" class="btn ghost" data-x>Huỷ</button><button class="btn" type="submit">${Icon('check')}Lưu</button></div>
    </form>`, 'calm');
    const f = m.box.querySelector('form'), nm = f.elements.TenSuKien, s = f.elements.NgayBatDau, e = f.elements.NgayKetThuc;
    Views.dates(f);
    setTimeout(() => nm.focus(), 30);
    // Đổi giờ bắt đầu → giờ kết thúc dời theo, giữ nguyên thời lượng
    let dur = (U.parseDate(e.value) - U.parseDate(s.value)) || 3600000;
    const setNat = (el, d) => { el.value = U.toLocalInput(d); el._sync && el._sync(); };
    s.addEventListener('change', () => { const a = U.parseDate(s.value); if (a && dur > 0) setNat(e, new Date(a.getTime() + dur)); });
    e.addEventListener('change', () => { const a = U.parseDate(s.value), b = U.parseDate(e.value); if (a && b && b > a) dur = b - a; });
    f.querySelector('.calm-q').onclick = ev => {
      const b = ev.target.closest('[data-dur]'), a = U.parseDate(s.value);
      if (!b || !a) return;
      if (b.dataset.dur === 'day') { setNat(s, new Date(a.getFullYear(), a.getMonth(), a.getDate(), 7)); setNat(e, new Date(a.getFullYear(), a.getMonth(), a.getDate(), 17)); }
      else setNat(e, new Date(a.getTime() + +b.dataset.dur * 60000));
      dur = U.parseDate(e.value) - U.parseDate(s.value);
    };
    f.onsubmit = async ev => {
      ev.preventDefault();
      f.querySelectorAll('.fld.err').forEach(x => x.classList.remove('err'));
      const err = (el, msg) => { el.closest('.fld').classList.add('err'); U.toast(msg, 'err'); (el.closest('.dinp') ? el.closest('.dinp').querySelector('.dtxt') : el).focus(); };
      const title = nm.value.trim();
      if (!title) return err(nm, 'Nhập tên sự kiện');
      if (s.closest('.dinp.bad') || !U.parseDate(s.value)) return err(s, 'Giờ bắt đầu chưa đúng — nhập theo dd/mm/yyyy hh:mm');
      if (e.closest('.dinp.bad')) return err(e, 'Giờ kết thúc chưa đúng — nhập theo dd/mm/yyyy hh:mm');
      if (e.value && U.parseDate(e.value) <= U.parseDate(s.value)) return err(e, 'Giờ kết thúc phải sau giờ bắt đầu');
      const out = Object.assign({}, r || {}, { TenSuKien: title, NgayBatDau: s.value.replace('T', ' '), NgayKetThuc: e.value ? e.value.replace('T', ' ') : '' });
      if (hasLead) out.Nhac_truoc = f.elements.Nhac_truoc.value;
      if (isNew) out[DB.keyField(T)] = U.uid();
      const btn = f.querySelector('[type=submit]'), label = btn.innerHTML;
      btn.disabled = true; btn.textContent = 'Đang lưu…';
      try {
        const saved = isNew ? await DB.add(T, out) : await DB.update(T, out);
        m.close(); U.toast(isNew ? 'Đã thêm sự kiện' : 'Đã lưu', 'ok');
        after(saved || out);
      } catch (x) { U.toast(x.message, 'err'); btn.disabled = false; btn.innerHTML = label; }
    };
  };

  // ---------------- Nhắc lịch ----------------
  const notiState = () => !('Notification' in window) ? 'none' : Notification.permission;
  const notiCard = () => {
    const c = Cal.cfg(), p = notiState();
    const msg = !c.on ? 'Đang tắt — không nhắc lịch trên máy này'
      : p === 'granted' ? 'Đang bật · thẻ nhắc trong app + thông báo của máy khi bạn đang dùng cửa sổ khác'
      : p === 'denied' ? 'Chỉ nhắc trong app — máy đang <b>chặn thông báo</b> của app: bấm biểu tượng ổ khoá / ⓘ cạnh thanh địa chỉ (hoặc ⋯ → Thông tin ứng dụng) → Thông báo → Cho phép'
      : p === 'none' ? 'Chỉ nhắc trong app (trình duyệt này không hỗ trợ thông báo)'
      : 'Chỉ nhắc trong app — bấm <b>Cho phép</b> để nhận cả thông báo của máy';
    return `<section class="cs-card cs-noti"><div class="cs-h"><div><b>${Icon('bell')}Nhắc lịch</b></div>
        <input type="checkbox" class="sw" data-non ${c.on ? 'checked' : ''} aria-label="Bật nhắc lịch trên máy này"></div>
      <p class="cs-p">${msg}</p>
      ${c.on ? `<div class="cs-row"><span>Nhắc trước (mặc định)</span><select data-ndef>${DEF_LEADS.map(n => `<option value="${n}" ${n === c.def ? 'selected' : ''}>${leadText(n)}</option>`).join('')}</select></div>
        <div class="cs-act">${p === 'default' ? '<button type="button" class="btn sm" data-nperm>Cho phép thông báo</button>' : ''}
          <button type="button" class="btn sm ghost" data-ntest>Thử nhắc</button></div>` : ''}
      <p class="cs-p small">Áp dụng cho sự kiện không đặt riêng "Nhắc trước". Chỉ nhắc khi app đang mở (cửa sổ app hoặc thẻ trình duyệt, kể cả thu nhỏ).</p></section>`;
  };
  const wireNoti = (box, redraw) => {
    const q = s => box.querySelector(s);
    if (q('[data-non]')) q('[data-non]').onchange = e => { setCfg({ on: e.target.checked }); redraw(); if (e.target.checked) Cal.tick(); };
    if (q('[data-ndef]')) q('[data-ndef]').onchange = e => { setCfg({ def: +e.target.value }); U.toast('Mặc định nhắc trước ' + leadText(+e.target.value), 'ok'); Cal.tick(); };
    box.querySelectorAll('[data-nperm]').forEach(btn => { btn.onclick = async () => {
      try { await Notification.requestPermission(); } catch (e) { /* bỏ qua */ }
      redraw();
      if (notiState() === 'granted') { U.toast('Đã bật thông báo của máy', 'ok'); sysNotify('Đã bật nhắc lịch', 'Bạn sẽ nhận thông báo trước giờ bắt đầu sự kiện', null); }
      else if (notiState() === 'denied') U.toast('Máy đang chặn thông báo — xem hướng dẫn ở mục Nhắc lịch', 'err');
    }; });
    if (q('[data-ntest]')) q('[data-ntest]').onclick = () => {
      const s = new Date(Date.now() + Cal.cfg().def * 60000);
      const ev = { id: '', title: 'Thử nhắc lịch', s, e: new Date(s.getTime() + 3600000), noEnd: false, multi: false, color: 'var(--g4)' };
      const body = whenText(ev) + ' · ' + relText(ev);
      card(ev, body);
      if (notiState() === 'granted') sysNotify(ev.title, body, null);
    };
  };

  // Thông báo của máy (qua service worker để bấm vào mở lại app); không có service worker thì dùng Notification thường
  const sysNotify = async (title, body, id) => {
    const url = id ? '#/i/' + T + '?e=' + enc(id) : '#/i/' + T;
    const opt = { body, tag: 'cal-' + (id || 'test'), renotify: true, icon: 'icons/icon-192.png', data: { url } };
    try {
      const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) { await reg.showNotification(title, opt); return; }
    } catch (e) { /* thử cách dưới */ }
    try { const n = new Notification(title, opt); n.onclick = () => { window.focus(); location.hash = url; n.close(); }; } catch (e) { /* bỏ qua */ }
  };
  // Thẻ nhắc trong app: góc trên bên phải (điện thoại: trên cùng), tối đa 3 thẻ, bấm Xem → mở sự kiện trên lịch
  const card = (ev, body) => {
    let box = document.getElementById('calnotes');
    if (!box) { box = document.createElement('div'); box.id = 'calnotes'; box.className = 'calnotes'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'calnote';
    el.style.setProperty('--ec', ev.color);
    el.setAttribute('role', 'alert');
    el.innerHTML = `<span class="cn-ic">${Icon('bell')}</span><div class="cn-t"><small>Nhắc lịch</small><b>${esc(ev.title)}</b><span>${esc(body)}</span></div>
      <div class="cn-a">${ev.id ? '<button type="button" class="btn sm" data-v>Xem</button>' : ''}<button type="button" class="cib sm" data-x title="Đóng">${Icon('x')}</button></div>`;
    box.prepend(el);
    while (box.children.length > 3) box.lastElementChild.remove();
    const v = el.querySelector('[data-v]');
    if (v) v.onclick = () => { el.remove(); location.hash = '#/i/' + T + '?e=' + enc(ev.id); };
    el.querySelector('[data-x]').onclick = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  };

  // Mỗi 20 giây: sự kiện đã tới giờ nhắc (từ "giờ bắt đầu − nhắc trước" đến 10 phút sau giờ bắt đầu) mà chưa nhắc → nhắc 1 lần
  // (ghi nhớ trên máy theo sự kiện + giờ bắt đầu + mức nhắc: đổi giờ / mức nhắc thì nhắc lại)
  Cal.tick = () => {
    if (Cal._nowLine) Cal._nowLine();
    if (!App.user || !(App.user.admin || tableLv() > 0) || !Cal.cfg().on || document.body.classList.contains('locked')) return;
    const now = Date.now(), sent = lsGet('pwa-cal-sent', {});
    let n = 0;
    DB.rows(T).forEach(r => {
      const ev = evOf(r), lead = ev && leadOf(r);
      if (!ev || lead == null) return;
      const s = ev.s.getTime(), k = ev.id + '|' + store(ev.s) + '|' + lead;
      if (sent[k] || now < s - lead * 60000 || now > s + 10 * 60000) return;
      sent[k] = now; n++;
      const body = whenText(ev) + ' · ' + relText(ev, now);
      card(ev, body);
      if (notiState() === 'granted' && (document.hidden || !document.hasFocus())) sysNotify(ev.title, body, ev.id);
    });
    if (n) { Object.keys(sent).forEach(k => { if (now - sent[k] > 3 * 86400000) delete sent[k]; }); lsSet('pwa-cal-sent', sent); }
  };
  // Chạy từ lúc mở app (main.js): tải bảng Lịch, kiểm tra mỗi 20 giây, lấy lịch mới từ máy chủ mỗi 15 phút
  // (sự kiện thêm trên máy khác cũng được nhắc); bấm thông báo của máy → service worker báo app mở sự kiện
  Cal.init = () => {
    if (Cal._init) return;
    Cal._init = true;
    const ok = () => App.user && (App.user.admin || tableLv() > 0);
    setTimeout(async () => { if (ok()) { await DB.load(T).catch(() => {}); Cal.tick(); } }, 2500);
    setInterval(Cal.tick, 20000);
    setInterval(() => { if (ok() && Cal.cfg().on && navigator.onLine !== false) DB.fetch([T], true).then(Cal.tick).catch(() => {}); }, 15 * 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) Cal.tick(); });
    // Vừa mở khoá app (mã PIN) → nhắc ngay các lịch đã tới giờ nhắc trong lúc đang khoá
    let locked = document.body.classList.contains('locked');
    new MutationObserver(() => { const l = document.body.classList.contains('locked'); if (locked && !l) setTimeout(Cal.tick, 400); locked = l; })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.nav) location.hash = e.data.nav; });
  };
})();
