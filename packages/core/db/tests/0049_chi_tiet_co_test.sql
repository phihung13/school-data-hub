-- pgTAP — 0049: cột care.flags.detail rời khỏi tầm đọc của GVCN (ADR-026, DEBT #39)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0049_chi_tiet_co_test.sql
--
-- Thứ phải chứng minh, nguyên văn quyết định chủ đầu tư 01/08/2026:
--   "Cô chủ nhiệm KHÔNG còn xem được nhật ký cảm xúc từng ngày — không trên màn
--    hình, và cả khi hỏi thẳng cơ sở dữ liệu cũng bị từ chối. Cô VẪN nhận cờ
--    'em này cần để ý'. Tâm lý cụm giữ nguyên mọi quyền."
--
-- Một lời hứa BA vế thì bài test phải có ba chiều; thiếu chiều nào thì vế đó rơi
-- mất trong im lặng. Bố cục:
--
--   1. CẮT      — cô đọc `detail` thì Postgres TỪ CHỐI (42501), không phải trả
--                 NULL và cũng không phải trả 0 dòng. Cửa vòng (view của tâm lý
--                 cụm) đóng theo KIỂU khác: 0 DÒNG, để màn hình hiện "không có"
--                 chứ không hiện "hỏng".
--   2. GIỮ      — cô VẪN đọc được cờ và đúng bốn cột mà buồng lái
--                 (`care.ts:749`) đang dùng. Cắt quyền mà làm mất cờ thì cô không
--                 biết CÓ CHUYỆN, và đó là hỏng im lặng — nguy hiểm hơn khe hở.
--   3. KHÔNG SIẾT NHẦM — tâm lý cụm đọc đủ 100% `detail` qua cửa mới;
--                 `backup_reader` không mất một cột nào (ADR-006: bản sao lưu
--                 phải ĐỦ, không thủng bảng).
--   4. HÌNH DẠNG — chống mở lại cửa một cách kín đáo: danh sách cột được cấp phải
--                 khớp CHÍNH XÁC "mọi cột trừ detail" (bẫy cột mới thêm sau này),
--                 view phải là view CHỦ-QUYỀN (invoker thì nó tự chặn chính nó),
--                 và phạm vi dòng của view phải là `in_my_cluster` chứ không phải
--                 một hàm rộng hơn.
--
-- Vì sao nhóm 4 tồn tại: khe hở này sinh ra lần đầu KHÔNG phải vì ai đó cố ý mở
-- cửa, mà vì `grant select on all tables in schema care to authenticated` (0009)
-- cấp theo BẢNG trong khi lời hứa nói theo CỘT. Câu "danh sách cột khớp chính
-- xác" là câu duy nhất trong file bắt được lần tái phạm tiếp theo.

begin;
select plan(20);
select test_support.seed_basic();

-- Cờ E_MOOD với ĐÚNG hình dạng detail mà 0039 ghi: bốn khoá số, không một chữ nào
-- của em. Giá trị chọn khớp cái đã ĐO THẬT trên hub_dev 02/08/2026 dưới phiên cô
-- Vân (…0008) — nếu cửa hở lại thì nó hở đúng chuỗi ký tự này.
insert into care.flags (student_id, rule_code, as_of_date, detail, origin) values
  ('70000000-0000-0000-0000-000000000001', 'E_MOOD', current_date,
   '{"negative_streak": 6, "negative_days": 6, "mode": "streak", "nguong": 5}'::jsonb, 'live'),
  ('70000000-0000-0000-0000-000000000001', 'E_URGENT', current_date,
   '{"help_requested": true}'::jsonb, 'live');

-- ═══ 1. CẮT — cô chủ nhiệm ════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN 6A1

select throws_ok(
  $$ select detail from care.flags $$,
  '42501',
  null,
  'GVCN hỏi THẲNG care.flags.detail → Postgres TỪ CHỐI (42501). Trước 0049 câu này trả về {"negative_days":6,"negative_streak":6,"nguong":5} trên hub_dev — đo thật, không suy luận');

-- Đường vòng hay gặp nhất: không gõ tên cột mà gõ `select *`. Cùng một lỗi, và
-- phải cùng một lỗi — nếu `select *` lọt thì cả hàng rào là trang trí.
select throws_ok(
  $$ select * from care.flags $$,
  '42501',
  null,
  'GVCN gõ `select *` trên care.flags cũng bị TỪ CHỐI — sao (*) nở ra cả cột detail, không có cửa hậu nào ở đây');

-- Đường vòng thứ hai: không SELECT cột mà LỌC theo nó. Postgres đòi quyền SELECT
-- cho cột dùng trong WHERE, nên câu này cũng phải chết; nếu không thì cô suy ra
-- được số bằng cách hỏi nhị phân ("nguong > 4?").
select throws_ok(
  $$ select id from care.flags where (detail ->> 'negative_days')::int > 5 $$,
  '42501',
  null,
  'GVCN LỌC theo detail (không select nó) cũng bị TỪ CHỐI — chặn kiểu hỏi nhị phân để suy ra con số');

select is_empty(
  $$ select 1 from care.flags_tam_ly $$,
  'GVCN đọc care.flags_tam_ly ra 0 DÒNG — cửa của tâm lý cụm đóng theo KIỂU khác (0 dòng, không phải lỗi) để màn hình hiện "không có" chứ không hiện "hỏng"');

-- ═══ 2. GIỮ — nửa còn lại của lời hứa ════════════════════════════════════════
select isnt_empty(
  $$ select 1 from care.flags
      where student_id = '70000000-0000-0000-0000-000000000001' and rule_code = 'E_MOOD' $$,
  'GVCN VẪN đọc được cờ E_MOOD — "cô biết CÓ CHUYỆN". 0049 cắt CỘT, KHÔNG chặn DÒNG; RLS flags_scope (can_see_care) giữ nguyên nhánh chủ nhiệm');

-- Đúng bốn cột mà buồng lái đang chọn/lọc ở `apps/hub/server/routers/care.ts:749`.
-- Câu này là hợp đồng với tầng ứng dụng: revoke nhầm một trong bốn cột thì buồng
-- lái của cô trắng trơn, và trắng trơn đọc y hệt "lớp mình đang ổn".
select is(
  (select count(*)::int from (
     select f.id, f.student_id, f.rule_code, f.as_of_date, f.origin, f.created_at
       from care.flags f
      where f.student_id = '70000000-0000-0000-0000-000000000001'
        and f.rule_code = 'E_MOOD' and f.origin = 'live') x),
  1,
  'GVCN VẪN đọc được đúng sáu cột buồng lái dùng (id/student_id/rule_code/as_of_date/origin/created_at) — hợp đồng với care.ts:749');

select test_support.logout();

-- ═══ 3. KHÔNG SIẾT NHẦM ═══════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000003');  -- cô Mai, tâm lý cụm Q7

select is(
  (select (detail ->> 'negative_streak')::int from care.flags_tam_ly
    where student_id = '70000000-0000-0000-0000-000000000001' and rule_code = 'E_MOOD'),
  6,
  'TÂM LÝ CỤM đọc được ĐÚNG GIÁ TRỊ trong detail qua care.flags_tam_ly — ADR-026 hứa "tâm lý cụm giữ nguyên mọi quyền", cắt cột mà không mở lại cửa này là phá nửa lời hứa còn lại');

select is(
  (select count(*)::int from care.flags_tam_ly
    where student_id = '70000000-0000-0000-0000-000000000001'),
  2,
  'Cửa mới không thiếu dòng nào: cả hai cờ (E_MOOD, E_URGENT) đều qua được — view lọc theo in_my_cluster, không lọc theo mã cờ');

-- Phép kiểm HÌNH DẠNG của `detail`, chuyển từ `0044_mood_chi_tam_ly_test.sql` sang
-- đây ngày 02/08/2026: bản cũ chạy dưới phiên cô Lan, mà từ 0049 cô không đọc nổi
-- cột đó nữa. Nó phải sống tiếp ở CHỖ ĐỌC ĐƯỢC HỢP LỆ, không được biến mất — hợp
-- đồng "cờ E gọn" với 0039 mất người canh là cách một khoá `note` hay `trich_dan`
-- lọt vào detail mà không ai kêu.
--
-- Khoá theo DANH SÁCH KHOÁ CHO PHÉP chứ không theo kiểu dữ liệu: `mode` vốn là
-- chuỗi ("streak"/"window") nên "cấm mọi giá trị chuỗi" vừa sai vừa xanh giả.
select is(
  (select count(*)::int
     from care.flags_tam_ly f, lateral jsonb_object_keys(f.detail) k
    where f.student_id = '70000000-0000-0000-0000-000000000001'
      and f.rule_code = 'E_MOOD'
      and k not in ('negative_streak', 'negative_days', 'mode', 'nguong')),
  0,
  'detail của cờ E_MOOD chỉ mang bốn khoá số/chế-độ đã khai ở 0039 — cờ chở SỐ ĐẾM, không chở lời em (§9 DESIGN-GUIDELINES). Câu này chuyển từ 0044 sang, vì sau 0049 chỉ tâm lý cụm còn đọc được detail');

-- Cô Mai cũng bị 42501 khi gõ thẳng bảng. CÓ Ý: cửa hợp lệ của cô là view. Cô mất
-- một CÁCH GÕ, không mất dữ liệu nào — câu ngay trên đã chứng minh đủ 2/2 dòng.
select throws_ok(
  $$ select detail from care.flags $$,
  '42501',
  null,
  'TÂM LÝ CỤM gõ thẳng care.flags.detail cũng bị TỪ CHỐI — grant theo cột không phân biệt vai; cửa của cô là care.flags_tam_ly, và cô không mất một dòng dữ liệu nào');

select test_support.logout();

-- ADR-006: bản sao lưu phải ĐỦ. Một backup thiếu cột là một backup khôi phục ra
-- cơ sở dữ liệu khác với bản gốc — và không ai biết cho tới ngày phải khôi phục.
select ok(
  has_column_privilege('backup_reader', 'care.flags', 'detail', 'select'),
  'backup_reader VẪN đọc được cột detail — ADR-006: bản sao lưu phải đủ, không thủng bảng. Lệnh revoke của 0049 chỉ nhắm authenticated');

-- ═══ 4. HÌNH DẠNG — chống mở lại cửa một cách kín đáo ════════════════════════
select ok(
  not has_table_privilege('authenticated', 'care.flags', 'select'),
  'authenticated KHÔNG còn quyền SELECT MỨC BẢNG trên care.flags — nếu còn thì mọi grant theo cột bên dưới là trang trí (Postgres chỉ WARNING khi revoke cột ra khỏi quyền bảng)');

select ok(
  not has_column_privilege('authenticated', 'care.flags', 'detail', 'select'),
  'authenticated KHÔNG có quyền SELECT trên cột detail — đây là câu ngắn nhất mô tả đúng cái lỗ DEBT #39');

-- Câu quan trọng nhất của cả file, và nó nhìn theo CHIỀU NGƯỢC LẠI với hai câu
-- trên. Hai câu trên hỏi "detail đã đóng chưa"; câu này hỏi "còn cột nào bị đóng
-- NHẦM không". Thiếu nó thì một lần revoke tay nặng hơn dự định (hoặc một cột mới
-- thêm vào care.flags mà quên đưa vào danh sách grant ở 0049) sẽ làm buồng lái
-- của cô trắng trơn — mà trắng trơn đọc y hệt "lớp mình đang ổn".
select is(
  (select coalesce(string_agg(c.column_name, ',' order by c.ordinal_position), '(rỗng)')
     from information_schema.columns c
    where c.table_schema = 'care' and c.table_name = 'flags'
      and c.column_name <> 'detail'
      and not has_column_privilege('authenticated', 'care.flags', c.column_name, 'select')),
  '(rỗng)',
  'MỌI cột khác detail đều còn quyền đọc — thêm cột vào care.flags mà quên đưa vào danh sách grant ở 0049 thì câu này đỏ, thay vì cột đó vô hình với buồng lái trong im lặng');

-- View chủ-quyền: nếu ai đó "sửa cho đúng luật 0024" bằng cách bật
-- security_invoker thì view sẽ kiểm quyền bằng quyền NGƯỜI GỌI — mà người gọi vừa
-- bị revoke đúng cột detail ⇒ view tự chặn chính nó ⇒ tâm lý cụm mất sạch, im lặng.
select ok(
  coalesce((select not ('security_invoker=true' = any (c.reloptions))
              from pg_class c where c.oid = 'care.flags_tam_ly'::regclass), true),
  'care.flags_tam_ly KHÔNG bật security_invoker — cố ý ngược luật chung của 0024, cùng lý do với attendance.checkins_care (0038): view invoker sẽ tự chặn chính nó vì người gọi vừa mất quyền cột');

select ok(
  (select 'security_barrier=true' = any (c.reloptions)
     from pg_class c where c.oid = 'care.flags_tam_ly'::regclass),
  'care.flags_tam_ly bật security_barrier — không có nó, planner được phép chạy hàm rẻ tiền của người gọi TRƯỚC mệnh đề phạm vi');

-- Phạm vi dòng của view phải là TẬP CON của phạm vi RLS đã có. `in_my_cluster` ⊂
-- `can_see_care`; đổi sang `can_see_care` là mở cột detail lại cho đúng người vừa
-- bị cắt, và mở im lặng.
select ok(
  pg_get_viewdef('care.flags_tam_ly'::regclass) like '%in_my_cluster%',
  'care.flags_tam_ly gác bằng core.in_my_cluster — hàm này đã tự mang điều kiện role_code = counselor bên trong (0009:57), không cần và không được viết lại điều kiện đó ở đây');

select ok(
  pg_get_viewdef('care.flags_tam_ly'::regclass) not like '%can_see_care%'
    and pg_get_viewdef('care.flags_tam_ly'::regclass) not like '%is_homeroom_of%',
  'care.flags_tam_ly KHÔNG gọi can_see_care/is_homeroom_of — cả hai đều chứa nhánh chủ nhiệm, dùng chúng ở đây là mở lại đúng cửa vừa đóng');

-- §5 tường lửa báo cáo học thuật: số đếm cảm xúc tuyệt đối không đi vào đường
-- học thuật, kể cả dưới dạng "chỉ là con số".
select ok(
  not has_table_privilege('reporting', 'care.flags_tam_ly', 'select')
    and not has_table_privilege('connector', 'care.flags_tam_ly', 'select'),
  'reporting và connector KHÔNG được cấp care.flags_tam_ly — §5 tường lửa báo cáo học thuật, và §8 connector chỉ ghi staging');

-- PUBLIC không phải một vai trong `pg_roles` nên `has_table_privilege('public', …)`
-- ném lỗi "role does not exist" chứ không trả false. Hỏi thẳng ACL: grantee = 0 là
-- cách Postgres ghi PUBLIC trong `relacl`.
select ok(
  not exists (
    select 1 from pg_class c, aclexplode(c.relacl) a
     where c.oid = 'care.flags_tam_ly'::regclass and a.grantee = 0),
  'PUBLIC không có quyền nào trên care.flags_tam_ly — revoke all from public là bước dễ quên nhất khi tạo view mới');

select * from finish();
rollback;
