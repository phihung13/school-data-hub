-- 0040_report_aggregate.sql
-- Đường đọc TỔNG HỢP cho vai `principal` (hiệu trưởng cơ sở) và `board` (ban điều
-- hành) — gói "man-hinh-bgh". Trước file này hai vai đó có 0 màn hình: `board` không
-- nằm trong `core.can_see_student` (0009) nên nhìn đâu cũng trống, còn `principal`
-- đọc được từng em ở cơ sở mình nhưng KHÔNG có bất kỳ con số tổng nào để nhìn.
--
-- ── Ràng buộc thiết kế, không phải gợi ý ────────────────────────────────────
-- DESIGN-GUIDELINES §9: "BGH/Điều hành: chỉ dữ liệu TỔNG HỢP theo lô, ghi rõ không
-- tra cứu học sinh cá nhân." Nên mọi thứ file này mở ra đều phải thoả BA điều:
--
--   1. KHÔNG cột nào trả về `student_id`, tên em, mã học sinh — kể cả gián tiếp.
--      Đơn vị nhỏ nhất là MỘT LỚP, không phải một em.
--   2. Nhóm quá nhỏ thì con số của lớp CHÍNH LÀ dữ liệu của một em. 0009 đã đặt
--      ngưỡng ẩn danh 10 cho `report.v_campus_trends` với đúng lý do đó; ở đây dùng
--      lại cùng một con số, đặt vào `report.min_cohort()` để hai chỗ không lệch nhau
--      về sau. Lớp dưới ngưỡng: trả NULL + `cohort_too_small = true`, KHÔNG trả 0.
--      Trả 0 là nói "lớp không có ai vắng" trong khi sự thật là "không được phép nói".
--   3. Người gọi sai vai phải nhận LỖI, không nhận bảng rỗng. Bảng rỗng đọc y hệt
--      "cả khối hôm nay không có gì" — đúng loại im-lặng-thành-kết-luận mà cả hệ này
--      đang chống. Vì vậy `report.aggregate_school_ids()` RAISE, và vì vậy hai hàm
--      bọc ngoài viết bằng plpgsql (gọi cổng TRƯỚC), không phải SQL thuần: trong SQL
--      thuần, cổng nằm trong mệnh đề IN có thể không bao giờ được chạy khi truy vấn
--      ngoài đã ra 0 dòng — cổng chặn không chạy là cổng không tồn tại.
--
-- ── Vì sao SECURITY DEFINER ──────────────────────────────────────────────────
-- Số "hồ sơ chăm sóc đang mở" nằm ở `care.care_cases`, mà `principal` KHÔNG đọc được
-- bảng đó (0009 + pgTAP 0023 khẳng định điều đó, và file này KHÔNG mở ra). Muốn đếm
-- mà không mở quyền đọc dòng thì phép đếm phải chạy bằng quyền khác — đó đúng là việc
-- của SECURITY DEFINER. Cái giá: hàm chạy bằng quyền chủ sở hữu nên nó tự nó là hàng
-- rào cuối. Bù lại bằng ba việc, cả ba đều có test:
--   · `set search_path` khoá cứng (không cho chèn schema giả).
--   · `revoke all … from public` rồi chỉ `grant execute … to authenticated` —
--     role `reporting` (§5, bộ sinh báo cáo học thuật) KHÔNG được cấp, nếu không thì
--     lệnh `revoke usage on schema attendance from reporting` (0009) bị đi vòng.
--   · `report.class_pulse_raw()` — nơi thật sự chạm dữ liệu — KHÔNG cấp cho ai cả;
--     chỉ hai hàm bọc (đã qua cổng vai) gọi được nó.
--
-- ── Cố ý KHÔNG có trong file này ─────────────────────────────────────────────
-- · Tên/ID giáo viên chủ nhiệm kèm số liệu lớp. Ghép "cô nào" với "tâm trạng lớp"
--   là dựng sẵn một bảng xếp hạng giáo viên bằng cảm xúc trẻ con — §5 cấm dùng dữ
--   liệu cảm xúc để xếp loại, và cấm cả việc dọn sẵn đường cho nó.
-- · Nội dung cờ, ghi chú tư vấn, nhật ký y tế, "cần gặp thầy cô". Chỉ có PHÉP ĐẾM
--   hồ sơ đang mở, đúng ô "count-only" của ma trận.
--
-- Phụ thuộc: 0002 (classes/enrollments), 0004 (checkins), 0005 (care_cases),
--            0009 (has_role, current_user_id, schema report + grant usage).

begin;

-- ---------------------------------------------------------------------------
-- 1. Ngưỡng ẩn danh — một con số, một chỗ
-- ---------------------------------------------------------------------------
-- Không đặt vào `care.thresholds` (mệnh lệnh 7): bảng đó là ngưỡng CẢNH BÁO, khoá
-- chính của nó là `rule_code` và `care.flags` tham chiếu FK tới đó — nhét một dòng
-- không phải luật cờ vào sẽ làm bẩn cả hai. Đây là hằng số riêng tư của tầng báo cáo.
create or replace function report.min_cohort()
returns int
language sql
immutable
as $$ select 10 $$;

comment on function report.min_cohort() is
  'Ngưỡng ẩn danh cho mọi con số tổng hợp gửi BGH: dưới 10 người thì "số của lớp" thực chất là dữ liệu của một em (cùng con số với having count(*) >= 10 của report.v_campus_trends, 0009).';

-- ---------------------------------------------------------------------------
-- 2. Cổng vai + phạm vi cơ sở
-- ---------------------------------------------------------------------------
-- `board` = toàn hệ (ma trận 02-database.md: aggregate-only, không giới hạn cơ sở).
-- `principal` = đúng những cơ sở ghi trong `core.user_role_scopes` của chính họ —
-- lấy từ đó chứ không lấy từ JWT, cùng lý do với `loadMyScopes` ở tầng tRPC.
--
-- Ai không mang vai nào trong hai vai: RAISE 42501. Không trả rỗng. (Điều 3 ở đầu file.)
create or replace function report.aggregate_school_ids()
returns table (school_id uuid)
language plpgsql
stable
security definer
set search_path = core, pg_temp
as $$
declare
  v_ids uuid[];
begin
  if core.has_role('board') then
    return query select s.id from core.schools s;
    return;
  end if;

  select array_agg(distinct urs.school_id)
    into v_ids
    from core.user_role_scopes urs
   where urs.user_id = core.current_user_id()
     and urs.role_code = 'principal'
     and urs.school_id is not null;

  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'Màn hình điều hành chỉ dành cho hiệu trưởng cơ sở và ban điều hành'
      using errcode = '42501',
            hint = 'Cấp vai principal (kèm school_id) hoặc board trong core.user_role_scopes.';
  end if;

  return query select unnest(v_ids);
end;
$$;

comment on function report.aggregate_school_ids() is
  'Phạm vi cơ sở của người đang xem màn Điều hành. board = mọi cơ sở; principal = cơ sở ghi trong user_role_scopes; vai khác = RAISE 42501 (KHÔNG trả rỗng — rỗng đọc thành "hôm nay không có gì").';

revoke all on function report.aggregate_school_ids() from public;
revoke all on function report.min_cohort() from public;
grant execute on function report.aggregate_school_ids() to authenticated;
grant execute on function report.min_cohort() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Số liệu thô theo lớp — KHÔNG cổng, KHÔNG cấp quyền cho ai
-- ---------------------------------------------------------------------------
-- Tách riêng vì hai hàm bọc (theo lớp / theo khối) phải đếm từ CÙNG MỘT nguồn: viết
-- hai câu truy vấn gần giống nhau là bảo đảm sau ba lần sửa thì "tổng khối" không còn
-- bằng tổng các lớp trong khối, và không ai biết bên nào đúng.
--
-- Không có GRANT nào cho hàm này. Nó chỉ gọi được từ trong hai hàm bọc (đang chạy
-- bằng quyền chủ sở hữu), nên không có đường nào để một phiên `authenticated` bất kỳ
-- gọi thẳng vào đây mà bỏ qua cổng vai.
--
-- `no_record_count` là cột quan trọng nhất của hàm này: em không có dòng check-in nào
-- KHÔNG phải là em vắng. Trước đây chỗ nào cũng phải tự trừ ra và luôn có người quên,
-- rồi "chưa ai bấm" bị vẽ thành "cả lớp vắng". Ở đây nó là một cột có tên.
create or replace function report.class_pulse_raw(p_on_date date)
returns table (
  school_id           uuid,
  class_id            uuid,
  class_code          text,
  grade               smallint,
  academic_year       text,
  roster_count        int,
  checked_in_count    int,
  pending_late_count  int,
  absent_count        int,
  excused_count       int,
  no_record_count     int,
  mood_reported       int,
  mood_happy          int,
  mood_normal         int,
  mood_tired          int,
  mood_sad            int,
  open_care_count     int
)
language sql
stable
security definer
set search_path = core, attendance, care, pg_temp
as $$
  with roster as (
    -- "Đang học" = `valid_to is null`. Đây là ĐÚNG định nghĩa mà cả hệ đang dùng, kể
    -- cả `core.is_homeroom_of` (0009) — tức là định nghĩa mà RLS tin. Viết một định
    -- nghĩa thứ hai ở đây (lọc thêm theo `valid_from <= p_on_date`) nghe có vẻ chặt
    -- hơn, nhưng nó tạo ra một sĩ số KHÁC sĩ số mà buồng lái GVCN đang hiện, và hai
    -- màn hình nói hai con số cho cùng một lớp thì không màn nào còn đáng tin.
    --
    -- Hệ quả phải biết: `roster_count` là sĩ số HIỆN TẠI, còn `p_on_date` chỉ chọn
    -- NGÀY điểm danh. Hỏi một ngày xa trong quá khứ sẽ ghép sĩ số hôm nay với điểm
    -- danh ngày đó — `no_record_count` có `greatest(…, 0)` để không bao giờ ra số âm,
    -- nhưng tầng gọi vẫn phải giữ p_on_date trong khoảng gần (router chặn).
    select e.class_id as cls, e.student_id
      from core.enrollments e
     where e.valid_to is null
  ),
  roster_agg as (
    select r.cls, count(*)::int as n from roster r group by r.cls
  ),
  day_rows as (
    -- `checkins_uq (student_id, occurred_on, kind)` bảo đảm mỗi em nhiều nhất MỘT dòng
    -- 'in' mỗi ngày, nên mọi phép đếm dưới đây không thể đếm trùng một em thành hai.
    select r.cls, c.status, c.mood
      from roster r
      join attendance.checkins c
        on c.student_id = r.student_id
       and c.occurred_on = p_on_date
       and c.kind = 'in'
  ),
  day_agg as (
    select d.cls,
           count(*) filter (where d.status in ('present', 'late'))::int as checked_in,
           count(*) filter (where d.status = 'queued_late')::int        as pending_late,
           count(*) filter (where d.status = 'absent')::int             as absent,
           count(*) filter (where d.status = 'excused')::int            as excused,
           count(d.mood)::int                                           as mood_reported,
           count(*) filter (where d.mood = 4)::int                      as mood_happy,
           count(*) filter (where d.mood = 3)::int                      as mood_normal,
           count(*) filter (where d.mood = 2)::int                      as mood_tired,
           count(*) filter (where d.mood = 1)::int                      as mood_sad
      from day_rows d
     group by d.cls
  ),
  care_agg as (
    select r.cls, count(*)::int as n
      from roster r
      join care.care_cases cc on cc.student_id = r.student_id and cc.status = 'open'
     group by r.cls
  )
  select cl.school_id,
         cl.id,
         cl.code,
         cl.grade,
         cl.academic_year,
         coalesce(ra.n, 0),
         coalesce(da.checked_in, 0),
         coalesce(da.pending_late, 0),
         coalesce(da.absent, 0),
         coalesce(da.excused, 0),
         greatest(
           coalesce(ra.n, 0)
             - coalesce(da.checked_in, 0)
             - coalesce(da.pending_late, 0)
             - coalesce(da.absent, 0)
             - coalesce(da.excused, 0),
           0
         ),
         coalesce(da.mood_reported, 0),
         coalesce(da.mood_happy, 0),
         coalesce(da.mood_normal, 0),
         coalesce(da.mood_tired, 0),
         coalesce(da.mood_sad, 0),
         coalesce(ca.n, 0)
    from core.classes cl
    left join roster_agg ra on ra.cls = cl.id
    left join day_agg    da on da.cls = cl.id
    left join care_agg   ca on ca.cls = cl.id
$$;

comment on function report.class_pulse_raw(date) is
  'Số liệu thô theo LỚP cho tầng tổng hợp. KHÔNG cấp quyền cho bất kỳ role nào — chỉ report.class_pulse/report.grade_pulse (đã qua cổng vai) gọi được. Đơn vị nhỏ nhất là lớp: không cột nào mang student_id.';

revoke all on function report.class_pulse_raw(date) from public;

-- ---------------------------------------------------------------------------
-- 4. Theo LỚP — có cổng vai, có ngưỡng ẩn danh
-- ---------------------------------------------------------------------------
-- Che gì khi lớp dưới ngưỡng: mọi SỐ ĐO (điểm danh, tâm trạng, hồ sơ chăm sóc) → NULL.
-- Giữ lại: mã lớp, khối, sĩ số. Sĩ số không phải dữ liệu cá nhân và nó chính là thứ
-- giải thích vì sao phần còn lại bị che — che luôn cả sĩ số thì màn hình biến thành
-- một dòng trống không ai hiểu, và người dùng sẽ đi hỏi thẳng GVCN từng em.
create or replace function report.class_pulse(
  p_on_date       date default current_date,
  p_academic_year text default null
)
returns table (
  school_id           uuid,
  class_id            uuid,
  class_code          text,
  grade               smallint,
  academic_year       text,
  roster_count        int,
  cohort_too_small    boolean,
  checked_in_count    int,
  pending_late_count  int,
  absent_count        int,
  excused_count       int,
  no_record_count     int,
  mood_reported       int,
  mood_happy          int,
  mood_normal         int,
  mood_tired          int,
  mood_sad            int,
  open_care_count     int
)
language plpgsql
stable
security definer
set search_path = report, pg_temp
as $$
declare
  v_scope uuid[];
  v_min   int := report.min_cohort();
begin
  -- Gọi cổng TRƯỚC và cho kết quả vào biến: nếu để nó nằm trong mệnh đề IN của câu
  -- truy vấn bên dưới thì bộ tối ưu có quyền không bao giờ chạy nó (xem đầu file).
  select array_agg(s.school_id) into v_scope from report.aggregate_school_ids() s;

  return query
    select b.school_id,
           b.class_id,
           b.class_code,
           b.grade,
           b.academic_year,
           b.roster_count,
           (b.roster_count < v_min),
           case when b.roster_count < v_min then null else b.checked_in_count   end,
           case when b.roster_count < v_min then null else b.pending_late_count end,
           case when b.roster_count < v_min then null else b.absent_count       end,
           case when b.roster_count < v_min then null else b.excused_count      end,
           case when b.roster_count < v_min then null else b.no_record_count    end,
           case when b.roster_count < v_min then null else b.mood_reported      end,
           -- Phân bố tâm trạng cần ngưỡng RIÊNG, tính trên số em ĐÃ GHI tâm trạng:
           -- lớp 30 em mà mới 3 em bấm thì "2 buồn" vẫn là chuyện của 3 người cụ thể.
           case when b.roster_count < v_min or b.mood_reported < v_min then null else b.mood_happy  end,
           case when b.roster_count < v_min or b.mood_reported < v_min then null else b.mood_normal end,
           case when b.roster_count < v_min or b.mood_reported < v_min then null else b.mood_tired  end,
           case when b.roster_count < v_min or b.mood_reported < v_min then null else b.mood_sad    end,
           case when b.roster_count < v_min then null else b.open_care_count    end
      from report.class_pulse_raw(p_on_date) b
     where b.school_id = any (coalesce(v_scope, '{}'::uuid[]))
       and (p_academic_year is null or b.academic_year = p_academic_year)
     order by b.grade, b.class_code;
end;
$$;

comment on function report.class_pulse(date, text) is
  'DESIGN-GUIDELINES §9 — nhịp của TỪNG LỚP cho BGH. Không student_id, không tên em, không tên GVCN. Lớp dưới report.min_cohort() bị che mọi số đo (cohort_too_small = true), phân bố tâm trạng còn phải đủ ngưỡng trên số em đã ghi.';

-- ---------------------------------------------------------------------------
-- 5. Theo KHỐI — cùng nguồn, cộng lên
-- ---------------------------------------------------------------------------
-- Đây mới là mức mà BGH thật sự ra quyết định, và cũng là mức mà ngưỡng ẩn danh gần
-- như luôn thoả: một khối nhiều lớp thì tổng vượt 10 dễ dàng. Cộng từ
-- `class_pulse_raw` (số CHƯA che) chứ không cộng từ `class_pulse`: cộng các NULL đã
-- che sẽ ra một tổng khối nhỏ hơn sự thật mà vẫn trông như một con số bình thường.
create or replace function report.grade_pulse(
  p_on_date       date default current_date,
  p_academic_year text default null
)
returns table (
  school_id           uuid,
  grade               smallint,
  class_count         int,
  roster_count        int,
  cohort_too_small    boolean,
  checked_in_count    int,
  pending_late_count  int,
  absent_count        int,
  excused_count       int,
  no_record_count     int,
  mood_reported       int,
  mood_happy          int,
  mood_normal         int,
  mood_tired          int,
  mood_sad            int,
  open_care_count     int
)
language plpgsql
stable
security definer
set search_path = report, pg_temp
as $$
declare
  v_scope uuid[];
  v_min   int := report.min_cohort();
begin
  select array_agg(s.school_id) into v_scope from report.aggregate_school_ids() s;

  return query
    -- Cột trong CTE cố ý mang tên KHÁC tên cột đầu ra (m_rep, m_happy…): trong plpgsql,
    -- trùng tên với tham số OUT là nguồn của lỗi "column reference is ambiguous" mà
    -- chỉ nổ ra lúc chạy, không phải lúc tạo hàm.
    with g as (
      select b.school_id                     as sid,
             b.grade                         as grd,
             count(*) filter (where b.roster_count > 0)::int as n_class,
             sum(b.roster_count)::int        as roster,
             sum(b.checked_in_count)::int    as checked_in,
             sum(b.pending_late_count)::int  as pending_late,
             sum(b.absent_count)::int        as absent,
             sum(b.excused_count)::int       as excused,
             sum(b.no_record_count)::int     as no_record,
             sum(b.mood_reported)::int       as m_rep,
             sum(b.mood_happy)::int          as m_happy,
             sum(b.mood_normal)::int         as m_normal,
             sum(b.mood_tired)::int          as m_tired,
             sum(b.mood_sad)::int            as m_sad,
             sum(b.open_care_count)::int     as open_care
        from report.class_pulse_raw(p_on_date) b
       where b.school_id = any (coalesce(v_scope, '{}'::uuid[]))
         and (p_academic_year is null or b.academic_year = p_academic_year)
       group by b.school_id, b.grade
    )
    select g.sid,
           g.grd,
           g.n_class,
           g.roster,
           (g.roster < v_min),
           case when g.roster < v_min then null else g.checked_in   end,
           case when g.roster < v_min then null else g.pending_late end,
           case when g.roster < v_min then null else g.absent       end,
           case when g.roster < v_min then null else g.excused      end,
           case when g.roster < v_min then null else g.no_record    end,
           case when g.roster < v_min then null else g.m_rep        end,
           case when g.roster < v_min or g.m_rep < v_min then null else g.m_happy  end,
           case when g.roster < v_min or g.m_rep < v_min then null else g.m_normal end,
           case when g.roster < v_min or g.m_rep < v_min then null else g.m_tired  end,
           case when g.roster < v_min or g.m_rep < v_min then null else g.m_sad    end,
           case when g.roster < v_min then null else g.open_care    end
      from g
     where g.n_class > 0
     order by g.grd;
end;
$$;

comment on function report.grade_pulse(date, text) is
  'DESIGN-GUIDELINES §9 — nhịp theo KHỐI (nhiều lớp, nhiều GVCN) cho BGH. Cộng từ class_pulse_raw (số chưa che) để tổng khối luôn bằng tổng thật của các lớp trong khối.';

revoke all on function report.class_pulse(date, text) from public;
revoke all on function report.grade_pulse(date, text) from public;
grant execute on function report.class_pulse(date, text) to authenticated;
grant execute on function report.grade_pulse(date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Chỉ mục cho phép quét một NGÀY của cả khối
-- ---------------------------------------------------------------------------
-- Chỉ mục sẵn có `checkins_student_date_idx (student_id, occurred_on desc)` phục vụ
-- câu hỏi "em này hôm nào", còn màn Điều hành hỏi ngược lại: "ngày này những em nào".
-- Không có chỉ mục theo ngày thì mỗi lần mở màn là một lần quét toàn bảng check-in.
create index if not exists checkins_day_in_idx
  on attendance.checkins (occurred_on) where kind = 'in';

comment on index attendance.checkins_day_in_idx is
  'report.class_pulse_raw quét theo NGÀY cho cả khối — chiều ngược với checkins_student_date_idx.';

commit;
