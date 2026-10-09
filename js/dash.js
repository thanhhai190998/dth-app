// Dashboard + biểu đồ đơn giản (không cần thư viện ngoài)
(function () {
  const esc = U.esc, enc = encodeURIComponent;
  const D = (window.Dash = {});
  const can = t => permTableLevel(App.user, t) > 0;
  const PAL = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

  // ---- Biểu đồ ----
  D.tiles = list => `<div class="kpis">${list.map(k => `<div class="kpi ${k.cls || ''}"><div class="kv">${esc(k.v)}</div><div class="kl">${esc(k.l)}</div></div>`).join('')}</div>`;

  D.hbar = (data, fmt = U.int) => {
    if (!data.length) return '<div class="muted small">Không có dữ liệu</div>';
    const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
    return `<div class="hbar">${data.map((d, i) => `<div class="hb-row"><span class="hb-l">${esc(d.label)}</span>
      <span class="hb-t"><span class="hb-b" style="width:${Math.max(2, Math.abs(d.value) / max * 100)}%;background:${d.color || PAL[i % PAL.length]}"></span></span>
      <span class="hb-v">${esc(fmt(d.value))}</span></div>`).join('')}</div>`;
  };

  // series: [{name, color}], rows: [{label, values:[...]}]
  D.columns = (series, rows, fmt = U.int) => {
    if (!rows.length) return '<div class="muted small">Không có dữ liệu</div>';
    const max = Math.max(...rows.flatMap(r => r.values), 1);
    return `<div class="cols">${rows.map(r => `<div class="col-g" title="${esc(r.label + ': ' + r.values.map((v, i) => series[i].name + ' ' + fmt(v)).join(', '))}">
        <div class="col-bars">${r.values.map((v, i) => `<span style="height:${v / max * 100}%;background:${series[i].color}"></span>`).join('')}</div>
        <div class="col-l">${esc(r.label)}</div></div>`).join('')}</div>
      <div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  };

  D.donut = data => {
    data = data.filter(d => d.value > 0);
    const total = data.reduce((s, d) => s + d.value, 0);
    if (!total) return '<div class="muted small">Không có dữ liệu</div>';
    let off = 0;
    const R = 15.915;  // chu vi = 100
    const arcs = data.map((d, i) => {
      const len = d.value / total * 100;
      const a = `<circle r="${R}" cx="21" cy="21" fill="none" stroke="${PAL[i % PAL.length]}" stroke-width="7" stroke-dasharray="${len} ${100 - len}" stroke-dashoffset="${25 - off}"></circle>`;
      off += len; return a;
    }).join('');
    return `<div class="donut"><svg viewBox="0 0 42 42" role="img">${arcs}<text x="21" y="23" text-anchor="middle" class="dn-t">${total}</text></svg>
      <div class="legend col">${data.map((d, i) => `<span><i style="background:${PAL[i % PAL.length]}"></i>${esc(d.label)} <b>${d.value}</b></span>`).join('')}</div></div>`;
  };

  const countBy = (rows, f) => { const m = new Map(); rows.forEach(r => { const k = f(r) || '(trống)'; m.set(k, (m.get(k) || 0) + 1); }); return [...m].map(([label, value]) => ({ label, value })); };
  const lastMonths = n => { const a = []; const d = new Date(); d.setDate(1); for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setMonth(d.getMonth() - i); a.push(U.month(x)); } return a; };
  const mLabel = m => m.slice(5) + '/' + m.slice(2, 4);
  const card = (title, body) => `<section class="card"><h3>${esc(title)}</h3>${body}</section>`;
  const link = (t, r, extra) => `<a class="row" href="#/r/${t}/${enc(DB.keyOf(t, r))}"><div class="row-main"><div class="row-title">${esc(DB.title(t, r))}</div>
    <div class="row-sub">${esc(DB.sub(t, r))}</div></div>${extra || ''}</a>`;

  D.render = async it => {
    App.head(it.label, { back: true });
    App.loading();
    const fn = { DASH_TAICHINH: taiChinh, DASH_CONGVIEC: congViec, DASH_CANHBAO: canhBao }[it.key];
    App.main.innerHTML = '<div class="dash">' + (await fn()) + '</div>';
  };

  async function load(ts) { await Promise.all(ts.map(t => DB.loadDeps(t).catch(() => {}))); }

  async function taiChinh() {
    await load(['TAIKHOAN_TAICHINH', 'GIAODICH_THUCHI', 'NGUOI_VAY_MUON', 'GIAODICH_VAY_MUON']);
    const acc = DB.rows('TAIKHOAN_TAICHINH'), tc = DB.rows('GIAODICH_THUCHI'), ng = DB.rows('NGUOI_VAY_MUON');
    const bal = r => DB.val('TAIKHOAN_TAICHINH', r, 'SoDu_TinhToan');
    const thisM = U.month(new Date());
    const sumM = (loai, m) => tc.filter(x => x.Loai === loai && U.month(x.NgayGD) === m).reduce((s, x) => s + U.num(x.SoTien), 0);
    const hoNo = ng.reduce((s, r) => s + U.num(DB.val('NGUOI_VAY_MUON', r, 'HoNoMinh')), 0);
    const minhNo = ng.reduce((s, r) => s + U.num(DB.val('NGUOI_VAY_MUON', r, 'MinhNoHo')), 0);
    const months = lastMonths(12).filter(m => tc.some(x => U.month(x.NgayGD) <= m));
    const recent = lastMonths(3);
    let h = D.tiles([
      { l: 'Tổng tài sản', v: U.money(acc.reduce((s, r) => s + U.num(bal(r)), 0)), cls: 'big' },
      { l: 'Thu tháng này', v: U.money(sumM('Thu', thisM)), cls: 'ok' },
      { l: 'Chi tháng này', v: U.money(sumM('Chi', thisM)), cls: 'bad' },
      { l: 'Người khác nợ mình', v: U.money(hoNo) },
      { l: 'Mình đang nợ', v: U.money(minhNo) }
    ]);
    h += card('Số dư theo tài khoản', D.hbar(acc.map(r => ({ label: DB.title('TAIKHOAN_TAICHINH', r), value: U.num(bal(r)) })), U.money));
    h += card('Thu / chi theo tháng', D.columns([{ name: 'Thu', color: 'var(--ok)' }, { name: 'Chi', color: 'var(--bad)' }],
      months.map(m => ({ label: mLabel(m), values: [sumM('Thu', m), sumM('Chi', m)] })), U.money));
    const cat = new Map();
    tc.filter(x => x.Loai === 'Chi' && recent.includes(U.month(x.NgayGD))).forEach(x => cat.set(x.DanhMuc || '(khác)', (cat.get(x.DanhMuc || '(khác)') || 0) + U.num(x.SoTien)));
    h += card('Chi theo danh mục (3 tháng gần nhất)', D.hbar([...cat].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value), U.money));
    const owing = ng.filter(r => U.num(DB.val('NGUOI_VAY_MUON', r, 'HoNoMinh')) > 0 || U.num(DB.val('NGUOI_VAY_MUON', r, 'MinhNoHo')) > 0);
    h += card('Đang có nợ', owing.length ? owing.map(r => link('NGUOI_VAY_MUON', r, Views.badgeHtml(DB.badge('NGUOI_VAY_MUON', r)))).join('') : '<div class="muted small">Không ai</div>');
    return h;
  }

  async function congViec() {
    await load(['Cong_viec', 'Document_no_In', 'Document_no_Out', 'Cong_viec_duoc_giao', 'Kiem_tra_hang']);
    const tr = DB.rows('Cong_viec'), st = r => SCHEMA.transStatus(r, DB);
    const pending = tr.filter(r => !r.Ngay_hoan_thanh);
    const over = pending.filter(r => st(r) === 'Quá hạn');
    const tasks = DB.rows('Cong_viec_duoc_giao').filter(r => r.Trang_thai === 'Đang xử lý');
    const vt = DB.rows('Kiem_tra_hang').filter(r => !r.Ngay_hoan_thanh);
    let h = D.tiles([
      { l: 'Transmittal đang xử lý', v: pending.length, cls: 'big' },
      { l: 'Quá hạn trả lời', v: over.length, cls: over.length ? 'bad' : 'ok' },
      { l: 'Task đang xử lý', v: tasks.length },
      { l: 'Vật tư chưa xong', v: vt.length }
    ]);
    const dl = r => DB.val('Cong_viec', r, 'Deadline');
    const left = r => U.daysBetween(U.today(), dl(r));
    h += card('Transmittal chờ trả lời (theo hạn)', pending.length ? pending.slice().sort((a, b) => left(a) - left(b)).map(r => {
      const n = left(r);
      return link('Cong_viec', r, `<span class="badge ${n < 0 ? 'bad' : n <= 3 ? 'warn' : 'info'}">${n < 0 ? 'Quá ' + (-n) + ' ngày' : 'Còn ' + n + ' ngày'}</span>`);
    }).join('') : '<div class="muted small">Không có</div>');
    h += card('Đang xử lý theo gói', D.hbar(countBy(pending, r => r.Goi_thau).sort((a, b) => b.value - a.value)));
    const months = lastMonths(12);
    const done = tr.filter(r => r.Ngay_hoan_thanh);
    h += card('Transmittal hoàn thành theo tháng', D.columns([{ name: 'Đúng hạn', color: 'var(--ok)' }, { name: 'Trễ hạn', color: 'var(--warn)' }],
      months.filter(m => done.some(r => U.month(r.Ngay_hoan_thanh) <= m)).map(m => ({ label: mLabel(m), values: [
        done.filter(r => U.month(r.Ngay_hoan_thanh) === m && st(r) === 'Đúng hạn').length,
        done.filter(r => U.month(r.Ngay_hoan_thanh) === m && st(r) === 'Trễ hạn').length] }))));
    if (can('Document_no_In')) h += card('Tài liệu đến theo mục đích', D.donut(countBy(DB.rows('Document_no_In'), r => r.Purpose)));
    if (can('Document_no_Out')) h += card('Tài liệu đi theo status', D.donut(countBy(DB.rows('Document_no_Out'), r => r.Status)));
    return h;
  }

  async function canhBao() {
    const ts = ['BANGCAP', 'Chungchi_congviec', 'Quyet_dinh', 'Cong_viec', 'GIAODICH_VAY_MUON', 'NGUOI_VAY_MUON', 'Calendar', 'TAIKHOAN_MATKHAU', 'Cong_viec_duoc_giao'].filter(can);
    await load(ts);
    const C = window.APP_CONFIG;
    let h = '';
    const exp = ['BANGCAP', 'Chungchi_congviec', 'Quyet_dinh'].filter(can).flatMap(t => DB.rows(t).map(r => ({ t, r, n: SCHEMA.expiryDays(r.NgayHetHan) })))
      .filter(x => x.n != null && x.n <= C.expiryWarnDays).sort((a, b) => a.n - b.n);
    if (['BANGCAP', 'Chungchi_congviec', 'Quyet_dinh'].some(can))
      h += card('Bằng cấp / chứng chỉ hết hạn hoặc sắp hết hạn (≤ ' + C.expiryWarnDays + ' ngày)', exp.length ? exp.map(x =>
        link(x.t, x.r, `<span class="badge ${x.n < 0 ? 'bad' : 'warn'}">${x.n < 0 ? 'Hết hạn ' + (-x.n) + ' ngày' : 'Còn ' + x.n + ' ngày'}</span>`)).join('') : '<div class="muted small">Không có</div>');
    if (can('Cong_viec')) {
      const tr = DB.rows('Cong_viec').filter(r => !r.Ngay_hoan_thanh).map(r => ({ r, n: U.daysBetween(U.today(), DB.val('Cong_viec', r, 'Deadline')) }))
        .filter(x => x.n <= 3).sort((a, b) => a.n - b.n);
      h += card('Transmittal quá hạn / còn ≤ 3 ngày', tr.length ? tr.map(x => link('Cong_viec', x.r, `<span class="badge ${x.n < 0 ? 'bad' : 'warn'}">${x.n < 0 ? 'Quá ' + (-x.n) + ' ngày' : 'Còn ' + x.n + ' ngày'}</span>`)).join('') : '<div class="muted small">Không có</div>');
    }
    if (can('GIAODICH_VAY_MUON')) {
      const owing = id => U.num(DB.val('NGUOI_VAY_MUON', DB.get('NGUOI_VAY_MUON', id) || {}, 'HoNoMinh')) + U.num(DB.val('NGUOI_VAY_MUON', DB.get('NGUOI_VAY_MUON', id) || {}, 'MinhNoHo'));
      const due = DB.rows('GIAODICH_VAY_MUON').filter(r => r.NgayHenTra && owing(r.NguoiID) > 0)
        .map(r => ({ r, n: U.daysBetween(U.today(), r.NgayHenTra) })).filter(x => x.n <= 14).sort((a, b) => a.n - b.n);
      h += card('Hẹn trả nợ (≤ 14 ngày)', due.length ? due.map(x => link('GIAODICH_VAY_MUON', x.r, `<span class="badge ${x.n < 0 ? 'bad' : 'warn'}">${U.fmtDate(x.r.NgayHenTra)}</span>`)).join('') : '<div class="muted small">Không có</div>');
    }
    if (can('Cong_viec_duoc_giao')) {
      const tk = DB.rows('Cong_viec_duoc_giao').filter(r => r.Trang_thai === 'Đang xử lý');
      h += card('Task đang xử lý', tk.length ? tk.map(r => link('Cong_viec_duoc_giao', r)).join('') : '<div class="muted small">Không có</div>');
    }
    if (can('Calendar')) {
      const ev = DB.rows('Calendar').map(r => ({ r, n: U.daysBetween(U.today(), r.NgayBatDau) })).filter(x => x.n >= 0 && x.n <= 7).sort((a, b) => a.n - b.n);
      h += card('Lịch 7 ngày tới', ev.length ? ev.map(x => link('Calendar', x.r)).join('') : '<div class="muted small">Không có</div>');
    }
    if (can('TAIKHOAN_MATKHAU')) {
      const old = DB.rows('TAIKHOAN_MATKHAU').filter(r => r.TrangThai !== 'Dừng hoạt động' && r.NgayDoiGanNhat && U.daysBetween(r.NgayDoiGanNhat, U.today()) > C.passwordAgeWarnDays);
      h += card('Mật khẩu lâu chưa đổi (> ' + C.passwordAgeWarnDays + ' ngày)', old.length ? old.map(r => link('TAIKHOAN_MATKHAU', r)).join('') : '<div class="muted small">Không có</div>');
    }
    return h || '<div class="empty">Bạn chưa có quyền xem mục nào liên quan.</div>';
  }
})();
