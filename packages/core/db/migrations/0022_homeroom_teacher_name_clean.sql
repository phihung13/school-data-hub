-- 0022_homeroom_teacher_name_clean.sql
-- Phát hiện khi chạy thật V5/V9: dữ liệu fixture đặt full_name kiểu
-- "Cô Lan (GVCN 6A1)" — đúng cho màn hình đăng nhập (cần phân biệt các tài
-- khoản thử) nhưng đọc kỳ khi ghép câu ("Gửi riêng cho Cô Lan (GVCN 6A1)").
-- Bỏ hậu tố "(...)" ngay tại view thay vì lặp lại regex ở từng nơi hiển thị
-- (help-request-view.tsx, profile-view.tsx, và V10 sau này).

begin;

create or replace view core.v_my_homeroom_teacher as
  select regexp_replace(u.full_name, '\s*\([^)]*\)\s*$', '') as full_name, c.code as class_code
    from core.enrollments e
    join core.classes c on c.id = e.class_id
    join core.user_role_scopes urs on urs.class_id = e.class_id and urs.role_code = 'homeroom'
    join core.users u on u.id = urs.user_id
    join core.students st on st.id = e.student_id
   where st.user_id = core.current_user_id()
     and e.valid_to is null;

commit;
