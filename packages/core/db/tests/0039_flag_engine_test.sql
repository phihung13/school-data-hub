-- pgTAP — 0039: bộ quét cờ tự động (care.run_flag_engine).
--
-- Phủ đúng danh sách "Test bắt buộc" của danh-cho-may/04-flag-engine.md:
--   · engine đọc ngưỡng TỪ BẢNG (đổi param trong test → kết quả đổi theo)
--   · cờ không mang nội dung tâm sự (luật "cờ E gọn")
--   · nguồn hết tươi → BỎ QUA rule, ghi vào degraded_sources, job vẫn success
--   · nạp bù → cờ origin='backfill', 0 hồ sơ mới, 0 lượt leo thang, MỘT bản tóm tắt
--   · gộp cờ · định mức 5 hồ sơ/GVCN · leo thang 7 ngày
--   · §9 — chạy lại là no-op
--
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0039_flag_engine_test.sql

begin;
select plan(35);
select test_support.seed_basic();

-- ---------------------------------------------------------------------------
-- 1. Sổ khai nguồn của từng luật
-- ---------------------------------------------------------------------------
select has_column('care', 'rules', 'source_key',
  'care.rules khai được nguồn tín hiệu mà luật phụ thuộc (ADR-016)');

select is(
  (select source_key from care.rules where rule_code = 'A_ATTENDANCE'),
  'attendance',
  'Cờ chuyên cần khai đúng nguồn attendance'
);

select is(
  (select source_key from care.rules where rule_code = 'C_MASTERY'),
  null,
  'C_MASTERY để trống nguồn — chưa connector Tutor nào ghi ops.source_freshness, và để trống là LỜI KHAI, không phải quên'
);

-- ---------------------------------------------------------------------------
-- 2. Dựng tín hiệu thô
-- ---------------------------------------------------------------------------
-- Minh (6A1, GVCN cô Lan): 5 ngày liên tiếp mood xấu + cả 5 ngày vắng
--   → phải bật CẢ HAI cờ A_ATTENDANCE và E_MOOD.
insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
select '70000000-0000-0000-0000-000000000001', current_date - g, 'in', 1, 'absent', 'app'
  from generate_series(0, 4) g;

-- Bình (6A2, GVCN cô Hạnh): đi học bình thường, nhưng bấm "cần gặp thầy cô"
--   → chỉ bật E_URGENT. Không check-in mood xấu ngày nào.
insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
values ('70000000-0000-0000-0000-000000000002', current_date, 'in', 4, 'present', 'app');
insert into attendance.help_requests (student_id, requested_on, topic, urgency)
values ('70000000-0000-0000-0000-000000000002', current_date, 'lop', 'today');

-- Hành vi: 3 tuần điểm 0 — vượt ngưỡng B_BEHAVIOR (max_incidents = 2). Cờ này PHẢI
-- KHÔNG xuất hiện, vì nguồn 'evidence' bị đặt hết tươi ngay bên dưới.
insert into evidence.value_behaviors (student_id, behavior_code, week_start, self_score)
select '70000000-0000-0000-0000-000000000001', 'TRUNG_THUC', current_date - (7 * g), 0
  from generate_series(1, 3) g;

-- Đặt hạn tươi TƯỜNG MINH thay vì dựa vào trigger: bài test phải cho cùng kết quả
-- trên database dựng mới lẫn trên database dev đang có dữ liệu thật.
update ops.source_freshness set last_success_at = now()                     where source = 'attendance';
update ops.source_freshness set last_success_at = now() - interval '30 days' where source = 'evidence';

-- ---------------------------------------------------------------------------
-- 3. Chạy thật, mode live
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select care.run_flag_engine() $$,
  'Bộ quét chạy trọn vẹn ở mode live'
);

select is(
  (select status from ops.job_runs where job_name = 'flag_engine' order by id desc limit 1),
  'success',
  'Có nguồn hết tươi nhưng lần chạy vẫn success — bỏ qua một rule KHÔNG được làm hỏng cả đêm quét'
);

select ok(
  (select metrics -> 'rules_evaluated' @> '["A_ATTENDANCE","E_MOOD","E_URGENT"]'::jsonb
     from ops.job_runs where job_name = 'flag_engine' order by id desc limit 1),
  'Ba luật có nguồn còn tươi được đánh giá'
);

select ok(
  (select metrics -> 'rules_skipped'
          @> '[{"rule_code":"B_BEHAVIOR","ly_do":"nguon_het_tuoi"}]'::jsonb
     from ops.job_runs where job_name = 'flag_engine' order by id desc limit 1),
  'Nguồn hết tươi → rule bị bỏ qua KÈM LÝ DO, không im lặng'
);

select ok(
  (select metrics -> 'rules_skipped'
          @> '[{"rule_code":"C_CEFR","ly_do":"chua_cai_dat"}]'::jsonb
     from ops.job_runs where job_name = 'flag_engine' order by id desc limit 1),
  'C_CEFR chưa có signal view → khai báo là CHƯA CÀI ĐẶT, không giả vờ đã quét'
);

select is(
  (select degraded_sources from ops.job_runs where job_name = 'flag_engine' order by id desc limit 1),
  array['evidence'],
  'degraded_sources ghi đúng nguồn bị bỏ — buồng lái đọc cột này để hiện băng vàng'
);

-- ── Cờ sinh ra đúng và đủ ───────────────────────────────────────────────────
select ok(
  (select count(*) = 1 from care.flags
    where student_id = '70000000-0000-0000-0000-000000000001'
      and rule_code = 'A_ATTENDANCE' and as_of_date = current_date and origin = 'live'),
  'Minh vắng 5/5 buổi → cờ A_ATTENDANCE'
);

select ok(
  (select count(*) = 1 from care.flags
    where student_id = '70000000-0000-0000-0000-000000000001'
      and rule_code = 'E_MOOD' and as_of_date = current_date),
  'Minh 5 ngày mood xấu LIÊN TIẾP → cờ E_MOOD'
);

select ok(
  (select count(*) = 1 from care.flags
    where student_id = '70000000-0000-0000-0000-000000000002'
      and rule_code = 'E_URGENT' and as_of_date = current_date),
  'Bình bấm "cần gặp thầy cô" → cờ E_URGENT, dù em không có ngày mood xấu nào'
);

select is(
  (select count(*)::int from care.flags where rule_code = 'B_BEHAVIOR'),
  0,
  'Nguồn evidence hết tươi → KHÔNG sinh cờ B, dù dữ liệu trong bảng đã vượt ngưỡng (im lặng ≠ kết luận)'
);

-- ── Luật "cờ E gọn": cờ không mang theo lời của em ──────────────────────────
select is(
  (select count(*)::int
     from care.flags f, lateral jsonb_object_keys(f.detail) k
    where k not in ('attendance_rate', 'min_rate', 'window_days', 'last_seen_on',
                    'incident_count', 'max_incidents',
                    'weak_strands', 'strands', 'as_of',
                    'negative_streak', 'negative_days', 'mode', 'nguong',
                    'help_requested')),
  0,
  'detail của cờ chỉ có SỐ ĐO và LOẠI tín hiệu — không khóa nào chứa nội dung tự do'
);

-- ---------------------------------------------------------------------------
-- 4. Gộp cờ thành hồ sơ, chủ hồ sơ là GVCN
-- ---------------------------------------------------------------------------
select is(
  (select owner_id from care.care_cases
    where student_id = '70000000-0000-0000-0000-000000000001' and status = 'open'),
  '40000000-0000-0000-0000-000000000001'::uuid,
  'Hồ sơ của Minh về đúng GVCN lớp 6A1 (suy từ core.class_assignments)'
);

select is(
  (select count(*)::int from care.care_case_flags cf
     join care.care_cases cc on cc.id = cf.case_id
    where cc.student_id = '70000000-0000-0000-0000-000000000001'),
  2,
  'Hai cờ của Minh gộp vào MỘT hồ sơ — một em một đầu mối'
);

-- ---------------------------------------------------------------------------
-- 5. §9 — chạy lại trong đêm là no-op
-- ---------------------------------------------------------------------------
select care.run_flag_engine();

select is(
  (select count(*)::int from care.flags where as_of_date = current_date),
  3,
  '§9 — chạy lần hai không sinh cờ đôi (khóa duy nhất student+rule+date)'
);

-- Hai hồ sơ, đúng bằng hai em có cờ (Minh và Bình) — không phải hai hồ sơ cho một em.
select is(
  (select count(*)::int from care.care_cases),
  2,
  '§9 — chạy lần hai không mở hồ sơ thứ hai cho cùng một em'
);

-- ---------------------------------------------------------------------------
-- 6. Định mức 5 hồ sơ Tầng 2 mỗi GVCN → tràn thì sang tâm lý cụm
-- ---------------------------------------------------------------------------
-- Cô Lan đã có 1 hồ sơ (của Minh). Bơm thêm 4 hồ sơ giả cho đủ định mức 5.
insert into core.students (id, student_code, school_id, full_name)
select ('70000000-0000-0000-0000-00000000001' || g)::uuid,
       'VA-2026-0050' || g, '20000000-0000-0000-0000-000000000001', 'HS phụ ' || g
  from generate_series(1, 4) g;

insert into care.care_cases (student_id, owner_id, tier)
select ('70000000-0000-0000-0000-00000000001' || g)::uuid,
       '40000000-0000-0000-0000-000000000001', 2
  from generate_series(1, 4) g;

-- Em thứ sáu của lớp 6A1 có tín hiệu: cô Lan đã đủ 5, hồ sơ phải sang tâm lý cụm.
insert into core.students (id, student_code, school_id, full_name)
values ('70000000-0000-0000-0000-000000000021', 'VA-2026-00521',
        '20000000-0000-0000-0000-000000000001', 'Trần Văn Dũng');
insert into core.enrollments (student_id, class_id, valid_from)
values ('70000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000001', '2026-09-05');
insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
select '70000000-0000-0000-0000-000000000021', current_date - g, 'in', 1, 'present', 'app'
  from generate_series(0, 4) g;

select care.run_flag_engine();

select is(
  (select owner_id from care.care_cases
    where student_id = '70000000-0000-0000-0000-000000000021' and status = 'open'),
  '40000000-0000-0000-0000-000000000003'::uuid,
  'GVCN đã đủ 5 hồ sơ → hồ sơ thứ sáu chuyển tâm lý cụm (định mức, hành vi cố định 2)'
);

select is(
  (select owner_id from care.care_cases
    where student_id = '70000000-0000-0000-0000-000000000001' and status = 'open'),
  '40000000-0000-0000-0000-000000000001'::uuid,
  'Hồ sơ đã có chủ KHÔNG bị đổi chủ ở lần quét sau (owner gán một lần lúc tạo)'
);

-- ---------------------------------------------------------------------------
-- 7. Leo thang 7 ngày — chốt chặn "đo rồi để đó"
-- ---------------------------------------------------------------------------
-- Một cờ cũ 8 ngày của Minh, gắn vào hồ sơ đang mở, chưa ai ghi can thiệp.
insert into care.flags (student_id, rule_code, as_of_date, origin)
values ('70000000-0000-0000-0000-000000000001', 'A_ATTENDANCE', current_date - 8, 'live');

insert into care.care_case_flags (case_id, flag_id)
select cc.id, f.id
  from care.care_cases cc, care.flags f
 where cc.student_id = '70000000-0000-0000-0000-000000000001' and cc.status = 'open'
   and f.student_id = cc.student_id and f.as_of_date = current_date - 8;

select care.run_flag_engine();

select is(
  (select count(*)::int from care.escalations e
     join care.care_cases cc on cc.id = e.case_id
    where cc.student_id = '70000000-0000-0000-0000-000000000001'
      and e.reason = 'no_action_7d'),
  1,
  'Cờ quá 7 ngày không ai động tới → tự leo thang lên care team'
);

select care.run_flag_engine();

select is(
  (select count(*)::int from care.escalations),
  1,
  '§9 — chạy lại không sinh lượt leo thang thứ hai trong cùng ngày'
);

-- ---------------------------------------------------------------------------
-- 8. Nạp bù KHÔNG được gây báo động hàng loạt (ADR-016)
-- ---------------------------------------------------------------------------
-- Cường ở cơ sở Q2, chưa từng có tín hiệu nào. Thêm tín hiệu rồi chạy mode nạp bù.
insert into attendance.help_requests (student_id, requested_on, topic, urgency)
values ('70000000-0000-0000-0000-000000000003', current_date, 'nha', 'today');

select care.run_flag_engine(current_date, 'backfill');

select is(
  (select origin from care.flags
    where student_id = '70000000-0000-0000-0000-000000000003' and rule_code = 'E_URGENT'),
  'backfill',
  'Nạp bù vẫn ghi cờ để tra cứu lịch sử — mang nhãn backfill'
);

select is(
  (select count(*)::int from care.care_cases
    where student_id = '70000000-0000-0000-0000-000000000003'),
  0,
  'Nạp bù KHÔNG mở hồ sơ can thiệp — không có luật này thì promote 3 tháng dữ liệu cũ mở vài trăm ca giả một đêm'
);

select is(
  (select count(*)::int from ops.outbox_messages
    where dedup_key like 'flag_engine_backfill:%'),
  1,
  'Care team nhận MỘT bản tóm tắt đợt nạp bù, không phải N ca'
);

select care.run_flag_engine(current_date, 'backfill');

select is(
  (select count(*)::int from ops.outbox_messages
    where dedup_key like 'flag_engine_backfill:%'),
  1,
  '§9 — nạp bù lần hai trong cùng ngày không gửi bản tin thứ hai'
);

-- ---------------------------------------------------------------------------
-- 9. §6 — đổi ngưỡng trong BẢNG là đổi hành vi, không cần deploy
-- ---------------------------------------------------------------------------
-- Đây là bài test mà 04-flag-engine.md gọi tên thẳng: "engine đọc ngưỡng từ bảng
-- (đổi param trong test → kết quả đổi theo)". Khai ngưỡng RIÊNG cho cơ sở Q7 đòi
-- 5 → 99 ngày mood xấu liên tiếp: Minh (5 ngày) phải rớt khỏi cờ E_MOOD, trong khi
-- cờ A_ATTENDANCE của em không đổi vì ngưỡng chuyên cần không bị chạm.
delete from care.escalations;
delete from care.care_case_flags;
delete from care.flags;

insert into care.thresholds (rule_code, params, school_id)
values ('E_MOOD',
        '{"mode": "streak", "negative_days_streak": 99, "window_days": 14, "bad_mood_max": 2}'::jsonb,
        '20000000-0000-0000-0000-000000000001');

select care.run_flag_engine();

select is(
  (select count(*)::int from care.flags
    where student_id = '70000000-0000-0000-0000-000000000001' and rule_code = 'E_MOOD'),
  0,
  '§6 — nâng ngưỡng riêng cho cơ sở Q7 bằng MỘT câu UPDATE là cờ E_MOOD tắt, không sửa một dòng code nào'
);

select is(
  (select count(*)::int from care.flags
    where student_id = '70000000-0000-0000-0000-000000000001' and rule_code = 'A_ATTENDANCE'),
  1,
  'Đổi ngưỡng của một luật không ảnh hưởng luật khác — cờ chuyên cần vẫn nguyên'
);

-- ---------------------------------------------------------------------------
-- 10. Signal view cũng thôi viết chết cửa sổ thời gian
-- ---------------------------------------------------------------------------
-- Trước 0039, care.v_signal_attendance và v_signal_behavior neo cứng `current_date - 30`
-- trong khi bảng ngưỡng khai window_days cho đúng hai luật ấy — hai con số cùng nói một
-- điều ở hai nơi, và người sửa bảng tưởng mình vừa đổi hành vi hệ thống. Bài dưới đây
-- chứng minh cửa sổ bây giờ ĐỌC TỪ BẢNG, theo đúng cơ sở của em.

-- Một buổi có mặt cách đây 40 ngày: nằm NGOÀI cửa sổ 30 ngày mặc định.
insert into attendance.checkins (student_id, occurred_on, kind, status, source)
values ('70000000-0000-0000-0000-000000000001', current_date - 40, 'in', 'present', 'app');

select is(
  (select round(attendance_rate, 2) from care.v_signal_attendance
    where student_id = '70000000-0000-0000-0000-000000000001'),
  0.00,
  'Cửa sổ 30 ngày mặc định: buổi có mặt cách đây 40 ngày KHÔNG được tính'
);

insert into care.thresholds (rule_code, params, school_id)
values ('A_ATTENDANCE', '{"min_rate": 0.90, "window_days": 60}'::jsonb,
        '20000000-0000-0000-0000-000000000001');

select is(
  (select round(attendance_rate, 2) from care.v_signal_attendance
    where student_id = '70000000-0000-0000-0000-000000000001'),
  0.17,
  'Nới cửa sổ cơ sở Q7 lên 60 ngày bằng một câu INSERT → view tính lại ngay (1/6 buổi)'
);

select is(
  (select incident_count::int from care.v_signal_behavior
    where student_id = '70000000-0000-0000-0000-000000000001'),
  3,
  'Cửa sổ 30 ngày mặc định: đủ cả 3 tuần có điểm 0'
);

insert into care.thresholds (rule_code, params, school_id)
values ('B_BEHAVIOR', '{"max_incidents": 2, "window_days": 10}'::jsonb,
        '20000000-0000-0000-0000-000000000001');

select is(
  (select incident_count::int from care.v_signal_behavior
    where student_id = '70000000-0000-0000-0000-000000000001'),
  1,
  'Thu cửa sổ hành vi của Q7 xuống 10 ngày → chỉ còn tuần gần nhất, không cần deploy'
);

-- ---------------------------------------------------------------------------
-- 11. Hai cửa đóng: ngày quá khứ và mode lạ
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select care.run_flag_engine(current_date - 1) $$,
  '0A000', null,
  'Từ chối quét cho ngày quá khứ: signal view neo vào current_date nên nhãn ngày sẽ là lịch sử bịa ra'
);

select throws_ok(
  $$ select care.run_flag_engine(current_date, 'test') $$,
  '22023', null,
  'Chỉ nhận mode live | backfill'
);

-- ---------------------------------------------------------------------------
-- 12. Đây là hàm của JOB, không phải của người dùng
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'care.run_flag_engine(date, text)', 'execute'),
  'Tài khoản đăng nhập KHÔNG gọi được bộ quét — Postgres cấp EXECUTE cho PUBLIC mặc định nên phải thu lại tường minh'
);

select * from finish();
rollback;
