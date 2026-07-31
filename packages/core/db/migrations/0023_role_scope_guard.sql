-- 0023_role_scope_guard.sql
-- Hàng rào cho `core.user_role_scopes` ở vai `homeroom` — nửa đầu của việc chốt
-- MỘT nguồn sự thật cho quan hệ "GVCN ↔ lớp" (nửa sau: 0030_homeroom_source.sql).
--
-- BỆNH: hệ đang có HAI sổ ghi cùng một sự thật, không sổ nào biết sổ kia.
--
--   Sổ A — core.class_assignments (assignment_role = 'homeroom', 0003:34-46).
--           Có `class_assignments_one_homeroom_idx`: một lớp đúng một GVCN.
--           TOÀN BỘ phân quyền đọc đi qua đây: core.is_homeroom_of() (0009:24-39)
--           quyết định GVCN thấy được care/health/check-in của em nào.
--
--   Sổ B — core.user_role_scopes (role_code = 'homeroom', class_id). Không có
--           ràng buộc nào chặn hai dòng homeroom cho cùng một lớp: khoá
--           `user_role_scopes_uq` unique theo (user_id, role_code, school_id,
--           class_id, cluster) nên hai NGƯỜI KHÁC NHAU cùng nhận một lớp là hợp lệ.
--
-- Chưa có màn hình quản trị, việc cấp vai phải gõ tay vào cả hai bảng, nên xác suất
-- lệch rất cao. Ba kiểu hỏng thật:
--   (a) có sổ A, thiếu sổ B  → buồng lái báo "không phải GVCN" dù DB cho đọc.
--   (b) có sổ B, thiếu sổ A  → buồng lái mở đúng lớp nhưng RLS lọc sạch: cô thấy
--       lớp TRỐNG RỖNG và tưởng cả lớp chưa check-in. Im lặng bị hiểu là tin tốt.
--   (c) hai dòng ở sổ B      → `limit 1` không ORDER BY ở checkin.ts:228 và
--       profile.ts:43, dev-provider.ts:103 `(array_agg(...))[1]`: học sinh thấy tên
--       "cô X" trong khi người thật sự đọc được dữ liệu của em là cô Y.
--
-- CHỌN: sổ A (core.class_assignments) là nguồn sự thật. Lý do — nó đã mang ràng
-- buộc đúng, và quan trọng hơn: nó là thứ RLS thật sự tin. Nguồn sự thật phải là
-- nguồn mà HÀNG RÀO đọc, không phải nguồn mà GIAO DIỆN đọc; chọn ngược lại là cấp
-- quyền bằng một bảng mà tầng dưới không hề hỏi tới.
--
-- File này KHÔNG xoá sổ B — 0013 (redeem_parent_invite_code), claims.ts (OIDC) và
-- dev-provider.ts vẫn đọc thẳng bảng đó, và mọi vai KHÔNG gắn lớp (counselor,
-- principal, board, admin, guardian, student) chỉ có mỗi sổ B. Việc của file này là
-- hạ sổ B xuống thành BẢN SAO KHÔNG ĐƯỢC PHÉP NÓI DỐI: dòng homeroom chỉ tồn tại
-- được khi ở sổ A đã có đúng phân công tương ứng.

begin;

-- ---------------------------------------------------------------------------
-- Bước 1 — dọn phần đã lệch, TRƯỚC khi dựng ràng buộc
--
-- Chiều xử lý là XOÁ dòng thừa ở sổ B, KHÔNG phải tự tạo phân công ở sổ A. Tạo ở sổ
-- A nghĩa là lấy một bản ghi phụ để mở quyền đọc dữ liệu chăm sóc của trẻ — đúng thứ
-- không được phép đoán. Xoá thì người dùng nhận "Mục này dành cho giáo viên chủ
-- nhiệm" (nhìn thấy được, sửa được bằng cách thêm phân công thật), còn giữ lại thì
-- người dùng nhận một lớp trống rỗng và tưởng mọi chuyện đều ổn — fail closed.
-- ---------------------------------------------------------------------------
do $$
declare
  v_orphan int;
  v_nullcls int;
begin
  delete from core.user_role_scopes s
   where s.role_code = 'homeroom'
     and s.class_id is null;
  get diagnostics v_nullcls = row_count;

  delete from core.user_role_scopes s
   where s.role_code = 'homeroom'
     and not exists (
       select 1
         from core.class_assignments ca
         join core.teachers t on t.id = ca.teacher_id
        where ca.class_id = s.class_id
          and ca.assignment_role = 'homeroom'
          and t.user_id = s.user_id
     );
  get diagnostics v_orphan = row_count;

  if v_nullcls > 0 or v_orphan > 0 then
    raise notice '0023: dọn % dòng homeroom không có lớp, % dòng không khớp core.class_assignments',
      v_nullcls, v_orphan;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Bước 2 — "GVCN" mà không có lớp là câu vô nghĩa, và nguy hiểm
--
-- Dòng user_role_scopes không có phạm vi nào = vai toàn hệ (comment ở 0003:90).
-- Một dòng homeroom mang class_id NULL vì thế đọc thành "chủ nhiệm mọi lớp".
-- Hôm nay chưa ai đọc nó theo nghĩa đó, nhưng đó là loại lỗ mà lần refactor sau mới
-- phát nổ. Chặn ngay tại kiểu dữ liệu.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'core.user_role_scopes'::regclass
       and conname  = 'user_role_scopes_homeroom_class_chk'
  ) then
    alter table core.user_role_scopes
      add constraint user_role_scopes_homeroom_class_chk
      check (role_code <> 'homeroom' or class_id is not null);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Bước 3 — một lớp một GVCN, ở CẢ HAI sổ
--
-- Đây là bản sao của `class_assignments_one_homeroom_idx` (0003:45) áp lên sổ B.
-- Không có nó thì hai dòng homeroom cùng class_id là hợp lệ, và mọi chỗ `limit 1`
-- không ORDER BY sẽ trả tên GVCN KHÔNG XÁC ĐỊNH — thay đổi theo kế hoạch truy vấn,
-- nghĩa là hôm nay đúng, sau một lần VACUUM thì sai, không ai lần ra được.
-- ---------------------------------------------------------------------------
create unique index if not exists user_role_scopes_one_homeroom_idx
  on core.user_role_scopes (class_id) where role_code = 'homeroom';

comment on index core.user_role_scopes_one_homeroom_idx is
  'Một lớp một GVCN — bản sao của class_assignments_one_homeroom_idx (0003) áp lên sổ vai trò, để mọi `limit 1` đọc tên GVCN đều xác định.';

-- ---------------------------------------------------------------------------
-- Bước 4 — bản sao không được phép đi trước bản gốc
--
-- Ràng buộc "dòng homeroom ở sổ B phải có phân công tương ứng ở sổ A" không viết
-- được bằng FOREIGN KEY: nó vắt qua ba bảng (user_role_scopes → teachers →
-- class_assignments) và khoá cần đối chiếu là (user_id, class_id) chứ không phải một
-- khoá có sẵn. Trigger là công cụ đúng, không phải là chỗ lười.
--
-- security definer + search_path khoá: hàm đọc core.class_assignments/core.teachers
-- vốn KHÔNG cấp quyền cho `authenticated` (0009 chỉ grant students/users/enrollments/
-- classes/schools). Ai chèn được vào core.user_role_scopes cũng phải kiểm được — nếu
-- không, hàng rào sẽ tự tắt đúng lúc cần nhất.
-- ---------------------------------------------------------------------------
create or replace function core.guard_homeroom_scope()
returns trigger
language plpgsql
security definer
set search_path = core, pg_temp
as $$
begin
  if new.role_code is distinct from 'homeroom' then
    return new;   -- vai không gắn lớp: sổ B là nguồn duy nhất, không kiểm gì thêm
  end if;

  -- Lặp lại CHECK ở bước 2 ngay trong trigger, có chủ ý: BEFORE-trigger chạy TRƯỚC
  -- khi Postgres kiểm CHECK, nên nếu không tự kiểm ở đây thì người dùng nhận thông
  -- báo "not exists phân công" khó hiểu thay vì "thiếu lớp". CHECK vẫn phải giữ: nó
  -- là hàng rào duy nhất còn tác dụng khi trigger bị tắt (khôi phục backup chạy với
  -- session_replication_role = replica).
  if new.class_id is null then
    raise exception 'Vai GVCN bắt buộc có class_id — dòng không phạm vi nghĩa là "chủ nhiệm mọi lớp"'
      using errcode = '23514',
            hint = 'Vai không gắn lớp (counselor/principal/board/admin) dùng role_code khác.';
  end if;

  if not exists (
    select 1
      from core.class_assignments ca
      join core.teachers t on t.id = ca.teacher_id
     where ca.class_id = new.class_id
       and ca.assignment_role = 'homeroom'
       and t.user_id = new.user_id
  ) then
    -- 23503 (foreign_key_violation): đây đúng là "tham chiếu tới thứ không tồn tại",
    -- chỉ là thứ được tham chiếu nằm sau một phép join nên FK thường không diễn tả nổi.
    raise exception
      'Vai GVCN phải bắt nguồn từ core.class_assignments: chưa có phân công chủ nhiệm lớp % cho người dùng %',
      new.class_id, new.user_id
      using errcode = '23503',
            hint = 'Thêm core.class_assignments (teacher_id, class_id, assignment_role = ''homeroom'') trước, rồi mới cấp vai.';
  end if;

  return new;
end;
$$;

comment on function core.guard_homeroom_scope() is
  'Chốt nguồn sự thật GVCN (0023/0030): core.user_role_scopes chỉ được MANG THEO vai homeroom mà core.class_assignments đã công nhận — không tự cấp quyền bằng sổ phụ.';

revoke all on function core.guard_homeroom_scope() from public;

drop trigger if exists user_role_scopes_homeroom_guard on core.user_role_scopes;
create trigger user_role_scopes_homeroom_guard
  before insert or update on core.user_role_scopes
  for each row execute function core.guard_homeroom_scope();

commit;
