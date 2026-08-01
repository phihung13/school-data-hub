-- pgTAP — đường kêu cứu của một đứa trẻ không đứng sau cái nút của người lớn (0047, ADR-027 bản 2)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0047_duong_keu_cuu_test.sql
--
-- Bài này KHÓA CHẶT một lời hứa, không phải kiểm một tính năng. Nó tồn tại vì lời hứa đó
-- đã được viết bằng chữ in hoa trong giao việc của gói 0046, được viết lại trong chính
-- migration 0046, và VẪN BỊ VI PHẠM ngay ở ca đầu tiên — phụ huynh rút lại đồng ý là em
-- mất nút "Mình cần gặp thầy cô". Một lời hứa chỉ được nhắc lại trong chú thích thì lần
-- sau nó lại vỡ; nên từ đây nó có bài test riêng, và bài này phải đỏ nếu ai đó khôi phục
-- lối cũ.
--
-- Năm nhóm:
--   1. Chưa từng có phiếu đồng ý → em VẪN gửi được yêu cầu gặp thầy cô.
--   2. Phụ huynh RÚT LẠI đồng ý → em VẪN gửi được, ngay trong cùng transaction đó.
--   3. Cổng đồng ý gác ĐÚNG cột mood, và KHÔNG gác điểm danh.
--  3b. Khoảng hở còn lại được ĐO chứ không giấu (core.v_mood_khong_phieu, v_consent_gap).
--   4. Không đường nào hạ được tài khoản đang dùng về 'pending' (khoá cấu trúc, không
--      phải khoá bằng lời hứa).
--
-- ĐÃ THỬ NGƯỢC, không chỉ thử xuôi (01/08/2026, database dựng lại từ đầu):
--   · Khôi phục cơ chế của 0046 (gọi lại sync_student_account_status, bỏ trigger)
--     → 10 assertion đỏ, trong đó có đúng assertion số 12 — "sau khi phụ huynh RÚT LẠI,
--       em VẪN bấm được Mình cần gặp thầy cô".
--   · Bỏ điều kiện đồng ý khỏi hai policy ghi mood
--     → assertion 15 và 22 đỏ (cổng đồng ý thành đồ trang trí thì bài này biết ngay).
--
-- GHI CHÚ: cả file chạy trong một transaction rồi rollback. `now()` đứng yên.

begin;
select plan(25);
select test_support.seed_basic();

-- ═══ 0. MẪU SỐ — đo trước khi kết luận ═════════════════════════════════════
-- Không đo bước này thì cả bài có thể xanh vì một lý do sai (ví dụ: em có phiếu sẵn nên
-- chẳng có cổng nào đóng để mà thử).
select is(
  core.has_student_consent('70000000-0000-0000-0000-000000000001'),
  false,
  'MẪU SỐ: Minh chưa có phiếu đồng ý nào — cổng đang ĐÓNG, bài dưới đây có thứ để thử');
select is(
  (select status from core.users where id = '40000000-0000-0000-0000-000000000005'),
  'active',
  'MẪU SỐ: tài khoản của Minh vẫn bật dù chưa có phiếu — 0047 thôi lấy status làm công tắc đồng ý');

-- ═══ 1. CHƯA CÓ PHIẾU: EM VẪN KÊU CỨU ĐƯỢC ═════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh
select isnt(core.current_user_id(), null,
  'Em dựng được ngữ cảnh RLS dù nhà chưa có phiếu — danh tính không phụ thuộc phiếu đồng ý');
select ok(core.is_me('70000000-0000-0000-0000-000000000001'),
  'core.is_me còn đúng — đây là thứ mọi policy của em bám vào');
select lives_ok(
  $$ insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
     values ('70000000-0000-0000-0000-000000000001', current_date - 30, 'nha', 'urgent',
             'Con muốn gặp cô') $$,
  'CHÍNH EM gửi được "Mình cần gặp thầy cô" khi nhà CHƯA có phiếu đồng ý');
select is(
  (select source from attendance.help_requests
    where student_id = '70000000-0000-0000-0000-000000000001' and requested_on = current_date - 30),
  'self',
  'Và nó vào sổ đúng nhãn ''self'' — lời của em, không phải lời ai ghi hộ');
select test_support.logout();

-- ═══ 2. PHỤ HUYNH RÚT LẠI: EM VẪN KÊU CỨU ĐƯỢC ═════════════════════════════
-- Đây là ca đã đo được là HỎNG trước 0047, tái hiện đúng thứ tự thao tác của người thật.
select test_support.login_as('90000000-0000-0000-0000-000000000004');  -- phụ huynh của Minh
select is(
  core.record_consent('70000000-0000-0000-0000-000000000001',
                      (select id from core.terms_versions where version = 1),
                      'granted', 'app_button', 'pgTAP')->>'moodEnabled',
  'true',
  'Bấm đồng ý: phần ghi tâm trạng của con BẬT — đó là thứ cái nút điều khiển');
select is(
  core.record_consent('70000000-0000-0000-0000-000000000001',
                      (select id from core.terms_versions where version = 1),
                      'withdrawn', 'admin', null)->>'moodEnabled',
  'false',
  'Rút lại đồng ý: phần ghi tâm trạng TẮT ngay trong cùng giao dịch');
select is(
  core.record_consent('70000000-0000-0000-0000-000000000001',
                      (select id from core.terms_versions where version = 1),
                      'withdrawn', 'admin', null)->>'studentAccountStatus',
  'active',
  'RÚT LẠI KHÔNG ĐỤNG TỚI DANH TÍNH: tài khoản của em vẫn ''active'' (trước 0047 là ''pending'')');
select test_support.logout();

select is(
  (select status from core.users where id = '40000000-0000-0000-0000-000000000005'),
  'active',
  'Và cột status trong bảng thật cũng không đổi — không phải chỉ chuỗi trả về nói vậy');

select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh, ngay sau khi bị rút
select isnt(core.current_user_id(), null,
  'Sau khi bố mẹ rút lại: em VẪN dựng được ngữ cảnh (trước 0047 chỗ này trả NULL)');
select lives_ok(
  $$ insert into attendance.help_requests (student_id, requested_on, topic, urgency)
     values ('70000000-0000-0000-0000-000000000001', current_date - 29, 'lop', 'today') $$,
  'LỜI HỨA GỐC: sau khi phụ huynh RÚT LẠI đồng ý, em VẪN bấm được "Mình cần gặp thầy cô"');
select lives_ok(
  $$ update attendance.help_requests set note = 'con vẫn cần gặp cô'
      where student_id = '70000000-0000-0000-0000-000000000001'
        and requested_on = current_date - 29 $$,
  'Và vẫn sửa được lời nhắn của mình (help_requests_update_self còn sống)');
select is(
  (select count(*)::int from attendance.help_requests
    where student_id = '70000000-0000-0000-0000-000000000001'),
  2,
  'Hai lời nhắn của em nằm trong sổ — đếm được, không phải "chạy không lỗi là xong"');
select test_support.logout();

-- ═══ 3. CỔNG GÁC ĐÚNG CỘT MOOD, KHÔNG GÁC ĐIỂM DANH ════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh, vẫn đang bị rút
select throws_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date - 29, 'in', 4, 'present', 'app') $$,
  '42501', null,
  'CHƯA CÓ PHIẾU: ghi kèm TÂM TRẠNG bị RLS từ chối — đây mới là thứ phiếu đồng ý gác');
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date - 29, 'in', 'present', 'app') $$,
  'Nhưng chính em VẪN tự bấm có mặt được (mood để trống) — điểm danh không đứng sau cái nút');
select test_support.logout();

-- Cô vẫn điểm danh cho em như thường (nghĩa vụ trông giữ trẻ, cơ sở pháp lý khác).
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- Cô Lan, GVCN 6A1
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date - 28, 'in', 'present', 'teacher') $$,
  'GVCN vẫn điểm danh được cho em chưa có phiếu');
select test_support.logout();

-- Có phiếu trở lại thì mood ghi được ngay, không đợi gì.
select test_support.login_as('90000000-0000-0000-0000-000000000004');
select is(
  core.record_consent('70000000-0000-0000-0000-000000000001',
                      (select id from core.terms_versions where version = 1),
                      'granted', 'app_button', null)->>'moodEnabled',
  'true',
  'Đồng ý lại: phần ghi tâm trạng bật lại ngay');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000005');
select lives_ok(
  $$ insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
     values ('70000000-0000-0000-0000-000000000001', current_date - 27, 'in', 3, 'present', 'app') $$,
  'Có phiếu rồi thì em ghi được tâm trạng — cổng mở đúng chiều, không kẹt một chiều');
select test_support.logout();

-- ═══ 3b. KHOẢNG HỞ ĐƯỢC ĐO, KHÔNG ĐƯỢC GIẤU ════════════════════════════════
-- `core.v_mood_khong_phieu` là thước đo THẬT sau 0047: dòng tâm trạng đang nằm trong kho
-- của những em không còn phiếu. Nó phải RỖNG khi phiếu còn hiệu lực, và phải GỌI TÊN em
-- ngay khi phụ huynh rút lại — dữ liệu cũ không tự bốc hơi, và im lặng về nó là kiểu giấu
-- tệ nhất vì trông y hệt "không có gì".
select is(
  (select count(*)::int from core.v_mood_khong_phieu
    where student_id = '70000000-0000-0000-0000-000000000001'),
  0,
  'core.v_mood_khong_phieu: em đang có phiếu thì không nằm trong danh sách hở');

select test_support.login_as('90000000-0000-0000-0000-000000000004');
select ok(
  core.record_consent('70000000-0000-0000-0000-000000000001',
                      (select id from core.terms_versions where version = 1),
                      'withdrawn', 'admin', null) is not null,
  'Phụ huynh rút lại lần nữa — dựng ca "dữ liệu cũ còn nằm lại"');
select test_support.logout();

select is(
  (select so_dong_mood from core.v_mood_khong_phieu
    where student_id = '70000000-0000-0000-0000-000000000001'),
  1,
  'Rút lại rồi: view GỌI TÊN đúng số dòng tâm trạng cũ còn nằm trong kho (xoá là quyền RIÊNG của phụ huynh — DEBT #48)');
select is(
  (select count(*)::int from core.v_consent_gap
    where student_id = '70000000-0000-0000-0000-000000000001'),
  1,
  'core.v_consent_gap: em có tài khoản mà nhà chưa có phiếu — danh sách phải đi xin, không phải danh sách lỗi');

-- ═══ 4. KHOÁ CẤU TRÚC: KHÔNG AI HẠ TÀI KHOẢN ĐANG DÙNG VỀ CHỜ ══════════════
-- Vì sao phải có trigger khi lời gọi gây lỗi đã bị gỡ: đường từ "đặt status='pending'" tới
-- "một đứa trẻ không bấm được nút kêu cứu" đi qua bốn file và năm bước. Không ai đọc câu
-- update đó mà thấy trước hậu quả — nên hậu quả phải tự chặn tay người viết.
select throws_ok(
  $$ update core.users set status = 'pending'
      where id = '40000000-0000-0000-0000-000000000005' $$,
  '23001', null,
  'KHÔNG hạ được tài khoản đang dùng về ''pending'' — kể cả bằng vai chủ schema');
select lives_ok(
  $$ update core.users set status = 'disabled'
      where id = '40000000-0000-0000-0000-000000000005' $$,
  'Vẫn khoá được tài khoản theo đường ĐÚNG (''disabled'') — trigger không chặn việc thật');

select * from finish();
rollback;
