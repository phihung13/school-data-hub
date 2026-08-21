-- pgTAP — lịch hôm nay (0070, ADR-034)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0070_lich_hom_nay_test.sql
--
-- Ba nhóm:
--   1. AI THẤY GÌ — sự kiện cả trường ai cũng thấy; sự kiện của một lớp chỉ người trong
--      lớp đó. Đây là câu hỏi phạm vi THỨ NĂM của hệ (sau can_see_student ·
--      can_see_care · can_read_mood · principal_of), và mượn nhầm hàm là đúng lỗi
--      0035/0037/0038 đã mắc ba lần.
--   2. MỐI NỐI GOOGLE — ràng buộc giữ cho ngày trả nợ #19 không sinh bản đôi.
--   3. HÔM NAY nghĩa là hôm nay: ngày mai và hôm qua không lọt vào.

begin;
select plan(10);
select test_support.seed_basic();

insert into core.su_kien_lich (school_id, class_id, tieu_de, loai, bat_dau)
values
  ('20000000-0000-0000-0000-000000000001', null,
   'Chào cờ toàn trường', 'chung', date_trunc('day', now()) + interval '7 hours'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'Kiểm tra Toán 6A1', 'hoc', date_trunc('day', now()) + interval '9 hours'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
   'Sinh hoạt 6A2', 'hoat_dong', date_trunc('day', now()) + interval '15 hours'),
  ('20000000-0000-0000-0000-000000000001', null,
   'Họp phụ huynh NGÀY MAI', 'hop', date_trunc('day', now()) + interval '1 day 8 hours');

-- ═══ 1. AI THẤY GÌ ═════════════════════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh, học sinh 6A1
select is(
  (select string_agg(tieu_de, ' | ' order by bat_dau) from core.v_lich_hom_nay),
  'Chào cờ toàn trường | Kiểm tra Toán 6A1',
  'Học sinh thấy sự kiện CẢ TRƯỜNG và sự kiện LỚP MÌNH — không thấy lớp khác, không thấy ngày mai');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000006');  -- cô Hạnh, GVCN 6A2
select is(
  (select string_agg(tieu_de, ' | ' order by bat_dau) from core.v_lich_hom_nay),
  'Chào cờ toàn trường | Sinh hoạt 6A2',
  'GVCN thấy sự kiện cả trường và lớp MÌNH CHỦ NHIỆM — phạm vi lớp, không phải phạm vi một em');
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000004');  -- phụ huynh của Minh
select is(
  (select count(*)::int from core.v_lich_hom_nay where tieu_de = 'Kiểm tra Toán 6A1'),
  1,
  'Phụ huynh thấy lịch lớp CỦA CON — is_my_child có mặt trong policy, và đây là lý do nó có mặt');
select is(
  (select count(*)::int from core.v_lich_hom_nay where tieu_de = 'Sinh hoạt 6A2'),
  0,
  'Nhưng KHÔNG thấy lịch lớp khác');
select test_support.logout();

-- ═══ 2. MỐI NỐI GOOGLE (nợ #19) ═══════════════════════════════════════════
select throws_ok(
  $$ insert into core.su_kien_lich (school_id, tieu_de, bat_dau, nguon)
     values ('20000000-0000-0000-0000-000000000001', 'từ Google', now(), 'google') $$,
  '23514',
  null,
  'Nguồn ngoài PHẢI mang external_id — thiếu nó thì lượt đồng bộ sau không nhận ra dòng cũ và sinh bản đôi');

select throws_ok(
  $$ insert into core.su_kien_lich (school_id, tieu_de, bat_dau, nguon, external_id)
     values ('20000000-0000-0000-0000-000000000001', 'nhập tay', now(), 'hub', 'ma-la') $$,
  '23514',
  null,
  'Nguồn `hub` KHÔNG được mang external_id — một dòng người nhập tay mà có mã ngoài sẽ bị lượt đồng bộ sau ghi đè mất');

insert into core.su_kien_lich (school_id, tieu_de, bat_dau, nguon, external_id)
values ('20000000-0000-0000-0000-000000000001', 'Sự kiện Google', now(), 'google', 'g-001');
select throws_ok(
  $$ insert into core.su_kien_lich (school_id, tieu_de, bat_dau, nguon, external_id)
     values ('20000000-0000-0000-0000-000000000001', 'Sự kiện Google (lần 2)', now(), 'google', 'g-001') $$,
  '23505',
  null,
  '§9 — đồng bộ lại cùng một sự kiện Google KHÔNG sinh dòng thứ hai (UNIQUE nguon, external_id)');

-- ═══ 3. HÔM NAY NGHĨA LÀ HÔM NAY ═══════════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from core.v_lich_hom_nay where tieu_de = 'Họp phụ huynh NGÀY MAI'),
  0,
  'Sự kiện ngày mai KHÔNG lọt vào lịch hôm nay');
select test_support.logout();

-- ═══ HÌNH DẠNG ════════════════════════════════════════════════════════════
select ok(
  (select coalesce(c.reloptions::text, '') like '%security_invoker=on%'
     from pg_class c where c.relname = 'v_lich_hom_nay'),
  'v_lich_hom_nay CÓ security_invoker — ở ĐÂY nó đúng: view hỏi "lịch của tôi" và RLS cũng trả lời "của tôi" (khác bảng xếp hạng 0064, nơi RLS trả lời một câu khác)');

select ok(
  not has_table_privilege('authenticated', 'core.su_kien_lich', 'INSERT'),
  'authenticated KHÔNG thêm được sự kiện — một cuốn lịch ai cũng thêm được thì trang chủ cả trường là bảng tin tự do');

select * from finish();
rollback;
