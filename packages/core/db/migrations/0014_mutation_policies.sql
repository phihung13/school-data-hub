-- 0014_mutation_policies.sql
-- Đường ghi cho router tRPC (03-api.md §"Đường 1") — 0001-0012 mới có RLS/grant
-- cho chiều ĐỌC (0009). Chiều GHI (check-in, help_request, ghi can thiệp) chưa có
-- policy/grant nào nên `authenticated` không tự thêm được dòng nào — đúng ý lúc
-- schema mới xây (fail closed), nhưng GĐ1 (apps/hub) cần các đường ghi này chạy thật.
--
-- Nguyên tắc: KHÔNG cấp ghi rộng hơn RLS đọc đã định nghĩa ở 0009 — chỉ mở đúng
-- luồng GĐ1 cần (§3, DESIGN-GUIDELINES): tự check-in, tự bấm cần gặp thầy cô,
-- GVCN xác nhận gửi muộn, GVCN/tâm lý ghi can thiệp.

begin;

-- ---------------------------------------------------------------------------
-- attendance.checkins — tự check-in (mood/điểm danh), GVCN xác nhận gửi muộn.
-- ---------------------------------------------------------------------------
grant insert, update on attendance.checkins to authenticated;

create policy checkins_insert_self on attendance.checkins for insert to authenticated
  with check (core.is_me(student_id));
comment on policy checkins_insert_self on attendance.checkins is
  'GĐ1 — chỉ tự check-in cho chính mình. GVCN ghi hộ điểm danh (source=teacher) chưa cần ở GĐ1, không mở ở đây.';

-- Chỉ được đổi TỪ queued_late, và chỉ homeroom teacher của em đó (P4 "Xác nhận cả 3").
create policy checkins_confirm_late on attendance.checkins for update to authenticated
  using (core.is_homeroom_of(student_id) and status = 'queued_late')
  with check (status in ('present', 'late'));
comment on policy checkins_confirm_late on attendance.checkins is
  'ADR-007 — gửi muộn ≠ vắng: chỉ GVCN được xác nhận, chỉ chuyển sang present/late, không tự ý sang absent.';

-- ---------------------------------------------------------------------------
-- attendance.help_requests — nút "cần gặp thầy cô".
-- ---------------------------------------------------------------------------
grant insert on attendance.help_requests to authenticated;

create policy help_requests_insert_self on attendance.help_requests for insert to authenticated
  with check (core.is_me(student_id));

-- ---------------------------------------------------------------------------
-- care.care_cases / care.interventions — P4 "Ghi can thiệp".
-- Flag engine (04-flag-engine.md) CHƯA chạy (chưa xây job) nên GĐ1 mở case bằng
-- tay khi GVCN/tâm lý chủ động ghi can thiệp — không tự động hoá trước khi có job thật.
-- ---------------------------------------------------------------------------
grant insert on care.care_cases to authenticated;

create policy care_cases_insert_scope on care.care_cases for insert to authenticated
  with check (core.can_see_care(student_id));
comment on policy care_cases_insert_scope on care.care_cases is
  'GĐ1: GVCN/tâm lý cụm tự mở case khi ghi can thiệp thủ công. care_cases_one_open_idx (0005) đã chặn mở case thứ hai khi case còn mở.';

grant insert on care.interventions to authenticated;

create policy interventions_insert_scope on care.interventions for insert to authenticated
  with check (
    actor_id = core.current_user_id()
    and exists (
      select 1 from care.care_cases c
       where c.id = case_id and core.can_see_care(c.student_id)
    )
  );
comment on policy interventions_insert_scope on care.interventions is
  'actor_id phải đúng người đang đăng nhập (không ghi hộ tên người khác) và chỉ trong phạm vi care của mình.';

commit;
