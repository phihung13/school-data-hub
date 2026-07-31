-- 0006_evidence.sql
-- Mini App evidence: dấu chân hoạt động làm nên chuỗi bằng chứng 12 năm.
-- 25 hành vi 5 Giá trị · vai trò sự kiện · phản tư PDR · DEAR · rubric PBL · fitness · CLB · khảo sát.
--
-- Mọi bảng FK thẳng về core.students.id (§1), mọi bảng có khóa duy nhất tự nhiên (§9).

begin;

create table evidence.value_behaviors (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references core.students(id) on delete cascade,
  behavior_code text not null,
  week_start    date not null,
  self_score    smallint,
  confirmed_by  uuid references core.teachers(id),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint value_behaviors_uq unique (student_id, behavior_code, week_start),
  constraint value_behaviors_score_chk check (self_score is null or self_score between 0 and 3)
);
comment on table evidence.value_behaviors is
  '25 hành vi 5 Giá trị: học sinh tự chấm, giáo viên xác nhận. Hằng tuần.';

create table evidence.event_roles (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references core.students(id) on delete cascade,
  event_code   text not null,
  role         text not null,
  occurred_on  date not null,
  created_at   timestamptz not null default now(),
  constraint event_roles_uq unique (student_id, event_code, role)
);

create table evidence.pdr_reflections (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references core.students(id) on delete cascade,
  period_code  text not null,
  answers      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  constraint pdr_reflections_uq unique (student_id, period_code)
);

create table evidence.dear_logs (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references core.students(id) on delete cascade,
  logged_on   date not null,
  minutes     smallint not null default 0,
  book_title  text,
  created_at  timestamptz not null default now(),
  constraint dear_logs_uq unique (student_id, logged_on),
  constraint dear_logs_minutes_chk check (minutes between 0 and 600)
);
comment on table evidence.dear_logs is
  'Sổ tay đọc sách. Đây là bảng mà Mini App ngoài Tier 2 đầu tiên được phép ghi (ADR-017, rổ Vàng).';

create table evidence.rubric_scores (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references core.students(id) on delete cascade,
  project_code text not null,
  criterion    text not null,
  score        numeric(4,2) not null,
  scored_by    text not null default 'teacher',
  created_at   timestamptz not null default now(),
  constraint rubric_scores_uq unique (student_id, project_code, criterion, scored_by),
  constraint rubric_scores_by_chk check (scored_by in ('teacher', 'self', 'peer'))
);

create table evidence.fitness_tests (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references core.students(id) on delete cascade,
  test_code    text not null,
  period_code  text not null,
  value        numeric(6,2),
  unit         text,
  created_at   timestamptz not null default now(),
  constraint fitness_tests_uq unique (student_id, test_code, period_code)
);
comment on table evidence.fitness_tests is
  'FitnessGram, BMI. ADR-017 rổ VÀNG — app fitness ngoài ghi vào đây qua alias, không bao giờ bằng student_code.';

create table evidence.club_attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references core.students(id) on delete cascade,
  club_code   text not null,
  occurred_on date not null,
  present     boolean not null default true,
  constraint club_attendance_uq unique (student_id, club_code, occurred_on)
);

create table evidence.survey_responses (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references core.students(id) on delete cascade,
  survey_code  text not null,
  period_code  text not null,
  answers      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  constraint survey_responses_uq unique (student_id, survey_code, period_code)
);
comment on table evidence.survey_responses is
  '§5 — khảo sát CASEL/phúc lợi là dữ liệu nhạy cảm: bộ sinh báo cáo học thuật bị chặn khỏi bảng này (0009).';

commit;
