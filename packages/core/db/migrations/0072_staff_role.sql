-- 0072_staff_role — vai 'staff' (Nhân viên phòng ban) cho tầm nhìn Super App đa phòng ban.
--
-- Nhân viên marketing/HR/tài chính KHÔNG quản lý học sinh, không thấy dữ liệu trẻ em.
-- Vào /home họ thấy dashboard mẫu người lớn (home-view.tsx: khoiNguoiLon = !isStudent).
-- Cấp vai này qua SSO auto (DEMO_AUTO_STAFF=1) hoặc gán tay trong core.user_role_scopes.
--
-- Idempotent: on conflict do nothing. (auth-adapter/google-provider.ts cũng tự bootstrap
-- vai này lúc chạy, nên demo không bắt buộc chạy migration; file này để repo có bản ghi.)

insert into core.roles (code, name)
values ('staff', 'Nhân viên')
on conflict (code) do nothing;
