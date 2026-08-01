-- pgTAP — LUẬT NÀO ĐANG NGỦ, VÌ SAO, VÀ CÁI NÀO ĐÁNG ĐÁNH THỨC NGƯỜI TRỰC (0043)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0043_rule_health_test.sql
--
-- Bài này khoá lại một quyết định, không chỉ một đoạn SQL. Gói việc sinh ra nó hỏi:
-- "C_CEFR chưa có nguồn — dựng care.v_signal_cefr và khai ops.source_freshness cho đủ
-- bộ chứ?". Câu trả lời là KHÔNG (lý lẽ + phép đo nằm ở đầu 0043_rule_health.sql), và
-- thứ được xây thay vào đó là một view nói ra sự THIẾU. Nên bài test cũng phải kiểm
-- đúng hai chiều của một cái đèn, chứ không chỉ kiểm view có chạy:
--
--   · chiều KHÔNG — C_CEFR đang ngủ vì chưa ai viết luật. Đó là nợ có tên trong
--     DEBT.md #35. Đèn PHẢI TẮT. Cho nó sáng mỗi đêm là chế tạo lại đúng cái "cảnh báo
--     lúc nào cũng sáng" mà 0011 vừa gỡ ngày 31/07, và cảnh báo luôn sáng là cảnh báo
--     đã chết — nó kéo theo cả những cảnh báo thật khác chết chung.
--   · chiều CÓ — nguồn attendance hết tươi. Máy bơm dữ liệu đang hỏng thật. Đèn PHẢI
--     SÁNG, và cùng lúc đó luật đọc nguồn khác vẫn phải hiện "đang chấm" — không được
--     cả bảng cùng đỏ, vì một bảng lúc nào cũng đỏ cũng là một bảng không ai đọc.
--
-- Hai nhóm cuối kiểm cái bẫy đã ĐO ĐƯỢC ngày 01/08/2026 trên hub_dev:
--   select * from ops.v_stale_sources;  →  ERROR: cannot subtract infinite timestamps
-- ngay khi có một nguồn `last_success_at IS NULL`. Hôm nay chưa nổ vì cả hai nguồn đang
-- khai đều đã chạy thật; nó hẹn giờ nổ đúng ngày connector đầu tiên khai nguồn mới.
--
-- Không có assertion nào ở đây chạy trên bảng rỗng: mọi kết luận đều lấy từ metrics của
-- một lượt care.run_flag_engine() THẬT, gọi ngay trong bài, đúng đường mà cron đi.

begin;
select plan(37);
select test_support.seed_basic();

-- ═══ 1. CHƯA CÓ LƯỢT QUÉT NÀO — "chưa biết gì" phải là một trạng thái riêng ══
-- Database sạch: ops.job_runs không có dòng flag_engine nào. Đây chính là tình huống
-- mà 0041 dựng trạng thái 'chua_chay' để chặn — trước đó, một hệ chưa quét lần nào và
-- một hệ vừa quét xong không có gì bất thường trông giống hệt nhau.
select has_view('ops', 'v_rule_health',
  'ops.v_rule_health tồn tại — lý do bỏ qua một luật phải có chỗ đọc được, không chỉ nằm trong JSON của ops.job_runs.metrics');

select is(
  (select count(*)::int from ops.v_rule_health),
  (select count(*)::int from care.rules),
  'Mỗi luật trong care.rules đúng một dòng — luật nào biến mất khỏi view là luật không ai kiểm được');

select is_empty(
  $$ select rule_code from ops.v_rule_health where state <> 'chua_chay' $$,
  'Chưa có lượt quét nào ⇒ MỌI luật ở trạng thái chua_chay, không luật nào được đọc thành "đang chấm"');

select is_empty(
  $$ select rule_code from ops.v_rule_health where not needs_attention $$,
  'Chưa quét lần nào thì mọi luật đều cần chú ý — im lặng tuyệt đối là tin xấu nhất, không phải tin tốt');

select is_empty(
  $$ select rule_code from ops.v_rule_health where giai_thich is null or giai_thich = '' $$,
  'Không dòng nào trả lời bằng ô trống — một cột lý do rỗng đọc y hệt "không có vấn đề gì"');

select is_empty(
  $$ select rule_code from ops.v_rule_health where not stale_verdict $$,
  'Chưa có lượt quét nào ⇒ stale_verdict = true: màn hình không được trưng kết luận như thể vừa đo xong');

-- ═══ 2. MỘT LƯỢT QUÉT THẬT, NGUỒN CÒN TƯƠI ════════════════════════════════
-- Nguồn trên database sạch có last_success_at NULL (chưa connector nào chạy), nên phải
-- làm chúng tươi trước, nếu không cả bốn luật kia bị bỏ qua vì nguồn hết tươi và bài
-- test sẽ không chứng minh được chiều "đang chấm".
update ops.source_freshness set last_success_at = now();

select lives_ok(
  $$ select care.run_flag_engine(current_date, 'live') $$,
  'Bộ quét chạy được — view này thuật lại metrics của một lượt chạy thật, không tự suy ra kết luận');

select is(
  (select state from ops.v_rule_health where rule_code = 'A_ATTENDANCE'),
  'dang_cham',
  'Luật có nguồn tươi + đã cài đặt hiện "đang chấm" — chiều dương của bài test');

select is(
  (select needs_attention from ops.v_rule_health where rule_code = 'A_ATTENDANCE'),
  false,
  'Luật đang chấm bình thường KHÔNG bật đèn — đèn sáng cả bảng là đèn không ai đọc');

select is(
  (select stale_verdict from ops.v_rule_health where rule_code = 'A_ATTENDANCE'),
  false,
  'Vừa quét trong ngày ⇒ stale_verdict = false');

select is(
  (select last_as_of_date from ops.v_rule_health where rule_code = 'A_ATTENDANCE'),
  current_date,
  'Kết luận có ghi rõ nó thuộc lượt quét ngày nào — kết luận không ngày tháng là kết luận không kiểm được');

-- ── C_CEFR: đúng cái nợ mà gói việc này được giao để trả ──────────────────
select is(
  (select state from ops.v_rule_health where rule_code = 'C_CEFR'),
  'dang_ngu',
  'C_CEFR hiện "đang ngủ" — trước 0043, sự thật này chỉ sống trong ops.job_runs.metrics và không màn hình nào đọc');

select is(
  (select ly_do from ops.v_rule_health where rule_code = 'C_CEFR'),
  'chua_cai_dat',
  'Lý do đúng là chua_cai_dat (chưa ai viết luật), KHÔNG phải nguon_het_tuoi — hai câu đó dẫn người trực đi hai hướng khác hẳn nhau');

select is(
  (select needs_attention from ops.v_rule_health where rule_code = 'C_CEFR'),
  false,
  'Nợ CÓ TÊN trong DEBT.md thì KHÔNG bật đèn: C_CEFR còn ngủ nhiều tháng nữa, cho nó sáng mỗi đêm là dựng lại đúng cái đèn vàng vĩnh viễn mà 0011 vừa gỡ');

select matches(
  (select giai_thich from ops.v_rule_health where rule_code = 'C_CEFR'),
  'DEBT\.md',
  'Lời giải thích chỉ thẳng sang sổ nợ — người đọc biết việc đúng là đi viết luật, không phải đi tìm một máy bơm hỏng không tồn tại');

select is(
  (select ly_do from ops.v_rule_health where rule_code = 'C_MASTERY'),
  'chua_khai_nguon_tuoi',
  'C_MASTERY ngủ vì lý do KHÁC C_CEFR — luật đã cài nhưng chưa khai nguồn; view phải phân biệt được hai kiểu thiếu');

select is(
  (select needs_attention from ops.v_rule_health where rule_code = 'C_MASTERY'),
  false,
  'Chưa khai nguồn cũng là nợ có tên — không đánh thức người trực vì một connector chưa ra đời');

select is(
  (select count(*)::int from ops.v_rule_health where needs_attention),
  0,
  'Ngày bình thường: KHÔNG một đèn nào sáng, dù hai luật đang ngủ — chính vì nó im những ngày này nên ngày nó kêu mới có người tin');

select is_empty(
  $$ select rule_code from ops.v_rule_health
      where needs_attention is null or giai_thich is null $$,
  'Sau một lượt quét thật, không dòng nào trả lời bằng NULL — NULL ở tầng JS là falsy, tức là đọc thành "ổn cả"');

-- ═══ 3. NGUỒN HẾT TƯƠI — chiều CÓ của cái đèn ═════════════════════════════
-- Máy bơm dữ liệu điểm danh chết. Đây là sự cố THẬT, cần tay người đêm nay, khác hẳn
-- hai luật đang ngủ ở trên.
update ops.source_freshness
   set last_success_at = now() - interval '40 days'
 where source = 'attendance';

select lives_ok(
  $$ select care.run_flag_engine(current_date, 'live') $$,
  'Nguồn hỏng KHÔNG làm cả lượt quét thất bại — bỏ qua rule kèm lý do, đúng hành vi cố định số 5 (04-flag-engine.md)');

select is(
  (select state from ops.v_rule_health where rule_code = 'A_ATTENDANCE'),
  'dang_ngu',
  'Nguồn hết tươi ⇒ luật chuyển sang "đang ngủ" thay vì lặng lẽ chấm bằng dữ liệu cũ');

select is(
  (select ly_do from ops.v_rule_health where rule_code = 'A_ATTENDANCE'),
  'nguon_het_tuoi',
  'Lý do ghi đúng là nguon_het_tuoi — phân biệt được với "chưa ai viết luật"');

select is(
  (select needs_attention from ops.v_rule_health where rule_code = 'A_ATTENDANCE'),
  true,
  'Máy bơm dữ liệu hỏng thì đèn PHẢI sáng — đây là ranh giới: nợ đã biết thì im, máy hỏng thì kêu');

select matches(
  (select giai_thich from ops.v_rule_health where rule_code = 'A_ATTENDANCE'),
  'NGAY BÂY GIỜ',
  'Lời giải thích nói rõ đây là việc của người trực lúc này, không phải một dòng nợ kỹ thuật');

select is(
  (select state from ops.v_rule_health where rule_code = 'B_BEHAVIOR'),
  'dang_cham',
  'Luật đọc nguồn KHÁC vẫn đang chấm — một nguồn chết không được làm cả bảng đỏ, vì bảng lúc nào cũng đỏ là bảng không ai đọc');

-- Ba luật cùng ăn nguồn 'attendance' (0039 gán: A_ATTENDANCE, E_MOOD, E_URGENT), nên
-- một máy bơm chết phải làm đúng ba luật kêu — không ít hơn (bỏ sót), không nhiều hơn
-- (kéo theo luật vô can rồi thành đèn đỏ toàn bảng).
select results_eq(
  $$ select rule_code from ops.v_rule_health where needs_attention order by 1 $$,
  $$ values ('A_ATTENDANCE'), ('E_MOOD'), ('E_URGENT') $$,
  'Đúng ba luật ăn nguồn attendance cùng kêu — danh sách này chính là câu trả lời cho "nguồn hỏng thì mất những gì"');

-- ═══ 4. LUẬT LẠ SO VỚI LƯỢT QUÉT — không được đọc thành "đang chấm" ═══════
-- Thêm một luật vào bảng SAU lượt quét gần nhất. Bộ quét chưa hề biết nó, nên metrics
-- không nhắc tới nó ở cả hai danh sách. Nếu view im lặng ở đây thì luật mới trông y hệt
-- luật đang chạy — đúng hình dạng hỏng mà cả migration này sinh ra để chống.
insert into care.rules (rule_code, description)
     values ('Z_TEST_RULE', 'Luật thêm sau lượt quét gần nhất');

select is(
  (select state from ops.v_rule_health where rule_code = 'Z_TEST_RULE'),
  'khong_ro',
  'Luật không xuất hiện ở CẢ HAI danh sách của metrics ⇒ khong_ro, không im lặng gộp vào "đang chấm"');

select is(
  (select needs_attention from ops.v_rule_health where rule_code = 'Z_TEST_RULE'),
  true,
  'Bảng luật lệch với bộ quét thì phải kêu — đây là kiểu lệch không ai phát hiện được bằng mắt');

select matches(
  (select giai_thich from ops.v_rule_health where rule_code = 'Z_TEST_RULE'),
  'lệch nhau',
  'Lời giải thích nói đúng bản chất: care.rules và bộ quét đang lệch nhau');

-- ═══ 5. ops.v_stale_sources — `select *` không được chết vì một nguồn chưa chạy ══
-- Lỗi thật, đo được: thêm một nguồn chưa có connector nào ghi thì cột `age` của 0011
-- tính `now() - '-infinity'` và cả câu select vỡ. Nó ngủ yên tới ngày connector đầu tiên
-- khai nguồn — tức đúng lúc người ta đang cần nhìn xem nguồn nào hỏng.
insert into ops.source_freshness (source, label, max_age)
     values ('zz_chua_co_connector', 'Nguồn thử chưa ai ghi', interval '30 days');

select lives_ok(
  $$ select * from ops.v_stale_sources $$,
  'select * chạy được khi có nguồn last_success_at NULL — trước 0043 câu này chết với "cannot subtract infinite timestamps"');

select is(
  (select age from ops.v_stale_sources where source = 'zz_chua_co_connector'),
  null::interval,
  'Chưa chạy lần nào thì tuổi là KHÔNG BIẾT (NULL), không phải "cũ vô hạn" — thật thà hơn và không làm vỡ câu truy vấn');

select isnt_empty(
  $$ select 1 from ops.v_stale_sources where source = 'zz_chua_co_connector' $$,
  'Nguồn chưa chạy lần nào VẪN tính là hết tươi — luật của 0011 giữ nguyên từng chữ, 0043 chỉ sửa cách tính tuổi');

select isnt_empty(
  $$ select 1 from ops.v_stale_sources
      where source = 'attendance' and age is not null and age > max_age $$,
  'Nguồn đã từng chạy vẫn tính được tuổi và vẫn so được với hạn — chiều còn lại của cùng một cột');

select is_empty(
  $$ select source from ops.source_freshness f
      where f.source not in (select source from ops.v_stale_sources)
        and (f.last_success_at is null or now() - f.last_success_at > f.max_age) $$,
  'Không nguồn quá hạn nào lọt khỏi view — sửa cột age không được làm rơi mất một dòng cảnh báo');

-- ═══ 6. AI ĐỌC ĐƯỢC, AI KHÔNG BỊA ĐƯỢC ════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN 6A1

select isnt_empty(
  $$ select 1 from ops.v_rule_health $$,
  'GVCN ĐỌC được ops.v_rule_health — view chạy security_invoker, quyền đi qua policy đọc của care.rules và ops.job_runs, không vòng qua RLS');

select is(
  (select state from ops.v_rule_health where rule_code = 'C_CEFR'),
  'dang_ngu',
  'Chính người trực/GVCN đọc được C_CEFR đang ngủ — cả gói việc này chỉ có nghĩa nếu câu đó tới được mắt người, không dừng ở psql của dev');

select throws_ok(
  $$ insert into ops.job_runs (job_name, status) values ('flag_engine', 'success') $$,
  '42501',
  null,
  'Người dùng KHÔNG bịa được một lượt quét — bịa được lượt quét là bịa được cả câu "đêm qua đã chấm đủ luật"');

select test_support.logout();

select * from finish();
rollback;
