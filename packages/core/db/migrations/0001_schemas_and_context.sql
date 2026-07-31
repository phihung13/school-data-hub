-- 0001_schemas_and_context.sql
-- Nền móng: schema theo domain + hàm ngữ cảnh dùng chung cho mọi RLS policy.
--
-- Nguyên tắc (ADR-011/012):
--   core     = Single Source of Truth, chỉ ở đây mới có bản gốc người/học sinh/lớp/cơ sở
--   Mini App = schema riêng, chỉ giữ fact nghiệp vụ, FK về core (§1)
--   auth.*   = của Supabase, nghiệp vụ KHÔNG đọc trực tiếp — chỉ hàm ở file này chạm tới

begin;

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- ràng buộc chống chồng lấn khoảng thời gian

create schema if not exists core;
create schema if not exists attendance;
create schema if not exists care;
create schema if not exists evidence;
create schema if not exists tutor;
create schema if not exists health;
create schema if not exists staging;
create schema if not exists ops;
create schema if not exists report;

comment on schema core   is 'ADR-011 — Core Data Model, Single Source of Truth. Mini App KHÔNG tạo bản sao thực thể ở đây.';
comment on schema health is 'ADR-009 — y tế, RLS riêng chặt hơn. Giáo viên bộ môn không đọc được.';
comment on schema staging is '§8 — phòng chờ cho mọi nguồn ngoài. Chỉ promote() được đưa dữ liệu sang schema nghiệp vụ.';

-- Schema đặt chỗ: giữ tên miền dữ liệu, chưa xây (02-database.md).
create schema if not exists finance;
create schema if not exists social;
create schema if not exists ai;

-- ---------------------------------------------------------------------------
-- Vai trò cấp database
-- ---------------------------------------------------------------------------
do $$
begin
  -- Supabase tạo sẵn 'authenticated'/'anon' trên hosted; tạo ở đây để migration
  -- chạy được trên PostgreSQL thuần (CI, self-host, restore drill) — đúng tinh thần
  -- "Supabase là nơi chạy, không phải nơi nghiệp vụ bị khóa chặt" (ADR-012).
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;

  -- §8: connector chỉ được INSERT vào staging, không hơn.
  if not exists (select 1 from pg_roles where rolname = 'connector') then
    create role connector nologin;
  end if;
  -- §5: bộ sinh báo cáo học thuật — bị chặn khỏi dữ liệu cảm xúc ở 0009.
  if not exists (select 1 from pg_roles where rolname = 'reporting') then
    create role reporting nologin;
  end if;
  -- ADR-006: chỉ đọc, dùng cho job backup.
  if not exists (select 1 from pg_roles where rolname = 'backup_reader') then
    create role backup_reader nologin;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Ngữ cảnh phiên — CHỖ DUY NHẤT trong toàn hệ được chạm auth.uid()
--
-- Mọi policy và mọi truy vấn nghiệp vụ gọi core.current_user_id().
-- Đổi nhà cung cấp hạ tầng = sửa đúng hàm này, không sửa 200 policy (ADR-012).
-- ---------------------------------------------------------------------------
create or replace function core.current_auth_uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

comment on function core.current_auth_uid() is
  'ADR-012 — điểm chạm DUY NHẤT tới định danh của nhà cung cấp auth. Không hàm nào khác được đọc auth.*';

-- plpgsql chứ không phải sql: hàm này tham chiếu core.users, mà bảng đó tới 0002
-- mới tồn tại. Hàm SQL bị phân tích thân ngay lúc tạo và sẽ fail; plpgsql thì không.
create or replace function core.current_user_id()
returns uuid
language plpgsql stable
security definer
set search_path = core, pg_temp
as $$
declare
  v_id uuid;
begin
  select u.id into v_id
    from core.users u
   where u.auth_uid = core.current_auth_uid()
     and u.status = 'active';
  return v_id;
end;
$$;

comment on function core.current_user_id() is
  'ADR-012 — auth uid -> core.users.id. Trả NULL nếu tài khoản đã khóa: khóa là mất quyền ngay, không đợi hết phiên.';

commit;
