-- pgTAP — ADR-026: nhật ký cảm xúc từng ngày rời khỏi tầm đọc của GVCN (0044)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0044_mood_chi_tam_ly_test.sql
--
-- Quyết định chủ đầu tư 01/08/2026, nguyên văn thứ phải chứng minh:
--   "Cô chủ nhiệm KHÔNG còn xem được nhật ký cảm xúc từng ngày — không trên màn
--    hình, và cả khi hỏi thẳng cơ sở dữ liệu cũng bị từ chối. Cô VẪN nhận cờ 'em
--    này cần để ý', và VẪN nhận ngay khi em bấm nút cần gặp."
--
-- Một lời hứa hai vế thì bài test phải có hai chiều, nếu không nó chỉ canh được
-- nửa lời hứa và nửa kia rơi mất trong im lặng. Bố cục vì thế là:
--
--   1. CẮT     — ba cửa đọc mood đều đóng với GVCN (view, bảng xu hướng, hàm tổng
--                hợp), và cửa chính đóng theo đúng KIỂU đã hứa: 0 dòng ở đường
--                hợp lệ, lỗi 42501 ở đường vòng.
--   2. GIỮ     — cô vẫn thấy cờ, vẫn thấy tín hiệu "cần gặp thầy cô", vẫn thấy
--                điểm danh, và cái cô thấy chỉ là SỐ ĐẾM chứ không phải lời em.
--   3. KHÔNG SIẾT NHẦM — tâm lý cụm, chính em, phụ huynh không mất gì.
--   4. HÌNH DẠNG — chống mở lại cửa một cách kín đáo (gọi vòng qua hàm khác), và
--                ghim hai điều kiện khiến "bộ quét cờ không gãy" còn đúng.
--
-- Vì sao nhóm 2 quan trọng ngang nhóm 1: cắt quyền mà làm mất cờ thì cô không
-- biết CÓ CHUYỆN, và màn hình sẽ không báo gì cả — đúng loại hỏng im lặng mà kho
-- này cấm. Nhóm 4 câu cuối tồn tại vì phép đo "engine chạy trước/sau ra 11/11 cờ
-- y hệt" chỉ đúng CHỪNG NÀO engine còn chạy vai gọi và còn đọc bảng gốc.

begin;
select plan(26);
select test_support.seed_basic();

-- 0047 (ADR-027 bản 2): học sinh chỉ GHI được `mood` khi nhà đã có phiếu đồng ý. Bài này
-- canh AI ĐỌC ĐƯỢC mood sau khi cắt nhánh GVCN, không canh cổng đồng ý — dựng sẵn phiếu
-- cho Minh để assertion "học sinh vẫn ghi đè được mood trong ngày" còn đúng chỗ đứng.
insert into core.consent_records (user_id, student_id, terms_version_id, decision, content_hash)
select '40000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001',
       tv.id, 'granted', tv.content_hash
  from core.terms_versions tv where tv.version = 1;

-- Minh (6A1, Q7): cô Lan (…0001) chủ nhiệm, cô Mai (…0003) tâm lý cụm Q7,
-- phụ huynh …0004, chính em …0005, cô Hạnh (…0006) chủ nhiệm lớp khác.
-- mood = 1 ("Buồn") cố ý: nếu nó lọt ra ngoài phạm vi thì lọt đúng thứ đau nhất.
insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source) values
  ('70000000-0000-0000-0000-000000000001', current_date,     'in', 1, 'present', 'app'),
  ('70000000-0000-0000-0000-000000000001', current_date - 1, 'in', 1, 'present', 'app'),
  ('70000000-0000-0000-0000-000000000001', current_date - 2, 'in', 4, 'present', 'app');

-- Bảng xu hướng: PHẢI có dòng thật, nếu không assertion "cô đọc ra 0 dòng" xanh
-- giả vì bảng rỗng. Hôm nay trên hub_dev bảng này rỗng thật (job đêm chưa từng
-- chạy, DEBT #33) — đó chính là lý do lỗ hổng chưa lộ, không phải lý do nó kín.
insert into attendance.mood_trends (student_id, period_month, avg_mood, sample_count) values
  ('70000000-0000-0000-0000-000000000001', date_trunc('month', current_date)::date, 1.50, 12);

-- Cờ E_MOOD do bộ quét sinh ra, kèm ĐÚNG hình dạng detail mà 0039 ghi: bốn khoá
-- số, không một chữ nào của em.
insert into care.flags (student_id, rule_code, as_of_date, detail, origin) values
  ('70000000-0000-0000-0000-000000000001', 'E_MOOD', current_date,
   '{"negative_streak": 5, "negative_days": 6, "mode": "streak", "nguong": 5}'::jsonb, 'live');

-- Em bấm nút cần gặp thầy cô (QĐ-2: báo cô NGAY, không chờ quét đêm).
insert into attendance.help_requests (student_id, requested_on, urgency)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'urgent');

-- ═══ 1. CHIỀU CẮT — ba cửa, đóng theo đúng KIỂU đã hứa ═════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN 6A1

-- 0 DÒNG chứ không phải lỗi: màn hình của cô phải hiện "không có", không hiện
-- "hỏng". Đây là khác biệt có thật với người dùng, không phải chi tiết kỹ thuật.
select is_empty(
  $$ select 1 from attendance.checkins_care
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GVCN CỦA EM đọc attendance.checkins_care ra 0 DÒNG — cửa đóng bằng phạm vi, không bằng lỗi (ADR-026 đảo assertion cùng tên ở 0038)');

-- Đường vòng thì phải nổ. Nếu chỗ này im lặng trả rỗng thì một ngày nào đó grant
-- theo cột bị cấp lại và không ai biết.
select throws_ok(
  $$ select mood from attendance.checkins $$,
  '42501',
  null,
  'GVCN hỏi THẲNG attendance.checkins.mood → Postgres TỪ CHỐI (42501) — "cả khi hỏi thẳng cơ sở dữ liệu cũng bị từ chối"');

select is_empty(
  $$ select 1 from attendance.mood_trends
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GVCN đọc attendance.mood_trends ra 0 dòng — cửa hậu "trung bình mood 12 tháng của từng em" đã đóng (bảng CÓ dòng thật, không xanh giả)');

select is(
  attendance.happy_days('70000000-0000-0000-0000-000000000001', current_date - 7, current_date),
  null,
  'GVCN gọi happy_days nhận NULL — hàm này là cổng của Báo cáo Trưởng thành (phụ huynh), không phải cổng quản lý lớp');

-- Cửa hậu tinh vi nhất: hỏi từng ngày một thì happy_days trả 0/1, tức là đọc lại
-- được nguyên nhật ký "hôm nay em có Vui không". Đo thật trên hub_dev trước khi
-- vá: cô Lan nhận chuỗi 0/0/1/1/1/1/1/1 cho tám ngày liên tiếp của một em.
select throws_ok(
  $$ select attendance.happy_days('70000000-0000-0000-0000-000000000001', current_date, current_date) $$,
  '22023',
  null,
  'Hỏi happy_days cho MỘT ngày → lỗi 22023, KHÔNG nhận 0/1. Khoảng hẹp hơn 5 ngày bị từ chối cho MỌI vai, kể cả vai được phép');

-- ═══ 2. CHIỀU GIỮ — nửa còn lại của lời hứa ════════════════════════════════
select isnt_empty(
  $$ select 1 from care.flags
      where student_id = '70000000-0000-0000-0000-000000000001' and rule_code = 'E_MOOD' $$,
  'GVCN VẪN đọc được cờ E_MOOD trong care.flags — "cô biết CÓ CHUYỆN". Cắt can_read_mood mà không đụng can_see_care là lý do vế này còn sống');

select isnt_empty(
  $$ select 1 from attendance.help_requests
      where student_id = '70000000-0000-0000-0000-000000000001' and handled_at is null $$,
  'GVCN VẪN nhận tín hiệu "cần gặp thầy cô" (QĐ-2: báo NGAY, không chờ quét đêm) — đường này đi qua can_see_care, không đụng');

-- "Không đọc được CHUYỆN GÌ" phải đúng ở tầng dữ liệu, không chỉ ở tầng giao diện.
-- Khoá theo DANH SÁCH KHOÁ CHO PHÉP chứ không theo kiểu dữ liệu: `mode` vốn là
-- chuỗi ("streak"/"window") nên "cấm mọi giá trị chuỗi" vừa sai vừa xanh giả sau
-- này. Danh sách này là hợp đồng thật với 0039 — thêm một khoá `note`, `trich_dan`
-- hay bất cứ thứ gì chở lời em thì câu này đỏ ngay.
select is(
  (select count(*)::int
     from care.flags f, lateral jsonb_object_keys(f.detail) k
    where f.student_id = '70000000-0000-0000-0000-000000000001'
      and f.rule_code = 'E_MOOD'
      and k not in ('negative_streak', 'negative_days', 'mode', 'nguong')),
  0,
  'detail của cờ E_MOOD chỉ mang bốn khoá số/chế-độ đã khai ở 0039 — cờ chở SỐ ĐẾM, không chở lời em (§9 DESIGN-GUIDELINES: cờ chỉ ghi LOẠI tín hiệu)');

-- QĐ-3 (bảng điểm danh năm trạng thái) đứng đúng trên assertion này. Nếu cột
-- điểm danh cũng bị cắt theo mood thì bảng lớp của cô trắng toàn NULL và UI vẽ
-- NULL thành "chưa điểm danh" — im lặng bị đọc thành kết luận.
select is(
  (select count(*)::int from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000001'),
  3,
  'GVCN VẪN đọc được DÒNG check-in của em: 0044 cắt CỘT mood, KHÔNG chặn dòng — đây là chỗ QĐ-3 (năm trạng thái điểm danh) đứng lên');

select is(
  (select string_agg(distinct status, ',') from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000001'),
  'present',
  'GVCN VẪN đọc được cột status — có mặt/vắng/muộn là thứ cô phải thấy để làm việc của mình');

select test_support.logout();

-- ═══ 3. KHÔNG SIẾT NHẦM ════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000003');  -- cô Mai, tâm lý cụm
select is(
  (select mood from attendance.checkins_care
    where student_id = '70000000-0000-0000-0000-000000000001' and occurred_on = current_date),
  1::smallint,
  'TÂM LÝ CỤM đọc được ĐÚNG GIÁ TRỊ mood — sau ADR-026 đây là vai DUY NHẤT ngoài chính em, mất nó là mất cả tuyến chăm sóc');

select isnt_empty(
  $$ select 1 from attendance.mood_trends
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'TÂM LÝ CỤM vẫn đọc được bảng xu hướng — siết mood_trends về can_read_mood không được siết nhầm sang vai này');

select is(
  attendance.happy_days('70000000-0000-0000-0000-000000000001', current_date - 7, current_date),
  1,
  'TÂM LÝ CỤM vẫn lấy được số tổng hợp — cổng mới (is_me ∨ is_my_child ∨ in_my_cluster) giữ vai này');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh, chính em
select is(
  (select count(*)::int from attendance.checkins_care where mood is not null),
  3,
  'CHÍNH EM đọc lại được tâm trạng mình đã ghi — màn /checkin vẫn hiện "Con đã ghi: …"');

select is(
  (select count(*)::int from attendance.mood_trends),
  1,
  'CHÍNH EM đọc được xu hướng của mình — nhánh is_me giữ nguyên ở cả ba cửa');

select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'in', 3, 'present', 'app')
     on conflict (student_id, occurred_on, kind) do update set mood = 3 $$,
  'HỌC SINH vẫn ghi đè được mood trong ngày (§9 idempotent) — đường check-in hằng ngày không gãy vì lần cắt này');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000004');  -- phụ huynh của Minh
select is(
  attendance.happy_days('70000000-0000-0000-0000-000000000001', current_date - 7, current_date),
  1,
  'PHỤ HUYNH VẪN lấy được SỐ TỔNG HỢP "ngày Vui" — Báo cáo Trưởng thành không mất mục Glow (đây là lý do hàm này tồn tại)');

select is(
  (select count(*)::int from attendance.checkins
    where student_id = '70000000-0000-0000-0000-000000000001'),
  3,
  'PHỤ HUYNH VẪN đọc được DÒNG điểm danh của con — ADR-026 không đụng gì tới vai này');
select test_support.logout();

-- ═══ 4. KHOÁ HÌNH DẠNG ═════════════════════════════════════════════════════
-- Bốn câu đầu chặn kiểu "mở lại cửa một cách kín đáo": gọi vòng qua một hàm khác
-- vẫn còn nhánh chủ nhiệm thì hành vi hở lại mà ba nhóm trên có thể vẫn xanh nếu
-- ai đó đồng thời sửa dữ liệu mẫu.
select ok(
  (select prosrc not like '%can_see_care%' from pg_proc
    where oid = 'core.can_read_mood(uuid)'::regprocedure),
  'core.can_read_mood KHÔNG gọi core.can_see_care() — hàm đó còn nhánh is_homeroom_of, gọi lại nó là mở lại đúng cửa vừa đóng');

select ok(
  (select prosrc not like '%can_see_student%' from pg_proc
    where oid = 'core.can_read_mood(uuid)'::regprocedure),
  'core.can_read_mood KHÔNG gọi core.can_see_student() — giữ nguyên bài học ADR-025: bốn câu hỏi phạm vi, bốn hàm');

select ok(
  (select prosrc not like '%is_homeroom_of%' from pg_proc
    where oid = 'core.can_read_mood(uuid)'::regprocedure),
  'core.can_read_mood KHÔNG nhắc is_homeroom_of ở bất kỳ dạng nào — đây là điều khoản trung tâm của ADR-026');

-- Chiều ngược lại, quan trọng ngang: cắt quá tay là mất cờ.
select ok(
  (select prosrc like '%is_homeroom_of%' from pg_proc
    where oid = 'core.can_see_care(uuid)'::regprocedure),
  'core.can_see_care VẪN còn nhánh is_homeroom_of — nếu câu này đỏ thì cô mất cờ và hồ sơ chăm sóc, tức lời hứa "cô VẪN nhận cờ" vừa bị phá');

select is(
  (select pg_get_expr(polqual, polrelid) from pg_policy
    where polrelid = 'attendance.mood_trends'::regclass and polname = 'mood_trends_scope'),
  'core.can_read_mood(student_id)',
  'policy mood_trends_scope đi qua can_read_mood — bảng chỉ chứa cảm xúc thì theo hàm phạm vi thứ tư, không theo hàm quản lý của vòng lặp 16 bảng (0009)');

select ok(
  (select prosrc not like '%can_see_student%' from pg_proc
    where oid = 'attendance.happy_days(uuid, date, date)'::regprocedure),
  'attendance.happy_days KHÔNG còn gác bằng can_see_student — cổng của nó nay khớp NGƯỜI ĐỌC BÁO CÁO, không khớp người quản lý lớp');

-- Hai câu cuối ghim đúng hai điều kiện khiến phép đo "engine chạy trước/sau ra
-- 11/11 cờ y hệt" còn đúng. Đổi một trong hai là bảo đảm đó chết ngay lập tức, và
-- chết im lặng: engine vẫn chạy, chỉ là không còn thấy mood của ai.
select is(
  (select prosecdef from pg_proc where oid = 'care.run_flag_engine(date, text)'::regprocedure),
  false,
  'care.run_flag_engine KHÔNG phải SECURITY DEFINER — nó chạy bằng vai NGƯỜI GỌI (tools/jobs/run-flag-engine.mjs dùng vai postgres, bỏ qua RLS lẫn grant theo cột). Đổi thành chạy dưới authenticated là bộ quét mù cảm xúc ngay đêm đó');

select ok(
  (select pg_get_viewdef('care.v_signal_emotion'::regclass) not like '%checkins_care%'),
  'care.v_signal_emotion đọc THẲNG attendance.checkins, KHÔNG đi qua attendance.checkins_care — đổi nguồn view này là cắt luôn đường sinh cờ E_MOOD của cả trường');

select * from finish();
rollback;
