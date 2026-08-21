-- 0066_vai_doc_cho_metabase.sql
-- ADR-039 — vai đọc cho Metabase. Chủ đầu tư chọn "Vai rộng, đọc được tất cả"
-- (21/08/2026), sau khi được nêu rõ điều dưới đây.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ĐIỀU PHẢI ĐỌC TRƯỚC KHI DÙNG FILE NÀY
-- ═══════════════════════════════════════════════════════════════════════════
-- Vai này có `BYPASSRLS`. Nghĩa là **mọi policy trong toàn hệ ngừng có hiệu lực** với
-- nó: `core.can_read_mood`, `core.can_see_care`, `core.can_see_student`, tường lửa §5,
-- ADR-026/035 — không cái nào gác được cửa này. Ai có tài khoản Metabase là truy vấn
-- được nhật ký cảm xúc của từng em, ghi chú tư vấn, hồ sơ y tế.
--
-- Đó KHÔNG phải một lỗ hổng — đó là điều được chọn, và được chọn sau khi nghe đúng câu
-- này. Nhưng nó đổi **bản chất** của hàng rào: từ hôm nay, ranh giới thật quanh dữ liệu
-- nhạy cảm nhất của trẻ **không còn nằm trong Postgres** mà nằm ở *danh sách người có
-- tài khoản Metabase*. Một hàng rào do người giữ, không do máy giữ.
--
-- Vì thế `ADR-039` gắn kèm ba nghĩa vụ, và chúng là điều kiện để CẮM BẢN THẬT, không
-- phải việc làm sau:
--   1. BGH duyệt TỪNG tài khoản bằng văn bản.
--   2. Rà lại danh sách mỗi học kỳ.
--   3. Sổ cấp/thu vào hồ sơ vận hành (`07-operations.md`).
-- Ba việc ấy là văn bản, không phải mã — nên file này KHÔNG thi hành được chúng, và
-- không được để ai tưởng ngược lại. Xem `DEBT.md` #67.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- BỐN THỨ VAI NÀY KHÔNG CÓ, và mỗi thứ là một quyết định chứ không phải sót
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. **Không GHI.** Chỉ `SELECT`. Metabase là công cụ đọc; một vai phân tích có quyền
--    ghi là một cú `update` gõ nhầm trong ô truy vấn tự do.
-- 2. **Không `LOGIN` ở đây.** Vai này `NOLOGIN` và là vai NHÓM — người vận hành tạo một
--    vai đăng nhập riêng có mật khẩu rồi `grant metabase_doc_rong to <vai đó>`. Mật khẩu
--    không bao giờ nằm trong migration (§8; và migration đi vào git).
-- 3. **Không đụng `reporting`.** Vai §5 giữ nguyên mọi revoke của `0009`/`0040`. Đây là
--    một cửa MỚI có chủ ý, không phải nới cửa cũ — trộn hai thứ là làm mất dấu vết của
--    quyết định nào mở cửa nào.
-- 4. **Không quyền trên `staging`.** Bản ghi thô của connector không phải dữ liệu phân
--    tích; nó là hàng đợi kỹ thuật, và nó chứa payload nguyên văn từ app ngoài.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'metabase_doc_rong') then
    create role metabase_doc_rong nologin bypassrls;
  else
    alter role metabase_doc_rong nologin bypassrls;
  end if;
end
$$;

comment on role metabase_doc_rong is
  'ADR-039 (21/08/2026) — vai đọc cho Metabase, CÓ BYPASSRLS: mọi policy ngừng hiệu lực với vai này, gồm cả can_read_mood và tường lửa §5. Hàng rào thật quanh dữ liệu nhạy cảm từ đây là DANH SÁCH NGƯỜI có tài khoản Metabase, do BGH duyệt và rà mỗi học kỳ (07-operations.md). Chỉ SELECT, không LOGIN (cấp qua một vai đăng nhập riêng), không chạm staging.';

grant usage on schema core, attendance, care, evidence, tutor, health, report, ops to metabase_doc_rong;
grant select on all tables in schema core, attendance, care, evidence, tutor, health, report, ops to metabase_doc_rong;

-- Bảng/view SINH SAU cũng phải tự có quyền. Thiếu dòng này thì mỗi migration mới lại đẻ
-- ra một bảng Metabase không đọc được, và người vận hành sẽ vá bằng một câu `grant` gõ
-- tay lúc 11 giờ đêm — thường là câu rộng hơn hẳn câu cần thiết.
alter default privileges in schema core, attendance, care, evidence, tutor, health, report, ops
  grant select on tables to metabase_doc_rong;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- CẮM BẢN THẬT — ba bước, người vận hành chạy, KHÔNG nằm trong migration
-- ═══════════════════════════════════════════════════════════════════════════
--   1. Tạo vai đăng nhập riêng, mật khẩu sinh ngẫu nhiên, KHÔNG ghi vào git:
--        create role metabase_app login password '<32 byte ngẫu nhiên>';
--        grant metabase_doc_rong to metabase_app;
--   2. Cắm Metabase trỏ vào vai đó (chuỗi kết nối để trong biến môi trường của
--      container Metabase, không trong bất kỳ file nào của kho này).
--   3. TRƯỚC khi mở cho người thứ hai: có văn bản BGH duyệt danh sách tài khoản.
--      Bước 3 là điều kiện, không phải thủ tục — xem khối đầu file.
