-- 0003_core_rbac.sql
-- Giáo viên, phụ huynh, phân công lớp, vai trò/quyền có phạm vi, sổ đối chiếu mã ngoài.
--
-- Điểm cốt lõi: quyền KHÔNG phải "cô Lan là giáo viên" mà là
-- "cô Lan là chủ nhiệm CỦA LỚP 6A1" — vai trò luôn đi kèm phạm vi.
-- Thiếu phạm vi thì mọi giáo viên xem được mọi học sinh.

begin;

create table core.teachers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references core.users(id) on delete cascade,
  employee_code  text not null unique,
  school_id      uuid not null references core.schools(id),
  created_at     timestamptz not null default now()
);

create table core.parents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references core.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Quan hệ phụ huynh ↔ con: nguồn sự thật cho quyền "children" trong ma trận RLS.
create table core.parent_students (
  parent_id   uuid not null references core.parents(id) on delete cascade,
  student_id  uuid not null references core.students(id) on delete cascade,
  relation    text not null default 'guardian',
  created_at  timestamptz not null default now(),
  primary key (parent_id, student_id)
);
create index parent_students_student_idx on core.parent_students (student_id);

create table core.class_assignments (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references core.teachers(id) on delete cascade,
  class_id         uuid not null references core.classes(id) on delete cascade,
  assignment_role  text not null,
  subject          text,
  created_at       timestamptz not null default now(),
  constraint class_assignments_role_chk check (assignment_role in ('homeroom', 'subject')),
  constraint class_assignments_uq unique (teacher_id, class_id, assignment_role, subject)
);
-- Một lớp chỉ có một GVCN — nếu hai người cùng nhận thì không ai chịu trách nhiệm.
create unique index class_assignments_one_homeroom_idx
  on core.class_assignments (class_id) where assignment_role = 'homeroom';

-- ---------------------------------------------------------------------------
-- Vai trò và quyền
-- ---------------------------------------------------------------------------
create table core.roles (
  code        text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

insert into core.roles (code, name) values
  ('student',   'Học sinh'),
  ('guardian',  'Phụ huynh'),
  ('teacher',   'Giáo viên bộ môn'),
  ('homeroom',  'Giáo viên chủ nhiệm'),
  ('counselor', 'Tâm lý cụm'),
  ('principal', 'Hiệu trưởng / BGH cơ sở'),
  ('board',     'Ban điều hành / Hội đồng dữ liệu'),
  ('admin',     'Quản trị hệ thống');

create table core.permissions (
  code        text primary key,
  name        text not null
);

create table core.role_permissions (
  role_code        text not null references core.roles(code) on delete cascade,
  permission_code  text not null references core.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

-- Vai trò CÓ PHẠM VI: cụm, cơ sở, hoặc lớp cụ thể.
create table core.user_role_scopes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references core.users(id) on delete cascade,
  role_code   text not null references core.roles(code),
  school_id   uuid references core.schools(id),
  class_id    uuid references core.classes(id),
  cluster     text,
  created_at  timestamptz not null default now(),
  constraint user_role_scopes_uq unique nulls not distinct
    (user_id, role_code, school_id, class_id, cluster)
);
comment on table core.user_role_scopes is
  'Vai trò luôn kèm phạm vi. Hàng không có phạm vi nào = vai trò toàn hệ, chỉ dành cho board/admin.';

create index user_role_scopes_user_idx on core.user_role_scopes (user_id);

-- ---------------------------------------------------------------------------
-- Sổ đối chiếu mã ngoài — CHỈ HỌC SINH (sổ đăng nhập nằm ở 0010, ADR-016)
-- ---------------------------------------------------------------------------
create table core.id_mappings (
  system       text not null,
  external_id  text not null,
  student_id   uuid not null references core.students(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (system, external_id)
);
comment on table core.id_mappings is
  '§1 — sổ DỮ LIỆU: mã học sinh ở hệ ngoài (tutor/moodle/cor/zalo/embed:<app-id>). Không map được thì vào staging.import_errors, KHÔNG tự đoán.';

create index id_mappings_student_idx on core.id_mappings (student_id);

-- ADR-017: alias cấp cho Mini App ngoài do Hub sinh, mỗi app một dải riêng.
create or replace function core.issue_embed_alias(p_app_id text, p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = core, pg_temp
as $$
declare
  v_system text := 'embed:' || p_app_id;
  v_alias  text;
begin
  select external_id into v_alias
    from core.id_mappings
   where system = v_system and student_id = p_student_id;

  if v_alias is not null then
    return v_alias;                      -- §9: gọi lại trả đúng alias cũ
  end if;

  -- Gọi kèm schema: search_path của hàm bị khóa vào core nên không thấy pgcrypto ở public.
  v_alias := encode(public.gen_random_bytes(16), 'hex');
  insert into core.id_mappings (system, external_id, student_id)
       values (v_system, v_alias, p_student_id);
  return v_alias;
end;
$$;

comment on function core.issue_embed_alias(text, uuid) is
  'ADR-017 — Hub sinh alias, app ngoài không tự khai. Mỗi app một dải riêng nên hai app không ghép chéo được dữ liệu.';

revoke all on function core.issue_embed_alias(text, uuid) from public;

commit;
