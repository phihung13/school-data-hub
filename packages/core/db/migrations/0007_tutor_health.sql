-- 0007_tutor_health.sql
-- tutor  = ảnh chụp học thuật từ hệ ngoài (Hub KHÔNG phải chủ dữ liệu này)
-- health = y tế, vùng nhạy cảm nhất, RLS chặt hơn mọi schema khác (ADR-009)

begin;

-- ---------------------------------------------------------------------------
-- tutor: Hub chỉ giữ bản sao chỉ-đọc + dấu thời gian.
-- Luật: dữ liệu Hub không phải chủ thì KHÔNG có màn hình sửa trong Hub.
-- ---------------------------------------------------------------------------
create table tutor.mastery_snapshots (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references core.students(id) on delete cascade,
  strand_code   text not null,
  mastery       numeric(5,2),
  practice_min  integer,
  as_of_date    date not null,
  fetched_at    timestamptz not null default now(),
  constraint mastery_snapshots_uq unique (student_id, strand_code, as_of_date)
);
comment on table tutor.mastery_snapshots is
  'System of Record là AI Tutor, không phải Hub. Read-only; mọi màn hình dùng bảng này phải in "dữ liệu tính đến HH:mm".';

create table tutor.cefr_results (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references core.students(id) on delete cascade,
  period_code  text not null,
  level        text not null,
  as_of_date   date not null,
  constraint cefr_results_uq unique (student_id, period_code)
);

create table tutor.cefr_trajectories (
  student_id      uuid not null references core.students(id) on delete cascade,
  period_code     text not null,
  expected_level  text not null,
  primary key (student_id, period_code)
);

create table tutor.milestones (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references core.students(id) on delete cascade,
  milestone_code text not null,
  achieved_on    date,
  evidence_url   text,
  constraint milestones_uq unique (student_id, milestone_code)
);
comment on table tutor.milestones is 'CEFR, IELTS, ICDL, bơi, AI literacy — các mốc cam kết đầu ra.';

create table tutor.moodle_progress (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references core.students(id) on delete cascade,
  course_code   text not null,
  completion    numeric(5,2),
  as_of_date    date not null,
  fetched_at    timestamptz not null default now(),
  constraint moodle_progress_uq unique (student_id, course_code, as_of_date)
);

-- ---------------------------------------------------------------------------
-- health: ADR-009. Giáo viên bộ môn KHÔNG đọc được (0009).
-- Vùng mở/vibe team chỉ chạm qua contract, không chạm schema (RULES Rev B/C #1).
-- ---------------------------------------------------------------------------
create table health.logs (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references core.students(id) on delete cascade,
  logged_on    date not null,
  category     text not null,
  detail       jsonb not null default '{}',
  recorded_by  uuid not null references core.users(id),
  created_at   timestamptz not null default now(),
  constraint health_logs_uq unique (student_id, logged_on, category)
);
comment on table health.logs is
  'ADR-009 — y tế bán trú. Mọi lượt ĐỌC bảng này đều ghi audit (0008), khác với dữ liệu thường.';

create table health.meal_sleep_logs (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references core.students(id) on delete cascade,
  logged_on   date not null,
  meal_note   text,
  sleep_min   smallint,
  created_at  timestamptz not null default now(),
  constraint meal_sleep_logs_uq unique (student_id, logged_on)
);
comment on table health.meal_sleep_logs is
  'Ăn/ngủ bán trú. Nhẹ hơn health.logs nhưng vẫn trong schema health — phụ huynh xem con mình, giáo viên bộ môn không.';

commit;
