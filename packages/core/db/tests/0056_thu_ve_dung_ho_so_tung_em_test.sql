-- pgTAP — THƯ VỀ ĐÚNG HỒ SƠ TỪNG EM (migration 0056, ADR-033)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0056_thu_ve_dung_ho_so_tung_em_test.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- BÀI NÀY HỎI BA CÂU
--
--   A. Thư có được PHÂN vào đúng hồ sơ không — user_id giải ra đúng em, và user_id không
--      giải được thì vào hàng đợi lỗi chứ KHÔNG lưu null trong im lặng. Lưu null là
--      biến một lỗi thành một dòng trông y hệt "sự kiện không gắn em nào", và từ đó
--      không ai còn cách nào phân biệt.
--   B. Rổ Xanh có thật sự KHÔNG gắn được tên em không — hỏi bằng cách bắt máy từ chối,
--      không bằng cách đọc lại lời hứa trong tài liệu.
--   C. Ai đọc được, và quan trọng hơn: ai KHÔNG đọc được. Chủ đầu tư chọn mở cho cả phụ
--      huynh và học sinh (08/08/2026), nên phần nặng nhất của bài này là chứng minh hai
--      chốt đi kèm có gánh việc thật.
--
-- LUẬT TỰ ÁP (chép từ 0052): mọi khẳng định PHỦ ĐỊNH có một khẳng định KHẲNG ĐỊNH đứng
-- trước nói rõ có bao nhiêu dòng để mà thấy. "Phụ huynh không đọc được" và "bảng rỗng"
-- trông giống hệt nhau nếu không có mẫu số.
-- ─────────────────────────────────────────────────────────────────────────────

begin;
select plan(35);
select test_support.seed_basic();

-- ---------------------------------------------------------------------------
-- 0. Cột, trigger, view, chính sách có mặt
-- ---------------------------------------------------------------------------

select has_column('ops', 'embedded_app_events', 'student_id', 'cột student_id tồn tại');
select col_is_fk('ops', 'embedded_app_events', 'student_id',
  'student_id là khoá ngoại — sự kiện không bao giờ trỏ vào một đứa trẻ không tồn tại');
select has_view('ops', 'v_mini_app_da_nhan', 'khung nhìn cho màn quản trị tồn tại');
select has_function('ops', 'tg_su_kien_ro_xanh_khong_gan_em', 'trigger canh rổ Xanh tồn tại');

-- `security_invoker` là thứ phân biệt một khung nhìn CÓ hàng rào với một khung nhìn vượt
-- mặt hàng rào. Quên nó thì view trả về mọi dòng cho mọi người, và không có lỗi nào.
select is(
  (select 'security_invoker=on' = any(reloptions) from pg_class where oid = 'ops.v_mini_app_da_nhan'::regclass),
  true,
  'view chạy bằng quyền NGƯỜI GỌI — thiếu điều này là nó vượt mặt RLS vừa dựng');

-- ---------------------------------------------------------------------------
-- 1. Dựng hai app thử: một rổ Vàng, một rổ Xanh
-- ---------------------------------------------------------------------------

insert into core.embedded_apps (app_id, display_name, basket, enabled, allowed_roles, allowed_event_types, owner, review_due_on)
values
  ('t-vang', 'App thử rổ Vàng', 'vang', true,
   array['student','guardian','homeroom','counselor','admin']::text[], array['ket_qua'], 'bài test', current_date + 180),
  ('t-xanh', 'App thử rổ Xanh', 'xanh', true,
   array['student','guardian','homeroom','admin']::text[], array['thuc_don'], 'bài test', current_date + 180),
  -- App CHỈ mở cho giáo viên — mẫu số của CHỐT 2. Không có nó thì "phụ huynh không đọc
  -- được app này" không chứng minh được điều gì.
  ('t-chi-gv', 'App thử chỉ cho giáo viên', 'vang', true,
   array['homeroom']::text[], array['ket_qua'], 'bài test', current_date + 180);

-- ĐỔI 21/08/2026 (ADR-038, migration 0061): alias đã bỏ, app gửi `user_id` thật.
-- Điều kiện thay thế là em phải TỪNG ĐĂNG NHẬP vào chính app đó — dòng
-- `core.identity_links` dưới đây chính là thứ `provider.ts` ghi mỗi lần cấp token.
-- Cố ý chỉ liên kết Minh với `t-vang`, KHÔNG với `t-chi-gv`: chỗ trống đó là mẫu số
-- của assertion "app khác không mượn được người của app này".
insert into core.identity_links (system, external_id, user_id) values
  ('embed-login:t-vang', '40000000-0000-0000-0000-000000000005',
   '40000000-0000-0000-0000-000000000005');

-- ---------------------------------------------------------------------------
-- 2. (A) Thư có được phân vào đúng hồ sơ không
-- ---------------------------------------------------------------------------

-- Đi qua ĐÚNG đường mà webhook đi: ingest → promote. Không insert thẳng vào bảng đích —
-- insert thẳng là đo một đường mà sản phẩm không dùng.
select is(
  core.promote_embedded_event(
    staging.ingest_embedded_event('embed:t-vang', 'sk-01',
      '{"event_type":"ket_qua","user_id":"40000000-0000-0000-0000-000000000005","chay_30m":"5.8s"}'::jsonb)),
  'promoted',
  'sự kiện mang user_id của người ĐÃ đăng nhập app đó được nhận (ADR-038 thay alias)');

select is(
  (select student_id from ops.embedded_app_events where app_id = 't-vang' and external_id = 'sk-01'),
  '70000000-0000-0000-0000-000000000001'::uuid,
  'ĐÃ PHÂN ĐÚNG HỒ SƠ — user_id giải qua core.students.user_id ra đúng em, không còn nằm chìm trong JSON');

select is(
  (select payload ->> 'chay_30m' from ops.embedded_app_events where app_id = 't-vang' and external_id = 'sk-01'),
  '5.8s',
  'phần còn lại của payload GIỮ NGUYÊN — không ép lược đồ nghiệp vụ của app nào');

-- Alias sai: phải vào hàng đợi lỗi, KHÔNG lưu null.
select is(
  core.promote_embedded_event(
    staging.ingest_embedded_event('embed:t-vang', 'sk-02',
      '{"event_type":"ket_qua","user_id":"40000000-0000-0000-0000-0000000000ff"}'::jsonb)),
  'import_error',
  'user_id Hub không nhận ra thì vào hàng đợi lỗi — không lưu null trong im lặng');

select is(
  (select count(*)::int from ops.embedded_app_events where app_id = 't-vang' and external_id = 'sk-02'),
  0,
  'và KHÔNG để lại một dòng student_id null trông y hệt "sự kiện không gắn em nào"');

-- Hàng rào THAY CHO alias (ADR-038): app chỉ gửi được dữ liệu của người đã đăng nhập vào
-- CHÍNH NÓ. Minh có liên kết với `t-vang` nhưng KHÔNG với `t-chi-gv`, nên app kia không
-- mượn được id của em — đây là thứ giữ cho một app không bơm dữ liệu dưới tên người lạ.
select is(
  core.promote_embedded_event(
    staging.ingest_embedded_event('embed:t-chi-gv', 'sk-03',
      '{"event_type":"ket_qua","user_id":"40000000-0000-0000-0000-000000000005"}'::jsonb)),
  'import_error',
  'app mà em CHƯA đăng nhập vào thì không gửi được dữ liệu của em — hàng rào thay alias');

-- Trường `alias` của bản brief cũ phải hỏng ỒN ÀO, không bị nuốt trong im lặng.
select is(
  core.promote_embedded_event(
    staging.ingest_embedded_event('embed:t-vang', 'sk-03b',
      '{"event_type":"ket_qua","alias":"alias-minh-vang"}'::jsonb)),
  'import_error',
  'app dựng theo brief CŨ gửi alias thì bị từ chối tường minh — nuốt nó là để dòng dữ liệu vào kho không gắn em nào, trông y hệt một sự kiện rổ Xanh hợp lệ');

-- Không alias: hợp lệ, đó là sự kiện không gắn em nào.
select is(
  core.promote_embedded_event(
    staging.ingest_embedded_event('embed:t-xanh', 'sk-04',
      '{"event_type":"thuc_don","mon":"com ga"}'::jsonb)),
  'promoted',
  'sự kiện không user_id vẫn nhận — thực đơn tuần không gắn em nào là chuyện bình thường');

select is(
  (select student_id from ops.embedded_app_events where app_id = 't-xanh' and external_id = 'sk-04'),
  null,
  'và nó để student_id trống, đúng nghĩa');

-- Gửi lại y hệt: §9.
select is(
  core.promote_embedded_event(
    staging.ingest_embedded_event('embed:t-vang', 'sk-01',
      '{"event_type":"ket_qua","alias":"alias-minh-vang","chay_30m":"5.8s"}'::jsonb)),
  'already_promoted',
  'gửi lại cùng external_id không sinh dòng thứ hai (§9)');

select is(
  (select count(*)::int from ops.embedded_app_events where app_id = 't-vang'),
  1,
  'sau hai lượt gửi vẫn ĐÚNG một dòng');

-- ---------------------------------------------------------------------------
-- 3. (B) Rổ Xanh KHÔNG gắn được tên em — máy từ chối, không phải người nhớ
-- ---------------------------------------------------------------------------

-- Ca hiểm: app rổ XANH gửi kèm một alias có thật của app khác. Không có trigger thì dòng
-- này vào bảng mang tên một em — tức là một app đã qua cửa duyệt nhẹ đang giữ dữ liệu định
-- danh trẻ em.
insert into core.id_mappings (system, external_id, student_id)
values ('embed:t-xanh', 'alias-minh-xanh', '70000000-0000-0000-0000-000000000001');

select is(
  core.promote_embedded_event(
    staging.ingest_embedded_event('embed:t-xanh', 'sk-05',
      '{"event_type":"thuc_don","alias":"alias-minh-xanh"}'::jsonb)),
  'import_error',
  'app rổ XANH gửi kèm alias thì BỊ CHẶN — rổ Xanh nghĩa là không gắn định danh em nào');

select is(
  (select count(*)::int from ops.embedded_app_events where app_id = 't-xanh' and student_id is not null),
  0,
  'và không dòng nào của app rổ Xanh mang tên em');

-- Chặn cả đường đi vòng: ghi THẲNG vào bảng, không qua promote().
select throws_ok(
  $$insert into ops.embedded_app_events (app_id, student_id, event_type, payload, external_id)
    values ('t-xanh', '70000000-0000-0000-0000-000000000001', 'thuc_don', '{}'::jsonb, 'sk-vong')$$,
  '42501', null,
  'ghi THẲNG vào bảng cũng bị chặn — hàng rào ở tầng máy, không ở tầng hàm gọi');

select lives_ok(
  $$insert into ops.embedded_app_events (app_id, student_id, event_type, payload, external_id)
    values ('t-vang', '70000000-0000-0000-0000-000000000001', 'ket_qua', '{}'::jsonb, 'sk-vang-ok')$$,
  'cùng câu lệnh đó với app rổ VÀNG thì đi được — trigger chặn đúng chỗ, không chặn bừa');

-- ---------------------------------------------------------------------------
-- 4. (C) AI ĐỌC ĐƯỢC — mẫu số trước, phủ định sau
-- ---------------------------------------------------------------------------

-- Dựng thêm dữ liệu cho em Minh ở app CHỈ-GIÁO-VIÊN (mẫu số của CHỐT 2).
-- Liên kết đăng nhập phải có TRƯỚC (ADR-038) — và cố ý thêm ở ĐÂY chứ không ở khối seed
-- đầu file: khối trên cần Minh CHƯA liên kết với app này để assertion "app em chưa đăng
-- nhập thì không gửi được" có mẫu số thật.
insert into core.identity_links (system, external_id, user_id) values
  ('embed-login:t-chi-gv', '40000000-0000-0000-0000-000000000005',
   '40000000-0000-0000-0000-000000000005');

select core.promote_embedded_event(
  staging.ingest_embedded_event('embed:t-chi-gv', 'sk-gv-01',
    '{"event_type":"ket_qua","user_id":"40000000-0000-0000-0000-000000000005"}'::jsonb));

-- MẪU SỐ: nói rõ có bao nhiêu dòng để mà thấy, TRƯỚC khi đăng nhập bất kỳ ai.
select ok(
  (select count(*) from ops.embedded_app_events where student_id is not null) >= 3,
  'mẫu số: có ít nhất 3 dòng gắn tên em trong bảng');
select ok(
  (select count(*) from ops.embedded_app_events where app_id = 't-chi-gv' and student_id is not null) >= 1,
  'mẫu số: app chỉ-cho-giáo-viên có ít nhất 1 dòng về em Minh');

-- ── Học sinh Minh: thấy của mình, không thấy app không mở cho vai mình ──
select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Học sinh Minh
select ok(
  (select count(*) from ops.embedded_app_events where app_id = 't-vang') >= 1,
  'HỌC SINH đọc được dữ liệu của chính mình — đúng quyết định 08/08/2026');
select is(
  (select count(*)::int from ops.embedded_app_events where app_id = 't-chi-gv'),
  0,
  'CHỐT 2: nhưng KHÔNG đọc được app chỉ mở cho giáo viên, dù dòng đó mang tên chính em');
select is(
  (select count(*)::int from ops.embedded_app_events where student_id is null),
  0,
  'và không đọc được dòng không gắn em nào — đó là việc của quản trị');
select test_support.logout();

-- ── Phụ huynh: thấy con mình ──
select test_support.login_as('90000000-0000-0000-0000-000000000004');  -- Phụ huynh của Minh
select ok(
  (select count(*) from ops.embedded_app_events where app_id = 't-vang') >= 1,
  'PHỤ HUYNH đọc được dữ liệu của con mình — đúng quyết định 08/08/2026');
select is(
  (select count(*)::int from ops.embedded_app_events where app_id = 't-chi-gv'),
  0,
  'CHỐT 2 áp cho phụ huynh y như học sinh');
select test_support.logout();

-- ── Cô chủ nhiệm: thấy lớp mình, KỂ CẢ app chỉ mở cho giáo viên ──
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- Cô Lan, GVCN 6A1
select ok(
  (select count(*) from ops.embedded_app_events where app_id = 't-vang') >= 1,
  'CHỦ NHIỆM đọc được dữ liệu học sinh lớp mình');
select ok(
  (select count(*) from ops.embedded_app_events where app_id = 't-chi-gv') >= 1,
  'và đọc được app chỉ mở cho giáo viên — vai của cô nằm trong allowed_roles của app đó');
select test_support.logout();

-- ── Giáo viên bộ môn: `can_see_student` cho phép, nhưng app không mở cho vai này ──
-- Đây là phép kiểm chứng minh CHỐT 2 gánh việc THẬT chứ không trùng lặp với CHỐT 1: nếu
-- chỉ có `can_see_student` thì thầy bộ môn dạy em Minh sẽ đọc được, vì hàm đó có nhánh
-- `teaches`. App `t-vang` không mở cho `teacher`, nên câu trả lời phải là 0.
select test_support.login_as('90000000-0000-0000-0000-000000000002');  -- Thầy Nam, bộ môn
select is(
  (select count(*)::int from ops.embedded_app_events),
  0,
  'CHỐT 2 gánh việc thật: giáo viên bộ môn thấy được EM nhưng không thấy dữ liệu app không mở cho mình');
select test_support.logout();

-- ── Tắt app là cắt luôn đường đọc ──
update core.embedded_apps set enabled = false where app_id = 't-vang';
select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Học sinh Minh
select is(
  (select count(*)::int from ops.embedded_app_events where app_id = 't-vang'),
  0,
  'TẮT APP LÀ CẮT LUÔN ĐƯỜNG ĐỌC — thu hồi một app không để lại dữ liệu của nó còn xem được');
select test_support.logout();
update core.embedded_apps set enabled = true where app_id = 't-vang';

-- ── Quản trị: thấy hết, kể cả dòng không gắn em ──
select test_support.login_as('90000000-0000-0000-0000-000000000007');  -- Hùng, quản trị
select ok(
  (select count(*) from ops.embedded_app_events where student_id is null) >= 1,
  'QUẢN TRỊ đọc được cả dòng không gắn em nào — nếu không thì "app này gửi về gì" lại thành câu không ai trả lời được');
select ok(
  (select count(*) from ops.v_mini_app_da_nhan where app_id = 't-vang') >= 1,
  'và khung nhìn tổng hợp cho ra số cho màn quản trị');
select test_support.logout();

-- ---------------------------------------------------------------------------
-- 5. Xoá em thì dữ liệu app đi theo — Luật 91/2025
-- ---------------------------------------------------------------------------
-- Giữ hồ sơ trẻ em quá hạn dưới tên "dữ liệu app con" là vi phạm, không phải cẩn thận.

-- Dùng một em DỰNG RIÊNG cho phép kiểm này, không xoá em Minh của bộ dữ liệu mẫu: Minh có
-- điểm danh, cờ, báo cáo, phụ huynh… nên lệnh xoá sẽ vấp một khoá ngoại khác và bài test sẽ
-- đỏ vì một lý do không liên quan gì tới thứ nó muốn đo.
-- Em này cần một TÀI KHOẢN thì mới có `user_id` để app gọi tên (ADR-038) — alias cũ
-- không đòi điều đó. Đây là một hệ quả thật của quyết định 21/08/2026: em chưa có tài
-- khoản (mầm non, theo chú thích ở `core.students.user_id`) thì app ngoài KHÔNG gửi được
-- dữ liệu về em đó nữa. Ghi ra đây để lần sau không ai coi là chuyện đương nhiên.
insert into core.users (id, auth_uid, email, full_name, status)
values ('40000000-0000-0000-0000-0000000000ff', '90000000-0000-0000-0000-0000000000ff',
        'em-xoa-thu@va.edu.vn', 'Em dựng để đo xoá', 'active');
insert into core.students (id, student_code, full_name, school_id, user_id)
values ('70000000-0000-0000-0000-0000000000ff', 'VA-2026-99999', 'Em dựng để đo xoá',
        '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000ff');
insert into core.identity_links (system, external_id, user_id)
values ('embed-login:t-vang', '40000000-0000-0000-0000-0000000000ff',
        '40000000-0000-0000-0000-0000000000ff');
select core.promote_embedded_event(
  staging.ingest_embedded_event('embed:t-vang', 'sk-xoa-01',
    '{"event_type":"ket_qua","user_id":"40000000-0000-0000-0000-0000000000ff"}'::jsonb));

select is(
  (select count(*)::int from ops.embedded_app_events where student_id = '70000000-0000-0000-0000-0000000000ff'),
  1,
  'mẫu số: em vừa dựng đang có đúng 1 dòng dữ liệu app');

delete from core.students where id = '70000000-0000-0000-0000-0000000000ff';
select is(
  (select count(*)::int from ops.embedded_app_events where student_id = '70000000-0000-0000-0000-0000000000ff'),
  0,
  'xoá em thì mọi dòng dữ liệu app của em đi theo (on delete cascade) — Luật 91/2025');

select * from finish();
rollback;
