-- 0021_my_guardians_view.sql
-- V8 Báo cáo Trưởng thành (Hub Desktop V2) cần trả lời "báo cáo này gửi cho ai" —
-- mockup vẽ thêm trạng thái đã đọc/chưa đọc, nhưng KHÔNG có bảng theo dõi đọc nào
-- trong hệ (không bịa) nên chỉ hiện đúng thật: TÊN người giám hộ đã gắn với em,
-- không hiện giờ đọc. 0016 chỉ cho phụ huynh tự tra con mình, chưa có chiều
-- ngược lại (em tự tra ai là phụ huynh của mình) — mở bằng signal view cùng
-- khuôn mẫu core.v_my_homeroom_teacher (0020).

begin;

create or replace view core.v_my_guardians as
  select u.full_name, ps.relation
    from core.students st
    join core.parent_students ps on ps.student_id = st.id
    join core.parents p on p.id = ps.parent_id
    join core.users u on u.id = p.user_id
   where st.user_id = core.current_user_id();

comment on view core.v_my_guardians is
  'Chỉ trả về phụ huynh của core.current_user_id() (khi người gọi là học sinh) — an toàn cấp SELECT rộng vì WHERE tự khoá theo người gọi, giống v_my_scopes/v_my_homeroom_teacher.';

grant select on core.v_my_guardians to authenticated;

commit;
