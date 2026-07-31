-- pgTAP — ops.source_freshness + ops.job_runs.degraded_sources (ADR-016)
-- Câu hỏi bài test trả lời: "nguồn chết thì hệ có nói không, hay im lặng?"

--
-- Sửa 31/07/2026: bài test này gieo dữ liệu trên hai nguồn 'tutor' và 'moodle' — đúng
-- hai trong ba nguồn vừa bị gỡ khỏi seed của 0011 (xem lý do trong migration: chưa có
-- connector nào ghi chúng, nên băng vàng buồng lái sáng vĩnh viễn). Sau khi gỡ, hai
-- assertion isnt_empty ở đây UPDATE trúng 0 dòng rồi khẳng định nguồn phải có mặt trong
-- v_stale_sources → đỏ. Chuyển sang dựng ca trên 'attendance' và 'evidence' (hai nguồn
-- CÓ người ghi thật: trigger AFTER INSERT đặt ở 0031), nên bài test vẫn kiểm đúng ba
-- hành vi cũ — còn tươi / quá hạn / chưa từng chạy — mà không phụ thuộc dòng seed chết.
--
-- Thêm một assertion mới (plan 9 → 10) khoá chính việc dọn: không nguồn nào được nằm
-- trong bảng khi chưa có ai ghi cho nó. Không có dòng này thì lần sau ai đó seed lại
-- 'tutor' cho đủ bộ và báo động giả quay lại mà không bài test nào đỏ.
begin;
select plan(10);

select has_table('ops', 'source_freshness', 'Bảng ops.source_freshness tồn tại');
select has_view('ops',  'v_stale_sources',  'View ops.v_stale_sources tồn tại');
select has_column('ops', 'job_runs', 'degraded_sources', 'job_runs có cột degraded_sources');
select ok(
  (select relrowsecurity from pg_class where oid = 'ops.source_freshness'::regclass),
  'RLS đã bật trên ops.source_freshness'
);

-- ── Nguồn còn tươi thì không nằm trong danh sách quá hạn ────────────────────
-- 'attendance' hạn 26 giờ; vừa có check-in 1 giờ trước.
update ops.source_freshness set last_success_at = now() - interval '1 hour'
 where source = 'attendance';
select is_empty(
  $$ select 1 from ops.v_stale_sources where source = 'attendance' $$,
  'Điểm danh vừa chạy 1 giờ trước (hạn 26 giờ) → còn tươi'
);

-- ── Nguồn quá hạn thì phải hiện ra ──────────────────────────────────────────
update ops.source_freshness set last_success_at = now() - interval '3 days'
 where source = 'attendance';
select isnt_empty(
  $$ select 1 from ops.v_stale_sources where source = 'attendance' $$,
  'Điểm danh im 3 ngày (hạn 26 giờ) → vào danh sách quá hạn'
);

-- ── Chưa từng chạy KHÔNG được coi là đang ổn ────────────────────────────────
-- Đây chính là kiểu hỏng im lặng mà ADR-016 nhắm tới.
update ops.source_freshness set last_success_at = null where source = 'evidence';
select isnt_empty(
  $$ select 1 from ops.v_stale_sources where source = 'evidence' $$,
  'last_success_at NULL → tính là hết tươi, không phải "chưa có tin xấu"'
);

-- ── Không khai nguồn khi chưa có ai ghi cho nó ──────────────────────────────
-- Mặt trái của luật "NULL = hết tươi" ngay bên trên: mỗi dòng khai thừa là một băng vàng
-- sáng vĩnh viễn trên buồng lái GVCN. Cảnh báo lúc nào cũng sáng thì tới hôm hỏng thật
-- không còn ai nhìn — hỏng đúng thứ ADR-016 sinh ra để chống.
select is_empty(
  $$ select 1 from ops.source_freshness where source in ('tutor', 'moodle', 'cor') $$,
  'Nguồn chưa có connector (tutor/moodle/cor) KHÔNG được khai sẵn trong bảng'
);

-- ── Buồng lái đọc được, nhưng không sửa được ────────────────────────────────
set local role authenticated;
select isnt_empty(
  $$ select 1 from ops.source_freshness $$,
  'authenticated ĐỌC được (buồng lái cần để hiện băng vàng)'
);
select throws_ok(
  $$ update ops.source_freshness set max_age = interval '99 days' where source = 'attendance' $$,
  null, null,
  'authenticated KHÔNG sửa được hạn tươi'
);
reset role;

select * from finish();
rollback;
