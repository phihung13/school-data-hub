# Design Brief — School Data Hub Super App (mobile PWA)

Dùng bản này làm input cho công cụ thiết kế. Đây là brief cho một **Super App giáo dục** dùng trong trường học thật (Hệ thống Trường Việt Anh), không phải app tiêu dùng thông thường — ưu tiên rõ ràng, tin cậy, nhanh, hơn là hào nhoáng.

## 1. Sản phẩm là gì

School Data Hub — nền tảng theo dõi & chăm sóc học sinh, dạng **Super App + Mini App**: một shell dùng chung (đăng nhập, điều hướng, hồ sơ, thông báo), nhiều Mini App bên trong (Attendance/check-in, Care, Evidence, Tutor, Health). Người dùng không cần biết ranh giới kỹ thuật giữa các Mini App — với họ đây là một app duy nhất.

Nền tảng kỹ thuật: **PWA (web app), không phải native app** ở giai đoạn này — cài qua link/QR, "Thêm vào màn hình chính". Thiết kế phải đẹp và mượt trong giới hạn của web mobile, không giả định có API native.

## 2. Người dùng & màn hình chính theo vai trò

| Vai trò | Việc chính họ làm | Tần suất | Ghi chú thiết kế |
|---|---|---|---|
| **Học sinh** | Check-in mood + điểm danh | Mỗi sáng | Phải xong trong **20 giây**, thao tác tối thiểu, không cần đọc nhiều chữ |
| **Phụ huynh** | Xem báo cáo trưởng thành, nhận bản tin | Theo tuần/kỳ | Có thể **lớn tuổi, không rành công nghệ** — chữ to, tương phản rõ, không thuật ngữ kỹ thuật |
| **GVCN (giáo viên chủ nhiệm)** | Mở "buồng lái": xem cờ, xác nhận điểm danh lệch, ghi can thiệp | Mỗi sáng, ~3 phút | Cần quét nhanh danh sách, phân biệt mức độ ưu tiên bằng mắt, thao tác 1 chạm |
| **Tâm lý cụm / counselor** | Xử lý case tầng 2–3, ghi chú tư vấn | Theo case phát sinh | Không gian riêng tư hơn, ít "vui vẻ" hơn buồng lái GVCN |
| **BGH / Ban điều hành** | Xem xu hướng, dữ liệu tổng hợp theo cơ sở | Theo tuần/kỳ | Chỉ số tổng hợp, biểu đồ xu hướng — **không có màn hình tra cứu cá nhân học sinh** |

## 3. Ràng buộc thiết bị — thiết kế phải sống được trên máy thật, không phải máy demo

- Thiết bị: **điện thoại cá nhân**, phần lớn Android tầm trung/thấp (RAM 2–3GB), một số iPhone dùng qua Safari.
- Mạng: wifi trường có thể chập chờn. Layout phải chịu được **trạng thái offline** (xem mục 7), không được giả định luôn có mạng.
- Không dùng hiệu ứng nặng (heavy animation, video nền, ảnh độ phân giải cao không tối ưu). Ưu tiên tốc độ tải hơn hiệu ứng.
- Không có push notification của hệ điều hành — mọi nhắc nhở đi qua **Zalo**. Nếu cần "thông báo" trong thiết kế, nghĩ theo hướng banner trong app hoặc tin nhắn Zalo, không phải icon chuông kiểu app thông thường.
- Ngôn ngữ giao diện: **tiếng Việt**, không song ngữ.

## 4. Nguyên tắc UX bắt buộc (không thương lượng)

1. **Check-in ≤ 20 giây.** Đây là màn hình quan trọng nhất trong toàn bộ app — thiết kế nó trước, kỹ nhất, đơn giản nhất.
2. **"Mất mạng không phải lỗi."** Khi offline, hiển thị trạng thái trung tính ("đã lưu, sẽ gửi khi có mạng") — tuyệt đối không dùng màu đỏ/icon lỗi to đùng cho tình huống này, vì nó xảy ra hàng ngày và không phải sự cố.
3. **Một chạm cho hành động thường xuyên nhất.** GVCN xác nhận/đóng case, học sinh chọn mood — không qua nhiều bước, không modal xác nhận thừa.
4. **Không gamify hoá dữ liệu chăm sóc.** Đây không phải app thi đua điểm số — tránh badge/streak/leaderboard cho dữ liệu cảm xúc và chuyên cần (khác với các Mini App khác như Fitness có thể dùng nhẹ nhàng hơn).

## 5. Ngôn ngữ & tone nội dung — quan trọng nhất trong brief này

Có **hai chế độ ngôn ngữ hoàn toàn khác nhau**, không được trộn:

- **Hướng học sinh/phụ huynh — "Glow & Grow":** luôn tích cực, không nhãn nguy cơ. Ví dụ đúng: *"Con đang cần thêm một chút hỗ trợ ở việc đọc sách."* Cấm xuất hiện các từ: "cờ", "ngưỡng", "nguy cơ", "cảnh báo", bất kỳ từ nào nghe như chấm điểm/xếp loại.
- **Hướng nội bộ (GVCN, tâm lý cụm, BGH) — ngôn ngữ vận hành:** thẳng, súc tích, dùng thuật ngữ nghiệp vụ. Ví dụ: *"Cờ B — hành vi, mở 5 ngày, chưa hành động."*

→ Thiết kế nên có **hai bộ component khác nhau** cho hai chế độ này (không phải một component ẩn/hiện chữ), vì tông màu, mật độ thông tin và cấu trúc câu đều khác.

## 6. Hệ màu & tín hiệu

- Trường đang dùng **hệ thống "4 màu" cho mood/điểm danh trên giấy** làm phương án dự phòng khi hệ thống ngừng hoạt động — bản digital nên **dùng đúng 4 màu đó** để giáo viên/học sinh nhận diện nhất quán giữa giấy và app. *(Cần hỏi lại trường bộ 4 màu cụ thể đang dùng — brief này chưa có mã màu chính xác, đừng tự đặt.)*
- Với dữ liệu chăm sóc (care/case), tránh dùng đỏ theo kiểu "báo động an ninh" — đây là dữ liệu về trẻ em cần hỗ trợ, không phải sự cố hệ thống. Ưu tiên tông ấm/trung tính cho mức độ ưu tiên, giữ đỏ thật sự chỉ cho hành động cần làm ngay (leo thang quá hạn).
- Mood tiêu cực của học sinh **không được hiển thị cho phụ huynh/học sinh khác** dưới dạng nhãn xấu — chỉ GVCN/nội bộ mới thấy mức độ chi tiết.

## 7. Trạng thái đặc biệt cần thiết kế (thường bị bỏ quên)

- **Offline / đang đồng bộ:** trạng thái check-in đã lưu local, chưa gửi được.
- **Gửi muộn ngoài khung giờ:** check-in đến sau giờ quy định, chờ GVCN xác nhận thủ công — cần một trạng thái "chờ xác nhận", khác với "đã điểm danh" và "vắng".
- **Rỗng vì chưa có dữ liệu** vs **rỗng vì mọi thứ ổn** (buồng lái GVCN không có cờ nào) — hai trạng thái rỗng này phải trông khác nhau rõ ràng, không để GVCN nhầm "không có gì hiển thị" là do lỗi.
- **Dữ liệu đã cũ (không phải real-time):** một số màn hình chỉ cập nhật theo lô (dashboard BGH, tiến độ Moodle) — cần một mẫu hiển thị "dữ liệu tính đến HH:mm" nhất quán, dùng lại ở mọi nơi có dữ liệu trễ.

## 8. Phạm vi lần này / chưa cần làm

- **Chưa cần:** màn hình admin phức tạp, thiết kế cho tablet/màn lớn, native app, dark mode (có thể tính sau).
- **Chưa chốt công nghệ** (không ảnh hưởng tới thiết kế UI, chỉ ảnh hưởng cách build sau này): app có thể tiếp tục là PWA hoặc bọc bằng Flutter — thiết kế nên trung lập, không phụ thuộc component riêng của một nền tảng.
- **Cần ưu tiên thiết kế trước:** (1) Check-in học sinh, (2) Buồng lái GVCN, (3) Báo cáo cho phụ huynh. Ba màn hình này quyết định thành công của toàn hệ thống trong tuần đầu vận hành.

## 9. Dữ liệu mẫu để dùng trong mockup (hư cấu, không dùng tên thật)

- Học sinh mẫu: "Minh — Lớp 6A1 — mã HS VA-2026-00417"
- Check-in mẫu: mood tiêu cực 3 ngày liên tiếp + 1 lần bấm "cần gặp thầy cô"
- Case mẫu (GVCN thấy): "Cờ E — cảm xúc, gộp 2 tín hiệu, mở 2 ngày, chưa hành động"
- Báo cáo phụ huynh mẫu: "Tuần này Minh đọc sách 3/5 buổi, tham gia CLB bơi đều đặn, cần thêm hỗ trợ ở kỹ năng thuyết trình"
- Trạng thái buồng lái GVCN: 5 case đang mở, 1 quá hạn 7 ngày (leo thang)

## 10. Định dạng đầu ra mong muốn

- Khung hình theo viewport điện thoại phổ thông (~360–400px width), không phải desktop-first.
- Ưu tiên: 3 màn hình ở mục 8 trước, các màn hình khác sau.
- Nếu công cụ hỗ trợ, tạo cả hai biến thể ngôn ngữ (Glow & Grow / vận hành nội bộ) cho cùng một loại dữ liệu để so sánh trực tiếp.
