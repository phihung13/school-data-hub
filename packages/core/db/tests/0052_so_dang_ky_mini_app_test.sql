-- pgTAP — SỔ ĐĂNG KÝ MINI APP (migration 0052)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0052_so_dang_ky_mini_app_test.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- BÀI NÀY HỎI BA LOẠI CÂU, KHÔNG PHẢI MỘT
--
--   A. Ràng buộc có TỪ CHỐI thật không — với mỗi CHECK, dựng đúng một dòng vi phạm và
--      đòi database ném lỗi. Một CHECK viết sai cú pháp (ví dụ quên `not`) vẫn tạo bảng
--      thành công và vẫn "có mặt" trong \d — chỉ có phép thử mới phân biệt được nó đang
--      canh hay đang gật đầu với mọi thứ.
--   B. RLS có che đúng người không — đăng nhập bằng ba vai thật rồi đếm.
--   C. Mặc định có fail-closed không — hàng khai tối thiểu phải ra "tắt, không ai mở
--      được", không phải "bật, mọi người vào".
--
-- LUẬT TỰ ÁP: mọi khẳng định PHỦ ĐỊNH ("vai này không thấy") có một khẳng định KHẲNG
-- ĐỊNH đứng trước nói rõ có bao nhiêu dòng để mà thấy. Không có nó thì "không thấy gì"
-- và "không có gì" trông giống hệt nhau, và bài test xanh vì mẫu số rỗng.
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(29);
select test_support.seed_basic();

-- ---------------------------------------------------------------------------
-- 0. Bảng và cột có mặt
-- ---------------------------------------------------------------------------

select has_table('core', 'embedded_apps', 'core.embedded_apps tồn tại');
select has_view('core', 'v_mini_app_can_ra_lai', 'core.v_mini_app_can_ra_lai tồn tại');
select col_is_pk('core', 'embedded_apps', 'app_id', 'app_id là khoá chính');

-- Cột giữ TÊN biến môi trường, không giữ secret. Nếu một ngày ai đó đổi tên cột thành
-- `webhook_secret` thì phép kiểm này đỏ — và đó chính là lúc cần một người đọc lại khối
-- chú thích ở đầu migration trước khi tiếp tục.
-- ĐỔI 08/08/2026 bởi `0058` — ghi lại thay vì xoá phép kiểm.
-- Cột `webhook_secret_env` đã bị XOÁ: mọi app dùng một chuỗi chung của trường, không app
-- nào có khoá riêng. Điều đáng khoá vẫn được khoá, và nay khoá CHẶT HƠN: bảng không giữ
-- secret, VÀ không giữ cả tên biến secret — một trường còn tồn tại là một trường còn khai
-- được, và ngày có người khai mà quên đặt giá trị là ngày cổng đóng câm.
select hasnt_column('core', 'embedded_apps', 'webhook_secret_env',
  'KHÔNG còn cột tên biến secret riêng cho từng app (0058)');
select hasnt_column('core', 'embedded_apps', 'webhook_secret',
  'KHÔNG có cột chứa secret thật: bản sao lưu database không được mang secret đi theo');

-- ---------------------------------------------------------------------------
-- 1. Mặc định fail-closed
-- ---------------------------------------------------------------------------

insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on)
values ('app-toi-thieu', 'App khai tối thiểu', 'xanh', 'đội thử', current_date + 180);

select is(
  (select enabled from core.embedded_apps where app_id = 'app-toi-thieu'),
  false,
  'app vừa khai mặc định TẮT — chưa ai duyệt, chưa ai đo, chưa ai đọc Manifest');

select is(
  (select allowed_roles from core.embedded_apps where app_id = 'app-toi-thieu'),
  '{}'::text[],
  'app vừa khai mặc định KHÔNG vai nào mở được (fail-closed)');

select is(
  (select allowed_event_types from core.embedded_apps where app_id = 'app-toi-thieu'),
  '{}'::text[],
  'app vừa khai mặc định không nhận loại sự kiện nào');

-- ---------------------------------------------------------------------------
-- 2. Từng ràng buộc có TỪ CHỐI thật
-- ---------------------------------------------------------------------------

-- Rổ Đỏ: mục 0 của 08-embedded-apps.md nói "cấm tuyệt đối, không có đường xin". Ở đây
-- nó không phải một lời dặn mà là một trạng thái không biểu diễn được.
select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on)
    values ('ro-do', 'App rổ Đỏ', 'do', 'ai đó', current_date)$$,
  '23514',
  null,
  'KHÔNG khai được app rổ Đỏ — kể cả bằng psql, kể cả bằng quản trị');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, origin)
    values ('thieu-bo', 'Thiếu iframe_url', 'xanh', 'ai đó', current_date, 'https://a.vn')$$,
  '23514', null,
  'có origin mà thiếu iframe_url thì bị chặn — nếu không, /embed dựng một khung trống');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, iframe_url)
    values ('thieu-origin', 'Thiếu origin', 'xanh', 'ai đó', current_date, 'https://a.vn/e')$$,
  '23514', null,
  'có iframe_url mà thiếu origin thì bị chặn — CSP không có gì để allowlist');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, origin, iframe_url)
    values ('lech-mien', 'Lệch miền', 'xanh', 'ai đó', current_date, 'https://a.vn', 'https://b.vn/e')$$,
  '23514', null,
  'iframe_url phải nằm trong origin đã khai — lệch miền là CSP chặn, app trắng, không ai hiểu vì sao');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, allowed_event_types)
    values ('sao-ro-vang', 'Rổ Vàng xin sao', 'vang', 'ai đó', current_date, array['*'])$$,
  '23514', null,
  'rổ Vàng KHÔNG nhận được "*" — ở đó "mọi loại sự kiện" là ký một tờ giấy trắng về từng em');

select lives_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, allowed_event_types)
    values ('sao-ro-xanh', 'Rổ Xanh xin sao', 'xanh', 'ai đó', current_date + 90, array['*'])$$,
  'rổ Xanh THÌ nhận được "*" — không định danh em nào để mà lộ');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, allowed_roles)
    values ('vai-la', 'Vai không có thật', 'xanh', 'ai đó', current_date, array['giam-doc'])$$,
  '23514', null,
  'vai không có trong hệ bị chặn — một vai gõ sai là một hàng rào không bao giờ khớp ai');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, origin, iframe_url)
    values ('http-tran', 'HTTP trần', 'xanh', 'ai đó', current_date, 'http://a.vn', 'http://a.vn/e')$$,
  '23514', null,
  'origin http:// bị chặn — token đi qua postMessage tới một origin không mã hoá là token cho không');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, origin, iframe_url)
    values ('co-duong-dan', 'Origin có path', 'xanh', 'ai đó', current_date, 'https://a.vn/x', 'https://a.vn/x/e')$$,
  '23514', null,
  'origin KHÔNG được mang đường dẫn — nó đi thẳng vào phép so event.origin của postMessage');

select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on)
    values ('Chữ Hoa Và Dấu', 'Mã app sai', 'xanh', 'ai đó', current_date)$$,
  '23514', null,
  'mã app phải là chuỗi an toàn cho URL — nó đi thẳng vào /embed/<app_id>');

-- ---------------------------------------------------------------------------
-- 3. updated_at tự đi theo
-- ---------------------------------------------------------------------------

-- KHÔNG so `updated_at > created_at`: cả bài test chạy trong MỘT transaction, mà `now()`
-- trả về thời điểm mở transaction chứ không phải thời điểm gọi. Hai cột sẽ bằng nhau và
-- phép kiểm đỏ vì lý do không liên quan gì tới trigger. (Bản đầu viết đúng như vậy và đỏ
-- ngay lượt chạy đầu — ghi lại để người sau đừng "sửa" nó về kiểu cũ.)
--
-- Cách chứng minh không phụ thuộc đồng hồ: gieo một giá trị CŨ RÕ RÀNG rồi xem trigger có
-- ghi đè không. Trigger là BEFORE UPDATE nên INSERT không kích hoạt — giá trị cũ ở lại.
insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, updated_at)
values ('app-dau-thoi-gian', 'Thử dấu thời gian', 'xanh', 'đội thử', current_date + 200, timestamptz '2020-01-01');
select is(
  (select updated_at from core.embedded_apps where app_id = 'app-dau-thoi-gian'),
  timestamptz '2020-01-01',
  'INSERT không kích hoạt trigger — mẫu số cho phép kiểm ngay dưới');

update core.embedded_apps set display_name = 'Đổi tên' where app_id = 'app-dau-thoi-gian';
select ok(
  (select updated_at from core.embedded_apps where app_id = 'app-dau-thoi-gian') > timestamptz '2020-01-01',
  'UPDATE thì trigger ghi đè updated_at — không nhờ tầng gọi nhớ');

-- ---------------------------------------------------------------------------
-- 4. RLS — khẳng định KHẲNG ĐỊNH trước, phủ định sau
-- ---------------------------------------------------------------------------

-- Bật một app để có cả hai loại dòng trong bảng.
update core.embedded_apps set enabled = true where app_id = 'sao-ro-xanh';

-- MẪU SỐ: nói rõ đang có bao nhiêu dòng và bao nhiêu dòng đang tắt, TRƯỚC khi đăng nhập
-- bất kỳ ai. Thiếu phần này thì "cô giáo thấy 1 dòng" không phân biệt được với "bảng chỉ
-- có 1 dòng".
select ok(
  (select count(*) from core.embedded_apps) >= 3,
  'mẫu số: bảng có ít nhất 3 app để mà che hay không che');
select ok(
  (select count(*) from core.embedded_apps where not enabled) >= 1,
  'mẫu số: có ít nhất 1 app ĐANG TẮT — nếu không, phép kiểm che-app-tắt bên dưới xanh vì rỗng');

select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- Cô Lan, GVCN 6A1
select is(
  (select count(*)::int from core.embedded_apps where not enabled),
  0,
  'giáo viên KHÔNG thấy app đang tắt');
select ok(
  (select count(*) from core.embedded_apps) >= 1,
  'giáo viên VẪN thấy app đang bật — trang chủ cần danh sách này để dựng lưới tile');
-- RLS TRÊN UPDATE KHÔNG NÉM LỖI — NÓ LẶNG LẼ SỬA 0 DÒNG.
--
-- Bản đầu của phép kiểm này viết `throws_ok(..., '42501')` và đỏ với "caught: no
-- exception". Đó không phải lỗi của RLS mà là điều đáng biết nhất trong cả bài: chính
-- sách chỉ-quản-trị áp cho UPDATE bằng cách LỌC hàng, nên câu lệnh của cô giáo hợp lệ,
-- chạy xong, không đổi gì, và Postgres trả về "UPDATE 0" — im lặng tuyệt đối.
--
-- Hệ quả nằm ở TẦNG TRÊN, không ở đây: một router gọi `update ...` rồi trả về "đã lưu"
-- mà không xem `rowCount` sẽ báo thành công cho một thao tác chưa từng xảy ra. Đó chính
-- là lý do `miniApp.setEnabled` trong apps/hub/server/routers/admin.ts phải kiểm
-- rowCount và ném FORBIDDEN — và lý do bài test này giữ nguyên hình dạng "0 dòng" thay
-- vì được sửa cho đẹp.
with sua as (
  update core.embedded_apps set enabled = true where app_id = 'app-toi-thieu' returning 1
)
select is((select count(*)::int from sua), 0,
  'giáo viên bấm công tắc thì KHÔNG dòng nào đổi — và KHÔNG lỗi nào nổ ra (xem chú thích)');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Học sinh Minh
select is(
  (select count(*)::int from core.embedded_apps where not enabled),
  0,
  'học sinh KHÔNG thấy app đang tắt');
-- INSERT thì KHÁC UPDATE: `with check` không có hàng nào để lọc nên nó ném thật (42501).
-- Hai lệnh, hai kiểu từ chối — biết rõ kiểu nào ở đâu là điều kiện để tầng trên xử đúng.
select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on)
    values ('em-tu-khai', 'Em tự khai app', 'xanh', 'em', current_date)$$,
  '42501', null,
  'học sinh KHÔNG khai được app mới — INSERT thì NÉM LỖI thật, không im như UPDATE');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000007');  -- Hùng, quản trị
select ok(
  (select count(*) from core.embedded_apps where not enabled) >= 1,
  'quản trị THẤY app đang tắt — không thấy thì không bật lại được thứ mình vừa tắt');
select lives_ok(
  $$update core.embedded_apps set enabled = true where app_id = 'app-toi-thieu'$$,
  'quản trị bật/tắt được app — đây là công tắc thu hồi trong mười giây, không cần deploy');
select test_support.logout();

select * from finish();
rollback;
