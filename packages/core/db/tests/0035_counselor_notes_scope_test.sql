-- pgTAP — GHI CHÚ TƯ VẤN: ai đọc được nội dung buổi tư vấn tâm lý (0035)
--
-- Bài này khoá lại một lỗi ĐÃ CHẠY THẬT: policy `counselor_notes_scope` ở 0009 dùng
-- chung `core.can_see_care()` với cờ và hồ sơ chăm sóc, nên GVCN đọc được nguyên văn
-- lời học sinh kể với cô tâm lý. 0009_rls_matrix_test.sql còn có hẳn một assertion
-- KHẲNG ĐỊNH điều đó là đúng ("GVCN đọc được ghi chú tư vấn của ca mình phụ trách") —
-- test sai theo code sai thì cổng chặn biến thành con dấu.
--
-- Hai chiều đều phải có, và chiều thứ hai mới là chiều quan trọng:
--   · chiều CHO PHÉP  — cô tâm lý trong cụm, và tác giả, đọc được.
--   · chiều TỪ CHỐI   — GVCN, GVCN lớp khác, GV bộ môn, phụ huynh, học sinh, BGH: 0 dòng.
--
-- Kèm hai assertion "không siết nhầm": GVCN VẪN thấy cờ và VẪN thấy nhật ký can thiệp.
-- Nếu thiếu chúng, một lần siết tay quá đà sẽ khoá luôn buồng lái của GVCN mà bài test
-- vẫn xanh — và cô mất tín hiệu để hành động, đúng thứ hệ thống này sinh ra để giữ.

begin;
select plan(12);
select test_support.seed_basic();

-- Ca của Minh (6A1, cơ sở Q7) — cô Lan chủ nhiệm, cô Mai là tâm lý cụm Q7.
insert into care.flags (student_id, rule_code, as_of_date) values
  ('70000000-0000-0000-0000-000000000001', 'E_MOOD', current_date);

insert into care.care_cases (id, student_id, owner_id, tier) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000003', 2);

insert into care.interventions (case_id, actor_id, action) values
  ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003',
   'Tâm lý cụm đã gặp em');

insert into care.counselor_notes (case_id, author_id, body) values
  ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003',
   'Nội dung buổi tư vấn — em được hứa chuyện này không quay về lớp');

-- Ca của Cường (cơ sở Q2 — NGOÀI cụm của cô Mai) nhưng ghi chú do chính cô Mai viết.
-- Dùng để tách bạch hai nhánh của policy: nhánh "tác giả" phải sống độc lập với nhánh
-- "trong cụm", nếu không thì một lần điều chuyển cơ sở là mất hồ sơ do chính mình ghi.
insert into care.care_cases (id, student_id, owner_id, tier) values
  ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003',
   '40000000-0000-0000-0000-000000000003', 2);

insert into care.counselor_notes (case_id, author_id, body) values
  ('80000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003',
   'Ghi chú do chính cô Mai viết, ở cơ sở ngoài cụm của cô');

-- ═══ TÂM LÝ CỤM: chiều cho phép ═══════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000003');  -- cô Mai
select isnt_empty(
  $$ select 1 from care.counselor_notes
      where case_id = '80000000-0000-0000-0000-000000000001' $$,
  'Tâm lý cụm đọc được ghi chú của ca trong cụm mình');
select isnt_empty(
  $$ select 1 from care.counselor_notes
      where case_id = '80000000-0000-0000-0000-000000000002' $$,
  'TÁC GIẢ đọc lại được ghi chú của chính mình dù ca nằm ngoài cụm hiện tại');
select test_support.logout();

-- ═══ GVCN CỦA CHÍNH EM ĐÓ: chiều từ chối — đây là lỗi đang vá ═════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN 6A1
select is_empty(
  $$ select 1 from care.counselor_notes $$,
  'GVCN KHÔNG đọc được ghi chú tư vấn của học sinh lớp mình (DESIGN-GUIDELINES §9)');

-- ... nhưng KHÔNG được siết nhầm: cô vẫn phải thấy tín hiệu để hành động.
select isnt_empty(
  $$ select 1 from care.flags
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GVCN VẪN thấy cờ của lớp mình — siết ghi chú không được khoá buồng lái');
select isnt_empty(
  $$ select 1 from care.interventions
      where case_id = '80000000-0000-0000-0000-000000000001' $$,
  'GVCN VẪN thấy nhật ký can thiệp — biết "tâm lý cụm đã gặp em", không biết em kể gì');
select test_support.logout();

-- ═══ MỌI VAI CÒN LẠI: 0 dòng ══════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000006');  -- cô Hạnh, GVCN 6A2
select is_empty($$ select 1 from care.counselor_notes $$,
  'GVCN lớp khác KHÔNG đọc được ghi chú tư vấn');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000002');  -- thầy Nam, bộ môn
select is_empty($$ select 1 from care.counselor_notes $$,
  'Giáo viên bộ môn KHÔNG đọc được ghi chú tư vấn');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000004');  -- phụ huynh
select is_empty($$ select 1 from care.counselor_notes $$,
  'Phụ huynh KHÔNG đọc được ghi chú tư vấn (§9 — badge visibility_off)');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- học sinh Minh
select is_empty($$ select 1 from care.counselor_notes $$,
  'Học sinh KHÔNG đọc được ghi chú tư vấn về chính mình — buồng lái là ngôn ngữ nội bộ');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000007');  -- Hùng: principal + admin
select is_empty($$ select 1 from care.counselor_notes $$,
  'Hiệu trưởng/quản trị KHÔNG đọc được ghi chú tư vấn (ma trận: "—")');
select test_support.logout();

-- ═══ Khoá luôn HÌNH DẠNG của policy ═══════════════════════════════════════
-- Hai assertion cuối chặn kiểu hồi quy nguy hiểm nhất: ai đó "dọn dẹp" bằng cách đưa
-- policy này về dùng chung `core.can_see_care()` cho gọn. Điều kiện lại rộng ra, mọi
-- assertion phía trên vẫn phải đỏ — nhưng hai câu này nói thẳng LÝ DO cho người đọc log.
select ok(
  (select pg_get_expr(polqual, polrelid) not like '%can_see_care%'
     from pg_policy where polrelid = 'care.counselor_notes'::regclass
      and polname = 'counselor_notes_scope'),
  'Policy KHÔNG dùng core.can_see_care() — hàm đó gồm cả is_homeroom_of');
select ok(
  (select pg_get_expr(polqual, polrelid) like '%in_my_cluster%'
     from pg_policy where polrelid = 'care.counselor_notes'::regclass
      and polname = 'counselor_notes_scope'),
  'Policy đi qua core.in_my_cluster() — phạm vi tâm lý cụm, không phải phạm vi care chung');

select finish();
rollback;
