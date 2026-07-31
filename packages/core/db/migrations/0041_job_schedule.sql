-- 0041_job_schedule.sql
-- LỊCH CHẠY JOB — ai gọi các job nền, và làm sao biết đêm qua nó có chạy không.
--
-- Vấn đề đang có (đo được, 31/07/2026):
--   · tools/jobs/run-retention.mjs thi hành lời hứa "xoá chi tiết cảm xúc sau 12 tháng"
--     (§3, mệnh lệnh 4, Luật 91/2025) — nhưng `select count(*) from ops.job_runs` trên
--     hub_dev trả về 0. Không ai gọi nó. Lời hứa in cho phụ huynh đọc đang không được
--     thi hành lần nào.
--   · ops.v_homeroom_drift (0030) là "sổ soi lệch GVCN" viết ra để một job giám sát hỏi
--     "còn lệch không" — job đó chưa tồn tại. View nằm im, không ai đọc.
--   · README của tools/jobs tự nêu ra lỗ hổng còn lại: "nếu máy chạy cron chết thì job
--     không chạy và KHÔNG AI BIẾT".
--
-- Ba thứ trên cùng một hình dạng hỏng: IM LẶNG BỊ ĐỌC THÀNH TIN TỐT. Migration này
-- đóng đúng hình dạng đó, không mở rộng thêm:
--
--   1. ops.job_schedule   — sổ khai job nào phải chạy, bao lâu một lần. Có khai thì
--                           mới có cái để so "đáng lẽ đã phải chạy rồi".
--   2. ops.v_job_health   — một dòng một job, có trạng thái. CHƯA CHẠY LẦN NÀO là một
--                           trạng thái riêng, KHÔNG phải 'ok'.
--   3. ops.reap_stale_runs — job chết giữa chừng để lại dòng 'running' treo vĩnh viễn;
--                           hàm này biến nó thành 'failed' THẤY ĐƯỢC, kèm lý do.
--
-- Bài học chép nguyên từ 0011 (ADR-016): CHỈ KHAI JOB ĐÃ CÓ NGƯỜI CHẠY. Khai một job
-- trước khi bộ chạy của nó ra đời là tự bật một dòng "quá hạn" sáng vĩnh viễn ngay từ
-- ngày đầu, và cảnh báo lúc nào cũng sáng là cảnh báo đã chết. Job mới chỉ được thêm
-- vào bảng này KHI bộ chạy của nó đã tồn tại — xem mệnh đề WHERE của dòng flag_engine
-- bên dưới, nơi luật ấy được viết thành SQL chứ không chỉ nằm trong comment này.
--
-- Đầu vào duy nhất: tools/jobs/run-all.mjs (Task Scheduler của Windows hoặc cron).
-- Phụ thuộc: 0008 (ops.job_runs), 0011 (degraded_sources), 0030 (ops.v_homeroom_drift).

begin;

-- ---------------------------------------------------------------------------
-- 1. ops.job_schedule — sổ khai job
-- ---------------------------------------------------------------------------
-- `kind` quyết định run-all.mjs gọi job bằng cách nào:
--   'script' — sinh tiến trình `node tools/jobs/<runner>`; job tự lo transaction của nó.
--   'sql'    — gọi ops.run_sql_job(job_name); việc nằm trọn trong một hàm SQL.
--   'batch'  — CHÍNH bộ lịch. Không ai gọi nó trong vòng lặp; nó tự ghi dòng cho mình.
--              Nhờ dòng này mà "máy chạy cron chết" trở thành MỘT DÒNG QUÁ HẠN nhìn
--              thấy được, thay vì một buồng lái xanh không có gì để nói.
--
-- Vì sao `runner` chỉ là TÊN FILE chứ không phải câu lệnh: một dòng trong bảng này
-- không được phép trở thành lệnh shell. run-all.mjs còn soi lại tên file bằng biểu
-- thức chính quy và ghép vào đúng thư mục tools/jobs/ trước khi chạy — hai lớp, vì
-- rò một lớp là thi hành mã tuỳ ý trên máy chủ có dữ liệu trẻ em.
create table if not exists ops.job_schedule (
  job_name        text        primary key,
  label           text        not null,               -- tên tiếng Việt cho người trực đọc
  kind            text        not null default 'script',
  runner          text,                               -- chỉ với kind='script'
  expected_every  interval    not null,               -- bao lâu phải chạy một lần
  grace           interval    not null default interval '2 hours',
  enabled         boolean     not null default true,
  note            text,
  updated_at      timestamptz not null default now(),

  constraint job_schedule_kind_chk  check (kind in ('script', 'sql', 'batch')),
  constraint job_schedule_every_chk check (expected_every > interval '0'),
  constraint job_schedule_grace_chk check (grace >= interval '0'),
  -- Đúng một cách gọi cho mỗi dòng: 'script' phải có file, hai loại kia phải KHÔNG có.
  -- Thiếu ràng buộc này thì một dòng 'sql' mang theo runner cũ sẽ chạy hai lần công việc.
  constraint job_schedule_runner_chk check (
    (kind = 'script' and runner is not null and runner ~ '^run-[a-z0-9-]+\.mjs$')
    or (kind <> 'script' and runner is null)
  )
);

comment on table ops.job_schedule is
  'Sổ khai job nền (0041). CHỈ khai job đã có bộ chạy — khai sớm là tự bật cảnh báo giả vĩnh viễn (bài học 0011/ADR-016). kind=batch là chính bộ lịch, để phát hiện máy chạy cron chết.';
comment on column ops.job_schedule.runner is
  'Chỉ TÊN FILE trong tools/jobs/, không phải câu lệnh. Một dòng trong bảng không được trở thành lệnh shell.';
comment on column ops.job_schedule.grace is
  'Khoảng dung sai trước khi kết luận quá hạn/treo. Chạy trễ 10 phút không phải sự cố; treo 6 tiếng thì có.';

-- Khai job ĐANG có bộ chạy thật, không hơn một dòng nào.
insert into ops.job_schedule (job_name, label, kind, runner, expected_every, grace, note) values
  ('job_scheduler', 'Bộ lịch chạy job (chính nó)', 'batch', null,
   interval '1 day', interval '6 hours',
   'Dòng này quá hạn = máy chạy Task Scheduler/cron đã chết. Không có nó thì cron chết là im lặng tuyệt đối.'),

  ('emotion_retention', 'Xoá chi tiết cảm xúc quá 12 tháng', 'script', 'run-retention.mjs',
   interval '1 month', interval '3 days',
   '§3 + mệnh lệnh 4 CLAUDE.md + Luật 91/2025. Dòng này quá hạn = đang thất hứa với phụ huynh.'),

  ('homeroom_drift', 'Soi lệch phân công chủ nhiệm', 'sql', null,
   interval '1 day', interval '6 hours',
   'Đọc ops.v_homeroom_drift (0030). findings > 0 = có ai đó ghi vòng qua core.class_assignments.')
on conflict (job_name) do nothing;

-- Bộ quét cờ đêm — khai RIÊNG, có điều kiện, và điều kiện ấy chính là luật của bảng này.
--
-- Luật: một job chỉ được khai KHI bộ chạy của nó đã tồn tại, không sớm hơn một phút.
-- Khai sớm là tự bật một dòng 'qua_han' sáng vĩnh viễn — đúng cái bẫy 0011/ADR-016 đã
-- dẫm phải với ops.source_freshness, và cảnh báo lúc nào cũng sáng là cảnh báo đã chết.
--
-- Ở đây điều kiện được VIẾT RA THÀNH SQL thay vì chỉ ghi trong comment: care.run_flag_engine()
-- ra đời ở 0039, tức là trước 0041 trong thứ tự chạy — nên trên database dựng mới, mệnh đề
-- WHERE này luôn đúng. Giá trị của nó nằm ở database ĐÃ migrate mà ai đó chạy tay 0041:
-- thiếu 0039 thì không có dòng lịch nào được sinh ra, thay vì sinh một dòng trỏ vào hư không.
insert into ops.job_schedule (job_name, label, kind, runner, expected_every, grace, note)
select 'flag_engine', 'Bộ quét cờ đêm', 'script', 'run-flag-engine.mjs',
       interval '1 day', interval '6 hours',
       'Quét tín hiệu ABC+E → care.flags/care_cases (04-flag-engine.md, 0039). Dòng này quá hạn = buồng lái GVCN đang nhìn số của hôm kia.'
 where to_regprocedure('care.run_flag_engine(date,text)') is not null
on conflict (job_name) do nothing;

alter table ops.job_schedule enable row level security;

-- Cấu hình vận hành, không có dữ liệu cá nhân — buồng lái và màn điều hành đọc được.
-- KHÔNG có policy ghi cho authenticated: đổi lịch là việc của migration, không phải của UI.
grant select on ops.job_schedule to authenticated;
drop policy if exists job_schedule_read on ops.job_schedule;
create policy job_schedule_read
  on ops.job_schedule for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 2. Ghi sổ một lần chạy — ba hàm, đúng ba tình huống
-- ---------------------------------------------------------------------------
-- Vì sao KHÔNG bắt mọi job đi qua đây: run-retention.mjs (0031) đã tự ghi dòng của
-- nó bên trong attendance.purge_old_emotion_details(). Ép nó ghi thêm một dòng nữa là
-- hai dòng cho một lần chạy — người trực đọc log sẽ đếm nhầm. run-all.mjs so số dòng
-- TRƯỚC và SAU khi gọi con, chỉ ghi hộ khi con KHÔNG để lại dấu vết nào.

-- 2a. Mở sổ — dùng cho dòng của chính bộ lịch ('job_scheduler').
create or replace function ops.start_job_run(
  p_job_name text,
  p_as_of    date default null,
  p_mode     text default 'live'
)
returns bigint
language sql
security definer
set search_path = ops, pg_catalog
as $$
  insert into ops.job_runs (job_name, as_of_date, mode, status)
       values (p_job_name, p_as_of, p_mode, 'running')
    returning id;
$$;

comment on function ops.start_job_run(text, date, text) is
  '0041 — mở một dòng ops.job_runs trạng thái running. Ghi TRƯỚC khi làm: tiến trình chết giữa chừng vẫn để lại dấu vết cho ops.reap_stale_runs() nhặt.';

-- 2b. Đóng sổ.
create or replace function ops.finish_job_run(
  p_run_id   bigint,
  p_status   text,
  p_metrics  jsonb  default '{}'::jsonb,
  p_degraded text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = ops, pg_catalog
as $$
begin
  if p_status not in ('success', 'failed') then
    raise exception 'Trạng thái kết thúc phải là success hoặc failed, nhận được: %', p_status;
  end if;

  update ops.job_runs
     set status            = p_status,
         finished_at       = now(),
         metrics           = coalesce(p_metrics, '{}'::jsonb),
         degraded_sources  = coalesce(p_degraded, '{}'::text[])
   where id = p_run_id
     -- Chỉ đóng dòng CÒN MỞ. Gọi lại lần hai là no-op (§9), và quan trọng hơn: một
     -- dòng đã bị reap thành 'failed' không bị lần gọi muộn ghi đè thành 'success'.
     -- Không có điều kiện này thì một job treo được nhặt lúc 3h sáng sẽ tự "khỏi bệnh"
     -- lúc 9h khi tiến trình cũ tỉnh lại — đúng kiểu hỏng im lặng đang chống.
     and status = 'running';
end;
$$;

comment on function ops.finish_job_run(bigint, text, jsonb, text[]) is
  '0041 — đóng dòng job_runs. Chỉ chạm dòng còn running: dòng đã bị reap thành failed không được ghi đè ngược thành success.';

-- 2c. Ghi hộ — job con chạy xong mà không để lại dòng nào (chết trước khi kịp ghi,
--     hoặc bản thân nó không tự ghi sổ). Không có nhánh này thì một job chết trông
--     y hệt một job chưa tới lịch.
create or replace function ops.record_job_run(
  p_job_name   text,
  p_status     text,
  p_metrics    jsonb       default '{}'::jsonb,
  p_started_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = ops, pg_catalog
as $$
declare
  v_id bigint;
begin
  if p_status not in ('success', 'failed') then
    raise exception 'Trạng thái kết thúc phải là success hoặc failed, nhận được: %', p_status;
  end if;

  insert into ops.job_runs (job_name, status, started_at, finished_at, metrics)
       values (p_job_name, p_status, coalesce(p_started_at, now()), now(),
               coalesce(p_metrics, '{}'::jsonb))
    returning id into v_id;

  return v_id;
end;
$$;

comment on function ops.record_job_run(text, text, jsonb, timestamptz) is
  '0041 — ghi HỘ một lần chạy đã kết thúc, cho job con không tự ghi sổ. run-all.mjs chỉ gọi khi con không để lại dòng nào.';

-- ---------------------------------------------------------------------------
-- 3. ops.reap_stale_runs — dòng 'running' treo phải thành 'failed' nhìn thấy được
-- ---------------------------------------------------------------------------
-- Tình huống thật: máy chủ khởi động lại lúc job đang chạy. Dòng 'running' nằm đó
-- vĩnh viễn. Với v_job_health thì nó là 'đang chạy' — tức là "ổn, đợi chút" — trong
-- khi sự thật là nó đã chết từ đêm qua. Hàm này chuyển kết luận đó về đúng chỗ.
--
-- Chạy lại là no-op (§9): lần hai không còn dòng nào quá hạn, trả 0.
create or replace function ops.reap_stale_runs(p_max_age interval default interval '6 hours')
returns integer
language plpgsql
security definer
set search_path = ops, pg_catalog
as $$
declare
  v_n integer;
begin
  update ops.job_runs
     set status      = 'failed',
         finished_at = now(),
         metrics     = metrics || jsonb_build_object(
                         'reaped_at',  now(),
                         'reap_reason',
                         'Dòng running quá ' || p_max_age::text ||
                         ' — tiến trình chết giữa chừng, không phải đang chạy.')
   where status = 'running'
     and started_at < now() - p_max_age;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function ops.reap_stale_runs(interval) is
  '0041 — biến dòng running treo thành failed kèm lý do. Không có hàm này thì một job chết trông giống một job đang chạy. Chạy lại trả 0 (§9).';

-- ---------------------------------------------------------------------------
-- 4. ops.job_due — đã tới lượt chưa
-- ---------------------------------------------------------------------------
-- Nhờ hàm này mà run-all.mjs cắm được lịch DÀY (mỗi giờ) mà job tháng vẫn chạy đúng
-- một lần/tháng: cắm dày thì một lần lỡ nhịp được bù ở lần sau, thay vì phải đợi
-- trọn một chu kỳ nữa.
create or replace function ops.job_due(p_job_name text)
returns boolean
language sql
stable
security definer
set search_path = ops, pg_catalog
as $$
  -- coalesce ngoài cùng, KHÔNG phải trang trí: job chưa khai trong lịch làm truy vấn
  -- trả 0 dòng ⇒ NULL. Mà `if (null)` trong JavaScript là falsy còn `not null` trong
  -- SQL vẫn là NULL — hai tầng hiểu khác nhau về cùng một câu trả lời là chỗ để một
  -- job lặng lẽ không bao giờ chạy. Trả thẳng false: bộ lịch không đoán việc.
  select coalesce(
    (select case
              when not s.enabled then false
              -- Chưa từng thành công lần nào ⇒ ĐẾN LƯỢT. "Chưa chạy" không bao giờ
              -- được suy thành "không cần chạy".
              when r.last_success_at is null then true
              else now() - r.last_success_at >= s.expected_every
            end
       from ops.job_schedule s
       left join lateral (
         select max(finished_at) as last_success_at
           from ops.job_runs j
          where j.job_name = s.job_name
            and j.status   = 'success'
       ) r on true
      where s.job_name = p_job_name),
    false);
$$;

comment on function ops.job_due(text) is
  '0041 — job đã tới lượt chạy chưa. Chưa từng thành công lần nào ⇒ true: "chưa chạy" không được suy thành "không cần chạy".';

-- ---------------------------------------------------------------------------
-- 5. ops.check_homeroom_drift — job giám sát mà 0030 viết view cho
-- ---------------------------------------------------------------------------
-- 0030 dựng ops.v_homeroom_drift kèm câu "View này là chỗ để job giám sát hỏi 'còn
-- lệch không'". Job đó là hàm này. Nó KHÔNG tự sửa gì: lệch GVCN nghĩa là có đường
-- ghi vòng qua core.class_assignments, và tự vá là xoá mất bằng chứng về đường đó.
--
-- Quy ước chung cho mọi job giám sát: số phát hiện nằm ở metrics->>'findings'.
-- v_job_health đọc đúng khoá này, nên một job CHẠY THÀNH CÔNG mà tìm ra vấn đề vẫn
-- nổi lên — không lẫn với "chạy xong, không có gì".
create or replace function ops.check_homeroom_drift()
returns jsonb
language plpgsql
security definer
set search_path = ops, core, pg_catalog
as $$
declare
  v_thua    integer;
  v_thieu   integer;
  v_metrics jsonb;
begin
  select count(*) filter (where kind = 'thua_ban_sao'),
         count(*) filter (where kind = 'thieu_ban_sao')
    into v_thua, v_thieu
    from ops.v_homeroom_drift;

  v_metrics := jsonb_build_object(
    'findings',      v_thua + v_thieu,
    'thua_ban_sao',  v_thua,
    'thieu_ban_sao', v_thieu,
    'checked_at',    now()
  );

  return v_metrics;
end;
$$;

comment on function ops.check_homeroom_drift() is
  '0041 — đếm lệch GVCN từ ops.v_homeroom_drift (0030). KHÔNG tự vá: lệch là bằng chứng có đường ghi vòng, vá là xoá bằng chứng. findings>0 nổi lên ở ops.v_job_health.';

-- ---------------------------------------------------------------------------
-- 6. ops.run_sql_job — cửa duy nhất cho job kiểu 'sql'
-- ---------------------------------------------------------------------------
-- Cố ý là một CASE viết cứng chứ không phải `execute 'select ' || p_job_name`: tên
-- hàm lấy từ một bảng rồi nối vào câu lệnh là đường thi hành mã tuỳ ý. Thêm job SQL
-- mới thì sửa hàm này trong cùng migration với job đó — một dòng thừa, đổi lại không
-- có cửa nào để một dòng dữ liệu biến thành mã chạy.
create or replace function ops.run_sql_job(p_job_name text)
returns jsonb
language plpgsql
security definer
set search_path = ops, pg_catalog
as $$
begin
  case p_job_name
    when 'homeroom_drift' then
      return ops.check_homeroom_drift();
    else
      raise exception 'Chưa có bộ chạy SQL cho job "%" — thêm nhánh trong ops.run_sql_job() cùng migration với job đó', p_job_name;
  end case;
end;
$$;

comment on function ops.run_sql_job(text) is
  '0041 — điều phối job kiểu sql. CASE viết cứng, cố ý: nối tên hàm lấy từ bảng vào câu lệnh là đường thi hành mã tuỳ ý.';

-- ---------------------------------------------------------------------------
-- 7. ops.v_job_health — một dòng một job, im lặng KHÔNG phải 'ok'
-- ---------------------------------------------------------------------------
-- Bảy trạng thái, và cái quan trọng nhất là 'chua_chay': trước view này, một job
-- chưa từng chạy và một job vừa chạy xong nhìn giống hệt nhau (đều không có gì để
-- báo). Đó chính là lỗi đã lặp lại 4 lần trong dự án này.
--
--   ok        — chạy thành công trong hạn, không phát hiện gì.
--   dang_chay — đang chạy, chưa quá dung sai.
--   chua_chay — CHƯA CÓ DÒNG NÀO. Không phải ổn, chỉ là chưa biết gì.
--   that_bai  — lần gần nhất hỏng.
--   treo      — dòng running quá dung sai; ops.reap_stale_runs() sẽ chuyển thành that_bai.
--   qua_han   — thành công lần cuối đã quá expected_every + grace.
--   tat       — enabled = false.
create or replace view ops.v_job_health as
with last_run as (
  select distinct on (job_name)
         job_name, id, status, started_at, finished_at, metrics, degraded_sources
    from ops.job_runs
   order by job_name, started_at desc, id desc
),
last_ok as (
  select job_name, max(finished_at) as last_success_at
    from ops.job_runs
   where status = 'success'
   group by job_name
),
joined as (
  select s.job_name,
         s.label,
         s.kind,
         s.enabled,
         s.expected_every,
         s.grace,
         s.note,
         r.status       as last_status,
         r.started_at   as last_started_at,
         r.finished_at  as last_finished_at,
         r.metrics      as last_metrics,
         coalesce(r.degraded_sources, '{}'::text[]) as degraded_sources,
         o.last_success_at,
         -- Ép kiểu có canh: một job ghi findings='nhiều' không được làm sập buồng lái.
         case
           when r.metrics ->> 'findings' ~ '^[0-9]+$' then (r.metrics ->> 'findings')::int
           else 0
         end as last_findings
    from ops.job_schedule s
    left join last_run r on r.job_name = s.job_name
    left join last_ok  o on o.job_name = s.job_name
)
select j.*,
       case
         when not j.enabled then 'tat'
         when j.last_status is null then 'chua_chay'
         when j.last_status = 'running' and now() - j.last_started_at > j.grace then 'treo'
         when j.last_status = 'running' then 'dang_chay'
         when j.last_status = 'failed' then 'that_bai'
         when j.last_success_at is null then 'chua_chay'
         when now() - j.last_success_at > j.expected_every + j.grace then 'qua_han'
         else 'ok'
       end as state,
       -- Cột mà màn hình trực chỉ cần đọc đúng một cột.
       -- 'tat' CŨNG tính là cần chú ý, có chủ ý: tắt job xoá cảm xúc là thất hứa với
       -- phụ huynh, không được phép nằm im như một lựa chọn bình thường. Muốn bỏ hẳn
       -- một job thì XOÁ dòng khỏi ops.job_schedule — một hành động có dấu vết trong
       -- migration, không phải một ô tick lặng lẽ.
       (case
          when not j.enabled then true
          when j.last_status is null then true
          when j.last_status = 'running' and now() - j.last_started_at > j.grace then true
          when j.last_status = 'running' then false
          when j.last_status = 'failed' then true
          when j.last_success_at is null then true
          when now() - j.last_success_at > j.expected_every + j.grace then true
          else j.last_findings > 0
        end) as needs_attention
  from joined j;

comment on view ops.v_job_health is
  'Sức khoẻ job nền (0041). CHUA_CHAY là một trạng thái riêng — im lặng không phải kết luận. needs_attention là cột duy nhất màn hình trực cần đọc; findings>0 cũng tính, để job giám sát chạy xong mà tìm ra vấn đề vẫn nổi lên.';

grant select on ops.v_job_health to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Quyền thi hành — job chạy bằng vai chủ sở hữu, không phải bằng vai người dùng
-- ---------------------------------------------------------------------------
-- Các hàm ở trên là SECURITY DEFINER và GHI vào ops.job_runs. Không có lý do nào để
-- một phiên `authenticated` (học sinh, phụ huynh, giáo viên) gọi được chúng — cho
-- phép là mở đường bịa lịch sử chạy máy. revoke from public là chốt duy nhất, vì
-- PostgreSQL mặc định cấp EXECUTE cho public trên mọi hàm mới.
revoke execute on function ops.start_job_run(text, date, text)             from public;
revoke execute on function ops.finish_job_run(bigint, text, jsonb, text[]) from public;
revoke execute on function ops.record_job_run(text, text, jsonb, timestamptz) from public;
revoke execute on function ops.reap_stale_runs(interval)                   from public;
revoke execute on function ops.check_homeroom_drift()                      from public;
revoke execute on function ops.run_sql_job(text)                           from public;
-- ops.job_due() chỉ ĐỌC và không lộ dữ liệu cá nhân: màn hình trực cần trả lời được
-- "sắp tới lượt chưa" mà không phải tự tính lại công thức ở tầng ứng dụng.
revoke execute on function ops.job_due(text) from public;
grant  execute on function ops.job_due(text) to authenticated;

commit;
