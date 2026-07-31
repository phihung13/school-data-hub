-- 0025_checkins_column_grants.sql
-- BỊT LỖ LEO QUYỀN: học sinh tự duyệt check-in gửi muộn của chính mình.
--
-- Tái hiện được trên máy dev ngày 31/07/2026 (hub_dev, dữ liệu seed):
--
--   select test_support.login_as('…0005');  -- Minh, học sinh
--   update attendance.checkins
--      set status = 'present', confirmed_by = core.current_user_id()
--    where student_id = '…0001' and status = 'queued_late';
--   → UPDATE 1 ; dòng thành present, confirmed_by = CHÍNH EM ĐÓ.
--
-- Vì sao lọt, hai tầng cùng hụt một chỗ:
--   · Tầng DB: `checkins_update_self` (0017) và `checkins_confirm_late` (0014) đều là
--     policy PERMISSIVE. Postgres OR mọi policy permissive cùng lệnh, nên điều kiện
--     UPDATE thật trên bảng là
--        USING      (is_homeroom_of AND status='queued_late') OR is_me
--        WITH CHECK  (status in ('present','late'))            OR is_me
--     — nhánh `is_me` mở toang MỌI CỘT của dòng chính mình, kể cả status/confirmed_by.
--     RLS lọc theo DÒNG, không lọc theo CỘT: 0017 viết thẳng trong comment rằng nó
--     "tin vào code server không đổi status qua đường này". Niềm tin đó là lỗ hổng.
--   · Tầng GRANT: 0014:16 `grant insert, update on attendance.checkins` cấp quyền ghi
--     TOÀN BỘ cột — kể cả occurred_on (dựng lại lịch sử điểm danh) và source (giả chữ
--     'teacher'/'paper' để trông như cô ghi hộ), hai thứ ADR-007 sinh ra để chống.
--   · Tầng API: `care.acknowledgeLate` là protectedProcedure, chỉ hỏi "đã đăng nhập
--     chưa" — vá ở apps/hub/server/routers/care.ts (homeroomProcedure) cùng PR này.
--
-- Vá ở đây hai lớp, cả hai đều ở tầng DB nên không lớp nào phụ thuộc "code server tử tế":
--   1. Thu hẹp GRANT xuống đúng ba cột mà người dùng cuối có việc phải ghi.
--   2. Trigger BEFORE UPDATE gác đúng hai cột quyết định chuyên cần (status,
--      confirmed_by): ai không phải GVCN của em đó thì hàng bị BỎ QUA.
--
-- KHÔNG chọn cách siết `checkins_update_self` thành `using (is_me and status <> 'queued_late')`:
-- nó cho ra 0 dòng đúng như mong muốn, nhưng nhánh ON CONFLICT DO UPDATE của
-- `checkin.submitMood` sẽ NÉM LỖI (Postgres kiểm USING của UPDATE trên hàng đích và
-- raise, không lọc âm thầm) ngay khi em đó có một dòng queued_late trong ngày — tức là
-- em check-in offline xong mở app bấm lại mood là gặp lỗi 500. Đổi một lỗ hổng lấy một
-- lỗi trong luồng thường ngày của học sinh là lỗ vốn.

begin;

-- ---------------------------------------------------------------------------
-- 1. GRANT theo CỘT — thu hẹp bề mặt ghi
-- ---------------------------------------------------------------------------
-- Giữ nguyên `insert` (0014): học sinh tự tạo dòng check-in của mình là đúng luồng,
-- và WITH CHECK của `checkins_insert_self` đã khoá student_id.
revoke update on attendance.checkins from authenticated;
grant update (mood, status, confirmed_by) on attendance.checkins to authenticated;

comment on column attendance.checkins.occurred_on is
  'Cố tình KHÔNG nằm trong grant UPDATE của authenticated (0025): sửa được ngày là dựng lại được lịch sử điểm danh.';
comment on column attendance.checkins.source is
  'Cố tình KHÔNG nằm trong grant UPDATE của authenticated (0025): sửa được source là giả được "cô ghi hộ" (ADR-007).';

-- ---------------------------------------------------------------------------
-- 2. Trigger gác hai cột quyết định chuyên cần
-- ---------------------------------------------------------------------------
-- Vì sao phải là trigger chứ không phải policy: câu hỏi cần trả lời là "cột status có
-- ĐỔI không", mà policy chỉ nhìn được hàng MỚI (WITH CHECK) hoặc hàng CŨ (USING), không
-- so được hai bên. Trigger BEFORE UPDATE là chỗ duy nhất thấy cả OLD lẫn NEW.
create or replace function attendance.guard_checkin_confirmation()
returns trigger
language plpgsql
-- KHÔNG security definer: hàm phải thấy đúng `current_user` của người đang ghi.
as $$
begin
  -- Chỉ gác đường của người dùng cuối. Job nền và adapter chạy bằng vai chủ schema
  -- (withSystemContext) — gác luôn cả họ thì job đánh 'absent' cuối ngày sẽ âm thầm
  -- không ghi được gì: hỏng kiểu im lặng, đúng thứ Rev F điều 3 cấm.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.confirmed_by is distinct from old.confirmed_by then
    if not core.is_homeroom_of(old.student_id) then
      -- Trả NULL = bỏ qua đúng hàng này, KHÔNG ném lỗi. Giữ nguyên ngữ nghĩa mà 0014
      -- đã chốt cho cả bảng này ("RLS lọc theo USING, không ném exception"): người gọi
      -- nhận 0 dòng, y hệt trường hợp không có hàng nào khớp — không có kênh nào để
      -- dò xem mình có quyền hay không.
      return null;
    end if;
  end if;

  return new;
end;
$$;

comment on function attendance.guard_checkin_confirmation() is
  'ADR-007 — chỉ GVCN của em đó mới đổi được status/confirmed_by. Vá lỗ leo quyền tái hiện 31/07/2026 (xem đầu 0025).';

drop trigger if exists checkins_guard_confirmation on attendance.checkins;
create trigger checkins_guard_confirmation
  before update on attendance.checkins
  for each row
  execute function attendance.guard_checkin_confirmation();

-- ---------------------------------------------------------------------------
-- 3. Ghi lại niềm tin đã bị thay bằng cưỡng chế
-- ---------------------------------------------------------------------------
comment on policy checkins_update_self on attendance.checkins is
  'GĐ1 — cho tự sửa lại check-in của chính mình trong ngày (đổi mood). Từ 0025, việc "app chỉ UPDATE cột mood" KHÔNG còn là niềm tin vào code server nữa: grant theo cột + trigger checkins_guard_confirmation cưỡng chế ở tầng DB.';

commit;
