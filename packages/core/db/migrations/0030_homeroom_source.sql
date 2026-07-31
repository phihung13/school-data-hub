-- 0030_homeroom_source.sql
-- Nửa sau của việc chốt MỘT nguồn sự thật cho quan hệ "GVCN ↔ lớp".
-- Nửa đầu (hàng rào chống lệch trên `core.user_role_scopes`): 0023_role_scope_guard.sql.
--
-- 0023 làm cho sổ phụ KHÔNG NÓI DỐI ĐƯỢC. File này làm nốt việc quan trọng hơn:
-- chuyển mọi NGƯỜI ĐỌC sang đúng nguồn, để hai bên không còn cơ hội trả lời khác nhau.
--
--   Nguồn sự thật  = core.class_assignments (assignment_role = 'homeroom')
--                    — cùng nguồn mà core.is_homeroom_of() (0009:24-39) dùng để
--                      quyết định RLS, tức là cùng nguồn mà DATABASE thật sự tin.
--   Bản sao tiện dụng = core.user_role_scopes (role_code = 'homeroom')
--                    — chỉ còn phục vụ claims OIDC (claims.ts) và đăng nhập dev
--                      (dev-provider.ts); 0023 bảo đảm nó không đi trước bản gốc.
--
-- Ba view được sửa/thêm ở đây là toàn bộ đường mà tầng ứng dụng hỏi câu "ai chủ
-- nhiệm lớp nào":
--   core.v_my_scopes           → trpc.ts loadMyScopes() → homeroomProcedure →
--                                care.getDashboard (buồng lái GVCN)
--   core.v_my_homeroom_teacher → checkin.ts:228, profile.ts:43 (màn hình học sinh)
--   core.v_my_homeroom_classes → MỚI: "lớp tôi chủ nhiệm", đọc thẳng từ nguồn sự thật
--
-- Kết quả mong muốn, nói bằng lời: sau file này, việc THÊM một dòng
-- core.user_role_scopes không còn mở thêm được cái gì, và việc THIẾU nó không còn
-- đóng nhầm cái gì. Muốn đổi GVCN của một lớp thì sửa đúng một chỗ — bảng phân công.

begin;

-- ---------------------------------------------------------------------------
-- 1. Ghi thẳng vào metadata ai là nguồn sự thật
--    Comment nằm trong database thì người đọc schema thấy được, khác với một câu
--    trong tài liệu mà lần sửa vội thứ mười sẽ không ai mở ra.
-- ---------------------------------------------------------------------------
comment on table core.class_assignments is
  'NGUỒN SỰ THẬT DUY NHẤT cho quan hệ GVCN ↔ lớp (0030). core.is_homeroom_of() và mọi view core.v_my_* đọc từ đây; core.user_role_scopes(role_code=''homeroom'') chỉ là bản sao cho claims OIDC, bị 0023 khoá không cho đi trước bảng này.';

-- ---------------------------------------------------------------------------
-- 2. core.v_my_scopes — vai gắn lớp lấy từ nguồn sự thật
--
-- Trước: đọc 100% từ core.user_role_scopes. Đó là lý do kiểu hỏng (a) và (b) tồn
-- tại được — hàng rào tRPC (`homeroomProcedure`) và hàng rào RLS (`is_homeroom_of`)
-- trả lời hai câu khác nhau cho cùng một người.
--
-- Sau: vai KHÔNG gắn lớp vẫn đọc sổ vai trò (đó là nguồn duy nhất của chúng), riêng
-- `homeroom` suy thẳng từ core.class_assignments. Hai hàng rào từ nay hỏi CÙNG một
-- bảng, nên không còn trạng thái "được vào phòng nhưng không thấy gì trong phòng".
--
-- Giữ nguyên security definer (KHÔNG đặt security_invoker) — 0024 có assertion khoá
-- điều này: core.user_role_scopes và core.class_assignments đều không GRANT cho
-- `authenticated`, view chạy bằng quyền chủ sở hữu còn WHERE tự khoá theo người gọi.
-- ---------------------------------------------------------------------------
create or replace view core.v_my_scopes as
  select s.role_code, s.school_id, s.class_id, s.cluster
    from core.user_role_scopes s
   where s.user_id = core.current_user_id()
     and s.role_code <> 'homeroom'
  union all
  select 'homeroom'::text as role_code,
         c.school_id,
         c.id             as class_id,
         null::text       as cluster
    from core.class_assignments ca
    join core.teachers t on t.id = ca.teacher_id
    join core.classes  c on c.id = ca.class_id
   where ca.assignment_role = 'homeroom'
     and t.user_id = core.current_user_id();

comment on view core.v_my_scopes is
  'Vai trò của core.current_user_id(). Vai KHÔNG gắn lớp đọc core.user_role_scopes; vai homeroom suy từ NGUỒN SỰ THẬT core.class_assignments (0030) nên trùng khớp với core.is_homeroom_of() — hàng rào tRPC và hàng rào RLS không còn trả lời khác nhau. DEFINER CÓ CHỦ Ý (0024): hai bảng gốc không cấp quyền cho authenticated, WHERE tự khoá theo người gọi.';

-- ---------------------------------------------------------------------------
-- 3. core.v_my_homeroom_teacher — "cô nào là GVCN của em"
--
-- Đây là view nguy hiểm nhất trong ba view: học sinh đọc tên ở đây rồi bấm "gửi
-- riêng cho cô X" (V5/V9). Nếu view trả cô X mà RLS lại cho cô Y đọc, thì em gửi tâm
-- sự cho một người không đọc được nó, còn người đọc được thì không biết mình được
-- gửi. Nay join đúng như core.is_homeroom_of(): enrollments → class_assignments →
-- teachers → users.
--
-- Giữ nguyên hai thứ của bản cũ, không được bỏ:
--   · regexp_replace bỏ hậu tố "(GVCN 6A1)" trong full_name (0022)
--   · e.valid_to is null — em đã chuyển lớp thì không còn thấy GVCN cũ (0022 test)
-- Thêm một bảo đảm mới, miễn phí: class_assignments_one_homeroom_idx (0003) khiến
-- view trả TỐI ĐA một dòng, nên `limit 1` không ORDER BY ở checkin.ts/profile.ts
-- không còn là xổ số.
-- ---------------------------------------------------------------------------
create or replace view core.v_my_homeroom_teacher as
  select regexp_replace(u.full_name, '\s*\([^)]*\)\s*$', '') as full_name,
         c.code as class_code
    from core.students st
    join core.enrollments e on e.student_id = st.id and e.valid_to is null
    join core.classes c on c.id = e.class_id
    join core.class_assignments ca on ca.class_id = e.class_id
                                  and ca.assignment_role = 'homeroom'
    join core.teachers t on t.id = ca.teacher_id
    join core.users u on u.id = t.user_id
   where st.user_id = core.current_user_id();

comment on view core.v_my_homeroom_teacher is
  'GVCN của LỚP ĐANG HỌC của core.current_user_id(), đã bỏ hậu tố "(...)" trong full_name. Đọc từ NGUỒN SỰ THẬT core.class_assignments (0030) — cùng nguồn với core.is_homeroom_of(), nên tên hiện ra cho học sinh đúng là người đọc được dữ liệu của em. DEFINER CÓ CHỦ Ý (0024).';

-- ---------------------------------------------------------------------------
-- 4. core.v_my_homeroom_classes — MỚI: "lớp tôi chủ nhiệm"
--
-- Hôm nay tầng ứng dụng phải lọc core.v_my_scopes để tìm lớp mình chủ nhiệm
-- (trpc.ts:175-178). Câu hỏi đó xứng đáng có một view riêng đọc thẳng nguồn sự thật,
-- kèm sẵn code/khối lớp để màn hình khỏi join lại core.classes (bảng có RLS).
-- ---------------------------------------------------------------------------
create or replace view core.v_my_homeroom_classes as
  select c.id            as class_id,
         c.code          as class_code,
         c.school_id,
         c.academic_year,
         c.grade
    from core.class_assignments ca
    join core.teachers t on t.id = ca.teacher_id
    join core.classes  c on c.id = ca.class_id
   where ca.assignment_role = 'homeroom'
     and t.user_id = core.current_user_id();

comment on view core.v_my_homeroom_classes is
  'Lớp mà core.current_user_id() đang chủ nhiệm, đọc từ NGUỒN SỰ THẬT core.class_assignments (0030). DEFINER CÓ CHỦ Ý — cùng lý do v_my_scopes: bảng gốc không GRANT cho authenticated, WHERE tự khoá theo người gọi.';

grant select on core.v_my_homeroom_classes to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Bản gốc đổi thì bản sao phải theo — dọn rác tự động
--
-- 0023 chặn chiều "bản sao đi trước bản gốc". Chiều còn lại: gỡ phân công chủ nhiệm
-- ở core.class_assignments mà quên xoá dòng core.user_role_scopes thì bản sao thành
-- rác — và rác đó vẫn chui vào claim OIDC (claims.ts:22) rồi ra ngoài Hub dưới dạng
-- `hub_classes` của một lớp mà người đó không còn chủ nhiệm.
--
-- Trigger dưới đây xoá đúng những dòng mà hàng rào 0023 giờ đã từ chối: nó không
-- đoán gì cả, chỉ áp lại cùng một điều kiện sau khi nguồn sự thật thay đổi.
-- ---------------------------------------------------------------------------
create or replace function core.gc_homeroom_scope()
returns trigger
language plpgsql
security definer
set search_path = core, pg_temp
as $$
declare
  v_classes uuid[] := '{}';
begin
  -- NEW không tồn tại khi DELETE, OLD không tồn tại khi INSERT — rẽ nhánh theo TG_OP
  -- thay vì dựa vào coalesce(new, old): kiểu record không coalesce được.
  if tg_op <> 'INSERT' and old.assignment_role = 'homeroom' then
    v_classes := v_classes || old.class_id;
  end if;
  if tg_op <> 'DELETE' and new.assignment_role = 'homeroom' then
    v_classes := v_classes || new.class_id;   -- đổi GVCN: lớp mới cũng phải soát lại
  end if;

  if cardinality(v_classes) = 0 then
    return null;   -- dòng bộ môn: không liên quan
  end if;

  delete from core.user_role_scopes s
   where s.role_code = 'homeroom'
     and s.class_id = any (v_classes)
     and not exists (
       select 1
         from core.class_assignments ca
         join core.teachers t on t.id = ca.teacher_id
        where ca.class_id = s.class_id
          and ca.assignment_role = 'homeroom'
          and t.user_id = s.user_id
     );

  return null;   -- AFTER … FOR EACH ROW: giá trị trả về bị bỏ qua
end;
$$;

comment on function core.gc_homeroom_scope() is
  'Bản gốc đổi thì bản sao theo (0030): sau mọi thay đổi phân công chủ nhiệm, xoá dòng core.user_role_scopes(homeroom) không còn khớp — đúng điều kiện mà trigger 0023 dùng để từ chối dòng mới.';

revoke all on function core.gc_homeroom_scope() from public;

drop trigger if exists class_assignments_scope_gc on core.class_assignments;
create trigger class_assignments_scope_gc
  after insert or update or delete on core.class_assignments
  for each row execute function core.gc_homeroom_scope();

-- ---------------------------------------------------------------------------
-- 6. ops.v_homeroom_drift — im lặng không được coi là tin tốt (Rev B/C điều 3)
--
-- Hai trigger trên đóng mọi đường sinh lệch MỚI, nhưng dữ liệu vào bằng đường khác
-- (khôi phục backup, sửa tay đúng lúc trigger bị vô hiệu, migration tương lai) thì
-- vẫn phải NHÌN THẤY được. View này là chỗ để job giám sát hỏi "còn lệch không",
-- và là chỗ để pgTAP khẳng định "sau mọi thao tác, không còn lệch".
--
-- Cố tình liệt kê CẢ HAI chiều, kể cả chiều 'thieu_ban_sao' vốn đã vô hại về mặt
-- phân quyền (v_my_scopes không còn đọc bản sao nữa): nó vẫn làm claim OIDC thiếu
-- lớp, và một sổ lệch là dấu hiệu có ai đó đang ghi vòng qua đường chính thức.
-- ---------------------------------------------------------------------------
create or replace view ops.v_homeroom_drift as
  select 'thua_ban_sao'::text as kind,
         s.user_id,
         s.class_id,
         'core.user_role_scopes có vai homeroom mà core.class_assignments không công nhận'::text as detail
    from core.user_role_scopes s
   where s.role_code = 'homeroom'
     and not exists (
       select 1
         from core.class_assignments ca
         join core.teachers t on t.id = ca.teacher_id
        where ca.class_id = s.class_id
          and ca.assignment_role = 'homeroom'
          and t.user_id = s.user_id
     )
  union all
  select 'thieu_ban_sao'::text,
         t.user_id,
         ca.class_id,
         'Có phân công chủ nhiệm nhưng thiếu dòng core.user_role_scopes — claim OIDC sẽ thiếu lớp này'::text
    from core.class_assignments ca
    join core.teachers t on t.id = ca.teacher_id
   where ca.assignment_role = 'homeroom'
     and not exists (
       select 1 from core.user_role_scopes s
        where s.role_code = 'homeroom'
          and s.class_id = ca.class_id
          and s.user_id  = t.user_id
     );

comment on view ops.v_homeroom_drift is
  'Sổ soi lệch GVCN (0030). Rỗng = hai sổ khớp nhau. kind=thua_ban_sao: dòng vai trò không được core.class_assignments công nhận (nguy hiểm hơn — đã bị 0023 chặn đường sinh mới). kind=thieu_ban_sao: có phân công thật nhưng thiếu bản sao, phân quyền vẫn đúng còn claim OIDC thì thiếu lớp.';

commit;
