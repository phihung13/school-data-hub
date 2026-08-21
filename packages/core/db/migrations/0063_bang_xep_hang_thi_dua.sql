-- 0062_bang_xep_hang_thi_dua.sql
-- ADR-037 — bảng xếp hạng thi đua toàn trường (hạng mục lấy từ sơ đồ AI OS của cấp trên).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RANH GIỚI, nguyên văn lời chủ đầu tư 21/08/2026 — chép ra đây vì nó LÀ hợp đồng
-- ═══════════════════════════════════════════════════════════════════════════
--   "xếp hạng thời gian dùng app thì ok, xếp hạng thi đua cá nhân/lớp/khối... thì ok,
--    ko đưa cảm xúc vào"
--
-- Vế thứ ba KHÔNG được để sống bằng thiện chí. §5 (tường lửa chăm sóc/đánh giá) đã có
-- một hàng rào kỹ thuật cho báo cáo học thuật — `reporting` bị revoke khỏi `attendance`.
-- Bảng điểm này KHÔNG chạy dưới vai đó, nên nó cần hàng rào của riêng nó, và hàng rào
-- ấy nằm ngay dưới đây: `evidence.tinh_diem_thi_dua` là hàm DUY NHẤT được ghi vào sổ
-- điểm, và một bài pgTAP đọc `pg_proc.prosrc` khẳng định thân hàm KHÔNG nhắc `mood`,
-- `checkins_care`, `can_read_mood` hay `care.` ở bất kỳ dạng nào. Ai định lấy cảm xúc
-- làm điểm thi đua sẽ phải sửa một bài test có tên — chứ không phải chỉ thêm một cột.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- BA THỨ CỐ Ý KHÔNG LÀM
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. KHÔNG Realtime. ADR-010 để Realtime mặc định tắt, bật theo từng tính năng qua ADR;
--    sơ đồ AI OS vẽ "Supabase Realtime" nhưng hệ này không chạy Supabase runtime. Bảng
--    xếp hạng đọc theo nhịp mở trang — một bảng thi đua nhảy số trước mắt trẻ con là
--    thứ nên tránh chứ không phải thứ nên xây.
-- 2. KHÔNG tính điểm tại chỗ mỗi lần mở màn. Sổ điểm là bảng CHỐT theo ngày, do một
--    job ghi. Tính lại khi đọc thì hai người mở cùng lúc thấy hai bảng khác nhau, và
--    không ai truy được "hôm qua em xếp thứ mấy".
-- 3. KHÔNG có cột "tổng điểm" trong `core.students`. Điểm là dữ liệu phái sinh; nhét
--    nó vào bảng lõi là dựng một sự thật thứ hai phải đồng bộ tay (Rev D.1).

begin;

-- ---------------------------------------------------------------------------
-- 1. LUẬT TÍNH ĐIỂM nằm trong bảng, không nằm trong câu SQL (tinh thần §6)
-- ---------------------------------------------------------------------------
-- Cùng khuôn `care.thresholds` (`0005`) và cùng lý do: đổi cách tính điểm là việc của
-- nhà trường, không phải việc của một lần deploy. Khác `care.thresholds` ở đúng một
-- điểm phải nói rõ — đây KHÔNG phải ngưỡng cảnh báo, nên nó không thuộc §6 theo nghĩa
-- đen; nó mượn khuôn vì khuôn đó đúng, không phải vì luật bắt.
create table evidence.luat_tinh_diem (
  ma_luat     text primary key,
  nhan        text not null,
  params      jsonb not null,
  active      boolean not null default true,
  school_id   uuid references core.schools(id),   -- NULL = áp dụng toàn hệ
  updated_by  uuid references core.users(id),
  updated_at  timestamptz not null default now()
);

comment on table evidence.luat_tinh_diem is
  'ADR-037 — luật tính điểm thi đua. Đổi trọng số KHÔNG cần deploy. CẤM thêm luật nào lấy nguồn từ dữ liệu cảm xúc (mood, care.*): ranh giới chủ đầu tư vạch 21/08/2026, và pgTAP 0062 canh bằng cách đọc thân hàm tính điểm.';

-- Ba luật khởi điểm. Trọng số là ĐỀ XUẤT của kỹ thuật, không phải quyết định của nhà
-- trường — nhà trường đổi bằng một câu UPDATE, và màn quản trị sẽ đọc chính bảng này.
insert into evidence.luat_tinh_diem (ma_luat, nhan, params) values
  ('DI_HOC_DUNG_GIO', 'Đi học đúng giờ',
   '{"diem_moi_ngay": 10, "tinh_ca_di_muon": false}'),
  ('CHUOI_DI_HOC',    'Chuỗi ngày đi học liên tiếp',
   '{"diem_moi_ngay_chuoi": 2, "toi_da": 20}'),
  ('DUNG_APP',        'Dùng app học tập',
   '{"diem_moi_luot": 1, "toi_da_moi_ngay": 5}');

-- ---------------------------------------------------------------------------
-- 2. SỔ ĐIỂM — một dòng cho mỗi (em · ngày · luật)
-- ---------------------------------------------------------------------------
-- §9 nằm ở chính khoá chính: chạy lại job cho cùng một ngày là UPSERT, không sinh dòng
-- thứ hai và không cộng dồn. Đây là chỗ chống gian lận rẻ nhất của một bảng thi đua —
-- "bấm gửi hai lần" không thành hai lần điểm, vì điểm không đến từ lượt gửi mà đến từ
-- một phép TÍNH LẠI trên dữ liệu nguồn.
create table evidence.diem_thi_dua (
  student_id  uuid    not null references core.students(id) on delete cascade,
  ngay        date    not null,
  ma_luat     text    not null references evidence.luat_tinh_diem(ma_luat),
  diem        integer not null,
  chi_tiet    jsonb   not null default '{}',
  tinh_luc    timestamptz not null default now(),
  primary key (student_id, ngay, ma_luat),
  constraint diem_thi_dua_khong_am_chk check (diem >= 0)
);

comment on table evidence.diem_thi_dua is
  'ADR-037 — sổ điểm thi đua, một dòng mỗi (em · ngày · luật). §9 nằm ở khoá chính: chạy lại job cho cùng ngày là upsert, không cộng dồn. Điểm KHÔNG đến từ lượt gửi mà từ phép tính lại trên dữ liệu nguồn — nên "bấm hai lần" không thành hai lần điểm.';
comment on column evidence.diem_thi_dua.chi_tiet is
  'Số liệu thô dẫn tới điểm (số ngày, số lượt…). CẤM chứa bất kỳ mẩu nội dung cảm xúc nào — xem khối ranh giới đầu 0062.';

create index diem_thi_dua_ngay_idx on evidence.diem_thi_dua (ngay desc);

-- ---------------------------------------------------------------------------
-- 3. HÀM TÍNH ĐIỂM — cửa ghi duy nhất vào sổ điểm
-- ---------------------------------------------------------------------------
-- Thân hàm cố ý KHÔNG nhắc tới `mood`/`care.`/`checkins_care`/`can_read_mood`. pgTAP
-- 0062 đọc `prosrc` để khẳng định điều đó — nên mọi lời giải thích về cảm xúc phải nằm
-- NGOÀI hàm, đúng chỗ này (cùng cái bẫy mà `core.can_read_mood` đã ghi ở `0044`).
create or replace function evidence.tinh_diem_thi_dua(p_ngay date default current_date)
returns integer
language plpgsql
security definer
set search_path = evidence, core, attendance, ops, pg_temp
as $$
declare
  v_so_dong integer := 0;
  v_p       jsonb;
begin
  -- ── Luật 1: đi học đúng giờ ──────────────────────────────────────────────
  select params into v_p from evidence.luat_tinh_diem
   where ma_luat = 'DI_HOC_DUNG_GIO' and active;
  if v_p is not null then
    insert into evidence.diem_thi_dua (student_id, ngay, ma_luat, diem, chi_tiet, tinh_luc)
    select c.student_id, p_ngay, 'DI_HOC_DUNG_GIO',
           (v_p ->> 'diem_moi_ngay')::int,
           jsonb_build_object('trang_thai', c.status),
           now()
      from attendance.checkins c
     where c.occurred_on = p_ngay
       and c.kind = 'in'
       and (c.status = 'present'
            or (c.status = 'late' and coalesce((v_p ->> 'tinh_ca_di_muon')::boolean, false)))
    on conflict (student_id, ngay, ma_luat)
    do update set diem = excluded.diem, chi_tiet = excluded.chi_tiet, tinh_luc = now();
    get diagnostics v_so_dong = row_count;
  end if;

  -- ── Luật 2: chuỗi ngày đi học liên tiếp ──────────────────────────────────
  -- Cách đếm chuỗi sao đúng `report.buildGrowthReport`: ngày trừ thứ tự đếm lùi cho ra
  -- một hằng số chung cho mọi ngày liền mạch. Một cách đếm chuỗi thứ hai là một ngày
  -- nào đó hai màn hình nói hai con số.
  select params into v_p from evidence.luat_tinh_diem
   where ma_luat = 'CHUOI_DI_HOC' and active;
  if v_p is not null then
    insert into evidence.diem_thi_dua (student_id, ngay, ma_luat, diem, chi_tiet, tinh_luc)
    select t.student_id, p_ngay, 'CHUOI_DI_HOC',
           least(count(*)::int * (v_p ->> 'diem_moi_ngay_chuoi')::int,
                 (v_p ->> 'toi_da')::int),
           jsonb_build_object('so_ngay_chuoi', count(*)::int),
           now()
      from (
        select c.student_id,
               c.occurred_on + row_number() over (
                 partition by c.student_id order by c.occurred_on desc
               )::int as nhom
          from attendance.checkins c
         where c.kind = 'in'
           and c.status in ('present', 'late')
           and c.occurred_on <= p_ngay
      ) t
     where t.nhom = p_ngay + 1
     group by t.student_id
    on conflict (student_id, ngay, ma_luat)
    do update set diem = excluded.diem, chi_tiet = excluded.chi_tiet, tinh_luc = now();
  end if;

  -- ── Luật 3: dùng app học tập ─────────────────────────────────────────────
  -- Nguồn là `ops.mini_app_usage` (0060) — đã gộp theo ngày và đã có cửa sổ nguội 30
  -- giây, nên "bấm hụt rồi bấm lại" không thành điểm. Trần mỗi ngày là hàng rào thứ
  -- hai: không ai leo hạng bằng cách mở app 200 lần.
  select params into v_p from evidence.luat_tinh_diem
   where ma_luat = 'DUNG_APP' and active;
  if v_p is not null then
    insert into evidence.diem_thi_dua (student_id, ngay, ma_luat, diem, chi_tiet, tinh_luc)
    select s.id, p_ngay, 'DUNG_APP',
           least(sum(u.so_lan)::int * (v_p ->> 'diem_moi_luot')::int,
                 (v_p ->> 'toi_da_moi_ngay')::int),
           jsonb_build_object('so_luot', sum(u.so_lan)::int),
           now()
      from ops.mini_app_usage u
      join core.students s on s.user_id = u.user_id
     where u.ngay = p_ngay
     group by s.id
    on conflict (student_id, ngay, ma_luat)
    do update set diem = excluded.diem, chi_tiet = excluded.chi_tiet, tinh_luc = now();
  end if;

  return v_so_dong;
end;
$$;

comment on function evidence.tinh_diem_thi_dua(date) is
  'ADR-037 — cửa GHI duy nhất vào evidence.diem_thi_dua. Trọng số đọc từ evidence.luat_tinh_diem, không hằng số nào trong thân hàm. §9: upsert theo (em·ngày·luật) nên chạy lại là no-op. Thân hàm CẤM nhắc tới dữ liệu cảm xúc — pgTAP 0062 đọc prosrc để canh.';

revoke all on function evidence.tinh_diem_thi_dua(date) from public;

-- ---------------------------------------------------------------------------
-- 4. BA BẢNG XẾP HẠNG
-- ---------------------------------------------------------------------------
-- Cửa sổ 30 ngày: bảng thi đua phải quên được: một tuần ốm hồi tháng trước không nên
-- đè lên cả học kỳ. `security_invoker = on` ở cả ba — thiếu nó là view chạy quyền chủ
-- schema và vượt mặt mọi RLS bên dưới (bài học `0024`).
create view evidence.v_xep_hang_ca_nhan with (security_invoker = on) as
  select s.id                as student_id,
         s.full_name,
         c.code              as lop,
         c.grade             as khoi,
         sum(d.diem)::int    as tong_diem,
         rank() over (order by sum(d.diem) desc) as thu_hang
    from evidence.diem_thi_dua d
    join core.students s   on s.id = d.student_id
    join core.enrollments e on e.student_id = s.id and e.valid_to is null
    join core.classes c    on c.id = e.class_id
   where d.ngay >= current_date - 29
   group by s.id, s.full_name, c.code, c.grade;

create view evidence.v_xep_hang_lop with (security_invoker = on) as
  select c.id                as class_id,
         c.code              as lop,
         c.grade             as khoi,
         sum(d.diem)::int    as tong_diem,
         count(distinct d.student_id)::int as so_em_co_diem,
         -- Trung bình chứ không chỉ tổng: lớp 40 em luôn thắng lớp 25 em nếu xếp bằng
         -- tổng, và khi đó bảng đo sĩ số chứ không đo thi đua.
         round(sum(d.diem)::numeric / nullif(count(distinct e.student_id), 0), 1) as diem_trung_binh,
         rank() over (
           order by sum(d.diem)::numeric / nullif(count(distinct e.student_id), 0) desc
         ) as thu_hang
    from core.classes c
    join core.enrollments e on e.class_id = c.id and e.valid_to is null
    left join evidence.diem_thi_dua d
           on d.student_id = e.student_id and d.ngay >= current_date - 29
   group by c.id, c.code, c.grade;

create view evidence.v_xep_hang_khoi with (security_invoker = on) as
  select c.grade            as khoi,
         sum(d.diem)::int   as tong_diem,
         round(sum(d.diem)::numeric / nullif(count(distinct e.student_id), 0), 1) as diem_trung_binh,
         rank() over (
           order by sum(d.diem)::numeric / nullif(count(distinct e.student_id), 0) desc
         ) as thu_hang
    from core.classes c
    join core.enrollments e on e.class_id = c.id and e.valid_to is null
    left join evidence.diem_thi_dua d
           on d.student_id = e.student_id and d.ngay >= current_date - 29
   group by c.grade;

comment on view evidence.v_xep_hang_ca_nhan is
  'ADR-037 — xếp hạng cá nhân toàn trường, cửa sổ 30 ngày. security_invoker: RLS của evidence.diem_thi_dua vẫn là hàng rào.';
comment on view evidence.v_xep_hang_lop is
  'ADR-037 — xếp hạng lớp theo ĐIỂM TRUNG BÌNH mỗi em, không theo tổng: xếp bằng tổng thì bảng đo sĩ số chứ không đo thi đua.';

-- ---------------------------------------------------------------------------
-- 5. AI ĐỌC ĐƯỢC
-- ---------------------------------------------------------------------------
-- Bảng thi đua là thứ CÔNG KHAI trong trường — đó là bản chất của nó, và là điều chủ
-- đầu tư chọn khi duyệt "xếp hạng toàn trường". Nên policy đọc mở cho mọi người đã đăng
-- nhập, KHÔNG theo `can_see_student`.
--
-- Ghi ra để không ai bất ngờ: điểm sinh một phần từ chuyên cần, nên thứ hạng thấp là
-- một tín hiệu gián tiếp về việc em hay nghỉ. Đây là hệ quả có thật của quyết định
-- 21/08/2026, không phải một lỗ hổng — nhưng nó là lý do `chi_tiet` chỉ chứa số, và là
-- lý do màn hình sẽ KHÔNG in ra "vì sao em này điểm thấp".
alter table evidence.diem_thi_dua enable row level security;
alter table evidence.luat_tinh_diem enable row level security;

create policy diem_thi_dua_ai_cung_doc on evidence.diem_thi_dua
  for select to authenticated using (true);

create policy luat_tinh_diem_ai_cung_doc on evidence.luat_tinh_diem
  for select to authenticated using (true);

comment on policy diem_thi_dua_ai_cung_doc on evidence.diem_thi_dua is
  'ADR-037 — bảng thi đua công khai trong trường, đúng bản chất của nó. KHÔNG dùng can_see_student. Đường GHI vẫn khoá: chỉ evidence.tinh_diem_thi_dua (security definer) ghi được, authenticated không có INSERT/UPDATE.';

-- CHỈ SELECT cho người dùng cuối. Không cấp INSERT/UPDATE cho `authenticated`: đường ghi
-- duy nhất là hàm tính điểm, và đó là thứ giữ cho không ai tự cộng điểm cho mình.
grant select on evidence.diem_thi_dua   to authenticated;
grant select on evidence.luat_tinh_diem to authenticated;
grant select on evidence.v_xep_hang_ca_nhan, evidence.v_xep_hang_lop, evidence.v_xep_hang_khoi to authenticated;

-- §5 — role `reporting` (bộ sinh báo cáo học thuật) KHÔNG được cấp gì ở đây. Điểm thi
-- đua không phải dữ liệu học thuật, và trộn hai thứ là mở đúng cánh cửa §5 đã đóng.

-- ---------------------------------------------------------------------------
-- 6. Khai job — "không suy tin tốt từ im lặng" (Rev B.3)
-- ---------------------------------------------------------------------------
insert into ops.job_schedule (job_name, label, kind, runner, expected_every, grace, enabled, note)
values ('tinh_diem_thi_dua', 'Tính điểm thi đua', 'script',
        'run-tinh-diem.mjs', interval '1 day', interval '6 hours', true,
        'ADR-037. Chạy lại cho cùng một ngày là no-op (§9). Job chết ⇒ bảng xếp hạng đứng im ở số cũ, và MÀN HÌNH PHẢI NÓI RA điều đó — xem ops.v_job_health.')
on conflict (job_name) do nothing;

commit;
