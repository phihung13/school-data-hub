-- 0002_core_identity.sql
-- Core Data Model, phần định danh: mạng trường → cơ sở → lớp; người dùng; học sinh; ghi danh.
-- §1: mọi bảng dữ liệu học sinh ở MỌI schema đều FK về core.students.id. Bắt đầu từ đây.

begin;

create table core.school_networks (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table core.schools (
  id          uuid primary key default gen_random_uuid(),
  network_id  uuid not null references core.school_networks(id),
  code        text not null unique,
  name        text not null,
  timezone    text not null default 'Asia/Ho_Chi_Minh',
  created_at  timestamptz not null default now()
);
comment on table core.schools is 'Cơ sở (campus). 6 cơ sở trong phạm vi hiện tại.';

create table core.classes (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references core.schools(id),
  code           text not null,
  academic_year  text not null,                      -- '2026-2027'
  grade          smallint not null,
  created_at     timestamptz not null default now(),
  constraint classes_code_year_uq unique (school_id, code, academic_year),
  constraint classes_grade_chk    check (grade between 0 and 12)  -- 0 = mầm non
);

-- ---------------------------------------------------------------------------
-- Người dùng: bản gốc DUY NHẤT của "ai là ai" trong toàn hệ.
-- auth_uid chỉ là mã của nhà cung cấp đăng nhập, không phải khóa nghiệp vụ.
-- ---------------------------------------------------------------------------
create table core.users (
  id          uuid primary key default gen_random_uuid(),
  auth_uid    uuid unique,                            -- NULL: tài khoản đã tạo, chưa kích hoạt
  email       text unique,
  full_name   text not null,
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint users_status_chk check (status in ('active', 'disabled', 'pending'))
);
comment on column core.users.status is
  'ADR-016 — disabled là nguồn sự thật của việc thu hồi: core.current_user_id() trả NULL, OIDC từ chối refresh.';

create index users_status_idx on core.users (status) where status = 'active';

-- ---------------------------------------------------------------------------
-- Học sinh: mã hiển thị bất biến 12 năm (§1).
-- ---------------------------------------------------------------------------
create table core.students (
  id            uuid primary key default gen_random_uuid(),
  student_code  text not null unique,
  user_id       uuid unique references core.users(id),  -- NULL: em chưa có tài khoản (mầm non)
  school_id     uuid not null references core.schools(id),
  full_name     text not null,
  date_of_birth date,
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  constraint students_code_format_chk check (student_code ~ '^VA-\d{4}-\d{5}$'),
  constraint students_status_chk      check (status in ('active', 'graduated', 'left'))
);
comment on column core.students.student_code is
  '§1 — VA-YYYY-NNNNN. Bất biến 12 năm, KHÔNG đổi khi chuyển cơ sở. Là mã hiển thị, không dùng làm khóa kỹ thuật.';

create index students_school_idx on core.students (school_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Ghi danh: một em học lớp nào, trong khoảng thời gian nào.
-- Đây là bảng quyết định "cô giáo này có được xem em này không" nên phải sạch.
-- ---------------------------------------------------------------------------
create table core.enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references core.students(id) on delete cascade,
  class_id    uuid not null references core.classes(id),
  valid_from  date not null,
  valid_to    date,                                   -- NULL = đang học
  created_at  timestamptz not null default now(),
  constraint enrollments_period_chk check (valid_to is null or valid_to >= valid_from),
  -- Một em không thể học hai lớp cùng lúc: chặn chồng lấn thời gian ở tầng DB,
  -- vì nếu để lọt thì phân quyền theo lớp sẽ sai một cách âm thầm.
  constraint enrollments_no_overlap exclude using gist (
    student_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  )
);

create index enrollments_class_idx   on core.enrollments (class_id);
create index enrollments_current_idx on core.enrollments (student_id) where valid_to is null;

commit;
