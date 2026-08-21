-- pgTAP — trạm AI ở tầng CƠ SỞ DỮ LIỆU (0068 + 0069, §7 + ADR-034)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0068_tram_ai_test.sql
--
-- Phân công với `tests/db/tram-ai.test.ts` (13 ca): bài kia gọi `hoiAi` — tức chạy
-- TypeScript thật của trạm, đo được sáu bước và thứ tự của chúng. Bài này đo những thứ
-- **chỉ thấy được từ trong Postgres** và bài kia không với tới:
--
--   1. `ai.con_luot` xét ĐÚNG tầng nào, và có bỏ sót tầng nào không.
--   2. Lượt bị chặn KHÔNG tiêu hạn mức — đo bằng cách nhét thẳng dòng nhật ký.
--   3. RLS: người này không đọc được lượt gọi của người kia.
--   4. Đường GHI khoá với `authenticated` — không ai tự làm loãng sổ vết của mình.
--   5. Hình dạng: nhật ký không có cột nào chở được đường về.

begin;
select plan(12);
select test_support.seed_basic();

-- ═══ 1. ai.con_luot — ba tầng ══════════════════════════════════════════════
select is(
  (select con from ai.con_luot('40000000-0000-0000-0000-000000000005', 'app-nao-do')),
  true,
  'Chưa gọi lần nào thì còn lượt');

-- Trần toàn trường về 0 = công tắc dừng khẩn.
update ai.han_muc set so_luot_ngay = 0 where pham_vi = 'truong';
select is(
  (select tang from ai.con_luot('40000000-0000-0000-0000-000000000005', 'app-nao-do')),
  'truong',
  'Trần toàn trường = 0 chặn ngay, và NÓI RA tầng nào chặn — "hết lượt của con" khác "cả trường hết lượt", hai câu dẫn tới hai hành động');
update ai.han_muc set so_luot_ngay = 2000 where pham_vi = 'truong';

-- Tầng app: chỉ áp cho đúng app đó.
insert into ai.han_muc (pham_vi, khoa, so_luot_ngay) values ('app', 'app-hep', 0);
select is(
  (select tang from ai.con_luot('40000000-0000-0000-0000-000000000005', 'app-hep')),
  'app',
  'Trần theo app chặn đúng app đó');
select is(
  (select con from ai.con_luot('40000000-0000-0000-0000-000000000005', 'app-khac')),
  true,
  'Và KHÔNG chặn app khác — một app đốt hết lượt không được làm chết app còn lại');

-- Trần NHỎ NHẤT phải được kể tên trước: nếu xét sai thứ tự thì người dùng nhận một câu
-- không liên quan gì tới lý do thật.
update ai.han_muc set so_luot_ngay = 1 where pham_vi = 'nguoi';
insert into ai.nhat_ky_goi (nguoi_goi, nha_cung_cap, model, cau_hoi_sach, ket_qua)
values ('40000000-0000-0000-0000-000000000005', 'gia', 'gia-1', 'x', 'ok');
select is(
  (select tang from ai.con_luot('40000000-0000-0000-0000-000000000005', 'app-khac')),
  'nguoi',
  'Chạm trần NGƯỜI thì kể tên tầng người, không kể tầng trường (trần trường còn rất rộng)');

-- ═══ 2. LƯỢT BỊ CHẶN KHÔNG TIÊU HẠN MỨC ═══════════════════════════════════
-- Nếu tiêu thì một vòng lặp hỏng ở app nào đó khoá cả trường trong vài giây — và khoá
-- bằng chính những lượt chưa bao giờ tới model.
delete from ai.nhat_ky_goi;
update ai.han_muc set so_luot_ngay = 2 where pham_vi = 'nguoi';
insert into ai.nhat_ky_goi (nguoi_goi, nha_cung_cap, model, cau_hoi_sach, ket_qua)
select '40000000-0000-0000-0000-000000000005', 'gia', 'gia-1', 'x', 'loc_chan'
  from generate_series(1, 20);
select is(
  (select con from ai.con_luot('40000000-0000-0000-0000-000000000005', 'app-khac')),
  true,
  '20 lượt BỊ CHẶN không tiêu một lượt hạn mức nào — chỉ ket_qua = ok mới tính');

-- ═══ 3. RLS ════════════════════════════════════════════════════════════════
insert into ai.nhat_ky_goi (nguoi_goi, nha_cung_cap, model, cau_hoi_sach, ket_qua)
values ('40000000-0000-0000-0000-000000000001', 'gia', 'gia-1', 'cau cua co Lan', 'ok');

select test_support.login_as('90000000-0000-0000-0000-000000000005');  -- Minh
select is(
  (select count(*)::int from ai.nhat_ky_goi where nguoi_goi <> core.current_user_id()),
  0,
  'Học sinh KHÔNG đọc được lượt gọi của người khác — "em này hỏi AI cái gì" phải đi qua một quyết định có tên, không phải một cửa mở sẵn');

select isnt_empty(
  $$ select 1 from ai.nhat_ky_goi where nguoi_goi = core.current_user_id() $$,
  'Nhưng CHÍNH MÌNH thì đọc được — để màn hình nói được "con còn mấy lượt hôm nay"');

select isnt_empty(
  $$ select 1 from ai.han_muc $$,
  'Trần thì ai cũng đọc được: nó là quy định của trường, không phải bí mật');

-- ═══ 4. ĐƯỜNG GHI KHOÁ ════════════════════════════════════════════════════
select throws_ok(
  $$ insert into ai.nhat_ky_goi (nguoi_goi, nha_cung_cap, model, cau_hoi_sach, ket_qua)
     values (core.current_user_id(), 'gia', 'gia-1', 'tu ghi', 'ok') $$,
  '42501',
  null,
  'KHÔNG ai tự ghi vào nhật ký — nếu ghi được thì một người làm loãng chính sổ vết của mình');

select throws_ok(
  $$ update ai.han_muc set so_luot_ngay = 99999 $$,
  '42501',
  null,
  'KHÔNG ai tự nới trần của mình');
select test_support.logout();

-- ═══ 5. HÌNH DẠNG — nhật ký không chở được đường về ═══════════════════════
-- Có bản đồ mã → tên là dựng lại được nguyên văn lời trẻ con, tức bảng này thành đúng
-- cái kho mà §7 sinh ra để tránh. Canh bằng tên cột, vì một cột mới là thứ thêm được
-- trong một migration mà không ai đọc lại khối lý lẽ ở đầu 0068.
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'ai' and table_name = 'nhat_ky_goi'
      and column_name ~ '(duong_ve|ban_do|nguyen_van|goc$|_goc)'),
  0,
  'Nhật ký KHÔNG có cột nào chở bản đồ đường về hay bản gốc — trả lời được "AI nói gì với trẻ", KHÔNG trả lời được "em nào kể chuyện gì"');

select * from finish();
rollback;
