-- 0031_emotion_retention.sql
-- Thi hành LỜI HỨA CÔNG KHAI của §3/mệnh lệnh 4: chi tiết cảm xúc >12 tháng bị xoá,
-- chỉ giữ lại xu hướng tổng hợp. Trước migration này lời hứa đó chỉ tồn tại trong
-- comment ở 0004:74 và 0020:25 — không hàm, không job, không test nào thi hành nó.
--
-- Ba việc trong cùng một file vì cả ba cùng trả lời một câu hỏi: "hệ có tự nói thật
-- về thời gian không?"
--   1. attendance.rollup_mood_trends + attendance.purge_old_emotion_details
--      — xoá chi tiết, giữ xu hướng (Luật 91/2025 + §3).
--   2. ops.mark_source_fresh + trigger — ghi last_success_at cho ops.source_freshness.
--      0011 dựng bảng và view nhưng KHÔNG có một dòng code nào ghi cột đó, nên băng
--      vàng "nguồn quá hạn" bật vĩnh viễn kể cả khi mọi thứ đang chạy. Cảnh báo luôn
--      kêu = không ai còn tin nó, đúng ngược dấu điều 8 Rev F.
--   3. core.touch_updated_at — core.users.updated_at (0002:45) chưa bao giờ được cập
--      nhật, luôn bằng created_at. Rev F điều 7 ("mỗi lần refresh kiểm status") và mọi
--      đồng bộ tăng dần sau này sẽ im lặng cho kết quả sai nếu dựa vào cột này.
--
-- Không tạo bảng mới: mood_trends đã có sẵn từ 0004, chỉ thiếu đường ghi.

begin;

-- ---------------------------------------------------------------------------
-- 1. Xu hướng tổng hợp — chạy TRƯỚC khi xoá chi tiết
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: job chạy bằng vai máy chủ, nhưng để hàm không phụ thuộc vào
-- việc ai gọi (và để trigger/hàm khác gọi lại được) thì cố định quyền tại đây.
-- Postgres cấp EXECUTE cho PUBLIC theo mặc định — phải REVOKE, nếu không mọi tài
-- khoản đăng nhập đều gọi được hàm xoá dữ liệu (xem mục cuối file).
create or replace function attendance.rollup_mood_trends(p_month date)
returns integer
language plpgsql
security definer
set search_path = attendance, pg_catalog
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_n     integer;
begin
  insert into attendance.mood_trends as t (student_id, period_month, avg_mood, sample_count)
  select c.student_id,
         v_start,
         round(avg(c.mood)::numeric, 2),
         count(*)
    from attendance.checkins c
   where c.occurred_on >= v_start
     and c.occurred_on <  (v_start + interval '1 month')::date
     -- Lọc mood IS NOT NULL là điều kiện SỐNG CÒN của §9 ở đây: tháng đã bị xoá chi
     -- tiết sẽ không sinh nhóm nào, nên ON CONFLICT không chạy và dòng xu hướng cũ
     -- được giữ nguyên. Bỏ điều kiện này thì lần chạy thứ hai ghi đè avg_mood = NULL.
     and c.mood is not null
   group by c.student_id
  on conflict (student_id, period_month) do update
     set avg_mood     = excluded.avg_mood,
         sample_count = excluded.sample_count
   -- Chỉ ghi đè khi bản mới dựa trên SỐ MẪU không ít hơn bản đang có. Kịch bản thật:
   -- một bản ghi bù muộn rơi vào tháng đã xoá chi tiết -> tính lại avg trên đúng 1 mẫu
   -- -> xu hướng 20 mẫu của em bị thay bằng một con số vô nghĩa, không cách nào khôi phục.
   where excluded.sample_count >= t.sample_count;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function attendance.rollup_mood_trends(date) is
  '§3 — tổng hợp mood của MỘT tháng vào attendance.mood_trends. Idempotent: gọi lại cho cùng kết quả (§9).';

-- ---------------------------------------------------------------------------
-- 2. Xoá chi tiết cảm xúc quá hạn
-- ---------------------------------------------------------------------------
-- Mốc mặc định: 12 tháng. Mốc thật được LÀM TRÒN LÊN đầu tháng kế tiếp, hai lý do:
--   · chỉ xoá TRỌN tháng nên attendance.rollup_mood_trends() luôn chạy trên dữ liệu
--     đầy đủ của tháng đó và không bao giờ phải tính lại tháng đã cắt dở — nếu cắt
--     giữa tháng thì lần chạy sau sẽ tính lại trung bình trên phần còn sót và làm
--     hỏng chính con số đã tổng hợp;
--   · làm tròn LÊN (không phải xuống) nên chi tiết giữ lại luôn ≤ 12 tháng. Xoá sớm
--     vài ngày là giữ lời hứa, xoá muộn là vi phạm — chọn phía an toàn cho học sinh.
create or replace function attendance.purge_old_emotion_details(
  p_cutoff date default (current_date - interval '12 months')::date
)
returns jsonb
language plpgsql
security definer
set search_path = attendance, ops, pg_catalog
as $$
declare
  v_edge    date;
  v_run_id  bigint;
  v_month   date;
  v_months  integer := 0;
  v_rolled  integer := 0;
  v_moods   integer := 0;
  v_notes   integer := 0;
  v_metrics jsonb;
begin
  v_edge := date_trunc('month', p_cutoff)::date;
  if p_cutoff <> v_edge then
    v_edge := (v_edge + interval '1 month')::date;
  end if;

  -- Ghi sổ TRƯỚC khi làm: job chết giữa chừng vẫn để lại dòng 'running' để người
  -- trực nhìn thấy, thay vì im lặng như chưa từng chạy (Rev B/C điều 3).
  insert into ops.job_runs (job_name, as_of_date, status)
       values ('emotion_retention', v_edge, 'running')
    returning id into v_run_id;

  -- Chỉ duyệt tháng còn chi tiết thật -> lần chạy thứ hai không có tháng nào,
  -- toàn bộ hàm thành no-op (§9).
  for v_month in
    select distinct date_trunc('month', c.occurred_on)::date
      from attendance.checkins c
     where c.occurred_on < v_edge
       and c.mood is not null
     order by 1
  loop
    v_months := v_months + 1;
    v_rolled := v_rolled + attendance.rollup_mood_trends(v_month);
  end loop;

  update attendance.checkins
     set mood = null
   where occurred_on < v_edge
     and mood is not null;
  get diagnostics v_moods = row_count;

  -- 0020:25 mở rộng lời hứa sang nội dung "cần gặp thầy cô" mà không thêm gì để thi
  -- hành. Xoá topic/urgency/note, GIỮ dòng yêu cầu: việc em từng cần giúp là dữ kiện
  -- vận hành (đếm tín hiệu E), nội dung tâm sự mới là thứ phải quên.
  update attendance.help_requests
     set note = null, topic = null, urgency = null
   where requested_on < v_edge
     and (note is not null or topic is not null or urgency is not null);
  get diagnostics v_notes = row_count;

  v_metrics := jsonb_build_object(
    'cutoff_in',             p_cutoff,
    'cutoff_applied',        v_edge,
    'months_rolled_up',      v_months,
    'mood_trend_rows',       v_rolled,
    'checkins_cleared',      v_moods,
    'help_requests_cleared', v_notes
  );

  update ops.job_runs
     set status      = 'success',
         finished_at = now(),
         metrics     = v_metrics
   where id = v_run_id;

  return v_metrics;
end;
$$;

comment on function attendance.purge_old_emotion_details(date) is
  '§3/mệnh lệnh 4 — xoá chi tiết cảm xúc quá 12 tháng sau khi đã tổng hợp xu hướng. Chạy lại là no-op (§9). Ghi ops.job_runs job_name=emotion_retention.';

-- ---------------------------------------------------------------------------
-- 3. Độ tươi nguồn dữ liệu — ai ghi last_success_at
-- ---------------------------------------------------------------------------
-- Bảng ops.source_freshness bật RLS và KHÔNG có policy ghi cho authenticated (0011),
-- nên hàm này phải SECURITY DEFINER: học sinh check-in bằng vai `authenticated` vẫn
-- phải làm nguồn 'attendance' tươi lại.
--
-- Cửa sổ 5 phút: một lần check-in là một lần UPDATE cùng một dòng. Ở 300.000
-- request/ngày, viết lại dòng đó mỗi lần là điểm nóng vô ích — hạn tươi của
-- 'attendance' là 26 giờ nên sai số 5 phút không đổi kết luận nào.
create or replace function ops.mark_source_fresh(p_source text)
returns void
language plpgsql
security definer
set search_path = ops, pg_catalog
as $$
begin
  update ops.source_freshness
     set last_success_at = now(),
         updated_at      = now()
   where source = p_source
     and (last_success_at is null or last_success_at < now() - interval '5 minutes');
end;
$$;

comment on function ops.mark_source_fresh(text) is
  'ADR-016 — đánh dấu một nguồn tín hiệu vừa nhận dữ liệu thật. Không ghi lại nếu vừa ghi <5 phút trước.';

create or replace function ops.tg_mark_source_fresh()
returns trigger
language plpgsql
security definer
set search_path = ops, pg_catalog
as $$
begin
  -- Trigger mức CÂU LỆNH vẫn nổ khi câu lệnh không chèn dòng nào (INSERT ... ON
  -- CONFLICT DO NOTHING chẳng hạn). Bảng chuyển tiếp `inserted` là cách duy nhất
  -- phân biệt "có dữ liệu mới" với "vừa có ai đó thử ghi" — đúng tinh thần điều 8
  -- Rev F: không suy tin tốt từ một câu lệnh rỗng.
  if exists (select 1 from inserted) then
    perform ops.mark_source_fresh(tg_argv[0]);
  end if;
  return null;
end;
$$;

-- Chỉ gắn vào INSERT, CỐ Ý không gắn vào UPDATE: GVCN xác nhận gửi muộn hay job
-- retention xoá mood đều là UPDATE trên attendance.checkins nhưng KHÔNG phải dữ liệu
-- mới từ nguồn — tính chúng là "tươi" thì băng vàng sẽ tắt nhờ chính việc dọn dẹp.
drop trigger if exists checkins_mark_source_fresh on attendance.checkins;
create trigger checkins_mark_source_fresh
  after insert on attendance.checkins
  referencing new table as inserted
  for each statement
  execute function ops.tg_mark_source_fresh('attendance');

-- Nguồn 'evidence' gắn vào bảng đích thay vì vào core.promote_embedded_event():
-- promote() không phải đường ghi duy nhất vào dear_logs, và đặt ở bảng thì mọi
-- đường ghi hiện tại lẫn tương lai đều được tính, không phải nhớ sửa từng hàm.
drop trigger if exists dear_logs_mark_source_fresh on evidence.dear_logs;
create trigger dear_logs_mark_source_fresh
  after insert on evidence.dear_logs
  referencing new table as inserted
  for each statement
  execute function ops.tg_mark_source_fresh('evidence');

-- Nạp bù một lần cho dữ liệu đã có TRƯỚC khi có trigger. Không đặt now(): mốc tươi
-- phải là thời điểm dòng dữ liệu gần nhất thật sự đến, nếu không thì ngay sau khi
-- deploy băng vàng tắt hết trong khi connector có thể đã chết từ tuần trước — đúng
-- kiểu "im lặng = đang ổn" mà ADR-016 cấm. GREATEST bỏ qua NULL nên lần chạy lại
-- không hạ mốc đã có.
update ops.source_freshness s
   set last_success_at = greatest(s.last_success_at, x.ts),
       updated_at      = now()
  from (select max(created_at) as ts from attendance.checkins) x
 where s.source = 'attendance' and x.ts is not null;

update ops.source_freshness s
   set last_success_at = greatest(s.last_success_at, x.ts),
       updated_at      = now()
  from (select max(created_at) as ts from evidence.dear_logs) x
 where s.source = 'evidence' and x.ts is not null;

-- ---------------------------------------------------------------------------
-- 4. core.users.updated_at phải nói thật
-- ---------------------------------------------------------------------------
create or replace function core.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- `new is distinct from old`: UPDATE không đổi gì (rất phổ biến với upsert) thì
  -- không dời mốc thời gian — nếu không, mọi lần ghi vô hại đều làm cột này vô nghĩa
  -- với bên đọc theo kiểu "có gì đổi từ lần đồng bộ trước".
  if new is distinct from old then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

comment on function core.touch_updated_at() is
  'Trigger dùng chung: đặt updated_at = now() khi hàng thực sự đổi. Gắn cho bảng nào thì bảng đó phải có cột updated_at.';

drop trigger if exists users_touch_updated_at on core.users;
create trigger users_touch_updated_at
  before update on core.users
  for each row
  execute function core.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Quyền: hàm ghi/xoá KHÔNG được để mặc định PUBLIC
-- ---------------------------------------------------------------------------
-- Postgres cấp EXECUTE cho PUBLIC với mọi hàm mới. Ba hàm dưới đây đều SECURITY
-- DEFINER và đều ghi/xoá: để nguyên mặc định thì bất kỳ tài khoản học sinh nào cũng
-- gọi được `attendance.purge_old_emotion_details('2100-01-01')` và xoá sạch dữ liệu
-- cảm xúc toàn hệ. Đây là cùng loại lỗi mà 0028 đã bịt cho promote().
revoke execute on function attendance.rollup_mood_trends(date)       from public;
revoke execute on function attendance.purge_old_emotion_details(date) from public;
revoke execute on function ops.mark_source_fresh(text)               from public;
-- ops.tg_mark_source_fresh() trả `trigger` nên không gọi trực tiếp được bằng SQL.

commit;
