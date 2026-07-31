-- 0008_staging_ops.sql
-- staging = phòng chờ cho MỌI nguồn ngoài (§8). Không có đường nào khác vào schema nghiệp vụ.
-- ops     = hệ có đang sống không: job, nhịp tim, hộp thư đi, audit.

begin;

-- ---------------------------------------------------------------------------
-- staging: connector chỉ được INSERT vào đây, không hơn.
-- ---------------------------------------------------------------------------
create table staging.raw_tutor_events (
  id           bigserial primary key,
  source       text not null default 'tutor',
  external_id  text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  promoted_at  timestamptz,
  constraint raw_tutor_events_uq unique (source, external_id)
);

create table staging.raw_moodle (
  id           bigserial primary key,
  source       text not null default 'moodle',
  external_id  text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  promoted_at  timestamptz,
  constraint raw_moodle_uq unique (source, external_id)
);

create table staging.raw_cor_imports (
  id           bigserial primary key,
  source       text not null default 'cor',
  external_id  text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  promoted_at  timestamptz,
  constraint raw_cor_imports_uq unique (source, external_id)
);

create table staging.raw_embedded_events (
  id           bigserial primary key,
  source       text not null,                     -- 'embed:<app-id>'
  external_id  text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  promoted_at  timestamptz,
  constraint raw_embedded_events_uq unique (source, external_id),
  -- ADR-017: từ chối ngay ở tầng DB nếu app ngoài không gửi external_id.
  -- Thiếu ràng buộc này thì §9 chỉ còn trên giấy đối với nguồn ngoài.
  constraint raw_embedded_external_id_chk check (length(trim(external_id)) > 0),
  constraint raw_embedded_source_chk      check (source like 'embed:%')
);
comment on table staging.raw_embedded_events is
  'ADR-015/017 — webhook từ Mini App ngoài. Đối xử y hệt Tutor/Moodle/COR, không có đường ghi thứ ba.';

create table staging.import_errors (
  id           bigserial primary key,
  source       text not null,
  raw_id       bigint,
  external_id  text,
  reason       text not null,
  payload      jsonb,
  retry_state  text not null default 'pending',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  constraint import_errors_retry_chk check (retry_state in ('pending', 'retrying', 'resolved', 'dropped'))
);
comment on table staging.import_errors is
  '§8 — không map được mã học sinh thì nằm ở đây chờ NGƯỜI xử, tuyệt đối không tự đoán. Một dòng lỗi không chặn dòng sạch.';

create index import_errors_pending_idx on staging.import_errors (source, created_at)
  where retry_state = 'pending';

-- ---------------------------------------------------------------------------
-- ops
-- ---------------------------------------------------------------------------
create table ops.job_runs (
  id            bigserial primary key,
  job_name      text not null,
  rule_version  text,
  as_of_date    date,
  mode          text not null default 'live',
  status        text not null default 'running',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  freshness_at  timestamptz,
  metrics       jsonb not null default '{}',
  constraint job_runs_mode_chk   check (mode in ('live', 'backfill')),
  constraint job_runs_status_chk check (status in ('running', 'success', 'failed'))
);
comment on table ops.job_runs is
  'Tên chuẩn DUY NHẤT cho sổ nhật ký chạy máy (thống nhất 27/07/2026). Cột degraded_sources thêm ở 0011.';

create index job_runs_recent_idx on ops.job_runs (job_name, started_at desc);

create table ops.heartbeats (
  source        text primary key,
  last_beat_at  timestamptz not null default now(),
  detail        jsonb not null default '{}'
);

create table ops.outbox_messages (
  id           bigserial primary key,
  channel      text not null,
  dedup_key    text not null unique,          -- §9: retry không gửi trùng
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  attempts     smallint not null default 0,
  last_error   text
);
comment on table ops.outbox_messages is
  '§9 — ghi CÙNG transaction với dữ liệu nghiệp vụ. Chỉ gửi khi claim được dòng chưa sent.';

create index outbox_pending_idx on ops.outbox_messages (created_at) where sent_at is null;

-- Audit: ai chạm vùng nhạy cảm, lúc nào, kết quả gì.
create table ops.audit_log (
  id           bigserial primary key,
  actor_id     uuid references core.users(id),
  action       text not null,
  object_type  text not null,
  object_id    text,
  scope        jsonb not null default '{}',
  result       text not null default 'ok',
  occurred_at  timestamptz not null default now()
);
comment on table ops.audit_log is
  'Bắt buộc cho care, health, admin và mọi lần cấp token OIDC. Câu hỏi phải trả lời được: ai · làm gì · phạm vi nào · khi nào · kết quả.';

create index audit_log_actor_idx  on ops.audit_log (actor_id, occurred_at desc);
create index audit_log_object_idx on ops.audit_log (object_type, object_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- §8 cưỡng chế ở tầng quyền database, không chỉ ở tầng code
-- ---------------------------------------------------------------------------
grant usage on schema staging to connector;
grant insert on staging.raw_tutor_events, staging.raw_moodle,
                staging.raw_cor_imports, staging.raw_embedded_events to connector;
-- Cố tình KHÔNG cấp SELECT/UPDATE/DELETE, và KHÔNG cấp gì trên schema nghiệp vụ:
-- connector bị rò khóa cũng không đọc được dữ liệu học sinh, không sửa được kho chính.

commit;
