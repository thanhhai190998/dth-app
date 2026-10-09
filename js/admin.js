// Quản trị: danh sách người dùng, bảng phân quyền, cài đặt (mật khẩu chủ, demo)
(function () {
  const esc = U.esc, enc = encodeURIComponent;
  const A = (window.Admin = {});

  // ---------------- DANH SÁCH NGƯỜI DÙNG ----------------
  A.users = async () => {
    if (!App.user.admin) return App.notFound();
    App.head('Phân quyền', { back: true });
    App.loading();
    const users = await API.users();
    const n = u => Object.keys(u.Quyen || {}).length;
    App.main.innerHTML = `<div class="toolbar"><div class="muted small">Chủ app <b>${esc(App.user.owner ? App.user.email : '')}</b> luôn có toàn quyền.</div>
      <a class="btn" href="#/admin/u/new">＋ Thêm người dùng</a></div>
      <div class="rows">${users.length ? users.map(u => `<a class="row" href="#/admin/u/${enc(u.Email)}">
        <div class="row-main"><div class="row-title">${esc(u.Ho_ten || u.Email)}</div><div class="row-sub">${esc(u.Email)}</div>
        <div class="row-meta"><span>${u.Admin ? 'Quản trị viên (toàn quyền)' : n(u) + ' mục được cấp'}</span><span>Gói: ${esc(u.Goi_thau || 'tất cả')}</span></div></div>
        ${u.Kich_hoat ? (u.Admin ? '<span class="badge info">Admin</span>' : '<span class="badge ok">Hoạt động</span>') : '<span class="badge muted">Đã khoá</span>'}</a>`).join('')
        : '<div class="empty">Chưa có người dùng nào ngoài chủ app.</div>'}</div>`;
  };

  // ---------------- SỬA 1 NGƯỜI DÙNG + MA TRẬN QUYỀN ----------------
  A.user = async email => {
    if (!App.user.admin) return App.notFound();
    const isNew = email === 'new';
    App.head(isNew ? 'Thêm người dùng' : 'Phân quyền người dùng', { back: true });
    App.loading();
    const [users] = await Promise.all([API.users(), DB.load('ALBUM').catch(() => {}), DB.load('Danh_sach_goi_thau').catch(() => {})]);
    const u = isNew ? { Email: '', Ho_ten: '', Kich_hoat: true, Admin: false, Goi_thau: '', Quyen: {} } : users.find(x => x.Email === email);
    if (!u) return App.notFound();
    const q = Object.assign({}, u.Quyen || {});
    const goiAll = DB.rows('Danh_sach_goi_thau').map(r => r.MaGoiThau);
    const goiSel = (u.Goi_thau || '').split(',').map(s => s.trim()).filter(Boolean);
    const groups = Views.items().filter(g => g.items.length);

    App.main.innerHTML = `<form class="card form" id="uf">
      <div class="fld"><span class="lbl">Email Google <b class="req">*</b></span><input name="Email" type="email" value="${esc(u.Email)}" ${isNew ? '' : 'readonly'} required placeholder="ten@gmail.com"></div>
      <div class="fld"><span class="lbl">Họ tên</span><input name="Ho_ten" value="${esc(u.Ho_ten)}"></div>
      <div class="inl wrap"><label class="chk"><input type="checkbox" name="Kich_hoat" ${u.Kich_hoat ? 'checked' : ''}> Cho phép đăng nhập</label>
        <label class="chk"><input type="checkbox" name="Admin" ${u.Admin ? 'checked' : ''}> Quản trị viên (toàn quyền, kể cả phân quyền)</label></div>
      <div class="fld"><span class="lbl">Gói thầu được xem (áp dụng cho Transmittal, Tài liệu đến/đi, Kiểm tra vật tư, Gói thầu)</span>
        <div class="chips"><label class="chip"><input type="checkbox" data-goi="*" ${goiSel.length ? '' : 'checked'}> Tất cả gói</label>
        ${goiAll.map(g => `<label class="chip"><input type="checkbox" data-goi="${esc(g)}" ${goiSel.includes(g) ? 'checked' : ''}> ${esc(g)}</label>`).join('')}</div></div>
      <div class="fld"><span class="lbl">Quyền theo nhóm / mục — tick ở dòng nhóm để chọn cả nhóm, hoặc chọn từng mục</span>
      <table class="perm"><thead><tr><th>Nhóm / mục</th><th>Xem</th><th>Sửa</th></tr></thead><tbody>
      ${groups.map(g => `<tr class="pg"><td><button type="button" class="tog" data-tg="${g.key}">▾</button> <b>${esc(g.label)}</b></td>
          <td><input type="checkbox" data-g="${g.key}" data-l="view"></td><td><input type="checkbox" data-g="${g.key}" data-l="edit"></td></tr>
        ${g.items.map(it => `<tr class="pi" data-in="${g.key}"><td><span class="pic" style="color:${g.color}">${Icon(it.ic, 'sm')}</span> ${esc(it.label)}</td>
          <td><input type="checkbox" data-k="${esc(it.perm)}" data-gg="${g.key}" data-l="view" ${Perm.rank(q[it.perm]) >= 1 ? 'checked' : ''}></td>
          <td><input type="checkbox" data-k="${esc(it.perm)}" data-gg="${g.key}" data-l="edit" ${Perm.rank(q[it.perm]) >= 2 ? 'checked' : ''} ${it.key === 'DASH_TAICHINH' || it.key === 'DASH_CONGVIEC' || it.key === 'DASH_CANHBAO' ? 'disabled' : ''}></td></tr>`).join('')}`).join('')}
      </tbody></table>
      <p class="muted small">"Sửa" bao gồm xem, thêm, sửa, xoá. Dashboard chỉ có quyền xem; số liệu trong dashboard vẫn chỉ lấy từ những mục người đó được xem.
      Dữ liệu đã mã hoá (mật khẩu, CCCD, số tài khoản) chỉ đọc được khi biết mật khẩu chủ.</p></div>
      <div class="row-end sticky">${isNew ? '' : '<button type="button" class="btn danger ghost" data-del>🗑 Xoá người dùng</button>'}
        <button type="button" class="btn ghost" onclick="history.back()">Huỷ</button><button class="btn">💾 Lưu</button></div></form>`;

    const f = document.getElementById('uf');
    const boxes = (gk, l) => [...f.querySelectorAll(`input[data-gg="${gk}"][data-l="${l}"]:not(:disabled)`)];
    const syncGroups = () => groups.forEach(g => ['view', 'edit'].forEach(l => {
      const b = boxes(g.key, l), gb = f.querySelector(`input[data-g="${g.key}"][data-l="${l}"]`);
      const on = b.filter(x => x.checked).length;
      gb.checked = b.length > 0 && on === b.length; gb.indeterminate = on > 0 && on < b.length; gb.disabled = !b.length;
    }));
    // Tick "Sửa" thì tự tick "Xem"; bỏ "Xem" thì bỏ luôn "Sửa"
    const link = (box) => {
      const row = box.closest('tr');
      const v = row.querySelector('[data-l="view"]'), e = row.querySelector('[data-l="edit"]');
      if (box.dataset.l === 'edit' && box.checked) v.checked = true;
      if (box.dataset.l === 'view' && !box.checked && e) e.checked = false;
    };
    f.querySelectorAll('input[data-k]').forEach(b => b.onchange = () => { link(b); syncGroups(); });
    f.querySelectorAll('input[data-g]').forEach(gb => gb.onchange = () => {
      boxes(gb.dataset.g, gb.dataset.l).forEach(b => { b.checked = gb.checked; link(b); });
      syncGroups();
    });
    f.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => {
      const rows = f.querySelectorAll(`tr[data-in="${b.dataset.tg}"]`), hide = !rows[0]?.hidden;
      rows.forEach(r => r.hidden = hide); b.textContent = hide ? '▸' : '▾';
    });
    const goiBoxes = [...f.querySelectorAll('[data-goi]')];
    goiBoxes.forEach(b => b.onchange = () => {
      if (b.dataset.goi === '*' && b.checked) goiBoxes.forEach(x => { if (x !== b) x.checked = false; });
      if (b.dataset.goi !== '*' && b.checked) goiBoxes[0].checked = false;
      if (!goiBoxes.some(x => x.checked)) goiBoxes[0].checked = true;
    });
    syncGroups();

    f.onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(f);
      const email = String(fd.get('Email') || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !email.endsWith('@demo')) return U.toast('Email không hợp lệ', 'err');
      const quyen = {};
      f.querySelectorAll('input[data-k][data-l="view"]:checked').forEach(b => { quyen[b.dataset.k] = 'view'; });
      f.querySelectorAll('input[data-k][data-l="edit"]:checked').forEach(b => { quyen[b.dataset.k] = 'edit'; });
      const goi = goiBoxes.filter(b => b.checked && b.dataset.goi !== '*').map(b => b.dataset.goi);
      const out = { Email: email, Ho_ten: String(fd.get('Ho_ten') || '').trim(), Kich_hoat: !!fd.get('Kich_hoat'), Admin: !!fd.get('Admin'), Goi_thau: goi.join(','), Quyen: quyen };
      if (isNew && users.some(x => x.Email === email)) return U.toast('Email này đã có trong danh sách', 'err');
      try { await API.saveUser(out); U.toast('Đã lưu quyền', 'ok'); location.replace('#/admin'); }
      catch (err) { U.toast(err.message, 'err'); }
    };
    const del = f.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      if (!(await U.confirm('Xoá người dùng ' + u.Email + '? Họ sẽ không đăng nhập được nữa.'))) return;
      try { await API.deleteUser(u.Email); U.toast('Đã xoá', 'ok'); location.replace('#/admin'); } catch (err) { U.toast(err.message, 'err'); }
    };
  };

  // ---------------- CÀI ĐẶT ----------------
  const encFields = () => Object.entries(SCHEMA.tables).flatMap(([t, d]) => d.fields.filter(f => f.enc).map(f => [t, f.n]));

  A.settings = async () => {
    App.head('Cài đặt', { back: true });
    const C = window.APP_CONFIG, demo = C.mode === 'demo';
    const vs = !Vault.isSet() ? '<span class="badge warn">Chưa đặt</span>' : Vault.isOpen() ? '<span class="badge ok">Đang mở khoá</span>' : '<span class="badge info">Đang khoá</span>';
    let h = `<section class="card"><h3>Tài khoản</h3><p><b>${esc(App.user.name || '')}</b><br><span class="muted">${esc(App.user.email)}</span>
      ${App.user.admin ? ' <span class="badge info">Admin</span>' : ''}</p>
      ${demo ? '' : '<button class="btn ghost" data-act="signout">Đăng xuất</button>'}</section>`;
    h += `<section class="card"><h3>Mật khẩu chủ ${vs}</h3>
      <p class="muted small">Dùng để mã hoá mật khẩu tài khoản, số CCCD, số tài khoản ngay trên máy trước khi lưu lên Google Sheet.
      Tự khoá sau ${C.autoLockMinutes} phút không thao tác. <b>Quên mật khẩu chủ thì không khôi phục được dữ liệu đã mã hoá.</b></p>
      <div class="inl wrap">
      ${!Vault.isSet() && App.user.admin ? '<button class="btn" data-act="setvault">Đặt mật khẩu chủ</button>' : ''}
      ${Vault.isSet() && !Vault.isOpen() ? '<button class="btn" data-act="unlock">🔓 Mở khoá</button>' : ''}
      ${Vault.isOpen() ? '<button class="btn ghost" data-act="lock">🔒 Khoá ngay</button>' : ''}
      ${Vault.isSet() && App.user.admin ? '<button class="btn ghost" data-act="migrate">Mã hoá dữ liệu cũ (chữ thường)</button>' : ''}
      </div></section>`;
    if (App.installPrompt) h += `<section class="card"><h3>Cài đặt app</h3><button class="btn" data-act="install">📲 Cài app vào máy này</button></section>`;
    else h += `<section class="card"><h3>Cài app vào máy</h3><p class="muted small">Android / PC (Chrome, Edge): menu ⋮ → <b>Cài đặt ứng dụng</b>.
      iPhone (Safari): nút Chia sẻ → <b>Thêm vào MH chính</b>.</p></section>`;
    if (demo) {
      const emails = API.demo.emails(), cur = API.demo.current();
      h += `<section class="card"><h3>Chế độ DEMO</h3><p class="muted small">Dữ liệu giả lưu trong trình duyệt này. Đổi người dùng để thử phân quyền.</p>
        <div class="fld"><span class="lbl">Đang đăng nhập giả bằng</span><select data-act="switch">${emails.map(e => `<option ${e === cur ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
        <button class="btn danger ghost" data-act="reset">Đặt lại toàn bộ dữ liệu demo</button></section>`;
    }
    h += `<p class="muted small center">Phiên bản ${esc(C.version)} · chế độ ${demo ? 'DEMO' : 'Google Sheets'} · <a href="privacy.html">Chính sách bảo mật</a></p>`;
    App.main.innerHTML = h;

    const on = (act, fn) => { const el = App.main.querySelector(`[data-act="${act}"]`); if (el) el[el.tagName === 'SELECT' ? 'onchange' : 'onclick'] = fn; };
    on('signout', () => { API.signOut(); location.hash = '#/'; location.reload(); });
    on('unlock', async () => { if (await Vault.ensureOpen()) A.settings(); });
    on('lock', () => { Vault.lock(); A.settings(); });
    on('install', async () => { App.installPrompt.prompt(); App.installPrompt = null; });
    on('switch', e => { API.demo.switchUser(e.target.value); DB.clear(); Vault.lock(); location.hash = '#/'; location.reload(); });
    on('reset', async () => { if (await U.confirm('Xoá toàn bộ dữ liệu demo và tạo lại dữ liệu mẫu?')) { API.demo.reset(); localStorage.removeItem('pwa-demo-user'); location.hash = '#/'; location.reload(); } });
    on('setvault', async () => {
      const r = await U.ask({ title: 'Đặt mật khẩu chủ', message: 'Ít nhất 10 ký tự. Hãy ghi nhớ hoặc cất ở nơi an toàn — <b>quên là mất dữ liệu đã mã hoá</b>.',
        fields: [{ name: 'a', label: 'Mật khẩu chủ', type: 'password' }, { name: 'b', label: 'Nhập lại', type: 'password' }], ok: 'Đặt' });
      if (!r) return;
      if (r.a.length < 10) return U.toast('Mật khẩu chủ cần ít nhất 10 ký tự', 'err');
      if (r.a !== r.b) return U.toast('Hai lần nhập không khớp', 'err');
      try {
        U.toast('Đang tạo khoá…');
        const cfg = await Vault.create(r.a);
        await API.setConfig('vault', JSON.stringify(cfg));
        Vault.cfg = cfg; await Vault.unlock(r.a);
        U.toast('Đã đặt mật khẩu chủ', 'ok'); A.settings();
      } catch (e) { U.toast(e.message, 'err'); }
    });
    on('migrate', async () => {
      if (!(await Vault.ensureOpen())) return;
      const btn = App.main.querySelector('[data-act="migrate"]');
      btn.disabled = true;
      let done = 0, total = 0;
      try {
        for (const [t, n] of encFields()) {
          const kf = DB.keyField(t);
          const rows = await DB.load(t, true);
          for (const r of rows.filter(r => r[n] !== '' && r[n] != null && !Vault.isEnc(String(r[n])))) {
            total++;
            btn.textContent = `Đang mã hoá… ${total}`;
            await DB.update(t, { [kf]: r[kf], [n]: await Vault.enc(String(r[n])) });
            done++;
          }
        }
        U.toast(total ? `Đã mã hoá ${done} giá trị` : 'Không còn giá trị nào chưa mã hoá', 'ok');
      } catch (e) { U.toast(`Lỗi sau ${done} giá trị: ${e.message}`, 'err'); }
      btn.disabled = false; btn.textContent = 'Mã hoá dữ liệu cũ (chữ thường)';
    });
  };
})();
