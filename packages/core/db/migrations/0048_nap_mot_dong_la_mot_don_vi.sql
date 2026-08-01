-- 0048_nap_mot_dong_la_mot_don_vi.sql
-- MỘT DÒNG NẠP LÀ MỘT ĐƠN VỊ — hoặc vào trọn, hoặc không đổi một cột nào.
--
-- ══ CÁI HỎNG THẬT, ĐO ĐƯỢC 01/08/2026 trên hub_dev ═══════════════════════════
--
-- Dựng một em có thật rồi nạp một lô xếp em sang lớp khác:
--
--   insert into core.students (student_code, school_id, full_name, date_of_birth)
--   values ('VA-2026-97001', <Q7>, 'Bùi Thị Lan, Jr', '2015-02-02');
--   insert into core.enrollments (student_id, class_id, valid_from) values (..., <6A1>, '2026-09-05');
--
--   select core.promote_cor_row(staging.ingest_cor_row('LOX:VA-2026-97001',
--     jsonb_build_object('ma_hoc_sinh','VA-2026-97001','ho_ten','TÊN TRONG FILE',
--       'ngay_sinh','2016-12-31','ma_co_so','VA-Q7','ma_lop','6A2', ...)));
--
--   ket_qua      -> import_error          (ĐÚNG thiết kế: chuyển lớp phải có người duyệt)
--   full_name    -> 'TÊN TRONG FILE'      (SAI: em bị đổi tên)
--   date_of_birth-> 2016-12-31            (SAI: em bị đổi ngày sinh)
--
-- Màn hình của người vận hành lúc đó in:  "Đã vào kho: 0 · Vào sổ lỗi: 1".
-- Người đọc câu đó tin là kho không đổi. Kho đã đổi. Đây là GHI MỘT PHẦN TRONG IM
-- LẶNG — đúng loại hỏng mà cả hệ này dựng ra để chống, và lần này chính bộ nạp làm.
--
-- Vì sao xảy ra: `0045` viết phần ánh xạ theo trình tự tự nhiên của câu chuyện
-- (cơ sở -> lớp -> học sinh -> ghi danh) và mỗi lần từ chối là một `return
-- core.record_cor_import_error(...)`. Trong PL/pgSQL, `return` KHÔNG hoàn tác gì
-- cả: mọi câu INSERT/UPDATE chạy trước đó đã nằm trong transaction và ở lại đó.
-- Nên "từ chối" của `0045` thật ra có nghĩa là "làm tới đâu giữ tới đó rồi ghi
-- một dòng sổ lỗi".
--
-- ĐO ĐƯỢC CHỖ THỨ HAI, cùng gốc, chưa ai nêu (rà lại toàn bộ đường promote):
--
--   select core.promote_cor_row(staging.ingest_cor_row('LOX:VA-2026-00419',
--     jsonb_build_object('ma_hoc_sinh','VA-2026-00419','ma_co_so','VA-Q7',
--       'ma_lop','9Z9','khoi','9', ...)), true);   -- có cờ --tao-lop-moi
--
--   ket_qua               -> import_error   (em đang thuộc cơ sở khác — đúng)
--   count(*) core.classes -> 1 lớp '9Z9'    (SAI: LỚP MA đã được tạo)
--
-- Tức `0045` tạo lớp ở dòng 374 rồi mới tra học sinh ở dòng 390. Dòng bị từ chối
-- vẫn để lại một lớp trống trong `core.classes` — đúng cái "lớp ma" mà chính chú
-- thích của `0045` nói là lý do bắt phải có cờ `--tao-lop-moi`. Cờ chặn được ca gõ
-- nhầm mã lớp, không chặn được ca này.
--
-- Danh sách đầy đủ các chỗ "ghi rồi mới từ chối" trong `0045` (rà hết, không chỉ
-- chỗ vừa nêu) — ba lệnh ghi, theo thứ tự chúng chạy:
--   (a) insert core.classes            (0045:374, chỉ khi p_tao_lop_moi)
--       còn 5 cửa từ chối phía sau nó: tra lại lớp không ra · em thuộc cơ sở khác ·
--       ghi sổ học sinh hỏng · em đang học lớp khác · ghi danh chồng lấn.
--   (b) upsert core.students           (0045:401)
--       còn 2 cửa từ chối phía sau: em đang học lớp khác · ghi danh chồng lấn.
--       Ca (b) + "em đang học lớp khác" chính là ca đo được ở đầu file.
--       Ca (b) + "ghi danh chồng lấn" cũng có thật: em có kỳ học ĐÃ ĐÓNG mà
--       daterange vẫn phủ ngày hiệu lực -> `v_lop_dang` là NULL -> insert trần ->
--       23P01 -> từ chối, trong khi họ tên/ngày sinh đã bị ghi đè.
--   (c) insert core.enrollments        (0045:425) — không còn cửa từ chối nào phía
--       sau, đây là lệnh cuối. Không hỏng.
-- `core.doi_soat_vang_mat()` chỉ ghi `staging.import_errors`, không chạm dữ liệu
-- nghiệp vụ — đã đúng từ đầu, không sửa.
--
-- ══ CHỌN ĐƯỜNG NÀO: GỘP CỨNG, KHÔNG TÁCH LÀM HAI KẾT QUẢ ═════════════════════
--
-- Có một lập luận nghe rất hợp lý cho việc TÁCH: trường sửa lỗi chính tả tên em ở
-- cùng cái file xếp em sang lớp mới; cập nhật hồ sơ là ĐÚNG, chỉ có chuyển lớp là
-- phải chờ duyệt. Đã cân, và vẫn chọn GỘP CỨNG. Ba lý do, theo thứ tự sức nặng:
--
--   1. Ca đó ĐÃ CÓ ĐƯỜNG ĐI SẴN, không cần trạng thái mới. Sửa chính tả mà không
--      đổi lớp thì dòng đó đi thẳng nhánh `v_lop_dang = v_class_id` -> promoted ->
--      tên được cập nhật. Đường "vừa sửa tên vừa đổi lớp" là đường DUY NHẤT bị
--      chặn, và nó bị chặn vì phần chuyển lớp cần người duyệt; sửa xong phần đó
--      rồi nạp lại thì tên cũng vào theo. Tách ra chỉ mua được việc "tên vào sớm
--      hơn vài ngày", trả bằng một trạng thái thứ sáu trong hợp đồng trả về.
--
--   2. Từ chối một dòng nghĩa là KHÔNG TIN dòng đó. Lý do duy nhất khiến hệ từ
--      chối phần ghi danh là "hệ không có căn cứ để tin cách file này xếp em".
--      Một file mà ta không tin ở cột `ma_lop` thì không có gì bảo đảm cột
--      `ho_ten`/`ngay_sinh` của chính dòng đó đáng tin hơn — ca hỏng thường gặp
--      nhất của file xuất từ Excel là LỆCH CỘT, và lệch cột làm sai mọi cột cùng
--      lúc. Áp một nửa dòng từ một file đang bị nghi là chọn tin đúng những cột
--      mình không kiểm được.
--
--   3. Trạng thái "vào một nửa" không có đường lùi. `promoted_at` và `failed_at`
--      là hai cột loại trừ nhau; một dòng vừa-ghi-hồ-sơ-vừa-chờ-duyệt-lớp không
--      thuộc cột nào, và câu hỏi "gọi lại promote thì sao" (§9) mất câu trả lời
--      đơn nghĩa.
--
-- NHƯNG KHÔNG ĐƯỢC IM. Từ chối cả dòng mà không nói gì là giấu mất việc file có
-- mang theo một thay đổi hồ sơ. Nên mỗi dòng bị từ chối SAU KHI đã tra ra em đều
-- kèm khối `ho_so_chua_ap_dung` trong payload sổ lỗi: tên trong sổ / tên trong
-- file / ngày sinh trong sổ / ngày sinh trong file. Người xử đọc được đủ hai vế
-- rồi tự quyết, thay vì phải tự đi tra hoặc tệ hơn là không biết có gì để tra.
-- `staging.v_loi_nap_danh_sach` thêm một cột cho khối đó để không phải bới jsonb.
--
-- ══ CÁCH THI HÀNH ════════════════════════════════════════════════════════════
--
-- PL/pgSQL chỉ có ĐÚNG MỘT cách hoàn tác phần đã ghi mà không giết cả transaction:
-- một khối `begin ... exception when ... end`. Khối đó là một subtransaction; khi
-- một exception bị bắt, MỌI thay đổi bên trong khối bị hoàn tác, còn transaction
-- ngoài vẫn sống để ghi tiếp dòng sổ lỗi.
--
-- Nên toàn bộ phần ánh xạ được bọc vào một khối con, và mọi cửa từ chối đổi từ
-- `return core.record_cor_import_error(...)` thành
-- `raise exception using errcode = 'HB045', message = <lý do>, detail = <jsonb>`.
-- Lý do và ngữ cảnh đi qua `get stacked diagnostics` ra ngoài khối, rồi mới ghi sổ
-- lỗi — ghi ở NGOÀI khối nên nó không bị cuốn theo lần hoàn tác.
--
-- 'HB045' là SQLSTATE tự đặt (HB = Hub, 045 = migration sinh ra hợp đồng này).
-- Không đụng lớp mã chuẩn nào của PostgreSQL; đã thử round-trip message + detail
-- trên hub_dev trước khi viết.
--
-- Thêm một lớp nữa mà `0045` không có: `when others`. Hợp đồng của promote() là
-- KHÔNG BAO GIỜ ném lỗi vì dữ liệu, nhưng `0045` chỉ đỡ được những chỗ nó đoán
-- trước (parse ngày, insert lớp, insert học sinh, insert ghi danh). Một lỗi ngoài
-- dự kiến ở chỗ khác sẽ bay thẳng ra ngoài và giết cả lô. Nay nó cũng thành một
-- dòng sổ lỗi có tên, và cũng được hoàn tác sạch.
--
-- KHÔNG tạo thêm một đối tượng schema nào — cùng hai cái tên cũ
-- (`core.promote_cor_row`, `staging.v_loi_nap_danh_sach`), viết lại thân. Có chủ ý:
-- tách ra hàm phụ sẽ đẻ ra tên mới, mà tên mới thì phải được gọi tên trong
-- `02-database.md` (cổng 2 của `tools/check-sync.mjs`) — và `02-database.md` đang
-- do một gói khác giữ trong cùng đợt này. Phần tài liệu của gói này nằm ở
-- `danh-cho-may/.wip/nap-danh-sach-tu-choi-phai-sach.md` cho lượt gộp.
--
-- KHÔNG sửa đè `0045`: file đó đã áp lên hub_dev, sửa đè là làm cho hai database
-- cùng số hiệu mà khác nội dung.
--
-- Phụ thuộc: 0045 (staging.raw_cor_imports.failed_at, staging.import_errors,
-- core.record_cor_import_error, staging.v_loi_nap_danh_sach).

begin;

-- ---------------------------------------------------------------------------
-- 1. promote_cor_row — viết lại: một dòng là một đơn vị
-- ---------------------------------------------------------------------------
-- Hợp đồng trả về KHÔNG ĐỔI, vẫn đúng một trong năm chuỗi cũ:
--   'raw_not_found' · 'already_promoted' · 'already_failed' · 'import_error' · 'promoted'
-- Thêm đúng một lời hứa: khi trả 'import_error' thì core.students / core.classes /
-- core.enrollments KHÔNG đổi một cột nào. Lời hứa đó có test đứng sau
-- (0048_nap_mot_dong_la_mot_don_vi_test.sql), và bản in ra màn hình của
-- tools/jobs/run-nap-danh-sach.mjs nói đúng câu đó.
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
  -- Giá trị ĐANG NẰM TRONG SỔ, đọc trước khi ghi đè. Không giữ lại thì lúc từ chối
  -- không còn cách nào nói cho người xử biết file định đổi cái gì.
  v_ten_cu     text;
  v_ngay_cu    date;
  v_ho_so_khac jsonb := '{}'::jsonb;
  -- Đường về của một lần từ chối, đi qua get stacked diagnostics.
  v_ly_do      text;
  v_them_txt   text;
  v_ma_loi     text;
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

  -- ═════ KHỐI CON = RANH GIỚI HOÀN TÁC ═════════════════════════════════════
  -- Mọi lệnh ghi vào core.* nằm TRỌN trong khối này. Bất kỳ lần từ chối nào cũng
  -- là một exception, và exception bị bắt ở dưới cuốn sạch mọi thứ đã ghi trong
  -- khối. Đây là toàn bộ nội dung của câu "một dòng nạp là một đơn vị".
  begin
    v_ma_hs    := nullif(btrim(v_row.payload ->> 'ma_hoc_sinh'), '');
    v_ho_ten   := nullif(btrim(v_row.payload ->> 'ho_ten'), '');
    v_ma_co_so := nullif(btrim(v_row.payload ->> 'ma_co_so'), '');
    v_ma_lop   := nullif(btrim(v_row.payload ->> 'ma_lop'), '');
    v_nam_hoc  := nullif(btrim(v_row.payload ->> 'nam_hoc'), '');

    -- ── Các cột bắt buộc ───────────────────────────────────────────────────
    if v_ma_hs is null then
      raise exception using errcode = 'HB045', message = 'thiếu mã học sinh';
    end if;

    -- KHÔNG TỰ NẮN. Thêm số 0, đổi VA-26 thành VA-2026, cắt khoảng trắng giữa — mỗi
    -- phép nắn là một lần bịa ra một em có thật. CHECK students_code_format_chk sẽ
    -- chặn ở tầng bảng, nhưng chặn ở đây cho ra một câu tiếng Việt thay vì mã 23514.
    if v_ma_hs !~ '^VA-\d{4}-\d{5}$' then
      raise exception using errcode = 'HB045',
        message = 'mã học sinh sai khuôn VA-YYYY-NNNNN — hệ KHÔNG tự nắn, nhà trường sửa rồi nạp lại';
    end if;
    if v_ho_ten is null then
      raise exception using errcode = 'HB045', message = 'thiếu họ tên học sinh';
    end if;
    if v_ma_co_so is null then
      raise exception using errcode = 'HB045', message = 'thiếu mã cơ sở';
    end if;
    if v_ma_lop is null then
      raise exception using errcode = 'HB045', message = 'thiếu mã lớp';
    end if;
    if v_nam_hoc is null then
      raise exception using errcode = 'HB045',
        message = 'thiếu năm học (tham số --nam-hoc của lần nạp)';
    end if;

    -- Ngày sinh được phép trống (core.students.date_of_birth nullable), nhưng có mà
    -- đọc không ra thì là lỗi — im lặng biến nó thành NULL là mất dữ kiện mà không ai biết.
    begin
      v_ngay_sinh := nullif(btrim(v_row.payload ->> 'ngay_sinh'), '')::date;
    exception when others then
      raise exception using errcode = 'HB045',
        message = 'ngày sinh không đọc được, cần dạng YYYY-MM-DD';
    end;

    begin
      v_hieu_luc := (v_row.payload ->> 'hieu_luc_tu')::date;
    exception when others then
      raise exception using errcode = 'HB045',
        message = 'ngày hiệu lực ghi danh không đọc được, cần dạng YYYY-MM-DD';
    end;
    if v_hieu_luc is null then
      raise exception using errcode = 'HB045',
        message = 'thiếu ngày hiệu lực ghi danh (tham số --hieu-luc-tu của lần nạp)';
    end if;

    -- ── Cơ sở ──────────────────────────────────────────────────────────────
    select id into v_school_id from core.schools where code = v_ma_co_so;
    if v_school_id is null then
      raise exception using errcode = 'HB045',
        message = 'không có cơ sở nào mang mã này trong core.schools';
    end if;

    -- ── Học sinh: TRA TRƯỚC, GHI SAU ───────────────────────────────────────
    -- Đổi thứ tự so với 0045 (0045 tạo lớp trước rồi mới tra em). Hai lý do:
    --   · phần lớn cửa từ chối gắn với em nằm ở đây; tra trước thì khối con hầu
    --     như không phải hoàn tác gì, hoàn tác chỉ còn là lưới an toàn.
    --   · đọc được tên/ngày sinh CŨ trước khi có bất kỳ lệnh ghi nào, để dựng
    --     `ho_so_chua_ap_dung` cho sổ lỗi.
    select id, school_id, full_name, date_of_birth
      into v_student_id, v_school_cu, v_ten_cu, v_ngay_cu
      from core.students where student_code = v_ma_hs;

    if v_student_id is not null then
      -- File mang theo thay đổi hồ sơ nào? Ghi ra để lần từ chối nói được đủ hai vế.
      -- `is distinct from` chứ không `<>`: NULL phải so được, không thì em chưa có
      -- ngày sinh sẽ không bao giờ bị coi là "file có đổi".
      if v_ten_cu is distinct from v_ho_ten then
        v_ho_so_khac := v_ho_so_khac || jsonb_build_object(
          'ho_ten_trong_so', v_ten_cu, 'ho_ten_trong_file', v_ho_ten);
      end if;
      -- Chỉ tính là "đổi" khi file CÓ ghi ngày sinh: trống nghĩa là "lần này không
      -- gửi", và nhánh promoted cũng coalesce đúng như vậy.
      if v_ngay_sinh is not null and v_ngay_sinh is distinct from v_ngay_cu then
        v_ho_so_khac := v_ho_so_khac || jsonb_build_object(
          'ngay_sinh_trong_so', v_ngay_cu, 'ngay_sinh_trong_file', v_ngay_sinh);
      end if;
      if v_ho_so_khac <> '{}'::jsonb then
        v_ho_so_khac := jsonb_build_object('ho_so_chua_ap_dung',
          v_ho_so_khac || jsonb_build_object('giai_thich',
            'File có mang theo thay đổi hồ sơ này, nhưng dòng bị TỪ CHỐI nên hệ KHÔNG ghi gì cả — một dòng nạp là một đơn vị. Xử xong lý do từ chối rồi nạp lại thì thay đổi trên vào theo.'));
      end if;
    end if;

    if v_student_id is not null and v_school_cu <> v_school_id then
      -- Chuyển cơ sở là quyết định hành chính, không phải hệ quả của một dòng CSV.
      raise exception using errcode = 'HB045',
        message = 'mã học sinh này đang thuộc cơ sở khác — chuyển cơ sở phải có người duyệt',
        detail  = (jsonb_build_object('co_so_dang_thuoc',
                     (select code from core.schools where id = v_school_cu))
                   || v_ho_so_khac)::text;
    end if;

    -- ── Lớp ────────────────────────────────────────────────────────────────
    -- p_tao_lop_moi mặc định FALSE, có chủ ý. Lớp chưa tồn tại thì mặc định là LỖI:
    -- core.classes cần grade và academic_year mà file có thể không có, và một lỗi gõ
    -- '6A11' thay '6A1' sẽ đẻ ra một lớp ma thay vì kêu lên.
    select id into v_class_id
      from core.classes
     where school_id = v_school_id and code = v_ma_lop and academic_year = v_nam_hoc;

    if v_class_id is null then
      if not p_tao_lop_moi then
        -- detail mang v_ho_so_khac: đây là cửa từ chối THƯỜNG GẶP NHẤT (gõ nhầm '6A11'
        -- thay '6A1'), và cũng là dòng mà file hay mang kèm một sửa hồ sơ. Thiếu detail
        -- ở đây thì cột ho_so_chua_ap_dung ra NULL, người xử đọc NULL thành "file không
        -- định đổi gì" — im lặng bị hiểu thành kết luận, đúng thứ cả file này chống.
        raise exception using errcode = 'HB045',
          message = 'lớp chưa tồn tại trong năm học này — job KHÔNG tự tạo lớp, chạy lại với --tao-lop-moi nếu đúng là lớp mới',
          detail  = v_ho_so_khac::text;
      end if;

      begin
        v_khoi := nullif(btrim(v_row.payload ->> 'khoi'), '')::smallint;
      exception when others then
        raise exception using errcode = 'HB045',
          message = 'cột khối phải là số nguyên từ 0 đến 12',
          detail  = v_ho_so_khac::text;
      end;
      if v_khoi is null then
        -- CỐ Ý không suy khối từ mã lớp ('6A1' -> 6): đúng gần hết, và sai IM LẶNG ở
        -- đúng những lớp đặt tên khác quy ước. Bắt nhà trường ghi ra một cột.
        raise exception using errcode = 'HB045',
          message = 'muốn tạo lớp mới thì phải có cột khối (0-12) — hệ KHÔNG suy khối từ mã lớp',
          detail  = v_ho_so_khac::text;
      end if;

      -- LỆNH GHI THỨ NHẤT. Từ đây trở xuống, mọi lần từ chối đều hoàn tác lệnh này —
      -- đó là lý do lớp ma '9Z9' đo được ở đầu file không còn ở lại nữa.
      begin
        insert into core.classes (school_id, code, academic_year, grade)
             values (v_school_id, v_ma_lop, v_nam_hoc, v_khoi)
        on conflict (school_id, code, academic_year) do nothing;
      exception when others then
        raise exception using errcode = 'HB045',
          message = 'không tạo được lớp: ' || sqlerrm,
          detail  = v_ho_so_khac::text;
      end;

      select id into v_class_id
        from core.classes
       where school_id = v_school_id and code = v_ma_lop and academic_year = v_nam_hoc;
      if v_class_id is null then
        raise exception using errcode = 'HB045',
          message = 'tạo lớp xong vẫn không tra ra lớp — dừng lại thay vì ghi danh vào hư không',
          detail  = v_ho_so_khac::text;
      end if;
    end if;

    -- ── Ghi danh: QUYẾT TRƯỚC, GHI SAU ─────────────────────────────────────
    -- LUẬT 2 của 0045 giữ nguyên: core.enrollments có ràng buộc EXCLUDE chứ không có
    -- unique thường, và `on conflict do nothing` trên nó NUỐT IM LẶNG cả dòng chuyển
    -- lớp. Nên: ĐỌC RỒI QUYẾT, không ON CONFLICT dù có target hay không.
    --
    -- Phép quyết chuyển lên TRƯỚC lệnh ghi core.students, khác 0045. Đây chính là
    -- chỗ hỏng đo được ở đầu file: 0045 ghi tên/ngày sinh xong mới hỏi "em có đang
    -- học lớp khác không". Khối con đã đủ để hoàn tác, nhưng quyết trước vẫn tốt
    -- hơn — hoàn tác một việc chưa làm là rẻ nhất, và người đọc code thấy ngay thứ
    -- tự đúng thay vì phải tin vào lưới.
    select e.class_id into v_lop_dang
      from core.enrollments e
     where e.student_id = v_student_id and e.valid_to is null
     order by e.valid_from desc
     limit 1;

    if v_student_id is not null and v_lop_dang is not null and v_lop_dang <> v_class_id then
      select c.code into v_ten_lop_cu from core.classes c where c.id = v_lop_dang;
      -- KHÔNG tự đóng kỳ cũ. Lưu ý biên cho người xử: daterange dùng '[]' hai đầu
      -- ĐÓNG, nên đóng kỳ cũ phải đặt valid_to = ngày mở mới TRỪ 1 NGÀY; đặt bằng
      -- chính ngày mở mới là vẫn chồng và vẫn bị enrollments_no_overlap chặn.
      raise exception using errcode = 'HB045',
        message = 'em đang học lớp khác — chuyển lớp phải có người duyệt, hệ KHÔNG tự đóng kỳ học cũ và KHÔNG ghi một cột nào của em',
        detail  = (jsonb_build_object('lop_dang_hoc', v_ten_lop_cu, 'lop_trong_file', v_ma_lop)
                   || v_ho_so_khac)::text;
    end if;

    -- LỆNH GHI THỨ HAI — tới đây mọi phép quyết đã xong.
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
      raise exception using errcode = 'HB045',
        message = 'không ghi được vào sổ học sinh: ' || sqlerrm,
        detail  = v_ho_so_khac::text;
    end;

    -- LỆNH GHI THỨ BA. `v_lop_dang` được đọc TRƯỚC khi có em trong sổ nên với em mới
    -- nó luôn NULL — đúng, vì em mới thì chưa có kỳ nào.
    if v_lop_dang is null then
      begin
        -- Insert TRẦN, cố ý: nếu còn chồng lấn ngoài dự kiến (một kỳ đã đóng nhưng
        -- daterange vẫn phủ ngày hiệu lực) thì 23P01 nổ và rơi xuống nhánh dưới thành
        -- một dòng sổ lỗi CÓ TÊN. Nổ to hơn là nuốt.
        insert into core.enrollments (student_id, class_id, valid_from)
             values (v_student_id, v_class_id, v_hieu_luc);
      exception when others then
        raise exception using errcode = 'HB045',
          message = 'không ghi danh được vào lớp (kỳ học chồng lấn ngoài dự kiến): ' || sqlerrm,
          detail  = v_ho_so_khac::text;
      end;
    end if;
    -- Còn lại: v_lop_dang = v_class_id, tức đúng lớp rồi. Đây là đường đi của lần nạp
    -- thứ hai cùng một file: no-op THẬT, không phải no-op nhờ ON CONFLICT nuốt.

    update staging.raw_cor_imports set promoted_at = now() where id = v_row.id;

  exception
    when sqlstate 'HB045' then
      -- Mọi thứ khối con vừa ghi đã bị hoàn tác. Dòng sổ lỗi được ghi Ở ĐÂY, ngoài
      -- khối, nên nó SỐNG. Đây là toàn bộ mẹo của file này.
      get stacked diagnostics v_ly_do = message_text, v_them_txt = pg_exception_detail;
      return core.record_cor_import_error(
        v_row, v_ly_do, coalesce(nullif(v_them_txt, ''), '{}')::jsonb);

    when others then
      -- Lưới cuối. 0045 không có nhánh này: một lỗi ngoài bốn chỗ nó đoán trước sẽ
      -- bay ra ngoài và giết cả lô đang chạy. Hợp đồng nói promote() KHÔNG BAO GIỜ
      -- ném lỗi vì dữ liệu, nên chỗ nào cũng phải giữ được lời đó.
      get stacked diagnostics v_ly_do = message_text, v_ma_loi = returned_sqlstate;
      return core.record_cor_import_error(
        v_row,
        'lỗi ngoài dự kiến khi đưa dòng vào kho — dòng KHÔNG ghi được cột nào, cần người xem: ' || v_ly_do,
        jsonb_build_object('sqlstate', v_ma_loi) || v_ho_so_khac);
  end;

  return 'promoted';
end;
$$;

comment on function core.promote_cor_row(bigint, boolean) is
  'Đưa MỘT dòng danh sách học sinh từ staging vào core (0045, viết lại ở 0048). MỘT DÒNG LÀ MỘT ĐƠN VỊ: trả ''promoted'' thì vào trọn, trả ''import_error'' thì core.students/core.classes/core.enrollments KHÔNG đổi một cột nào — phần ánh xạ nằm trong một khối con, mọi lần từ chối là exception HB045 nên được hoàn tác, dòng sổ lỗi ghi ở ngoài khối nên sống. Không bao giờ ném lỗi vì dữ liệu (§8), đánh dấu failed_at để nạp lại không nhân bản (§9). Ghi danh đọc-rồi-quyết, CẤM ON CONFLICT vì ràng buộc EXCLUDE nuốt im lặng dòng chuyển lớp.';

-- CREATE OR REPLACE FUNCTION giữ nguyên quyền cũ, nhưng nêu lại cho tường minh:
-- hàm này SECURITY DEFINER và ghi vào core.students/classes/enrollments, để
-- `authenticated` gọi được là mở đúng cánh cửa §8 sinh ra để đóng.
revoke execute on function core.promote_cor_row(bigint, boolean) from public;

-- ---------------------------------------------------------------------------
-- 2. v_loi_nap_danh_sach — thêm cột cho thứ file định đổi mà hệ đã không đổi
-- ---------------------------------------------------------------------------
-- Không có cột này thì `ho_so_chua_ap_dung` nằm chôn trong jsonb, và một thông tin
-- phải bới mới thấy là một thông tin không ai thấy. Cột thêm ở CUỐI danh sách để
-- create or replace view chấp nhận (Postgres chỉ cho nối thêm cột vào đuôi).
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
       e.payload,
       e.payload -> 'ho_so_chua_ap_dung'      as ho_so_chua_ap_dung
  from staging.import_errors e
 where e.source = 'cor'
 order by e.created_at desc, dong_trong_file;

comment on view staging.v_loi_nap_danh_sach is
  'Hàng đợi người-xử của nguồn cor, đọc được bằng mắt: dòng nào trong file, em nào, vì sao, và (0048) file định đổi hồ sơ gì mà hệ đã KHÔNG đổi. Không cấp cho authenticated — đây là dữ liệu học sinh chưa qua cổng RLS nào.';

commit;
