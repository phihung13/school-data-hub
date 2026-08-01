# Viet Anh School Hub — PRODUCT.md

> **Nguồn sự thật vẫn là `danh-cho-may/DESIGN-GUIDELINES.md`.** File này chỉ diễn đạt lại phần
> *chiến lược* theo định dạng công cụ thiết kế (impeccable) đọc được. Guideline đổi thì file này
> phải sửa theo — KHÔNG được để hai bản nói khác nhau (luật đồng bộ của repo).

## Register

**Product.** Đây là app nội bộ dùng hằng ngày: trang chủ super app, buồng lái giáo viên, biểu mẫu
check-in, báo cáo. Thiết kế phục vụ công việc, không phải trang giới thiệu. Không có trang bán hàng,
không có hero cuộn dài, không có landing.

## Sản phẩm là gì

Hệ thống theo dõi và chăm sóc học sinh của Hệ thống Trường Việt Anh, dựng theo mô hình
**Super App + Mini App**: mọi vai trò đăng nhập vào **cùng một trang chủ**, chỉ khác nhau ở
**lưới mini app hiện ra theo quyền**. Quy mô thiết kế ≤5.000 người dùng, ~300.000 request/ngày.

Việc lõi mà app phải làm trơn tru mỗi sáng:

1. Học sinh check-in cảm xúc trước 8:00 (có chế độ mất mạng vẫn lưu, tự gửi sau).
2. Giáo viên chủ nhiệm mở buồng lái, thấy ngay lớp mình sáng nay: ai chưa tới, ai gửi muộn cần
   xác nhận, tâm trạng chung, em nào cần để ý.
3. Phụ huynh xem báo cáo trưởng thành của con.

## Người dùng

| Vai | Bối cảnh dùng thật | Ràng buộc thiết kế rút ra |
|---|---|---|
| Học sinh THCS (11–15 tuổi) | Điện thoại, 5–10 giây trước giờ vào lớp, sân trường ồn | Chạm to, ít chữ, một hành động chính mỗi màn |
| Giáo viên chủ nhiệm | Điện thoại lẫn laptop, 2 phút đầu giờ, vừa đi vừa xem | Thông tin quan trọng nhất nằm trên màn hình đầu, không cần cuộn |
| Phụ huynh | Điện thoại, buổi tối, phần lớn không rành công nghệ | Không thuật ngữ, không yêu cầu thao tác nhiều bước |
| Tâm lý cụm, BGH, quản trị | Laptop, xem theo tuần | Dữ liệu tổng hợp, không tra cứu cá nhân |

## Nguyên tắc thiết kế đã chốt

1. **Một cửa vào chung.** Không tạo "trang chủ riêng cho từng vai trò". Phân quyền nằm ở mini app.
2. **Ít chữ, hình thể thay lời nói.** Một icon + 5 từ diễn đạt được thì không viết hai câu.
3. **Trắng là nền chủ đạo**; màu dồn vào icon, nút, trạng thái, header.
4. **Cả hai khung cho mọi người.** Học sinh cũng dùng desktop, người lớn cũng dùng mobile.
5. **Hai giọng, không trộn.** Học sinh và phụ huynh chỉ thấy giọng "Glow & Grow" (tỏa sáng, đang lớn
   lên). Từ vựng vận hành — *cờ, ngưỡng, leo thang, định mức* — CHỈ xuất hiện trong buồng lái, tâm lý
   cụm, điều hành. Đây là ràng buộc đạo đức, không phải sở thích văn phong.

## Ràng buộc không thương lượng

- **Dữ liệu trẻ em, chịu Luật 91/2025.** Mood và check-in cảm xúc **chỉ chính em và tâm lý cụm** đọc
  được (`core.can_read_mood()` = `is_me ∨ in_my_cluster`, migration 0044, ADR-026 — quyết định chủ
  đầu tư 01/08/2026). Nhãn `lock` ngay tại chỗ nhập là **"Chỉ thầy cô tâm lý đọc"**, in từ hằng số
  dùng chung `NHAN_AI_DOC_CAM_XUC` (`apps/hub/components/ui/labels.ts`) chứ không chép tay ở từng
  màn. Nhãn phải kể ĐÚNG số vai đọc được: nói thiếu một vai hay thừa một vai đều là nói dối, chỉ
  khác nhau ở chỗ khó bắt.
  *Lịch sử để không ai chép nhầm lại:* câu này đã đổi ba lần trong ngày 01/08/2026 — "Chỉ thầy cô
  chủ nhiệm thấy" (trước 0038) → "Chỉ thầy cô chủ nhiệm và thầy cô tâm lý thấy" (0038) → câu hiện
  tại (0044). Cả hai câu cũ **đã sai**.
- **Giáo viên chủ nhiệm không mất tín hiệu, chỉ mất nội dung.** Cô không đọc được ô cảm xúc nữa,
  nhưng **vẫn** nhận cờ "cần để ý" (`care.flags`), **vẫn** thấy đủ cột điểm danh, và **vẫn** nhận
  ngay lời "cần gặp thầy cô". Thẻ "Ai thấy gì của mình?" trong hồ sơ của em phải kể đủ cả hai vế —
  nói gọn thành "cô không thấy gì" là nói quá, và em sẽ tưởng bấm nút cần gặp cũng vô ích.
- **Tín hiệu "cần gặp thầy cô" đi NGAY** (QĐ-2, 01/08/2026): ghi thẳng vào `attendance.help_requests`
  trong cùng lượt gọi, buồng lái đọc bảng đó trực tiếp — không chờ lượt quét đêm. Màn của em chỉ được
  báo "đã gửi" khi máy chủ đã nhận thật; nằm trong hàng đợi offline thì phải nói là **chưa** gửi được.
- **Ghi chú tư vấn tâm lý**: GVCN và phụ huynh không xem được, luôn hiện badge `visibility_off`.
- **Lời nhắn "cần gặp thầy cô"**: chính em, giáo viên chủ nhiệm của em, và tâm lý cụm đọc được
  (`help_requests_scope`, 0037). Bạn cùng lớp, thầy cô dạy môn, thầy cô lớp khác, bố mẹ, BGH: không.
- **Cờ cảnh báo chỉ ghi loại tín hiệu**, không sao chép nội dung tâm sự của trẻ.
- **Care engine chạy ngầm**, không bao giờ hiện như một mini app với học sinh.
- Trạng thái nghiệp vụ phải phân biệt rõ: **gửi muộn ≠ vắng**; **chưa điểm danh ≠ vắng** (QĐ-3,
  01/08/2026 — bảng của cô hiện đủ năm trạng thái, và lịch của chính em cũng phải phân biệt được
  chừng đó); **"lớp ổn" ≠ thiếu dữ liệu**.

## Chống tham chiếu (anti-references)

- **Không giống dashboard SaaS.** Không thẻ số liệu khổng lồ kèm mũi tên tăng trưởng, không biểu đồ
  cho đẹp. Mỗi con số phải trả lời một câu hỏi giáo viên thật sự hỏi lúc 7 giờ sáng.
- **Không giống app chấm công.** Đây là chăm sóc, không phải giám sát. Không xếp hạng học sinh,
  không bảng thi đua, không "điểm chuyên cần" kiểu KPI.
- **Không giống mạng xã hội học đường.** Không tim, không thả cảm xúc công khai, không so sánh
  giữa các em.
- **Không dùng emoji làm icon giao diện.** Emoji chỉ được xuất hiện trong lời chào học sinh, tiết chế.

## Tiếp cận

- Chạm ≥44px trên mọi nút và tile ở mobile.
- Tương phản chữ ≥4.5:1, **không có ngoại lệ theo cỡ chữ** — câu cũ ở dòng này ("xám nhạt chỉ dùng
  cho caption ≤11px") tự mâu thuẫn với chính vế đứng trước nó và đã bị bỏ ở DESIGN-GUIDELINES §11
  hôm 01/08/2026. Đo trên **mặt nền tệ nhất**, không phải chỉ trên nền trắng.
- Màu không bao giờ là tín hiệu duy nhất — badge và cờ luôn kèm chữ hoặc icon.
- Bốn ô chọn tâm trạng phải có `aria-label`; focus ring hiện rõ khi đi bằng bàn phím.
- Tôn trọng `prefers-reduced-motion`.
