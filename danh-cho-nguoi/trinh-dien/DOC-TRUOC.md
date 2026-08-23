# Trang trình diễn Hub — đọc trước khi sửa

`home-6-show-light.html` là **bản trình diễn**, không phải mã ứng dụng. Mở thẳng bằng
trình duyệt (nháy đúp), không cần máy chủ nào.

Bốn màn nối nhau: **đăng nhập → video intro → intro sư tử → trang chủ**. Có nút bỏ qua ở
mọi màn, nên trình bày trước đám đông không bao giờ bị kẹt.

## Nó đến từ đâu

Dự án Claude Design **"School data hub app"**
(`ad81b74b-ed81-4b0e-9cc0-d15a249a0c96`), file `home-6-show-light.html`.

Lấy từ **bản xuất .zip**, không phải bản đọc qua công cụ đồng bộ — đo ra hai bản lệch
nhau 5 dòng: bản qua công cụ mang thêm `data-comment-anchor="…"`, là dấu neo bình luận
của trình soạn thảo, không thuộc thiết kế. Lần sau đồng bộ thì **cũng lấy từ .zip**, hoặc
nhớ bóc các thuộc tính đó ra.

Sửa duy nhất khi đưa vào kho: `apps/hub/public/…` → `../../apps/hub/public/…`, đúng 4 chỗ.
Trang dùng chung logo, mascot và phông icon với app thật — **không có bản sao nào**, nên
đổi logo trong app là trang này đổi theo.

## Hai video 27 MB — vì sao chúng nằm trong kho

`uploads/intro-software.mp4` (17 MB) và `uploads/Armored_lion_mascot_running_loop_…mp4`
(10 MB). Chúng **không lấy được** qua công cụ đồng bộ: giới hạn 256 KiB mỗi file, và bản
tải về cụt ở đúng mốc đó (không có `moov` atom, tức không phải file mp4 hợp lệ).

Kho `.git` từ 31 MB lên khoảng 58 MB, **vĩnh viễn** — git giữ mọi blob kể cả sau khi xoá.
Chấp nhận vì trang trình diễn thiếu video là một buổi trình bày hỏng, và 58 MB vẫn nhỏ.

**Nếu về sau video được xuất lại nhiều lần** (dự án thiết kế đang có 3 biến thể intro sư
tử), mỗi lần thêm ~17 MB nữa. Tới lúc đó thì chuyển sang `git-lfs` — kho hiện chưa có
`.gitattributes`, chưa bật lfs.

Trang **vẫn chạy khi thiếu video**: `startShow()` kiểm `introVideo.error` rồi nhảy thẳng
vào trang chủ. Thiếu video là mất phần nhìn, không phải treo.

## Hai điều đã biết, cố ý chưa sửa

**1. Phụ thuộc mạng ngoài — `unpkg.com` (three.js) và `fonts.googleapis.com`.** Hiệu ứng
3D ở màn trang chủ nạp three.js từ unpkg lúc chạy. Mạng trường có lọc nội dung; unpkg bị
chặn thì canvas 3D **trắng trơn, không báo lỗi gì**. Phông icon thì đã tự host rồi
(`material-symbols-rounded-subset.woff2`), riêng Be Vietnam Pro vẫn từ Google Fonts.

Đây đúng là thứ mà quy tắc thiết kế của kho cấm ("tự host phông chữ, icon và thư viện").
Chưa sửa vì tự host three.js là thêm ~1,2 MB và sửa vào file thiết kế của chủ đầu tư.
**Trước khi trình bày trên wifi trường: mở thử một lần ngay tại chỗ đó.**

**2. `#hv-clock` — JS gọi một phần tử không tồn tại.** Có sẵn trong bản thiết kế gốc.
Vô hại: lời gọi được bọc `if(ck)`, nên chỉ là một `setInterval` chạy không mỗi giây. Giữ
nguyên để bản trong kho khớp từng ký tự với bản thiết kế, trừ 4 đường dẫn đã nói ở trên.

## Nội dung KHÁC với app đang chạy

Trang này chụp lại app ở thời điểm khoảng một tuần trước, nên có bốn chỗ nay đã khác.
Không phải lỗi — nhưng ai mang đi trình bày cần biết mình đang cho xem cái gì:

| Trong trang trình diễn | App thật hôm nay |
|---|---|
| Nhãn *"Chỉ thầy cô chủ nhiệm và thầy cô tâm lý thấy"* dưới bốn ô cảm xúc | Đã **gỡ khỏi cả ba màn** 22/08/2026. Phạm vi quyền không đổi — `core.can_read_mood()` vẫn là chính em ∨ tâm lý cụm ∨ GVCN của chính em. Xem nợ #70 |
| Ô *"Học tập · GĐ2"* và *"Y tế · GĐ2"* trong lưới Mini App | Đã **gỡ hẳn** 22/08/2026 — không dựng ô mờ quảng cáo việc chưa làm |
| Lưới Mini App có ô *"Check-in cảm xúc"* và *"Báo cáo"* | Cả hai **không còn ở lưới**: check-in nay là popup, Báo cáo là trang trong menu. Lưới của học sinh hiện **rỗng** |
| Bấm ô cảm xúc → nút *"Check-in ngay"* → hộp thoại → màn *"Tuyệt vời! 🎉"* | **Chạm một ô là xong**, popup đóng luôn, không màn xác nhận (21/08/2026) |

Muốn trang trình diễn khớp app thật thì sửa ở **dự án Claude Design trước**, rồi đồng bộ
lại về đây — đừng sửa thẳng file này, vì lần đồng bộ sau sẽ ghi đè.
