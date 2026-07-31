-- 0011_source_freshness.sql
-- ADR-016 — "không suy tin tốt từ im lặng", mở rộng từ mức job xuống mức TỪNG NGUỒN.
--
-- Trước: chỉ theo dõi job đêm chạy xong chưa.
-- Vấn đề: connector Tutor chết 3 ngày -> v_signal_mastery_drop im lặng -> không sinh cờ C
--         -> buồng lái vẫn xanh, vẫn ghi "Quét đêm qua ✓". Nhiệt kế hỏng mà vẫn chỉ 37 độ.
-- Sau:  nguồn quá hạn tươi -> bỏ qua rule phụ thuộc nguồn đó, ghi lại, buồng lái hiện băng vàng.
--
-- Phụ thuộc: schema ops + ops.job_runs (baseline 0001–0009).

begin;

create table if not exists ops.source_freshness (
  source           text        primary key,
  label            text        not null,              -- tên hiển thị trên băng vàng
  max_age          interval    not null,
  last_success_at  timestamptz,
  updated_at       timestamptz not null default now(),

  constraint source_freshness_max_age_chk check (max_age > interval '0')
);

comment on table ops.source_freshness is
  'ADR-016 — hạn tươi của từng nguồn tín hiệu. Flag engine đọc bảng này TRƯỚC khi quét.';

-- Hạn tươi lấy đúng bảng System of Record trong 02-database.md.
-- Đây là CONFIG, không phải dữ liệu người dùng: đổi hạn không cần deploy (tinh thần §6).
--
-- CHỈ KHAI NGUỒN ĐÃ CÓ NGƯỜI GHI. Sửa 31/07/2026 — bỏ ba dòng 'tutor', 'moodle', 'cor'.
-- Lý do: cả ba chưa có connector nào (grep toàn repo: không dòng mã nào ghi
-- last_success_at cho chúng; hai trigger duy nhất đặt ở 0031 chỉ phục vụ 'attendance' và
-- 'evidence'). Vì `last_success_at IS NULL` được tính là HẾT TƯƠI một cách có chủ ý, ba
-- dòng này khiến ops.v_stale_sources luôn trả ba nguồn quá hạn, tức băng vàng "dữ liệu
-- có thể chưa đầy đủ" trên buồng lái GVCN sáng vĩnh viễn ngay từ ngày đầu.
--
-- Đó là hỏng đúng chỗ ADR-016 muốn bảo vệ: cảnh báo lúc nào cũng sáng là cảnh báo đã
-- chết. Giáo viên học cách phớt lờ băng vàng trong tuần đầu, rồi hôm connector điểm danh
-- chết thật thì băng vàng ấy không còn nói được gì với ai.
--
-- KHI CONNECTOR THẬT RA ĐỜI: thêm lại dòng nguồn tương ứng TRONG CÙNG migration với
-- connector đó, không sớm hơn. Khai nguồn trước khi có người ghi là tự bật báo động giả.
insert into ops.source_freshness (source, label, max_age) values
  ('attendance', 'Điểm danh / check-in', interval '26 hours'),
  ('evidence',   'Dấu chân hoạt động',  interval '8 days')
on conflict (source) do nothing;

-- Dọn ba dòng đã seed ở những database ĐÃ chạy migration này trước 31/07/2026: bỏ chúng
-- khỏi câu INSERT ở trên là đủ cho database dựng mới, nhưng `on conflict do nothing`
-- không bao giờ gỡ được dòng đã nằm sẵn trong bảng.
--
-- Điều kiện `last_success_at is null` là chốt an toàn tự tháo ngòi: ngày nào một
-- connector thật ghi được lần chạy đầu tiên cho nguồn đó thì câu lệnh này không còn
-- chạm vào dòng của nó nữa, dù có ai chạy lại đoạn SQL này bằng tay.
--
-- LƯU Ý VẬN HÀNH: bộ migration của repo KHÔNG replay được lên database đã migrate
-- (0002 dừng ở "relation school_networks already exists"), nên câu DELETE này chỉ tự
-- chạy trên database dựng mới. Database dev/staging đang sống phải chạy tay đúng ba
-- dòng dưới đây một lần — đã làm trên hub_dev ngày 31/07/2026.
delete from ops.source_freshness
 where source in ('tutor', 'moodle', 'cor')
   and last_success_at is null;

alter table ops.source_freshness enable row level security;

-- Buồng lái phải đọc được để hiện băng vàng — bảng này không chứa dữ liệu cá nhân.
grant select on ops.source_freshness to authenticated;
drop policy if exists source_freshness_read on ops.source_freshness;
create policy source_freshness_read
  on ops.source_freshness for select
  to authenticated
  using (true);

-- Ghi: chỉ connector/job (role server). Không policy INSERT/UPDATE cho authenticated.

-- Nguồn nào đang quá hạn — engine và buồng lái dùng chung một định nghĩa,
-- để không có chuyện hai nơi hiểu "hết tươi" khác nhau.
create or replace view ops.v_stale_sources as
  select source,
         label,
         last_success_at,
         max_age,
         now() - coalesce(last_success_at, '-infinity'::timestamptz) as age
    from ops.source_freshness
   where last_success_at is null
      or now() - last_success_at > max_age;

comment on view ops.v_stale_sources is
  'ADR-016 — nguồn quá hạn tươi. last_success_at IS NULL cũng tính là hết tươi: chưa từng chạy ≠ đang ổn.';

grant select on ops.v_stale_sources to authenticated;

-- Kết quả một lần quét phải nói rõ nó đã bỏ qua gì.
alter table ops.job_runs
  add column if not exists degraded_sources text[] not null default '{}';

comment on column ops.job_runs.degraded_sources is
  'ADR-016 — nguồn bị bỏ qua trong lần chạy này. Buồng lái đọc cột này để hiện băng vàng.';

commit;
