// =====================================================================
//  DASHBOARD — số liệu tổng hợp + biểu đồ (không cần thư viện ngoài)
//  Màu biểu đồ: --s1 (xanh dương) / --s2 (cam) đã kiểm tra đạt chuẩn cho người
//  mù màu trên cả nền sáng và tối. Xanh lá/đỏ KHÔNG dùng cho cặp series vì
//  người mù màu đỏ-lục không phân biệt được.
// =====================================================================
(function () {
  const esc = U.esc;
  const D = (window.Dash = { state: {} });
  const can = t => permTableLevel(App.user, t) > 0;

  // ---------------- Định dạng số ----------------
  const nf = (x, d) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: d }).format(x);
  // Rút gọn: 15.000.000 → "15 tr", 2.500.000 → "2,5 tr", 1.200.000.000 → "1,2 tỷ"
  const compact = v => {
    const n = Math.abs(v), s = v < 0 ? '−' : '';
    if (n >= 1e9) return s + nf(n / 1e9, n < 1e10 ? 1 : 0) + ' tỷ';
    if (n >= 1e6) return s + nf(n / 1e6, n < 1e7 ? 1 : 0) + ' tr';
    if (n >= 1e3) return s + nf(n / 1e3, 0) + ' N';
    return s + nf(n, 0);
  };
  const pct = x => nf(x, 0) + '%';
  const niceMax = m => {
    if (m <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= m) return f * p;
    return 10 * p;
  };

  // ---------------- Thời gian ----------------
  const monthsBack = (n, endOffset = 0) => {
    const a = [], d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - endOffset);
    for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setMonth(d.getMonth() - i); a.push(U.month(x)); }
    return a;
  };
  const PERIODS = [
    { v: '1', l: 'Tháng này' }, { v: '3', l: '3 tháng' }, { v: '6', l: '6 tháng' }, { v: '12', l: '12 tháng' }, { v: 'ytd', l: 'Năm nay' }
  ];
  const periodMonths = p => p === 'ytd' ? monthsBack(new Date().getMonth() + 1) : monthsBack(Number(p));
  const prevMonths = p => { const n = periodMonths(p).length; return monthsBack(n, n); };
  const mLabel = m => m.slice(5) + '/' + m.slice(2, 4);

  // So sánh với kỳ trước: up = tăng là tốt hay xấu
  const delta = (cur, prev, upGood) => {
    if (!prev) return null;
    const d = (cur - prev) / Math.abs(prev) * 100;
    if (Math.abs(d) < 0.5) return { t: '≈ như kỳ trước', cls: '' };
    const up = d > 0;
    return { t: (up ? '▲ ' : '▼ ') + pct(Math.abs(d)) + ' so với kỳ trước', cls: up === upGood ? 'good' : 'bad' };
  };

  // ---------------- Thành phần giao diện ----------------
  const filterRow = (key, opts, cur) => `<div class="dfilter" data-fk="${key}">${opts.map(o =>
    `<button type="button" class="chip2 ${o.v === cur ? 'on' : ''}" data-v="${esc(o.v)}">${esc(o.l)}</button>`).join('')}</div>`;
  const tile = k => `<${k.href ? `a href="${k.href}"` : 'div'} class="kcard ${k.cls || ''}">
    <span class="kic">${Icon(k.ic)}</span><span class="kn">${esc(k.v)}${k.u ? `<small>${esc(k.u)}</small>` : ''}</span><span class="kl">${esc(k.l)}</span>
    ${k.delta ? `<span class="kd ${k.delta.cls}">${esc(k.delta.t)}</span>` : ''}</${k.href ? 'a' : 'div'}>`;
  const card = (title, ic, color, body, extra = '') => `<section class="card dcard"><div class="dc-h"><span class="gic" style="--gc:${color}">${Icon(ic)}</span>
    <h3>${esc(title)}</h3>${extra}</div>${body}</section>`;
  const none = msg => `<div class="dnone">${Icon('check', 'sm')} ${esc(msg || 'Không có')}</div>`;

  // Thanh ngang (1 series, 1 màu): giá trị ở đầu thanh, bấm được nếu có href
  const bars = (rows, { cls = 's1', fmt = U.int, share = false } = {}) => {
    if (!rows.length) return none('Không có dữ liệu');
    const max = Math.max(...rows.map(r => r.value), 1), total = rows.reduce((s, r) => s + r.value, 0) || 1;
    return `<div class="hbars">${rows.map(r => `<${r.href ? `a href="${r.href}"` : 'div'} class="hb" ${r.goi ? `data-goi="${esc(r.goi)}"` : ''} title="${esc(r.label + ': ' + fmt(r.value))}">
      <span class="hb-l">${esc(r.label)}</span>
      <span class="hb-t"><span class="hb-f ${cls}" style="width:${Math.max(1.5, r.value / max * 100)}%"></span></span>
      <span class="hb-v">${esc(fmt(r.value))}${share ? ` <i>${pct(r.value / total * 100)}</i>` : ''}</span></${r.href ? 'a' : 'div'}>`).join('')}</div>`;
  };

  // Biểu đồ cột theo tháng: vẽ bằng SVG theo đúng bề rộng thật (chữ không bị co), có tooltip + xem bảng
  const charts = [];
  const columns = cfg => { charts.push(cfg); return `<div class="chart" data-ch="${charts.length - 1}"></div>`; };

  function drawColumns(el, cfg) {
    const { labels, series, stacked, fmt = compact, full = U.int } = cfg;
    const W = Math.max(280, el.clientWidth), H = 190, pl = 46, pr = 6, pt = 22, pb = 24;
    const n = labels.length;
    const totals = labels.map((_, i) => stacked ? series.reduce((s, se) => s + se.values[i], 0) : Math.max(...series.map(se => se.values[i])));
    const max = niceMax(Math.max(...totals, 0));
    const band = (W - pl - pr) / n;
    const k = series.length;
    const bw = Math.min(24, stacked ? band * 0.55 : (band * 0.72 - (k - 1) * 2) / k);
    const gw = stacked ? bw : k * bw + (k - 1) * 2;
    const yv = v => pt + (H - pt - pb) * (1 - v / max);
    const top = (x, y, w, h, r) => { r = Math.min(r, h, w / 2); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
    let s = '';
    [0, max / 2, max].forEach(tv => {
      const y = yv(tv).toFixed(1);
      s += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="${tv === 0 ? 'cx-base' : 'cx-grid'}"/>`;
      s += `<text x="${pl - 6}" y="${y}" class="cx-tick" text-anchor="end" dominant-baseline="middle">${esc(fmt(tv))}</text>`;
    });
    labels.forEach((lb, i) => {
      const x0 = pl + band * i + (band - gw) / 2;
      let acc = 0;
      series.forEach((se, j) => {
        const v = se.values[i]; if (!v) return;
        if (stacked) {
          const y1 = yv(acc + v), y0 = yv(acc), h = Math.max(0, y0 - y1 - (acc > 0 ? 2 : 0));
          const isTop = series.slice(j + 1).every(o => !o.values[i]);
          s += isTop ? `<path d="${top(x0, y1, bw, h, 4)}" class="cx-bar ${se.cls}"/>` : `<rect x="${x0}" y="${y1}" width="${bw}" height="${h}" class="cx-bar ${se.cls}"/>`;
          acc += v;
        } else {
          const x = x0 + j * (bw + 2), y = yv(v);
          s += `<path d="${top(x, y, bw, yv(0) - y, 4)}" class="cx-bar ${se.cls}"/>`;
        }
      });
      const step = n > 8 ? 2 : 1;
      if ((n - 1 - i) % step === 0) s += `<text x="${pl + band * i + band / 2}" y="${H - 6}" class="cx-tick" text-anchor="middle">${esc(lb)}</text>`;
      // Nhãn giá trị chỉ cho tháng gần nhất (không ghi số lên mọi cột)
      if (i === n - 1 && totals[i] > 0) {
        if (stacked) s += `<text x="${x0 + bw / 2}" y="${yv(totals[i]) - 6}" class="cx-val" text-anchor="middle">${esc(fmt(totals[i]))}</text>`;
        else series.forEach((se, j) => { if (se.values[i]) s += `<text x="${x0 + j * (bw + 2) + bw / 2}" y="${yv(se.values[i]) - 6}" class="cx-val" text-anchor="middle">${esc(fmt(se.values[i]))}</text>`; });
      }
      s += `<rect x="${pl + band * i}" y="${pt}" width="${band}" height="${H - pt - pb}" class="cx-hit" data-i="${i}" tabindex="0"/>`;
    });
    el.innerHTML = `<div class="legend">${series.map(se => `<span><i class="${se.cls}"></i>${esc(se.name)}</span>`).join('')}</div>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || '')}">${s}</svg>
      <div class="ttip" hidden></div>`;
    const tip = el.querySelector('.ttip');
    const show = (hit, i) => {
      tip.replaceChildren();
      const h = document.createElement('div'); h.className = 'tt-h'; h.textContent = cfg.titles ? cfg.titles[i] : labels[i]; tip.appendChild(h);
      series.forEach(se => {
        const row = document.createElement('div'); row.className = 'tt-r';
        const key = document.createElement('i'); key.className = se.cls;
        const val = document.createElement('b'); val.textContent = full(se.values[i]);
        const nm = document.createElement('span'); nm.textContent = se.name;
        row.append(key, val, nm); tip.appendChild(row);
      });
      tip.hidden = false;
      const r = hit.getBoundingClientRect(), box = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left - box.left + r.width / 2 - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth);
      tip.style.left = x + 'px'; tip.style.top = '28px';
      el.querySelectorAll('.cx-hit').forEach(x => x.classList.toggle('on', x === hit));
    };
    el.querySelectorAll('.cx-hit').forEach(hit => {
      const i = +hit.dataset.i;
      hit.addEventListener('pointerenter', () => show(hit, i));
      hit.addEventListener('focus', () => show(hit, i));
      hit.addEventListener('click', () => show(hit, i));
    });
    el.addEventListener('pointerleave', () => { tip.hidden = true; el.querySelectorAll('.cx-hit.on').forEach(x => x.classList.remove('on')); });
  }

  const tableOf = cfg => `<table class="dtable"><thead><tr><th>Tháng</th>${cfg.series.map(se => `<th>${esc(se.name)}</th>`).join('')}</tr></thead>
    <tbody>${cfg.labels.map((lb, i) => `<tr><td>${esc(cfg.titles ? cfg.titles[i] : lb)}</td>${cfg.series.map(se => `<td>${esc((cfg.full || U.int)(se.values[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  function mount(root) {
    root.querySelectorAll('.chart[data-ch]').forEach(el => drawColumns(el, charts[+el.dataset.ch]));
    root.querySelectorAll('.dtbl').forEach(b => b.onclick = () => {
      const cardEl = b.closest('.dcard'), ch = cardEl.querySelector('.chart[data-ch]');
      let tb = cardEl.querySelector('.dtable');
      if (tb) { tb.remove(); b.classList.remove('on'); return; }
      ch.insertAdjacentHTML('afterend', tableOf(charts[+ch.dataset.ch])); b.classList.add('on');
    });
  }
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const r = document.querySelector('.dash'); if (r) r.querySelectorAll('.chart[data-ch]').forEach(el => drawColumns(el, charts[+el.dataset.ch])); }, 150); });

  // ---------------- Khung chung ----------------
  D.render = async it => {
    App.head(it.label, { back: true });
    App.loading();
    const draw = { DASH_TAICHINH: taiChinh, DASH_CONGVIEC: congViec, DASH_CANHBAO: canhBao }[it.key];
    const st = (D.state[it.key] = D.state[it.key] || {});
    const paint = async () => {
      charts.length = 0;
      App.main.innerHTML = `<div class="dash">${await draw(st)}</div>`;
      mount(App.main);
      App.main.querySelectorAll('.dfilter').forEach(f => f.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
        st[f.dataset.fk] = b.dataset.v; paint();
      }));
      Views.hydrate(App.main);
    };
    await paint();
  };

  async function load(ts) { await Promise.all(ts.filter(can).map(t => DB.loadDeps(t).catch(() => {}))); }

  // ---------------- DASHBOARD TÀI CHÍNH ----------------
  async function taiChinh(st) {
    await load(['TAIKHOAN_TAICHINH', 'GIAODICH_THUCHI', 'NGUOI_VAY_MUON', 'GIAODICH_VAY_MUON']);
    st.p = st.p || '6';
    const acc = DB.rows('TAIKHOAN_TAICHINH'), tc = DB.rows('GIAODICH_THUCHI'), ng = DB.rows('NGUOI_VAY_MUON');
    const bal = r => U.num(DB.val('TAIKHOAN_TAICHINH', r, 'SoDu_TinhToan'));
    const ms = periodMonths(st.p), pms = prevMonths(st.p);
    const sumIn = (loai, months) => tc.filter(x => x.Loai === loai && months.includes(U.month(x.NgayGD))).reduce((s, x) => s + U.num(x.SoTien), 0);
    const thu = sumIn('Thu', ms), chi = sumIn('Chi', ms), pthu = sumIn('Thu', pms), pchi = sumIn('Chi', pms);
    const hoNo = ng.reduce((s, r) => s + U.num(DB.val('NGUOI_VAY_MUON', r, 'HoNoMinh')), 0);
    const minhNo = ng.reduce((s, r) => s + U.num(DB.val('NGUOI_VAY_MUON', r, 'MinhNoHo')), 0);
    const total = acc.reduce((s, r) => s + bal(r), 0);

    let h = `<section class="dhero2"><div class="dh2-l">Tổng tài sản</div><div class="dh2-v">${esc(U.money(total))}</div>
      <div class="dh2-s">Tổng số dư thực tế của ${acc.length} tài khoản</div></section>`;
    h += filterRow('p', PERIODS, st.p);
    h += `<div class="kpi-row k4">${[
      { ic: 'inbox', l: 'Thu', v: compact(thu), u: ' ₫', delta: delta(thu, pthu, true), href: '#/i/GIAODICH_THUCHI' },
      { ic: 'send', l: 'Chi', v: compact(chi), u: ' ₫', delta: delta(chi, pchi, false), href: '#/i/GIAODICH_THUCHI' },
      { ic: 'wallet', l: 'Còn lại (thu − chi)', v: compact(thu - chi), u: ' ₫', cls: thu - chi < 0 ? 'warn' : '', delta: delta(thu - chi, pthu - pchi, true) },
      { ic: 'users', l: 'Người khác nợ mình', v: compact(hoNo), u: ' ₫', href: '#/i/NGUOI_VAY_MUON', delta: minhNo ? { t: 'Mình đang nợ ' + compact(minhNo) + ' ₫', cls: '' } : null }
    ].map(tile).join('')}</div>`;

    const cfg = {
      title: 'Thu và chi theo tháng', labels: ms.map(mLabel), titles: ms.map(m => 'Tháng ' + m.slice(5) + '/' + m.slice(0, 4)),
      series: [{ name: 'Thu', cls: 's1', values: ms.map(m => sumIn('Thu', [m])) }, { name: 'Chi', cls: 's2', values: ms.map(m => sumIn('Chi', [m])) }],
      full: U.money
    };
    h += card('Thu và chi theo tháng', 'chart', 'var(--g3)', columns(cfg), '<button class="dtbl" type="button">Bảng</button>');

    const cat = new Map();
    tc.filter(x => x.Loai === 'Chi' && ms.includes(U.month(x.NgayGD))).forEach(x => cat.set(x.DanhMuc || '(khác)', (cat.get(x.DanhMuc || '(khác)') || 0) + U.num(x.SoTien)));
    h += card('Chi theo danh mục', 'send', 'var(--g3)',
      bars([...cat].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value), { cls: 's2', fmt: v => compact(v) + ' ₫', share: true }));
    h += card('Số dư theo tài khoản', 'bank', 'var(--g3)',
      bars(acc.map(r => ({ label: DB.title('TAIKHOAN_TAICHINH', r), value: bal(r), href: '#/r/TAIKHOAN_TAICHINH/' + encodeURIComponent(r.ID) })).sort((a, b) => b.value - a.value), { fmt: v => compact(v) + ' ₫' }));
    const owing = ng.filter(r => U.num(DB.val('NGUOI_VAY_MUON', r, 'HoNoMinh')) > 0 || U.num(DB.val('NGUOI_VAY_MUON', r, 'MinhNoHo')) > 0);
    h += card('Đang có nợ', 'users', 'var(--g3)', owing.length ? Views.renderRows('NGUOI_VAY_MUON', owing, { flat: true, compact: true }) : none('Không ai'));
    return h;
  }

  // ---------------- DASHBOARD CÔNG VIỆC ----------------
  async function congViec(st) {
    await load(['Cong_viec', 'Document_no_In', 'Document_no_Out', 'Cong_viec_duoc_giao', 'Kiem_tra_hang']);
    const goiAll = [...new Set(DB.rows('Cong_viec').map(r => r.Goi_thau).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
    st.g = st.g && (st.g === '*' || goiAll.includes(st.g)) ? st.g : '*';
    const inG = r => st.g === '*' || r.Goi_thau === st.g;
    const tr = DB.rows('Cong_viec').filter(inG), stt = r => SCHEMA.transStatus(r, DB);
    const pending = tr.filter(r => !r.Ngay_hoan_thanh);
    const over = pending.filter(r => stt(r) === 'Quá hạn');
    const last12 = monthsBack(12);
    const done = tr.filter(r => r.Ngay_hoan_thanh && last12.includes(U.month(r.Ngay_hoan_thanh)));
    const ontime = done.filter(r => stt(r) === 'Đúng hạn').length;
    const days = done.map(r => U.daysBetween(r.Date_Incoming, r.Ngay_hoan_thanh)).filter(n => n != null && !isNaN(n));
    const avg = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
    const trIds = new Set(tr.map(r => String(r.id)));
    const vt = DB.rows('Kiem_tra_hang').filter(r => !r.Ngay_hoan_thanh && inG(r));
    const tasks = DB.rows('Cong_viec_duoc_giao').filter(r => r.Trang_thai === 'Đang xử lý');

    let h = goiAll.length > 1 ? filterRow('g', [{ v: '*', l: 'Tất cả gói' }, ...goiAll.map(g => ({ v: g, l: g }))], st.g) : '';
    const tiles = [
      { ic: 'box', l: 'Transmittal đang xử lý', v: nf(pending.length, 0), href: '#/i/Cong_viec' },
      { ic: 'alert', l: 'Quá hạn trả lời', v: nf(over.length, 0), cls: over.length ? 'warn' : 'good' },
      { ic: 'check', l: 'Tỷ lệ đúng hạn (12 tháng)', v: done.length ? pct(ontime / done.length * 100) : '—', delta: done.length ? { t: ontime + '/' + done.length + ' transmittal', cls: '' } : null },
      { ic: 'clock', l: 'Thời gian xử lý trung bình', v: avg == null ? '—' : nf(avg, 1), u: avg == null ? '' : ' ngày' }
    ];
    if (can('Kiem_tra_hang')) tiles.push({ ic: 'inspect', l: 'Vật tư chưa xong', v: nf(vt.length, 0), href: '#/i/Kiem_tra_hang' });
    if (st.g === '*' && can('Cong_viec_duoc_giao')) tiles.push({ ic: 'check', l: 'Task đang làm', v: nf(tasks.length, 0), href: '#/i/Cong_viec_duoc_giao' });
    h += `<div class="kpi-row k4">${tiles.map(tile).join('')}</div>`;

    const left = r => U.daysBetween(U.today(), DB.val('Cong_viec', r, 'Deadline'));
    const waiting = pending.slice().sort((a, b) => left(a) - left(b));
    h += card('Chờ trả lời — gấp nhất trước', 'box', 'var(--g4)', waiting.length ? Views.renderRows('Cong_viec', waiting, { flat: true, sortBy: 'none', compact: true }) : none('Không có transmittal nào đang chờ'));

    const cfg = {
      title: 'Transmittal hoàn thành theo tháng', labels: last12.map(mLabel), titles: last12.map(m => 'Tháng ' + m.slice(5) + '/' + m.slice(0, 4)), stacked: true, fmt: v => nf(v, 0), full: v => nf(v, 0),
      series: [
        { name: 'Đúng hạn', cls: 's1', values: last12.map(m => done.filter(r => U.month(r.Ngay_hoan_thanh) === m && stt(r) === 'Đúng hạn').length) },
        { name: 'Trễ hạn', cls: 's2', values: last12.map(m => done.filter(r => U.month(r.Ngay_hoan_thanh) === m && stt(r) === 'Trễ hạn').length) }
      ]
    };
    h += card('Hoàn thành 12 tháng qua', 'chart', 'var(--g4)', done.length ? columns(cfg) : none('Chưa có transmittal hoàn thành'), done.length ? '<button class="dtbl" type="button">Bảng</button>' : '');

    if (st.g === '*' && goiAll.length) {
      const byG = goiAll.map(g => ({ label: g, value: pending.filter(r => r.Goi_thau === g).length, href: '#/i/Cong_viec', goi: g })).filter(x => x.value);
      h += card('Đang xử lý theo gói', 'folder', 'var(--g4)', bars(byG));
    }
    const countBy = (rows, f) => { const m = new Map(); rows.forEach(r => { const k = f(r) || '(trống)'; m.set(k, (m.get(k) || 0) + 1); }); return [...m].map(([label, value]) => ({ label, value })); };
    const order = (rows, opts) => rows.sort((a, b) => (opts.indexOf(a.label) + 1 || 99) - (opts.indexOf(b.label) + 1 || 99));
    if (can('Document_no_In')) {
      const din = DB.rows('Document_no_In').filter(r => st.g === '*' || trIds.has(String(r.id_transmittal)));
      h += card('Tài liệu đến theo mục đích', 'inbox', 'var(--g4)', bars(order(countBy(din, r => r.Purpose), DB.field('Document_no_In', 'Purpose').opts), { share: true }));
    }
    if (can('Document_no_Out')) {
      const dout = DB.rows('Document_no_Out').filter(r => st.g === '*' || trIds.has(String(r.id_transmittal)));
      h += card('Tài liệu đi theo status', 'send', 'var(--g4)', bars(order(countBy(dout, r => r.Status), DB.field('Document_no_Out', 'Status').opts), { share: true }));
    }
    return h;
  }

  // ---------------- CẢNH BÁO & NHẮC VIỆC ----------------
  async function canhBao() {
    const ts = ['BANGCAP', 'Chungchi_congviec', 'Quyet_dinh', 'Cong_viec', 'GIAODICH_VAY_MUON', 'NGUOI_VAY_MUON', 'Calendar', 'TAIKHOAN_MATKHAU', 'Cong_viec_duoc_giao'];
    await load(ts);
    const C = window.APP_CONFIG;
    // Mỗi thẻ: tiêu đề ngắn + ghi chú điều kiện + các phần (mỗi phần là 1 bảng)
    const secs = [];
    const add = (title, note, ic, color, parts) => secs.push({ title, note, ic, color, parts: parts.filter(p => p.rows.length), n: parts.reduce((s, p) => s + p.rows.length, 0) });

    const docs = ['BANGCAP', 'Chungchi_congviec', 'Quyet_dinh'].filter(can);
    if (docs.length) {
      const exp = r => SCHEMA.expiryDays(r.NgayHetHan);
      add('Giấy tờ sắp hết hạn', 'đã hết hạn hoặc còn ≤ ' + C.expiryWarnDays + ' ngày', 'award', 'var(--g2)',
        docs.map(t => ({ t, rows: DB.rows(t).filter(r => { const n = exp(r); return n != null && n <= C.expiryWarnDays; }).sort((a, b) => exp(a) - exp(b)) })));
    }
    if (can('Cong_viec')) {
      const left = r => U.daysBetween(U.today(), DB.val('Cong_viec', r, 'Deadline'));
      add('Transmittal gấp', 'quá hạn hoặc còn ≤ 3 ngày', 'box', 'var(--g4)', [{ t: 'Cong_viec',
        rows: DB.rows('Cong_viec').filter(r => !r.Ngay_hoan_thanh && left(r) <= 3).sort((a, b) => left(a) - left(b)) }]);
    }
    if (can('GIAODICH_VAY_MUON')) {
      const owing = id => { const p = DB.get('NGUOI_VAY_MUON', id); return p ? U.num(DB.val('NGUOI_VAY_MUON', p, 'HoNoMinh')) + U.num(DB.val('NGUOI_VAY_MUON', p, 'MinhNoHo')) : 0; };
      add('Hẹn trả nợ', 'trong 14 ngày tới hoặc đã quá hẹn', 'ledger', 'var(--g3)', [{ t: 'GIAODICH_VAY_MUON',
        rows: DB.rows('GIAODICH_VAY_MUON').filter(r => r.NgayHenTra && owing(r.NguoiID) > 0 && U.daysBetween(U.today(), r.NgayHenTra) <= 14)
          .sort((a, b) => U.daysBetween(b.NgayHenTra, a.NgayHenTra)) }]);
    }
    if (can('Cong_viec_duoc_giao')) add('Task đang xử lý', '', 'check', 'var(--g4)', [{ t: 'Cong_viec_duoc_giao', rows: DB.rows('Cong_viec_duoc_giao').filter(r => r.Trang_thai === 'Đang xử lý') }]);
    if (can('Calendar')) add('Lịch sắp tới', '7 ngày tới', 'calendar', 'var(--g4)', [{ t: 'Calendar',
      rows: DB.rows('Calendar').filter(r => { const n = U.daysBetween(U.today(), r.NgayBatDau); return n >= 0 && n <= 7; }) }]);
    if (can('TAIKHOAN_MATKHAU')) add('Mật khẩu nên đổi', 'lâu hơn ' + C.passwordAgeWarnDays + ' ngày chưa đổi', 'key', 'var(--g6)', [{ t: 'TAIKHOAN_MATKHAU',
      rows: DB.rows('TAIKHOAN_MATKHAU').filter(r => r.TrangThai !== 'Dừng hoạt động' && r.NgayDoiGanNhat && U.daysBetween(r.NgayDoiGanNhat, U.today()) > C.passwordAgeWarnDays) }]);

    if (!secs.length) return '<div class="empty">Bạn chưa có quyền xem mục nào liên quan.</div>';
    const total = secs.reduce((s, x) => s + x.n, 0);
    const full = secs.filter(x => x.n), empty = secs.filter(x => !x.n);
    let h = `<section class="dhero2 ${total ? 'alert' : 'ok'}"><div class="dh2-l">Cần chú ý</div><div class="dh2-v">${total} mục</div>
      <div class="dh2-s">${total ? 'Xử lý các mục bên dưới, gấp nhất ở trên cùng' : 'Không có gì cần xử lý. Tốt lắm!'}</div></section>`;
    h += full.map(x => card(x.title, x.ic, x.color,
      (x.note ? `<div class="dnote">${esc(x.note)}</div>` : '') + x.parts.map(p => Views.renderRows(p.t, p.rows, { flat: true, sortBy: 'none', compact: true })).join(''),
      `<span class="cnt">${x.n}</span>`)).join('');
    if (empty.length) h += `<section class="card dcard"><div class="dc-h"><span class="gic" style="--gc:var(--ok)">${Icon('check')}</span><h3>Không có gì cần lưu ý</h3></div>
      <ul class="dok">${empty.map(x => `<li>${Icon('check', 'sm')} ${esc(x.title)}</li>`).join('')}</ul></section>`;
    return h;
  }

  // Bấm thanh "Đang xử lý theo gói" → mở danh sách Transmittal đã lọc sẵn gói đó
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a.hb[data-goi]');
    if (!a) return;
    Views.state.Cong_viec = { q: '', f: a.dataset.goi, s: 'd-desc' };
  });
})();
