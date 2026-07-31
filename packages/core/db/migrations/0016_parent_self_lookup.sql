-- 0016_parent_self_lookup.sql
-- core.parents / core.parent_students CHƯA có RLS lẫn GRANT nào từ 0001-0015 —
-- phát hiện khi chạy thật GĐ1 (apps/hub): phụ huynh không tự tra được "con mình
-- là ai" (permission denied), vì báo cáo Trưởng thành cần tự suy ra student_id
-- từ current_user_id() trước khi RLS của attendance.* có cơ hội áp dụng.
--
-- Trước đây an toàn theo kiểu "khóa hết vì quên", không phải khóa có chủ đích
-- (khác `core.id_mappings`/`identity_links` — hai bảng đó khóa CÓ Ý, chỉ server
-- chạm). Mở đúng phạm vi: một phụ huynh chỉ tự tra được chính mình + con mình.

begin;

alter table core.parents enable row level security;
create policy parents_self on core.parents for select to authenticated
  using (user_id = core.current_user_id());
comment on policy parents_self on core.parents is
  'Tự tra "tôi là phụ huynh nào" — cần trước khi lọc parent_students theo parent_id.';

alter table core.parent_students enable row level security;
create policy parent_students_self on core.parent_students for select to authenticated
  using (
    exists (select 1 from core.parents p where p.id = parent_id and p.user_id = core.current_user_id())
  );
comment on policy parent_students_self on core.parent_students is
  'Phụ huynh tự tra danh sách con mình. Không mở cho GVCN/khác — họ dùng core.is_my_child() (SECURITY DEFINER) qua RLS của attendance/care, không cần đọc thẳng bảng này.';

grant select on core.parents, core.parent_students to authenticated;

commit;
