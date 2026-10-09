// =====================================================================
//  CẤU TRÚC DỮ LIỆU & MENU — thay cho phần "Data/Views" của AppSheet.
//  Tên bảng/cột giữ đúng như Google Sheet hiện tại để dùng lại dữ liệu cũ.
//
//  Cột (field):  n = tên cột trong Sheet, l = nhãn hiển thị, t = kiểu:
//    text | longtext | number | price | date | datetime | expiry (ngày hoặc "Không thời hạn")
//    enum (opts, other=true cho phép gõ giá trị khác) | ref (ref = bảng tham chiếu)
//    image | file | email | url | phone
//  Thuộc tính khác: req (bắt buộc), init ('today' hoặc giá trị mặc định),
//    enc (mã hoá bằng mật khẩu chủ), v (cột ảo — hàm tính, không lưu vào Sheet)
//
//  Muốn thêm cột: thêm 1 dòng vào fields (và thêm cột cùng tên trong Sheet).
//  Muốn thêm giá trị cho danh sách chọn: sửa opts.
// =====================================================================
(function () {
  const C = () => window.APP_CONFIG;
  const sum = (arr, f) => arr.reduce((s, r) => s + U.num(f(r)), 0);

  const T = {};   // định nghĩa bảng

  // ---------------- 1. THÔNG TIN CHUNG ----------------
  T.THONGTIN_CANHAN = {
    label: 'Thông tin cá nhân', key: 'ID', sheet: '1.1. THONGTIN_CANHAN',
    title: r => r.HoTen, sub: r => r.Hoc_vi, img: 'AnhChanDung',
    fields: [
      { n: 'HoTen', l: 'Họ và tên', t: 'text', req: true },
      { n: 'NgaySinh', l: 'Ngày sinh', t: 'date' },
      { n: 'Hoc_vi', l: 'Học vị', t: 'text' },
      { n: 'Nhom_mau', l: 'Nhóm máu', t: 'text' },
      { n: 'SoCCCD', l: 'Số căn cước công dân', t: 'text', enc: true },
      { n: 'NgayCap', l: 'Ngày cấp CCCD', t: 'date' },
      { n: 'NoiCap', l: 'Nơi cấp CCCD', t: 'text' },
      { n: 'DiaChiThuongTru', l: 'Địa chỉ thường trú', t: 'text' },
      { n: 'DiaChiHienTai', l: 'Địa chỉ hiện tại', t: 'text' },
      { n: 'SoDienThoai', l: 'Số điện thoại', t: 'phone' },
      { n: 'Email', l: 'Email', t: 'email' },
      { n: 'AnhChanDung', l: 'Ảnh chân dung', t: 'image' },
      { n: 'AnhCCCD_MatTruoc', l: 'CCCD mặt trước', t: 'image' },
      { n: 'AnhCCCD_MatSau', l: 'CCCD mặt sau', t: 'image' },
      { n: 'Giay_khai_sinh', l: 'Giấy khai sinh', t: 'file' },
      { n: 'GhiChu', l: 'Ghi chú', t: 'longtext' }
    ],
    list: { cols: ['SoDienThoai', 'Email'] }
  };

  T.Gioi_thieu = {
    label: 'Giới thiệu', key: 'ID', title: r => r.HoTen, sub: r => r.Hoc_vi, img: 'AnhChanDung',
    fields: [
      { n: 'HoTen', l: 'Họ và tên', t: 'text', req: true },
      { n: 'NgaySinh', l: 'Ngày sinh', t: 'date' },
      { n: 'Hoc_vi', l: 'Học vị', t: 'text' },
      { n: 'Nhom_mau', l: 'Nhóm máu', t: 'text' },
      { n: 'Email_ca_nhan', l: 'Email cá nhân', t: 'email' },
      { n: 'Email_cong_viec', l: 'Email công việc', t: 'email' },
      { n: 'Tieu_su', l: 'Tiểu sử', t: 'longtext' },
      { n: 'AnhChanDung', l: 'Ảnh chân dung', t: 'image' },
      { n: 'GhiChu', l: 'Ghi chú', t: 'text' }
    ],
    list: { cols: ['Email_ca_nhan'] }
  };

  T.BANGCAP = {
    label: 'Bằng cấp', key: 'ID', title: r => r.TenBangCap, sub: r => [r.ChuyenNganh, r.DonViCap].filter(Boolean).join(' · '), img: 'HinhAnh',
    fields: [
      { n: 'TenBangCap', l: 'Tên bằng cấp', t: 'text', req: true },
      { n: 'LoaiBangCap', l: 'Loại bằng cấp', t: 'enum', other: true, opts: ['Tiểu học', 'THCS', 'THPT', 'Cao đẳng', 'Đại học', 'Thạc sĩ', 'Chứng chỉ', 'Quyết định', 'Khác'] },
      { n: 'ChuyenNganh', l: 'Chuyên ngành', t: 'text' },
      { n: 'Xep_loai', l: 'Xếp loại', t: 'text' },
      { n: 'DonViCap', l: 'Đơn vị cấp', t: 'text' },
      { n: 'Nam_TN', l: 'Năm tốt nghiệp', t: 'text', req: true },
      { n: 'NgayCap', l: 'Ngày cấp', t: 'date' },
      { n: 'NgayHetHan', l: 'Ngày hết hạn', t: 'expiry' },
      { n: 'SoHieuBang', l: 'Số hiệu bằng', t: 'text' },
      { n: 'SoHieuVaoSo', l: 'Số vào sổ gốc cấp bằng', t: 'text' },
      { n: 'FileScan', l: 'File scan bằng cấp', t: 'file' },
      { n: 'HinhAnh', l: 'Hình ảnh bằng cấp', t: 'image' },
      { n: 'HanConLai', l: 'Còn hạn', t: 'text', v: r => expiryText(r.NgayHetHan) }
    ],
    list: { group: 'LoaiBangCap', sort: 'NgayCap', cols: ['Nam_TN'] },
    badge: r => expiryBadge(r.NgayHetHan)
  };

  T.KINHNGHIEM = {
    label: 'Kinh nghiệm', key: 'ID', title: r => r.ViTriChucVu || r.TenCongTy, sub: r => r.Ten_Nha_may, img: 'Hinh_anh',
    fields: [
      { n: 'TenCongTy', l: 'Tên công ty chủ quản', t: 'enum', other: true, opts: ['POM - Chi nhánh Vận hành và bảo trì nhà máy điện (PECC2)', 'PESE - Công ty TNHH dịch vụ và kỹ thuật năng lượng PECC2', 'LP1PP - Ban quản lý dự án nhiệt điện dầu khí Long Phú 1 '] },
      { n: 'ViTriChucVu', l: 'Chức vụ', t: 'text' },
      { n: 'Ten_Nha_may', l: 'Tên nhà máy', t: 'longtext' },
      { n: 'Loai_hinh_nang_luong', l: 'Loại hình năng lượng', t: 'enum', opts: ['Điện gió', 'Điện mặt trời', 'Nhiệt điện'] },
      { n: 'Email', l: 'Email', t: 'email' },
      { n: 'Chu_dau_tu', l: 'Chủ đầu tư', t: 'text' },
      { n: 'Cong_suat_dat', l: 'Công suất lắp đặt', t: 'longtext' },
      { n: 'Vi_tri_Nha_may', l: 'Vị trí nhà máy', t: 'longtext' },
      { n: 'NgayBatDau', l: 'Ngày bắt đầu công tác', t: 'date' },
      { n: 'NgayKetThuc', l: 'Ngày kết thúc công tác', t: 'date' },
      { n: 'MoTaCongViec', l: 'Mô tả công việc', t: 'longtext' },
      { n: 'LyDoNghiViec', l: 'Lý do nghỉ việc', t: 'longtext' },
      { n: 'Hinh_anh', l: 'Hình ảnh tại nhà máy', t: 'image' },
      { n: 'FileHopDong', l: 'File hợp đồng/công nhận chức danh', t: 'file' }
    ],
    list: { group: 'TenCongTy', sort: 'NgayBatDau', desc: true, cols: ['NgayBatDau', 'NgayKetThuc'] }
  };

  T.GIAITHUONG = {
    label: 'Giải thưởng', key: 'ID', title: r => r.TenGiaiThuong, sub: r => r.ToChucTrao, img: 'HinhAnh',
    fields: [
      { n: 'TenGiaiThuong', l: 'Tên giải thưởng', t: 'text', req: true },
      { n: 'ToChucTrao', l: 'Đơn vị trao tặng', t: 'text' },
      { n: 'NgayNhan', l: 'Ngày nhận', t: 'date' },
      { n: 'CapDo', l: 'Cấp độ', t: 'text' },
      { n: 'File_quyet_dinh', l: 'File quyết định', t: 'file' },
      { n: 'HinhAnh', l: 'Hình ảnh', t: 'image' }
    ],
    list: { sort: 'NgayNhan', cols: ['NgayNhan', 'CapDo'] }
  };

  T.Khac = {
    label: 'Bài báo / Khác', key: 'ID', title: r => r.Noi_dung, sub: r => r['To chuc'],
    fields: [
      { n: 'Noi_dung', l: 'Tên bài báo', t: 'longtext', req: true },
      { n: 'Tac_gia', l: 'Nhóm tác giả', t: 'text' },
      { n: 'So_doi', l: 'Số DOI', t: 'url' },
      { n: 'To chuc', l: 'Tên tạp chí', t: 'text' },
      { n: 'Ngay_cong_khai', l: 'Ngày công khai', t: 'date' },
      { n: 'So_trang', l: 'Số trang', t: 'text' },
      { n: 'Issue', l: 'Issue', t: 'text' },
      { n: 'File_goc', l: 'File gốc', t: 'file' }
    ],
    list: { sort: 'Ngay_cong_khai', desc: true, cols: ['Ngay_cong_khai'] }
  };

  // ---------------- 2. HỒ SƠ ----------------
  T.Hop_dong = {
    label: 'Hợp đồng', key: 'id', title: r => r.Ten_HD, sub: r => r.Don_vi,
    fields: [
      { n: 'Ten_HD', l: 'Tên hợp đồng', t: 'text', req: true },
      { n: 'Loai_hop_dong', l: 'Loại hợp đồng', t: 'enum', opts: ['Hợp đồng đào tạo', 'Hợp đồng thử việc', 'Hợp đồng lao động', 'Thỏa thuận lương', 'Chấm dứt HĐLĐ', 'Đơn xin nghỉ việc'] },
      { n: 'So_Quyet_Dinh', l: 'Số quyết định', t: 'text' },
      { n: 'Don_vi', l: 'Đơn vị ký hợp đồng', t: 'text' },
      { n: 'Ngay_ky', l: 'Ngày ký hợp đồng', t: 'date' },
      { n: 'File_HD', l: 'File hợp đồng', t: 'file' }
    ],
    list: { sort: 'Ngay_ky', desc: true, cols: ['Loai_hop_dong', 'Ngay_ky'] }
  };

  T.Quyet_dinh = {
    label: 'Quyết định', key: 'ID', title: r => r.TenBangCap, sub: r => [r.ChuyenNganh, r.DonViCap].filter(Boolean).join(' · '), img: 'HinhAnh',
    fields: [
      { n: 'TenBangCap', l: 'Tên quyết định', t: 'text', req: true },
      { n: 'ChuyenNganh', l: 'Số quyết định', t: 'text' },
      { n: 'DonViCap', l: 'Đơn vị cấp', t: 'text' },
      { n: 'Nam_TN', l: 'Năm cấp', t: 'text' },
      { n: 'NgayCap', l: 'Ngày ký quyết định', t: 'date' },
      { n: 'NgayHetHan', l: 'Ngày hết hạn', t: 'expiry', init: 'Không thời hạn' },
      { n: 'FileScan', l: 'File scan', t: 'file' },
      { n: 'HinhAnh', l: 'Hình ảnh', t: 'image' }
    ],
    list: { sort: 'NgayCap', desc: true, cols: ['NgayCap'] },
    badge: r => expiryBadge(r.NgayHetHan)
  };

  T.Chungchi_congviec = {
    label: 'Chứng chỉ công việc', key: 'ID', title: r => r.TenBangCap, sub: r => r.DonViCap, img: 'HinhAnh',
    fields: [
      { n: 'TenBangCap', l: 'Tên chứng chỉ', t: 'text', req: true },
      { n: 'DonViCap', l: 'Đơn vị cấp', t: 'text' },
      { n: 'Nam_TN', l: 'Năm cấp', t: 'text' },
      { n: 'NgayCap', l: 'Ngày cấp', t: 'date' },
      { n: 'NgayHetHan', l: 'Ngày hết hạn', t: 'expiry' },
      { n: 'FileScan', l: 'File scan', t: 'file' },
      { n: 'HinhAnh', l: 'Hình ảnh', t: 'image' },
      { n: 'HanConLai', l: 'Còn hạn', t: 'text', v: r => expiryText(r.NgayHetHan) }
    ],
    list: { sort: 'NgayCap', cols: ['NgayCap', 'NgayHetHan'] },
    badge: r => expiryBadge(r.NgayHetHan)
  };

  // ---------------- 3. TÀI CHÍNH ----------------
  T.TAIKHOAN_TAICHINH = {
    label: 'Tài khoản tài chính', key: 'ID', title: r => r.TenTaiKhoan, sub: r => r.LoaiTaiSan,
    needs: ['GIAODICH_THUCHI', 'GIAODICH_VAY_MUON'],
    fields: [
      { n: 'TenTaiKhoan', l: 'Tên tài khoản', t: 'enum', other: true, opts: ['BIDV', 'Sacombank', 'Tiết kiệm'], req: true },
      { n: 'SoTK', l: 'Số tài khoản', t: 'text', enc: true },
      { n: 'LoaiTaiSan', l: 'Loại tài sản', t: 'enum', opts: ['Tiền mặt', 'Ngân hàng', 'Đầu tư', 'Tài sản khác'] },
      { n: 'SoDuHienTai', l: 'Số dư ban đầu', t: 'price' },
      { n: 'SoDu_TinhToan', l: 'Số dư thực tế', t: 'price', v: (r, db) => {
          const tc = db.rows('GIAODICH_THUCHI').filter(x => x.TaiKhoanID === r.ID);
          const vm = db.rows('GIAODICH_VAY_MUON').filter(x => x.TaiKhoanID === r.ID);
          const s = (a, f) => sum(a.filter(f), x => x.SoTien);
          return U.num(r.SoDuHienTai) + s(tc, x => x.Loai === 'Thu') - s(tc, x => x.Loai === 'Chi')
            - s(vm, x => x.LoaiGiaoDich === 'Cho vay') + s(vm, x => x.LoaiGiaoDich === 'Họ trả mình')
            + s(vm, x => x.LoaiGiaoDich === 'Đi mượn') - s(vm, x => x.LoaiGiaoDich === 'Mình trả họ');
        } }
    ],
    list: { group: 'LoaiTaiSan', cols: ['SoDu_TinhToan'] },
    related: [{ t: 'GIAODICH_THUCHI', fk: 'TaiKhoanID', l: 'Giao dịch thu chi' }, { t: 'GIAODICH_VAY_MUON', fk: 'TaiKhoanID', l: 'Giao dịch vay/mượn' }]
  };

  T.GIAODICH_THUCHI = {
    label: 'Giao dịch thu chi', key: 'ID', title: r => r.MoTa || r.DanhMuc, sub: r => r.DanhMuc,
    needs: ['TAIKHOAN_TAICHINH'],
    fields: [
      { n: 'TaiKhoanID', l: 'Tài khoản gốc', t: 'ref', ref: 'TAIKHOAN_TAICHINH' },
      { n: 'Loai', l: 'Phân loại', t: 'enum', opts: ['Thu', 'Chi'], req: true },
      { n: 'SoTien', l: 'Số tiền', t: 'price', req: true },
      { n: 'NgayGD', l: 'Ngày giao dịch', t: 'date', init: 'today' },
      { n: 'DanhMuc', l: 'Danh mục', t: 'enum', other: true, opts: ['Lương', 'Ăn uống', 'Nhà Ở', 'Di chuyển', 'Y tế'] },
      { n: 'MoTa', l: 'Mô tả', t: 'text' },
      { n: 'ThangNam', l: 'Tháng', t: 'text', v: r => U.month(r.NgayGD) }
    ],
    list: { group: 'Loai', sort: 'NgayGD', desc: true, cols: ['SoTien', 'NgayGD', 'TaiKhoanID'] },
    badge: r => r.Loai === 'Thu' ? { text: '+ ' + U.money(r.SoTien), cls: 'ok' } : { text: '− ' + U.money(r.SoTien), cls: 'bad' }
  };

  T.NGUOI_VAY_MUON = {
    label: 'Người vay/mượn', key: 'ID', title: r => r.TenNguoi, sub: r => r.SoDienThoai,
    needs: ['GIAODICH_VAY_MUON'],
    fields: [
      { n: 'TenNguoi', l: 'Tên người vay/mượn', t: 'text', req: true },
      { n: 'SoDienThoai', l: 'Số điện thoại', t: 'phone' },
      { n: 'Ghichu', l: 'Ghi chú', t: 'text' },
      { n: 'HoNoMinh', l: 'Họ đang nợ mình', t: 'price', v: (r, db) => debt(db, r.ID, 'Cho vay', 'Họ trả mình') },
      { n: 'MinhNoHo', l: 'Mình đang nợ họ', t: 'price', v: (r, db) => debt(db, r.ID, 'Đi mượn', 'Mình trả họ') },
      { n: 'TrangThaiTongQuat', l: 'Tình trạng', t: 'text', v: (r, db) => {
          const a = debt(db, r.ID, 'Cho vay', 'Họ trả mình'), b = debt(db, r.ID, 'Đi mượn', 'Mình trả họ');
          return a > 0 ? 'Họ đang nợ mình' : b > 0 ? 'Mình đang nợ họ' : 'Đã tất toán';
        } }
    ],
    list: { cols: ['HoNoMinh', 'MinhNoHo'] },
    badge: (r, db) => {
      const a = debt(db, r.ID, 'Cho vay', 'Họ trả mình'), b = debt(db, r.ID, 'Đi mượn', 'Mình trả họ');
      return a > 0 ? { text: 'Nợ mình ' + U.money(a), cls: 'bad' } : b > 0 ? { text: 'Mình nợ ' + U.money(b), cls: 'warn' } : { text: 'Đã tất toán', cls: 'ok' };
    },
    related: [{ t: 'GIAODICH_VAY_MUON', fk: 'NguoiID', l: 'Lịch sử vay/mượn' }]
  };

  T.GIAODICH_VAY_MUON = {
    label: 'Giao dịch vay/mượn', key: 'ID', title: r => r.LoaiGiaoDich + ' · ' + U.money(r.SoTien), sub: r => r.GhiChu,
    needs: ['NGUOI_VAY_MUON', 'TAIKHOAN_TAICHINH'],
    fields: [
      { n: 'NguoiID', l: 'Người vay/mượn', t: 'ref', ref: 'NGUOI_VAY_MUON', req: true },
      { n: 'LoaiGiaoDich', l: 'Loại giao dịch', t: 'enum', opts: ['Cho vay', 'Họ trả mình', 'Đi mượn', 'Mình trả họ'], init: 'Cho vay', req: true },
      { n: 'SoTien', l: 'Số tiền', t: 'price', req: true },
      { n: 'NgayGD', l: 'Ngày giao dịch', t: 'date', init: 'today' },
      { n: 'NgayHenTra', l: 'Ngày hẹn trả', t: 'date' },
      { n: 'TaiKhoanID', l: 'Tài khoản nguồn', t: 'ref', ref: 'TAIKHOAN_TAICHINH' },
      { n: 'GhiChu', l: 'Nội dung', t: 'text' }
    ],
    list: { group: 'NguoiID', sort: 'NgayGD', desc: true, cols: ['NgayGD', 'NgayHenTra'] }
  };

  // ---------------- 4. CÔNG VIỆC ----------------
  T.Danh_Ba = {
    label: 'Danh bạ', key: 'id', title: r => r.HoTen, sub: r => [r.ChucVu, r.VaiTro].filter(Boolean).join(' · '),
    fields: [
      { n: 'HoTen', l: 'Họ và tên', t: 'text', req: true },
      { n: 'ChucVu', l: 'Chức vụ', t: 'text' },
      { n: 'VaiTro', l: 'Vai trò', t: 'text' },
      { n: 'SDT', l: 'Số điện thoại', t: 'phone' },
      { n: 'DiaChi', l: 'Địa chỉ', t: 'text' },
      { n: 'Note', l: 'Ghi chú', t: 'longtext' }
    ],
    list: { sort: 'HoTen', cols: ['SDT'] }
  };

  T.Danh_sach_goi_thau = {
    label: 'Gói thầu', key: 'MaGoiThau', keyEditable: true, title: r => r.MaGoiThau, sub: r => r.Noi_dung,
    fields: [
      { n: 'MaGoiThau', l: 'Mã gói thầu', t: 'text', req: true },
      { n: 'Noi_dung', l: 'Nội dung', t: 'longtext' },
      { n: 'Tinh_trang', l: 'Tình trạng', t: 'text' },
      { n: 'Ten_NhaThau', l: 'Tên nhà thầu', t: 'text' },
      { n: 'Ten_hop_dong', l: 'Tên hợp đồng', t: 'longtext' },
      { n: 'Phu_luc_HĐ', l: 'Phụ lục hợp đồng', t: 'longtext' },
      { n: 'Loai_HĐ', l: 'Loại hợp đồng', t: 'text' },
      { n: 'Ngayky_HopDong', l: 'Ngày ký hợp đồng', t: 'date' },
      { n: 'Thoi_gian_thuchien_HĐ', l: 'Thời gian thực hiện hợp đồng', t: 'text' },
      { n: 'NgayBatDauCongViec', l: 'Ngày bắt đầu công việc', t: 'date' },
      { n: 'Ngay_ketThuc_duKien', l: 'Ngày kết thúc dự kiến', t: 'date' },
      { n: 'Han_tra_loi_ngay', l: 'Hạn trả lời transmittal (ngày)', t: 'number' }
    ],
    list: { sort: 'MaGoiThau', cols: ['Ten_NhaThau', 'Tinh_trang'] },
    related: [{ t: 'Cong_viec', fk: 'Goi_thau', l: 'Transmittal' }, { t: 'Kiem_tra_hang', fk: 'Goi_thau', l: 'Kiểm tra vật tư' }]
  };

  T.Cong_viec = {
    label: 'Transmittal', key: 'id', title: r => r.Transmittal_No || '(chưa có số)', sub: r => r.Goi_thau,
    needs: ['Danh_sach_goi_thau', 'Danh_Ba'],
    fields: [
      { n: 'Goi_thau', l: 'Gói thầu', t: 'ref', ref: 'Danh_sach_goi_thau', req: true },
      { n: 'Transmittal_No', l: 'Số transmittal', t: 'text', req: true },
      { n: 'Date_Incoming', l: 'Ngày nhận', t: 'date', init: 'today', req: true },
      { n: 'Nguoi_giaoviec', l: 'Người giao việc', t: 'ref', ref: 'Danh_Ba' },
      { n: 'Nguoi_nhan_Trans', l: 'Người nhận tài liệu', t: 'ref', ref: 'Danh_Ba' },
      { n: 'Ngay_hoan_thanh', l: 'Ngày hoàn thành', t: 'date' },
      { n: 'Deadline', l: 'Hạn trả lời', t: 'date', v: (r, db) => U.isoOf(deadlineOf(r, db)) },
      { n: 'TrangThai', l: 'Trạng thái', t: 'text', v: (r, db) => transStatus(r, db) },
      { n: 'Tinh_trang_xl', l: 'Tình trạng', t: 'text', v: r => r.Ngay_hoan_thanh ? 'Đã xử lý' : 'Đang xử lý' }
    ],
    list: { group: 'Tinh_trang_xl', groupOrder: ['Đang xử lý', 'Đã xử lý'], sort: 'Date_Incoming', desc: true, cols: ['Date_Incoming', 'Deadline'] },
    badge: (r, db) => ({ text: transStatus(r, db), cls: { 'Quá hạn': 'bad', 'Trễ hạn': 'warn', 'Đúng hạn': 'ok', 'Đang xử lý': 'info' }[transStatus(r, db)] }),
    related: [{ t: 'Document_no_In', fk: 'id_transmittal', l: 'Tài liệu đến' }, { t: 'Document_no_Out', fk: 'id_transmittal', l: 'Tài liệu đi (trả lời)' }]
  };

  T.Document_no_In = {
    label: 'Tài liệu đến', key: 'id', title: r => r['Document Number'], sub: r => r.Description,
    needs: ['Cong_viec'],
    fields: [
      { n: 'id_transmittal', l: 'Transmittal', t: 'ref', ref: 'Cong_viec', req: true },
      { n: 'Document Number', l: 'Số tài liệu', t: 'text', req: true },
      { n: 'Description', l: 'Mô tả', t: 'longtext' },
      { n: 'Rev', l: 'Rev', t: 'enum', other: true, opts: ['A', 'B', 'C', 'D', 'E', '0', '1', '2', '3'] },
      { n: 'Purpose', l: 'Mục đích', t: 'enum', opts: ['FA: For Approval', 'FR: For Reference', 'FC: For Construction', 'FD : For As-Built', 'FI : For Information'] },
      { n: 'File', l: 'File', t: 'file' },
      { n: 'Ngay_guiDen', l: 'Ngày nhận', t: 'date', init: 'today' }
    ],
    list: { group: 'Purpose', sort: 'Ngay_guiDen', desc: true, cols: ['Rev', 'id_transmittal'] }
  };

  T.Document_no_Out = {
    label: 'Tài liệu đi', key: 'id', title: r => r['Document Number'], sub: r => r.Description,
    needs: ['Cong_viec'],
    fields: [
      { n: 'id_transmittal', l: 'Transmittal', t: 'ref', ref: 'Cong_viec', req: true },
      { n: 'Document Number', l: 'Số tài liệu', t: 'text', req: true },
      { n: 'Description', l: 'Mô tả', t: 'longtext' },
      { n: 'Rev', l: 'Rev', t: 'text' },
      { n: 'Status', l: 'Status', t: 'enum', opts: ['A: Approved', 'B: Approved with comments', 'C: Disapproved', 'D: Accepted for information', 'E: Accepted for information with comments'] },
      { n: 'File', l: 'File', t: 'file' },
      { n: 'Ngay_hoan_hanh', l: 'Ngày phát hành', t: 'date', init: 'today' }
    ],
    list: { group: 'Status', sort: 'Ngay_hoan_hanh', desc: true, cols: ['Rev', 'id_transmittal'] }
  };

  T.Cong_viec_duoc_giao = {
    label: 'Task', key: 'id', title: r => r.Ten_cong_viec, sub: r => r.Ghi_chu,
    needs: ['Danh_Ba'],
    fields: [
      { n: 'Ten_cong_viec', l: 'Tên công việc', t: 'longtext', req: true },
      { n: 'Ngay_giao', l: 'Ngày nhận việc', t: 'date', init: 'today' },
      { n: 'Nguoi_giao', l: 'Người giao việc', t: 'ref', ref: 'Danh_Ba' },
      { n: 'Trang_thai', l: 'Trạng thái', t: 'enum', other: true, opts: ['Đang xử lý', 'Đã xử lý'], init: 'Đang xử lý' },
      { n: 'Ngay_hoan_thanh', l: 'Ngày hoàn thành', t: 'date' },
      { n: 'Ghi_chu', l: 'Ghi chú', t: 'longtext' }
    ],
    list: { group: 'Trang_thai', sort: 'Ngay_giao', desc: true, cols: ['Ngay_giao', 'Nguoi_giao'] },
    badge: r => r.Trang_thai === 'Đang xử lý' ? { text: 'Đang xử lý', cls: 'bad' } : { text: r.Trang_thai, cls: 'ok' }
  };

  T.Kiem_tra_hang = {
    label: 'Kiểm tra vật tư', key: 'id', title: r => r.Noi_dung, sub: r => r.Goi_thau, img: 'Hinh_anh',
    needs: ['Danh_sach_goi_thau'],
    fields: [
      { n: 'Phan_loai', l: 'Phân loại', t: 'enum', opts: ['Kiểm đếm', 'Mở kiện', 'Thống kê Vật tư'] },
      { n: 'Goi_thau', l: 'Gói thầu', t: 'ref', ref: 'Danh_sach_goi_thau', req: true },
      { n: 'So_luong', l: 'Số lượng', t: 'number' },
      { n: 'Noi_dung', l: 'Nội dung', t: 'longtext', req: true },
      { n: 'Ngay_thuc_hien', l: 'Ngày thực hiện', t: 'date', init: 'today' },
      { n: 'Ngay_hoan_thanh', l: 'Ngày hoàn thành', t: 'date' },
      { n: 'Ghi_chu', l: 'Ghi chú', t: 'longtext' },
      { n: 'Hinh_anh', l: 'Hình ảnh', t: 'image' },
      { n: 'File', l: 'File đính kèm', t: 'file' }
    ],
    list: { group: 'Phan_loai', sort: 'Ngay_thuc_hien', desc: true, cols: ['So_luong', 'Ngay_thuc_hien'] },
    badge: r => r.Ngay_hoan_thanh ? { text: 'Hoàn thành', cls: 'ok' } : { text: 'Chưa xong', cls: 'bad' }
  };

  T.Tool = {
    label: 'Công cụ', key: 'id', title: r => r.Ten_cong_cu,
    fields: [{ n: 'Ten_cong_cu', l: 'Tên công cụ', t: 'text', req: true }, { n: 'File', l: 'File', t: 'file' }],
    list: { sort: 'Ten_cong_cu' }
  };

  T.Link = {
    label: 'Link', key: 'id', title: r => r.Noi_dung, sub: r => r.Link,
    fields: [
      { n: 'Noi_dung', l: 'Nội dung', t: 'text', req: true },
      { n: 'Phan_loai', l: 'Phân loại', t: 'enum', other: true, opts: ['Công cụ', 'Công việc - LP1'] },
      { n: 'Link', l: 'Link', t: 'url', req: true }
    ],
    list: { group: 'Phan_loai', sort: 'Noi_dung' }
  };

  T.Calendar = {
    label: 'Lịch', key: 'id', title: r => r.TenSuKien, sub: r => U.fmtDateTime(r.NgayBatDau) + (r.NgayKetThuc ? ' → ' + U.fmtDateTime(r.NgayKetThuc) : ''),
    fields: [
      { n: 'TenSuKien', l: 'Tên sự kiện', t: 'text', req: true },
      { n: 'NgayBatDau', l: 'Bắt đầu', t: 'datetime', req: true },
      { n: 'NgayKetThuc', l: 'Kết thúc', t: 'datetime' }
    ],
    list: { type: 'calendar', sort: 'NgayBatDau' }
  };

  // ---------------- 5. HÌNH ẢNH (gộp 7 bảng ảnh cũ thành 1 bảng + album) ----------------
  T.ALBUM = {
    label: 'Album', key: 'id', title: r => r.Ten_album, sub: r => r.Mo_ta, img: 'Anh_bia',
    fields: [
      { n: 'Ten_album', l: 'Tên album', t: 'text', req: true },
      { n: 'Mo_ta', l: 'Mô tả', t: 'text' },
      { n: 'Thu_tu', l: 'Thứ tự', t: 'number' },
      { n: 'Anh_bia', l: 'Ảnh bìa', t: 'image' }
    ],
    list: { sort: 'Thu_tu' }
  };

  T.HINH_ANH = {
    label: 'Hình ảnh', key: 'id', title: r => r.Mo_ta || '', img: 'Hinh_anh',
    needs: ['ALBUM'],
    fields: [
      { n: 'Album', l: 'Album', t: 'ref', ref: 'ALBUM', req: true },
      { n: 'Hinh_anh', l: 'Hình ảnh', t: 'image' },
      { n: 'File', l: 'File', t: 'file' },
      { n: 'Mo_ta', l: 'Mô tả', t: 'text' },
      { n: 'Ngay', l: 'Ngày', t: 'date', init: 'today' }
    ],
    list: { type: 'gallery', sort: 'Ngay', desc: true }
  };

  // ---------------- 6. BẢO MẬT ----------------
  T.TAIKHOAN_MATKHAU = {
    label: 'Tài khoản - Mật khẩu', key: 'ID', title: r => r.TenDichVu, sub: r => r.TenDangNhap,
    fields: [
      { n: 'TenDichVu', l: 'Tên dịch vụ', t: 'enum', other: true, req: true, opts: ['Microsoft', 'Gmail', 'Nhaccuatui', 'Ya&Xone', 'Facebook', 'Zing', 'Fifa', 'CTU', 'Sacombank', 'MB', 'BIDV', 'Vietinbank', 'VISSID', 'VNEID', 'TAX', 'OneDrive'] },
      { n: 'LoaiTaiKhoan', l: 'Loại tài khoản', t: 'enum', opts: ['Email', 'Mạng xã hội', 'Ngân hàng', 'Công việc', 'Game', 'Học tập', 'Đám mây', 'Khác'] },
      { n: 'TenDangNhap', l: 'Tên đăng nhập', t: 'text' },
      { n: 'GoiYMatKhau', l: 'Mật khẩu', t: 'text', enc: true, secret: true },
      { n: 'EmailKhoiPhuc', l: 'Email khôi phục', t: 'email' },
      { n: 'NgayDoiGanNhat', l: 'Ngày đổi gần nhất', t: 'date', init: 'today' },
      { n: 'TrangThai', l: 'Trạng thái tài khoản', t: 'enum', opts: ['Đang hoạt động', 'Dừng hoạt động'], init: 'Đang hoạt động' },
      { n: 'GhiChu', l: 'Ghi chú', t: 'text' }
    ],
    list: { group: 'LoaiTaiKhoan', sort: 'TenDichVu', cols: ['NgayDoiGanNhat'] },
    badge: r => {
      if (r.TrangThai === 'Dừng hoạt động') return { text: 'Dừng', cls: 'muted' };
      const d = r.NgayDoiGanNhat && U.daysBetween(r.NgayDoiGanNhat, U.today());
      return d > C().passwordAgeWarnDays ? { text: 'Nên đổi MK', cls: 'warn' } : null;
    }
  };

  // ---------------- HÀM PHỤ ----------------
  function debt(db, id, plus, minus) {
    const rows = db.rows('GIAODICH_VAY_MUON').filter(x => x.NguoiID === id);
    return sum(rows.filter(x => x.LoaiGiaoDich === plus), x => x.SoTien) - sum(rows.filter(x => x.LoaiGiaoDich === minus), x => x.SoTien);
  }
  function deadlineOf(r, db) {
    const g = db.get('Danh_sach_goi_thau', r.Goi_thau);
    const days = U.num(g && g.Han_tra_loi_ngay) || C().deadlineDaysDefault;
    return U.addDays(r.Date_Incoming, days);
  }
  function transStatus(r, db) {
    const dl = deadlineOf(r, db);
    if (!r.Ngay_hoan_thanh) return dl && U.parseDate(U.today()) > dl ? 'Quá hạn' : 'Đang xử lý';
    return dl && U.parseDate(r.Ngay_hoan_thanh) > dl ? 'Trễ hạn' : 'Đúng hạn';
  }
  function expiryDays(v) {
    const d = U.parseDate(v);
    return d ? U.daysBetween(U.today(), d) : null;
  }
  function expiryText(v) {
    if (!v) return '';
    const n = expiryDays(v);
    if (n == null) return String(v);
    return n < 0 ? 'Đã hết hạn ' + (-n) + ' ngày' : 'Còn ' + n + ' ngày';
  }
  function expiryBadge(v) {
    const n = expiryDays(v);
    if (n == null) return null;
    if (n < 0) return { text: 'Hết hạn', cls: 'bad' };
    if (n <= C().expiryWarnDays) return { text: 'Còn ' + n + ' ngày', cls: 'warn' };
    return null;
  }

  // ---------------- MENU: NHÓM → MỤC ----------------
  // Mỗi mục có khoá quyền (perm). Mục bảng: perm = tên bảng. Album: sinh tự động từ bảng ALBUM.
  const GROUPS = [
    { key: 'g0', label: 'Tổng quan', items: [
      { key: 'DASH_TAICHINH', label: 'Dashboard tài chính', icon: '📊', type: 'dash' },
      { key: 'DASH_CONGVIEC', label: 'Dashboard công việc', icon: '📈', type: 'dash' },
      { key: 'DASH_CANHBAO', label: 'Cảnh báo & nhắc việc', icon: '⏰', type: 'dash' }
    ] },
    { key: 'g1', label: '1. Thông tin chung', items: [
      { key: 'THONGTIN_CANHAN', icon: '🪪' }, { key: 'Gioi_thieu', icon: '👤' }, { key: 'BANGCAP', icon: '🎓' },
      { key: 'KINHNGHIEM', icon: '🏭' }, { key: 'GIAITHUONG', icon: '🏆' }, { key: 'Khac', icon: '📰' }
    ] },
    { key: 'g2', label: '2. Hồ sơ', items: [
      { key: 'Hop_dong', icon: '📝' }, { key: 'Quyet_dinh', icon: '📜' }, { key: 'Chungchi_congviec', icon: '🏅' }
    ] },
    { key: 'g3', label: '3. Tài chính', items: [
      { key: 'TAIKHOAN_TAICHINH', icon: '🏦' }, { key: 'GIAODICH_THUCHI', icon: '💸' },
      { key: 'NGUOI_VAY_MUON', icon: '🤝' }, { key: 'GIAODICH_VAY_MUON', icon: '📒' }
    ] },
    { key: 'g4', label: '4. Công việc', items: [
      { key: 'Cong_viec', icon: '📦' }, { key: 'Document_no_In', icon: '📥' }, { key: 'Document_no_Out', icon: '📤' },
      { key: 'Cong_viec_duoc_giao', icon: '✅' }, { key: 'Kiem_tra_hang', icon: '🔍' }, { key: 'Danh_sach_goi_thau', icon: '🗂️' },
      { key: 'Danh_Ba', icon: '📇' }, { key: 'Tool', icon: '🧰' }, { key: 'Link', icon: '🔗' }, { key: 'Calendar', icon: '📅' }
    ] },
    { key: 'g5', label: '5. Hình ảnh', albums: true, items: [] },
    { key: 'g6', label: '6. Bảo mật & Tiện ích', items: [{ key: 'TAIKHOAN_MATKHAU', icon: '🔐' }] }
  ];
  GROUPS.forEach(g => g.items.forEach(it => {
    if (!it.type) { it.type = 'table'; it.table = it.key; it.label = it.label || T[it.key].label; }
    it.perm = it.key;
  }));

  // Nhóm 5 lấy danh sách album từ bảng ALBUM
  function groupsWithAlbums(db) {
    const albums = db.rows('ALBUM').slice().sort((a, b) => U.num(a.Thu_tu) - U.num(b.Thu_tu));
    return GROUPS.map(g => g.albums ? { ...g, items: albums.map(a => ({
      key: 'HINH_ANH#' + a.id, perm: 'HINH_ANH#' + a.id, label: a.Ten_album, icon: '🖼️', type: 'album', table: 'HINH_ANH', album: a.id
    })) } : g);
  }

  window.SCHEMA = { tables: T, groups: GROUPS, groupsWithAlbums, transStatus, deadlineOf, expiryDays };
})();
