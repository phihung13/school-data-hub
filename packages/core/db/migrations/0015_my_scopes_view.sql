-- 0015_my_scopes_view.sql
-- core.user_role_scopes không có GRANT/RLS cho `authenticated` (đúng ý: bảng phân
-- quyền không nên đọc thẳng). Nhưng apps/hub cần tự hỏi "tôi có vai trò gì, lớp
-- nào" để vẽ đúng màn hình (vd GVCN mở buồng lái lớp nào) — mở qua view hẹp,
-- đúng khuôn mẫu "signal views" đã dùng ở 0009: view luôn chạy bằng quyền chủ sở
-- hữu (Postgres) để đọc bảng gốc, còn WHERE tự giới hạn vào đúng người gọi.

begin;

create or replace view core.v_my_scopes as
  select role_code, school_id, class_id, cluster
    from core.user_role_scopes
   where user_id = core.current_user_id();

comment on view core.v_my_scopes is
  'Chỉ trả về scope của core.current_user_id() — an toàn cấp SELECT rộng vì WHERE tự khoá theo người gọi, không phải RLS trên bảng gốc.';

grant select on core.v_my_scopes to authenticated;

commit;
