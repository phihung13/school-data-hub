-- 0009_rls_and_views.sql
-- Phân quyền từng dòng theo đúng ma trận trong 02-database.md, + signal views, + report views.
--
-- Nguyên tắc: KHÔNG có vai trò "xem mọi thứ cho tiện".
-- Hai lớp cùng gác: API kiểm quyền theo lệnh, database kiểm quyền theo dòng.
-- Thiếu một lớp thì vẫn đóng (fail closed).

begin;

-- ---------------------------------------------------------------------------
-- Hàm phạm vi — mọi policy gọi chung, sửa một chỗ là đổi khắp nơi
-- ---------------------------------------------------------------------------
create or replace function core.has_role(p_role text)
returns boolean
language sql stable security definer
set search_path = core, pg_temp
as $$
  select exists (
    select 1 from core.user_role_scopes s
     where s.user_id = core.current_user_id() and s.role_code = p_role
  );
$$;

create or replace function core.is_homeroom_of(p_student uuid)
returns boolean
language sql stable security definer
set search_path = core, pg_temp
as $$
  select exists (
    select 1
      from core.enrollments e
      join core.class_assignments ca on ca.class_id = e.class_id
                                    and ca.assignment_role = 'homeroom'
      join core.teachers t  on t.id = ca.teacher_id
     where e.student_id = p_student
       and e.valid_to is null
       and t.user_id = core.current_user_id()
  );
$$;

create or replace function core.teaches(p_student uuid)
returns boolean
language sql stable security definer
set search_path = core, pg_temp
as $$
  select exists (
    select 1
      from core.enrollments e
      join core.class_assignments ca on ca.class_id = e.class_id
      join core.teachers t  on t.id = ca.teacher_id
     where e.student_id = p_student
       and e.valid_to is null
       and t.user_id = core.current_user_id()
  );
$$;

-- Cụm = tập cơ sở ghi trong phạm vi vai trò counselor của chính người đó.
create or replace function core.in_my_cluster(p_student uuid)
returns boolean
language sql stable security definer
set search_path = core, pg_temp
as $$
  select exists (
    select 1
      from core.students st
      join core.user_role_scopes s on s.school_id = st.school_id
     where st.id = p_student
       and s.user_id = core.current_user_id()
       and s.role_code = 'counselor'
  );
$$;

create or replace function core.is_my_child(p_student uuid)
returns boolean
language sql stable security definer
set search_path = core, pg_temp
as $$
  select exists (
    select 1
      from core.parent_students ps
      join core.parents p on p.id = ps.parent_id
     where ps.student_id = p_student
       and p.user_id = core.current_user_id()
  );
$$;

create or replace function core.is_me(p_student uuid)
returns boolean
language sql stable security definer
set search_path = core, pg_temp
as $$
  select exists (
    select 1 from core.students st
     where st.id = p_student and st.user_id = core.current_user_id()
  );
$$;

create or replace function core.principal_of(p_student uuid)
returns boolean
language sql stable security definer
set search_path = core, pg_temp
as $$
  select exists (
    select 1
      from core.students st
      join core.user_role_scopes s on s.school_id = st.school_id
     where st.id = p_student
       and s.user_id = core.current_user_id()
       and s.role_code = 'principal'
  );
$$;

-- Hàng "core / tutor / evidence / attendance" của ma trận, gói thành một câu hỏi.
create or replace function core.can_see_student(p_student uuid)
returns boolean
language sql stable
as $$
  select core.is_me(p_student)
      or core.is_my_child(p_student)
      or core.teaches(p_student)
      or core.is_homeroom_of(p_student)
      or core.in_my_cluster(p_student)
      or core.principal_of(p_student);
$$;
comment on function core.can_see_student(uuid) is
  'Ma trận RLS hàng 1. KHÔNG bao gồm board: hiệu trưởng cấp hệ và hội đồng chỉ xem số tổng hợp (view report).';

-- Vùng nhạy cảm: hẹp hơn hẳn, không dùng chung hàm trên.
create or replace function core.can_see_care(p_student uuid)
returns boolean
language sql stable
as $$
  select core.is_homeroom_of(p_student) or core.in_my_cluster(p_student);
$$;

create or replace function core.can_see_health(p_student uuid)
returns boolean
language sql stable
as $$
  -- Giáo viên bộ môn KHÔNG có mặt ở đây — đó là chủ ý (ADR-009).
  select core.is_my_child(p_student)
      or core.is_homeroom_of(p_student)
      or core.in_my_cluster(p_student);
$$;

-- ---------------------------------------------------------------------------
-- Áp policy cho nhóm bảng gắn học sinh.
-- Dùng vòng lặp thay vì chép tay 20 lần: chép tay là nơi lỗi phân quyền sinh ra.
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('attendance', 'checkins'),        ('attendance', 'help_requests'),
      ('attendance', 'mood_trends'),
      ('evidence',   'value_behaviors'), ('evidence',   'event_roles'),
      ('evidence',   'pdr_reflections'), ('evidence',   'dear_logs'),
      ('evidence',   'rubric_scores'),   ('evidence',   'fitness_tests'),
      ('evidence',   'club_attendance'), ('evidence',   'survey_responses'),
      ('tutor',      'mastery_snapshots'),('tutor',     'cefr_results'),
      ('tutor',      'cefr_trajectories'),('tutor',     'milestones'),
      ('tutor',      'moodle_progress')
    ) as v(sch, tbl)
  loop
    execute format('alter table %I.%I enable row level security', t.sch, t.tbl);
    execute format('drop policy if exists %I_scope on %I.%I', t.tbl, t.sch, t.tbl);
    execute format(
      'create policy %I_scope on %I.%I for select to authenticated
         using (core.can_see_student(student_id))',
      t.tbl, t.sch, t.tbl
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- core: học sinh và người dùng
-- ---------------------------------------------------------------------------
alter table core.students enable row level security;
create policy students_scope on core.students for select to authenticated
  using (core.can_see_student(id));

alter table core.users enable row level security;
create policy users_self on core.users for select to authenticated
  using (id = core.current_user_id());
-- Danh bạ chung không mở mặc định: cần thì mở bằng view có kiểm soát, không mở cả bảng.

alter table core.enrollments enable row level security;
create policy enrollments_scope on core.enrollments for select to authenticated
  using (core.can_see_student(student_id));

alter table core.id_mappings enable row level security;
-- Deny by default: sổ đối chiếu chỉ dành cho connector/adapter chạy phía máy chủ.

-- ---------------------------------------------------------------------------
-- care: hẹp hơn. Hiệu trưởng KHÔNG tra cứu tự do — xem qua màn hình care team có audit.
-- ---------------------------------------------------------------------------
alter table care.flags        enable row level security;
alter table care.care_cases   enable row level security;
alter table care.interventions enable row level security;
alter table care.counselor_notes enable row level security;
alter table care.escalations  enable row level security;
alter table care.thresholds   enable row level security;

create policy flags_scope on care.flags for select to authenticated
  using (core.can_see_care(student_id));

create policy care_cases_scope on care.care_cases for select to authenticated
  using (core.can_see_care(student_id));

create policy interventions_scope on care.interventions for select to authenticated
  using (exists (select 1 from care.care_cases c
                  where c.id = case_id and core.can_see_care(c.student_id)));

create policy escalations_scope on care.escalations for select to authenticated
  using (exists (select 1 from care.care_cases c
                  where c.id = case_id and core.can_see_care(c.student_id)));

-- Ghi chú tư vấn: hẹp nhất trong care.
create policy counselor_notes_scope on care.counselor_notes for select to authenticated
  using (exists (select 1 from care.care_cases c
                  where c.id = case_id and core.can_see_care(c.student_id)));

-- §6: ai cũng đọc được ngưỡng (minh bạch), chỉ Hội đồng dữ liệu ghi.
create policy thresholds_read on care.thresholds for select to authenticated
  using (true);
create policy thresholds_write on care.thresholds for all to authenticated
  using (core.has_role('board')) with check (core.has_role('board'));

-- ---------------------------------------------------------------------------
-- health: chặt nhất
-- ---------------------------------------------------------------------------
alter table health.logs            enable row level security;
alter table health.meal_sleep_logs enable row level security;

create policy health_logs_scope on health.logs for select to authenticated
  using (core.can_see_health(student_id));
create policy meal_sleep_scope on health.meal_sleep_logs for select to authenticated
  using (core.can_see_health(student_id));

-- ---------------------------------------------------------------------------
-- Quyền bảng cho người dùng đã đăng nhập.
-- RLS chỉ LỌC DÒNG; nếu không cấp quyền bảng thì người dùng nhận "permission denied"
-- thay vì "không có dòng nào" — hai thứ khác nhau, và cái sau mới là hành vi đúng.
-- Cố tình KHÔNG cấp trên staging (§8) và trên sổ đối chiếu (chỉ máy chủ chạm).
-- ---------------------------------------------------------------------------
grant usage on schema core, attendance, care, evidence, tutor, health, ops, report to authenticated;
grant select on core.students, core.users, core.enrollments, core.classes, core.schools to authenticated;
grant select on all tables in schema attendance, evidence, tutor, health, care to authenticated;
grant select on core.id_mappings to authenticated;   -- RLS không có policy ⇒ luôn 0 dòng
grant select on ops.job_runs to authenticated;       -- buồng lái cần dòng "quét đêm qua HH:mm"
grant insert, update on care.thresholds to authenticated;  -- lọc tiếp bằng policy thresholds_write

alter table ops.job_runs enable row level security;
create policy job_runs_read on ops.job_runs for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- §5 — TƯỜNG LỬA giữa chăm sóc và đánh giá.
-- Bộ sinh báo cáo học thuật/xếp loại không được chạm dữ liệu cảm xúc.
-- Cưỡng chế bằng quyền cấp bảng: mạnh hơn mọi lời hứa trong code.
-- ---------------------------------------------------------------------------
grant usage on schema core, evidence, tutor, report to reporting;
grant select on core.students, core.classes, core.schools, core.enrollments to reporting;
grant select on all tables in schema tutor to reporting;
grant select on evidence.value_behaviors, evidence.event_roles,
                evidence.rubric_scores, evidence.fitness_tests,
                evidence.club_attendance, evidence.dear_logs to reporting;

revoke all on attendance.checkins       from reporting;
revoke all on care.counselor_notes      from reporting;
revoke all on evidence.survey_responses from reporting;
revoke usage on schema attendance, care, health from reporting;

-- ADR-006: job backup chỉ đọc.
grant usage on schema core, attendance, care, evidence, tutor, health, staging, ops to backup_reader;
grant select on all tables in schema core, attendance, care, evidence, tutor, health, staging, ops to backup_reader;

-- ---------------------------------------------------------------------------
-- Signal views — HỢP ĐỒNG giữa các Mini App và flag engine (ADR-010).
-- Engine chỉ được đọc qua đây; đọc thẳng bảng của Mini App khác là lỗi review.
-- Đổi bảng gốc phải sửa view CÙNG PR — fixture 20 học sinh trong CI bắt gãy ngay.
-- ---------------------------------------------------------------------------
create or replace view care.v_signal_attendance as
  select e.student_id,
         count(*) filter (where c.status in ('present', 'late'))::numeric
           / nullif(count(*), 0) as attendance_rate,
         max(c.occurred_on)      as last_seen_on
    from core.enrollments e
    join attendance.checkins c on c.student_id = e.student_id
   where e.valid_to is null
     and c.occurred_on >= current_date - 30
   group by e.student_id;

create or replace view care.v_signal_behavior as
  select student_id, count(*) as incident_count
    from evidence.value_behaviors
   where week_start >= current_date - 30
     and self_score = 0
   group by student_id;

create or replace view care.v_signal_course as
  select student_id,
         count(*) filter (where mastery < 50) as weak_strands,
         max(as_of_date)                      as as_of_date
    from tutor.mastery_snapshots
   where as_of_date >= current_date - 14
   group by student_id;

create or replace view care.v_signal_emotion as
  select c.student_id,
         count(*) filter (where c.mood <= 2)                  as negative_days,
         bool_or(h.student_id is not null)                    as help_requested,
         max(c.occurred_on)                                   as last_checkin_on
    from attendance.checkins c
    left join attendance.help_requests h
           on h.student_id = c.student_id and h.requested_on = c.occurred_on
   where c.occurred_on >= current_date - 14
   group by c.student_id;

comment on view care.v_signal_emotion is
  'Luật "cờ E gọn": view trả SỐ ĐẾM tín hiệu, không trả nội dung. Cờ sinh ra từ đây không thể mang theo tâm sự.';

-- ---------------------------------------------------------------------------
-- report: chỉ số tổng hợp. Hiệu trưởng hệ và hội đồng dừng ở đây.
-- ---------------------------------------------------------------------------
create or replace view report.v_campus_trends as
  select s.school_id,
         c.occurred_on,
         count(*)                                        as checkin_count,
         avg(c.mood)::numeric(3,2)                       as avg_mood,
         count(*) filter (where c.status = 'absent')     as absent_count
    from attendance.checkins c
    join core.students s on s.id = c.student_id
   group by s.school_id, c.occurred_on
  having count(*) >= 10;   -- ngưỡng ẩn danh: nhóm quá nhỏ thì suy ngược ra được cá nhân

comment on view report.v_campus_trends is
  'Ngưỡng gộp ≥10 lượt: dưới mức đó, "số trung bình của lớp" thực chất là dữ liệu của một em.';

create or replace view report.v_vaar_indicators as
  select s.school_id,
         date_trunc('month', f.as_of_date)::date as period_month,
         f.rule_code,
         count(*) as flag_count
    from care.flags f
    join core.students s on s.id = f.student_id
   group by 1, 2, 3;
-- Bộ lọc "chỉ cờ live" được thêm ở 0012, sau khi cột origin tồn tại.

commit;
