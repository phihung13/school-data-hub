-- 0005_care.sql
-- Mini App care: cờ ABC+E, hồ sơ can thiệp, ngưỡng, leo thang, ghi chú tư vấn.
--
-- §6: KHÔNG số ngưỡng nào hard-code trong engine — tất cả đọc từ care.thresholds.
-- §9: cờ có khóa duy nhất (student, rule, date) nên chạy lại engine là no-op.
-- ADR-004: if-then, không ML.

begin;

create table care.thresholds (
  rule_code   text primary key,
  params      jsonb not null,
  active      boolean not null default true,
  school_id   uuid references core.schools(id),   -- NULL = áp dụng toàn hệ
  updated_by  uuid references core.users(id),
  updated_at  timestamptz not null default now()
);
comment on table care.thresholds is
  '§6 — đổi ngưỡng KHÔNG cần deploy. Mọi lần đổi có audit (0008).';

insert into care.thresholds (rule_code, params) values
  ('A_ATTENDANCE', '{"window_days": 30, "min_rate": 0.90}'),
  ('B_BEHAVIOR',   '{"window_days": 30, "max_incidents": 2}'),
  ('C_MASTERY',    '{"strands": 2, "weeks": 2}'),
  ('C_CEFR',       '{"periods_below_trajectory": 2}'),
  ('E_MOOD',       '{"negative_days_streak": 5}'),
  ('E_URGENT',     '{"help_request": true, "tutor_minutes_drop_pct": 60}');

create table care.care_cases (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references core.students(id) on delete cascade,
  owner_id     uuid references core.users(id),
  tier         smallint not null default 2,
  status       text not null default 'open',
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  constraint care_cases_tier_chk   check (tier between 1 and 3),
  constraint care_cases_status_chk check (status in ('open', 'closed'))
);
comment on column care.care_cases.owner_id is
  'Gán MỘT LẦN lúc tạo. Các lần quét sau chỉ gắn thêm cờ, không đổi chủ — kể cả khi đã chuyển tâm lý cụm.';

-- Một em chỉ có một hồ sơ đang mở: "một em một đầu mối" (luật gộp cờ).
create unique index care_cases_one_open_idx
  on care.care_cases (student_id) where status = 'open';
create index care_cases_owner_idx
  on care.care_cases (owner_id) where status = 'open';

create table care.flags (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references core.students(id) on delete cascade,
  rule_code   text not null references care.thresholds(rule_code),
  as_of_date  date not null,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  -- §9: chạy lại engine trong cùng đêm là no-op.
  constraint flags_uq unique (student_id, rule_code, as_of_date)
);
comment on column care.flags.detail is
  'Luật "cờ E gọn": chỉ số đo và loại tín hiệu. TUYỆT ĐỐI không sao chép nội dung tâm sự vào đây.';

create index flags_student_idx on care.flags (student_id, as_of_date desc);

-- Bảng nối flags ↔ cases. Tên này là thứ 0012 gắn trigger chặn cờ nạp bù.
create table care.care_case_flags (
  case_id     uuid not null references care.care_cases(id) on delete cascade,
  flag_id     uuid not null references care.flags(id) on delete cascade,
  attached_at timestamptz not null default now(),
  primary key (case_id, flag_id)
);

create table care.interventions (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references care.care_cases(id) on delete cascade,
  actor_id     uuid not null references core.users(id),
  action       text not null,
  note         text,
  occurred_at  timestamptz not null default now()
);
comment on table care.interventions is
  'Ghi lại việc CON NGƯỜI đã làm. Có dòng ở đây = case không còn "đo rồi để đó", đồng hồ leo thang 7 ngày reset.';

create index interventions_case_idx on care.interventions (case_id, occurred_at desc);

create table care.escalations (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references care.care_cases(id) on delete cascade,
  escalated_on  date not null,
  reason        text not null default 'no_action_7d',
  constraint escalations_uq unique (case_id, escalated_on)  -- §9
);

create table care.counselor_notes (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references care.care_cases(id) on delete cascade,
  author_id   uuid not null references core.users(id),
  body        text not null,
  created_at  timestamptz not null default now()
);
comment on table care.counselor_notes is
  '§3 — lưu như dữ liệu thường, KHÔNG mã hóa. §5 — bộ sinh báo cáo học thuật bị chặn khỏi bảng này (0009).';

commit;
