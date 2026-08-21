-- 0070_lich_hom_nay.sql
-- ADR-034 (hạng mục "Lịch hôm nay" lấy từ sơ đồ AI OS của cấp trên).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SƠ ĐỒ VẼ "GOOGLE CALENDAR API". FILE NÀY KHÔNG LÀM ĐIỀU ĐÓ, VÀ ĐÂY LÀ LÝ DO
-- ═══════════════════════════════════════════════════════════════════════════
-- Nối Google Calendar đòi Google OAuth, mà Hub **chưa nối Google** (`DEBT.md` #19 —
-- hôm nay đăng nhập vẫn qua cửa thử). Dựng một bộ đồng bộ hôm nay là dựng một đường ống
-- **không chạy được và không đo được**: nó sẽ nằm trong kho, trông như một tính năng,
-- và không ai biết nó đúng hay sai cho tới ngày cắm thật.
--
-- Nên đợt này dựng phần **chạy được ngay và đo được ngay**: một cuốn lịch của trường,
-- do trường tự nhập, hiện trên trang chủ. Và chừa **mối nối** đúng một chỗ — cột
-- `nguon` — để ngày trả nợ #19 thì bộ đồng bộ Google ghi vào chính bảng này, không
-- phải dựng một bảng thứ hai rồi ghép hai nguồn ở tầng màn hình.
--
-- Nói thẳng để không ai đọc nhầm: **lịch Google CHƯA nối**. Cái có hôm nay là lịch
-- trường tự nhập. Xem `DEBT.md` #69.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- AI THẤY GÌ — và vì sao không mượn `core.can_see_student`
-- ═══════════════════════════════════════════════════════════════════════════
-- Một sự kiện lịch không thuộc về một EM, nó thuộc về một LỚP hoặc cả TRƯỜNG. Nên phạm
-- vi ở đây là phạm vi của lớp, và nó là câu hỏi thứ năm — không phải một trong bốn câu
-- đã có (`can_see_student` · `can_see_care` · `can_read_mood` · `principal_of`). Mượn
-- nhầm hàm là đúng lỗi mà `0035`/`0037`/`0038` đã mắc ba lần.

begin;

create table core.su_kien_lich (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references core.schools(id) on delete cascade,
  -- NULL = sự kiện của CẢ TRƯỜNG (nghỉ lễ, khai giảng, họp phụ huynh toàn trường).
  class_id    uuid references core.classes(id) on delete cascade,
  tieu_de     text not null,
  loai        text not null default 'chung',
  bat_dau     timestamptz not null,
  ket_thuc    timestamptz,
  dia_diem    text,
  -- MỐI NỐI cho ngày trả nợ #19: bộ đồng bộ Google ghi 'google' + external_id, và
  -- `(nguon, external_id)` UNIQUE làm §9 tự có — đồng bộ lại không sinh bản đôi.
  nguon       text not null default 'hub',
  external_id text,
  tao_boi     uuid references core.users(id),
  tao_luc     timestamptz not null default now(),
  constraint su_kien_lich_loai_chk check (loai in ('chung', 'hoc', 'hop', 'nghi', 'hoat_dong')),
  constraint su_kien_lich_nguon_chk check (nguon in ('hub', 'google')),
  constraint su_kien_lich_tieu_de_chk check (length(btrim(tieu_de)) between 1 and 200),
  constraint su_kien_lich_thu_tu_chk check (ket_thuc is null or ket_thuc >= bat_dau),
  -- Nguồn ngoài PHẢI mang external_id, nguồn Hub thì không được mang: một dòng do người
  -- nhập tay mà có external_id sẽ bị lượt đồng bộ sau ghi đè mất.
  constraint su_kien_lich_ngoai_co_ma_chk check (
    (nguon = 'hub' and external_id is null) or (nguon <> 'hub' and external_id is not null)
  )
);

create unique index su_kien_lich_nguon_uq on core.su_kien_lich (nguon, external_id)
  where external_id is not null;
create index su_kien_lich_ngay_idx on core.su_kien_lich (bat_dau);

comment on table core.su_kien_lich is
  'ADR-034 — lịch của trường, hiện trên trang chủ. `class_id` NULL = cả trường. Cột `nguon` là MỐI NỐI cho bộ đồng bộ Google (DEBT #69, mốc: sau khi trả nợ #19 — hôm nay Hub CHƯA nối Google, lịch là do trường tự nhập). Đồng bộ lại không sinh bản đôi nhờ UNIQUE (nguon, external_id).';
comment on column core.su_kien_lich.class_id is
  'NULL = sự kiện của cả trường. Phạm vi đọc là phạm vi của LỚP, không phải của một em — đây là câu hỏi thứ năm, không mượn core.can_see_student (bài học 0035/0037/0038).';

alter table core.su_kien_lich enable row level security;

-- ĐỌC: cả trường thì ai cũng thấy; của một lớp thì người thuộc lớp đó thấy — học sinh
-- đang học lớp đó, phụ huynh có con trong lớp, và thầy cô dạy/chủ nhiệm lớp đó.
create policy su_kien_lich_doc on core.su_kien_lich
  for select to authenticated
  using (
    class_id is null
    or exists (
      select 1 from core.enrollments e
       where e.class_id = core.su_kien_lich.class_id
         and e.valid_to is null
         and (core.is_me(e.student_id) or core.is_my_child(e.student_id) or core.can_see_student(e.student_id))
    )
  );

comment on policy su_kien_lich_doc on core.su_kien_lich is
  'Sự kiện cả trường: ai cũng đọc. Sự kiện của một lớp: người có mặt trong lớp đó (chính em, bố mẹ em, hoặc thầy cô nhìn thấy em) đọc được. Dùng can_see_student ở đây là ĐÚNG chỗ — nó trả lời "thầy cô này có nhìn thấy em này không", và một lớp là tập các em.';

grant select on core.su_kien_lich to authenticated;

-- GHI: chỉ quản trị/hiệu trưởng, qua tRPC. Không policy insert cho `authenticated` —
-- một cuốn lịch mà ai cũng thêm được thì trang chủ của cả trường là bảng tin tự do.

-- ---------------------------------------------------------------------------
-- Lịch HÔM NAY của người đang đăng nhập
-- ---------------------------------------------------------------------------
-- View chứ không phải hàm: nó không nhận tham số nào, và `security_invoker` cho RLS ở
-- trên làm đúng việc của nó. Đây là chỗ `security_invoker` ĐÚNG — khác hẳn bảng xếp
-- hạng (`0064`), nơi RLS trả lời một câu hỏi khác câu view đang hỏi. Phân biệt: view
-- này hỏi "của TÔI hôm nay", và RLS cũng đang trả lời "của tôi".
create view core.v_lich_hom_nay with (security_invoker = on) as
  select s.id, s.tieu_de, s.loai, s.bat_dau, s.ket_thuc, s.dia_diem,
         s.class_id is null as ca_truong,
         c.code as lop
    from core.su_kien_lich s
    left join core.classes c on c.id = s.class_id
   where s.bat_dau >= date_trunc('day', now())
     and s.bat_dau <  date_trunc('day', now()) + interval '1 day';

comment on view core.v_lich_hom_nay is
  'ADR-034 — sự kiện lịch HÔM NAY trong tầm nhìn của người đang đăng nhập. security_invoker = on: ở đây RLS trả lời ĐÚNG câu view đang hỏi ("của tôi"), khác bảng xếp hạng 0064 nơi nó trả lời câu khác. Múi giờ do client.ts ghim Asia/Ho_Chi_Minh, nên "hôm nay" là hôm nay của trường.';

grant select on core.v_lich_hom_nay to authenticated;

commit;
