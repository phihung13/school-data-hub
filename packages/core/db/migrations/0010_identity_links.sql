-- 0010_identity_links.sql
-- ADR-016 — tách SỔ ĐĂNG NHẬP khỏi SỔ DỮ LIỆU.
--
-- Bối cảnh: core.id_mappings FK về core.students.id nên chỉ chứa được HỌC SINH.
-- OIDC bridge (ADR-014) phải map cả giáo viên, phụ huynh, nhân viên — không có chỗ.
-- Từ nay:
--   core.id_mappings    = dữ liệu   (system, external_id) -> student_id
--   core.identity_links = đăng nhập (system, external_id) -> user_id
--
-- Phụ thuộc: core.users (baseline 0001–0009).

begin;

create table if not exists core.identity_links (
  id             uuid        primary key default gen_random_uuid(),
  system         text        not null,
  external_id    text        not null,
  user_id        uuid        not null references core.users(id) on delete cascade,
  linked_at      timestamptz not null default now(),
  last_seen_at   timestamptz,

  -- Chiều 1: một mã ngoài chỉ thuộc đúng một người.
  constraint identity_links_system_external_uq unique (system, external_id),
  -- Chiều 2: một người chỉ có một tài khoản trong mỗi hệ ngoài.
  -- Thiếu ràng buộc này thì một người sinh nhiều tài khoản Moodle mà không ai thấy,
  -- và điểm/tiến độ nằm rải rác giữa các tài khoản.
  constraint identity_links_system_user_uq     unique (system, user_id),

  constraint identity_links_system_format_chk  check (system ~ '^[a-z0-9][a-z0-9_:-]*$'),
  constraint identity_links_external_len_chk   check (length(external_id) between 1 and 255)
);

comment on table  core.identity_links is
  'ADR-016 — sổ đăng nhập: map tài khoản Hub với hệ ngoài qua OIDC. KHÔNG dùng cho dữ liệu học sinh (đó là core.id_mappings).';
comment on column core.identity_links.system is
  'Mã hệ ngoài, vd ''moodle''. Cùng không gian tên với core.id_mappings.system nhưng khác bảng, khác mục đích.';

-- UQ(system, user_id) đã tạo index có tiền tố `system`; truy vấn theo riêng user_id cần index riêng.
create index if not exists identity_links_user_idx on core.identity_links (user_id);

alter table core.identity_links enable row level security;
alter table core.identity_links force  row level security;

-- Cấp quyền bảng nhưng KHÔNG tạo policy nào cho `authenticated`:
-- truy vấn chạy được nhưng luôn trả 0 dòng (deny by default đúng nghĩa RLS),
-- thay vì báo "permission denied" làm lộ sự tồn tại của bảng.
-- Chỉ auth-adapter (packages/core, chạy bằng role máy chủ) mới thực sự đọc được.
grant select on core.identity_links to authenticated;

-- ---------------------------------------------------------------------------
-- Khớp tài khoản: idempotent (§9), xung đột thì CHẶN chứ không tự đoán (§8).
-- ---------------------------------------------------------------------------
create or replace function core.link_identity(
  p_system      text,
  p_external_id text,
  p_user_id     uuid
) returns core.identity_links
language plpgsql
security definer
set search_path = core, pg_temp
as $$
declare
  v_row   core.identity_links;
  v_owner uuid;
begin
  -- Ca 1: mã ngoài này đã thuộc về người khác.
  select user_id into v_owner
    from core.identity_links
   where system = p_system and external_id = p_external_id;

  if v_owner is not null and v_owner <> p_user_id then
    raise exception
      'identity_links: % / % đã map user %, không tự gán lại cho %',
      p_system, p_external_id, v_owner, p_user_id
      using errcode = 'unique_violation',
            hint    = 'Người xử lý phải quyết định — không đoán (RULES §8).';
  end if;

  -- Ca 2: người này đã có tài khoản khác trong cùng hệ ngoài.
  if exists (
    select 1 from core.identity_links
     where system = p_system and user_id = p_user_id and external_id <> p_external_id
  ) then
    raise exception
      'identity_links: user % đã có tài khoản khác trong hệ %',
      p_user_id, p_system
      using errcode = 'unique_violation',
            hint    = 'Gộp tài khoản thủ công trước, không tạo tài khoản trùng.';
  end if;

  -- Ca 3: bình thường — gọi bao nhiêu lần cũng ra một dòng (§9).
  insert into core.identity_links as il (system, external_id, user_id, last_seen_at)
       values (p_system, p_external_id, p_user_id, now())
  on conflict (system, external_id)
    do update set last_seen_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

comment on function core.link_identity(text, text, uuid) is
  'ADR-016 §9 — upsert idempotent liên kết định danh. Xung đột hai chiều đều raise, không tự gán.';

revoke all on function core.link_identity(text, text, uuid) from public;

commit;
