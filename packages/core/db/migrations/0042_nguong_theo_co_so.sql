-- 0042_nguong_theo_co_so.sql
-- `care.v_signal_emotion` đọc ngưỡng E_MOOD THEO TỪNG CƠ SỞ, hết lệch tầng với app.
--
-- ── Cái sai đang chạy, đo được 01/08/2026 ──────────────────────────────────
-- `0026` dựng `care.resolve_threshold(rule_code, school_id)` và đổi khoá của
-- `care.thresholds` thành `(rule_code, school_id)` — cả hai việc chỉ có một mục
-- đích: cho phép "mỗi cơ sở một ngưỡng riêng, cơ sở chưa khai thì dùng số chung".
-- `02-database.md` in đúng lời hứa đó, hồ sơ HTML in đúng lời hứa đó.
--
-- Nhưng cùng file `0026`, ở khối `create view care.v_signal_emotion` (khoảng dòng
-- 225), lời gọi lại là:
--
--     care.resolve_threshold('E_MOOD')          -- thiếu tham số thứ hai
--
-- Thiếu `p_school_id` thì tham số mặc định `null` được dùng, mà thân hàm là
-- `where (t.school_id = p_school_id or t.school_id is null)` — `t.school_id = null`
-- không bao giờ đúng, nên nhánh "dòng riêng của cơ sở" bị loại sạch và view LUÔN
-- lấy dòng toàn hệ. Trong khi tầng ứng dụng (`apps/hub/server/care-thresholds.ts`)
-- gọi CÓ `school_id`. Hai tầng hỏi cùng một câu và nhận hai câu trả lời khác nhau.
--
-- Vì sao hôm nay chưa ai thấy: đo trên hub_dev 01/08/2026, cả 6 dòng
-- `care.thresholds` đều `school_id is null` — nên hai đường đang trùng nhau NGẪU
-- NHIÊN. Ngày đầu tiên có người khai một dòng riêng cho một cơ sở (đúng thứ `0026`
-- sinh ra để làm được) là ngày buồng lái và bộ quét cờ tính bằng hai con số khác
-- nhau, và KHÔNG có lỗi nào được ném: cả hai đều trả số, chỉ là số khác nhau.
-- Đúng loại hỏng im lặng mà kho này cấm — người khai ngưỡng tưởng mình vừa đổi
-- hành vi hệ thống, trong khi chỉ đổi được một nửa.
--
-- ── Vì sao sửa ở đây chứ không sửa `0026` ───────────────────────────────────
-- `0026` đã chạy thật trên hub_dev và trên mọi database dựng từ đầu; §2 cấm sửa
-- migration đã áp. Migration mới là đường duy nhất.
--
-- ── Khuôn mẫu ──────────────────────────────────────────────────────────────
-- Chép đúng khuôn `0039` đã dùng cho `care.v_signal_attendance` /
-- `care.v_signal_behavior`: `cross join lateral` theo `s.school_id` của chính em,
-- `coalesce(..., <mặc định>)` để bảng ngưỡng thiếu dòng thì view vẫn trả số chứ
-- không trả rỗng (rỗng ở đây nguy hiểm hơn sai: rỗng trông y hệt "cả lớp đều ổn").
-- Ba view tín hiệu từ nay hỏi ngưỡng theo cùng một cách — không còn view nào hỏi
-- kiểu riêng.
--
-- Cột và kiểu giữ nguyên từng nét (`student_id`, `negative_days`,
-- `negative_streak`, `help_requested`, `last_checkin_on`, `last_help_on`) nên
-- `create or replace` chạy được và `care.run_flag_engine` không phải sửa một chữ.
--
-- Phụ thuộc: 0026 (resolve_threshold + v_signal_emotion), 0039 (khuôn cross join
-- lateral), 0002 (core.students.school_id).

begin;

-- `cfg` nay là MỘT DÒNG MỖI EM, không còn là một dòng cho cả trường.
-- `bad_mood_max` phải đi kèm từng dòng `mood_days` (chứ không nhân chéo ở
-- `mood_agg` như bản cũ), nếu không mỗi em lại bị so với ngưỡng của mọi cơ sở.
create or replace view care.v_signal_emotion as
with cfg as (
  select s.id                                            as student_id,
         coalesce((th.params ->> 'window_days')::int, 14) as window_days,
         coalesce((th.params ->> 'bad_mood_max')::int, 2) as bad_mood_max
    from core.students s
    cross join lateral (
      select care.resolve_threshold('E_MOOD', s.school_id) as params
    ) th
),
who as (
  select c.student_id
    from attendance.checkins c
    join cfg on cfg.student_id = c.student_id
   where c.occurred_on >= current_date - cfg.window_days
  union
  select h.student_id
    from attendance.help_requests h
    join cfg on cfg.student_id = h.student_id
   where h.requested_on >= current_date - cfg.window_days
),
mood_days as (
  select c.student_id, c.occurred_on, c.mood, cfg.bad_mood_max,
         row_number() over (partition by c.student_id order by c.occurred_on desc) as rn
    from attendance.checkins c
    join cfg on cfg.student_id = c.student_id
   where c.occurred_on >= current_date - cfg.window_days
     and c.kind = 'in'
     and c.mood is not null
),
mood_agg as (
  select md.student_id,
         count(*) filter (where md.mood <= md.bad_mood_max)                          as negative_days,
         -- Giữ nguyên cách tính chuỗi của 0026: hàng đầu tiên (tính lùi từ lần
         -- check-in gần nhất) có mood TỐT nằm ở vị trí rn = k ⇒ chuỗi xấu dài đúng
         -- k-1. Không có hàng tốt nào ⇒ cả cửa sổ đều xấu.
         coalesce(min(md.rn) filter (where md.mood > md.bad_mood_max) - 1, count(*)) as negative_streak,
         max(md.occurred_on)                                                         as last_checkin_on
    from mood_days md
   group by md.student_id
),
help_agg as (
  select h.student_id,
         bool_or(h.handled_at is null) as help_open,
         max(h.requested_on)           as last_help_on
    from attendance.help_requests h
    join cfg on cfg.student_id = h.student_id
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
  'Luật "cờ E gọn": view trả SỐ ĐẾM tín hiệu, không trả nội dung. Từ 0026 tập học sinh là HỢP của check-in và help_request. Từ 0042 cửa sổ nhìn lại VÀ ngưỡng mood xấu đọc theo ĐÚNG CƠ SỞ của em (care.resolve_threshold(''E_MOOD'', s.school_id)) — trước đó gọi thiếu school_id nên luôn lấy dòng toàn hệ, lệch với tầng ứng dụng vốn gọi có.';

-- `create or replace view` giữ reloptions, nhưng đặt lại tường minh để không phụ
-- thuộc một chi tiết dễ đổi giữa các bản Postgres (cùng lý do 0039 đã ghi).
-- Lưu ý người đọc sau: view này CHƯA TỪNG được grant cho `authenticated` — nó là
-- đường của bộ quét cờ (chạy vai `postgres`), không phải đường của người dùng.
-- Việc nó nay join thêm `core.students` vì thế không mở thêm quyền cho ai.
alter view care.v_signal_emotion set (security_invoker = true);

commit;
