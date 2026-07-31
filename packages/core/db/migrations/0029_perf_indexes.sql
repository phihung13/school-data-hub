-- 0029_perf_indexes.sql
-- Hiệu năng nền của lớp phân quyền: bỏ truy vấn lặp trong core.current_user_id()
-- và bù 5 index nằm trên đường nóng. KHÔNG đổi một dòng ngữ nghĩa phân quyền nào —
-- chữ ký hàm giữ nguyên, không policy nào phải sửa.
--
-- ---------------------------------------------------------------------------
-- BẰNG CHỨNG ĐO ĐƯỢC (31/07/2026, PostgreSQL 16.14 trong container pg_hub)
--
-- Bộ dữ liệu đo: 6 cơ sở · 120 lớp · 360 giáo viên · 3.600 học sinh · 3.600 phụ
-- huynh · 216.000 check-in (60 ngày) · 480 hồ sơ care · 2.400 can thiệp · 55.000
-- dòng ops.job_runs — đúng cỡ "≤5.000 user" của 05-capacity-ops.md. Hai database
-- song sinh (`hub_base` không có file này, `hub_perf` có), cùng dữ liệu, cùng
-- `vacuum analyze`, đo bằng EXPLAIN (ANALYZE, BUFFERS) dưới vai GVCN thật.
--
--   Câu                                      buffers TRƯỚC → SAU     thời gian
--   priorityFlags (care.ts getDashboard)      21.329 → 14.216 (−33%)  67 → 37 ms
--   lastScanAt   (max finished_at job_runs)      734 →      3 (−99,6%) 49 → 0,1 ms
--   recentActions (care.interventions)        11.680 →  1.511 (−87%)  38 → 5,9 ms
--   totalsToday  (đếm check-in hôm nay)        2.240 →  1.579 (−30%)   9 → 4,6 ms
--   core.v_my_homeroom_teacher (/ho-so)           65 →     14 (−78%)  6,5 → 0,3 ms
--
-- Số nói thẳng nhất nằm ở pg_stat_user_tables: chạy MỘT lần câu priorityFlags,
-- `core.users` bị quét chỉ số 2.241 lần TRƯỚC và 1 lần SAU. 2.241 lượt tra bảng
-- cho một lần mở buồng lái 30 em là vì mỗi DÒNG được quét đều chạy lại
-- `core.can_see_student(student_id)` → 6 hàm phạm vi → mỗi hàm gọi
-- `core.current_user_id()` → mỗi lần gọi là một truy vấn SPI vào core.users.
-- Con số đó lớn tuyến tính theo sĩ số × số ngày: càng dùng thật càng chậm.
--
-- 33% còn lại của priorityFlags KHÔNG phải lỗi index — nó là hình dạng câu truy
-- vấn hiện tại của care.ts (LEFT JOIN help_requests và care_cases không giới hạn
-- theo lớp), nên RLS phải chạy trên 240 hồ sơ care và 36 yêu cầu giúp đỡ của
-- TOÀN HỆ rồi mới vứt đi. Gói care-router đổi khung truy vấn sang lấy
-- core.enrollments làm gốc; lúc đó chính các index dưới đây mới ăn hết phần còn lại.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Ngữ cảnh phiên: giải một lần mỗi transaction thay vì một lần mỗi dòng
--
-- `core.begin_user_context()` là chỗ DUY NHẤT được phép ghi bộ đệm này. Ứng dụng
-- KHÔNG bao giờ tự bịa `request.hub.user_id` — nó chỉ đưa vào auth_uid (thứ đã ký
-- trong JWT), còn phần tra cứu + kiểm `status = 'active'` vẫn nằm trong database,
-- đúng chỗ nó vẫn nằm. Nhờ vậy ADR-016 "khoá là cắt" tiếp tục được cưỡng chế bởi
-- database chứ không bởi thiện chí của tầng ứng dụng.
--
-- Mức tin cậy của `request.hub.*` bằng đúng mức của `request.jwt.claim.sub` đã
-- dùng từ 0001: chỉ tiến trình máy chủ đặt được, người dùng cuối không có đường
-- chạy SQL tự do (§4 — client chỉ đi qua tRPC).
-- ---------------------------------------------------------------------------
create or replace function core.begin_user_context(p_auth_uid uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = core, pg_temp
as $$
declare
  v_id uuid;
begin
  -- is_local = true cho cả ba: GUC chết theo commit/rollback. Bắt buộc, vì pool
  -- dùng lại socket cho người khác — GUC mức session sẽ là rò rỉ danh tính.
  perform set_config('request.jwt.claim.sub', p_auth_uid::text, true);

  select u.id into v_id
    from core.users u
   where u.auth_uid = p_auth_uid
     and u.status = 'active';

  -- Ghi CẶP (auth_uid, user_id): core.current_user_id() chỉ tin bộ đệm khi auth_uid
  -- trong đệm khớp claim hiện hành. Nhờ đó một transaction đổi danh tính giữa chừng
  -- (test_support.login_as gọi hai lần trong pgTAP) không lặng lẽ dùng lại uid của
  -- người trước — nó rơi về nhánh tra bảng.
  perform set_config('request.hub.auth_uid', p_auth_uid::text, true);
  perform set_config('request.hub.user_id', coalesce(v_id::text, ''), true);

  return v_id;  -- NULL = không có tài khoản, hoặc tài khoản đã khoá
end;
$$;

-- PHẠM VI CỦA ĐỆM — nói thẳng để không ai hiểu nhầm:
-- Đệm sống đúng bằng một transaction. Trong ứng dụng, một transaction = một
-- request tRPC, mở đầu bằng chính lời gọi này. Nên khoá một tài khoản có hiệu lực
-- từ REQUEST KẾ TIẾP, không phải giữa chừng request đang chạy dở (trước 0029, do
-- tra bảng lại ở từng dòng, việc khoá có thể ăn ngay giữa transaction). Đổi lại là
-- thứ đáng giá: 2.241 lượt tra core.users → 1. Vì request dài nhất của Hub là vài
-- trăm mili-giây, khoảng hở này ngắn hơn thời gian người khoá kịp nhả chuột.

comment on function core.begin_user_context(uuid) is
  'Dựng ngữ cảnh RLS trong MỘT lượt đi-về: đặt claim.sub + giải auth_uid → core.users.id (chỉ khi status=active) rồi ghi đệm cho core.current_user_id(). Ứng dụng KHÔNG được tự đặt request.hub.*.';

grant execute on function core.begin_user_context(uuid) to authenticated;

-- Nhánh chậm tách riêng, GIỮ NGUYÊN thân hàm cũ ở 0001. Phải là security definer
-- vì core.users có RLS (`users_self` dùng chính core.current_user_id()) — đọc bằng
-- quyền người gọi sẽ đệ quy vô tận.
create or replace function core.resolve_user_id_uncached()
returns uuid
language sql
stable
security definer
set search_path = core, pg_temp
as $$
  select u.id
    from core.users u
   where u.auth_uid = core.current_auth_uid()
     and u.status = 'active';
$$;

comment on function core.resolve_user_id_uncached() is
  'Nhánh chậm của core.current_user_id(): tra thẳng core.users. Dùng cho mọi đường KHÔNG đi qua core.begin_user_context() — pgTAP (test_support.login_as), psql thủ công, job nền.';

-- Hàm ngoài KHÔNG còn `security definer` và KHÔNG còn `set search_path` — hai thứ
-- đó chặn planner inline hàm. Bỏ được vì bản thân hàm này không chạm bảng nào:
-- nó chỉ đọc GUC, còn phần chạm core.users nằm trong hàm definer ở trên.
-- Đo trực tiếp 50.000 lượt gọi trong một câu:
--     bản cũ (plpgsql, tra bảng mỗi lần)          861 ms · 150.006 buffer
--     bản này (inline được, đọc đệm)               42 ms ·       0 buffer
--     biến thể plpgsql cũng đọc đệm                299 ms ·       3 buffer
-- Chọn bản inline được: cùng số buffer với biến thể plpgsql nhưng rẻ hơn ~7 lần
-- về CPU, và đo lại toàn bộ 7 hàm phạm vi cho thấy KHÔNG plan nào đổi xấu đi.
create or replace function core.current_user_id()
returns uuid
language sql
stable
as $$
  select case
    -- Nhánh nhanh: đệm do core.begin_user_context() ghi trong CHÍNH transaction
    -- này, và auth_uid trong đệm vẫn đúng là người đang mang claim.
    when nullif(current_setting('request.hub.auth_uid', true), '') is not null
     and nullif(current_setting('request.hub.auth_uid', true), '')
         = nullif(current_setting('request.jwt.claim.sub', true), '')
    then nullif(current_setting('request.hub.user_id', true), '')::uuid
    else core.resolve_user_id_uncached()
  end;
$$;

comment on function core.current_user_id() is
  'ADR-012 — auth uid -> core.users.id. Trả NULL nếu tài khoản đã khóa: khóa là mất quyền ngay, không đợi hết phiên. Từ 0029: đọc đệm phiên do core.begin_user_context() ghi, chỉ tra bảng khi không có đệm.';

-- ---------------------------------------------------------------------------
-- 2. Năm index trên đường nóng.
--
-- Chỉ giữ những index ĐO ĐƯỢC là có ích. Ba nhóm ứng viên khác đã bị loại sau khi đo
-- (ghi lại ở đây để lần sau không ai thêm lại theo cảm tính):
--   · core.class_assignments (class_id, assignment_role) — trung tính (14.182 vs
--     14.519 buffer, trong biên nhiễu), và ở một cấu hình còn làm core.teaches()
--     lật sang plan xấu hơn (4.054 → 5.242 buffer/300 lượt gọi). Bảng chỉ ~360
--     dòng ở quy mô 6 cơ sở nên Seq Scan trên nó vốn đã miễn phí; đo thật cho thấy
--     KHÔNG có Seq Scan nào trên bảng này cả trước lẫn sau (idx_scan=834, seq_scan=0).
--   · core.teachers (user_id) include (id) và core.students (id) include (user_id,
--     school_id) — bỏ đi không đổi một buffer nào (10.334 vs 10.349); phần lợi
--     tưởng là của chúng thực ra đến từ bộ đệm uid ở mục 1.
--   · core.parents (user_id) / core.parent_students (student_id) include (parent_id)
--     — không đổi gì (14.285 vs 14.276).
--
-- Trên production đã có người dùng: chạy bản CONCURRENTLY ngoài transaction
-- (expand–contract, RULES Rev B/C điều 4) — khoá ghi attendance.checkins hay
-- ops.job_runs trong lúc dựng index là đủ hỏng một buổi điểm danh sáng.
-- `if not exists` để migration chạy lại được trên máy dev đã có index.
-- ---------------------------------------------------------------------------

-- core.teaches()/core.is_homeroom_of() (0009) tra enrollments theo student_id rồi
-- lấy class_id. enrollments_current_idx (0002) dừng ở student_id nên vẫn phải mở
-- heap; thêm class_id vào khoá cho phép Index Only Scan.
create index if not exists enrollments_current_class_idx
  on core.enrollments (student_id, class_id)
  where valid_to is null;

-- core.v_my_homeroom_teacher (0020/0022) join urs.class_id = e.class_id, mà index
-- duy nhất trên bảng này là (user_id). View chạy mỗi lần mở /can-gap-thay-co và
-- /ho-so. Đo: 65 → 14 buffer.
create index if not exists user_role_scopes_class_role_idx
  on core.user_role_scopes (class_id, role_code)
  where class_id is not null;

-- "Quét đêm qua HH:mm" trên buồng lái: max(finished_at) where status='success'.
-- job_runs_recent_idx là (job_name, started_at desc) — không giúp gì cho câu này,
-- mà bảng append-only nên Seq Scan đắt dần mãi mãi. Đo: 734 → 3 buffer ở 55.000 dòng.
create index if not exists job_runs_success_finished_idx
  on ops.job_runs (finished_at desc)
  where status = 'success';

-- Hai index hiện có trên care.care_cases đều là partial `where status='open'` nên
-- chỉ dùng được khi câu truy vấn mang đúng vị từ đó. Câu recentActions không có,
-- nên Postgres quét cả bảng — kể cả hồ sơ đã đóng từ năm ngoái.
create index if not exists care_cases_student_idx
  on care.care_cases (student_id);

-- recentActions sắp xếp toàn tập interventions theo occurred_at desc rồi lấy 5 dòng.
-- Hai index trên đây cùng nhau: 11.680 → 1.511 buffer.
create index if not exists interventions_recent_idx
  on care.interventions (occurred_at desc);

commit;
