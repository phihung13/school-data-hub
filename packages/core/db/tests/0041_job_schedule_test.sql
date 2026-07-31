-- pgTAP — LỊCH CHẠY JOB: "chưa chạy lần nào" phải là một trạng thái riêng (0041)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0041_job_schedule_test.sql
--
-- Bài này khoá lại lỗi ĐÃ ĐO ĐƯỢC trên hub_dev ngày 31/07/2026:
--   select count(*) from ops.job_runs;  →  0
-- Nghĩa là run-retention.mjs — thứ thi hành lời hứa công khai "chi tiết cảm xúc quá
-- 12 tháng bị xoá" (§3, mệnh lệnh 4, Luật 91/2025) — chưa chạy lần nào kể từ khi
-- được viết. Và không có chỗ nào trong hệ thống nói ra điều đó.
--
-- Nên phần lớn assertion dưới đây không kiểm "job chạy đúng chưa", mà kiểm
-- MỘT CÂU: hệ thống có phân biệt được "ổn" với "chưa biết gì" không.
--   · chua_chay  ≠ ok   — chưa có dòng nào không phải là tin tốt;
--   · that_bai   nổi lên — job hỏng phải thấy được, không được im như chưa tới lịch;
--   · treo       nổi lên — tiến trình chết để lại dòng 'running' trông y hệt đang chạy;
--   · findings>0 nổi lên — job chạy XONG mà tìm ra vấn đề vẫn phải kêu.
--
-- Nhóm cuối kiểm thứ khác hẳn: một dòng trong ops.job_schedule KHÔNG được phép trở
-- thành lệnh shell, và một phiên `authenticated` KHÔNG được bịa lịch sử chạy máy.

begin;
select plan(42);
select test_support.seed_basic();

-- ═══ 1. SỔ KHAI JOB ═══════════════════════════════════════════════════════
select has_table('ops', 'job_schedule', 'ops.job_schedule tồn tại — có sổ khai thì mới so được "đáng lẽ đã phải chạy rồi"');

select isnt_empty(
  $$ select 1 from ops.job_schedule where job_name = 'emotion_retention' and enabled $$,
  'emotion_retention ĐÃ được khai — trước 0041 không ai gọi nó, ops.job_runs rỗng trên hub_dev');

select isnt_empty(
  $$ select 1 from ops.job_schedule where job_name = 'homeroom_drift' and enabled $$,
  'homeroom_drift đã được khai — 0030 viết ops.v_homeroom_drift "cho job giám sát", job đó là đây');

select is(
  (select kind from ops.job_schedule where job_name = 'job_scheduler'),
  'batch',
  'Chính bộ lịch cũng có một dòng — thiếu nó thì "máy chạy cron chết" là im lặng tuyệt đối (README tools/jobs)');

-- Bài học 0011/ADR-016: khai job trước khi có bộ chạy là tự bật một dòng "quá hạn"
-- sáng vĩnh viễn, và cảnh báo lúc nào cũng sáng là cảnh báo đã chết. Ở đây điều kiện
-- ấy đã ĐỦ (care.run_flag_engine() ra đời ở 0039) nên dòng lịch phải có mặt —
-- apps/hub/server/routers/care.ts đọc job_name='flag_engine' để hiện "Quét đêm qua".
select isnt_empty(
  $$ select 1 from ops.job_schedule
      where job_name = 'flag_engine' and runner = 'run-flag-engine.mjs' and enabled $$,
  'flag_engine ĐÃ được khai vì bộ chạy 0039 đã tồn tại — khai đúng lúc, không sớm hơn một phút');

-- Luật cấu trúc, không phải luật của một dòng: mọi job kiểu script phải trỏ tới một
-- tên file hợp lệ. Đây là chốt chặn cho lần thêm job thứ tư, thứ năm sau này.
select is_empty(
  $$ select job_name from ops.job_schedule
      where kind = 'script' and coalesce(runner, '') !~ '^run-[a-z0-9-]+\.mjs$' $$,
  'Mọi job kiểu script đều trỏ tới một tên file hợp lệ — không dòng lịch nào trỏ vào hư không');

-- ═══ 2. MỘT DÒNG DỮ LIỆU KHÔNG ĐƯỢC THÀNH LỆNH SHELL ══════════════════════
select throws_ok(
  $$ insert into ops.job_schedule (job_name, label, kind, runner, expected_every)
     values ('xau_1', 'thiếu file', 'script', null, interval '1 day') $$,
  '23514',
  null,
  'kind=script mà không có bộ chạy thì bị chặn — một dòng lịch không trỏ tới đâu là một job không bao giờ chạy');

select throws_ok(
  $$ insert into ops.job_schedule (job_name, label, kind, runner, expected_every)
     values ('xau_2', 'sql mà vẫn mang file', 'sql', 'run-retention.mjs', interval '1 day') $$,
  '23514',
  null,
  'kind=sql mà vẫn mang runner thì bị chặn — hai đường gọi cho một dòng là chạy hai lần công việc');

select throws_ok(
  $$ insert into ops.job_schedule (job_name, label, kind, runner, expected_every)
     values ('xau_3', 'lệnh shell trá hình', 'script', 'run-x.mjs; rm -rf /', interval '1 day') $$,
  '23514',
  null,
  'runner phải khớp ^run-[a-z0-9-]+\.mjs$ — chốt tầng DB để một dòng bảng không thành lệnh thi hành');

-- ═══ 3. v_job_health — IM LẶNG KHÔNG PHẢI KẾT LUẬN ════════════════════════
insert into ops.job_schedule (job_name, label, kind, expected_every, grace)
     values ('thu_nghiem', 'Job thử nghiệm', 'sql', interval '1 day', interval '2 hours');

select is(
  (select state from ops.v_job_health where job_name = 'thu_nghiem'),
  'chua_chay',
  'CHƯA CÓ DÒNG NÀO ⇒ state = chua_chay, KHÔNG phải ok — đây là lỗi đã lặp 4 lần trong dự án này');

select ok(
  (select needs_attention from ops.v_job_health where job_name = 'thu_nghiem'),
  'Job chưa chạy lần nào CẦN CHÚ Ý — không được nằm im như một job đang khoẻ');

-- Chạy thành công, đúng hạn.
insert into ops.job_runs (job_name, status, started_at, finished_at, metrics)
     values ('thu_nghiem', 'success', now() - interval '1 hour', now() - interval '1 hour', '{}'::jsonb);
select is(
  (select state from ops.v_job_health where job_name = 'thu_nghiem'),
  'ok',
  'Chạy thành công trong hạn ⇒ ok');
select ok(
  not (select needs_attention from ops.v_job_health where job_name = 'thu_nghiem'),
  'Job khoẻ KHÔNG kêu — nếu nó cũng kêu thì cả bảng thành nhiễu và người trực học cách phớt lờ');

-- Thất bại.
insert into ops.job_runs (job_name, status, started_at, finished_at, metrics)
     values ('thu_nghiem', 'failed', now() - interval '30 minutes', now() - interval '30 minutes',
             '{"error":"giả lập"}'::jsonb);
select is(
  (select state from ops.v_job_health where job_name = 'thu_nghiem'),
  'that_bai',
  'Lần gần nhất hỏng ⇒ that_bai — "quét đêm qua thất bại" phải nói được thành lời');
select ok(
  (select needs_attention from ops.v_job_health where job_name = 'thu_nghiem'),
  'Job thất bại CẦN CHÚ Ý');

-- Đang chạy, còn trong dung sai.
delete from ops.job_runs where job_name = 'thu_nghiem';
insert into ops.job_runs (job_name, status, started_at)
     values ('thu_nghiem', 'running', now() - interval '5 minutes');
select is(
  (select state from ops.v_job_health where job_name = 'thu_nghiem'),
  'dang_chay',
  'Dòng running còn mới ⇒ dang_chay, không kêu — chạy lâu 5 phút không phải sự cố');

-- Đang chạy nhưng quá dung sai: tiến trình chết để lại dòng trông y hệt đang chạy.
update ops.job_runs set started_at = now() - interval '10 hours' where job_name = 'thu_nghiem';
select is(
  (select state from ops.v_job_health where job_name = 'thu_nghiem'),
  'treo',
  'Dòng running quá dung sai ⇒ treo — không được đọc thành "đang chạy, đợi chút"');

-- Quá hạn: thành công lần cuối đã lâu hơn expected_every + grace.
delete from ops.job_runs where job_name = 'thu_nghiem';
insert into ops.job_runs (job_name, status, started_at, finished_at)
     values ('thu_nghiem', 'success', now() - interval '5 days', now() - interval '5 days');
select is(
  (select state from ops.v_job_health where job_name = 'thu_nghiem'),
  'qua_han',
  'Thành công lần cuối quá expected_every + grace ⇒ qua_han');

-- Job chạy XONG, không hỏng gì, nhưng TÌM RA vấn đề.
delete from ops.job_runs where job_name = 'thu_nghiem';
insert into ops.job_runs (job_name, status, started_at, finished_at, metrics)
     values ('thu_nghiem', 'success', now(), now(), '{"findings": 3}'::jsonb);
select is(
  (select state from ops.v_job_health where job_name = 'thu_nghiem'),
  'ok',
  'Job giám sát chạy trót lọt vẫn là state=ok — bản thân lần chạy không hỏng');
select ok(
  (select needs_attention from ops.v_job_health where job_name = 'thu_nghiem'),
  'findings > 0 vẫn CẦN CHÚ Ý — job soi lệch chạy xong mà tìm ra 3 chỗ lệch thì im lặng là vô nghĩa');

-- metrics rác không được làm sập màn hình trực.
update ops.job_runs set metrics = '{"findings":"nhiều"}'::jsonb where job_name = 'thu_nghiem';
select is(
  (select last_findings from ops.v_job_health where job_name = 'thu_nghiem'),
  0,
  'findings không phải số ⇒ đọc thành 0, không ném lỗi — một job ghi bậy không được làm mù buồng lái');

-- Tắt job.
delete from ops.job_runs where job_name = 'thu_nghiem';
update ops.job_schedule set enabled = false where job_name = 'thu_nghiem';
select ok(
  (select needs_attention from ops.v_job_health where job_name = 'thu_nghiem'),
  'Job bị TẮT vẫn CẦN CHÚ Ý — tắt job xoá cảm xúc là thất hứa với phụ huynh, không phải một lựa chọn nằm im');
update ops.job_schedule set enabled = true where job_name = 'thu_nghiem';

-- ═══ 4. reap_stale_runs — dòng treo phải thành THẤT BẠI thấy được ═════════
insert into ops.job_runs (job_name, status, started_at)
     values ('thu_nghiem', 'running', now() - interval '10 hours');
insert into ops.job_runs (job_name, status, started_at)
     values ('thu_nghiem', 'running', now() - interval '5 minutes');

select is(
  (select ops.reap_stale_runs(interval '6 hours')),
  1,
  'reap_stale_runs nhặt đúng 1 dòng treo — dòng running 5 phút tuổi KHÔNG bị chạm');

select isnt_empty(
  $$ select 1 from ops.job_runs
      where job_name = 'thu_nghiem' and status = 'failed'
        and metrics ? 'reap_reason' $$,
  'Dòng treo thành failed KÈM LÝ DO — người trực đọc log không phải đoán vì sao nó hỏng');

select is(
  (select ops.reap_stale_runs(interval '6 hours')),
  0,
  '§9 — gọi lại reap_stale_runs trả 0, không có gì để nhặt nữa');

select is(
  (select count(*)::int from ops.job_runs where job_name = 'thu_nghiem' and status = 'running'),
  1,
  'Dòng running còn mới vẫn nguyên trạng thái running sau hai lần reap');

-- Tiến trình cũ tỉnh lại lúc 9h sáng KHÔNG được "chữa lành" dòng đã bị nhặt lúc 3h.
select ops.finish_job_run(
  (select id from ops.job_runs where job_name = 'thu_nghiem' and status = 'failed' order by id desc limit 1),
  'success');
select is_empty(
  $$ select 1 from ops.job_runs
      where job_name = 'thu_nghiem' and status = 'success' and metrics ? 'reap_reason' $$,
  'finish_job_run KHÔNG ghi đè dòng đã bị reap thành success — job treo không được tự khỏi bệnh');

select throws_ok(
  $$ select ops.finish_job_run(1::bigint, 'xong_roi') $$,
  'P0001',
  null,
  'finish_job_run từ chối trạng thái lạ — job_runs.status chỉ có ba giá trị, không nhận giá trị thứ tư');

-- ═══ 5. start/record — mở sổ và ghi hộ ════════════════════════════════════
delete from ops.job_runs where job_name = 'thu_nghiem';
select ok(
  (select ops.start_job_run('thu_nghiem')) is not null,
  'start_job_run mở một dòng running TRƯỚC khi làm — chết giữa chừng vẫn còn dấu vết cho reap nhặt');

select ok(
  (select ops.record_job_run('thu_nghiem', 'failed', '{"exit_code":3}'::jsonb, now() - interval '2 minutes')) is not null,
  'record_job_run ghi HỘ một lần chạy đã kết thúc — job con chết trước khi kịp ghi sổ vẫn nhìn thấy được');

-- ═══ 6. job_due — "chưa chạy" không được suy thành "không cần chạy" ═══════
delete from ops.job_runs where job_name = 'thu_nghiem';
select ok(
  (select ops.job_due('thu_nghiem')),
  'Chưa từng thành công lần nào ⇒ ĐẾN LƯỢT');

insert into ops.job_runs (job_name, status, started_at, finished_at)
     values ('thu_nghiem', 'success', now(), now());
select ok(
  not (select ops.job_due('thu_nghiem')),
  'Vừa chạy xong ⇒ chưa tới lượt — cắm lịch mỗi giờ vẫn không làm job ngày chạy 24 lần (§9)');

update ops.job_runs set finished_at = now() - interval '3 days' where job_name = 'thu_nghiem';
select ok(
  (select ops.job_due('thu_nghiem')),
  'Thành công lần cuối đã quá expected_every ⇒ đến lượt');

update ops.job_schedule set enabled = false where job_name = 'thu_nghiem';
select ok(
  not (select ops.job_due('thu_nghiem')),
  'Job tắt ⇒ không tự chạy (vẫn kêu ở v_job_health — hai câu hỏi khác nhau)');

select ok(
  not (select ops.job_due('khong_he_khai')),
  'Job chưa khai trong lịch ⇒ không tự chạy — bộ lịch không đoán việc');

-- ═══ 7. Job soi lệch GVCN ═════════════════════════════════════════════════
select is(
  ((select ops.check_homeroom_drift()) ->> 'findings')::int,
  0,
  'Sau seed sạch: check_homeroom_drift thấy 0 lệch — hai sổ GVCN khớp nhau (0030)');

-- Dựng lại đúng ca mà 0030 nói tới: hai trigger đóng đường sinh lệch MỚI, nhưng dữ
-- liệu đi bằng đường khác (khôi phục backup, sửa tay, migration tương lai) thì vẫn
-- lệch được. Ở đây: xoá bản sao vai trò trong khi phân công chủ nhiệm 6A1 vẫn còn —
-- phân quyền vẫn đúng, còn claim OIDC thì thiếu lớp, và không ai được biết.
delete from core.user_role_scopes
 where role_code = 'homeroom' and class_id = '30000000-0000-0000-0000-000000000001';

select is(
  ((select ops.check_homeroom_drift()) ->> 'thieu_ban_sao')::int,
  1,
  'Mất một bản sao vai trò ⇒ job đếm được 1 — thứ mà trước 0041 không có ai hỏi tới');

select is(
  ((select ops.run_sql_job('homeroom_drift')) ->> 'findings')::int,
  1,
  'run_sql_job điều phối đúng tới check_homeroom_drift');

select throws_ok(
  $$ select ops.run_sql_job('job_la_hoac') $$,
  'P0001',
  null,
  'run_sql_job KÊU khi gặp job lạ thay vì trả rỗng — CASE viết cứng, không nối tên hàm từ bảng vào câu lệnh');

-- ═══ 8. AI ĐƯỢC ĐỌC, AI KHÔNG ĐƯỢC BỊA ════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN 6A1

select isnt_empty(
  $$ select 1 from ops.v_job_health $$,
  'GVCN ĐỌC được ops.v_job_health — đây là đường để buồng lái nói "quét đêm qua thất bại"');

select throws_ok(
  $$ insert into ops.job_schedule (job_name, label, kind, expected_every)
     values ('tu_khai', 'tự khai job', 'sql', interval '1 day') $$,
  '42501',
  null,
  'Người dùng KHÔNG ghi được ops.job_schedule — đổi lịch là việc của migration, không phải của UI');

select throws_ok(
  $$ select ops.record_job_run('emotion_retention', 'success') $$,
  '42501',
  null,
  'Người dùng KHÔNG gọi được record_job_run — bịa được lịch sử chạy máy là bịa được cả bằng chứng đã giữ lời hứa');

select test_support.logout();

select * from finish();
rollback;
