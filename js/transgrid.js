// =====================================================================
//  DANH SÁCH TRANSMITTAL DẠNG BẢNG (kiểu MS Access, như app Phòng TCXL — js/grid.js)
//   • Mỗi tài liệu đến 1 dòng (bảng ghép SCHEMA TRANS_DOC: tài liệu + thông tin transmittal của nó);
//     transmittal chưa nhập tài liệu vẫn có 1 dòng. Cột như sổ theo dõi Excel: No, Gói thầu, Số transmittal, Mã / Tên tài liệu,
//     Rev., Ngày nhận tài liệu, Người giao việc, Ngày giao việc, Chuyển lại cho, Ngày hoàn thành, Người nhận phát hành, Status…
//   • Nút "Cột": chọn cột hiện / ẩn, đổi thứ tự; kéo mép tiêu đề đổi độ rộng; bấm tiêu đề sắp xếp; phễu ở tiêu đề → lọc cột
//     (lưu trên máy này). Xuất Excel đúng các cột / dòng đang hiện. Bấm dòng → trang transmittal (sửa, thêm tài liệu).
//  Địa chỉ: #/i/Cong_viec · kèm bộ lọc cột, vd ?Status=Đang xử lý&Goi_thau=T22
// =====================================================================
(function () {
  const esc = U.esc, enc = encodeURIComponent;
  const T = 'TRANS_DOC';
  const TG = (window.TransGrid = {});
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';

  TG.render = async it => {
    const key = it.key;
    App.head(it.label, { back: true });
    App.loading();
    await DB.loadDeps('Cong_viec');
    if (permTableLevel(App.user, 'Document_no_In') > 0) await DB.loadDeps('Document_no_In').catch(() => {});
    let st = Views.state[key];
    if (!st || !st.flt) st = Views.state[key] = { q: '', flt: {}, sort: { n: 'STT', dir: -1 } };   // mới nhất trên cùng
    // Mở kèm bộ lọc (#/i/Cong_viec?Status=Đang xử lý&Goi_thau=T22) → thành bộ lọc cột, rồi bỏ khỏi địa chỉ
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');
    if ([...qs.keys()].length) {
      st.flt = {}; st.top = 0;
      qs.forEach((v, k) => { if (DB.field(T, k)) st.flt[k] = { vals: [v === '' || v === '(trống)' ? Grid.EMPTY : v] }; });
      st.q = qs.get('q') || '';
      history.replaceState(null, '', '#/i/' + enc(key));
    }
    const canAdd = App.user.admin || permTableLevel(App.user, 'Cong_viec') === 2;
    const addHref = '#/f/Cong_viec/new';

    App.main.innerHTML = `<div class="lbar">
        <label class="lsearch">${Icon('search')}<input type="search" placeholder="Tìm số transmittal, mã / tên tài liệu, người giao, ghi chú…" value="${esc(st.q)}"></label>
        <button type="button" class="btn ghost ladd" data-cols title="Chọn cột hiển thị, đổi thứ tự cột">${Icon('cols')}<span>Cột</span></button>
        <button type="button" class="btn ghost ladd" data-xlsx title="Xuất Excel các dòng đang hiện (theo bộ lọc)">${Icon('download')}<span>Xuất Excel</span></button>
        ${canAdd ? `<a class="btn ladd" href="${addHref}">${Icon('plus')}<span>Thêm</span></a>` : ''}
      </div>
      <div class="lsum" id="lsum"></div><div class="gfbar" id="gfbar" hidden></div>
      <div class="gwrap" id="grid"></div>
      ${canAdd ? `<a class="fab" href="${addHref}" title="Thêm transmittal" style="--gc:${it.color || 'var(--pri)'}">${Icon('plus')}</a>` : ''}`;
    App.main.classList.toggle('has-fab', canAdd);

    const all = SCHEMA.transDocRows(DB);
    const byKey = new Map(all.map(r => [r.id, r]));
    // Tìm: khớp chữ ở mọi cột (kể cả cột đang ẩn)
    const cols = Grid.allCols(T).filter(c => c.n !== '_badge').map(c => c.n);
    const hay = new Map();
    const hayOf = r => { let h = hay.get(r); if (h == null) { h = cols.map(n => Grid.text(T, r, n)).join(' '); hay.set(r, h); } return h; };
    const searched = () => st.q.trim() ? all.filter(r => U.match(hayOf(r), st.q)) : all;

    let shown = [];
    const drawSum = () => {
      const trs = new Set(shown.map(r => r._tr)), pend = [...trs].filter(SCHEMA.transPending).length;
      const notes = [st.q ? 'khớp "' + st.q + '"' : '', shown.length < all.length ? 'trong ' + U.int(all.length) + ' dòng' : ''].filter(Boolean);
      document.getElementById('lsum').innerHTML = `${Icon('table', 'sm')}<span><b>${U.int(shown.length)}</b> dòng · <b>${U.int(trs.size)}</b> transmittal${pend ? ` (${U.int(pend)} đang xử lý)` : ''}
        ${notes.length ? `<span class="muted">· ${notes.map(esc).join(' · ')}</span>` : ''}</span>`;
    };
    // Các bộ lọc cột đang dùng: mỗi cái 1 nhãn (bấm để bỏ) + Xoá tất cả
    const drawFbar = () => {
      const box = document.getElementById('gfbar'), act = Grid.active(st.flt);
      box.hidden = !act.length;
      box.innerHTML = `${Icon('filter', 'sm')}${act.map(n => `<button type="button" class="xchip" data-xf="${esc(n)}" title="Bỏ lọc cột này">${esc(n === '_badge' ? 'Thời hạn' : Grid.short(DB.field(T, n).l))}: <b>${esc(Grid.summary(T, n, st.flt[n]))}</b> ${Icon('x', 'sm')}</button>`).join('')}
        ${act.length > 1 ? '<button type="button" class="linkbtn" data-xall>Xoá tất cả lọc</button>' : ''}`;
      box.querySelectorAll('[data-xf]').forEach(b => b.onclick = () => { delete st.flt[b.dataset.xf]; st.top = 0; draw(); });
      const xa = box.querySelector('[data-xall]'); if (xa) xa.onclick = () => { st.flt = {}; st.top = 0; draw(); };
    };
    const draw = () => {
      drawFbar();
      const grid = document.getElementById('grid');
      const empty = st.q || Grid.active(st.flt).length ? 'Không có dòng nào khớp — bỏ bớt bộ lọc'
        : `Chưa có transmittal nào${canAdd ? ` · <a href="${addHref}">Thêm mới</a>` : ''}`;
      shown = Grid.mount(grid, { t: T, st, rows: searched(), onFilter: draw, empty,
        go: k => { const r = byKey.get(k); return r ? '#/r/Cong_viec/' + enc(r._tr.id) : '#/i/' + enc(key); } });
      drawSum();
      Grid.fit(grid); grid.dispatchEvent(new Event('scroll'));   // dòng tổng vừa vẽ đẩy bảng xuống → tính lại chiều cao
    };
    let qt = null;
    App.main.querySelector('.lsearch input').oninput = e => { st.q = e.target.value; st.top = 0; clearTimeout(qt); qt = setTimeout(draw, 150); };
    App.main.querySelector('[data-cols]').onclick = () => Grid.chooser(T, draw);
    App.main.querySelector('[data-xlsx]').onclick = async e => {
      const b = e.currentTarget, html = b.innerHTML;
      if (!shown.length) return U.toast('Không có dòng nào để xuất');
      b.disabled = true; b.innerHTML = `${Icon('download')}<span>Đang xuất…</span>`;
      try { await exportXlsx(shown); U.toast(`Đã xuất ${U.int(shown.length)} dòng ra Excel`, 'ok'); }
      catch (er) { U.toast(er.message, 'err'); }
      finally { b.disabled = false; b.innerHTML = html; }
    };
    draw();
  };

  // Thư viện ExcelJS (cdnjs) — chỉ tải khi bấm Xuất Excel lần đầu
  let libP = null;
  const lib = () => libP || (libP = new Promise((ok, no) => {
    if (window.ExcelJS) return ok(window.ExcelJS);
    const s = document.createElement('script');
    s.src = LIB; s.crossOrigin = 'anonymous';
    s.onload = () => ok(window.ExcelJS);
    s.onerror = () => { libP = null; s.remove(); no(new Error('Không tải được thư viện Excel — kiểm tra kết nối mạng rồi thử lại')); };
    document.head.appendChild(s);
  }));

  // Xuất Excel đúng các cột đang hiện, các dòng đang lọc / sắp xếp; ngày là ngày thật (dd/mm/yyyy), số là số
  async function exportXlsx(rows) {
    const ExcelJS = await lib();
    const cols = Grid.colsOf(T);
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Transmittal', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map(c => ({ header: c.f.l || c.l, key: c.n, width: Math.max(6, Math.round(Grid.width(T, c) / 7)) }));
    rows.forEach(r => ws.addRow(Object.fromEntries(cols.map(c => {
      const f = c.f, v = c.n === '_badge' ? '' : DB.val(T, r, c.n);
      if (c.n === '_badge') { const b = DB.badge(T, r); return [c.n, b ? b.text : '']; }
      if (/^(date|datetime|expiry)$/.test(f.t)) { const d = U.parseDate(v); return [c.n, d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : '']; }
      if (/^(number|price)$/.test(f.t) && v !== '' && v != null && isFinite(U.num(v))) return [c.n, U.num(v)];
      return [c.n, Grid.text(T, r, c.n)];
    }))));
    cols.forEach((c, i) => { if (/^(date|datetime|expiry)$/.test(c.f.t)) ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy'; });
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; h.height = 30;
    h.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0089FF' } }; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = 'Transmittal ' + U.fmtDate(U.today()).replace(/\//g, '-') + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
})();
