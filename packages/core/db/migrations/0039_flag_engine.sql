-- 0039_flag_engine.sql
-- Bộ quét cờ tự động — cài đặt THẬT thuật toán đã duyệt ở danh-cho-may/04-flag-engine.md.
--
-- Vì sao bây giờ: buồng lái GVCN (care.getDashboard) đang TÍNH TRỰC TIẾP tín hiệu thô mỗi
-- lần một người mở màn hình. Một lớp thì chịu được. Cả khối thì mỗi sáng có vài chục GVCN
-- cùng mở buồng lái, mỗi lần là một lần quét lại toàn bộ check-in và help_request của lớp —
-- cùng một phép tính, lặp lại vài chục lần, và KHÔNG để lại dấu vết nào để trả lời câu hỏi
-- "hệ có quét không, quét lúc mấy giờ". Chính câu hỏi đó là thứ ADR-016 gọi là chống hỏng
-- im lặng: buồng lái trống mà không có dòng "Quét đêm qua HH:mm" thì đó là hệ hỏng, không
-- phải "lớp ổn".
--
-- File này KHÔNG sửa care.ts. Buồng lái vẫn tính trực tiếp cho tới khi có gói việc chuyển
-- nó sang đọc care.flags — đổi hai thứ cùng lúc thì lúc lệch số không biết bên nào sai.
-- Sau migration này hai đường cùng tồn tại và PHẢI cho cùng kết quả; đó là cách đối chiếu.
--
-- Bốn phần:
--   1. care.rules.source_key   — khai NGUỒN mà mỗi luật phụ thuộc (ADR-016, hành vi 5)
--   2. hai signal view bỏ cửa sổ viết chết, đọc cửa sổ từ care.thresholds (§6, mệnh lệnh 7)
--   3. care.run_flag_engine()  — toàn bộ thuật toán, chạy được từ psql lẫn từ job Node
--   4. quyền: hàm KHÔNG mở cho authenticated
--
-- Phụ thuộc: 0005 (care.flags/care_cases/escalations), 0008 (ops.job_runs, outbox),
--            0011 (ops.source_freshness + degraded_sources), 0012 (care.flags.origin),
--            0026 (care.rules + care.resolve_threshold + care.v_signal_emotion),
--            0030 (core.class_assignments là nguồn sự thật GVCN).

begin;

-- ---------------------------------------------------------------------------
-- 1. Luật nào sống nhờ nguồn nào
-- ---------------------------------------------------------------------------
-- Hành vi cố định số 5 (04-flag-engine.md): "nguồn hết tươi thì BỎ QUA rule, không kết
-- luận ổn". Muốn thi hành được câu đó, engine phải trả lời được "rule này đọc nguồn nào" —
-- và câu trả lời đó không được nằm trong một mảng viết chết trong code, vì ngày connector
-- Tutor ra đời thì người thêm connector sẽ không đi tìm một hằng số trong hàm SQL.
--
-- FK về ops.source_freshness: không khai được một nguồn mà bảng hạn tươi chưa biết tới.
-- ON DELETE SET NULL vì 0011 đã có tiền lệ XOÁ dòng nguồn chưa có connector nào ghi —
-- lúc đó rule mất chỗ dựa và phải quay về trạng thái "chưa khai nguồn", chứ không được
-- kéo theo cả dòng luật.
alter table care.rules
  add column if not exists source_key text;

alter table care.rules drop constraint if exists rules_source_fkey;
alter table care.rules
  add  constraint rules_source_fkey foreign key (source_key)
       references ops.source_freshness(source) on delete set null;

comment on column care.rules.source_key is
  'ADR-016 — nguồn tín hiệu mà luật này phụ thuộc (khớp ops.source_freshness.source). NULL = CHƯA khai nguồn: engine BỎ QUA luật và ghi lý do, tuyệt đối không chạy rồi kết luận "không có gì bất thường".';

-- Chỉ khai nguồn đã có người ghi — đúng luật của 0011. C_MASTERY và C_CEFR cố ý để NULL:
-- cả hai đọc dữ liệu Tutor/COR, mà chưa connector nào ghi ops.source_freshness cho chúng.
-- Để NULL không phải là quên: đó là lời khai "chưa biết dữ liệu này còn tươi hay không",
-- và engine sẽ bỏ qua hai luật đó kèm lý do thay vì quét bảng rỗng rồi im lặng.
update care.rules r
   set source_key = m.source
  from (values
          ('A_ATTENDANCE', 'attendance'),
          ('E_MOOD',       'attendance'),
          ('E_URGENT',     'attendance'),
          ('B_BEHAVIOR',   'evidence')
       ) as m(rule_code, source)
 where r.rule_code = m.rule_code
   -- Nguồn chưa có trong bảng hạn tươi thì không gán (FK sẽ nổ, và quan trọng hơn:
   -- khai một nguồn không ai ghi là tự bật báo động giả — bài học 0011).
   and exists (select 1 from ops.source_freshness f where f.source = m.source);

-- ---------------------------------------------------------------------------
-- 2. Signal view thôi viết chết cửa sổ thời gian
-- ---------------------------------------------------------------------------
-- Trước: v_signal_attendance dùng `current_date - 30`, v_signal_behavior dùng
-- `current_date - 30`, trong khi care.thresholds khai `window_days` cho đúng hai luật đó.
-- Hai con số cùng nói một điều ở hai nơi — đúng cái bẫy mà 0026 đã gỡ cho E_MOOD: người
-- sửa bảng ngưỡng tưởng mình vừa đổi hành vi hệ thống, trong khi không.
--
-- Nay cửa sổ đọc qua care.resolve_threshold, THEO TỪNG CƠ SỞ của học sinh (0026 cho phép
-- khai ngưỡng riêng cho từng cơ sở). Cột và kiểu giữ nguyên từng nét nên `create or replace`
-- chạy được và không đối tượng nào phụ thuộc bị gãy.
--
-- coalesce(..., 30): bảng ngưỡng thiếu dòng thì view vẫn trả số, không trả rỗng. Rỗng ở
-- đây nguy hiểm hơn sai: rỗng trông y hệt "cả lớp đi học đủ".
create or replace view care.v_signal_attendance as
  select e.student_id,
         count(*) filter (where c.status in ('present', 'late'))::numeric
           / nullif(count(*), 0) as attendance_rate,
         max(c.occurred_on)      as last_seen_on
    from core.enrollments e
    join core.students s on s.id = e.student_id
    cross join lateral (
      select coalesce(
               (care.resolve_threshold('A_ATTENDANCE', s.school_id) ->> 'window_days')::int,
               30) as window_days
    ) cfg
    join attendance.checkins c
      on c.student_id = e.student_id
     and c.occurred_on >= current_date - cfg.window_days
   where e.valid_to is null
   group by e.student_id;

comment on view care.v_signal_attendance is
  'Hợp đồng ADR-010 — engine chỉ đọc tín hiệu chuyên cần qua đây. Từ 0039 cửa sổ nhìn lại đọc từ care.thresholds (A_ATTENDANCE.window_days) theo đúng cơ sở của em, không còn viết chết 30 ngày.';

create or replace view care.v_signal_behavior as
  select vb.student_id,
         count(*) as incident_count
    from evidence.value_behaviors vb
    join core.students s on s.id = vb.student_id
    cross join lateral (
      select coalesce(
               (care.resolve_threshold('B_BEHAVIOR', s.school_id) ->> 'window_days')::int,
               30) as window_days
    ) cfg
   where vb.week_start >= current_date - cfg.window_days
     and vb.self_score = 0
   group by vb.student_id;

comment on view care.v_signal_behavior is
  'Hợp đồng ADR-010 — engine chỉ đọc tín hiệu hành vi qua đây. Từ 0039 cửa sổ nhìn lại đọc từ care.thresholds (B_BEHAVIOR.window_days) theo đúng cơ sở của em.';

-- 0024 đã đặt security_invoker cho cả hai view; `create or replace` giữ reloptions, nhưng
-- đặt lại tường minh để không phụ thuộc một chi tiết dễ đổi giữa các bản Postgres.
alter view care.v_signal_attendance set (security_invoker = true);
alter view care.v_signal_behavior   set (security_invoker = true);

-- v_signal_course cố ý KHÔNG đụng tới: luật C_MASTERY chưa có nguồn tươi nào khai (mục 1),
-- nên engine bỏ qua nó. Sửa một view mà không đường nào chạy qua là thêm rủi ro không đổi
-- lại gì. Ngày connector Tutor ra đời, sửa nó CÙNG migration của connector đó.

-- ---------------------------------------------------------------------------
-- 3. care.run_flag_engine — toàn bộ thuật toán
-- ---------------------------------------------------------------------------
-- Vì sao logic nằm ở SQL chứ không ở Node (giống run-retention.mjs, xem tools/jobs/README.md):
-- hàm chạy được cả từ cron lẫn từ psql lúc sự cố, pgTAP kiểm được nó mà không cần dựng Node,
-- và mọi thứ nó chạm nằm trong MỘT transaction — job chết giữa chừng không để lại nửa cái
-- hồ sơ can thiệp.
--
-- Trả về jsonb metrics, và ghi đúng metrics ấy vào ops.job_runs.
create or replace function care.run_flag_engine(
  p_as_of date default current_date,
  p_mode  text default 'live'
)
returns jsonb
language plpgsql
as $$
declare
  -- Định mức 5 hồ sơ Tầng 2 mỗi GVCN. Đây là HÀNH VI CỐ ĐỊNH số 2 của 04-flag-engine.md
  -- ("logic, không phải ngưỡng — đổi phải qua ADR"), không phải ngưỡng cảnh báo, nên nó
  -- KHÔNG nằm trong care.thresholds: bảng đó đang có đúng 6 dòng luật và 0005_care_test
  -- khoá con số 6 lại. Đổi định mức = sửa dòng này + một ADR, đúng như spec yêu cầu.
  c_owner_quota constant int := 5;

  -- Luật đã có người cài. C_CEFR nằm ngoài: chưa có signal view nào cho lộ trình CEFR
  -- (04-flag-engine.md Rev B liệt kê `cefr_gap`, 0009/0026 chưa dựng). Bỏ qua kèm lý do
  -- thay vì đánh giá bằng dữ liệu không tồn tại.
  c_implemented constant text[] := array['A_ATTENDANCE', 'B_BEHAVIOR', 'C_MASTERY',
                                         'E_MOOD', 'E_URGENT'];

  v_run_id      bigint;
  v_stale       text[];
  v_rules       text[];
  v_skipped     jsonb;
  v_flags_new   int := 0;
  v_flags_seen  int := 0;
  v_n_new       int;
  v_n_all       int;
  v_cases_new   int := 0;
  v_attached    int := 0;
  v_overflow    int := 0;
  v_ownerless   int := 0;
  v_escalated   int := 0;
  v_case_id     uuid;
  v_owner       uuid;
  v_counselor   uuid;
  v_open_cases  int;
  v_k           int;
  v_metrics     jsonb;
  r             record;
begin
  if p_mode not in ('live', 'backfill') then
    raise exception 'mode chỉ nhận live | backfill, nhận được: %', p_mode
      using errcode = 'invalid_parameter_value';
  end if;

  -- Vì sao chặn ngày quá khứ, dù chữ ký vẫn nhận as_of_date như spec:
  -- các care.v_signal_* neo cửa sổ vào current_date (hợp đồng ADR-010, 0009/0026). Chạy
  -- engine với as_of = 01/05 sẽ lấy tín hiệu của HÔM NAY rồi dán nhãn ngày 01/05 — tức
  -- bịa ra một lịch sử chưa từng xảy ra, thứ nguy hiểm hơn hẳn việc không có lịch sử.
  -- Đúng luồng nạp bù (ADR-016) KHÔNG cần ngày quá khứ: promote 3 tháng dữ liệu cũ xong
  -- thì chính cửa sổ hôm nay đã chứa dữ liệu đó, chạy mode='backfill' là đủ.
  -- Mở được ngày quá khứ khi (và chỉ khi) signal view nhận tham số ngày — lúc đó sửa cả
  -- hợp đồng view lẫn hàm này trong cùng một PR.
  if p_as_of <> current_date then
    raise exception 'Chưa hỗ trợ quét cho ngày khác hôm nay (nhận %): signal view neo cửa sổ vào current_date nên nhãn ngày sẽ sai.', p_as_of
      using errcode = 'feature_not_supported',
            hint    = 'Nạp bù dữ liệu cũ: promote xong rồi chạy với p_mode := ''backfill'' ở ngày hôm nay.';
  end if;

  insert into ops.job_runs (job_name, rule_version, as_of_date, mode, status, freshness_at)
  values ('flag_engine', '04-flag-engine.md#rev-b', p_as_of, p_mode, 'running', now())
  returning id into v_run_id;

  -- ── Nguồn nào đang hết tươi ───────────────────────────────────────────────
  -- Engine và buồng lái dùng CHUNG một định nghĩa "hết tươi" (ops.v_stale_sources, 0011),
  -- để không có chuyện hai nơi hiểu khác nhau rồi băng vàng nói một đằng cờ chạy một nẻo.
  select coalesce(array_agg(source order by source), '{}'::text[])
    into v_stale
    from ops.v_stale_sources;

  -- ── Luật nào được chạy đêm nay, luật nào bị bỏ qua và VÌ SAO ──────────────
  -- Danh sách bỏ qua đi thẳng vào metrics: "im lặng không phải kết luận" chỉ có nghĩa khi
  -- phần bị bỏ qua được NÓI RA, chứ không phải khi nó biến mất khỏi báo cáo.
  select coalesce(array_agg(rule_code order by rule_code) filter (where ly_do is null),
                  '{}'::text[]),
         coalesce(jsonb_agg(jsonb_build_object('rule_code', rule_code, 'ly_do', ly_do)
                            order by rule_code) filter (where ly_do is not null),
                  '[]'::jsonb)
    into v_rules, v_skipped
    from (
      select rl.rule_code,
             case
               when not (rl.rule_code = any (c_implemented)) then 'chua_cai_dat'
               when not exists (select 1 from care.thresholds t
                                 where t.rule_code = rl.rule_code and t.active)
                 then 'khong_co_nguong_dang_bat'
               when rl.source_key is null      then 'chua_khai_nguon_tuoi'
               when rl.source_key = any (v_stale) then 'nguon_het_tuoi'
             end as ly_do
        from care.rules rl
    ) x;

  -- ── Cờ A — chuyên cần ─────────────────────────────────────────────────────
  if 'A_ATTENDANCE' = any (v_rules) then
    with ins as (
      insert into care.flags as f (student_id, rule_code, as_of_date, detail, origin)
      select v.student_id,
             'A_ATTENDANCE',
             p_as_of,
             jsonb_build_object(
               'attendance_rate', round(v.attendance_rate, 4),
               'min_rate',        (th.params ->> 'min_rate')::numeric,
               'window_days',     (th.params ->> 'window_days')::int,
               'last_seen_on',    v.last_seen_on),
             p_mode
        from care.v_signal_attendance v
        join core.students s on s.id = v.student_id
        cross join lateral (select care.resolve_threshold('A_ATTENDANCE', s.school_id) as params) th
       where th.params is not null
         and v.attendance_rate is not null
         and v.attendance_rate < (th.params ->> 'min_rate')::numeric
      -- §9 — chạy lại trong đêm là no-op. `where f.origin = excluded.origin` giữ một lần
      -- nạp bù khỏi ghi đè chi tiết của cờ live đã có (và ngược lại): cờ đã mang nhãn nào
      -- thì giữ nhãn đó, vì chính nhãn ấy quyết định nó có được mở hồ sơ hay không.
      on conflict (student_id, rule_code, as_of_date)
      do update set detail = excluded.detail
             where f.origin = excluded.origin
      returning (xmax = 0) as la_moi
    )
    select count(*) filter (where la_moi)::int, count(*)::int
      into v_n_new, v_n_all from ins;
    v_flags_new := v_flags_new + v_n_new;
    v_flags_seen := v_flags_seen + v_n_all;
  end if;

  -- ── Cờ B — hành vi/giá trị ────────────────────────────────────────────────
  if 'B_BEHAVIOR' = any (v_rules) then
    with ins as (
      insert into care.flags as f (student_id, rule_code, as_of_date, detail, origin)
      select v.student_id,
             'B_BEHAVIOR',
             p_as_of,
             jsonb_build_object(
               'incident_count', v.incident_count,
               'max_incidents',  (th.params ->> 'max_incidents')::int,
               'window_days',    (th.params ->> 'window_days')::int),
             p_mode
        from care.v_signal_behavior v
        join core.students s on s.id = v.student_id
        cross join lateral (select care.resolve_threshold('B_BEHAVIOR', s.school_id) as params) th
       where th.params is not null
         and v.incident_count > (th.params ->> 'max_incidents')::int
      on conflict (student_id, rule_code, as_of_date)
      do update set detail = excluded.detail
             where f.origin = excluded.origin
      returning (xmax = 0) as la_moi
    )
    select count(*) filter (where la_moi)::int, count(*)::int
      into v_n_new, v_n_all from ins;
    v_flags_new := v_flags_new + v_n_new;
    v_flags_seen := v_flags_seen + v_n_all;
  end if;

  -- ── Cờ C — mức thành thạo ─────────────────────────────────────────────────
  -- Hôm nay nhánh này KHÔNG chạy (C_MASTERY chưa khai nguồn tươi, xem mục 1). Viết sẵn để
  -- ngày connector Tutor ra đời, việc phải làm là gán source_key trong migration của
  -- connector đó — không phải mở lại hàm này.
  if 'C_MASTERY' = any (v_rules) then
    with ins as (
      insert into care.flags as f (student_id, rule_code, as_of_date, detail, origin)
      select v.student_id,
             'C_MASTERY',
             p_as_of,
             jsonb_build_object(
               'weak_strands', v.weak_strands,
               'strands',      (th.params ->> 'strands')::int,
               'as_of',        v.as_of_date),
             p_mode
        from care.v_signal_course v
        join core.students s on s.id = v.student_id
        cross join lateral (select care.resolve_threshold('C_MASTERY', s.school_id) as params) th
       where th.params is not null
         and v.weak_strands >= (th.params ->> 'strands')::int
      on conflict (student_id, rule_code, as_of_date)
      do update set detail = excluded.detail
             where f.origin = excluded.origin
      returning (xmax = 0) as la_moi
    )
    select count(*) filter (where la_moi)::int, count(*)::int
      into v_n_new, v_n_all from ins;
    v_flags_new := v_flags_new + v_n_new;
    v_flags_seen := v_flags_seen + v_n_all;
  end if;

  -- ── Cờ E — cảm xúc theo chuỗi ngày mood xấu ───────────────────────────────
  -- Luật "cờ E gọn" (hành vi cố định số 4): detail chỉ chứa SỐ ĐẾM và tên cách đếm.
  -- Không một chữ nào của em đi vào đây — view nguồn (care.v_signal_emotion) cũng chỉ
  -- trả số, nên ngay cả khi ai đó copy câu này đi nơi khác cũng không lấy được nội dung.
  if 'E_MOOD' = any (v_rules) then
    with ins as (
      insert into care.flags as f (student_id, rule_code, as_of_date, detail, origin)
      select v.student_id,
             'E_MOOD',
             p_as_of,
             jsonb_build_object(
               'negative_streak', v.negative_streak,
               'negative_days',   v.negative_days,
               'mode',            coalesce(th.params ->> 'mode', 'streak'),
               'nguong',          coalesce((th.params ->> 'negative_days_streak')::int,
                                           (th.params ->> 'negative_days')::int)),
             p_mode
        from care.v_signal_emotion v
        join core.students s on s.id = v.student_id
        cross join lateral (select care.resolve_threshold('E_MOOD', s.school_id) as params) th
       where th.params is not null
         and coalesce((th.params ->> 'negative_days_streak')::int,
                      (th.params ->> 'negative_days')::int) is not null
         and (case when coalesce(th.params ->> 'mode', 'streak') = 'window'
                   then v.negative_days
                   else v.negative_streak
              end)
             >= coalesce((th.params ->> 'negative_days_streak')::int,
                         (th.params ->> 'negative_days')::int)
      on conflict (student_id, rule_code, as_of_date)
      do update set detail = excluded.detail
             where f.origin = excluded.origin
      returning (xmax = 0) as la_moi
    )
    select count(*) filter (where la_moi)::int, count(*)::int
      into v_n_new, v_n_all from ins;
    v_flags_new := v_flags_new + v_n_new;
    v_flags_seen := v_flags_seen + v_n_all;
  end if;

  -- ── Cờ E khẩn — em bấm "cần gặp thầy cô" ──────────────────────────────────
  if 'E_URGENT' = any (v_rules) then
    with ins as (
      insert into care.flags as f (student_id, rule_code, as_of_date, detail, origin)
      select v.student_id,
             'E_URGENT',
             p_as_of,
             -- Chỉ LOẠI tín hiệu. Chủ đề/mức khẩn/lời nhắn nằm ở attendance.help_requests
             -- với phạm vi đọc riêng (0037) và KHÔNG được nhân bản sang đây.
             jsonb_build_object('help_requested', true),
             p_mode
        from care.v_signal_emotion v
        join core.students s on s.id = v.student_id
        cross join lateral (select care.resolve_threshold('E_URGENT', s.school_id) as params) th
       where th.params is not null
         and coalesce((th.params ->> 'help_request')::boolean, true)
         and v.help_requested
      on conflict (student_id, rule_code, as_of_date)
      do update set detail = excluded.detail
             where f.origin = excluded.origin
      returning (xmax = 0) as la_moi
    )
    select count(*) filter (where la_moi)::int, count(*)::int
      into v_n_new, v_n_all from ins;
    v_flags_new := v_flags_new + v_n_new;
    v_flags_seen := v_flags_seen + v_n_all;
  end if;

  -- ── Gộp cờ thành hồ sơ, gán người điều phối (CHỈ mode live) ───────────────
  -- Hành vi cố định số 6 (ADR-016): nhánh backfill chỉ ghi lịch sử. Không mở hồ sơ, không
  -- vào hàng đợi leo thang. Không có luật này thì một lần promote 3 tháng dữ liệu cũ mở
  -- vài trăm hồ sơ can thiệp giả trong một đêm.
  if p_mode = 'live' then
    for r in
      select f.student_id, s.school_id
        from care.flags f
        join core.students s on s.id = f.student_id
       where f.as_of_date = p_as_of
         and f.origin = 'live'
       group by f.student_id, s.school_id
       order by f.student_id
    loop
      -- Một em một đầu mối: hồ sơ đang mở trong 30 ngày thì gắn thêm cờ vào đó.
      select cc.id into v_case_id
        from care.care_cases cc
       where cc.student_id = r.student_id
         and cc.status = 'open'
         and cc.opened_at >= now() - interval '30 days'
       limit 1;

      if v_case_id is null then
        -- Chủ hồ sơ mặc định là GVCN, suy từ NGUỒN SỰ THẬT core.class_assignments (0030),
        -- không đọc bản sao core.user_role_scopes.
        select u.id into v_owner
          from core.enrollments e
          join core.class_assignments ca on ca.class_id = e.class_id
                                        and ca.assignment_role = 'homeroom'
          join core.teachers t on t.id = ca.teacher_id
          join core.users    u on u.id = t.user_id
         where e.student_id = r.student_id
           and e.valid_to is null
         limit 1;

        -- Tâm lý cụm của cơ sở — người nhận khi GVCN đã quá định mức.
        select urs.user_id into v_counselor
          from core.user_role_scopes urs
         where urs.role_code = 'counselor'
           and (urs.school_id = r.school_id or urs.school_id is null)
         order by (urs.school_id is null)
         limit 1;

        if v_owner is not null then
          -- Rev B: khoá hàng người điều phối TRƯỚC khi đếm. Không có dòng này thì engine
          -- đêm và một người tạo hồ sơ bằng tay cùng đọc "đang có 4" rồi cùng ghi hồ sơ
          -- thứ 5 và thứ 6 — định mức 5 bị vượt mà không ai thấy.
          perform 1 from core.users where id = v_owner for update;

          select count(*)::int into v_open_cases
            from care.care_cases
           where owner_id = v_owner and status = 'open';

          if v_open_cases >= c_owner_quota then
            v_overflow := v_overflow + 1;
            -- Không có tâm lý cụm thì GIỮ NGUYÊN GVCN: một hồ sơ vô chủ tệ hơn một hồ sơ
            -- quá tải, và con số quá tải được ghi vào metrics để người vận hành thấy.
            v_owner := coalesce(v_counselor, v_owner);
          end if;
        else
          v_owner := v_counselor;
        end if;

        if v_owner is null then
          v_ownerless := v_ownerless + 1;
        end if;

        insert into care.care_cases (student_id, owner_id, tier)
        values (r.student_id, v_owner, 2)
        on conflict do nothing          -- care_cases_one_open_idx: một em một hồ sơ mở
        returning id into v_case_id;

        if v_case_id is null then
          -- Đã có hồ sơ mở nhưng cũ hơn 30 ngày (hoặc vừa có ai đó tạo song song):
          -- vẫn gắn vào đó, KHÔNG mở hồ sơ thứ hai và KHÔNG đổi chủ (0005:41).
          select cc.id into v_case_id
            from care.care_cases cc
           where cc.student_id = r.student_id and cc.status = 'open'
           limit 1;
        else
          v_cases_new := v_cases_new + 1;
        end if;
      end if;

      if v_case_id is not null then
        with att as (
          insert into care.care_case_flags (case_id, flag_id)
          select v_case_id, f.id
            from care.flags f
           where f.student_id = r.student_id
             and f.as_of_date = p_as_of
             and f.origin = 'live'
          on conflict do nothing
          returning 1
        )
        select count(*)::int into v_k from att;
        v_attached := v_attached + v_k;
      end if;
    end loop;

    -- ── Leo thang 7 ngày ────────────────────────────────────────────────────
    -- Hành vi cố định số 3: cờ không có ai động tới trong 7 ngày tự đẩy lên care team.
    -- "Không hành động" = không có dòng care.interventions nào ghi SAU khi cờ ra đời.
    -- Chốt chặn cho bệnh "đo rồi để đó".
    with esc as (
      insert into care.escalations (case_id, escalated_on, reason)
      select cc.id, p_as_of, 'no_action_7d'
        from care.care_cases cc
        join care.care_case_flags cf on cf.case_id = cc.id
        join care.flags f on f.id = cf.flag_id and f.origin = 'live'
       where cc.status = 'open'
         and f.as_of_date <= p_as_of - 7
         and not exists (select 1 from care.interventions i
                          where i.case_id = cc.id
                            and i.occurred_at >= f.created_at)
       group by cc.id
      on conflict (case_id, escalated_on) do nothing   -- §9
      returning 1
    )
    select count(*)::int into v_escalated from esc;
  end if;

  v_metrics := jsonb_build_object(
    'run_id',            v_run_id,
    'as_of_date',        p_as_of,
    'mode',              p_mode,
    'rules_evaluated',   to_jsonb(v_rules),
    'rules_skipped',     v_skipped,
    'degraded_sources',  to_jsonb(v_stale),
    'flags_new',         v_flags_new,
    'flags_seen',        v_flags_seen,
    'cases_new',         v_cases_new,
    'flags_attached',    v_attached,
    'quota_overflow',    v_overflow,
    'cases_without_owner', v_ownerless,
    'escalations_new',   v_escalated
  );

  -- ── Nạp bù: MỘT bản tóm tắt, không phải N ca ──────────────────────────────
  -- ADR-016 / hành vi cố định số 6. dedup_key không mang run_id nên chạy lại nạp bù trong
  -- cùng ngày KHÔNG sinh bản tin thứ hai (§9) — care team nhận đúng một lời nhắn.
  if p_mode = 'backfill' then
    insert into ops.outbox_messages (channel, dedup_key, payload)
    values ('care_team',
            'flag_engine_backfill:' || p_as_of::text,
            v_metrics)
    on conflict (dedup_key) do nothing;
  end if;

  update ops.job_runs
     set status           = 'success',
         finished_at      = now(),
         degraded_sources = v_stale,
         metrics          = v_metrics
   where id = v_run_id;

  return v_metrics;
end;
$$;

comment on function care.run_flag_engine(date, text) is
  'Bộ quét cờ ABC+E (04-flag-engine.md). Đọc ngưỡng qua care.resolve_threshold, đọc tín hiệu CHỈ qua care.v_signal_* (ADR-010), bỏ qua luật có nguồn hết tươi và ghi lý do vào metrics (ADR-016). mode=backfill chỉ ghi care.flags + một bản tóm tắt outbox: không mở hồ sơ, không leo thang. Chạy lại là no-op (§9).';

-- ---------------------------------------------------------------------------
-- 4. Quyền: đây là hàm của JOB, không phải của người dùng
-- ---------------------------------------------------------------------------
-- Postgres cấp EXECUTE cho PUBLIC theo mặc định với mọi hàm mới. Không thu lại thì bất kỳ
-- tài khoản đăng nhập nào cũng gọi được bộ quét — mở hồ sơ can thiệp cho cả trường, hoặc
-- đơn giản là bơm ops.job_runs cho buồng lái báo "vừa quét xong" trong khi không có gì
-- được quét. RLS chặn phần ghi (care.flags không có policy INSERT cho authenticated) nhưng
-- dựa vào một tầng duy nhất là cách lỗ hổng sinh ra — xem 0025.
revoke execute on function care.run_flag_engine(date, text) from public;

commit;
