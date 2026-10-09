// =====================================================================
//  CẤU HÌNH APP — sửa file này để đổi tên, màu, chế độ chạy.
//  (Logo: thay các file trong thư mục icons/ — xem README.md)
// =====================================================================
window.APP_CONFIG = {
  appName: 'MSc. Dinh Thanh Hai',   // tên hiển thị trên đầu app
  primaryColor: '#0089ff',          // màu chủ đạo (đổi cả theme-color trong manifest.webmanifest nếu muốn)
  font: 'K2D',                      // tên font trên Google Fonts (phải hỗ trợ tiếng Việt); '' = font mặc định của máy
  copyright: 'MSc. Dinh Thanh Hai', // chủ bản quyền hiện ở chân trang
  copyrightSince: 2026,             // năm bắt đầu — chân trang tự hiện "2026–<năm nay>" khi sang năm mới

  // 'live' = dữ liệu thật trên Google Sheets qua Apps Script
  // 'demo' = chạy thử với dữ liệu giả (lưu trong trình duyệt) — mở app kèm ?demo ở cuối địa chỉ
  mode: /[?&]demo\b/.test(location.search) ? 'demo' : 'live',

  // Dùng khi mode = 'live'
  apiUrl: 'https://script.google.com/macros/s/AKfycbzr2Olcpp5tTwzSwJvuvjxoahWVEvRMtxyXaBmBEpaT1xaK-3Bpdb5jYG9dHk5XJ56O6A/exec',
  googleClientId: '1062531895029-959l1ua2ph5ld003fm7n0mr8crcvo5r1.apps.googleusercontent.com',  // OAuth Client ID (project dth-app-511101)

  autoLockMinutes: 5,        // tự khoá mật khẩu chủ sau N phút không thao tác
  deadlineDaysDefault: 14,   // hạn trả lời transmittal mặc định (ngày) nếu gói thầu chưa đặt riêng
  expiryWarnDays: 90,        // cảnh báo bằng cấp / chứng chỉ sắp hết hạn trước N ngày
  passwordAgeWarnDays: 180,  // nhắc đổi mật khẩu tài khoản sau N ngày
  version: '0.9.2'
};
