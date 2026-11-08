// =====================================================================
//  LƯU NỀN (hàng đợi ghi) — chép từ app TCXL 0.6. Bấm Lưu là dữ liệu trên máy đổi ngay, app đi tiếp; việc gửi lên
//  máy chủ (Apps Script ~1–3 giây mỗi lần) chạy ngầm, lần lượt đúng thứ tự (transmittal tạo trước rồi mới tới tài liệu).
//   • Mất mạng → ô vàng, tự gửi lại sau 15 giây / khi có mạng.
//   • Máy chủ báo lỗi (vd không có quyền) → ô đỏ "Thử lại" / "Bỏ thay đổi" (bỏ = tải lại các bảng liên quan từ máy chủ).
//   • Hàng đợi lưu trên máy (localStorage) → tắt app giữa chừng, mở lại tự gửi tiếp.
//  DB.add / DB.update / DB.remove (store.js) đều đi qua đây. Tải file lên vẫn chờ xong trước khi lưu (views.js).
//  Việc: { label, ops: [{ fn: 'add' | 'update' | 'remove', t, row?, key? }] }
// =====================================================================
(function () {
  const O = (window.Outbox = {});
  const KEY = () => 'pwa-outbox|' + window.APP_CONFIG.mode + '|' + ((window.App && App.user && App.user.email) || '');
  let q = [], running = false, err = null, net = false, netT = null, doneT = null;
  const touched = new Set();   // bảng đã ghi trong lượt này → gửi xong thì đánh dấu cần hỏi lại máy chủ (lấy cột máy chủ tự tính)
  const save = () => { try { if (q.length) localStorage.setItem(KEY(), JSON.stringify(q)); else localStorage.removeItem(KEY()); } catch (e) { /* bỏ qua */ } };
  const isNet = e => /Mất kết nối|Failed to fetch|NetworkError|Load failed/i.test(e && e.message || '') || navigator.onLine === false;

  O.pending = () => q.length;
  O.busy = t => q.some(j => j.ops.some(o => o.t === t));   // bảng còn thay đổi chưa lưu → không lấy dữ liệu máy chủ đè lên
  O.push = (label, ops) => {
    ops = ops.filter(o => o && o.t && (o.fn === 'remove' ? o.key != null : o.row));
    if (!ops.length) return;
    ops.forEach(o => {   // dữ liệu trên máy đổi ngay
      if (o.fn === 'remove') DB.localDel(o.t, [o.key]);
      else DB.localPut(o.t, [o.row]);
      touched.add(o.t);
    });
    q.push({ id: U.uid(), label, ops, at: Date.now() });
    save(); paint(); run();
  };
  // Mở app: còn việc chưa gửi (tắt app giữa chừng) → gửi tiếp. Dữ liệu trên máy (đã lưu kèm thay đổi) giữ nguyên.
  O.resume = () => {
    try { q = JSON.parse(localStorage.getItem(KEY()) || '[]'); } catch (e) { q = []; }
    q.forEach(j => j.ops.forEach(o => { o.again = true; touched.add(o.t); }));
    paint(); run();
  };
  O.clear = () => { q = []; err = null; save(); paint(); };
  // Chờ hàng đợi gửi xong → true nếu xong, false nếu đang lỗi
  O.idle = () => new Promise(res => { const chk = () => (err ? res(false) : !q.length ? res(true) : setTimeout(chk, 250)); chk(); });

  async function run() {
    if (running || err || !q.length) return;
    running = true; net = false; clearTimeout(netT); paint();
    try {
      while (q.length && !err) {
        try { await send(q[0]); q.shift(); save(); }
        catch (e) {
          if (isNet(e)) { net = true; netT = setTimeout(run, 15000); break; }   // mất mạng: 15 giây sau / khi có mạng thử lại
          err = { label: q[0].label, msg: e.message };
        }
      }
    } finally {
      running = false; paint();
      if (!q.length && !err) done();
    }
  }
  async function send(job) {
    for (const o of job.ops) {
      if (o.ok) continue;
      const kf = DB.keyField(o.t), tried = o.again || o.tried;
      o.tried = true; save();
      try {
        if (o.fn === 'add') DB.localPut(o.t, [await API.add(o.t, kf, o.row)]);
        else if (o.fn === 'update') DB.localPut(o.t, [await API.update(o.t, kf, o.row)]);
        else await API.remove(o.t, kf, o.key);
      } catch (e) {
        // Lần gửi trước đã tới máy chủ nhưng mất mạng lúc nhận trả lời → máy chủ báo trùng khoá = thực ra đã lưu
        if (!(tried && o.fn === 'add' && /Khoá đã tồn tại/.test(e.message))) throw e;
      }
      o.ok = true; save();
    }
  }

  // Bỏ mọi thay đổi chưa lưu: tải lại các bảng liên quan từ máy chủ → dữ liệu trên máy về đúng như máy chủ
  async function discard() {
    const ts = [...new Set(q.flatMap(j => j.ops.map(o => o.t)))];
    q = []; err = null; save(); paint();
    ts.forEach(t => DB.fresh.delete(t));
    try { await DB.fetch(ts, true); U.toast('Đã bỏ các thay đổi chưa lưu', 'ok'); }
    catch (e) { U.toast('Không tải lại được dữ liệu: ' + e.message, 'err'); }
  }

  // ---- Ô trạng thái (góc dưới phải; điện thoại: dưới thanh tiêu đề) ----
  function box() {
    let el = document.getElementById('obox');
    if (!el) { el = document.createElement('div'); el.id = 'obox'; el.className = 'obox'; el.setAttribute('role', 'status'); el.hidden = true; document.body.appendChild(el); }
    return el;
  }
  function paint() {
    const el = box(), n = q.length;
    clearTimeout(doneT);
    el.className = 'obox' + (err ? ' err' : net ? ' warn' : '');
    if (!n && !err) { el.hidden = true; return; }
    el.hidden = false;
    const more = n > 1 ? ` (${n} việc)` : '';
    if (err) {
      el.innerHTML = `<div class="ob-t"><b>Chưa lưu được lên máy chủ</b> · ${U.esc(err.label)}${more}<div class="ob-m">${U.esc(err.msg)}</div></div>
        <div class="ob-a"><button type="button" class="btn sm" data-ob="retry">Thử lại</button><button type="button" class="btn sm ghost" data-ob="drop">Bỏ thay đổi</button></div>`;
    } else if (net) {
      el.innerHTML = `<div class="ob-t">Mất kết nối — đã giữ trên máy, sẽ tự lưu lên khi có mạng${more}</div><div class="ob-a"><button type="button" class="btn sm ghost" data-ob="retry">Thử ngay</button></div>`;
    } else {
      el.innerHTML = `<span class="ob-spin"></span><div class="ob-t">Đang lưu lên máy chủ…${more}</div>`;
    }
    el.querySelectorAll('[data-ob]').forEach(b => b.onclick = async () => {
      if (b.dataset.ob === 'retry') { err = null; net = false; run(); return; }
      if (await U.confirm(`Bỏ ${n} thay đổi chưa lưu? Dữ liệu trên máy sẽ được tải lại đúng như trên máy chủ.`)) discard();
    });
  }
  function done() {
    const el = box();
    el.className = 'obox ok'; el.hidden = false; el.innerHTML = `${Icon('check', 'sm')}<div class="ob-t">Đã lưu lên máy chủ</div>`;
    doneT = setTimeout(() => { el.hidden = true; }, 1600);
    // Lần mở trang sau hỏi lại máy chủ các bảng vừa ghi (ngầm, không chặn) → nhận cột máy chủ tự tính / thay đổi từ máy khác
    touched.forEach(t => DB.fresh.delete(t)); touched.clear();
  }

  window.addEventListener('online', () => { if (net) run(); });
  // Còn việc chưa gửi mà đóng / tải lại trang → trình duyệt hỏi lại (hàng đợi vẫn giữ trên máy, mở lại sẽ gửi tiếp)
  window.addEventListener('beforeunload', e => { if (q.length && !O.quiet) { e.preventDefault(); e.returnValue = ''; } });
})();
