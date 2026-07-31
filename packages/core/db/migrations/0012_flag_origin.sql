-- 0012_flag_origin.sql
-- ADR-016 — nạp bù dữ liệu cũ không được gây báo động hàng loạt.
--
-- Bối cảnh: promote() chạy lại 3 tháng dữ liệu -> cờ mang as_of_date trong quá khứ
--           -> luật leo thang 7 ngày kích hoạt NGAY -> care team nhận vài trăm ca giả một đêm.
-- Sau:      cờ sinh từ nạp bù mang origin='backfill': chỉ vào lịch sử để tra cứu,
--           không mở care_case, không vào hàng đợi leo thang; care team nhận MỘT bản tóm tắt.
--
-- Dùng text + CHECK thay vì enum: expand–contract dễ hơn, thêm giá trị không cần ALTER TYPE.
-- Phụ thuộc: care.flags, care.care_cases (baseline 0001–0009).

begin;

alter table care.flags
  add column if not exists origin text not null default 'live';

alter table care.flags
  drop constraint if exists flags_origin_chk;
alter table care.flags
  add  constraint flags_origin_chk check (origin in ('live', 'backfill'));

comment on column care.flags.origin is
  'ADR-016 — live: quét thường, được mở ca + leo thang. backfill: sinh từ nạp bù dữ liệu cũ, CHỈ lưu lịch sử.';

-- Truy vấn nóng nhất là "cờ live đang chờ xử lý"; index một phần giữ nó nhỏ và nhanh.
create index if not exists flags_live_pending_idx
  on care.flags (student_id, as_of_date desc)
  where origin = 'live';

create index if not exists flags_backfill_idx
  on care.flags (as_of_date desc)
  where origin = 'backfill';

-- ---------------------------------------------------------------------------
-- Chốt chặn ở tầng database, không chỉ ở tầng ứng dụng.
-- Lý do: luật "backfill không leo thang" quan trọng tới mức không được phép
-- phụ thuộc vào việc người viết code nhớ kiểm tra. Ai gắn cờ backfill vào một
-- care_case — dù qua engine, script tay hay psql — đều bị chặn.
-- ---------------------------------------------------------------------------
create or replace function care.reject_backfill_flag_in_case()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from care.flags where id = new.flag_id and origin = 'backfill') then
    raise exception 'Cờ backfill không được gắn vào care_case (ADR-016)'
      using errcode = 'check_violation',
            hint    = 'Nạp bù chỉ ghi lịch sử. Cần can thiệp thật thì tạo case thủ công, có người chịu trách nhiệm.';
  end if;
  return new;
end;
$$;

-- Bảng nối flags <-> cases đặt tên theo 02-database.md ("flags ↔ cases · interventions").
-- Nếu baseline đặt tên khác, sửa tên bảng ở đây cho khớp — logic giữ nguyên.
drop trigger if exists trg_reject_backfill_flag_in_case on care.care_case_flags;
create trigger trg_reject_backfill_flag_in_case
  before insert or update on care.care_case_flags
  for each row execute function care.reject_backfill_flag_in_case();

-- Chỉ số quản trị (VAAR) chỉ đếm cờ thật. Cột origin tới bây giờ mới tồn tại
-- nên view ở 0009 chưa lọc được — bổ sung ở đây.
create or replace view report.v_vaar_indicators as
  select s.school_id,
         date_trunc('month', f.as_of_date)::date as period_month,
         f.rule_code,
         count(*) as flag_count
    from care.flags f
    join core.students s on s.id = f.student_id
   where f.origin = 'live'
   group by 1, 2, 3;

commit;
