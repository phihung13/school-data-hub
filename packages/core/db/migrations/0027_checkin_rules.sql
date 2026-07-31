-- 0027_checkin_rules.sql
-- ADR-007 được CÀI ĐẶT THẬT — trước migration này nó chỉ tồn tại trên giấy.
--
-- Rà toàn hệ thống 31/07/2026: bảng `attendance.checkin_rules` (0004, khung giờ
-- 06:45–07:30 + dải IP cơ sở) KHÔNG được đọc ở bất kỳ đâu — grep `campus_cidrs`
-- toàn repo chỉ ra chính file 0004 và bài pgTAP 0024. Router `checkin.submitMood`
-- viết cứng `status = 'present', source = 'app'` cho mọi lần bấm, nên:
--
--   · hai thẻ "Chờ xác nhận" và "Vắng" trên buồng lái GVCN luôn bằng 0 trên dữ
--     liệu thật — không phải vì lớp đi học đủ, mà vì không đường nào sinh ra
--     `queued_late`;
--   · `care.acknowledgeLate` không bao giờ có gì để xác nhận;
--   · em bấm check-in lúc 11 giờ trưa, ở nhà, vẫn được ghi "có mặt đúng giờ".
--
-- Ba việc trong migration này, tất cả đều nhằm để CON SỐ nằm trong bảng chứ không
-- nằm trong TypeScript (mệnh lệnh 7 CLAUDE.md — đổi khung giờ là một câu UPDATE,
-- không phải một lần deploy):
--
--   1. Một cơ sở chỉ có MỘT bộ luật đang hiệu lực (hiện chèn hai dòng `active`
--      mâu thuẫn nhau vẫn hợp lệ ở tầng DB — "luật nào thắng" tuỳ vào `limit 1`).
--   2. `attendance.checkins.client_id` — khoá idempotent của hàng đợi offline,
--      chống một item bị gửi hai lần từ hai tab (§9).
--   3. `attendance.resolve_checkin()` — nơi DUY NHẤT quyết định status/source của
--      một lần check-in. Là SECURITY DEFINER vì 0024 đã (đúng) đóng
--      `attendance.checkin_rules` lại chỉ cho admin/board đọc: công khai dải IP
--      trường cho học sinh chính là chỉ dẫn cách gian lận điểm danh. Router chạy
--      dưới vai `authenticated` nên phải hỏi qua hàm này, không SELECT thẳng bảng.
--
-- Phụ thuộc: 0004 (checkin_rules, checkins), 0024 (RLS checkin_rules).

begin;

-- ---------------------------------------------------------------------------
-- 1. Một cơ sở — một bộ luật đang hiệu lực
-- ---------------------------------------------------------------------------
create unique index if not exists checkin_rules_one_active_idx
  on attendance.checkin_rules (school_id) where active;

comment on index attendance.checkin_rules_one_active_idx is
  'ADR-007 — hai dòng active cùng một cơ sở nghĩa là khung giờ điểm danh của cơ sở đó phụ thuộc vào thứ tự trả về của Postgres. Chặn ở tầng DB, không dựa vào kỷ luật người nhập.';

-- Trần tuổi của một bản gửi bù từ hàng đợi offline. Nằm trong BẢNG chứ không
-- trong code: máy em học sinh có thể tắt cả tuần nghỉ lễ, và mỗi cơ sở có thể
-- muốn một con số khác — đổi số đó không được là một lần deploy.
alter table attendance.checkin_rules
  add column if not exists queue_max_age_days smallint not null default 7;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'checkin_rules_queue_age_chk'
       and conrelid = 'attendance.checkin_rules'::regclass
  ) then
    alter table attendance.checkin_rules
      add constraint checkin_rules_queue_age_chk
        check (queue_max_age_days between 1 and 60);
  end if;
end
$$;

comment on column attendance.checkin_rules.queue_max_age_days is
  'ADR-007 — bản gửi bù từ hàng đợi offline cũ hơn ngần này ngày thì Hub TỪ CHỐI ghi (và nói thật với em là đã từ chối), thay vì lặng lẽ dán vào ngày hôm nay.';

-- ---------------------------------------------------------------------------
-- 2. client_id — khoá idempotent của hàng đợi offline (§9)
-- ---------------------------------------------------------------------------
alter table attendance.checkins
  add column if not exists client_id uuid;

create unique index if not exists checkins_client_id_uq
  on attendance.checkins (client_id) where client_id is not null;

comment on column attendance.checkins.client_id is
  '§9 — id do máy của em sinh khi xếp hàng offline (contracts/checkin.ts QueuedCheckinInput.clientId). Hai tab cùng flush một hàng đợi chỉ ra một dòng.';

-- ---------------------------------------------------------------------------
-- 3. resolve_checkin() — cửa duy nhất quyết định status/source
-- ---------------------------------------------------------------------------
-- Trả về cả `rejected_reason` thay vì raise: người gọi cần phân biệt "ghi được"
-- với "từ chối vì ngày quá cũ/ở tương lai" để nói đúng câu với em. Raise ở đây
-- sẽ thành lỗi 500 và (theo đúng vết đã thấy ở hàng đợi offline) biến thành
-- "gửi thất bại im lặng".
create or replace function attendance.resolve_checkin(
  p_student_id  uuid,
  p_client_at   timestamptz,
  p_client_ip   inet,
  p_from_queue  boolean
) returns table (
  occurred_on     date,
  status          text,
  source          text,
  rejected_reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  -- Trường vận hành theo giờ Việt Nam. Postgres mặc định chạy UTC, nên so
  -- `06:45` với giờ UTC là lệch đúng 7 tiếng — mọi em check-in trước 13:45 giờ
  -- VN sẽ "đúng giờ", mọi em sau đó "muộn". Ghim múi giờ ở đây, cùng một lựa
  -- chọn với packages/core/db/client.ts (đã ghim từ 30/07/2026).
  c_tz       constant text := 'Asia/Ho_Chi_Minh';
  -- Khớp DEFAULT của cột: dùng khi cơ sở chưa khai luật nào.
  c_queue_default constant int := 7;
  v_school   uuid;
  v_rule     attendance.checkin_rules%rowtype;
  v_local    timestamp;
  v_today    date;
  v_max_age  int;
begin
  select s.school_id into v_school
    from core.students s
   where s.id = p_student_id;

  if v_school is null then
    -- Không phải học sinh: người gọi (router) đã chặn trước, nhưng hàm này là
    -- SECURITY DEFINER nên không được tin vào việc đó.
    occurred_on := null;
    status := null;
    source := null;
    rejected_reason := 'khong_phai_hoc_sinh';
    return next;
    return;
  end if;

  select r.* into v_rule
    from attendance.checkin_rules r
   where r.school_id = v_school and r.active
   limit 1;

  v_local := p_client_at at time zone c_tz;
  v_today := (now() at time zone c_tz)::date;

  if p_from_queue then
    -- ADR-007: bản gửi bù KHÔNG tự tính chuyên cần, chờ GVCN xác nhận. Ngày lấy
    -- từ đồng hồ MÁY EM lúc bấm — đó là lý do tồn tại của cả hàng đợi: em bấm
    -- thứ Sáu thì phải nằm ở thứ Sáu, dù máy nối mạng lại vào thứ Hai.
    occurred_on := v_local::date;
    status := 'queued_late';
    source := 'offline_queue';
    v_max_age := coalesce(v_rule.queue_max_age_days, c_queue_default);

    if occurred_on > v_today then
      rejected_reason := 'ngay_o_tuong_lai';
    elsif occurred_on < v_today - v_max_age then
      rejected_reason := 'ngay_qua_cu';
    end if;

    return next;
    return;
  end if;

  -- Check-in trực tiếp: ngày lấy từ đồng hồ MÁY CHỦ. Đồng hồ máy em có thể sai
  -- (hoặc bị chỉnh cố ý để "check-in bù" cho hôm qua) — chỉ hàng đợi offline mới
  -- có lý do chính đáng để mang ngày của client.
  occurred_on := v_today;
  source := 'app';

  if v_rule.id is null then
    -- Cơ sở chưa khai luật nào: KHÔNG phạt em vì thiếu cấu hình của người lớn.
    status := 'present';
  elsif array_length(v_rule.campus_cidrs, 1) is not null
        and (p_client_ip is null
             or not exists (
               select 1 from unnest(v_rule.campus_cidrs) as cidr
                where p_client_ip <<= cidr
             ))
  then
    -- Ngoài dải IP của trường: thiết bị không chứng minh được đang ở trường
    -- (DEBT #5 — cũng không chứng minh được em ngồi trong lớp). Không kết luận
    -- "vắng", chuyển sang chờ GVCN xác nhận.
    status := 'queued_late';
  elsif v_local::time > v_rule.closes_at then
    status := 'late';
  else
    -- Trước giờ mở cổng cũng là 'present': đi sớm không phải lỗi của em.
    status := 'present';
  end if;

  return next;
end
$$;

comment on function attendance.resolve_checkin(uuid, timestamptz, inet, boolean) is
  'ADR-007 — nơi DUY NHẤT quyết định status/source của một lần check-in, đọc khung giờ + dải IP từ attendance.checkin_rules. SECURITY DEFINER vì 0024 đóng bảng luật lại (công khai dải IP = chỉ dẫn gian lận). Trả rejected_reason thay vì raise để người gọi nói đúng câu với học sinh.';

-- Mặc định Postgres cấp EXECUTE cho public trên mọi hàm mới — với một hàm
-- SECURITY DEFINER đọc bảng cấu hình chống gian lận thì đó là quá rộng.
revoke all on function attendance.resolve_checkin(uuid, timestamptz, inet, boolean) from public;
grant execute on function attendance.resolve_checkin(uuid, timestamptz, inet, boolean) to authenticated;

commit;
