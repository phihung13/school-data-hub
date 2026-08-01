-- 0038_checkins_mood_scope.sql
-- Che CỘT `mood` khỏi phụ huynh và hiệu trưởng — giữ nguyên DÒNG điểm danh.
--
-- ── Cái sai đang chạy trên hub_dev (đo lại được, 31/07/2026) ────────────────
-- Màn `/checkin` in chữ cho học sinh đọc, ngay tại chỗ em bấm bốn ô cảm xúc:
--
--     "Chỉ thầy cô chủ nhiệm thấy"
--
-- DESIGN-GUIDELINES §9 ghi đúng câu đó: "Mood/check-in cảm xúc: chỉ GVCN thấy".
-- Nhưng ở tầng dữ liệu thì không. `attendance.checkins` nằm trong vòng lặp 16 bảng
-- của `0009:150-176`, tất cả cùng một điều kiện `core.can_see_student(student_id)`
-- — hàm hợp của SÁU nhánh, trong đó có `is_my_child` và `principal_of`. Cột `mood`
-- nằm chung dòng, mà RLS lọc theo DÒNG chứ không theo CỘT.
--
-- Đo thật trên hub_dev TRƯỚC khi vá, dưới đúng danh tính từng vai:
--
--     select test_support.login_as('…0004');           -- phụ huynh của Minh
--     select count(*) from attendance.checkins where mood is not null;   → 7
--     select test_support.login_as('…0007');           -- hiệu trưởng cơ sở + admin
--     select count(*) from attendance.checkins where mood is not null;   → 8
--
-- Bảy dòng và tám dòng đó là bảy, tám ngày một đứa trẻ nói "hôm nay con buồn" cho
-- một người mà em được hứa là sẽ không thấy.
--
-- Đây là lỗi thứ BA cùng một họ trong ngày (0035 `care.counselor_notes`, 0037
-- `attendance.help_requests`, giờ là `mood`): dùng CHUNG MỘT HÀM PHẠM VI cho hai
-- câu hỏi khác nhau. "Ai được thấy em này" (`core.can_see_student`) KHÔNG phải
-- "ai được thấy em này CẢM THẤY GÌ". Migration này đặt tên cho câu hỏi thứ hai —
-- `core.can_read_mood()` — để lần thứ tư không xảy ra vì thiếu chữ.
--
-- Quyết định nghiệp vụ chủ đầu tư đã chốt 31/07/2026: tâm trạng check-in CHỈ GVCN
-- và tâm lý cụm thấy. Phụ huynh và hiệu trưởng KHÔNG thấy mood từng ngày; phụ
-- huynh vẫn thấy điểm danh (có mặt/vắng/muộn) và báo cáo tổng hợp.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ĐÁNH ĐỔI — vì sao chọn GRANT THEO CỘT chứ không phải view che cột
-- ═══════════════════════════════════════════════════════════════════════════
-- PostgreSQL chỉ có ĐÚNG HAI cơ chế giấu một cột khỏi một người, và cả hai đều
-- có giá. Đã thử cả hai trên hub_dev trước khi chọn (PostgreSQL 16.14):
--
--   (A) VIEW che cột — `case when core.can_read_mood(student_id) then mood end`.
--       Ưu: phụ huynh vẫn `select c.mood` được, chỉ ra NULL; không câu đọc nào
--       trong `apps/hub` phải sửa.
--       Nhược, đo được, và là lý do LOẠI:
--         · Cột tính bằng biểu thức thì KHÔNG ghi được. Muốn giữ đường ghi thì
--           phải đổi `attendance.checkins` thành view + trigger INSTEAD OF, mà
--           `INSERT … ON CONFLICT` trên view có trigger INSTEAD OF thì Postgres
--           từ chối thẳng: "there is no unique or exclusion constraint matching
--           the ON CONFLICT specification" (thử lại được). Nghĩa là gãy đúng
--           `checkin.submitMood` — đường bấm check-in hằng ngày của học sinh.
--         · Nguy hiểm hơn: `attendance.rollup_mood_trends()` (0031) chạy dưới vai
--           hệ thống, KHÔNG có ngữ cảnh người dùng ⇒ `core.can_read_mood()` trả
--           false ⇒ `avg(c.mood)` đọc ra toàn NULL ⇒ job ghi xu hướng RỖNG rồi
--           `purge_old_emotion_details()` xóa chi tiết ngay sau đó. Mất sạch dữ
--           liệu 12 tháng, KHÔNG có một dòng lỗi nào. Đúng kiểu hỏng im lặng mà
--           repo này cấm.
--
--   (B) GRANT THEO CỘT — cột `mood` ra khỏi quyền SELECT của `authenticated`,
--       và mở lại đúng vùng chăm sóc bằng một view chủ-quyền có phạm vi riêng.
--       Ưu: bảng vẫn là BẢNG (mọi INSERT/UPDATE, RLS, trigger 0025, index, job
--       nền, view nội bộ chủ-quyền đều nguyên vẹn); sai phạm vi thì Postgres NÉM
--       LỖI ngay tại câu SQL, không bao giờ trả âm thầm số 0.
--       Nhược, nói thẳng: mọi câu ĐỌC `mood` dưới vai `authenticated` phải đổi
--       nguồn sang `attendance.checkins_care`. Danh sách đầy đủ ở cuối file.
--
-- Chọn (B). Lý do quyết định không phải là "ít việc hơn" — mà là: một lời hứa bị
-- phá phải hỏng THÀNH TIẾNG. Với (A), ngày cột `mood` bị che nhầm chỗ thì không ai
-- biết cho tới lúc mở bảng xu hướng ra thấy trống.
--
-- ── Ai mất gì ──────────────────────────────────────────────────────────────
-- · Phụ huynh: mất quyền đọc cột `mood`. Đây là điểm chính. Vẫn đọc nguyên vẹn
--   mọi cột điểm danh (`status`, `occurred_on`, `occurred_at`, `source`…) — dòng
--   check-in KHÔNG bị chặn. Vẫn có Báo cáo Trưởng thành: số "ngày Vui trong tuần"
--   lấy qua `attendance.happy_days()` (tổng hợp theo tuần, không phải mood từng
--   ngày) — đúng ranh giới chủ đầu tư đã chốt.
-- · Hiệu trưởng / quản trị: mất quyền đọc cột `mood`. Trùng DESIGN-GUIDELINES §9
--   ("BGH/Điều hành: chỉ dữ liệu tổng hợp theo lô"). Các view tổng hợp trong
--   schema `report` là view CHỦ-QUYỀN nên vẫn chạy — số theo lô không đổi.
-- · Giáo viên bộ môn: mất quyền đọc cột `mood` (§9: "chỉ GVCN thấy"). Vẫn đọc
--   được điểm danh lớp mình dạy.
-- · Học sinh: KHÔNG mất gì — `core.can_read_mood()` giữ nhánh `core.is_me()`, màn
--   `/checkin` vẫn hiện "Con đã ghi: …" của chính em.
-- · GVCN và tâm lý cụm: KHÔNG mất gì — đọc qua `attendance.checkins_care`.
-- · Job nền, adapter, view nội bộ (`care.v_signal_emotion`, `report.*`),
--   `backup_reader`: KHÔNG đụng tới. Lệnh revoke dưới đây chỉ nhắm `authenticated`.
--
-- Phụ thuộc: 0004 (checkins), 0009 (can_see_student/can_see_care), 0025 (grant
-- theo cột cho UPDATE — file này làm y hệt cho SELECT), 0027 (client_id).

begin;

-- ---------------------------------------------------------------------------
-- 1. Đặt TÊN cho câu hỏi thứ hai
-- ---------------------------------------------------------------------------
-- Cố ý nằm cạnh `core.can_see_student` / `can_see_care` / `can_see_health` trong
-- cùng schema `core`: bốn câu hỏi phạm vi, bốn hàm, không hàm nào là hàm kia.
create or replace function core.can_read_mood(p_student uuid)
returns boolean
language sql stable
as $$
  -- `core.can_see_care()` = is_homeroom_of OR in_my_cluster. KHÔNG viết lại hai
  -- nhánh đó ở đây: phạm vi "vùng chăm sóc" phải có đúng một định nghĩa.
  select core.is_me(p_student) or core.can_see_care(p_student);
$$;

comment on function core.can_read_mood(uuid) is
  'DESIGN-GUIDELINES §9 — "ai được thấy em này CẢM THẤY GÌ": chính em, GVCN của em, tâm lý cụm. KHÔNG phải core.can_see_student() (hàm đó gồm is_my_child, principal_of, teaches) — đó chính là cách lỗi 0035/0037/0038 sinh ra ba lần.';

-- ---------------------------------------------------------------------------
-- 2. Cột `mood` ra khỏi quyền SELECT của `authenticated`
-- ---------------------------------------------------------------------------
-- Postgres KHÔNG cho revoke một cột ra khỏi quyền cấp ở mức bảng (lệnh chạy
-- nhưng chỉ ra WARNING, quyền bảng vẫn còn). Phải revoke cả bảng rồi grant lại
-- theo danh sách cột — đúng cách 0025 đã làm cho UPDATE.
revoke select on attendance.checkins from authenticated;
grant select (
  id, student_id, occurred_on, occurred_at, kind,
  status, source, confirmed_by, created_at, client_id
) on attendance.checkins to authenticated;

comment on column attendance.checkins.mood is
  '§3/ADR-002 — lưu như dữ liệu thường (không mã hóa, không bảng riêng). Từ 0038: cố tình KHÔNG nằm trong grant SELECT của authenticated. Đọc mood đi qua attendance.checkins_care (phạm vi core.can_read_mood). Thêm cột mới vào bảng này thì PHẢI thêm vào danh sách grant ở 0038 — bài pgTAP 0038 canh đúng chỗ đó.';

-- ---------------------------------------------------------------------------
-- 3. Mở lại đúng vùng chăm sóc — view chủ-quyền, phạm vi riêng
-- ---------------------------------------------------------------------------
-- CỐ Ý **không** `security_invoker = true` ở đây, ngược với luật chung mà 0024 đặt
-- ra cho các view khác. Lý do: view invoker kiểm quyền bằng quyền NGƯỜI GỌI, mà
-- người gọi vừa bị revoke đúng cột `mood` ở mục 2 — view sẽ tự chặn chính nó.
-- View chủ-quyền đọc được `mood`, đổi lại nó bỏ qua RLS của bảng nền, nên phạm vi
-- DÒNG phải tự khai ở mệnh đề WHERE dưới đây.
--
-- An toàn của cách này dựa vào một bất đẳng thức phải luôn đúng:
--     can_read_mood  =  is_me ∨ is_homeroom_of ∨ in_my_cluster
--     can_see_student = is_me ∨ is_my_child ∨ teaches ∨ is_homeroom_of
--                              ∨ in_my_cluster ∨ principal_of
--   ⇒ can_read_mood ⊂ can_see_student
-- Nghĩa là view KHÔNG mở thêm một dòng nào mà RLS của bảng đã đóng. Bài pgTAP
-- 0038 ghim lại điều đó, vì đây là chỗ duy nhất trong file có thể âm thầm sai.
--
-- `security_barrier`: chặn kiểu tấn công hàm-rẻ-tiền — không có nó, planner được
-- phép chạy `where leaky_fn(mood)` của người gọi TRƯỚC mệnh đề phạm vi.
create or replace view attendance.checkins_care with (security_barrier = true) as
  select c.id, c.student_id, c.occurred_on, c.occurred_at, c.kind, c.mood,
         c.status, c.source, c.confirmed_by, c.created_at, c.client_id
    from attendance.checkins c
   where core.can_read_mood(c.student_id);

comment on view attendance.checkins_care is
  'Đường ĐỌC mood duy nhất của người dùng cuối: chính em, GVCN của em, tâm lý cụm (core.can_read_mood). View CHỦ-QUYỀN nên tự khai phạm vi dòng thay vì mượn RLS — phạm vi này hẹp hơn hẳn checkins_scope, không mở thêm dòng nào. Phụ huynh/hiệu trưởng/GV bộ môn đọc ra 0 dòng ở đây và bị Postgres từ chối nếu đọc thẳng attendance.checkins.mood.';

-- Không cấp cho `reporting` (§5 tường lửa báo cáo học thuật), không cấp cho
-- `connector`, không cấp cho PUBLIC. Chỉ đúng một vai người dùng cuối.
revoke all on attendance.checkins_care from public;
grant select on attendance.checkins_care to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Số tổng hợp cho Báo cáo Trưởng thành — thứ phụ huynh VẪN được thấy
-- ---------------------------------------------------------------------------
-- Ranh giới chủ đầu tư đã chốt: phụ huynh không thấy mood TỪNG NGÀY, nhưng vẫn
-- thấy BÁO CÁO TỔNG HỢP. "Cả tuần đến lớp với tâm trạng vui vẻ · 4/5 ngày "Vui""
-- là câu tổng hợp theo tuần, không phải bảng mood từng ngày — nên nó ở lại.
--
-- Nếu không có hàm này thì `report.buildGrowthReport` (đường phụ huynh) chỉ còn
-- cách bỏ hẳn mục Glow đó, và mục Glow biến mất trong im lặng là đúng thứ
-- "im lặng không phải kết luận" cấm.
--
-- SECURITY DEFINER vì nó phải đọc được `mood` — nên phạm vi phải tự kiểm, và kiểm
-- bằng `core.can_see_student()` (rộng hơn can_read_mood: phụ huynh nằm trong đó)
-- vì thứ trả ra là MỘT CON SỐ ĐẾM, không phải cảm xúc của một ngày cụ thể.
create or replace function attendance.happy_days(
  p_student uuid,
  p_from    date,
  p_to      date
) returns integer
language sql
stable
security definer
set search_path = attendance, core, pg_temp
as $$
  -- Trả NULL (không phải 0) khi người gọi không có quyền xem em này: 0 nghĩa là
  -- "tuần này không có ngày nào vui", NULL nghĩa là "không được phép biết". Hai
  -- câu đó khác nhau và người gọi phải phân biệt được.
  select case when core.can_see_student(p_student) then (
    select count(*)::int
      from attendance.checkins c
     where c.student_id  = p_student
       and c.occurred_on between p_from and p_to
       and c.mood = 4
  ) end;
$$;

comment on function attendance.happy_days(uuid, date, date) is
  'Số ngày mood = "Vui" trong một khoảng — SỐ TỔNG HỢP, dùng cho Báo cáo Trưởng thành mà phụ huynh đọc. Không trả về mood của một ngày cụ thể. Trả NULL khi người gọi không được xem em này (khác 0 = "không có ngày vui nào").';

-- SECURITY DEFINER thì bắt buộc thu quyền gọi mặc định của PUBLIC (cùng lý do
-- 0031 đã ghi): quên câu này là mọi tài khoản đăng nhập gọi được hàm đọc mood.
revoke execute on function attendance.happy_days(uuid, date, date) from public;
grant  execute on function attendance.happy_days(uuid, date, date) to authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIỆC PHẢI LÀM Ở TẦNG ỨNG DỤNG (ngoài quyền sửa của gói việc này)
-- ═══════════════════════════════════════════════════════════════════════════
-- Từ migration này, mọi câu ĐỌC cột `mood` dưới vai `authenticated` sẽ ném
-- `ERROR: permission denied for table checkins`. Hỏng thành tiếng, đúng dòng, và
-- đây là danh sách đầy đủ (đã grep toàn repo 31/07/2026):
--
--   ĐỔI NGUỒN `attendance.checkins` → `attendance.checkins_care`:
--     · apps/hub/server/routers/care.ts — bốn chỗ, đo được bằng vitest ngày
--       31/07/2026 (số dòng có thể trôi, tên truy vấn thì không):
--         ~422  `getDashboard` — moodDistribution của lớp hôm nay
--         ~787  `getClassRoster` — cột `mood` của từng em trong danh sách lớp
--         ~911  `getReportApprovalQueue` — `count(*) filter (where c.mood = 4)`
--         ~1189 `getStudentDetail` — danh sách check-in kèm mood
--     · apps/hub/server/routers/checkin.ts — `getAttendanceOverview` (bảng tuần
--       + lịch sử 8 lượt) và `getTodayStatus`. Ba câu này chạy dưới vai HỌC
--       SINH, mà `core.can_read_mood()` giữ nhánh `is_me` nên đổi nguồn là đủ,
--       không mất một dòng nào.
--
--   ĐỔI SANG HÀM TỔNG HỢP:
--     · apps/hub/server/routers/report.ts ~45 `buildGrowthReport` —
--       `count(*) filter (where mood = 4) as happy_days` chạy dưới vai PHỤ
--       HUYNH. KHÔNG được đổi nguồn sang `checkins_care` (phụ huynh đọc ra 0
--       dòng ⇒ mục Glow biến mất TRONG IM LẶNG). Thay bằng
--       `attendance.happy_days($1, $2::date, $3::date)`.
--
--   ĐỔI ĐÚNG MỘT TỪ (không liên quan tới đọc, mà tới ON CONFLICT):
--     · apps/hub/server/routers/checkin.ts — `do update set mood = excluded.mood`
--       ⇒ `do update set mood = $3`. Đo được: `excluded.mood` bị Postgres tính là
--       ĐỌC cột `mood` của bảng đích nên đòi quyền SELECT; gán thẳng tham số thì
--       không. Nhánh idempotent (§9) giữ nguyên ngữ nghĩa.
--     · packages/core/db/tests/0017_checkins_self_update_test.sql — cùng một từ.
--
--   ASSERTION ĐỔI CHIỀU CÓ CHỦ Ý (đã được báo trước trong chính file đó):
--     · packages/core/db/tests/0023_principal_scope_test.sql viết sẵn: "Nếu Hội
--       đồng dữ liệu sau này quyết định che mood khỏi BGH thì đây là assertion đỏ
--       đầu tiên, và việc đổi luật phải đi qua ADR chứ không phải sửa lặng lẽ."
--       Hôm nay là ngày đó. Quyết định chủ đầu tư 31/07/2026 → lật assertion
--       thành `is_empty` + mở ADR ghi lại quyết định.
--
-- ĐO THẬT NGÀY BÀN GIAO (hub_dev, 31/07/2026) — trạng thái đỏ phải biến mất khi
-- bảy chỗ trên được sửa, không được để lâu hơn một PR:
--   · pgTAP  : 37/39 file xanh (517 assertion). Đỏ đúng hai file trên
--     (`0017` một assertion, `0023` một assertion).
--   · vitest : 9 file đỏ / 39 ca. TÁM file là hệ quả trực tiếp của bảy chỗ trên
--     (`leo-quyen`, `man-hinh-moi`, `duyet-bao-cao`, `bao-cao-rieng-tu`,
--     `gvcn-nhieu-lop`, `gvcn-screens`, `help-request-rieng-tu`, `idempotency`)
--     — tất cả cùng một lỗi `42501 permission denied for table checkins`, không
--     có ca nào sai kết quả. File thứ chín (`tests/unit/nav-links.test.ts`) đỏ
--     từ trước, không liên quan.
--   · THỬ NGƯỢC đã chạy: cấp lại `grant select on attendance.checkins to
--     authenticated` thì 34 ca kia xanh trở lại NGAY, và `tests/db/
--     mood-rieng-tu.test.ts` đỏ đúng 4 ca — trong đó có câu "phụ huynh KHÔNG
--     đọc được cột mood". Nghĩa là bài test mới bắt đúng lỗ đang vá, không phải
--     xanh vì may.
