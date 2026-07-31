-- pgTAP — 0034: mọi lượt đọc NỘI DUNG y tế đều để lại dấu vết
--
-- Câu hỏi bài test trả lời: "câu ghi trong schema — đọc health.logs thì có audit —
-- có thứ gì thi hành nó không, hay chỉ là một dòng comment?" (ADR-009, §3, và là
-- loại tuyên bố sẽ được đem ra trình khi bị hỏi về bảo vệ dữ liệu y tế của trẻ.)
--
-- Ba nhóm khẳng định:
--   A. Đường đọc thẳng nội dung đã ĐÓNG, nhưng RLS trên cột khung vẫn sống.
--   B. health.read_logs() cho đúng người thấy đúng dữ liệu — và ghi audit.
--   C. Lượt BỊ TỪ CHỐI cũng ghi audit. Đây mới là dòng đáng xem nhất trong sổ.

begin;
select plan(17);

select test_support.seed_basic();

insert into health.logs (student_id, logged_on, category, detail, recorded_by) values
  ('70000000-0000-0000-0000-000000000001', current_date, 'medication',
   '{"note": "uống thuốc sau bữa trưa"}', '40000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000001', current_date - 40, 'di_ung',
   '{"note": "dị ứng hải sản"}',           '40000000-0000-0000-0000-000000000001');

select has_function('health', 'read_logs', array['uuid', 'date', 'date'],
  'Có health.read_logs(uuid, date, date) — đường đọc có audit');

-- Không ai được âm thầm cấp lại quyền cả bảng: một dòng `grant select on health.logs`
-- trong migration tương lai sẽ vô hiệu hoá toàn bộ cơ chế audit ở đây mà không làm
-- đỏ bất kỳ assertion nào khác.
select ok(
  not has_table_privilege('authenticated', 'health.logs', 'select'),
  'authenticated KHÔNG có quyền SELECT cấp bảng trên health.logs'
);

-- ── A. Đường đọc thẳng ──────────────────────────────────────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN của Minh

select throws_ok(
  $$ select * from health.logs $$,
  '42501', null,
  'Ngay cả GVCN cũng KHÔNG select * được — nội dung y tế không có đường đọc thẳng'
);

select throws_ok(
  $$ select detail from health.logs $$,
  '42501', null,
  'Cột detail bị thu quyền: muốn thấy nội dung thì phải đi qua hàm có audit'
);

-- Cột khung vẫn đọc được VÀ vẫn bị RLS lọc — đây là thứ chứng minh việc thu quyền
-- không làm mất kiểm soát cũ (0007/0023 vẫn kiểm RLS bằng đúng câu này).
select isnt_empty(
  $$ select 1 from health.logs where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'GVCN vẫn thấy CÓ ghi nhận y tế (cột khung) — RLS chiều cho phép còn sống'
);

select test_support.logout();
select test_support.login_as('90000000-0000-0000-0000-000000000002');  -- thầy Nam, bộ môn
select is_empty(
  $$ select 1 from health.logs where student_id = '70000000-0000-0000-0000-000000000001' $$,
  'Giáo viên bộ môn không thấy cả cột khung — RLS chiều từ chối còn sống (ADR-009)'
);
select test_support.logout();

-- ── B. Đường có audit, chiều cho phép ───────────────────────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan

select is(
  (select count(*)::int from health.read_logs('70000000-0000-0000-0000-000000000001')),
  2,
  'GVCN gọi read_logs → thấy đủ 2 ghi nhận của học sinh lớp mình'
);

select is(
  (select detail ->> 'note' from health.read_logs('70000000-0000-0000-0000-000000000001')
    limit 1),
  'uống thuốc sau bữa trưa',
  'Nội dung trả về đúng, sắp xếp mới nhất trước'
);

-- Lọc theo khoảng ngày: màn hình "y tế tuần này" không được kéo cả 12 năm về máy.
select is(
  (select count(*)::int from health.read_logs('70000000-0000-0000-0000-000000000001',
                                              current_date - 7, current_date)),
  1,
  'Lọc p_from/p_to hoạt động — chỉ trả ghi nhận trong khoảng'
);

select test_support.logout();

select is(
  (select count(*)::int from ops.audit_log where action = 'health.read' and result = 'ok'),
  3,
  'Ba lượt gọi hợp lệ → ĐÚNG ba dòng audit, không gộp, không bỏ sót'
);

select is(
  (select actor_id from ops.audit_log
    where action = 'health.read' and result = 'ok' order by id limit 1),
  '40000000-0000-0000-0000-000000000001'::uuid,
  'Audit ghi đúng NGƯỜI đã đọc, không phải vai máy chủ chạy hàm'
);

select is(
  (select (scope ->> 'row_count')::int from ops.audit_log
    where action = 'health.read' and result = 'ok' order by id limit 1),
  2,
  'Audit ghi số dòng đã trả — hậu kiểm phân biệt được "xem một em" với "quét cả trường"'
);

-- ── C. Chiều từ chối ────────────────────────────────────────────────────────
select test_support.login_as('90000000-0000-0000-0000-000000000002');  -- thầy Nam, bộ môn
select is(
  (select count(*)::int from health.read_logs('70000000-0000-0000-0000-000000000001')),
  0,
  'Giáo viên bộ môn gọi read_logs → 0 dòng (ADR-009), không phải lỗi làm lộ sự tồn tại'
);
select test_support.logout();

select test_support.login_as('90000000-0000-0000-0000-000000000004');  -- phụ huynh của Minh
select is(
  (select count(*)::int from health.read_logs('70000000-0000-0000-0000-000000000001')),
  2,
  'Phụ huynh đọc được y tế của CON MÌNH — chiều cho phép của core.can_see_health'
);
select is(
  (select count(*)::int from health.read_logs('70000000-0000-0000-0000-000000000002')),
  0,
  'Phụ huynh KHÔNG đọc được y tế của em khác'
);
select test_support.logout();

select is(
  (select count(*)::int from ops.audit_log
    where action = 'health.read' and result = 'denied'
      and actor_id = '40000000-0000-0000-0000-000000000002'),
  1,
  'Lượt bị từ chối VẪN ghi audit — dấu vết của người thử mở cửa không phải của mình'
);

select is(
  (select count(*)::int from ops.audit_log
    where action = 'health.read' and result = 'denied'
      and actor_id = '40000000-0000-0000-0000-000000000004'
      and object_id = '70000000-0000-0000-0000-000000000002'),
  1,
  'Audit từ chối ghi rõ đã hỏi về EM NÀO, không chỉ ghi "có người bị chặn"'
);

select * from finish();
rollback;
