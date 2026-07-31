-- 0034_health_read_audit.sql
-- Thi hành tuyên bố "mọi lượt đọc health.logs đều ghi audit" — hoặc nói lại cho đúng.
--
-- Bối cảnh: comment trên bảng health.logs (0007:74) ghi
--   'ADR-009 — y tế bán trú. Mọi lượt ĐỌC bảng này đều ghi audit (0008), khác với
--    dữ liệu thường.'
-- Thực tế trước file này: không có trigger nào trên health.logs, và toàn repo chỉ có
-- ĐÚNG MỘT chỗ ghi ops.audit_log (cấp token OIDC). Tức đây là một kiểm soát được viết
-- ra, được comment ngay trong schema, và không tồn tại.
--
-- Loại lỗi này nguy hiểm hơn thiếu hẳn: người đọc schema tin là đã có nên không ai
-- xây, và đúng câu này sẽ được đem ra trình khi bị hỏi về bảo vệ dữ liệu y tế của
-- trẻ. Nên phải chọn một trong hai — thi hành thật, hoặc gỡ tuyên bố. File này THI
-- HÀNH, rồi viết lại comment thành đúng phạm vi đã thi hành được.
--
-- ── Vì sao không dùng trigger ────────────────────────────────────────────────
-- PostgreSQL không có trigger cho SELECT. Cách duy nhất buộc mỗi lượt đọc đi qua một
-- chỗ ghi audit là: đóng đường đọc thẳng, mở một hàm.
--
-- ── Vì sao thu quyền theo CỘT chứ không thu cả bảng ──────────────────────────
-- Thu cả bảng thì `select 1 from health.logs` cũng "permission denied", và ta mất
-- luôn khả năng chứng minh RLS còn sống (0007/0023 kiểm đúng bằng câu đó: GVCN thấy,
-- giáo viên bộ môn không thấy, hiệu trưởng không thấy). Mất assertion RLS để đổi lấy
-- audit là đổi một kiểm soát này lấy một kiểm soát khác, không phải thêm.
--
-- Thu theo cột giữ được cả hai:
--   · `detail` (nội dung y tế) và `category` (uống thuốc / bán trú / dị ứng…) —
--     THU. Đây là thứ cần audit: biết một đứa trẻ dùng thuốc gì là dữ liệu y tế.
--   · id / student_id / logged_on / recorded_by / created_at — GIỮ, vẫn bị RLS lọc.
--     Đọc được "em này có một ghi nhận y tế ngày 12/09" mà không biết là gì: đủ cho
--     màn hình đếm và cho mọi phép kiểm phân quyền, không lộ nội dung.
--
-- Hệ quả kiểm chứng được: `select * from health.logs` bị từ chối cho mọi tài khoản
-- đăng nhập; muốn thấy nội dung thì phải gọi health.read_logs(), và hàm đó ghi audit
-- kể cả khi từ chối.
--
-- Phụ thuộc: 0007 (health.logs), 0008 (ops.audit_log), 0009 (RLS + grant theo bảng).

begin;

-- ---------------------------------------------------------------------------
-- 1. Đường đọc DUY NHẤT thấy được nội dung y tế
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER nên hàm này BỎ QUA RLS — vì vậy nó phải tự hỏi lại câu mà policy
-- health_logs_scope (0009:238) vẫn hỏi. Quên dòng can_see_health() ở đây là mở toang
-- vùng chặt nhất của hệ, nên nó nằm ngay dòng đầu thân hàm, trước mọi thứ khác.
create or replace function health.read_logs(
  p_student uuid,
  p_from    date default null,
  p_to      date default null
)
returns table (
  id           uuid,
  student_id   uuid,
  logged_on    date,
  category     text,
  detail       jsonb,
  recorded_by  uuid,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor   uuid    := core.current_user_id();
  v_allowed boolean := core.can_see_health(p_student);
  v_rows    bigint  := 0;
begin
  if v_allowed then
    return query
      select l.id, l.student_id, l.logged_on, l.category, l.detail, l.recorded_by, l.created_at
        from health.logs l
       where l.student_id = p_student
         and (p_from is null or l.logged_on >= p_from)
         and (p_to   is null or l.logged_on <= p_to)
       order by l.logged_on desc, l.created_at desc;

    -- RETURN QUERY không kết thúc hàm: lấy được số dòng vừa đẩy vào tuplestore rồi
    -- vẫn ghi audit được. Có số dòng mới trả lời được câu hỏi hậu kiểm thật sự hữu
    -- ích — "lượt tra này xem một em hay quét cả trường".
    get diagnostics v_rows = row_count;
  end if;

  -- Ghi audit CẢ HAI chiều. Lượt bị từ chối mới là thứ đáng xem nhất trong một sổ
  -- audit y tế: nó là dấu vết của một người đang thử mở cánh cửa không phải của mình.
  insert into ops.audit_log (actor_id, action, object_type, object_id, scope, result)
       values (v_actor, 'health.read', 'health.logs', p_student::text,
               jsonb_build_object('from', p_from, 'to', p_to, 'row_count', v_rows),
               case when v_allowed then 'ok' else 'denied' end);

  -- Không raise khi bị từ chối: trả 0 dòng. Báo lỗi khác nhau giữa "không có quyền"
  -- và "không có dữ liệu" là tự khai cho người dò biết em nào có hồ sơ y tế.
  return;
end;
$$;

comment on function health.read_logs(uuid, date, date) is
  'ADR-009 — đường DUY NHẤT đọc được nội dung health.logs. Tự kiểm core.can_see_health() (vì SECURITY DEFINER bỏ qua RLS) và ghi một dòng ops.audit_log mỗi lượt gọi, kể cả lượt bị từ chối. Từ chối = 0 dòng, không raise.';

-- ---------------------------------------------------------------------------
-- 2. Đóng đường đọc thẳng phần nội dung
-- ---------------------------------------------------------------------------
-- 0009:251 cấp `select on all tables in schema health to authenticated`. Thu lại
-- toàn bộ rồi cấp lại đúng phần khung.
revoke select on health.logs from authenticated;
grant  select (id, student_id, logged_on, recorded_by, created_at)
  on health.logs to authenticated;

-- Hàm mới cũng mặc định mở cho PUBLIC (kể cả `anon` chưa đăng nhập). Hàm này là
-- SECURITY DEFINER đọc dữ liệu y tế trẻ em — phải thu về rồi cấp lại đúng đối tượng.
revoke execute on function health.read_logs(uuid, date, date) from public;
grant  execute on function health.read_logs(uuid, date, date) to authenticated;

-- `reporting` đã bị `revoke usage on schema health` ở 0009:274 (§5) nên không gọi
-- được hàm này dù có EXECUTE — không cần thu thêm, nhưng ghi ra để lần sau ai đó mở
-- lại usage thì biết còn một cửa nữa phải xét.

-- ---------------------------------------------------------------------------
-- 3. Nói lại comment cho đúng thứ đã thi hành được
-- ---------------------------------------------------------------------------
-- Câu cũ ("mọi lượt ĐỌC bảng này đều ghi audit") giờ vẫn không đúng 100%: đọc cột
-- khung không sinh audit. Viết lại theo đúng biên giới thật, vì một tuyên bố hẹp mà
-- đúng thì bảo vệ được, còn một tuyên bố rộng mà sai thì đến lúc bị hỏi mới vỡ.
comment on table health.logs is
  'ADR-009 — y tế bán trú. NỘI DUNG (category, detail) chỉ đọc được qua health.read_logs(): mỗi lượt gọi ghi một dòng ops.audit_log, kể cả lượt bị từ chối. Đọc thẳng bảng chỉ thấy cột khung và vẫn bị RLS lọc theo core.can_see_health().';

comment on column health.logs.detail is
  'Nội dung y tế. `authenticated` KHÔNG có quyền SELECT trên cột này — đi qua health.read_logs() để lượt đọc được ghi audit.';
comment on column health.logs.category is
  'Loại ghi nhận (medication, ban_tru, di_ung…). Bản thân nó đã là dữ liệu y tế — thu quyền cột giống `detail`.';

commit;
