-- pgTAP — dấu chân hoạt động (§1, §9)
begin;
select plan(6);
select test_support.seed_basic();

-- §1: mọi bảng evidence đều móc về core.students
select col_is_fk('evidence', 'dear_logs',     'student_id', 'dear_logs FK về core.students');
select col_is_fk('evidence', 'fitness_tests', 'student_id', 'fitness_tests FK về core.students');

-- §9 trên đường ghi mà Mini App ngoài dùng nhiều nhất
select lives_ok(
  $$ insert into evidence.dear_logs (student_id, logged_on, minutes, book_title)
     values ('70000000-0000-0000-0000-000000000001', current_date, 20, 'Dế Mèn') $$,
  'Ghi nhật ký đọc sách'
);
select throws_ok(
  $$ insert into evidence.dear_logs (student_id, logged_on, minutes)
     values ('70000000-0000-0000-0000-000000000001', current_date, 25) $$,
  '23505', null,
  'Webhook bắn lại cùng ngày không tạo bản ghi đôi (§9)'
);

-- Số phút vô lý bị chặn ngay ở tầng dữ liệu.
select throws_ok(
  $$ insert into evidence.dear_logs (student_id, logged_on, minutes)
     values ('70000000-0000-0000-0000-000000000002', current_date, 5000) $$,
  '23514', null,
  'Số phút đọc vượt ngưỡng hợp lý bị chặn'
);

-- Rubric: cùng tiêu chí nhưng người chấm khác nhau là hai dòng hợp lệ
select lives_ok(
  $$ insert into evidence.rubric_scores (student_id, project_code, criterion, score, scored_by)
     values ('70000000-0000-0000-0000-000000000001', 'PBL-01', 'hop_tac', 3.5, 'teacher'),
            ('70000000-0000-0000-0000-000000000001', 'PBL-01', 'hop_tac', 3.0, 'peer') $$,
  'Giáo viên chấm và bạn chấm là hai bản ghi tách biệt'
);

select * from finish();
rollback;
