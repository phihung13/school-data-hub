-- 0004_attendance.sql
-- Mini App attendance: check-in cảm xúc + điểm danh + "cần gặp thầy cô".
--
-- §3/ADR-002: mood lưu NHƯ DỮ LIỆU THƯỜNG — không mã hóa, không bảng khóa riêng.
--             Bảo vệ bằng phân quyền chung (0009) + §5 (không dùng để xếp loại)
--             + job xóa chi tiết sau 12 tháng.
-- ADR-007:    điểm danh xác thực bằng IP trường + khung giờ; bản gửi muộn KHÔNG tự tính
--             chuyên cần mà chờ GVCN xác nhận.

begin;

create table attendance.checkin_rules (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references core.schools(id) on delete cascade,
  opens_at     time not null default '06:45',
  closes_at    time not null default '07:30',
  campus_cidrs inet[] not null default '{}',
  active       boolean not null default true,
  updated_at   timestamptz not null default now(),
  constraint checkin_rules_window_chk check (closes_at > opens_at)
);
comment on column attendance.checkin_rules.campus_cidrs is
  'ADR-007 — dải IP của trường. Chứng minh THIẾT BỊ ở trường, không chứng minh em ngồi trong lớp (DEBT #5).';

create table attendance.checkins (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references core.students(id) on delete cascade,
  occurred_on   date not null,
  occurred_at   timestamptz not null default now(),
  kind          text not null default 'in',
  mood          smallint,
  status        text not null default 'present',
  source        text not null default 'app',
  confirmed_by  uuid references core.users(id),
  created_at    timestamptz not null default now(),

  -- §9: double-tap hay retry mạng đều chỉ ra một dòng.
  constraint checkins_uq unique (student_id, occurred_on, kind),
  constraint checkins_kind_chk   check (kind in ('in', 'out')),
  constraint checkins_mood_chk   check (mood is null or mood between 1 and 4),
  constraint checkins_status_chk check (status in ('present', 'late', 'absent', 'excused', 'queued_late')),
  constraint checkins_source_chk check (source in ('app', 'offline_queue', 'paper', 'teacher'))
);

comment on column attendance.checkins.mood is
  '§3 — 4 màu, lưu như dữ liệu thường. §5: bộ sinh báo cáo học thuật KHÔNG được đọc cột này (cưỡng chế ở 0009).';
comment on column attendance.checkins.status is
  'ADR-007 — queued_late: bản đồng bộ muộn từ offline queue, chờ GVCN xác nhận, chưa tính chuyên cần.';

create index checkins_student_date_idx on attendance.checkins (student_id, occurred_on desc);
create index checkins_pending_idx      on attendance.checkins (occurred_on) where status = 'queued_late';

create table attendance.help_requests (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references core.students(id) on delete cascade,
  requested_on date not null,
  requested_at timestamptz not null default now(),
  handled_by   uuid references core.users(id),
  handled_at   timestamptz,
  constraint help_requests_uq unique (student_id, requested_on)
);
comment on table attendance.help_requests is
  'Nút "cần gặp thầy cô". Là tín hiệu E khẩn — chỉ ghi việc em bấm nút, KHÔNG chứa nội dung tâm sự.';

-- Xu hướng tổng hợp giữ lại sau khi chi tiết mood bị xóa ở mốc 12 tháng.
create table attendance.mood_trends (
  student_id    uuid not null references core.students(id) on delete cascade,
  period_month  date not null,
  avg_mood      numeric(3,2),
  sample_count  integer not null default 0,
  primary key (student_id, period_month)
);
comment on table attendance.mood_trends is
  '§3 — lời hứa công khai: chi tiết mood >12 tháng bị xóa, chỉ giữ xu hướng ở đây. Job xóa có test.';

commit;
