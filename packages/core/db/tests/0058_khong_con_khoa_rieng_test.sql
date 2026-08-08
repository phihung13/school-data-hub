-- pgTAP — KHÔNG CÒN KHOÁ RIÊNG (migration 0058)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0058_khong_con_khoa_rieng_test.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- BÀI NÀY ĐO MỘT ĐIỀU CẤM, VÀ MỘT ĐIỀU KHÔNG ĐƯỢC MẤT THEO
--
-- `0058` xoá hai cột giữ TÊN biến secret riêng cho từng app. Xoá cột là việc dễ làm hỏng
-- thứ khác, nên bài này hỏi hai câu:
--   A. Khái niệm "khoá riêng" có THẬT SỰ biến mất không — kể cả với người vào bằng psql.
--   B. Cái KHÔNG được mất theo: Factory vẫn là RP, khung nhìn vẫn cho ra nó, và ràng buộc
--      còn lại (`sso_enabled` đòi redirect_uri) vẫn chặn.
--
-- Câu B quan trọng ngang câu A: `core.v_oidc_clients` từng SELECT cột vừa xoá. Sửa hụt một
-- chỗ là "bỏ khoá riêng" hoá ra "mọi app mất đăng nhập".
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(9);
select test_support.seed_basic();

-- ── A. Khái niệm khoá riêng đã biến mất ─────────────────────────────────────
select hasnt_column('core', 'embedded_apps', 'webhook_secret_env',
  'cột tên biến secret webhook đã xoá — không còn khai được, kể cả bằng psql');
select hasnt_column('core', 'embedded_apps', 'sso_client_secret_env',
  'cột tên biến secret đăng nhập đã xoá');

-- Và secret THẬT thì vẫn chưa bao giờ có mặt — đây là lời hứa gốc của 0052, không được nới
-- kèm theo lần dọn này.
select hasnt_column('core', 'embedded_apps', 'webhook_secret',
  'KHÔNG có cột chứa secret thật — bản sao lưu database không được mang secret đi theo');
select hasnt_column('core', 'embedded_apps', 'sso_client_secret',
  'KHÔNG có cột chứa client_secret thật');

-- Khung nhìn cũng không được để lộ một cột secret nào.
select hasnt_column('core', 'v_oidc_clients', 'client_secret_env',
  'khung nhìn RP không còn cột tên biến secret');

-- ── B. Cái KHÔNG được mất theo ──────────────────────────────────────────────
select is(
  (select sso_enabled from core.embedded_apps where app_id = 'factory'),
  true,
  'Factory vẫn là RP — 0058 đổi cách lấy khoá, không đổi việc nó có đăng nhập hay không');

-- Đây là phép kiểm đắt nhất của bài: view từng SELECT cột vừa xoá.
select is(
  (select count(*)::int from core.v_oidc_clients where client_id = 'factory'),
  1,
  'Factory VẪN có mặt trong danh sách RP — sửa hụt view là "bỏ khoá riêng" hoá ra "mất đăng nhập"');

-- Ràng buộc còn lại vẫn gánh việc: không redirect_uri thì RP không đăng nhập được, chuỗi
-- nào cũng vô nghĩa. Nới nốt vế này là cho phép khai một RP không bao giờ dùng được.
select throws_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on, sso_enabled)
    values ('t58-khong-uri', 'Không redirect', 'xanh', 'bài test', current_date, true)$$,
  '23514', null,
  'bật SSO mà không redirect_uri thì VẪN bị chặn');

-- Khai một app đủ bộ nay KHÔNG cần nhắc gì tới secret.
select lives_ok(
  $$insert into core.embedded_apps (app_id, display_name, basket, owner, review_due_on,
                                    sso_enabled, sso_redirect_uris, allowed_event_types)
    values ('t58-du', 'App đủ bộ', 'xanh', 'bài test', current_date + 200,
            true, array['https://a.vn/cb'], array['abc'])$$,
  'khai app đủ ba đường mà không nhắc gì tới secret — đó là toàn bộ điểm của 0058');

select * from finish();
rollback;
