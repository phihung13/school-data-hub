-- pgTAP — ngưỡng E_MOOD đọc THEO CƠ SỞ trong care.v_signal_emotion (0042)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0042_nguong_theo_co_so_test.sql
--
-- `0026` dựng `care.resolve_threshold(rule_code, school_id)` và đổi khoá của
-- `care.thresholds` thành `(rule_code, school_id)` để lời hứa "mỗi cơ sở một
-- ngưỡng riêng" dùng được thật. Cùng file đó, `care.v_signal_emotion` lại gọi
-- `care.resolve_threshold('E_MOOD')` — THIẾU tham số thứ hai, nên nhánh "dòng
-- riêng của cơ sở" bị loại sạch và view luôn lấy dòng toàn hệ. Tầng ứng dụng
-- (`apps/hub/server/care-thresholds.ts`) thì gọi CÓ. Hai tầng, hai con số.
--
-- Hôm nay chưa lộ vì cả 6 dòng `care.thresholds` đều `school_id is null` — hai
-- đường trùng nhau NGẪU NHIÊN. Bài test này vì thế phải TỰ KHAI một dòng riêng
-- cho một cơ sở rồi khẳng định view đổi theo. Không có bước khai đó thì bài test
-- không chứng minh được gì: nó sẽ xanh y hệt trên cả bản cũ lẫn bản mới.
--
-- Bố cục: mỗi tham số được chứng minh RIÊNG (cửa sổ trước, ngưỡng mood sau), và
-- mỗi lần đều có một em ở CƠ SỞ KHÁC làm đối chứng — nếu view lấy nhầm dòng riêng
-- của Q2 áp cho cả trường thì đối chứng đỏ.

begin;
select plan(11);
select test_support.seed_basic();

-- Cường (…0003) ở cơ sở Q2, KHÔNG ghi danh lớp nào — cố ý: `care.v_signal_emotion`
-- lấy tập học sinh từ chính bảng check-in, không đi qua `core.enrollments`, nên em
-- này đồng thời canh luôn việc join thêm `core.students` không làm rơi ai.
-- Minh (…0001) ở Q7 làm đối chứng.
--
-- mood: 3 là "tốt" dưới ngưỡng toàn hệ (bad_mood_max = 2), 1 là "xấu".
-- Ngày -20 nằm NGOÀI cửa sổ toàn hệ (window_days = 14).
insert into attendance.checkins (student_id, occurred_on, kind, mood, status) values
  ('70000000-0000-0000-0000-000000000003', current_date,      'in', 3, 'present'),
  ('70000000-0000-0000-0000-000000000003', current_date - 1,  'in', 3, 'present'),
  ('70000000-0000-0000-0000-000000000003', current_date - 20, 'in', 1, 'present'),
  ('70000000-0000-0000-0000-000000000001', current_date,      'in', 3, 'present'),
  ('70000000-0000-0000-0000-000000000001', current_date - 20, 'in', 1, 'present');

-- ═══ 0. ĐỐI CHỨNG: hàm vốn đã đúng, lỗi nằm ở LỜI GỌI ══════════════════════
-- Ghi hai assertion này trước khi khai gì thêm, để không ai đọc bài test rồi kết
-- luận nhầm là `care.resolve_threshold` hỏng.
select is(
  (care.resolve_threshold('E_MOOD') ->> 'window_days'),
  '14',
  'Gọi resolve_threshold KHÔNG truyền school_id → dòng toàn hệ (14 ngày). Đây đúng là hình dạng của lỗi cũ trong 0026');

select is(
  (care.resolve_threshold('E_MOOD', '20000000-0000-0000-0000-000000000002') ->> 'window_days'),
  '14',
  'Cơ sở CHƯA khai dòng riêng thì rơi về dòng toàn hệ — nhánh dự phòng phải còn nguyên sau 0042');

-- ═══ 1. TRẠNG THÁI NỀN: chỉ có ngưỡng toàn hệ ══════════════════════════════
select is(
  (select negative_days::int from care.v_signal_emotion
    where student_id = '70000000-0000-0000-0000-000000000003'),
  0,
  'Cường (Q2): 0 ngày xấu — ngày mood=1 nằm ngoài cửa sổ 14 ngày của dòng toàn hệ');

select is(
  (select negative_days::int from care.v_signal_emotion
    where student_id = '70000000-0000-0000-0000-000000000001'),
  0,
  'Minh (Q7): 0 ngày xấu — cùng dữ liệu, cùng ngưỡng, làm mốc so cho hai bước sau');

-- ═══ 2. CỬA SỔ theo cơ sở ══════════════════════════════════════════════════
-- Khai đúng MỘT dòng riêng cho Q2, đổi mỗi `window_days`. `bad_mood_max` giữ y
-- nguyên số toàn hệ để bước này chỉ chứng minh MỘT điều.
insert into care.thresholds (rule_code, school_id, params, active) values
  ('E_MOOD', '20000000-0000-0000-0000-000000000002',
   '{"mode": "streak", "window_days": 30, "bad_mood_max": 2, "negative_days_streak": 5}'::jsonb, true);

select is(
  (care.resolve_threshold('E_MOOD', '20000000-0000-0000-0000-000000000002') ->> 'window_days'),
  '30',
  'Khai xong: dòng riêng của Q2 THẮNG dòng toàn hệ (0026 làm đúng phần của nó)');

select is(
  (select negative_days::int from care.v_signal_emotion
    where student_id = '70000000-0000-0000-0000-000000000003'),
  1,
  'Cường (Q2): cửa sổ nới lên 30 ngày ⇒ ngày mood=1 cách đây 20 ngày ĐƯỢC ĐẾM. Trước 0042 con số này vẫn là 0 vì view gọi thiếu school_id');

select is(
  (select negative_days::int from care.v_signal_emotion
    where student_id = '70000000-0000-0000-0000-000000000001'),
  0,
  'Minh (Q7) KHÔNG bị lây cửa sổ của Q2 — ngưỡng riêng phải riêng theo đúng nghĩa');

-- ═══ 3. NGƯỠNG MOOD XẤU theo cơ sở ═════════════════════════════════════════
-- Đổi tiếp `bad_mood_max` của Q2 lên 3: hai ngày mood=3 từ "tốt" thành "xấu".
update care.thresholds
   set params = '{"mode": "streak", "window_days": 30, "bad_mood_max": 3, "negative_days_streak": 5}'::jsonb
 where rule_code = 'E_MOOD' and school_id = '20000000-0000-0000-0000-000000000002';

select is(
  (select negative_days::int from care.v_signal_emotion
    where student_id = '70000000-0000-0000-0000-000000000003'),
  3,
  'Cường (Q2): bad_mood_max nâng lên 3 ⇒ cả ba ngày thành ngày xấu. bad_mood_max phải đi theo TỪNG EM, không nhân chéo một ngưỡng cho cả bảng');

select is(
  (select negative_streak::int from care.v_signal_emotion
    where student_id = '70000000-0000-0000-0000-000000000003'),
  3,
  'negative_streak cũng tính bằng ngưỡng của Q2 — không còn ngày "tốt" nào cắt chuỗi nên chuỗi dài đúng 3');

select is(
  (select negative_days::int from care.v_signal_emotion
    where student_id = '70000000-0000-0000-0000-000000000001'),
  0,
  'Minh (Q7) vẫn 0 sau cả hai lần đổi — đối chứng cuối, chứng minh view không lấy dòng riêng của cơ sở khác áp cho cả trường');

-- ═══ 4. KHOÁ HÌNH DẠNG ═════════════════════════════════════════════════════
-- Ba assertion hành vi ở trên đo bằng dữ liệu, nhưng chúng chỉ đỏ khi có người
-- khai ngưỡng riêng. Câu này đỏ ngay cả khi bảng ngưỡng rỗng: nó bắt đúng cái lỗi
-- gốc — lời gọi thiếu tham số.
select ok(
  (select pg_get_viewdef('care.v_signal_emotion'::regclass) ~ 'resolve_threshold\([^)]*school_id'),
  'care.v_signal_emotion TRUYỀN school_id vào resolve_threshold — cùng khuôn với v_signal_attendance/v_signal_behavior (0039), không còn view nào hỏi ngưỡng theo kiểu riêng');

select * from finish();
rollback;
