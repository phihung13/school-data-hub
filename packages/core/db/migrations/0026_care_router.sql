-- 0026_care_router.sql
-- Nền dữ liệu cho router `care` viết lại (apps/hub/server/routers/care.ts).
--
-- Sáu việc, cùng trả lời một câu hỏi: "buồng lái GVCN có nói đúng sự thật không?"
--
--   1. care.rules + care.thresholds đổi khoá  — ngưỡng khai được theo từng cơ sở
--      (cột school_id có từ 0005 kèm comment "NULL = áp dụng toàn hệ", nhưng PK chỉ
--      là rule_code nên hệ 6 cơ sở KHÔNG bao giờ khai được dòng thứ hai. Cột đó là
--      lời hứa suông suốt từ 27/07).
--   2. E_MOOD khai được CẢ HAI cách đếm       — quyết định nghiệp vụ 31/07/2026 của
--      chủ đầu tư: cờ bật khi 5 ngày mood xấu LIÊN TIẾP (streak thật). Nhưng bảng
--      phải khai được cả kiểu "N ngày bất kỳ trong cửa sổ" để lần sau đổi cách đếm
--      chỉ là một câu UPDATE, không phải một lần deploy (mệnh lệnh 7).
--   3. care.interventions.client_mutation_id  — §9: bấm hai lần / retry mạng ra một dòng.
--   4. care.care_cases đóng được               — 03-api.md yêu cầu `closeCase`; chưa có
--      grant/policy UPDATE nào nên cờ chỉ mở ra chứ không tắt đi được.
--   5. attendance.help_requests đánh dấu đã xử — cột handled_by/handled_at có từ 0004,
--      chưa đường ghi nào chạm. Cờ khẩn vì thế nằm lại buồng lái tới khi hết cửa sổ.
--   6. care.v_signal_emotion nối lại tín hiệu khẩn bị nuốt — xem mục 6.
--
-- Không đụng tới số lượng dòng ngưỡng đang có (0005 test khẳng định đúng 6 rule đang
-- bật): mọi tham số mới đi VÀO trong `params` của dòng sẵn có, không thêm rule_code mới.

begin;

-- ---------------------------------------------------------------------------
-- 1. Sổ đăng ký mã luật, tách khỏi bảng ngưỡng
-- ---------------------------------------------------------------------------
-- care.flags.rule_code đang FK thẳng vào care.thresholds(rule_code) (0005:53), nên
-- chừng nào rule_code còn là khoá chính của bảng ngưỡng thì mỗi luật chỉ được có ĐÚNG
-- MỘT dòng — tức không bao giờ có ngưỡng riêng cho cơ sở Quận 7. Tách danh mục mã luật
-- ra bảng riêng (đúng khuôn core.roles ↔ core.user_role_scopes đã dùng ở 0003) rồi cho
-- cả hai bảng cùng tham chiếu vào đó: vẫn giữ nguyên ràng buộc "không có cờ mang mã lạ".
create table if not exists care.rules (
  rule_code   text primary key,
  description text
);
comment on table care.rules is
  'Danh mục mã luật cờ. Tách khỏi care.thresholds (0026) để một luật có nhiều dòng ngưỡng theo cơ sở.';

insert into care.rules (rule_code, description) values
  ('A_ATTENDANCE', 'Cờ A — chuyên cần'),
  ('B_BEHAVIOR',   'Cờ B — hành vi/giá trị'),
  ('C_MASTERY',    'Cờ C — mức thành thạo'),
  ('C_CEFR',       'Cờ C — lộ trình CEFR'),
  ('E_MOOD',       'Cờ E — cảm xúc theo chuỗi ngày mood xấu'),
  ('E_URGENT',     'Cờ E khẩn — em bấm "cần gặp thầy cô"')
on conflict (rule_code) do nothing;

alter table care.flags drop constraint if exists flags_rule_code_fkey;
alter table care.flags
  add constraint flags_rule_code_fkey foreign key (rule_code) references care.rules(rule_code);

-- Mọi `add constraint` đều có `drop … if exists` đi trước: chạy lại migration trên một
-- CSDL đã áp dụng nó (restore drill, dev nghịch tay) phải im lặng thành công, không nổ.
alter table care.thresholds drop constraint if exists thresholds_pkey cascade;
alter table care.thresholds add column if not exists id uuid not null default gen_random_uuid();
alter table care.thresholds add constraint thresholds_pkey primary key (id);

alter table care.thresholds drop constraint if exists thresholds_rule_fkey;
alter table care.thresholds
  add constraint thresholds_rule_fkey foreign key (rule_code) references care.rules(rule_code);

-- `nulls not distinct`: hai dòng cùng rule_code cùng school_id = NULL phải va nhau,
-- nếu không thì "ngưỡng toàn hệ" âm thầm có hai bản và không ai biết bản nào đang chạy.
alter table care.thresholds drop constraint if exists thresholds_rule_school_uq;
alter table care.thresholds
  add constraint thresholds_rule_school_uq unique nulls not distinct (rule_code, school_id);

comment on column care.thresholds.school_id is
  'NULL = áp dụng toàn hệ. Từ 0026 lời hứa này thi hành được thật: khoá là (rule_code, school_id).';

-- RLS + quyền cho bảng mới: 0009 cấp `select on all tables in schema care` TẠI THỜI ĐIỂM
-- ĐÓ, bảng sinh sau không được hưởng. Quên chỗ này là buồng lái nhận "permission denied".
alter table care.rules enable row level security;
drop policy if exists rules_read on care.rules;
create policy rules_read on care.rules for select to authenticated using (true);
grant select on care.rules to authenticated;
grant select on care.rules to backup_reader;   -- ADR-006: bản sao lưu phải đủ, không thủng bảng

-- Ngưỡng đang áp dụng cho một cơ sở: dòng riêng của cơ sở thắng dòng toàn hệ.
create or replace function care.resolve_threshold(p_rule_code text, p_school_id uuid default null)
returns jsonb
language sql
stable
as $$
  select t.params
    from care.thresholds t
   where t.rule_code = p_rule_code
     and t.active
     and (t.school_id = p_school_id or t.school_id is null)
   -- false sắp trước true: dòng có school_id (riêng) đứng trên dòng NULL (toàn hệ).
   order by (t.school_id is null)
   limit 1;
$$;
comment on function care.resolve_threshold(text, uuid) is
  '§6 — một cửa duy nhất để hỏi "ngưỡng đang áp dụng cho cơ sở này là bao nhiêu". Engine và router KHÔNG tự viết câu select riêng.';

-- ---------------------------------------------------------------------------
-- 2. E_MOOD: khai được cả hai cách đếm, mặc định là chuỗi liên tiếp
-- ---------------------------------------------------------------------------
-- Quyết định chủ đầu tư 31/07/2026: cờ E_MOOD = 5 ngày mood xấu LIÊN TIẾP.
-- Trước đó code chạy `>= 3 ngày bất kỳ trong 14 ngày` còn bảng ghi 5 — hai con số
-- khác nhau cùng tồn tại, và người sửa bảng tưởng mình vừa đổi hành vi hệ thống.
--
--   mode = 'streak' → đếm chuỗi LIÊN TIẾP (mặc định, đúng quyết định đã chốt)
--   mode = 'window' → đếm SỐ NGÀY bất kỳ trong cửa sổ
--
-- Đổi cách đếm sau này = một câu UPDATE trên bảng này, KHÔNG phải một lần deploy.
update care.thresholds
   set params = params
              || '{"mode": "streak", "window_days": 14, "bad_mood_max": 2, "quiet_days": 7}'::jsonb,
       updated_at = now()
 where rule_code = 'E_MOOD';

comment on table care.thresholds is
  '§6 — đổi ngưỡng KHÔNG cần deploy. Mọi lần đổi có audit (0008). E_MOOD.mode chọn cách đếm: streak (liên tiếp) | window (trong cửa sổ).';

-- E_URGENT: cửa sổ nhìn lại của tín hiệu "cần gặp thầy cô". Trước đây router lấy tạm
-- cửa sổ của E_MOOD — hai loại tín hiệu khác hẳn nhau mà dùng chung một con số.
update care.thresholds
   set params = params || '{"window_days": 14}'::jsonb,
       updated_at = now()
 where rule_code = 'E_URGENT';

-- ---------------------------------------------------------------------------
-- 3. §9 — ghi can thiệp hai lần chỉ ra một dòng
-- ---------------------------------------------------------------------------
-- care.interventions (0005:73) không có khoá duy nhất nào ngoài PK uuid, mà mỗi dòng ở
-- đây RESET đồng hồ leo thang 7 ngày (comment 0005:81). Double-tap nút "Ghi can thiệp"
-- vì thế không chỉ nhân đôi nhật ký, nó còn làm sai cơ chế leo thang.
alter table care.interventions add column if not exists client_mutation_id uuid;
comment on column care.interventions.client_mutation_id is
  '§9 — mã do client sinh MỘT LẦN mỗi lần mở form. Gửi lại cùng mã = cùng một hành động, không phải hành động thứ hai.';

create unique index if not exists interventions_client_mutation_uq
  on care.interventions (case_id, client_mutation_id)
  where client_mutation_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Đóng hồ sơ chăm sóc
-- ---------------------------------------------------------------------------
-- 0014 chỉ mở đường INSERT cho care_cases: cờ mở ra được nhưng không tắt đi được, nên
-- buồng lái đầy cờ chết rồi GVCN học cách phớt lờ nó — hỏng nặng hơn là không có cờ.
grant update (status, closed_at) on care.care_cases to authenticated;

drop policy if exists care_cases_close_scope on care.care_cases;
create policy care_cases_close_scope on care.care_cases for update to authenticated
  using (core.can_see_care(student_id) and status = 'open')
  with check (core.can_see_care(student_id) and status = 'closed');
comment on policy care_cases_close_scope on care.care_cases is
  'Chỉ một chiều: open → closed. WITH CHECK ép status mới là closed nên không ai mượn đường này để mở lại hay đổi chủ hồ sơ.';

-- ---------------------------------------------------------------------------
-- 5. Đánh dấu đã xử lý yêu cầu "cần gặp thầy cô"
-- ---------------------------------------------------------------------------
-- Cùng loại lỗ với 0025: 0020 cấp `update` TOÀN BỘ cột cho authenticated, mà policy
-- help_requests_update_self cho em tự sửa dòng của mình khi handled_at is null. Ghép lại:
-- một em tự ghi handled_at cho chính mình là tín hiệu khẩn của em BIẾN MẤT khỏi buồng lái
-- GVCN. Thu cột + gác bằng trigger, đúng khuôn 0025.
revoke update on attendance.help_requests from authenticated;
grant update (topic, urgency, note, requested_at, handled_by, handled_at)
  on attendance.help_requests to authenticated;

create or replace function attendance.guard_help_request_handling()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.handled_at is distinct from old.handled_at
     or new.handled_by is distinct from old.handled_by then
    -- "Đã xử lý" là lời khai của NGƯỜI LỚN trong phạm vi chăm sóc (GVCN hoặc tâm lý cụm).
    if not core.can_see_care(old.student_id) then
      return null;   -- bỏ qua hàng, 0 dòng, không ném lỗi (xem lý do ở 0025)
    end if;
  end if;

  return new;
end;
$$;
comment on function attendance.guard_help_request_handling() is
  'Chỉ người trong phạm vi care mới đóng được tín hiệu khẩn. Học sinh KHÔNG tự tắt được yêu cầu của chính mình.';

drop trigger if exists help_requests_guard_handling on attendance.help_requests;
create trigger help_requests_guard_handling
  before update on attendance.help_requests
  for each row
  execute function attendance.guard_help_request_handling();

drop policy if exists help_requests_handle_care on attendance.help_requests;
create policy help_requests_handle_care on attendance.help_requests for update to authenticated
  using (core.can_see_care(student_id) and handled_at is null)
  with check (core.can_see_care(student_id));
comment on policy help_requests_handle_care on attendance.help_requests is
  'GVCN/tâm lý cụm bấm "đã gặp em rồi". USING lọc handled_at is null nên gọi lại lần hai là 0 dòng — idempotent tự nhiên (§9).';

-- ---------------------------------------------------------------------------
-- 6. Tín hiệu khẩn không còn bị nuốt
-- ---------------------------------------------------------------------------
-- Bản cũ (0009:311) lấy attendance.checkins làm GỐC rồi LEFT JOIN help_requests theo
-- `h.requested_on = c.occurred_on`. Hệ quả: em nghỉ ốm, hoặc chỉ quên check-in sáng, rồi
-- buổi chiều bấm "cần gặp thầy cô" thì KHÔNG có hàng checkin nào để nối — tín hiệu khẩn
-- rơi vào hư không. Mà `checkin.requestHelp` ghi bằng current_date hoàn toàn độc lập với
-- việc đã check-in hay chưa, và trang /can-gap-thay-co vào thẳng được.
--
-- Bản mới: tập học sinh = HỢP của hai nguồn tín hiệu, không nguồn nào làm gốc cho nguồn kia.
-- Thêm cột negative_streak (chuỗi LIÊN TIẾP) bên cạnh negative_days (đếm trong cửa sổ) —
-- giữ cả hai để đổi `mode` trong bảng ngưỡng không phải sửa view.
--
-- Định nghĩa "liên tiếp" đã chốt: liên tiếp theo NGÀY CÓ CHECK-IN, không theo ngày lịch.
-- Thứ Bảy/Chủ nhật và ngày nghỉ ốm không làm đứt chuỗi, vì trường không có check-in vào
-- những ngày đó — đếm theo ngày lịch thì chuỗi đứt mỗi cuối tuần và cờ 5 ngày không bao
-- giờ bật được.
-- DROP rồi CREATE chứ không CREATE OR REPLACE: view mới chèn thêm cột negative_streak
-- vào giữa, mà REPLACE chỉ cho phép thêm cột ở CUỐI. Không có object nào phụ thuộc view
-- này (grep toàn repo 31/07/2026: chỉ flag engine tương lai đọc, chưa có code) và view
-- chưa từng được GRANT cho vai nào — bỏ đi rồi dựng lại không mất quyền của ai.
drop view if exists care.v_signal_emotion;

create view care.v_signal_emotion as
with cfg as (
  select coalesce((care.resolve_threshold('E_MOOD') ->> 'window_days')::int, 14)  as window_days,
         coalesce((care.resolve_threshold('E_MOOD') ->> 'bad_mood_max')::int, 2)  as bad_mood_max
),
who as (
  select c.student_id from attendance.checkins c, cfg
   where c.occurred_on >= current_date - cfg.window_days
  union
  select h.student_id from attendance.help_requests h, cfg
   where h.requested_on >= current_date - cfg.window_days
),
mood_days as (
  select c.student_id, c.occurred_on, c.mood,
         row_number() over (partition by c.student_id order by c.occurred_on desc) as rn
    from attendance.checkins c, cfg
   where c.occurred_on >= current_date - cfg.window_days
     and c.kind = 'in'
     and c.mood is not null
),
mood_agg as (
  select md.student_id,
         count(*) filter (where md.mood <= cfg.bad_mood_max)                       as negative_days,
         -- Hàng đầu tiên (tính lùi từ lần check-in gần nhất) có mood TỐT nằm ở vị trí
         -- rn = k ⇒ chuỗi xấu dài đúng k-1. Không có hàng tốt nào ⇒ cả cửa sổ đều xấu.
         coalesce(min(md.rn) filter (where md.mood > cfg.bad_mood_max) - 1, count(*)) as negative_streak,
         max(md.occurred_on)                                                       as last_checkin_on
    from mood_days md, cfg
   group by md.student_id
),
help_agg as (
  select h.student_id,
         bool_or(h.handled_at is null) as help_open,
         max(h.requested_on)           as last_help_on
    from attendance.help_requests h, cfg
   where h.requested_on >= current_date - cfg.window_days
   group by h.student_id
)
select w.student_id,
       coalesce(m.negative_days, 0)     as negative_days,
       coalesce(m.negative_streak, 0)   as negative_streak,
       coalesce(hp.help_open, false)    as help_requested,
       m.last_checkin_on,
       hp.last_help_on
  from who w
  left join mood_agg m  on m.student_id = w.student_id
  left join help_agg hp on hp.student_id = w.student_id;

comment on view care.v_signal_emotion is
  'Luật "cờ E gọn": view trả SỐ ĐẾM tín hiệu, không trả nội dung. Từ 0026 tập học sinh là HỢP của check-in và help_request — em không check-in mà bấm "cần gặp thầy cô" vẫn hiện.';

-- 0024 đã đặt security_invoker cho view này (để RLS của người gọi có hiệu lực thay vì
-- chạy bằng quyền chủ sở hữu). CREATE OR REPLACE giữ reloptions, nhưng đặt lại tường
-- minh ở đây để không phụ thuộc vào một chi tiết dễ đổi giữa các bản Postgres.
alter view care.v_signal_emotion set (security_invoker = true);

commit;
