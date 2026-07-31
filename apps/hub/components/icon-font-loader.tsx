// apps/hub/components/icon-font-loader.tsx
//
// Material Symbols Rounded là font icon biến thể (trục FILL/GRAD/opsz) — next/font/google
// không hỗ trợ (chỉ có font chữ thường trong danh mục của nó), nên vẫn phải tải từ
// fonts.googleapis.com.
//
// Vì sao là thẻ <script> nội tuyến chứ không phải useEffect: useEffect chỉ chạy SAU khi
// bundle JS tải xong và React hydrate xong — tức là lệnh xin font mới được phát đi ở cuối
// hàng đợi, icon trống cả giây đầu (bắt gặp thật ở trang GVCN 30/07/2026). Script nội tuyến
// chạy ngay lúc trình duyệt đọc tới nó khi dựng trang, nên yêu cầu font đi song song với
// phần còn lại — nhanh hơn hẳn mà vẫn giữ nguyên lý do cũ:
//
// KHÔNG render <link> lúc SSR. Nếu nạp bằng <link> trong cây React, tiện ích chặn quảng cáo
// (uBlock, Brave Shield...) xóa nó khỏi DOM trước khi React hydrate, server có link mà client
// không có → lỗi hydration mismatch (phát hiện thật 29/07/2026). Ở đây <link> do script tự
// tạo, nằm NGOÀI cây React — React không bao giờ so khớp nó, bị chặn cũng chỉ mất icon.
//
// Chỉ bật .msr (globals.css ẩn sẵn) khi document.fonts XÁC NHẬN font dùng được thật. Nếu chỉ
// nghe .load() resolve là bật, trường hợp bị chặn quảng cáo sẽ hiện chữ thô trong DOM
// ("notifications", "close"...) vì đó chính là nội dung phần tử — chưa có font để thay bằng
// glyph. Bị chặn thì thà để ô trống đúng chỗ còn hơn.
const SCRIPT = `(function(){var d=document;if(d.getElementById('msr-stylesheet'))return;
var f='24px "Material Symbols Rounded"';
var p=d.createElement('link');p.rel='preconnect';p.href='https://fonts.gstatic.com';p.crossOrigin='';d.head.appendChild(p);
var l=d.createElement('link');l.id='msr-stylesheet';l.rel='stylesheet';
l.href='https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..700,0..1,0';
d.head.appendChild(l);
function reveal(){if(d.fonts.check(f))d.documentElement.classList.add('msr-ready');}
d.fonts.load(f).then(reveal).catch(function(){});})();`;

export function IconFontLoader() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
