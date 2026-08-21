-- 0067_bypassrls_khong_ke_thua.sql
-- Sửa một điều SAI trong `0066` — sai về hiểu biết, không phải về gõ nhầm, nên đáng ghi
-- dài hơn một dòng.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ĐO ĐƯỢC GÌ
-- ═══════════════════════════════════════════════════════════════════════════
-- `0066` tạo `metabase_doc_rong` với `BYPASSRLS`, rồi hướng dẫn người vận hành tạo một
-- vai đăng nhập và `grant metabase_doc_rong to <vai đó>`. Đo ngay sau khi áp, dưới đúng
-- vai đăng nhập ấy:
--
--     select count(*) from attendance.checkins where mood is not null
--       · vai đăng nhập ĐƯỢC CẤP nhóm  →   0 dòng
--       · vai đăng nhập TỰ MANG bypassrls → 538 dòng
--
-- ═══════════════════════════════════════════════════════════════════════════
-- VÌ SAO
-- ═══════════════════════════════════════════════════════════════════════════
-- **Thuộc tính vai (`SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `LOGIN`…) KHÔNG kế thừa qua
-- membership.** Chỉ QUYỀN (grant trên bảng/schema) mới kế thừa. Nên `BYPASSRLS` đặt
-- trên một vai `NOLOGIN` dùng làm nhóm thì **không có tác dụng gì với ai cả**.
--
-- Đây đúng loại sai mà kho này đã đặt tên nhiều lần: một trạng thái **hợp lệ trên giấy**.
-- Vai có cờ, `\du` in ra cờ, người đọc yên tâm — và hàng rào thì không đứng ở đâu. Tệ
-- hơn: nếu không ai đo, người vận hành sẽ thấy Metabase đọc ra bảng trống và "sửa" bằng
-- cách gần nhất trong tầm tay, thường là cấp `SUPERUSER`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CÁCH SỬA
-- ═══════════════════════════════════════════════════════════════════════════
-- Gỡ `BYPASSRLS` khỏi vai nhóm (nó không làm gì, và một cờ vô dụng là một lời hứa sai),
-- và chuyển nghĩa vụ ấy vào ĐÚNG chỗ nó phải nằm: vai ĐĂNG NHẬP mà người vận hành tạo.
-- Thủ tục đầy đủ + câu lệnh nghiệm thu nằm ở `07-operations.md` mục "Cắm Metabase" —
-- kèm một phép đo bắt buộc, để lần sau không ai phải phát hiện lại điều này.

begin;

alter role metabase_doc_rong nobypassrls;

comment on role metabase_doc_rong is
  'ADR-039 — vai NHÓM giữ QUYỀN ĐỌC cho Metabase (grant select trên 8 schema nghiệp vụ + default privileges). CỐ Ý KHÔNG có BYPASSRLS: thuộc tính vai không kế thừa qua membership nên đặt ở đây là vô nghĩa (đo 21/08/2026: 0 dòng vs 538 dòng — xem 0067). Vai ĐĂNG NHẬP của Metabase phải TỰ mang BYPASSRLS, và chính nó là chỗ mọi policy ngừng hiệu lực. Hàng rào thật quanh dữ liệu nhạy cảm từ đây là DANH SÁCH NGƯỜI có tài khoản Metabase — BGH duyệt, rà mỗi học kỳ (07-operations.md).';

commit;
