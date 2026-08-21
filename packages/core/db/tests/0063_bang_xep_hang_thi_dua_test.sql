-- pgTAP — bảng xếp hạng thi đua (0063, ADR-037)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0063_bang_xep_hang_thi_dua_test.sql
--
-- Bốn nhóm, theo thứ tự rủi ro chứ không theo thứ tự mã nguồn:
--
--   1. RANH GIỚI §5 — CẢM XÚC KHÔNG ĐƯỢC THÀNH ĐIỂM. Đây là lời hứa duy nhất trong
--      ADR-037 mà chủ đầu tư tự vạch bằng câu của mình, và là thứ dễ mất nhất: chỉ cần
--      một người thấy "ngày nào em cũng Vui thì cộng điểm chăm ngoan" là hợp lý.
--      Canh bằng cách đọc THÂN HÀM, không bằng cách đọc kết quả — kết quả hôm nay không
--      có cảm xúc chỉ vì chưa ai thêm luật đó vào.
--   2. §9 — chạy lại cho cùng một ngày không được cộng dồn. Một bảng thi đua mà chạy
--      job hai lần thành hai lần điểm thì thứ hạng đo số lần chạy job.
--   3. §6 (tinh thần) — không hằng số điểm nào nằm trong thân hàm.
--   4. ĐƯỜNG GHI — không ai tự cộng điểm cho mình được.

begin;
select plan(16);
select test_support.seed_basic();

-- ═══ 1. RANH GIỚI §5 ═══════════════════════════════════════════════════════
-- Nguyên văn lời chủ đầu tư 21/08/2026: "ko đưa cảm xúc vào".
select ok(
  (select prosrc not like '%mood%' from pg_proc
    where oid = 'evidence.tinh_diem_thi_dua(date)'::regprocedure),
  '§5 — thân hàm tính điểm KHÔNG nhắc tới `mood` ở bất kỳ dạng nào (ranh giới chủ đầu tư vạch 21/08/2026)');

select ok(
  (select prosrc not like '%checkins_care%' and prosrc not like '%can_read_mood%'
     from pg_proc where oid = 'evidence.tinh_diem_thi_dua(date)'::regprocedure),
  '§5 — và KHÔNG đi vòng qua attendance.checkins_care hay core.can_read_mood để lấy cảm xúc');

select ok(
  (select prosrc not like '%care.%' from pg_proc
    where oid = 'evidence.tinh_diem_thi_dua(date)'::regprocedure),
  '§5 — và KHÔNG chạm schema care (cờ, hồ sơ chăm sóc, ghi chú tư vấn): thi đua không được xây trên dữ liệu chăm sóc');

-- Rổ Đỏ ở tầng vai: `reporting` (bộ sinh báo cáo học thuật, §5) không được cấp gì.
select ok(
  (select not has_table_privilege('reporting', 'evidence.diem_thi_dua', 'SELECT')),
  '§5 — role reporting KHÔNG đọc được sổ điểm thi đua: điểm thi đua không phải dữ liệu học thuật, trộn hai thứ là mở đúng cánh cửa §5 đã đóng');

-- ═══ 2. §9 — CHẠY LẠI KHÔNG CỘNG DỒN ══════════════════════════════════════
insert into attendance.checkins (student_id, occurred_on, kind, status, source) values
  ('70000000-0000-0000-0000-000000000001', current_date, 'in', 'present', 'app');

select lives_ok(
  $$ select evidence.tinh_diem_thi_dua(current_date) $$,
  'Hàm tính điểm chạy được');

select is(
  (select diem from evidence.diem_thi_dua
    where student_id = '70000000-0000-0000-0000-000000000001'
      and ngay = current_date and ma_luat = 'DI_HOC_DUNG_GIO'),
  10,
  'Em đi học đúng giờ nhận đúng số điểm khai trong evidence.luat_tinh_diem');

select evidence.tinh_diem_thi_dua(current_date);
select evidence.tinh_diem_thi_dua(current_date);
select is(
  (select diem from evidence.diem_thi_dua
    where student_id = '70000000-0000-0000-0000-000000000001'
      and ngay = current_date and ma_luat = 'DI_HOC_DUNG_GIO'),
  10,
  '§9 — chạy lại HAI lần nữa cho cùng ngày vẫn là 10, không cộng dồn thành 30');

select is(
  (select count(*)::int from evidence.diem_thi_dua
    where student_id = '70000000-0000-0000-0000-000000000001'
      and ngay = current_date and ma_luat = 'DI_HOC_DUNG_GIO'),
  1,
  '§9 — và vẫn đúng MỘT dòng, không phải ba');

-- ═══ 3. §6 (tinh thần) — trọng số nằm trong bảng, không trong câu SQL ══════
update evidence.luat_tinh_diem
   set params = '{"diem_moi_ngay": 99, "tinh_ca_di_muon": false}'
 where ma_luat = 'DI_HOC_DUNG_GIO';
select evidence.tinh_diem_thi_dua(current_date);

select is(
  (select diem from evidence.diem_thi_dua
    where student_id = '70000000-0000-0000-0000-000000000001'
      and ngay = current_date and ma_luat = 'DI_HOC_DUNG_GIO'),
  99,
  'Đổi trọng số trong BẢNG là điểm đổi theo — không deploy, không sửa câu SQL nào');

-- Tắt luật thì luật thôi sinh điểm MỚI. Dòng cũ giữ nguyên, cố ý: xoá lịch sử điểm khi
-- đổi luật là làm bảng xếp hạng tuần trước biến mất mà không ai giải thích được.
update evidence.luat_tinh_diem set active = false where ma_luat = 'DI_HOC_DUNG_GIO';
delete from evidence.diem_thi_dua where ma_luat = 'DI_HOC_DUNG_GIO';
select evidence.tinh_diem_thi_dua(current_date);
select is(
  (select count(*)::int from evidence.diem_thi_dua where ma_luat = 'DI_HOC_DUNG_GIO'),
  0,
  'Luật tắt (active = false) thì không sinh điểm mới');
update evidence.luat_tinh_diem set active = true where ma_luat = 'DI_HOC_DUNG_GIO';

-- ═══ 4. ĐƯỜNG GHI — không ai tự cộng điểm cho mình ════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh, chính em

select isnt_empty(
  $$ select 1 from evidence.v_xep_hang_ca_nhan $$,
  'Học sinh ĐỌC được bảng xếp hạng — nó công khai trong trường, đúng bản chất (ADR-037)');

select throws_ok(
  $$ insert into evidence.diem_thi_dua (student_id, ngay, ma_luat, diem)
     values ('70000000-0000-0000-0000-000000000001', current_date, 'DUNG_APP', 9999) $$,
  '42501',
  null,
  'Học sinh KHÔNG tự ghi điểm cho mình — authenticated chỉ có SELECT, đường ghi duy nhất là hàm tính điểm');

select throws_ok(
  $$ update evidence.luat_tinh_diem set params = '{"diem_moi_ngay": 9999}'::jsonb
      where ma_luat = 'DI_HOC_DUNG_GIO' $$,
  '42501',
  null,
  'Học sinh KHÔNG sửa được luật tính điểm — nếu sửa được thì §6 mở ra thành cửa gian lận');
select test_support.logout();

-- ═══ HÌNH DẠNG ════════════════════════════════════════════════════════════
-- LẬT 21/08/2026 (migration 0064) — và đây là assertion đáng đọc nhất file này.
--
-- Bản đầu đòi cả ba view `security_invoker = on`, theo bài học 0024 ("view chạy quyền
-- chủ schema là view vượt mặt RLS"). Bài học đó ĐÚNG cho view chở dữ liệu riêng của
-- từng người. Bảng thi đua thì ngược: nó là CÔNG BỐ có chủ ý, và RLS của core.students
-- (em chỉ đọc dòng của mình) trả lời một câu hỏi KHÁC. Đo thật ngày 21/08/2026 trên máy
-- chủ đang chạy: đăng nhập tài khoản em Minh, mở /thi-dua → trang 200, bảng vẽ đẹp, nội
-- dung MỘT DÒNG — chính em, hạng 1/1. Không lỗi nào nổ ra.
--
-- Nên `security_invoker` KHÔNG phải "an toàn hơn"; nó chỉ đẩy quyết định xuống RLS. Nay
-- ba view chạy quyền chủ schema, và ĐỔI LẠI chúng tự thu hẹp — hai assertion dưới đây
-- canh đúng phần thu hẹp đó.
select is(
  (select count(*)::int from pg_views v
    where v.schemaname = 'evidence'
      and v.viewname in ('v_xep_hang_ca_nhan', 'v_xep_hang_lop', 'v_xep_hang_khoi')
      and exists (select 1 from pg_class c
                   where c.relname = v.viewname
                     and coalesce(c.reloptions::text, '') like '%security_invoker=on%')),
  0,
  'Ba view xếp hạng CỐ Ý chạy quyền chủ schema (0064): để RLS gác thì mỗi em chỉ thấy chính mình và ai cũng hạng 1 — đo thật, không lỗi nào nổ ra');

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'evidence'
      and table_name in ('v_xep_hang_ca_nhan', 'v_xep_hang_lop')
      and column_name in ('student_id', 'class_id')),
  0,
  'Đổi lại: view KHÔNG trả student_id/class_id — bảng xếp hạng cần TÊN và ĐIỂM, không cần khoá chính của một đứa trẻ để cả trường cùng cầm');

-- Đo HÀNH VI, không đo `information_schema.is_nullable`: với cột của một VIEW,
-- Postgres luôn khai 'YES' — bản đầu của assertion này hỏi đúng thứ Postgres không
-- theo dõi, và đỏ vì lý do đó chứ không vì mã sai. Dựng một lớp mà MỌI em đều chưa
-- có tài khoản (`core.students.user_id` NULL là hợp lệ — chú thích ngay tại cột) rồi
-- đòi `la_lop_toi` là FALSE chứ không phải NULL.
insert into core.classes (id, school_id, code, academic_year, grade)
values ('30000000-0000-0000-0000-0000000000fe', '20000000-0000-0000-0000-000000000001',
        'MN1', '2026-2027', 1);
insert into core.students (id, student_code, full_name, school_id)
values ('70000000-0000-0000-0000-0000000000fe', 'VA-2026-99998', 'Em mầm non chưa có tài khoản',
        '20000000-0000-0000-0000-000000000001');
insert into core.enrollments (student_id, class_id, valid_from)
values ('70000000-0000-0000-0000-0000000000fe', '30000000-0000-0000-0000-0000000000fe', current_date);

select is(
  (select la_lop_toi from evidence.v_xep_hang_lop where lop = 'MN1'),
  false,
  'Lớp mà MỌI em đều chưa có tài khoản cho ra la_lop_toi = FALSE, không phải NULL (0065): bool_or trên nhóm toàn NULL trả NULL, và hợp đồng zod bắt được đúng chỗ này');

select * from finish();
rollback;
