-- 0032_gvcn_screens.sql
-- Đường ghi cho BỐN màn hình GVCN (gói "gvcn-man-hinh"): danh sách lớp, điểm danh
-- lớp, duyệt Báo cáo Trưởng thành, ghi chú can thiệp.
--
-- Ba màn đầu tiên đọc được bằng quyền đã có (0009 mở SELECT theo core.can_see_student).
-- Hai thứ CHƯA có đường nào ở tầng DB, nên không thể "làm ở tầng server" mà không nói dối:
--
--   1. GVCN ghi điểm danh hộ. 0014 chỉ có `checkins_insert_self` (is_me) và
--      `checkins_confirm_late` (chỉ chuyển TỪ queued_late). Nghĩa là: em nào không tự
--      bấm check-in thì KHÔNG có dòng nào, và cô không tạo được dòng đó. Màn "Điểm danh
--      lớp" mà không ghi được vắng/có phép thì chỉ là bảng đọc — đúng loại "menu nói dối"
--      mà gói sidebar vừa dọn xong.
--   2. Duyệt báo cáo. Không có bảng nào lưu quyết định duyệt (grep 'approv' trong
--      0001–0029: 0 kết quả). Báo cáo Trưởng thành hiện sinh thẳng từ dữ liệu thô mỗi
--      lần mở, nên "đã duyệt hay chưa" không có chỗ để tồn tại.
--
-- NGUYÊN TẮC GIỮ NGUYÊN từ 0025: không nới thêm một milimet nào ngoài đúng hai việc trên.
-- Cụ thể, KHÔNG đụng tới grant theo cột của 0025 — `source` và `occurred_on` vẫn nằm
-- ngoài tầm UPDATE của `authenticated`, nên câu upsert ở router chỉ được đặt source lúc
-- INSERT, không được sửa source của dòng đã có (không giả được "cô ghi hộ" trên dòng do
-- app học sinh tạo).
--
-- Phụ thuộc: 0004 (checkins), 0009 (hàm can_see_*, grant schema report), 0014 (policy
-- ghi), 0025 (grant theo cột + trigger guard_checkin_confirmation).

begin;

-- ---------------------------------------------------------------------------
-- 1. GVCN ghi điểm danh hộ cho lớp mình
-- ---------------------------------------------------------------------------
-- Hai policy PERMISSIVE mới, cộng (OR) vào bộ đã có. Vì sao an toàn với lỗ leo quyền
-- đã vá ở 0025: cả hai đều dựng trên `core.is_homeroom_of(student_id)` — học sinh không
-- bao giờ là GVCN của chính mình, nên nhánh mới không thêm đường nào cho em tự duyệt.
-- Trigger `checkins_guard_confirmation` (0025) vẫn là hàng rào thứ hai: đổi
-- status/confirmed_by mà không phải GVCN của em đó thì hàng bị bỏ qua, kể cả khi có
-- policy nào đó cho qua.

drop policy if exists checkins_insert_by_homeroom on attendance.checkins;
create policy checkins_insert_by_homeroom on attendance.checkins for insert to authenticated
  with check (
    core.is_homeroom_of(student_id)
    and kind = 'in'
    -- Cô ghi hộ thì phải MANG DẤU của việc ghi hộ. Không cho GVCN tạo dòng đội lốt
    -- 'app': ADR-007 phân biệt "em tự bấm ở trường" với "cô ghi trên giấy" chính là để
    -- sau này còn truy được nguồn của một ngày chuyên cần.
    and source = 'teacher'
    -- 'queued_late' là trạng thái của hàng đợi offline (máy sinh), không phải thứ con
    -- người ghi tay. Cô ghi thẳng kết quả, không tạo việc chờ duyệt cho chính mình.
    and status in ('present', 'late', 'absent', 'excused')
  );
comment on policy checkins_insert_by_homeroom on attendance.checkins is
  'ADR-007 — GVCN ghi điểm danh hộ (source=teacher). Em không tự check-in thì trước 0032 KHÔNG có dòng nào để ghi vắng.';

drop policy if exists checkins_update_by_homeroom on attendance.checkins;
create policy checkins_update_by_homeroom on attendance.checkins for update to authenticated
  using (core.is_homeroom_of(student_id))
  with check (
    core.is_homeroom_of(student_id)
    and status in ('present', 'late', 'absent', 'excused')
  );
comment on policy checkins_update_by_homeroom on attendance.checkins is
  'Sửa lại điểm danh đã ghi (nhầm tên, em vào muộn sau khi đã đánh vắng). Rộng hơn checkins_confirm_late (chỉ từ queued_late) nhưng vẫn KHÔNG cho chuyển ngược về queued_late, và vẫn bị grant theo cột của 0025 chặn ở occurred_on/source.';

-- ---------------------------------------------------------------------------
-- 2. Sổ duyệt Báo cáo Trưởng thành
-- ---------------------------------------------------------------------------
-- Bảng chỉ lưu QUYẾT ĐỊNH, không lưu nội dung báo cáo: nội dung vẫn sinh lại từ dữ
-- liệu thô mỗi lần mở (report.ts), nên không có bản sao nào để lệch với sự thật.
--
-- §1: student_id FK về core.students. ADR-011: không tạo bản sao thực thể lõi.
-- §5: bảng này KHÔNG chứa dữ liệu cảm xúc và KHÔNG cấp cho role `reporting` — cấp
--     nhầm thì tường lửa chăm sóc ↔ đánh giá thủng theo đường vòng.
create table if not exists report.growth_report_approvals (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references core.students(id) on delete cascade,
  -- Thứ Hai của tuần báo cáo. Chuẩn hoá ở router (mondayOf) và cưỡng chế lại ở đây:
  -- hai người gửi hai ngày khác nhau trong cùng một tuần mà đều lọt thì §9 mất nghĩa —
  -- khoá duy nhất sẽ không còn bắt được lần bấm thứ hai.
  week_start   date not null,
  status       text not null default 'pending',
  reviewer_id  uuid references core.users(id),
  reviewed_at  timestamptz,
  note         text,
  created_at   timestamptz not null default now(),

  -- §9: bấm "Duyệt" hai lần chỉ ra một dòng.
  constraint growth_report_approvals_uq unique (student_id, week_start),
  constraint growth_report_approvals_status_chk check (status in ('pending', 'approved', 'rejected')),
  constraint growth_report_approvals_monday_chk check (extract(isodow from week_start) = 1)
);

comment on table report.growth_report_approvals is
  'Quyết định của GVCN về Báo cáo Trưởng thành một tuần. CHỈ quyết định — nội dung báo cáo vẫn sinh lại từ dữ liệu thô, không sao chép vào đây.';
comment on column report.growth_report_approvals.note is
  'Lý do khi trả lại. KHÔNG chép nội dung tâm sự/mood vào đây (§3, cùng luật với care.flags.detail).';
comment on column report.growth_report_approvals.week_start is
  'Thứ Hai của tuần (ISO). Ràng buộc monday_chk giữ cho khoá duy nhất (student, week) thật sự duy nhất theo TUẦN.';

create index if not exists growth_report_approvals_week_idx
  on report.growth_report_approvals (week_start desc, student_id);

alter table report.growth_report_approvals enable row level security;

-- Ai ĐỌC: đúng tập "được chạm hồ sơ chăm sóc" (GVCN của lớp + tâm lý cụm), KHÔNG phải
-- can_see_student. Cố ý hẹp hơn báo cáo: phụ huynh và học sinh thấy BÁO CÁO, không cần
-- thấy sổ nội bộ ghi "bị trả lại vì lý do X" — hệ chưa có giọng văn nào cho việc đó.
drop policy if exists growth_report_approvals_read on report.growth_report_approvals;
create policy growth_report_approvals_read on report.growth_report_approvals for select to authenticated
  using (core.can_see_care(student_id));

-- Ai GHI: chỉ GVCN của em đó, và chỉ ký được TÊN MÌNH. Không có `reviewer_id` của người
-- khác — chữ ký duyệt mà giả được thì cả sổ này vô nghĩa.
drop policy if exists growth_report_approvals_write on report.growth_report_approvals;
create policy growth_report_approvals_write on report.growth_report_approvals for insert to authenticated
  with check (core.is_homeroom_of(student_id) and reviewer_id = core.current_user_id());

drop policy if exists growth_report_approvals_revise on report.growth_report_approvals;
create policy growth_report_approvals_revise on report.growth_report_approvals for update to authenticated
  using (core.is_homeroom_of(student_id))
  with check (core.is_homeroom_of(student_id) and reviewer_id = core.current_user_id());

grant select, insert, update on report.growth_report_approvals to authenticated;

commit;
