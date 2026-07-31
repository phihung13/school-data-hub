-- 0035_counselor_notes_scope.sql
-- Siết `care.counselor_notes` về đúng lời hứa đã in trong hồ sơ.
--
-- ── Cái sai đang chạy trên production-dev ───────────────────────────────────
-- 0009:222-224 viết:
--
--     -- Ghi chú tư vấn: hẹp nhất trong care.
--     create policy counselor_notes_scope on care.counselor_notes for select ...
--       using (exists (select 1 from care.care_cases c
--                       where c.id = case_id and core.can_see_care(c.student_id)));
--
-- Chú thích nói "hẹp nhất trong care", nhưng điều kiện thì y hệt `flags_scope` và
-- `care_cases_scope` ngay phía trên — cùng một `core.can_see_care()` =
-- `is_homeroom_of OR in_my_cluster`. Nghĩa là GVCN đọc được NGUYÊN VĂN buổi tư vấn
-- tâm lý của học sinh lớp mình: không phải "có tín hiệu", mà từng câu em kể.
--
-- Hai văn bản đã duyệt nói ngược lại:
--   · DESIGN-GUIDELINES §9: "Ghi chú tư vấn (Tâm lý cụm): GVCN & PH không xem được
--     — luôn hiện badge visibility_off."
--   · CLAUDE.md mệnh lệnh 4: dữ liệu cảm xúc không được lọt ra ngoài phạm vi đã hứa
--     với đứa trẻ.
--
-- Đứa trẻ ngồi với cô tâm lý được hứa rằng chuyện này không quay về lớp. Policy cũ
-- biến lời hứa đó thành lời nói dối mà không ai trong hệ thống nhận ra, vì nó im
-- lặng: không lỗi, không log, chỉ là một hàng dữ liệu hiện ra đúng nơi không nên hiện.
--
-- ── Phạm vi mới ────────────────────────────────────────────────────────────
--   1. TÁC GIẢ — người viết luôn đọc lại được ghi chú của chính mình, kể cả sau này
--      phạm vi cụm có đổi. Không có nhánh này thì một lần điều chuyển cơ sở là cô
--      tâm lý mất luôn hồ sơ do chính tay mình ghi.
--   2. TÂM LÝ CỤM — `core.in_my_cluster()` (0009:57) đã tự mang sẵn điều kiện
--      `role_code = 'counselor'` trong nó, nên gọi thẳng hàm này là đủ và KHÔNG cần
--      thêm `core.has_role('counselor')`.
--
-- Cố ý KHÔNG dùng `core.can_see_care()`: hàm đó là phạm vi của cờ và hồ sơ chăm sóc
-- (GVCN phải thấy để hành động), không phải phạm vi của nội dung buổi tư vấn. Dùng
-- chung một hàm cho hai câu hỏi khác nhau chính là cách lỗi này sinh ra lần đầu —
-- siết một chỗ tưởng là siết cả hai, mà thật ra không chỗ nào siết.
--
-- GVCN mất gì: không mất tín hiệu nào. `care.flags`, `care.care_cases`,
-- `care.interventions` (nhật ký hành động) vẫn nguyên phạm vi cũ — cô vẫn thấy "em
-- này đang có hồ sơ chăm sóc mở" và "tâm lý cụm đã gặp em". Thứ duy nhất đóng lại là
-- NỘI DUNG buổi tư vấn.

begin;

drop policy if exists counselor_notes_scope on care.counselor_notes;

create policy counselor_notes_scope on care.counselor_notes for select to authenticated
  using (
    author_id = core.current_user_id()
    or exists (
      select 1
        from care.care_cases c
       where c.id = case_id
         and core.in_my_cluster(c.student_id)
    )
  );

comment on policy counselor_notes_scope on care.counselor_notes is
  'DESIGN-GUIDELINES §9 + CLAUDE.md mệnh lệnh 4: chỉ TÁC GIẢ và TÂM LÝ CỤM đọc được nội dung buổi tư vấn. GVCN/phụ huynh/BGH KHÔNG — họ thấy cờ và nhật ký hành động (care.flags/interventions), không thấy lời em kể. KHÔNG được đổi về core.can_see_care(): hàm đó gồm cả is_homeroom_of.';

commit;
