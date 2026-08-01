-- pgTAP — màn điều khoản kèm nút đồng ý (0046, ADR-027)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0046_dieu_khoan_test.sql
--
-- Bài này phải chứng minh BA thứ, và thiếu thứ nào thì gói việc chỉ là màn hình:
--   1. CHỐT CHẶN CÓ RĂNG — chưa có phiếu thì phần mềm không ghi được tâm trạng của em,
--      kể cả khi hỏi thẳng cơ sở dữ liệu chứ không qua trang nào.
--   2. §9 — bấm hai lần không sinh hai phiếu đồng ý.
--   3. RANH GIỚI (ADR-027) — cái KHÔNG BAO GIỜ bị chặn: cô vẫn điểm danh được cho em
--      chưa có phiếu, và kênh "cần gặp thầy cô" vẫn có đường ghi hộ. Nhóm 3 mới là
--      nhóm bài test này tồn tại vì nó: một chốt chặn chặn đúng cả đứa trẻ thì đó
--      không phải bảo vệ, đó là bỏ rơi.
--
-- SỬA LỚN 01/08/2026 (migration 0047, ADR-027 bản 2) — BỐN ASSERTION Ở ĐÂY ĐÃ HẾT ĐÚNG.
-- Bản đầu của bài này khoá lại đúng cái cơ chế đã cắt đường kêu cứu của một đứa trẻ:
-- "chưa có phiếu ⇒ core.users.status='pending' ⇒ không dựng được phiên". Nó xanh, và nó
-- xanh cho một điều SAI — status là công tắc DANH TÍNH, mà tắt danh tính là tắt luôn
-- `core.is_me()`, tức tắt luôn `help_requests_insert_self`. Bốn assertion đó nay bị LẬT
-- (không phải xoá): chúng khẳng định điều ngược lại, để lần sau ai khôi phục lối cũ thì
-- chính chúng đỏ. Cái KHOÁ CHẶT nằm ở `0047_duong_keu_cuu_test.sql`.
--
-- GHI CHÚ KỸ THUẬT: cả file chạy trong MỘT transaction rồi rollback. `now()` đứng yên nên
-- mọi mốc thời gian phải dựng bằng tay.

begin;
select plan(45);
select test_support.seed_basic();

-- ═══ 1. CẤU TRÚC ═══════════════════════════════════════════════════════════
select has_table('core', 'terms_versions',  'Có bảng bản điều khoản core.terms_versions');
select has_table('core', 'consent_records', 'Có sổ đồng ý core.consent_records');
select has_column('attendance', 'help_requests', 'source',
  'help_requests có cột source — phân biệt em tự gửi với thầy cô ghi hộ');
select has_column('attendance', 'help_requests', 'created_by',
  'help_requests có cột created_by — ghi hộ phải có tên người ghi');

-- ═══ 2. BẢN ĐIỀU KHOẢN: BẤT BIẾN SAU KHI CÔNG BỐ ═══════════════════════════
-- Nếu nội dung sửa được sau khi công bố thì một dòng "đồng ý bản 1" chứng minh được
-- đúng con số 1, không chứng minh được nội dung — tức là bằng chứng rỗng.
select is(core.required_terms_version(), 1,
  'Bản 1 đã công bố và đang là bản bắt buộc (core.required_terms_version)');

select throws_ok(
  $$ update core.terms_versions set body_md = body_md || ' thêm một câu' where version = 1 $$,
  '23001', null,
  'KHÔNG sửa được nội dung bản điều khoản đã công bố');

select throws_ok(
  $$ delete from core.terms_versions where version = 1 $$,
  '23001', null,
  'KHÔNG xoá được bản điều khoản đã công bố');

-- Bản NHÁP thì ngược lại — chưa ai bấm vào nó, còn sửa được.
insert into core.terms_versions (version, title, body_md, bat_dong_y_lai)
values (99, 'Bản nháp thử',
        repeat('Đây là bản nháp dùng cho bài test, chưa công bố nên còn sửa được. ', 6),
        false);
select lives_ok(
  $$ update core.terms_versions set body_md = body_md || ' sửa thêm' where version = 99 $$,
  'Bản NHÁP (chưa công bố) vẫn sửa được — khoá bất biến chỉ đóng sau khi công bố');

-- ═══ 3. CHỐT CHẶN: CHƯA CÓ PHIẾU THÌ KHÔNG GHI ĐƯỢC TÂM TRẠNG ══════════════
-- LẬT so với bản đầu (xem đầu file). Bản đầu hạ `core.users.status` của Minh về 'pending'
-- rồi khẳng định "không dựng được phiên" — nay chính câu update đó bị trigger
-- `users_no_pending_downgrade` (0047) từ chối, và đó là điều đúng.
select is(
  core.has_student_consent('70000000-0000-0000-0000-000000000001'),
  false,
  'core.has_student_consent: chưa ai bấm gì thì em chưa có phiếu còn hiệu lực');
select throws_ok(
  $$ update core.users set status = 'pending'
      where id = '40000000-0000-0000-0000-000000000005' $$,
  '23001', null,
  'KHÔNG hạ được tài khoản của em về ''pending'' nữa — 0047 chặn ở tầng dữ liệu');
select ok(
  core.begin_user_context('90000000-0000-0000-0000-000000000005'::uuid) is not null,
  'Chưa có phiếu nhưng em VẪN dựng được phiên — danh tính của đứa trẻ không phải công tắc đồng ý');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh, chưa có phiếu
select throws_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date - 40, 'in', 4, 'present', 'app') $$,
  '42501', null,
  'CHỐT CHẶN THẬT: chưa có phiếu thì cột mood không nhận giá trị, hỏi thẳng CSDL cũng bị từ chối');
select test_support.logout();

-- ═══ 4. CÁI KHÔNG BAO GIỜ BỊ CHẶN (ADR-027) ════════════════════════════════
-- (a) Trường vẫn ghi nhận em có mặt. Đây là nghĩa vụ trông giữ trẻ, đứng trên cơ sở
--     pháp lý khác cái nút của bố mẹ.
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- Cô Lan, GVCN 6A1
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'in', 'present', 'teacher') $$,
  'GVCN VẪN điểm danh được cho em chưa có phiếu đồng ý (sổ vận hành của trường không bị gác)');

-- (b) Kênh kêu cứu vẫn còn đường vào: cô ghi hộ.
select lives_ok(
  $$ insert into attendance.help_requests (student_id, requested_on, topic, urgency, source, created_by)
     values ('70000000-0000-0000-0000-000000000001', current_date - 1, 'nha', 'today',
             'staff', '40000000-0000-0000-0000-000000000001') $$,
  'GVCN ghi hộ được yêu cầu gặp thầy cô cho em chưa có tài khoản bật (source=staff)');
select is(
  (select source from attendance.help_requests
    where student_id = '70000000-0000-0000-0000-000000000001'
      and requested_on = current_date - 1),
  'staff',
  'Dòng ghi hộ mang đúng nhãn ''staff'' — màn hình không được hiện ra như thể chính em vừa viết');
select test_support.logout();

-- ═══ 5. GHI PHIẾU: BẬT TÀI KHOẢN, VÀ BẤM HAI LẦN KHÔNG SINH HAI PHIẾU ══════
create temporary table t_consent (n int primary key, res jsonb) on commit drop;
-- Bảng tạm do vai chủ schema tạo, còn hai lời gọi dưới đây chạy bằng vai
-- `authenticated` (đúng vai của một phụ huynh thật) — thiếu dòng này là
-- "permission denied for table t_consent", không phải lỗi của thứ đang được kiểm.
grant insert, select on t_consent to public;

select test_support.login_as('90000000-0000-0000-0000-000000000004');  -- phụ huynh của Minh
insert into t_consent
select 1, core.record_consent('70000000-0000-0000-0000-000000000001',
                              (select id from core.terms_versions where version = 1),
                              'granted', 'app_button', 'pgTAP');
-- Lần hai nằm ở CÂU LỆNH RIÊNG: gộp vào một câu thì hai nhánh dùng chung snapshot và
-- lần hai không nhìn thấy lần một — con số đếm được sẽ tuỳ kế hoạch thực thi.
insert into t_consent
select 2, core.record_consent('70000000-0000-0000-0000-000000000001',
                              (select id from core.terms_versions where version = 1),
                              'granted', 'app_button', 'pgTAP');
select test_support.logout();

select is((select (res->>'created')::boolean from t_consent where n = 1), true,
  'Lần bấm đầu: sinh phiếu mới');
select is((select (res->>'created')::boolean from t_consent where n = 2), false,
  '§9 — lần bấm thứ hai KHÔNG sinh phiếu mới');
select is((select res->>'consentId' from t_consent where n = 1),
          (select res->>'consentId' from t_consent where n = 2),
  '§9 — lần hai trả lại ĐÚNG phiếu cũ, không phải một phiếu khác');
select is(
  (select count(*)::int from core.consent_records
    where student_id = '70000000-0000-0000-0000-000000000001'),
  1,
  '§9 — sổ đồng ý có ĐÚNG một dòng sau hai lần bấm');

select is(
  core.has_student_consent('70000000-0000-0000-0000-000000000001'),
  true,
  'core.has_student_consent: sau khi bấm, em đã có phiếu còn hiệu lực');
-- LẬT (0047): bấm đồng ý KHÔNG còn là một lệnh bật tài khoản. Tài khoản của em vốn đã
-- bật và giữ nguyên — cái vừa bật là quyền ghi tâm trạng, kiểm ngay dưới.
select is(
  (select status from core.users where id = '40000000-0000-0000-0000-000000000005'),
  'active',
  'Bấm đồng ý KHÔNG đụng tới danh tính của em — status giữ nguyên ''active''');
select test_support.login_as('90000000-0000-0000-0000-000000000005');
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date - 40, 'in', 4, 'present', 'app') $$,
  'Có phiếu rồi thì em ghi được tâm trạng — cùng câu lệnh vừa bị từ chối ở mục 3');
select test_support.logout();
-- Chiều TỪ CHỐI của cùng hàm đó: em nhà khác không tự nhiên có phiếu vì Minh vừa có.
select is(
  core.has_student_consent('70000000-0000-0000-0000-000000000002'),
  false,
  'core.has_student_consent trả lời theo TỪNG em, không lây từ em này sang em khác');
select ok(
  core.begin_user_context('90000000-0000-0000-0000-000000000005'::uuid) is not null,
  'Tài khoản đã bật: dựng được phiên trở lại');
select test_support.logout();

select is(
  (select cr.content_hash from core.consent_records cr
    where cr.student_id = '70000000-0000-0000-0000-000000000001'),
  (select tv.content_hash from core.terms_versions tv where tv.version = 1),
  'Phiếu chép lại đúng băm nội dung bản đã ký — đó là thứ chứng minh "bản tôi bấm là bản đang lưu"');

select test_support.login_as('90000000-0000-0000-0000-000000000004');
select is(
  (select needs_action from core.my_consent_status()
    where student_id = '70000000-0000-0000-0000-000000000001'),
  false,
  'core.my_consent_status: sau khi bấm, con này không còn việc phải làm');
select test_support.logout();

-- ═══ 6. HỌC SINH ĐÃ BẬT: TỰ GỬI ĐƯỢC, NHƯNG KHÔNG TỰ KHAI ''ghi hộ'' ═══════
select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh
select lives_ok(
  $$ insert into attendance.help_requests (student_id, requested_on, topic, urgency)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'hoc', 'this_week') $$,
  'Chính em vẫn gửi được yêu cầu như cũ (source mặc định ''self'')');
select throws_ok(
  $$ insert into attendance.help_requests (student_id, requested_on, source)
     values ('70000000-0000-0000-0000-000000000001', current_date + 1, 'staff') $$,
  '42501', null,
  'Học sinh KHÔNG tự khai được source=''staff'' — lời của em không được đội lốt lời thầy cô');
-- Sổ đồng ý là bằng chứng: người dùng cuối không có đường ghi thẳng, chỉ đi qua hàm.
select throws_ok(
  $$ insert into core.consent_records (user_id, student_id, terms_version_id, decision, content_hash)
     values (core.current_user_id(), '70000000-0000-0000-0000-000000000001',
             (select id from core.terms_versions where version = 1), 'granted',
             repeat('a', 64)) $$,
  '42501', null,
  'Không ai ghi thẳng vào sổ đồng ý — đường duy nhất là core.record_consent()');
select test_support.logout();

-- ═══ 7. RÚT LẠI VÀ ĐỒNG Ý LẠI — LỊCH SỬ GIỮ NGUYÊN ═════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000004');
-- LẬT (0047), và đây là assertion đã khoá lại đúng con lỗi chặn: bản đầu đòi
-- `studentAccountStatus = 'pending'` sau khi rút lại — tức đòi hệ thống tắt danh tính của
-- một đứa trẻ vì một thao tác hành chính của người lớn, và hệ thống làm đúng như thế.
select is(
  core.record_consent('70000000-0000-0000-0000-000000000001',
                      (select id from core.terms_versions where version = 1),
                      'withdrawn', 'admin', null)->>'studentAccountStatus',
  'active',
  'Rút lại đồng ý KHÔNG khoá tài khoản của con (trước 0047 chỗ này trả ''pending'')');
select is(
  core.has_student_consent('70000000-0000-0000-0000-000000000001'),
  false,
  'Nhưng phiếu hết hiệu lực ngay: cái tắt là quyền ghi tâm trạng, đúng thứ phụ huynh muốn tắt');
select test_support.logout();

select is(
  (select count(*)::int from core.consent_records
    where student_id = '70000000-0000-0000-0000-000000000001'),
  2,
  'Rút lại là GHI THÊM một dòng, không sửa dòng cũ (sổ chỉ thêm)');

select test_support.login_as('90000000-0000-0000-0000-000000000004');
select is(
  core.record_consent('70000000-0000-0000-0000-000000000001',
                      (select id from core.terms_versions where version = 1),
                      'granted', 'app_button', null)->>'moodEnabled',
  'true',
  'Đồng ý LẠI sau khi rút vẫn ghi được và bật lại phần tâm trạng (chỗ khoá idempotent hay gãy)');
select test_support.logout();

select is(
  (select count(*)::int from core.consent_records
    where student_id = '70000000-0000-0000-0000-000000000001' and superseded_at is null),
  1,
  'Luôn chỉ có MỘT quyết định đang hiệu lực cho mỗi cặp (người bấm, đứa con)');

-- ═══ 8. TỪ CHỐI ĐÚNG CHỖ ═══════════════════════════════════════════════════
-- Một phụ huynh khác, không phải người đại diện của Minh.
insert into core.users (id, auth_uid, email, full_name, status) values
  ('40000000-0000-0000-0000-0000000000e1', '90000000-0000-0000-0000-0000000000e1',
   'ph.la@va.edu.vn', 'Phụ huynh nhà khác', 'active');
insert into core.parents (id, user_id)
     values ('60000000-0000-0000-0000-0000000000e1', '40000000-0000-0000-0000-0000000000e1');
insert into core.user_role_scopes (user_id, role_code)
     values ('40000000-0000-0000-0000-0000000000e1', 'guardian');

select test_support.login_as('90000000-0000-0000-0000-0000000000e1');
select throws_ok(
  $$ select core.record_consent('70000000-0000-0000-0000-000000000001',
                                (select id from core.terms_versions where version = 1),
                                'granted') $$,
  '42501', null,
  'Phụ huynh nhà khác KHÔNG bấm được cho con nhà này (nếu không thì ai cũng bật được tài khoản của ai)');
select is((select count(*)::int from core.my_consent_status()), 0,
  'Người không phải đại diện của em nào thì my_consent_status trả 0 dòng');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000004');
select throws_ok(
  $$ select core.record_consent('70000000-0000-0000-0000-000000000001',
                                (select id from core.terms_versions where version = 99),
                                'granted') $$,
  '22023', null,
  'Không ký được vào bản NHÁP — bản còn sửa được thì chữ ký không neo vào đâu');
select test_support.logout();

select throws_ok(
  $$ delete from core.consent_records
      where student_id = '70000000-0000-0000-0000-000000000001' $$,
  '23001', null,
  'Không xoá được phiếu đồng ý, kể cả bằng vai chủ schema');
select throws_ok(
  $$ update core.consent_records set decision = 'withdrawn'
      where student_id = '70000000-0000-0000-0000-000000000001' and superseded_at is null $$,
  '23001', null,
  'Không sửa được nội dung phiếu đồng ý — quyết định mới thì ghi dòng mới');

-- ═══ 9. KHOẢNG HỞ ĐƯỢC GỌI TÊN, KHÔNG GIẤU ═════════════════════════════════
select is(
  (select count(*)::int from core.v_consent_gap
    where student_id = '70000000-0000-0000-0000-000000000001'),
  0,
  'core.v_consent_gap: em đã có phiếu thì không còn nằm trong danh sách hở');

-- Bản NHÁP không được lọt ra ngoài — nó chưa phải lời của trường.
select test_support.login_as('90000000-0000-0000-0000-000000000004');
select is((select count(*)::int from core.terms_versions where version = 1), 1,
  'Phụ huynh đọc được bản điều khoản ĐÃ công bố');
select is((select count(*)::int from core.terms_versions where version = 99), 0,
  'Phụ huynh KHÔNG đọc được bản nháp chưa công bố');
select test_support.logout();

-- ═══ 10. KHÔNG HỒI SINH NGƯỜI ĐÃ BỊ KHOÁ ═══════════════════════════════════
-- Tài khoản 'disabled' (kể cả tài khoản đã ẩn danh hoá theo Luật 91/2025 — 0033 đặt
-- đúng giá trị này) không được một cú bấm đồng ý làm sống lại. Ở bản đầu việc này do
-- `core.sync_student_account_status` giữ; từ 0047 hàm đó bị bỏ hẳn, và lời hứa được giữ
-- theo cách mạnh hơn: KHÔNG hàm nào của luồng đồng ý còn ghi vào `core.users` nữa.
update core.users set status = 'disabled'
 where id = '40000000-0000-0000-0000-000000000005';
select test_support.login_as('90000000-0000-0000-0000-000000000004');
select is(
  core.record_consent('70000000-0000-0000-0000-000000000001',
                      (select id from core.terms_versions where version = 1),
                      'granted', 'admin', null)->>'studentAccountStatus',
  'disabled',
  'Bấm đồng ý cho một tài khoản đã khoá/ẩn danh hoá KHÔNG làm nó sống lại');
select test_support.logout();
select is(
  (select status from core.users where id = '40000000-0000-0000-0000-000000000005'),
  'disabled',
  'Và cột status của tài khoản đó thật sự không đổi');
select hasnt_function('core', 'sync_student_account_status',
  'Hàm bật/tắt tài khoản theo phiếu đồng ý đã bị BỎ HẲN (0047) — không để lại cái bẫy đọc');

select * from finish();
rollback;
