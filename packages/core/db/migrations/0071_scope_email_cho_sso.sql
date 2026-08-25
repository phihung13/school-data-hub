-- 0071 — thêm 'email' vào danh sách scope SSO biết trước (ADR-040, 25/08/2026).
--
-- VÌ SAO: app Việt Anh Class có 16 hồ sơ học sinh THẬT gắn theo email trường phát hành,
-- cần nối tài khoản Hub vào hồ sơ có sẵn ở lần đăng nhập đầu. Phương án khớp tên+lớp bị
-- bác — hai em trùng tên cùng lớp là nhập nhầm hồ sơ trẻ em. Provider đã khai claim
-- `email` (đọc core.users.email — email do trường phát hành, cùng vai định danh với sub);
-- ràng buộc này là vòng chặn "trường cấp theo TỪNG app": app không có 'email' trong
-- sso_scopes thì /oidc/auth từ chối từ đầu.
--
-- Ràng buộc GIỮ NGUYÊN triết lý 0055 (danh sách trắng — scope lạ là lỗi ngay lúc ghi sổ,
-- không phải một quyền lặng lẽ), chỉ nối dài danh sách thêm đúng một phần tử.
begin;

alter table core.embedded_apps drop constraint if exists embedded_apps_sso_scope_biet_truoc;
alter table core.embedded_apps add constraint embedded_apps_sso_scope_biet_truoc
  check (
    (not sso_enabled)
    or (
      sso_scopes <@ array['openid', 'profile', 'hub_profile', 'email', 'offline_access']
      and 'openid' = any (sso_scopes)
    )
  );

commit;
