-- 0017_checkins_self_update.sql
-- Phát hiện khi chạy thật GĐ1: `checkin.submitMood` dùng
-- `insert ... on conflict (student_id, occurred_on, kind) do update set mood = ...`
-- để bấm lại trong ngày chỉ đổi mood (§9, idempotent) — nhưng nhánh UPDATE của
-- ON CONFLICT cần một RLS policy UPDATE riêng, khác hẳn `checkins_confirm_late`
-- (0014, chỉ cho GVCN đổi status của bản queued_late). Thiếu policy này thì mọi
-- học sinh bấm check-in lần 2 trong ngày đều bị chặn bởi RLS.

begin;

create policy checkins_update_self on attendance.checkins for update to authenticated
  using (core.is_me(student_id))
  with check (core.is_me(student_id));
comment on policy checkins_update_self on attendance.checkins is
  'GĐ1 — cho phép tự sửa lại check-in của chính mình trong ngày (đổi mood). App chỉ UPDATE cột mood ở đây (server/routers/checkin.ts); RLS này lọc theo dòng chứ không theo cột, tin vào code server không đổi status qua đường này.';

commit;
