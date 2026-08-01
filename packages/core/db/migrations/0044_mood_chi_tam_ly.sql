-- 0044_mood_chi_tam_ly.sql
-- ADR-026 — nhật ký cảm xúc từng ngày rời khỏi tầm đọc của giáo viên chủ nhiệm.
-- ĐẢO MỘT PHẦN ADR-025 (`0038`). Quyết định chủ đầu tư 01/08/2026.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUYẾT ĐỊNH, nguyên văn thứ phải thi hành
-- ═══════════════════════════════════════════════════════════════════════════
-- "Cô chủ nhiệm KHÔNG còn xem được nhật ký cảm xúc từng ngày của học sinh —
--  không trên màn hình, và cả khi hỏi thẳng cơ sở dữ liệu cũng bị từ chối. Cô VẪN
--  nhận cờ 'em này cần để ý' khi hệ phát hiện chuỗi ngày bất thường, và VẪN nhận
--  ngay khi em bấm nút cần gặp. Cô biết CÓ CHUYỆN mà không đọc được chuyện gì.
--  Tâm lý cụm giữ nguyên mọi quyền. Chính em giữ nguyên quyền xem của mình.
--  Phụ huynh và BGH không đổi (vốn đã không xem được)."
--
-- Nói bằng công thức: `core.can_read_mood` mất nhánh `is_homeroom_of`.
--
--     TRƯỚC (0038): is_me ∨ can_see_care          = is_me ∨ is_my_child(*)
--                                                    ∨ is_homeroom_of ∨ in_my_cluster
--     SAU   (0044): is_me ∨ in_my_cluster
--
-- (*) `core.can_see_care` = `is_my_child ∨ is_homeroom_of ∨ in_my_cluster`. Phụ
--     huynh không đọc được mood từ 0038 là nhờ GRANT THEO CỘT chặn trước, không
--     phải nhờ hàm phạm vi — chi tiết đó quan trọng: nó là lý do file này KHÔNG
--     được sửa `core.can_see_care`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CÁI KHÔNG ĐƯỢC ĐỘNG VÀO, và vì sao
-- ═══════════════════════════════════════════════════════════════════════════
-- `core.can_see_care()` GIỮ NGUYÊN cả ba nhánh. Nó đang gác `care.flags`,
-- `care.care_cases`, `care.interventions` và `attendance.help_requests` — tức là
-- gác đúng hai thứ mà quyết định trên hứa cô VẪN nhận được: cờ "cần để ý" và tín
-- hiệu "em cần gặp thầy cô". Siết nó ở đây là phá đúng lời hứa vừa ký, và phá
-- theo kiểu im lặng: cô mở buồng lái thấy trống, màn hình không nói gì.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ĐO THẬT TRƯỚC KHI CẮT (hub_dev, 01/08/2026) — số dòng có mood đọc được qua
-- `attendance.checkins_care`, dưới đúng từng danh tính:
--
--     cô Lan  (GVCN 6A1)    75      →  0    ← đây là thứ quyết định yêu cầu
--     cô Mai  (tâm lý cụm)  358     →  358  ← không đổi một dòng
--     Minh    (chính em)    9       →  9    ← không đổi một dòng
--     phụ huynh của Minh    0       →  0    ← vốn đã 0 từ 0038
--
-- Bộ quét cờ chạy TRƯỚC và SAU trên cùng dữ liệu (`care.run_flag_engine` sau khi
-- xoá cờ của ngày hôm nay): 11/11 cờ, phân bố y hệt A_ATTENDANCE 4 · E_MOOD 3 ·
-- E_URGENT 4. Không phải may: engine chạy vai `postgres` (bỏ qua RLS lẫn grant
-- theo cột) và đọc mood qua `care.v_signal_emotion` → `attendance.checkins` TRỰC
-- TIẾP, không đi qua `checkins_care`, không gọi `can_read_mood` một lần nào.
-- Bảo đảm đó chết ngay nếu ai đó đổi `care.v_signal_emotion` sang đọc
-- `checkins_care`, hoặc cho engine chạy dưới vai `authenticated` — bài pgTAP
-- `0044` ghim lại đúng hai điều kiện ấy.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- BA CỬA, KHÔNG PHẢI MỘT — cắt một cửa mà để hai cửa kia là chưa cắt gì
-- ═══════════════════════════════════════════════════════════════════════════
-- Rà cả kho 01/08/2026 tìm mọi đường đọc mood dưới vai người dùng. Có đúng ba, và
-- file này đóng cả ba trong một lần:
--
--   (1) `attendance.checkins_care` — cửa chính, đóng bằng `core.can_read_mood`.
--   (2) `attendance.mood_trends`   — trung bình mood theo tháng của TỪNG EM. Nằm
--       trong vòng lặp 16 bảng của `0009:150-176` nên đang gác bằng
--       `core.can_see_student()`. Hôm nay đọc ra 0 dòng vì
--       `attendance.rollup_mood_trends()` chưa từng chạy trên hub_dev (`DEBT` #33)
--       — 0 dòng vì bảng rỗng, KHÔNG phải vì bị chặn. Ngày job đêm chạy lần đầu là
--       ngày cô đọc được `avg_mood` 12 tháng của từng em. Đây là bảng DUY NHẤT
--       trong vòng lặp đó mang TRỌN nội dung cảm xúc và không có gì khác để cô
--       cần đọc, nên nó phải theo hàm phạm vi thứ tư chứ không theo hàm quản lý.
--   (3) `attendance.happy_days()` — SECURITY DEFINER, gác bằng
--       `core.can_see_student()` (rộng hơn hẳn, CÓ nhánh chủ nhiệm). Đo thật trên
--       hub_dev: đăng nhập cô Lan rồi gọi hàm này cho TỪNG NGÀY một của em
--       Nguyễn Anh Phương, 25/07 → 01/08, nhận đúng chuỗi 0/0/1/1/1/1/1/1. Tức là
--       đọc lại được nguyên nhật ký "hôm nay em có Vui không", chỉ khác cách gõ.
--       Hàm này sinh ra cho BÁO CÁO TRƯỞNG THÀNH mà PHỤ HUYNH đọc, nên cổng của
--       nó phải là cổng của phụ huynh, không phải cổng quản lý lớp.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ĐÁNH ĐỔI — nói thẳng, vì cái mất là thật
-- ═══════════════════════════════════════════════════════════════════════════
-- (1) Cô mất NGỮ CẢNH: thấy cờ mà không thấy chuỗi ngày dẫn tới cờ. Cuộc trò
--     chuyện đầu tiên với em vì thế phụ thuộc vào việc cô gọi được tâm lý cụm hay
--     không — mà đường chuyển tuyến đó CHƯA TỒN TẠI (cùng chỗ hụt của
--     `help_requests.note`, ADR-025 đã ghi sẵn).
-- (2) Tâm lý cụm thành NÚT THẮT: một người cho nhiều lớp, và nay là vai duy nhất
--     ngoài chính em đọc được. Hỏng người này là hỏng cả tuyến.
-- (3) Mất khả năng cô tự phát hiện sớm bằng mắt trước khi ngưỡng cờ bật. Đổi lại
--     phải TIN ngưỡng trong `care.thresholds` đặt đúng — mà ngưỡng đó chưa đi qua
--     một học kỳ dữ liệu thật (ADR-023 ghi rà lại sau ≥1 học kỳ).
-- (4) Buồng lái phụ thuộc hoàn toàn vào nhịp quét đêm cho E_MOOD. Engine ngủ một
--     đêm là cô không còn đường tự tính bù. Dải "Quét đêm qua" từ chỗ tiện lợi
--     trở thành THIẾT BỊ AN TOÀN — `ops.v_job_health` (`0041`) và
--     `ops.v_rule_health` (`0043`) từ nay gánh trách nhiệm đó.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- VIỆC CỦA TẦNG MÀN HÌNH (ngoài quyền sửa của gói này — nhưng KHÔNG được hoãn)
-- ═══════════════════════════════════════════════════════════════════════════
-- Đo thật trên một database dựng lại từ đầu, đăng nhập cô Lan, SAU khi cắt: bốn
-- màn GVCN lấy `attendance.checkins_care` làm nguồn cho CẢ cột điểm danh chứ
-- không riêng mood (`apps/hub/server/routers/care.ts` ~576, ~623, ~964, ~1087,
-- ~1105, ~1355). Cùng một câu LEFT JOIN: nguồn `checkins_care` trả 5/5 em
-- `status NULL`; đổi nguồn về `attendance.checkins` trả 5/5 em `status=present`.
-- Nghĩa là nếu chỉ chạy migration này mà không sửa tầng màn hình thì bảng điểm
-- danh của cô TRẮNG TOÀN BỘ và UI vẽ NULL thành "chưa điểm danh" — im lặng bị đọc
-- thành kết luận, và đâm thẳng vào quyết định QĐ-3 (bảng điểm danh phải hiện đủ
-- năm trạng thái). Ba việc bắt buộc đi cùng, ghi ra đây để bên sau không phải đoán:
--
--   a. Mọi cột KHÔNG-phải-mood (`status`, `occurred_on`, `occurred_at`, `source`,
--      `confirmed_by`) đổi nguồn VỀ LẠI `attendance.checkins` — RLS `can_see_student`
--      vẫn cho cô đọc. Chỉ cột `mood` ở lại `checkins_care`, và biến mất khỏi phía GVCN.
--   b. `getDashboard` thôi tự tính cờ E_MOOD từ `checkins_care`, chuyển sang đọc
--      `care.flags` (nợ `DEBT` #32). Phải chuyển TRƯỚC HOẶC CÙNG lúc — khoảng
--      giữa hai lần là khoảng cô không thấy cờ mà màn hình không nói gì. E_URGENT
--      giữ nguyên đường tính thẳng từ `attendance.help_requests` (`can_see_care`
--      không đụng) để tín hiệu "cần gặp thầy cô" vẫn báo NGAY, không chờ quét đêm.
--   c. `getReportApprovalQueue` đếm `checkin_days` từ `attendance.checkins`; ô
--      "ngày tâm trạng Vui" trong bản xem trước của CÔ thì hoặc bỏ hẳn, hoặc để
--      `null` và in một câu khác — tuyệt đối không để nó rơi xuống 0. 0 là lời nói
--      dối thay cho "không được phép biết".
--
-- Nhãn trên màn hình phải sửa trong CÙNG commit (lời hứa in ra là ràng buộc kỹ
-- thuật): nhãn chuẩn chốt tại `DESIGN-GUIDELINES` §9.
--
-- Phụ thuộc: 0009 (can_see_*, policy mood_trends_scope), 0031 (mood_trends),
-- 0038 (can_read_mood, checkins_care, happy_days).

begin;

-- ---------------------------------------------------------------------------
-- 1. Cửa chính — `core.can_read_mood` mất nhánh chủ nhiệm
-- ---------------------------------------------------------------------------
-- Bản 0038 viết `core.is_me() or core.can_see_care()` với lý do "phạm vi vùng
-- chăm sóc phải có đúng một định nghĩa". Lý do đó vẫn đúng cho VÙNG CHĂM SÓC —
-- nhưng từ hôm nay đọc-nhật-ký-cảm-xúc KHÔNG còn nằm trong vùng chăm sóc nữa. Nên
-- hai nhánh phải viết ra tường minh ở đây, và `can_see_care` giữ nguyên chỗ nó.
--
-- Thân hàm cố ý chỉ có ĐÚNG MỘT DÒNG và không có chú thích nào bên trong: bài
-- pgTAP 0044 đọc `pg_proc.prosrc` để khẳng định hàm này không nhắc tới
-- `can_see_care` / `is_homeroom_of` / `can_see_student`, mà `prosrc` giữ cả chú
-- thích. Một dòng giải thích đặt nhầm chỗ sẽ làm bài test đỏ mà không ai hiểu vì
-- sao — nên mọi lời giải thích nằm ở ngoài, đúng chỗ này.
create or replace function core.can_read_mood(p_student uuid)
returns boolean
language sql stable
as $$
  select core.is_me(p_student) or core.in_my_cluster(p_student);
$$;

comment on function core.can_read_mood(uuid) is
  'ADR-026 (01/08/2026) — "ai được thấy em này CẢM THẤY GÌ": CHỈ chính em và thầy cô tâm lý cụm. Giáo viên chủ nhiệm ĐÃ BỊ CẮT khỏi hàm này (trước đó 0038/ADR-025 còn cho). Cô vẫn nhận cờ care.flags và tín hiệu attendance.help_requests — hai thứ đó đi qua core.can_see_care(), hàm KHÁC, và cố ý không đổi. Vẫn KHÔNG phải core.can_see_student().';

-- ---------------------------------------------------------------------------
-- 2. Cửa thứ hai — `attendance.mood_trends`
-- ---------------------------------------------------------------------------
-- Bảng này chứa `avg_mood` + `sample_count` theo tháng của từng em, và KHÔNG chứa
-- gì khác. Nó lọt vào vòng lặp 16 bảng của 0009 vì "có cột student_id" — đúng cái
-- bẫy mà ADR-025 đặt tên: gắn student_id không có nghĩa câu hỏi về nó là câu hỏi
-- quản lý. Giữ tên policy cũ (`mood_trends_scope`) để `ops.v_rls_gaps` của 0024
-- và mọi bài test đang gọi tên nó không phải sửa theo.
drop policy if exists mood_trends_scope on attendance.mood_trends;
create policy mood_trends_scope on attendance.mood_trends for select to authenticated
  using (core.can_read_mood(student_id));

comment on policy mood_trends_scope on attendance.mood_trends is
  'ADR-026 — bảng này mang TRỌN nội dung cảm xúc (avg_mood theo tháng) nên đi theo core.can_read_mood(), không theo core.can_see_student() như 15 bảng còn lại của vòng lặp 0009. Trước 01/08/2026 nó dùng can_see_student và chưa lộ CHỈ VÌ attendance.rollup_mood_trends() chưa từng chạy — bảng rỗng, không phải cửa đóng.';

comment on table attendance.mood_trends is
  'Xu hướng cảm xúc tổng hợp theo tháng, giữ lại sau khi chi tiết 12 tháng bị xoá (§3, 0031). Phạm vi đọc = core.can_read_mood (ADR-026): chính em + tâm lý cụm. Người ghi là attendance.rollup_mood_trends() chạy vai hệ thống, không qua policy này.';

-- ---------------------------------------------------------------------------
-- 3. Cửa thứ ba — `attendance.happy_days()`
-- ---------------------------------------------------------------------------
-- Hai thay đổi, mỗi cái đóng một kiểu hỏi khác nhau:
--
--   (a) CỔNG: bỏ `core.can_see_student()` (6 nhánh, có chủ nhiệm / giáo viên bộ
--       môn / hiệu trưởng) và thay bằng đúng ba vai mà con số này sinh ra để phục
--       vụ: chính em, bố mẹ em, tâm lý cụm. Nói cách khác: cổng của hàm nay khớp
--       với NGƯỜI ĐỌC BÁO CÁO, không khớp với người quản lý lớp.
--
--   (b) ĐỘ RỘNG KHOẢNG HỎI: từ chối khoảng ngắn hơn 5 ngày. Không có ràng buộc
--       này thì cổng (a) vẫn để lọt câu hỏi "hôm qua em có Vui không" cho bố mẹ —
--       mà ranh giới 0038 đã chốt là bố mẹ xem SỐ TỔNG HỢP, không xem từng ngày.
--       5 ngày là con số nhỏ nhất còn dùng được: `report.buildGrowthReport` hỏi
--       đúng thứ Hai → thứ Sáu (`p_to - p_from = 4`), khít mép và cố ý khít.
--
-- RAISE chứ không trả NULL cho ca (b): NULL ở hàm này đã mang nghĩa "không được
-- phép biết về EM NÀY". Nhồi thêm nghĩa "câu hỏi sai hình dạng" vào cùng một giá
-- trị là dựng sẵn một lần đọc nhầm — `report.ts` làm `stats.happy_days >= 3`, mà
-- `null >= 3` là false, nên mục Glow sẽ biến mất trong im lặng. Đổi `language sql`
-- thành `plpgsql` chỉ vì lý do này: hàm SQL thuần không ném lỗi có thông điệp được.
--
-- KHE CÒN LẠI, ghi ra chứ không giấu: người đã qua cổng (a) vẫn có thể lấy hiệu
-- hai khoảng lệch nhau một ngày để suy ra một ngày ("differencing"). Chặn kín phải
-- ép khoảng về đúng biên tuần cố định, mà làm vậy thì gãy `buildGrowthReport`
-- (thứ Hai→thứ Sáu là khoảng lẻ). Ghi thành nợ có tên trong `DEBT.md` #38 thay vì
-- vờ như đã kín.
create or replace function attendance.happy_days(
  p_student uuid,
  p_from    date,
  p_to      date
) returns integer
language plpgsql
stable
security definer
set search_path = attendance, core, pg_temp
as $$
declare
  v_so_ngay integer;
begin
  if p_student is null or p_from is null or p_to is null then
    return null;
  end if;

  if p_to - p_from < 4 then
    raise exception
      using errcode = '22023',   -- invalid_parameter_value
            message = 'attendance.happy_days: khoảng hỏi quá hẹp, tối thiểu 5 ngày.',
            detail  = format('Nhận p_from=%s, p_to=%s (rộng %s ngày).',
                             p_from, p_to, (p_to - p_from) + 1),
            hint    = 'Hàm này trả SỐ TỔNG HỢP cho Báo cáo Trưởng thành. Hỏi từng ngày một là đọc nhật ký cảm xúc bằng đường vòng — ADR-026 cấm.';
  end if;

  -- Trả NULL (không phải 0) khi người gọi không được xem em này: 0 nghĩa là "khoảng
  -- này không có ngày nào vui", NULL nghĩa là "không được phép biết". Hai câu đó
  -- khác nhau và người gọi phải phân biệt được.
  if not (core.is_me(p_student)
          or core.is_my_child(p_student)
          or core.in_my_cluster(p_student)) then
    return null;
  end if;

  select count(*)::int into v_so_ngay
    from attendance.checkins c
   where c.student_id  = p_student
     and c.occurred_on between p_from and p_to
     and c.mood = 4;
  return v_so_ngay;
end;
$$;

comment on function attendance.happy_days(uuid, date, date) is
  'Số ngày mood = "Vui" trong một khoảng — SỐ TỔNG HỢP cho Báo cáo Trưởng thành mà phụ huynh đọc. Từ ADR-026: cổng là chính em ∨ bố mẹ em ∨ tâm lý cụm (KHÔNG còn core.can_see_student, tức giáo viên chủ nhiệm / bộ môn / hiệu trưởng đều nhận NULL), và khoảng hỏi hẹp hơn 5 ngày bị TỪ CHỐI bằng lỗi 22023 — hỏi từng ngày một là đọc lại nhật ký cảm xúc bằng đường vòng. Trả NULL (khác 0) khi không được phép biết.';

-- ---------------------------------------------------------------------------
-- 4. Viết lại những dòng chú thích nay đã sai
-- ---------------------------------------------------------------------------
-- Không phải việc dọn dẹp. `0038` đang ghi trong chính database rằng GVCN đọc được
-- mood; để nguyên là kho tự mâu thuẫn với kho, và người đọc sau sẽ tin dòng nào
-- họ gặp trước.
comment on column attendance.checkins.mood is
  '§3/ADR-002 — lưu như dữ liệu thường (không mã hóa, không bảng riêng). Từ 0038: cố tình KHÔNG nằm trong grant SELECT của authenticated. Đọc mood đi qua attendance.checkins_care, và từ 0044/ADR-026 phạm vi đó chỉ còn chính em + tâm lý cụm (giáo viên chủ nhiệm đã bị cắt). Thêm cột mới vào bảng này thì PHẢI thêm vào danh sách grant ở 0038 — bài pgTAP 0038 canh đúng chỗ đó.';

comment on view attendance.checkins_care is
  'Đường ĐỌC mood duy nhất của người dùng cuối. Từ 0044/ADR-026 phạm vi là core.can_read_mood = chính em ∨ tâm lý cụm. View CHỦ-QUYỀN nên tự khai phạm vi dòng thay vì mượn RLS — phạm vi này hẹp hơn hẳn checkins_scope, không mở thêm dòng nào. Giáo viên chủ nhiệm, phụ huynh, hiệu trưởng, giáo viên bộ môn đọc ra 0 DÒNG ở đây (màn hình hiện "không có", không hiện "hỏng") và bị Postgres TỪ CHỐI nếu đọc thẳng attendance.checkins.mood.';

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- ĐƯỜNG KHÔNG BỊ ẢNH HƯỞNG — đã đo từng vai, chép ra đây để lần sau khỏi đoán
-- ═══════════════════════════════════════════════════════════════════════════
-- · `care.v_signal_emotion` chưa từng grant cho `authenticated`; cô Lan gọi vào
--   nhận "permission denied for view v_signal_emotion". Nó là đường của engine.
-- · `report.class_pulse` / `grade_pulse` gác bằng cổng vai
--   `report.aggregate_school_ids()` — GVCN nhận RAISE 42501 (LỖI, không phải bảng
--   rỗng), đúng thiết kế `0040`. BGH không mất gì.
-- · `report.class_pulse_raw` SECURITY DEFINER, revoke all from public, không grant
--   cho vai nào. `report.v_campus_trends` security_invoker → GVCN permission denied.
-- · `attendance.rollup_mood_trends` / `purge_old_emotion_details` SECURITY DEFINER
--   + revoke from public, chạy vai hệ thống — không đụng.
-- · Đường GHI của học sinh (`checkin.submitMood`, upsert vào BẢNG GỐC với
--   `do update set mood = $3`) không hỏi `can_read_mood` một lần nào.
-- · `checkin.ts` đọc `checkins_care` nhưng luôn lọc `student_id = getMyStudentId()`
--   — nhánh `is_me`, không mất gì.
