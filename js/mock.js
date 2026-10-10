// =====================================================================
//  API DEMO: dữ liệu GIẢ lưu trong trình duyệt (localStorage) để chạy thử.
//  Cùng giao diện với LiveAPI và áp dụng y hệt logic phân quyền.
//  Không liên quan gì đến Google Sheet thật.
// =====================================================================
(function () {
  const KEY = 'pwa-demo-v1', FKEY = 'pwa-demo-files-v1', UKEY = 'pwa-demo-user';
  const OWNER = 'chu.app@demo';
  const T = () => window.SCHEMA.tables;

  const day = n => U.iso(new Date(Date.now() + n * 86400000));
  const mon = (m, d) => { const x = new Date(); x.setMonth(x.getMonth() + m); x.setDate(d); return U.iso(x); };

  function svg(label, hue) {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},70%,35%)"/></linearGradient></defs>
      <rect width="640" height="480" fill="url(#g)"/><circle cx="500" cy="120" r="60" fill="rgba(255,255,255,.35)"/>
      <path d="M0 400 L180 250 L300 350 L420 220 L640 420 L640 480 L0 480Z" fill="rgba(0,0,0,.25)"/>
      <text x="32" y="64" font-family="sans-serif" font-size="34" fill="#fff">${label}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s)));
  }

  function seed() {
    const files = {};
    const img = (label, hue) => { const p = 'demo/' + U.uid() + '.svg'; files[p] = svg(label, hue); return p; };
    const id = U.uid;
    const tk = { tm: id(), bidv: id(), tiet: id() };
    const ng = { a: id(), b: id(), c: id() };
    const db = { a: id(), b: id(), c: id() };
    const tr = [id(), id(), id(), id(), id(), id()];
    const alb = ['anh_canhan', 'tot_nghiep_dh', 'cong_tac_lp1', 'thi_tcdg'];
    const t = {
      THONGTIN_CANHAN: [{ ID: id(), HoTen: 'Nguyễn Văn Demo', NgaySinh: '1995-01-01', Hoc_vi: 'Thạc sĩ', Nhom_mau: 'O', SoCCCD: '000000000001',
        NgayCap: '2021-05-10', NoiCap: 'Cục CS QLHC về TTXH (demo)', DiaChiThuongTru: 'Cần Thơ (demo)', DiaChiHienTai: 'Sóc Trăng (demo)',
        SoDienThoai: '0900000000', Email: 'demo@example.com', AnhChanDung: img('Ảnh chân dung', 210), AnhCCCD_MatTruoc: '', AnhCCCD_MatSau: '', Giay_khai_sinh: '', GhiChu: 'Dữ liệu giả để chạy thử' }],
      Gioi_thieu: [{ ID: id(), HoTen: 'Nguyễn Văn Demo', NgaySinh: '1995-01-01', Hoc_vi: 'Thạc sĩ', Nhom_mau: 'O', Email_ca_nhan: 'demo@example.com', Email_cong_viec: 'demo.work@example.com', Tieu_su: 'Kỹ sư điện, kinh nghiệm vận hành nhà máy điện gió và nhiệt điện (demo).', AnhChanDung: '', GhiChu: '' }],
      BANGCAP: [
        { ID: id(), TenBangCap: 'Kỹ sư Kỹ thuật điện', LoaiBangCap: 'Đại học', ChuyenNganh: 'Hệ thống điện', Xep_loai: 'Giỏi', DonViCap: 'Trường ĐH (demo)', Nam_TN: '2017', NgayCap: '2017-09-15', NgayHetHan: 'Không thời hạn', SoHieuBang: 'DEMO-001', SoHieuVaoSo: '', FileScan: '', HinhAnh: img('Bằng kỹ sư', 30) },
        { ID: id(), TenBangCap: 'Thạc sĩ Kỹ thuật điện', LoaiBangCap: 'Thạc sĩ', ChuyenNganh: 'Kỹ thuật điện', Xep_loai: '', DonViCap: 'Trường ĐH (demo)', Nam_TN: '2022', NgayCap: '2022-12-20', NgayHetHan: 'Không thời hạn', SoHieuBang: 'DEMO-002', SoHieuVaoSo: '', FileScan: '', HinhAnh: '' },
        { ID: id(), TenBangCap: 'Chứng chỉ An toàn điện', LoaiBangCap: 'Chứng chỉ', ChuyenNganh: '', Xep_loai: '', DonViCap: 'Trung tâm đào tạo (demo)', Nam_TN: '2024', NgayCap: day(-690), NgayHetHan: day(40), SoHieuBang: '', SoHieuVaoSo: '', FileScan: '', HinhAnh: '' }
      ],
      KINHNGHIEM: [
        { ID: id(), TenCongTy: 'POM - Chi nhánh Vận hành và bảo trì nhà máy điện (PECC2)', ViTriChucVu: 'Kỹ sư vận hành', Ten_Nha_may: 'Nhà máy điện gió (demo)', Loai_hinh_nang_luong: 'Điện gió', Email: '', Chu_dau_tu: 'Chủ đầu tư (demo)', Cong_suat_dat: '99 MW', Vi_tri_Nha_may: 'Bạc Liệu', NgayBatDau: '2018-03-01', NgayKetThuc: '2021-06-30', MoTaCongViec: 'Vận hành, trực ca (demo)', LyDoNghiViec: '', Hinh_anh: '', FileHopDong: '' },
        { ID: id(), TenCongTy: 'LP1PP - Ban quản lý dự án nhiệt điện dầu khí Long Phú 1 ', ViTriChucVu: 'Chuyên viên', Ten_Nha_may: 'Nhà máy nhiệt điện (demo)', Loai_hinh_nang_luong: 'Nhiệt điện', Email: '', Chu_dau_tu: '', Cong_suat_dat: '1200 MW', Vi_tri_Nha_may: 'Sóc Trăng', NgayBatDau: '2024-01-02', NgayKetThuc: '', MoTaCongViec: 'Kiểm tra hồ sơ thiết kế phần điện (demo)', LyDoNghiViec: '', Hinh_anh: '', FileHopDong: '' }
      ],
      GIAITHUONG: [{ ID: id(), TenGiaiThuong: 'Giấy khen (demo)', ToChucTrao: 'Đơn vị (demo)', NgayNhan: '2023-12-30', CapDo: 'Cơ sở', File_quyet_dinh: '', HinhAnh: '' }],
      Khac: [{ ID: id(), Noi_dung: 'Bài báo mẫu về dự báo công suất điện gió (demo)', Tac_gia: 'Nhóm tác giả (demo)', So_doi: 'https://doi.org/10.0000/demo', 'To chuc': 'Tạp chí (demo)', Ngay_cong_khai: '2023-06-01', So_trang: '1-10', Issue: '1', File_goc: '', HinhAnh: '' }],
      Hop_dong: [
        { id: id(), Ten_HD: 'Hợp đồng lao động (demo)', Loai_hop_dong: 'Hợp đồng lao động', So_Quyet_Dinh: 'HĐ-01/DEMO', Don_vi: 'Đơn vị (demo)', Ngay_ky: '2024-01-02', File_HD: '' },
        { id: id(), Ten_HD: 'Thoả thuận lương (demo)', Loai_hop_dong: 'Thỏa thuận lương', So_Quyet_Dinh: 'TT-02/DEMO', Don_vi: 'Đơn vị (demo)', Ngay_ky: '2025-01-02', File_HD: '' }
      ],
      Quyet_dinh: [{ ID: id(), TenBangCap: 'Quyết định bổ nhiệm (demo)', ChuyenNganh: 'QĐ-10/DEMO', DonViCap: 'Đơn vị (demo)', Nam_TN: '2025', NgayCap: '2025-03-01', NgayHetHan: 'Không thời hạn', FileScan: '', HinhAnh: '' }],
      Chungchi_congviec: [
        { ID: id(), TenBangCap: 'Chứng chỉ trưởng ca (demo)', DonViCap: 'Trung tâm (demo)', Nam_TN: '2020', NgayCap: '2020-08-01', NgayHetHan: day(-20), FileScan: '', HinhAnh: '' },
        { ID: id(), TenBangCap: 'Chứng chỉ PCCC (demo)', DonViCap: 'Cảnh sát PCCC (demo)', Nam_TN: '2025', NgayCap: '2025-05-01', NgayHetHan: day(400), FileScan: '', HinhAnh: '' }
      ],
      TAIKHOAN_TAICHINH: [
        { ID: tk.tm, TenTaiKhoan: 'Ví tiền mặt', SoTK: '', LoaiTaiSan: 'Tiền mặt', SoDuHienTai: 2000000 },
        { ID: tk.bidv, TenTaiKhoan: 'BIDV', SoTK: '1234567890', LoaiTaiSan: 'Ngân hàng', SoDuHienTai: 10000000 },
        { ID: tk.tiet, TenTaiKhoan: 'Tiết kiệm', SoTK: '9876543210', LoaiTaiSan: 'Đầu tư', SoDuHienTai: 50000000 }
      ],
      GIAODICH_THUCHI: [],
      NGUOI_VAY_MUON: [
        { ID: ng.a, TenNguoi: 'Anh A (demo)', SoDienThoai: '0900000001', Ghichu: '' },
        { ID: ng.b, TenNguoi: 'Chị B (demo)', SoDienThoai: '0900000002', Ghichu: '' },
        { ID: ng.c, TenNguoi: 'Bạn C (demo)', SoDienThoai: '', Ghichu: '' }
      ],
      GIAODICH_VAY_MUON: [
        { ID: id(), NguoiID: ng.a, LoaiGiaoDich: 'Cho vay', SoTien: 5000000, NgayGD: day(-60), NgayHenTra: day(30), TaiKhoanID: tk.bidv, GhiChu: 'Cho mượn (demo)' },
        { ID: id(), NguoiID: ng.a, LoaiGiaoDich: 'Họ trả mình', SoTien: 2000000, NgayGD: day(-10), NgayHenTra: '', TaiKhoanID: tk.bidv, GhiChu: 'Trả đợt 1' },
        { ID: id(), NguoiID: ng.b, LoaiGiaoDich: 'Đi mượn', SoTien: 1000000, NgayGD: day(-5), NgayHenTra: day(25), TaiKhoanID: tk.tm, GhiChu: '' },
        { ID: id(), NguoiID: ng.c, LoaiGiaoDich: 'Cho vay', SoTien: 500000, NgayGD: day(-90), NgayHenTra: '', TaiKhoanID: tk.tm, GhiChu: '' },
        { ID: id(), NguoiID: ng.c, LoaiGiaoDich: 'Họ trả mình', SoTien: 500000, NgayGD: day(-40), NgayHenTra: '', TaiKhoanID: tk.tm, GhiChu: '' }
      ],
      Danh_sach_goi_thau: [
        { id: 1, MaGoiThau: 'T19', Noi_dung: 'Hệ thống vận chuyển than (demo)', Tinh_trang: 'Đang thực hiện', Ten_hop_dong: '', Phu_luc_HĐ: '', Ten_NhaThau: 'Nhà thầu X (demo)', Loai_HĐ: 'EPC', Ngayky_HopDong: '2024-06-01', Thoi_gian_thuchien_HĐ: '', NgayBatDauCongViec: '', Ngay_ketThuc_duKien: '', Han_tra_loi_ngay: '' },
        { id: 2, MaGoiThau: 'T22', Noi_dung: 'Hệ thống đá vôi - thạch cao (demo)', Tinh_trang: 'Đang thực hiện', Ten_hop_dong: '', Phu_luc_HĐ: '', Ten_NhaThau: 'Nhà thầu Y (demo)', Loai_HĐ: 'EPC', Ngayky_HopDong: '2024-07-01', Thoi_gian_thuchien_HĐ: '', NgayBatDauCongViec: '', Ngay_ketThuc_duKien: '', Han_tra_loi_ngay: 15 },
        { id: 3, MaGoiThau: 'T23', Noi_dung: 'Hệ thống thải xỉ (demo)', Tinh_trang: 'Đang thực hiện', Ten_hop_dong: '', Phu_luc_HĐ: '', Ten_NhaThau: 'Nhà thầu Z (demo)', Loai_HĐ: 'EPC', Ngayky_HopDong: '2024-08-01', Thoi_gian_thuchien_HĐ: '534 ngày', NgayBatDauCongViec: '', Ngay_ketThuc_duKien: '', Han_tra_loi_ngay: 15 }
      ],
      Danh_Ba: [
        { id: db.a, HoTen: 'Trần Văn A (demo)', ChucVu: 'Trưởng phòng', VaiTro: 'Giao việc', SDT: '0900000011', DiaChi: '', Note: '' },
        { id: db.b, HoTen: 'Lê Thị B (demo)', ChucVu: 'Phó phòng', VaiTro: 'Giao việc', SDT: '0900000012', DiaChi: '', Note: '' },
        { id: db.c, HoTen: 'Phạm Văn C (demo)', ChucVu: 'Văn thư', VaiTro: 'Nhận tài liệu', SDT: '0900000013', DiaChi: '', Note: '' }
      ],
      Cong_viec: [
        { id: tr[0], Goi_thau: 'T22', Transmittal_No: 'T-0101 (demo)', Date_Incoming: day(-40), Nguoi_giaoviec: db.a, Nguoi_nhan_Trans: db.c, Ngay_hoan_thanh: day(-30) },
        { id: tr[1], Goi_thau: 'T22', Transmittal_No: 'T-0102 (demo)', Date_Incoming: day(-35), Nguoi_giaoviec: db.a, Nguoi_nhan_Trans: db.c, Ngay_hoan_thanh: day(-15) },
        { id: tr[2], Goi_thau: 'T23', Transmittal_No: 'T-0201 (demo)', Date_Incoming: day(-20), Nguoi_giaoviec: db.b, Nguoi_nhan_Trans: db.c, Ngay_hoan_thanh: '' },
        { id: tr[3], Goi_thau: 'T23', Transmittal_No: 'T-0202 (demo)', Date_Incoming: day(-6), Nguoi_giaoviec: db.b, Nguoi_nhan_Trans: db.c, Ngay_hoan_thanh: '' },
        { id: tr[4], Goi_thau: 'T19', Transmittal_No: 'T-0301 (demo)', Date_Incoming: day(-12), Nguoi_giaoviec: db.a, Nguoi_nhan_Trans: db.c, Ngay_hoan_thanh: '' },
        { id: tr[5], Goi_thau: 'T19', Transmittal_No: 'T-0300 (demo)', Date_Incoming: day(-75), Nguoi_giaoviec: db.a, Nguoi_nhan_Trans: db.c, Ngay_hoan_thanh: day(-64) }
      ],
      Document_no_In: [
        { id: id(), id_transmittal: tr[0], 'Document Number': 'LP1-T22-DAL-0001 (demo)', Description: 'Danh sách phụ tải (demo)', Rev: 'B', Purpose: 'FA: For Approval', File: '', Ngay_guiDen: day(-40) },
        { id: id(), id_transmittal: tr[1], 'Document Number': 'LP1-T22-CAL-0002 (demo)', Description: 'Tính toán cáp (demo)', Rev: 'A', Purpose: 'FA: For Approval', File: '', Ngay_guiDen: day(-35) },
        { id: id(), id_transmittal: tr[2], 'Document Number': 'LP1-T23-SLD-0003 (demo)', Description: 'Sơ đồ một sợi (demo)', Rev: 'C', Purpose: 'FA: For Approval', File: '', Ngay_guiDen: day(-20) },
        { id: id(), id_transmittal: tr[3], 'Document Number': 'LP1-T23-ITP-0004 (demo)', Description: 'ITP lắp đặt cáp (demo)', Rev: 'A', Purpose: 'FR: For Reference', File: '', Ngay_guiDen: day(-6) },
        { id: id(), id_transmittal: tr[4], 'Document Number': 'LP1-T19-SPC-0005 (demo)', Description: 'Spec động cơ (demo)', Rev: '0', Purpose: 'FI : For Information', File: '', Ngay_guiDen: day(-12) }
      ],
      Document_no_Out: [
        { id: id(), id_transmittal: tr[0], 'Document Number': 'LP1-T22-DAL-0001 (demo)', Description: 'Comm sheet', Rev: 'B', Status: 'B: Approved with comments', File: '', Ngay_hoan_hanh: day(-30) },
        { id: id(), id_transmittal: tr[1], 'Document Number': 'LP1-T22-CAL-0002 (demo)', Description: 'Comm sheet', Rev: 'A', Status: 'C: Disapproved', File: '', Ngay_hoan_hanh: day(-15) },
        { id: id(), id_transmittal: tr[5], 'Document Number': 'LP1-T19-DSL-0006 (demo)', Description: 'Comm sheet', Rev: '1', Status: 'A: Approved', File: '', Ngay_hoan_hanh: day(-64) }
      ],
      Cong_viec_duoc_giao: [
        { id: id(), Ten_cong_viec: 'Tổng hợp báo cáo tuần (demo)', Ngay_giao: day(-3), Nguoi_giao: db.a, Trang_thai: 'Đang xử lý', Ngay_hoan_thanh: '', Ghi_chu: '' },
        { id: id(), Ten_cong_viec: 'Rà soát danh mục vật tư dự phòng (demo)', Ngay_giao: day(-15), Nguoi_giao: db.b, Trang_thai: 'Đã xử lý', Ngay_hoan_thanh: day(-8), Ghi_chu: '' },
        { id: id(), Ten_cong_viec: 'Chuẩn bị họp giao ban (demo)', Ngay_giao: day(-1), Nguoi_giao: db.a, Trang_thai: 'Đang xử lý', Ngay_hoan_thanh: '', Ghi_chu: '' }
      ],
      Kiem_tra_hang: [
        { id: id(), Phan_loai: 'Kiểm đếm', Goi_thau: 'T22', So_luong: 12, Noi_dung: 'Kiểm đếm kiện tủ điện (demo)', Ngay_thuc_hien: day(-9), Ngay_hoan_thanh: day(-9), Ghi_chu: '', Hinh_anh: '', File: '' },
        { id: id(), Phan_loai: 'Mở kiện', Goi_thau: 'T23', So_luong: 3, Noi_dung: 'Mở kiện động cơ (demo)', Ngay_thuc_hien: day(-2), Ngay_hoan_thanh: '', Ghi_chu: 'Chờ nhà thầu', Hinh_anh: '', File: '' }
      ],
      Tool: [{ id: id(), Ten_cong_cu: 'Bảng tính sụt áp (demo)', File: '' }],
      Link: [
        { id: id(), Noi_dung: 'Tra cứu tiêu chuẩn IEC', Phan_loai: 'Công cụ', Link: 'https://webstore.iec.ch' },
        { id: id(), Noi_dung: 'Thư mục dự án (demo)', Phan_loai: 'Công việc - LP1', Link: 'https://example.com' }
      ],
      Calendar: [
        { id: id(), TenSuKien: 'Họp giao ban (demo)', NgayBatDau: day(2) + ' 08:00', NgayKetThuc: day(2) + ' 09:30' },
        { id: id(), TenSuKien: 'Kiểm tra hiện trường T23 (demo)', NgayBatDau: day(6) + ' 13:30', NgayKetThuc: day(6) + ' 16:00' },
        { id: id(), TenSuKien: 'Đào tạo an toàn (demo)', NgayBatDau: day(-4) + ' 08:00', NgayKetThuc: '' }
      ],
      ALBUM: [
        { id: alb[0], Ten_album: 'Ảnh cá nhân', Mo_ta: '', Thu_tu: 1, Anh_bia: '' },
        { id: alb[1], Ten_album: 'Tốt nghiệp Đại học', Mo_ta: '', Thu_tu: 2, Anh_bia: '' },
        { id: alb[2], Ten_album: 'Công tác tại LP1', Mo_ta: 'Ảnh hiện trường', Thu_tu: 3, Anh_bia: '' },
        { id: alb[3], Ten_album: 'Thi trưởng ca điện gió', Mo_ta: '', Thu_tu: 4, Anh_bia: '' }
      ],
      HINH_ANH: [],
      TAIKHOAN_MATKHAU: [
        { ID: id(), TenDichVu: 'Gmail', LoaiTaiKhoan: 'Email', TenDangNhap: 'demo@example.com', GoiYMatKhau: 'demo-matkhau-1', EmailKhoiPhuc: '', NgayDoiGanNhat: day(-30), TrangThai: 'Đang hoạt động', GhiChu: '' },
        { ID: id(), TenDichVu: 'BIDV', LoaiTaiKhoan: 'Ngân hàng', TenDangNhap: 'demo_user', GoiYMatKhau: 'demo-matkhau-2', EmailKhoiPhuc: '', NgayDoiGanNhat: day(-400), TrangThai: 'Đang hoạt động', GhiChu: '' },
        { ID: id(), TenDichVu: 'Facebook', LoaiTaiKhoan: 'Mạng xã hội', TenDangNhap: 'demo.fb', GoiYMatKhau: 'demo-matkhau-3', EmailKhoiPhuc: '', NgayDoiGanNhat: day(-90), TrangThai: 'Dừng hoạt động', GhiChu: '' }
      ]
    };
    // Thu chi 6 tháng gần nhất
    for (let m = -5; m <= 0; m++) {
      t.GIAODICH_THUCHI.push(
        { ID: id(), TaiKhoanID: tk.bidv, Loai: 'Thu', SoTien: 15000000, NgayGD: mon(m, 5), DanhMuc: 'Lương', MoTa: 'Lương tháng (demo)' },
        { ID: id(), TaiKhoanID: tk.bidv, Loai: 'Chi', SoTien: 3500000, NgayGD: mon(m, 8), DanhMuc: 'Nhà Ở', MoTa: 'Tiền nhà (demo)' },
        { ID: id(), TaiKhoanID: tk.bidv, Loai: 'Chi', SoTien: 2500000 + (m + 5) * 150000, NgayGD: mon(m, 15), DanhMuc: 'Ăn uống', MoTa: 'Ăn uống (demo)' });
    }
    t.GIAODICH_THUCHI.push({ ID: id(), TaiKhoanID: tk.tm, Loai: 'Chi', SoTien: 800000, NgayGD: mon(-1, 20), DanhMuc: 'Y tế', MoTa: 'Khám sức khoẻ (demo)' });
    // Ảnh mẫu
    [['Ảnh cá nhân 1', alb[0], 200], ['Ảnh cá nhân 2', alb[0], 260], ['Lễ tốt nghiệp', alb[1], 40], ['Hiện trường 1', alb[2], 120], ['Hiện trường 2', alb[2], 150], ['Phòng thi', alb[3], 300]]
      .forEach(([l, a, h], i) => t.HINH_ANH.push({ id: id(), Album: a, Hinh_anh: img(l, h), File: '', Mo_ta: l + ' (demo)', Ngay: day(-10 * (i + 1)) }));

    const users = [
      { Email: 'dong.nghiep@demo', Ho_ten: 'Đồng nghiệp (demo)', Kich_hoat: true, Admin: false, Goi_thau: 'T22',
        Quyen: { DASH_CONGVIEC: 'view', Cong_viec: 'edit', Document_no_In: 'edit', Document_no_Out: 'edit', Danh_sach_goi_thau: 'view', Danh_Ba: 'view', Kiem_tra_hang: 'view', 'HINH_ANH#cong_tac_lp1': 'view' } }
    ];
    return { db: { tables: t, users, config: {} }, files };
  }

  let state = null, files = null;
  function loadState() {
    if (state) return;
    try { state = JSON.parse(localStorage.getItem(KEY) || 'null'); files = JSON.parse(localStorage.getItem(FKEY) || 'null'); } catch (e) { state = null; }
    if (!state || !files) { const s = seed(); state = s.db; files = s.files; persist(); }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(FKEY, JSON.stringify(files)); }
    catch (e) { throw new Error('Bộ nhớ trình duyệt đầy (demo) — vào Cài đặt → Đặt lại dữ liệu demo'); }
  }

  // ?slow=1500 giả lập máy chủ trả lời chậm 1,5 giây (Apps Script thật thường 1–3 giây) để thử tốc độ
  const LAG = Number(new URLSearchParams(location.search).get('slow')) || 0;
  const wait = () => new Promise(r => setTimeout(r, 60 + LAG));
  const clone = o => JSON.parse(JSON.stringify(o));
  const currentEmail = () => localStorage.getItem(UKEY) || OWNER;

  function me() {
    loadState();
    const email = currentEmail();
    if (email === OWNER) return { email, name: 'Chủ app (demo)', admin: true, owner: true, goi: [], quyen: {} };
    const u = state.users.find(x => x.Email === email && x.Kich_hoat);
    if (!u) { const e = new Error('Tài khoản ' + email + ' chưa được cấp quyền dùng app'); e.code = 'NOT_ALLOWED'; throw e; }
    return { email, name: u.Ho_ten, admin: !!u.Admin, owner: false, goi: (u.Goi_thau || '').split(',').map(s => s.trim()).filter(Boolean), quyen: u.Quyen || {} };
  }
  const rows = t => { if (!T()[t]) throw new Error('Sai bảng'); return (state.tables[t] = state.tables[t] || []); };
  const parentGetter = (pt, k) => rows(pt).find(r => String(r[T()[pt].key]) === String(k));
  const level = (u, t, r) => permRowLevel(u, t, r, parentGetter);
  const findIdx = (t, kf, key) => rows(t).findIndex(r => String(r[kf]) === String(key));

  // ---- Nhạc demo ----
  const DEMO_SONGS = ['Bình minh trên biển', 'Cà phê sáng', 'Chiều Long Phú', 'Đêm thành phố', 'Gió mùa thu', 'Mưa trên phố cũ', 'Piano thư giãn', 'Tiếng sóng']
    .map((n, i) => ({ id: 'demo-s' + (i + 1), file: n + '.mp3', name: n, size: Math.round((2.6 + i * 0.7) * 1048576), updated: '2026-10-01T00:00:00Z' }));
  function musicCan() {
    const u = me();
    if (!u.admin && permRank((u.quyen || {}).NHAC) < 1) throw new Error('Bạn chưa được cấp quyền nghe nhạc');
    return u;
  }
  // Tạo file WAV 8 kHz: giai điệu ngũ cung, mỗi bài một nhịp/giọng khác nhau (theo tên bài)
  function demoTune(name) {
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const rate = 8000, secs = 24, n = rate * secs, step = 0.22 + (h % 5) * 0.04, base = 196 * Math.pow(2, (h % 7) / 12);
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
    const str = (o, s) => [...s].forEach((c, i) => buf[o + i] = c.charCodeAt(0));
    str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); str(36, 'data'); dv.setUint32(40, n, true);
    let seed = h || 1; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    let note = 0, f = base;
    for (let i = 0; i < n; i++) {
      const t = i / rate, k = Math.floor(t / step);
      if (k !== note) { note = k; f = base * Math.pow(2, scale[Math.floor(rnd() * scale.length)] / 12); }
      const local = t - k * step, env = Math.min(1, local * 40) * Math.exp(-local * 6);
      buf[44 + i] = 128 + Math.round(70 * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) / 1.3);
    }
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  window.MockAPI = {
    async me() { await wait(); return me(); },
    async list(t) { await wait(); const u = me(); return clone(rows(t).filter(r => level(u, t, r) >= 1)); },
    async batch(ts) {
      await wait(); const u = me(), out = {};
      ts.forEach(t => { try { out[t] = clone(rows(t).filter(r => level(u, t, r) >= 1)); } catch (e) { out[t] = { error: e.message }; } });
      return out;
    },
    async files(items) {
      await wait(); const u = me();
      return items.map(it => {
        try {
          const r = rows(it.table).find(x => String(x[it.keyField]) === String(it.key));
          if (!r || level(u, it.table, r) < 1) throw new Error('Không có quyền xem file');
          const du = files[r[it.field]]; return du ? U.dataUrlParts(du) : null;
        } catch (e) { return { error: e.message }; }
      });
    },
    async add(t, kf, row) {
      await wait(); const u = me();
      if (level(u, t, row) < 2) throw new Error('Bạn không có quyền thêm vào mục này');
      if (!row[kf]) throw new Error('Thiếu khoá ' + kf);
      if (findIdx(t, kf, row[kf]) >= 0) throw new Error('Khoá đã tồn tại: ' + row[kf]);
      rows(t).push(clone(row)); persist(); return clone(row);
    },
    async update(t, kf, row) {
      await wait(); const u = me();
      const i = findIdx(t, kf, row[kf]); if (i < 0) throw new Error('Không tìm thấy dòng');
      const old = rows(t)[i], merged = Object.assign({}, old, row);
      if (level(u, t, old) < 2 || level(u, t, merged) < 2) throw new Error('Bạn không có quyền sửa dòng này');
      rows(t)[i] = merged; persist(); return clone(merged);
    },
    async remove(t, kf, key) {
      await wait(); const u = me();
      const i = findIdx(t, kf, key); if (i < 0) return true;
      if (level(u, t, rows(t)[i]) < 2) throw new Error('Bạn không có quyền xoá dòng này');
      rows(t).splice(i, 1); persist(); return true;
    },
    async upload(t, field, name, dataUrl) {
      await wait(); const u = me();
      if (permTableLevel(u, t) < 2) throw new Error('Bạn không có quyền tải file lên mục này');
      const ext = (name.split('.').pop() || 'bin').slice(0, 5);
      const p = 'demo/' + U.uid() + '.' + ext; files[p] = dataUrl; persist(); return p;
    },
    async file(t, kf, key, field) {
      await wait(); const u = me();
      const r = rows(t).find(x => String(x[kf]) === String(key));
      if (!r || level(u, t, r) < 1) throw new Error('Không có quyền xem file');
      const du = files[r[field]]; if (!du) return null;
      return U.dataUrlParts(du);
    },
    async users() { await wait(); if (!me().admin) throw new Error('Chỉ quản trị viên'); return clone(state.users); },
    async saveUser(u) {
      await wait(); if (!me().admin) throw new Error('Chỉ quản trị viên');
      if (!u.Email) throw new Error('Thiếu email');
      u.Email = u.Email.trim().toLowerCase();
      if (u.Email === OWNER) throw new Error('Không sửa được tài khoản chủ app');
      const i = state.users.findIndex(x => x.Email === u.Email);
      if (i >= 0) state.users[i] = u; else state.users.push(u);
      persist(); return clone(u);
    },
    async deleteUser(email) { await wait(); if (!me().admin) throw new Error('Chỉ quản trị viên'); state.users = state.users.filter(x => x.Email !== email); persist(); return true; },
    async getConfig(k) { await wait(); loadState(); return state.config[k] ?? null; },
    async setConfig(k, v) {
      await wait(); const u = me();
      if (!u.admin) throw new Error('Chỉ quản trị viên');
      if (k === 'vault' && state.config.vault && !u.owner) throw new Error('Chỉ chủ app được thay mật khẩu chủ');
      state.config[k] = v; persist(); return true;
    },
    async signOut() { /* demo: không làm gì */ },
    async logoutAll() { await wait(); return 0; },

    // Nghe nhạc (demo): bài hát giả, âm thanh tạo bằng code (giai điệu ngắn ~25 giây)
    async songs() { await wait(); musicCan(); return DEMO_SONGS.map(s => ({ ...s })); },
    async audio(id) {
      await new Promise(r => setTimeout(r, 400 + LAG)); musicCan();
      const s = DEMO_SONGS.find(x => x.id === id); if (!s) throw new Error('File không nằm trong thư mục nhạc');
      return { mime: 'audio/wav', data: demoTune(s.name) };
    },
    async musicGet() { await wait(); const u = musicCan(); const m = (state.music || {})[u.email]; return m ? clone(m) : { playlists: {}, state: null }; },
    async musicSave(d) {
      await wait(); const u = musicCan();
      state.music = state.music || {};
      const m = state.music[u.email] = state.music[u.email] || { playlists: {}, state: null };
      if (d.playlists !== undefined) m.playlists = clone(d.playlists || {});
      if (d.state !== undefined) m.state = clone(d.state);
      persist(); return true;
    },

    // Riêng cho demo
    demo: {
      owner: OWNER,
      current: currentEmail,
      switchUser(email) { localStorage.setItem(UKEY, email); },
      reset() { localStorage.removeItem(KEY); localStorage.removeItem(FKEY); state = null; files = null; },
      emails() { loadState(); return [OWNER, ...state.users.map(u => u.Email), 'nguoi.la@demo']; }
    }
  };
})();
