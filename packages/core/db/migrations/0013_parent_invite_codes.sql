-- 0013_parent_invite_codes.sql
-- Mã mời phụ huynh (M2 đăng nhập PH, DESIGN-GUIDELINES §6) — chưa có trong baseline 0001-0012.
--
-- GVCN/admin tạo mã 6 ký tự gắn với một học sinh, gửi qua Zalo. Phụ huynh nhập
-- mã lần đầu -> tạo core.users + core.parents + parent_students + role scope.
-- Lần sau vẫn mã đó (đã dùng) -> không tạo tài khoản mới, trả lại đúng người cũ (§9).
--
-- DEV NOTE: hàm bên dưới tự sinh auth_uid bằng gen_random_uuid() vì chưa nối
-- Zalo OAuth thật (hạ tầng chưa mua — xem 10-mua-sam-ha-tang.md). Khi nối Zalo/OIDC
-- thật, thay đúng MỘT dòng (đánh dấu bên dưới) bằng auth_uid do provider cấp;
-- chữ ký hàm và phần gọi từ auth-adapter giữ nguyên.

begin;

create table core.parent_invite_codes (
  code         text primary key,
  student_id   uuid not null references core.students(id) on delete cascade,
  relation     text not null default 'guardian',
  expires_at   timestamptz not null,
  redeemed_by  uuid references core.users(id),
  redeemed_at  timestamptz,
  created_by   uuid references core.users(id),
  created_at   timestamptz not null default now(),
  constraint parent_invite_codes_code_chk check (code ~ '^[A-Z0-9]{6}$')
);
comment on table core.parent_invite_codes is
  'Mã mời 6 ký tự cho đăng nhập phụ huynh. RLS deny-by-default, giống core.id_mappings — chỉ hàm redeem_parent_invite_code (SECURITY DEFINER) chạm.';

create index parent_invite_codes_student_idx on core.parent_invite_codes (student_id);

alter table core.parent_invite_codes enable row level security;
-- Cố tình KHÔNG có policy nào cho authenticated/anon: bảng chỉ đọc/ghi qua hàm dưới đây.

create or replace function core.redeem_parent_invite_code(p_code text)
returns uuid  -- auth_uid để phía app mint session (packages/core/auth-adapter)
language plpgsql
security definer
set search_path = core, pg_temp
as $$
declare
  v_row       core.parent_invite_codes%rowtype;
  v_user_id   uuid;
  v_parent_id uuid;
  v_auth_uid  uuid;
begin
  select * into v_row from core.parent_invite_codes
   where code = upper(p_code) for update;

  if not found then
    raise exception 'Mã mời không tồn tại' using errcode = 'no_data_found';
  end if;
  if v_row.expires_at < now() then
    raise exception 'Mã mời đã hết hạn' using errcode = 'data_exception';
  end if;

  -- §9: đã redeem trước đó -> trả lại đúng người cũ, không sinh tài khoản thứ hai.
  if v_row.redeemed_by is not null then
    select auth_uid into v_auth_uid from core.users where id = v_row.redeemed_by;
    return v_auth_uid;
  end if;

  v_auth_uid := gen_random_uuid(); -- DEV ONLY — thay bằng auth_uid thật khi nối Zalo OAuth

  insert into core.users (auth_uid, full_name, status)
       values (v_auth_uid, 'Phụ huynh', 'active')
    returning id into v_user_id;

  insert into core.parents (user_id) values (v_user_id) returning id into v_parent_id;

  insert into core.parent_students (parent_id, student_id, relation)
       values (v_parent_id, v_row.student_id, v_row.relation);

  insert into core.user_role_scopes (user_id, role_code) values (v_user_id, 'guardian');

  update core.parent_invite_codes
     set redeemed_by = v_user_id, redeemed_at = now()
   where code = v_row.code;

  return v_auth_uid;
end;
$$;

comment on function core.redeem_parent_invite_code(text) is
  'Idempotent theo mã (§9). DEV: sinh auth_uid giả — xem ghi chú đầu file khi nối Zalo OAuth thật.';

revoke all on function core.redeem_parent_invite_code(text) from public;
grant usage on schema core to anon;
grant execute on function core.redeem_parent_invite_code(text) to anon;

commit;
