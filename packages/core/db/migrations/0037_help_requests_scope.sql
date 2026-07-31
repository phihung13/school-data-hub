-- 0037_help_requests_scope.sql
-- Siết `attendance.help_requests` về đúng lời hứa ĐANG IN TRÊN MÀN HÌNH của học sinh.
--
-- ── Cái sai đang chạy trên hub_dev (đo lại được, 31/07/2026) ────────────────
-- 0009:150-176 áp policy cho 16 bảng gắn học sinh bằng MỘT vòng lặp, tất cả cùng
-- một điều kiện:
--
--     create policy %I_scope on %I.%I for select to authenticated
--       using (core.can_see_student(student_id))
--
-- `attendance.help_requests` nằm trong danh sách đó. Nhưng `core.can_see_student()`
-- (0009:114) là hợp của SÁU nhánh — trong đó có `is_my_child` và `principal_of`.
-- Nghĩa là phiên `authenticated` của phụ huynh và của hiệu trưởng cơ sở SELECT được
-- bản ghi help_requests của em, **kể cả cột `note`** — tức nguyên văn lời em viết
-- khi bấm "cần gặp thầy cô".
--
-- Đo thật trên hub_dev trước khi vá (phiên sub = phụ huynh của Minh):
--     select count(*), max(note) from attendance.help_requests
--      where student_id = '70000000-…-0001';
--     → 1 dòng, đọc ra đúng nội dung lời nhắn.
--
-- Trong khi màn hình `/can-gap-thay-co` IN CHỮ cho em đọc, ngay tại chỗ nhập
-- (`apps/hub/components/help-request-view.tsx:292`):
--
--     "Bạn cùng lớp · thầy cô khác · bố mẹ — KHÔNG nhìn thấy"
--
-- Lời hứa in trên màn hình là RÀNG BUỘC KỸ THUẬT, không phải lời quảng cáo. Hôm nay
-- không còn đường code nào phơi dữ liệu này ra (`report.ts:5` đã cố ý không đọc
-- bảng, `care.ts` chỉ đọc dưới phiên GVCN/tâm lý cụm), nên lời hứa đang được giữ
-- BẰNG KỶ LUẬT TẦNG ỨNG DỤNG chứ không bằng tầng dữ liệu. Tính năng sau viết đúng
-- một câu `select … from attendance.help_requests` dưới phiên phụ huynh là lộ lại,
-- và lộ trong im lặng: không lỗi, không log, chỉ là một hàng dữ liệu hiện ra đúng
-- nơi đã hứa là sẽ không hiện.
--
-- ── Phạm vi mới ────────────────────────────────────────────────────────────
--   1. CHÍNH EM — `core.is_me()`. Bắt buộc giữ, hai lý do: em phải xem lại được
--      yêu cầu mình vừa gửi, và nhánh `on conflict do update … where handled_at is
--      null` của `checkin.requestHelp` (0020) đọc dòng cũ để quyết định có ghi đè.
--   2. VÙNG CHĂM SÓC — `core.can_see_care()` = `is_homeroom_of OR in_my_cluster`.
--      Đúng hai vai mà màn hình hứa: GVCN của em, và phòng tâm lý khi được chuyển
--      tiếp. Cũng đúng bằng phạm vi của policy UPDATE `help_requests_handle_care`
--      (0026:195) — người bấm "đã gặp em rồi" và người đọc được lời nhắn là cùng
--      một tập, không còn cảnh ghi-được-mà-không-đọc-được (hay ngược lại).
--
-- Cố ý KHÔNG dùng `core.can_see_student()`: hàm đó trả lời câu hỏi "em này có thuộc
-- tầm quản lý của tôi không" — đúng cho danh sách lớp, điểm số, điểm danh. Nó KHÔNG
-- phải câu trả lời cho "ai được đọc lời em kể". Dùng chung một hàm cho hai câu hỏi
-- khác nhau chính là cách lỗi này (và lỗi song sinh của nó ở 0035 trên
-- `care.counselor_notes`) sinh ra: sửa một chỗ tưởng là sửa cả hai, mà thật ra
-- không chỗ nào đúng.
--
-- ── Ai mất gì ──────────────────────────────────────────────────────────────
-- · Phụ huynh: mất quyền đọc bảng này. Đây là điểm chính của lần vá. Phụ huynh vẫn
--   thấy Báo cáo Trưởng thành và vẫn được GVCN liên hệ khi cần — thứ đóng lại là
--   khả năng đọc lén lời con viết cho cô mà con không biết.
-- · Giáo viên bộ môn, hiệu trưởng, quản trị: mất quyền đọc. `care.v_signal_emotion`
--   (0009, viết lại 0026) vẫn ĐẾM tín hiệu chứ không đọc `note`, nên mọi số tổng
--   hợp và mọi cờ vẫn nguyên — cờ E_URGENT không mang theo nội dung, chưa bao giờ.
-- · GVCN và tâm lý cụm: KHÔNG mất gì. Buồng lái (`care.getDashboard`), danh sách
--   lớp (`care.getClassRoster`) và nút "đã gặp em rồi" đều chạy dưới hai vai này.

begin;

drop policy if exists help_requests_scope on attendance.help_requests;

create policy help_requests_scope on attendance.help_requests for select to authenticated
  using (
    core.is_me(student_id)
    or core.can_see_care(student_id)
  );

comment on policy help_requests_scope on attendance.help_requests is
  'Lời hứa in tại apps/hub/components/help-request-view.tsx ("bạn cùng lớp · thầy cô khác · bố mẹ — không nhìn thấy") được cưỡng chế ở tầng dữ liệu: chỉ CHÍNH EM và VÙNG CHĂM SÓC (GVCN của em + tâm lý cụm) đọc được, trùng đúng phạm vi policy UPDATE help_requests_handle_care (0026). KHÔNG được đổi về core.can_see_student(): hàm đó gồm cả is_my_child và principal_of.';

commit;
