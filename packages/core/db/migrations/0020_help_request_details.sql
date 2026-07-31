-- 0020_help_request_details.sql
-- V5 "Cần gặp thầy cô" (Hub Desktop V2) cho em chọn chủ đề + mức khẩn + lời nhắn
-- trước khi gửi — help_requests trước đây chỉ ghi "đã bấm nút" (0004), không đủ
-- cho form này. Nội dung (topic/urgency/note) là dữ liệu cảm xúc thường
-- (mệnh lệnh 4 CLAUDE.md): lưu thẳng, không mã hoá riêng; care.v_signal_emotion
-- (0009) đã cố tình chỉ đếm tín hiệu chứ không đọc các cột này — giữ nguyên,
-- không sửa view đó.

begin;

alter table attendance.help_requests
  add column topic   text,
  add column urgency  text,
  add column note     text;

alter table attendance.help_requests
  add constraint help_requests_topic_chk
    check (topic is null or topic in ('lop', 'nha', 'hoc', 'suc_khoe', 'khac')),
  add constraint help_requests_urgency_chk
    check (urgency is null or urgency in ('urgent', 'today', 'this_week'));

comment on column attendance.help_requests.topic is
  'Chủ đề em chọn ở V5 — không bắt buộc (nút "cần giúp" cũ trong popup check-in vẫn gửi NULL).';
comment on column attendance.help_requests.note is
  'Lời nhắn tự do, không bắt buộc. Dữ liệu cảm xúc thường — §5 CLAUDE.md: không vào báo cáo học thuật, xoá chi tiết sau 12 tháng cùng đợt dọn mood.';

-- Gửi lại trong ngày (đổi chủ đề/lời nhắn) cần nhánh UPDATE của on-conflict, giống
-- checkins_update_self (0017) — nhưng chỉ khi GVCN CHƯA xử lý, tránh ghi đè sau khi
-- đã được đọc/xác nhận.
grant update on attendance.help_requests to authenticated;

create policy help_requests_update_self on attendance.help_requests for update to authenticated
  using (core.is_me(student_id) and handled_at is null)
  with check (core.is_me(student_id));
comment on policy help_requests_update_self on attendance.help_requests is
  'Cho tự sửa lại yêu cầu trong ngày (bấm gửi lại với nội dung khác) — chỉ khi GVCN chưa handled_at.';

-- Tên GVCN để hiển thị "gửi riêng cho cô X" — signal view cùng khuôn mẫu
-- core.v_my_scopes (0015): chạy bằng quyền chủ sở hữu, WHERE tự khoá theo người gọi
-- nên an toàn dù core.users có RLS users_self chặn đọc người khác.
create or replace view core.v_my_homeroom_teacher as
  select u.full_name, c.code as class_code
    from core.enrollments e
    join core.classes c on c.id = e.class_id
    join core.user_role_scopes urs on urs.class_id = e.class_id and urs.role_code = 'homeroom'
    join core.users u on u.id = urs.user_id
    join core.students st on st.id = e.student_id
   where st.user_id = core.current_user_id()
     and e.valid_to is null;

comment on view core.v_my_homeroom_teacher is
  'Chỉ trả GVCN của LỚP ĐANG HỌC của core.current_user_id() — an toàn cấp SELECT rộng vì WHERE tự khoá theo người gọi, giống v_my_scopes.';

grant select on core.v_my_homeroom_teacher to authenticated;

commit;
