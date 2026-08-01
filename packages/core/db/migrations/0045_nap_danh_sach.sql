-- 0045_nap_danh_sach.sql
-- NẠP DANH SÁCH CẢ KHỐI — đường đi hợp lệ đầu tiên để một học sinh có thật bước vào hệ.
--
-- Vì sao migration này ra đời (đo được 01/08/2026, trên hub_dev):
--   · `grep -rn "insert into core.students"` toàn kho ra ĐÚNG 3 hit, cả 3 đều là công cụ
--     dev: seed.mjs:217, seed.mjs:338, tools/load/checkin-storm.mjs:175. Trong 6 router
--     tRPC của apps/hub/server: 0 hit. Không file nào nhắc chữ CSV.
--   · staging.raw_cor_imports: 0 dòng. Bảng đó ra đời ở 0008 và chưa từng nhận một dòng
--     dữ liệu nào.
--   Nghĩa là tới hôm nay, cách duy nhất để có học sinh trong hệ là chạy seed dev. Ngày
--   nhà trường đưa file danh sách khối 6 thì không có cửa nào nhận nó.
--
-- BA LUẬT CHI PHỐI TOÀN BỘ FILE NÀY, theo thứ tự thiệt hại nếu vỡ:
--
--   1. HAI TẦNG CHỐNG TRÙNG, KHÁC NHAU, KHÔNG ĐƯỢC LẪN (§9).
--      · staging chống trùng FILE: raw_cor_imports UNIQUE (source, external_id), với
--        external_id = '<ma_lo>:<student_code>'. Nạp LẠI CÙNG một file ⇒ cùng ma_lo ⇒
--        cùng external_id ⇒ staging chặn ở cửa. Đây là idempotency của LẦN NẠP.
--      · bảng đích chống trùng DỮ LIỆU: core.students.student_code UNIQUE và
--        core.classes UNIQUE (school_id, code, academic_year). Nạp file MỚI (tháng 12,
--        lớp đã đổi) ⇒ ma_lo mới ⇒ external_id mới ⇒ promote() chạy lại, và lúc đó
--        tính idempotent do KHOÁ ĐÍCH gánh.
--      Lấy thẳng student_code làm external_id là mất tầng thứ hai: file tháng 12 bị
--      chặn ngay ở cửa staging, promote() không bao giờ nhìn thấy em đã đổi lớp, và
--      báo cáo nói "đã nạp, 0 lỗi". Lấy hash cả dòng làm external_id là mất tầng thứ
--      nhất: trường sửa một dấu cách là sinh một dòng thô mới, không gì gom lại được.
--
--   2. CẤM `ON CONFLICT` TRÊN core.enrollments — đo được, và nó KHÔNG ném lỗi như
--      người ta tưởng, nó NUỐT IM LẶNG. Bảng đó không có ràng buộc duy nhất thường mà
--      có EXCLUDE `enrollments_no_overlap` (gist trên student_id + daterange '[]').
--      Bốn dạng đã dựng lại và đo trên một database riêng:
--        (A) `on conflict do nothing` không target, trùng đúng kỳ cũ  → INSERT 0 0, im.
--        (B) `on conflict do nothing` không target, LỚP KHÁC nhưng kỳ chồng lấn
--            → CŨNG INSERT 0 0, im. Dòng chuyển lớp biến mất không dấu vết.
--        (C) `on conflict (student_id,class_id,valid_from) do nothing` → ERROR
--            'there is no unique or exclusion constraint matching...'.
--        (D) không có on conflict, kỳ chồng lấn → ERROR 23P01.
--      Dạng nguy hiểm nhất (B) là dạng IM. core.enrollments chính là bảng quyết định
--      "cô có được xem em này không" (0002:76) — nuốt một dòng chuyển lớp nghĩa là cô
--      mới không thấy em, cô cũ vẫn thấy, và job báo success 0 lỗi.
--      Nên ở đây: ĐỌC RỒI QUYẾT, không ON CONFLICT dù có target hay không.
--
--   3. IM LẶNG KHÔNG PHẢI KẾT LUẬN — "em biến mất khỏi file mới" KHÔNG được tự xử.
--      "Trường xuất nhầm bộ lọc" và "em chuyển trường thật" cho ra CÙNG một dấu hiệu:
--      thiếu tên trong file. Hệ không có phép đo nào phân biệt hai chuyện đó. Tự set
--      status='left' hay tự đóng enrollment là kết luận không có căn cứ, và nó cắt em
--      khỏi tầm nhìn của cô đúng lúc không ai đang nhìn. core.doi_soat_vang_mat() vì
--      thế chỉ GHI RA MỘT DANH SÁCH CHỜ NGƯỜI, không chạm một dòng dữ liệu nghiệp vụ.
--
-- KHÔNG khai vào ops.job_schedule — có chủ ý, xem mục 7 cuối file.
--
-- Phụ thuộc: 0002 (core.students/classes/enrollments), 0008 (staging.*), 0028 (khuôn
-- promote chịu lỗi + import_errors_dedup_uq), 0041 (ops.start_job_run/finish_job_run).

begin;

-- ---------------------------------------------------------------------------
-- 1. failed_at cho raw_cor_imports — nhánh lỗi cũng phải idempotent (§9)
-- ---------------------------------------------------------------------------
-- 0028 đã thêm cột này cho raw_embedded_events và ghi rõ lý do: "mỗi lần gọi lại
-- promote() trên cùng raw row lại đẻ thêm một dòng import_errors". Ba bảng thô còn
-- lại không được vá cùng lượt vì lúc đó chưa có bộ đọc nào — nay nguồn `cor` có bộ
-- đọc thật nên phải vá trước khi nó chạy lần đầu.
--
-- Đỡ được một nửa sẵn: import_errors_dedup_uq (source, external_id, reason) NULLS NOT
-- DISTINCT chặn dòng lỗi trùng ở tầng index. Nhưng không có failed_at thì promote()
-- vẫn diễn lại toàn bộ phần ánh xạ mỗi lần gọi, và mất hẳn khả năng phân biệt
-- "chưa thử" với "đã thử và hỏng vĩnh viễn" — tức mất nhánh trả về 'already_failed'.
alter table staging.raw_cor_imports add column if not exists failed_at timestamptz;

comment on column staging.raw_cor_imports.failed_at is
  'Đã gọi promote() và rơi vào staging.import_errors. Lần gọi sau trả ngay ''already_failed'' (§9). Người xử lỗi xong thì set NULL để nạp lại — y hệt quy ước 0028 cho nguồn embed.';

-- ---------------------------------------------------------------------------
-- 2. Ngưỡng dừng lô — đọc từ bảng, không viết chết trong code (mệnh lệnh 7)
-- ---------------------------------------------------------------------------
-- RB-09 (07-operations.md:47) đã chốt luật vận hành: "import_errors > 500/nguồn ⇒
-- dừng connector nguồn đó, sửa mapping, promote lại (idempotent, an toàn)". Con số
-- 500 là một NGƯỠNG, và mệnh lệnh 7 cấm ngưỡng nằm trong code: đổi nó phải là một
-- câu UPDATE, không phải một lần deploy.
--
-- Vì sao không dùng lại care.thresholds: bảng đó gắn với care.rules (mã luật, phạm vi
-- theo cơ sở, resolve_threshold). Nhét một ngưỡng vận hành của connector vào đó là
-- trộn hai vòng đời khác nhau — luật chăm sóc do BGH đổi, ngưỡng nạp do người vận
-- hành đổi. Một bảng nhỏ riêng rẻ hơn một lần dùng nhầm.
create table if not exists staging.import_limits (
  source      text        primary key,
  max_errors  integer     not null,
  note        text,
  updated_at  timestamptz not null default now(),
  constraint import_limits_max_chk check (max_errors > 0)
);

comment on table staging.import_limits is
  'Mệnh lệnh 7 — ngưỡng dừng cả lô cho từng nguồn nạp. RB-09: quá ngưỡng thì dừng connector, sửa mapping, promote lại. Đổi ngưỡng là một câu UPDATE, không phải một lần deploy.';

insert into staging.import_limits (source, max_errors, note) values
  ('cor', 500,
   'RB-09 (07-operations.md). Quá số này nghĩa là hỏng ở mức CẢ LÔ (sai cột, sai năm học, sai file) — chạy tiếp chỉ đổ rác vào kho chính.')
on conflict (source) do nothing;

-- Không có ngưỡng thì KHÔNG có chỗ dừng — và một job nạp không có chỗ dừng sẽ nuốt
-- trọn một file rác. Nên hàm này ném lỗi thay vì trả NULL: thiếu khai báo là sự cố
-- cấu hình, phải nổ ra lúc khởi động chứ không im lặng thành "không giới hạn".
create or replace function staging.nguong_loi_nap(p_source text)
returns integer
language plpgsql
stable
security definer
set search_path = staging, pg_catalog
as $$
declare
  v_n integer;
begin
  select max_errors into v_n from staging.import_limits where source = p_source;
  if v_n is null then
    raise exception 'Chưa khai ngưỡng lỗi cho nguồn "%" trong staging.import_limits — không có ngưỡng thì không có chỗ dừng, và một lô rác sẽ chạy tới dòng cuối', p_source;
  end if;
  return v_n;
end;
$$;

comment on function staging.nguong_loi_nap(text) is
  'Mệnh lệnh 7 — đọc ngưỡng dừng lô của một nguồn. Chưa khai thì NÉM LỖI, không trả NULL: thiếu ngưỡng phải nổ lúc khởi động chứ không im lặng thành "chạy vô hạn".';

-- ---------------------------------------------------------------------------
-- 3. Cửa vào staging — connector chỉ INSERT, đúng §8
-- ---------------------------------------------------------------------------
-- Nguyên khuôn staging.ingest_embedded_event (0028:181). Lý do giữ nguyên khuôn thay
-- vì cấp thêm quyền bảng cho vai connector: `insert ... on conflict do nothing
-- returning id` đòi cả UPDATE lẫn SELECT trên bảng thô, mà 0008 cố ý chỉ cấp INSERT.
create or replace function staging.ingest_cor_row(
  p_external_id  text,
  p_payload      jsonb
) returns bigint
language plpgsql
security definer
set search_path = staging, pg_catalog
as $$
declare
  v_id bigint;
begin
  insert into staging.raw_cor_imports (source, external_id, payload)
       values ('cor', p_external_id, p_payload)
  on conflict (source, external_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Đã nhận dòng này của LÔ này rồi (§9): trả đúng raw_id cũ, KHÔNG ghi đè payload.
    -- Bản đầu tiên là bản có thẩm quyền — nạp lại cùng một file không được sửa lịch sử.
    select id into v_id from staging.raw_cor_imports
     where source = 'cor' and external_id = p_external_id;
  end if;

  return v_id;
end;
$$;

comment on function staging.ingest_cor_row(text, jsonb) is
  '§8/§9 — cửa vào duy nhất cho danh sách học sinh từ nhà trường. external_id = ''<ma_lo>:<student_code>'': tầng chống trùng FILE. Tầng chống trùng DỮ LIỆU nằm ở khoá của core.students/core.classes.';

-- ---------------------------------------------------------------------------
-- 4. Ghi sổ lỗi — một chỗ duy nhất, tiếng Việt, có tên dòng
-- ---------------------------------------------------------------------------
-- Khác 0028 đúng một điểm: thêm p_them để nhét ngữ cảnh của riêng ca lỗi (lớp cũ,
-- lớp mới, cơ sở cũ...). Không có nó thì "em đang học lớp khác" là một câu không
-- dùng được: người xử phải tự đi tra lớp cũ là lớp nào.
create or replace function core.record_cor_import_error(
  p_row     staging.raw_cor_imports,
  p_reason  text,
  p_them    jsonb default '{}'::jsonb
) returns text
language plpgsql
security definer
set search_path = core, staging, pg_catalog
as $$
begin
  insert into staging.import_errors (source, raw_id, external_id, reason, payload)
       values (p_row.source, p_row.id, p_row.external_id, p_reason,
               p_row.payload || coalesce(p_them, '{}'::jsonb))
  on conflict (source, external_id, reason)
  do update set payload = excluded.payload,
                raw_id  = excluded.raw_id;

  update staging.raw_cor_imports set failed_at = now() where id = p_row.id;
  return 'import_error';
end;
$$;

comment on function core.record_cor_import_error(staging.raw_cor_imports, text, jsonb) is
  '§8 — dòng không dùng được thì nằm lại staging.import_errors chờ NGƯỜI xử, không tự đoán và không mất im lặng. Lý do viết bằng tiếng Việt, payload mang theo số dòng trong file + họ tên. Idempotent qua import_errors_dedup_uq.';

-- Lỗi cấp FILE (không gắn với một dòng thô nào): trùng mã trong cùng một file, hoặc
-- bất cứ thứ gì bộ đọc phát hiện trước khi dòng kịp vào staging. Cần một cửa riêng vì
-- record_cor_import_error() nhận một dòng raw có thật, còn ở đây thì chưa có.
create or replace function staging.ghi_loi_nap(
  p_external_id  text,
  p_reason       text,
  p_payload      jsonb
) returns bigint
language plpgsql
security definer
set search_path = staging, pg_catalog
as $$
declare
  v_id bigint;
begin
  insert into staging.import_errors (source, raw_id, external_id, reason, payload)
       values ('cor', null, p_external_id, p_reason, p_payload)
  on conflict (source, external_id, reason)
  do update set payload = excluded.payload
    returning id into v_id;
  return v_id;
end;
$$;

comment on function staging.ghi_loi_nap(text, text, jsonb) is
  '§8 — ghi một dòng lỗi cấp FILE (chưa có bản ghi thô nào để gắn vào), ví dụ trùng mã học sinh trong cùng một file. Idempotent qua import_errors_dedup_uq.';

-- Sổ lỗi cho NGƯỜI đọc: số dòng trong file · mã · họ tên · lý do tiếng Việt.
-- Không có view này thì người xử phải tự bới jsonb — và một hàng đợi khó đọc là một
-- hàng đợi không ai xử.
create or replace view staging.v_loi_nap_danh_sach as
select e.id,
       e.created_at,
       e.external_id,
       (e.payload ->> 'dong_trong_file')::int as dong_trong_file,
       e.payload ->> 'ma_hoc_sinh'            as ma_hoc_sinh,
       e.payload ->> 'ho_ten'                 as ho_ten,
       e.payload ->> 'ma_lop'                 as ma_lop,
       e.payload ->> 'ma_lo'                  as ma_lo,
       e.reason                               as ly_do,
       e.retry_state,
       e.resolved_at,
       e.payload
  from staging.import_errors e
 where e.source = 'cor'
 order by e.created_at desc, dong_trong_file;

comment on view staging.v_loi_nap_danh_sach is
  'Hàng đợi người-xử của nguồn cor, đọc được bằng mắt: dòng nào trong file, em nào, vì sao. Không cấp cho authenticated — đây là dữ liệu học sinh chưa qua cổng RLS nào.';

-- ---------------------------------------------------------------------------
-- 5. promote_cor_row — đưa MỘT dòng thô vào kho chính, hoặc vào sổ lỗi
-- ---------------------------------------------------------------------------
-- Hợp đồng (nguyên khuôn 0028:80): KHÔNG BAO GIỜ ném lỗi vì payload xấu. Mọi hỏng
-- hóc trả về chuỗi trạng thái và để lại một dòng import_errors. Một dòng lỗi không
-- được chặn dòng sạch (0008:69).
--
-- Trả về, đúng một trong:
--   'raw_not_found' · 'already_promoted' · 'already_failed' · 'import_error' · 'promoted'
--
-- p_tao_lop_moi mặc định FALSE, có chủ ý. Lớp chưa tồn tại thì mặc định là LỖI, không
-- phải là việc phải làm: core.classes cần grade và academic_year mà file có thể không
-- có, và một lỗi gõ '6A11' thay '6A1' sẽ đẻ ra một lớp ma thay vì kêu lên. Muốn tạo
-- lớp thì người vận hành phải bật cờ tường minh và đọc trước danh sách lớp sẽ tạo.
create or replace function core.promote_cor_row(
  p_raw_id       bigint,
  p_tao_lop_moi  boolean default false
) returns text
language plpgsql
security definer
set search_path = core, staging, pg_catalog
as $$
declare
  v_row        staging.raw_cor_imports%rowtype;
  v_ma_hs      text;
  v_ho_ten     text;
  v_ma_co_so   text;
  v_ma_lop     text;
  v_nam_hoc    text;
  v_ngay_sinh  date;
  v_hieu_luc   date;
  v_khoi       smallint;
  v_school_id  uuid;
  v_class_id   uuid;
  v_student_id uuid;
  v_school_cu  uuid;
  v_lop_dang   uuid;
  v_ten_lop_cu text;
begin
  select * into v_row from staging.raw_cor_imports where id = p_raw_id for update;
  if not found then
    return 'raw_not_found';
  end if;
  if v_row.promoted_at is not null then
    return 'already_promoted';  -- §9: gọi lại không làm gì thêm
  end if;
  if v_row.failed_at is not null then
    -- §9 cho nhánh lỗi. Payload không đổi được (ingest_cor_row giữ nguyên bản đầu
    -- tiên theo external_id), nên gọi lại chắc chắn hỏng y hệt — trả lời ngay thay
    -- vì diễn lại vở kịch cũ và đẻ thêm dòng vào hàng đợi người xử.
    return 'already_failed';
  end if;

  v_ma_hs    := nullif(btrim(v_row.payload ->> 'ma_hoc_sinh'), '');
  v_ho_ten   := nullif(btrim(v_row.payload ->> 'ho_ten'), '');
  v_ma_co_so := nullif(btrim(v_row.payload ->> 'ma_co_so'), '');
  v_ma_lop   := nullif(btrim(v_row.payload ->> 'ma_lop'), '');
  v_nam_hoc  := nullif(btrim(v_row.payload ->> 'nam_hoc'), '');

  -- ── Các cột bắt buộc ─────────────────────────────────────────────────────
  if v_ma_hs is null then
    return core.record_cor_import_error(v_row, 'thiếu mã học sinh');
  end if;

  -- KHÔNG TỰ NẮN. Thêm số 0, đổi VA-26 thành VA-2026, cắt khoảng trắng giữa — mỗi
  -- phép nắn là một lần bịa ra một em có thật. CHECK students_code_format_chk sẽ
  -- chặn ở tầng bảng, nhưng chặn ở đây cho ra một câu tiếng Việt thay vì một mã 23514.
  if v_ma_hs !~ '^VA-\d{4}-\d{5}$' then
    return core.record_cor_import_error(v_row,
      'mã học sinh sai khuôn VA-YYYY-NNNNN — hệ KHÔNG tự nắn, nhà trường sửa rồi nạp lại');
  end if;
  if v_ho_ten is null then
    return core.record_cor_import_error(v_row, 'thiếu họ tên học sinh');
  end if;
  if v_ma_co_so is null then
    return core.record_cor_import_error(v_row, 'thiếu mã cơ sở');
  end if;
  if v_ma_lop is null then
    return core.record_cor_import_error(v_row, 'thiếu mã lớp');
  end if;
  if v_nam_hoc is null then
    return core.record_cor_import_error(v_row, 'thiếu năm học (tham số --nam-hoc của lần nạp)');
  end if;

  -- Ngày sinh được phép trống (core.students.date_of_birth nullable), nhưng có mà
  -- đọc không ra thì là lỗi — im lặng biến nó thành NULL là mất dữ kiện mà không ai biết.
  begin
    v_ngay_sinh := nullif(btrim(v_row.payload ->> 'ngay_sinh'), '')::date;
  exception when others then
    return core.record_cor_import_error(v_row, 'ngày sinh không đọc được, cần dạng YYYY-MM-DD');
  end;

  begin
    v_hieu_luc := (v_row.payload ->> 'hieu_luc_tu')::date;
  exception when others then
    return core.record_cor_import_error(v_row, 'ngày hiệu lực ghi danh không đọc được, cần dạng YYYY-MM-DD');
  end;
  if v_hieu_luc is null then
    return core.record_cor_import_error(v_row, 'thiếu ngày hiệu lực ghi danh (tham số --hieu-luc-tu của lần nạp)');
  end if;

  -- ── Cơ sở ────────────────────────────────────────────────────────────────
  select id into v_school_id from core.schools where code = v_ma_co_so;
  if v_school_id is null then
    return core.record_cor_import_error(v_row, 'không có cơ sở nào mang mã này trong core.schools');
  end if;

  -- ── Lớp ──────────────────────────────────────────────────────────────────
  select id into v_class_id
    from core.classes
   where school_id = v_school_id and code = v_ma_lop and academic_year = v_nam_hoc;

  if v_class_id is null then
    if not p_tao_lop_moi then
      return core.record_cor_import_error(v_row,
        'lớp chưa tồn tại trong năm học này — job KHÔNG tự tạo lớp, chạy lại với --tao-lop-moi nếu đúng là lớp mới');
    end if;

    begin
      v_khoi := nullif(btrim(v_row.payload ->> 'khoi'), '')::smallint;
    exception when others then
      return core.record_cor_import_error(v_row, 'cột khối phải là số nguyên từ 0 đến 12');
    end;
    if v_khoi is null then
      -- CỐ Ý không suy khối từ mã lớp ('6A1' -> 6): đúng gần hết, và sai IM LẶNG ở
      -- đúng những lớp đặt tên khác quy ước. Bắt nhà trường ghi ra một cột.
      return core.record_cor_import_error(v_row,
        'muốn tạo lớp mới thì phải có cột khối (0-12) — hệ KHÔNG suy khối từ mã lớp');
    end if;

    begin
      insert into core.classes (school_id, code, academic_year, grade)
           values (v_school_id, v_ma_lop, v_nam_hoc, v_khoi)
      on conflict (school_id, code, academic_year) do nothing;
    exception when others then
      return core.record_cor_import_error(v_row, 'không tạo được lớp: ' || sqlerrm);
    end;

    select id into v_class_id
      from core.classes
     where school_id = v_school_id and code = v_ma_lop and academic_year = v_nam_hoc;
    if v_class_id is null then
      return core.record_cor_import_error(v_row, 'tạo lớp xong vẫn không tra ra lớp — dừng lại thay vì ghi danh vào hư không');
    end if;
  end if;

  -- ── Học sinh ─────────────────────────────────────────────────────────────
  select id, school_id into v_student_id, v_school_cu
    from core.students where student_code = v_ma_hs;

  if v_student_id is not null and v_school_cu <> v_school_id then
    -- Chuyển cơ sở là quyết định hành chính, không phải hệ quả của một dòng CSV.
    return core.record_cor_import_error(v_row,
      'mã học sinh này đang thuộc cơ sở khác — chuyển cơ sở phải có người duyệt',
      jsonb_build_object('co_so_dang_thuoc', (select code from core.schools where id = v_school_cu)));
  end if;

  begin
    insert into core.students (student_code, school_id, full_name, date_of_birth)
         values (v_ma_hs, v_school_id, v_ho_ten, v_ngay_sinh)
    on conflict (student_code)
    do update set full_name     = excluded.full_name,
                  -- coalesce: file mới để trống ngày sinh KHÔNG được xoá ngày sinh
                  -- đã có. Trống nghĩa là "lần này không gửi", không phải "không có".
                  date_of_birth = coalesce(excluded.date_of_birth, students.date_of_birth)
      returning id into v_student_id;
  exception when others then
    return core.record_cor_import_error(v_row, 'không ghi được vào sổ học sinh: ' || sqlerrm);
  end;

  -- ── Ghi danh — LUẬT 2 ở đầu file, đọc rồi quyết, TUYỆT ĐỐI không ON CONFLICT ──
  select e.class_id into v_lop_dang
    from core.enrollments e
   where e.student_id = v_student_id and e.valid_to is null
   order by e.valid_from desc
   limit 1;

  if v_lop_dang is null then
    begin
      -- Insert TRẦN, cố ý: nếu còn chồng lấn ngoài dự kiến (một kỳ đã đóng nhưng
      -- daterange vẫn phủ ngày hiệu lực) thì 23P01 nổ và rơi xuống nhánh dưới thành
      -- một dòng sổ lỗi CÓ TÊN. Nổ to hơn là nuốt.
      insert into core.enrollments (student_id, class_id, valid_from)
           values (v_student_id, v_class_id, v_hieu_luc);
    exception when others then
      return core.record_cor_import_error(v_row,
        'không ghi danh được vào lớp (kỳ học chồng lấn ngoài dự kiến): ' || sqlerrm);
    end;
  elsif v_lop_dang = v_class_id then
    -- Đúng lớp rồi. Đây là đường đi của lần nạp thứ hai cùng một file: no-op THẬT,
    -- không phải no-op nhờ ON CONFLICT nuốt.
    null;
  else
    select c.code into v_ten_lop_cu from core.classes c where c.id = v_lop_dang;
    -- KHÔNG tự đóng kỳ cũ. Lưu ý biên cho người xử: daterange dùng '[]' hai đầu
    -- ĐÓNG, nên đóng kỳ cũ phải đặt valid_to = ngày mở mới TRỪ 1 NGÀY; đặt bằng
    -- chính ngày mở mới là vẫn chồng và vẫn bị enrollments_no_overlap chặn.
    return core.record_cor_import_error(v_row,
      'em đang học lớp khác — chuyển lớp phải có người duyệt, hệ KHÔNG tự đóng kỳ học cũ',
      jsonb_build_object('lop_dang_hoc', v_ten_lop_cu, 'lop_trong_file', v_ma_lop));
  end if;

  update staging.raw_cor_imports set promoted_at = now() where id = v_row.id;
  return 'promoted';
end;
$$;

comment on function core.promote_cor_row(bigint, boolean) is
  'Đưa MỘT dòng danh sách học sinh từ staging vào core (0045). Không bao giờ ném lỗi vì dữ liệu: mọi hỏng hóc đi vào staging.import_errors kèm lý do tiếng Việt (§8) và đánh dấu failed_at để nạp lại không nhân bản (§9). Ghi danh đọc-rồi-quyết, CẤM ON CONFLICT vì ràng buộc EXCLUDE nuốt im lặng dòng chuyển lớp.';

-- ---------------------------------------------------------------------------
-- 6. doi_soat_vang_mat — em có trong sổ mà không có trong file mới
-- ---------------------------------------------------------------------------
-- LUẬT 3 ở đầu file, viết thành SQL. Hàm này KHÔNG chạm một dòng dữ liệu nghiệp vụ
-- nào: không update students.status, không đóng enrollments, không xoá gì. Nó chỉ
-- ghi ra một danh sách chờ người xác nhận.
--
-- Phạm vi đối soát cố tình HẸP: chỉ những lớp mà chính lô này có nhắc tới. So cả
-- trường sẽ báo "vắng mặt" cho toàn bộ học sinh của các khối không nằm trong file —
-- một danh sách vài nghìn dòng vô nghĩa, và một hàng đợi vô nghĩa là một hàng đợi
-- không ai đọc.
--
-- Chạy lại là no-op (§9): external_id = '<ma_lo>:<student_code>' + cùng reason nên
-- import_errors_dedup_uq chặn dòng thứ hai.
create or replace function core.doi_soat_vang_mat(p_ma_lo text)
returns integer
language plpgsql
security definer
set search_path = core, staging, pg_catalog
as $$
declare
  v_n integer;
begin
  with lo as (
    select r.payload
      from staging.raw_cor_imports r
     where r.source = 'cor'
       and r.external_id like p_ma_lo || ':%'
  ),
  ma_trong_lo as (
    -- `is not null` KHÔNG phải trang trí: `x not in (tập có NULL)` trả NULL cho MỌI
    -- dòng, nên chỉ cần một dòng trong file thiếu mã học sinh là toàn bộ phép đối
    -- soát này im lặng trả 0 — đúng kiểu hỏng mà cả file đang chống.
    select distinct btrim(payload ->> 'ma_hoc_sinh') as ma_hoc_sinh
      from lo
     where nullif(btrim(payload ->> 'ma_hoc_sinh'), '') is not null
  ),
  lop_trong_lo as (
    -- Chỉ những lớp TRA RA ĐƯỢC. Dòng nào có mã lớp sai thì đã nằm ở sổ lỗi rồi;
    -- lấy nó vào đây sẽ không ra lớp nào và không thêm được thông tin gì.
    select distinct c.id
      from lo
      join core.schools s on s.code    = btrim(lo.payload ->> 'ma_co_so')
      join core.classes c on c.school_id = s.id
                         and c.code      = btrim(lo.payload ->> 'ma_lop')
                         and c.academic_year = btrim(lo.payload ->> 'nam_hoc')
  ),
  vang_mat as (
    select st.student_code, st.full_name, c.code as ma_lop
      from core.enrollments e
      join core.students st on st.id = e.student_id
      join core.classes  c  on c.id  = e.class_id
     where e.valid_to is null
       and e.class_id in (select id from lop_trong_lo)
       and st.student_code not in (select ma_hoc_sinh from ma_trong_lo)
  ),
  da_ghi as (
    insert into staging.import_errors (source, raw_id, external_id, reason, payload)
    select 'cor', null, p_ma_lo || ':' || v.student_code,
           'vắng mặt trong file mới — cần người xác nhận, hệ KHÔNG tự cho em nghỉ học',
           jsonb_build_object(
             'ma_lo',       p_ma_lo,
             'ma_hoc_sinh', v.student_code,
             'ho_ten',      v.full_name,
             'ma_lop',      v.ma_lop,
             'giai_thich',  'Em này đang có kỳ học mở ở lớp trên nhưng không xuất hiện trong file vừa nạp. Hai khả năng cho ra CÙNG một dấu hiệu: trường xuất nhầm bộ lọc, hoặc em chuyển trường thật. Hệ không phân biệt được nên không kết luận.')
      from vang_mat v
    on conflict (source, external_id, reason) do nothing
    returning 1
  )
  select count(*)::int into v_n from da_ghi;

  return v_n;
end;
$$;

comment on function core.doi_soat_vang_mat(text) is
  'Đối soát em có trong sổ mà không có trong file vừa nạp (0045). CHỈ GHI DANH SÁCH CHỜ NGƯỜI — không đóng kỳ học, không đổi status. "Trường xuất nhầm bộ lọc" và "em chuyển trường thật" cho cùng một dấu hiệu; hệ không có phép đo nào phân biệt nên không được kết luận. Chạy lại trả 0 (§9).';

-- ---------------------------------------------------------------------------
-- 7. Quyền thi hành — deny-by-default
-- ---------------------------------------------------------------------------
-- PostgreSQL mặc định cấp EXECUTE cho PUBLIC trên mọi hàm mới. Bốn hàm ở trên là
-- SECURITY DEFINER và ba trong số đó GHI vào core.students / core.classes /
-- core.enrollments — tức là chúng chạy bằng quyền chủ schema, vượt qua mọi RLS.
-- Để `authenticated` (mọi học sinh, phụ huynh, giáo viên đã đăng nhập) gọi được là
-- mở đúng cánh cửa mà §8 sinh ra để đóng: một phiên bất kỳ tự tạo học sinh, tự đổi
-- lớp, tự ghi vào sổ lỗi.
revoke execute on function staging.nguong_loi_nap(text)                              from public;
revoke execute on function staging.ingest_cor_row(text, jsonb)                        from public;
revoke execute on function staging.ghi_loi_nap(text, text, jsonb)                     from public;
revoke execute on function core.record_cor_import_error(staging.raw_cor_imports, text, jsonb) from public;
revoke execute on function core.promote_cor_row(bigint, boolean)                      from public;
revoke execute on function core.doi_soat_vang_mat(text)                               from public;

-- CỐ Ý không cấp gì cho vai `connector`, khác 0028. Nguồn embed là một app ngoài tự
-- đẩy webhook nên nó cần một vai hẹp; nạp danh sách là NGƯỜI VẬN HÀNH chạy một lệnh
-- trên máy chủ với một file trong tay. Cấp thêm quyền cho connector ở đây là mở một
-- bề mặt không ai đang dùng.
-- staging.v_loi_nap_danh_sach cũng không cấp cho authenticated: nó trả họ tên học
-- sinh chưa qua bất kỳ cổng RLS nào.

-- ---------------------------------------------------------------------------
-- 8. VÌ SAO KHÔNG CÓ DÒNG NÀO THÊM VÀO ops.job_schedule
-- ---------------------------------------------------------------------------
-- Nạp danh sách là việc CHẠY TAY THEO YÊU CẦU, không phải việc theo lịch: nó cần một
-- file do nhà trường gửi, hai tham số do người vận hành gõ (--nam-hoc, --hieu-luc-tu),
-- và một người đọc sổ lỗi sau đó. Không có file thì không có gì để chạy.
--
-- Khai nó vào ops.job_schedule sẽ làm đúng cái hỏng mà 0041 vừa dựng đèn để chống:
-- ops.v_job_health sẽ hiện 'chua_chay' rồi 'qua_han' vĩnh viễn giữa hai đợt tuyển
-- sinh, needs_attention bật mãi, và một cảnh báo lúc nào cũng sáng là một cảnh báo
-- đã chết (bài học 0011/ADR-016, chép lại ở comment mở đầu 0041).
--
-- Nhưng job vẫn GHI SỔ: tools/jobs/run-nap-danh-sach.mjs gọi ops.start_job_run
-- ('nap_danh_sach') / ops.finish_job_run() như mọi job khác, nên mỗi lần nạp để lại
-- một dòng ops.job_runs có thời điểm, số dòng, số lỗi. Có sổ mà không có lịch — đúng
-- hình dạng của run-anonymize-user.mjs (0033), việc chạy khi có người yêu cầu.
-- Câu hỏi "lần nạp gần nhất lúc nào, bao nhiêu lỗi" vẫn trả lời được:
--   select started_at, status, metrics from ops.job_runs
--    where job_name = 'nap_danh_sach' order by id desc limit 5;

commit;
