-- 0054_sua_duoc_chu_ky_da_ky.sql
-- Thi hành ADR-031 (duyệt 06/08/2026, chủ đầu tư quyết trực tiếp): sửa được một quyết
-- định duyệt Báo cáo Trưởng thành ĐÃ KÝ, nhưng chỉ qua một đường riêng có cờ tường minh,
-- lý do bắt buộc và một dòng sổ vết.
--
-- Gói này là BẢN SAO CÙNG HÌNH DẠNG của `0053` cho miền báo cáo. Cùng ba mảnh: một sổ
-- chỉ thêm (`report.report_decisions` ↔ `attendance.late_decisions`), một hàm invoker ghi
-- sổ và đổi trạng thái trong MỘT câu lệnh (`report.decide_reports` ↔
-- `attendance.decide_late_checkins`), và cùng một ngữ nghĩa `skipped` (bỏ qua chứ không
-- ném lỗi). Chép hình dạng là có chủ ý: hai màn của cùng một cô chủ nhiệm mà hành xử khác
-- nhau ở cùng một thao tác (chọn hàng loạt, bấm lại, em ngoài lớp) là chỗ người dùng học
-- sai một lần rồi mang cái sai đó sang màn kia.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ĐO THẬT TRƯỚC KHI VIẾT — ghi đè hôm nay XOÁ TRẮNG lượt ký trước
-- ═══════════════════════════════════════════════════════════════════════════
-- Đo trên hub_dev ngày 06/08/2026, dưới đúng danh tính Cô Lan (GVCN 6A1), trên em Nguyễn
-- Văn Minh, tuần 2026-08-03, bằng ĐÚNG câu lệnh mà thủ tục `care.approveReport` đang gửi:
--
--     begin;
--     select set_config('request.jwt.claim.sub',
--                       '90000000-0000-0000-0000-000000000001', true);
--     set local role authenticated;
--     -- lượt ký thứ nhất
--     → {status: approved,  reviewer_id: 4000…0001, note: null}
--     -- lượt ghi đè
--     → UPDATE 1
--     → {status: rejected,  reviewer_id: 4000…0001, note: 'doi y'}
--     select count(*) from report.growth_report_approvals where …;   → 1
--     rollback;
--
-- MỘT dòng trước, MỘT dòng sau. Chuỗi 'approved' của lượt ký thứ nhất không còn tồn tại
-- ở bất kỳ đâu trong database — `growth_report_approvals` có `unique (student_id,
-- week_start)` (`0032`) nên một lượt ghi đè xoá luôn CẢ BỐN dữ kiện của chữ ký trước
-- (`status`, `reviewer_id`, `reviewed_at`, `note`).
--
-- Đường thoát duy nhất không cần migration là `ops.audit_log`. Đo tiếp, cùng phiên:
--
--     select has_table_privilege('authenticated','ops.audit_log','insert');  → false
--
-- Vai `authenticated` KHÔNG ghi được sổ kiểm toán (`0024` khai thẳng). Nghĩa là không có
-- chỗ nào trong hệ hôm nay ghi lại được "ai đổi chữ ký của ai, lúc nào, vì sao" — đúng
-- điều ADR-031 đã đo và đã ghi. Đường còn lại là nhét chữ "đổi từ Đã duyệt" vào ô ghi chú:
-- bị loại, vì nó vẫn xoá dấu vết lượt ký đầu và không tra cứu được. **Ghi đè có vết giả
-- tệ hơn không ghi đè.**
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FILE NÀY CŨNG TRẢ NỐT MỘT KHE HỞ ĐÃ CÓ TÊN
-- ═══════════════════════════════════════════════════════════════════════════
-- `packages/core/contracts/CHANGELOG.md` (mục `care.decideReports`, ý 3) ghi: hợp đồng
-- nhận `clientMutationId` nhưng **máy chủ KHÔNG lưu**, vì `growth_report_approvals` chưa
-- có cột chống trùng như `attendance.late_decisions`. §9 của thủ tục đó vì thế đứng trên
-- khoá `(student_id, week_start)` cộng mệnh đề `status = 'pending'` — đủ cho ca thường,
-- nhưng thủng đúng một ca: một lượt gửi lại tới MUỘN, sau khi ai đó đã lật dòng đó sang
-- quyết định khác, rơi vào `skipped` mà không được nhận ra là bản sao của lượt cũ.
--
-- Cột `client_mutation_id` + chỉ mục duy nhất một phần dưới đây là chỗ trả nốt khe đó:
-- từ nay mã lượt bấm có nơi để nằm, và câu hỏi "lượt này đã ghi chưa" trả lời được bằng
-- chính mã đó chứ không phải bằng cách suy ra từ trạng thái hiện tại của dòng.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- GIỚI HẠN THẬT, NÓI RA ĐỂ KHÔNG AI TƯỞNG SỔ VẾT LÀ BẢO HIỂM
-- ═══════════════════════════════════════════════════════════════════════════
-- Đây là sửa một thứ ĐÃ GỬI RA NGOÀI NHÀ TRƯỜNG. Phụ huynh có thể đã đọc bản cũ, và hệ
-- không có cách nào thu hồi thứ đã đọc. Sổ này trả lời được "ai đổi, lúc nào, vì sao";
-- nó KHÔNG trả lời được "phụ huynh đã thấy bản nào". Nguyên văn ADR-031, chép lại ở đây
-- vì người đọc file migration thường không mở ADR.
--
-- Phụ thuộc: 0009 (core.can_see_care, core.is_homeroom_of, core.current_user_id, grant
--            usage schema report), 0024 (ops.audit_log — vai authenticated không ghi được),
--            0032 (report.growth_report_approvals — bảng bị upsert ở đây, KHÔNG sửa cấu
--            trúc), 0053 (khuôn mẫu attendance.late_decisions + decide_late_checkins).

begin;

-- ---------------------------------------------------------------------------
-- 1. Sổ quyết định duyệt báo cáo
-- ---------------------------------------------------------------------------
create table report.report_decisions (
  id           uuid primary key default gen_random_uuid(),

  -- §1: FK thẳng về core.students (ADR-011 — không bản sao thực thể lõi). Ở đây student_id
  -- KHÔNG phải cột chép lại như `late_decisions` (0053): sổ này không treo vào một dòng
  -- sự kiện nào cả, nó treo vào cặp (em, tuần) — đúng khoá của `growth_report_approvals`.
  --
  -- `on delete cascade` (khác NO ACTION của 0053, và khác có lý do): `late_decisions` đi
  -- theo `checkins` qua `checkin_id`, nên nó không cần đường xoá thứ hai. Sổ này KHÔNG có
  -- FK nào khác về phía dữ liệu học sinh, nên nếu để NO ACTION thì nó tự biến thành cái
  -- chặn đường xoá một học sinh — giữ hồ sơ trẻ em quá hạn dưới tên "sổ vết" là vi phạm
  -- Luật 91/2025 chứ không phải cẩn thận. `growth_report_approvals` (0032) cũng cascade.
  student_id   uuid not null references core.students(id) on delete cascade,

  -- Thứ Hai của tuần báo cáo — cùng đơn vị với growth_report_approvals.week_start.
  -- CỐ Ý KHÔNG có CHECK "phải là thứ Hai" ở đây: xem chú thích ở cuối mục 3.
  week_start   date not null,

  from_status  text not null,
  to_status    text not null,

  reason       text,

  decided_by   uuid not null references core.users(id),
  decided_at   timestamptz not null default now(),

  -- §9: gửi lại cùng mã = cùng MỘT quyết định, không phải quyết định thứ hai.
  client_mutation_id uuid,

  constraint report_decisions_to_status_chk
    check (to_status in ('approved', 'rejected')),

  -- Tầng cuối của luật lý do. Đọc xuôi: lý do BẮT BUỘC ở mọi lượt, TRỪ đúng một ca —
  -- lượt ký đầu tiên và ký "duyệt" (from_status = 'pending' ∧ to_status = 'approved').
  -- Hai vế gộp làm một ràng buộc vì chúng là cùng một câu:
  --   · ghi ĐÈ (from_status <> 'pending') phải có lý do — ADR-031, cái giá của quyền đè;
  --   · TRẢ LẠI (to_status = 'rejected') phải có lý do — luật của màn hiện hành, đã sống
  --     trong `care.ts` và `contracts/care.ts` từ 0032, nay có chỗ cưỡng chế thật.
  -- btrim + char_length chứ không `length(reason) >= 3`: ba dấu cách là ba ký tự và lọt.
  -- THỬ NGƯỢC đã chạy thật 06/08/2026: thay đúng ràng buộc này bằng `check (true)`, dựng
  -- lại một database từ số không rồi chạy lại bài 0054 → "not ok 18 — (c4) chèn thẳng một
  -- lượt ghi đè thiếu lý do" và "not ok 19 — (c5) trả lại thiếu lý do", CHỈ hai dòng đó đỏ
  -- (31/33 còn xanh, vì tầng hàm vẫn ném lỗi). Cắm lại → 33/33 xanh. Nghĩa là (c4) và (c5)
  -- đang đo chính ràng buộc này chứ không đo hộ tầng hàm.
  constraint report_decisions_reason_chk
    check ((from_status = 'pending' and to_status = 'approved')
           or (reason is not null and char_length(btrim(reason)) >= 3))
);

comment on table report.report_decisions is
  'ADR-031 (06/08/2026) — sổ ghi MỌI lượt GVCN quyết định về Báo cáo Trưởng thành một tuần: ai, lúc nào, từ trạng thái nào sang trạng thái nào, vì sao. Sổ này là ĐỐI TRỌNG của quyền ghi đè một chữ ký đã ký mà ADR-031 mở: report.growth_report_approvals có unique (student_id, week_start) nên một lượt ghi đè XOÁ luôn cả bốn dữ kiện của lượt ký trước (đo trên hub_dev 06/08/2026: 1 dòng trước, 1 dòng sau, chuỗi approved không còn ở đâu), còn ops.audit_log thì vai authenticated không ghi được (has_table_privilege = false). GIỚI HẠN THẬT: sổ trả lời được "ai đổi, lúc nào, vì sao", KHÔNG trả lời được "phụ huynh đã đọc bản nào" — báo cáo đã gửi ra ngoài nhà trường thì hệ không thu hồi được thứ đã đọc. Sổ CHỈ THÊM với người dùng cuối: authenticated có select + insert, KHÔNG có update/delete.';

comment on column report.report_decisions.student_id is
  '§1 — FK thẳng về core.students (ADR-011). on delete cascade: sổ này không treo vào một bản ghi sự kiện nào khác nên NO ACTION sẽ biến nó thành cái chặn đường xoá một học sinh — giữ hồ sơ trẻ em quá hạn dưới tên "sổ vết" là vi phạm Luật 91/2025.';
comment on column report.report_decisions.week_start is
  'Thứ Hai của tuần báo cáo (ISO) — cùng đơn vị với report.growth_report_approvals.week_start, để một dòng sổ tra ngược được về đúng dòng quyết định. Không có CHECK isodow ở tầng bảng: hàm report.decide_reports canh (raise 22023) trước khi ràng buộc growth_report_approvals_monday_chk của 0032 kịp ném một lỗi 23514 không ai đọc được.';
comment on column report.report_decisions.from_status is
  'Trạng thái TRƯỚC lượt quyết định: pending (chưa ai ký) · approved · rejected. Đây là dữ kiện mà một lượt ghi đè XOÁ MẤT ở report.growth_report_approvals — cả lý do tồn tại của cuốn sổ nằm ở cột này. Đọc cùng to_status thì trả lời được câu "lượt này có phải ghi đè không" mà không phải đoán.';
comment on column report.report_decisions.to_status is
  'ADR-031 — hai quyết định: approved (duyệt gửi phụ huynh) · rejected (trả lại để tuần sau sửa). KHÔNG có pending ở đây: "chưa ai ký" là trạng thái khởi đầu, không phải một quyết định con người ra.';
comment on column report.report_decisions.reason is
  'ADR-031 — BẮT BUỘC (>= 3 ký tự sau btrim) ở mọi lượt TRỪ lượt ký đầu tiên mang quyết định approved; cưỡng chế bằng report_decisions_reason_chk. Hai luật gộp làm một: ghi đè phải có lý do (cái giá của quyền ADR-031 mở) và trả lại phải có lý do (luật của màn hiện hành, trước file này chỉ sống trong TypeScript).';
comment on column report.report_decisions.decided_by is
  'core.users.id của GVCN. Policy report_decisions_write cưỡng chế decided_by = core.current_user_id() — không ai ghi sổ dưới tên người khác, kể cả khi ghi đè chữ ký của chính người đó.';
comment on column report.report_decisions.client_mutation_id is
  '§9 — mã do client sinh cho MỘT lượt bấm (một lượt bấm phủ NHIỀU em, nên cùng mã xuất hiện trên nhiều dòng, mỗi em một dòng). Trả nốt khe hở đã ghi trong packages/core/contracts/CHANGELOG.md: hợp đồng care.decideReports nhận clientMutationId từ 06/08/2026 mà tầng dữ liệu chưa có chỗ lưu, nên §9 phải đứng nhờ trên khoá (student_id, week_start) + mệnh đề status = pending.';

-- §9 ở tầng bảng. Khoá gồm cả `student_id` vì MỘT lượt bấm phủ nhiều em: mã lượt bấm
-- không duy nhất theo dòng, nó duy nhất theo (em, tuần) trong phạm vi một lượt bấm.
-- `where client_mutation_id is not null`: đường ghi không mang mã (job nền, sửa tay có
-- kiểm soát) vẫn phải ghi được nhiều dòng cho cùng một cặp (em, tuần) — đó chính là ca
-- ghi đè nhiều lần, tức ca mà cuốn sổ này sinh ra để phục vụ.
create unique index report_decisions_mutation_uq
  on report.report_decisions (student_id, week_start, client_mutation_id)
  where client_mutation_id is not null;

-- Câu hỏi thường gặp của sổ: "em này bị đổi quyết định mấy lần, gần nhất là khi nào".
create index report_decisions_student_time_idx
  on report.report_decisions (student_id, decided_at desc);

-- ---------------------------------------------------------------------------
-- 2. Phạm vi đọc/ghi của sổ
-- ---------------------------------------------------------------------------
alter table report.report_decisions enable row level security;

-- Đọc: GVCN của em ∪ tâm lý cụm (core.can_see_care) — ĐÚNG tập đã cấp cho
-- `growth_report_approvals_read` (0032). Sổ vết không được rộng hơn thứ nó ghi vết: cấp
-- rộng hơn là để một người đọc được lịch sử quyết định về một em mà chính quyết định
-- hiện hành thì họ không đọc được.
create policy report_decisions_read on report.report_decisions for select to authenticated
  using (core.can_see_care(student_id));
comment on policy report_decisions_read on report.report_decisions is
  'Đọc = core.can_see_care (GVCN của em ∪ tâm lý cụm), đúng tập của growth_report_approvals_read (0032). Học sinh, phụ huynh, giáo viên bộ môn, hiệu trưởng đọc ra 0 DÒNG — sổ này là hồ sơ nội bộ về thao tác của giáo viên. Phụ huynh biết bản báo cáo mới nhất; họ không cần biết bản đó đã bị đổi mấy lần, và hệ chưa có giọng văn nào cho việc đó.';

create policy report_decisions_write on report.report_decisions for insert to authenticated
  with check (
    core.is_homeroom_of(student_id)
    and decided_by = core.current_user_id()
  );
comment on policy report_decisions_write on report.report_decisions is
  'ADR-031 — chỉ GVCN của chính em đó ghi sổ, và chỉ ký được tên mình (cùng khuôn mẫu late_decisions_write ở 0053 và growth_report_approvals_write ở 0032). Không có policy update/delete: sổ chỉ thêm, sửa được sổ vết thì sổ vết hết nghĩa — và cả gói này tồn tại chỉ vì một cuốn sổ sửa được thì không đối trọng nổi quyền ghi đè.';

-- ADR-006: bản sao lưu phải ĐỦ, không thủng bảng. Bật RLS mà không có policy cho
-- backup_reader là để vai đó nhận 0 dòng TRONG IM LẶNG — đúng thứ Rev F điều 3 cấm, và
-- là cái bẫy `0050` đã ghi lại.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'backup_reader') then
    execute 'grant select on report.report_decisions to backup_reader';
    execute 'create policy report_decisions_backup on report.report_decisions '
         || 'for select to backup_reader using (true)';
  end if;
end;
$$;

-- Chỉ select + insert. KHÔNG update, KHÔNG delete — sổ chỉ thêm.
grant select, insert on report.report_decisions to authenticated;

-- §5 — và ở đây câu revoke KHÔNG thừa như ở 0053. Khác biệt đo được: `reporting` bị
-- `revoke usage on schema attendance` (0009:274) nên sổ của 0053 nằm ngoài tầm với ngay
-- từ schema; còn `grant usage on schema report to reporting` (0009:264) thì VẪN CÒN, vì
-- vai đó phải đọc được các view tổng hợp trong chính schema này. Nghĩa là hàng rào §5
-- cho bảng này chỉ còn đúng một lớp: không cấp quyền bảng. Câu revoke tường minh dưới
-- đây biến "chúng tôi không cấp" thành "chúng tôi đã tháo", để một lệnh
-- `grant select on all tables in schema report to reporting` gõ vội ngày mai còn phải đi
-- qua một câu lệnh có tên trong lịch sử migration.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'reporting') then
    execute 'revoke all on table report.report_decisions from reporting';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Đường ghi hợp lệ: một lượt bấm = một câu lệnh
-- ---------------------------------------------------------------------------
-- KHÔNG `security definer`, cùng lý lẽ 0053 và lý lẽ đó không yếu đi ở miền báo cáo: hàm
-- definer chạy bằng quyền chủ schema, tức bỏ qua RLS — và RLS là toàn bộ thứ giữ cho một
-- cô chủ nhiệm không ký lên báo cáo lớp khác. Hàm invoker giữ hai lớp chồng lên nhau:
-- policy trên cả hai bảng (dòng) + điều kiện `core.is_homeroom_of` viết thẳng trong WHERE.
--
-- Điều kiện `core.is_homeroom_of` lặp lại RLS một cách CÓ CHỦ Ý — và ở đây nó còn làm một
-- việc thứ hai mà RLS không làm được: RLS trên INSERT NÉM LỖI 42501, còn `skipped` đòi
-- BỎ QUA ÊM. Lọc ở nguồn là cách duy nhất để em ngoài lớp rơi vào `skipped` thay vì làm
-- cả lô đổ.
create or replace function report.decide_reports(
  p_student_ids        uuid[],
  p_week_start         date,
  p_to_status          text,
  p_reason             text default null,
  p_ghi_de             boolean default false,
  p_client_mutation_id uuid default null
)
returns table (updated int, skipped int)
language plpgsql
as $$
declare
  v_reason  text;
  v_ghi_de  boolean := coalesce(p_ghi_de, false);
  v_so_em   int;
  v_updated int := 0;
begin
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  -- Đếm em PHÂN BIỆT: client gửi trùng id trong một lô thì `skipped` tính theo mảng thô
  -- sẽ dương một cách vô nghĩa, và màn hình sẽ nói "bỏ qua 1 em" khi không em nào bị bỏ.
  -- (Postgres cũng từ chối `on conflict do update` chạm cùng một dòng hai lần trong một
  -- câu lệnh — "cannot affect row a second time" — nên distinct còn là điều kiện chạy.)
  select count(distinct x)::int into v_so_em
    from unnest(coalesce(p_student_ids, '{}'::uuid[])) as x;

  -- ── Hàm KHÔNG tin tầng trên ───────────────────────────────────────────────
  if p_to_status is null or p_to_status not in ('approved', 'rejected') then
    raise exception
      'decide_reports: quyết định không hợp lệ (%). ADR-031 chỉ nhận approved / rejected',
      coalesce(p_to_status, 'NULL')
      using errcode = '22023';
  end if;

  -- `week_start` phải là thứ Hai. Không canh ở đây thì ràng buộc
  -- `growth_report_approvals_monday_chk` (0032) vẫn chặn, nhưng chặn bằng một lỗi 23514
  -- mang tên ràng buộc — thứ mà tầng trên phải đoán ngược ra ý nghĩa. Canh sớm để lỗi
  -- nói được thành lời, và để dòng sổ không bao giờ mang một tuần không tra ngược được.
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception
      'decide_reports: week_start phải là thứ Hai của tuần báo cáo (nhận %)',
      coalesce(p_week_start::text, 'NULL')
      using errcode = '22023';
  end if;

  -- Lý do bắt buộc ở HAI ca, canh ngay tại cổng chứ không đợi ràng buộc bảng:
  --   · v_ghi_de = true  — ADR-031. Hàm ép ở đây vì lúc này nó CHƯA đọc từng dòng nên
  --     chưa biết dòng nào thật sự là ghi đè; ép cả lượt là cách canh duy nhất không
  --     phải tin vào tầng trên, và nó không làm hỏng ca nào: bật cờ ghi đè mà không định
  --     ghi đè gì thì cũng nên nói được vì sao mình bật.
  --   · to_status = 'rejected' — luật của màn hiện hành (care.ts từ 0032): trả lại báo
  --     cáo thì tuần sau phải sửa được, mà không có lý do thì không sửa được gì.
  if (v_ghi_de or p_to_status = 'rejected')
     and (v_reason is null or char_length(v_reason) < 3) then
    raise exception
      'decide_reports: phải ghi lý do (tối thiểu 3 ký tự) khi %. ADR-031',
      case when v_ghi_de then 'ghi đè một quyết định đã ký' else 'trả lại báo cáo' end
      using errcode = '22023';
  end if;

  if v_so_em = 0 then
    updated := 0;
    skipped := 0;
    return next;
    return;
  end if;

  -- ── §9: lượt gửi lại là CÙNG MỘT quyết định, không phải quyết định thứ hai ──
  -- Chỉ mục report_decisions_mutation_uq một mình cũng chặn được dòng đôi, nhưng nó chặn
  -- bằng cách NÉM LỖI 23505 — mà lượt gửi lại của §9 phải là no-op ÊM, không phải lỗi đỏ
  -- trên màn hình của cô. Cổng sớm này biến ca thường (double-tap, retry mạng) thành
  -- đường êm và để chỉ mục làm đúng việc của nó: bắt ca hiếm (hai transaction song song
  -- cùng mã). Đây cũng là chỗ trả nốt khe hở CHANGELOG đã ghi: trước file này §9 phải suy
  -- ra từ trạng thái hiện tại của dòng, nên một lượt gửi lại tới MUỘN (sau khi ai đó đã
  -- lật dòng sang quyết định khác) không được nhận ra là bản sao.
  --
  -- Câu đọc này đi qua RLS của chính người gọi (report_decisions_read = can_see_care) —
  -- có chủ ý: một mã lượt bấm của lớp khác không được biến lượt bấm của cô thành no-op.
  if p_client_mutation_id is not null
     and exists (
       select 1 from report.report_decisions d
        where d.client_mutation_id = p_client_mutation_id
     ) then
    updated := 0;
    skipped := v_so_em;
    return next;
    return;
  end if;

  -- ── Upsert quyết định VÀ ghi sổ trong MỘT câu lệnh ─────────────────────────
  -- Viết thành hai câu (upsert rồi insert) thì vẫn cùng transaction, nhưng câu thứ hai
  -- phải đọc lại danh sách dòng vừa ghi bằng một điều kiện CHÉP TAY — và điều kiện chép
  -- tay là chỗ hai câu bắt đầu kể hai chuyện khác nhau. Ở đây hậu quả nặng hơn 0053: câu
  -- thứ hai còn phải đọc lại trạng thái CŨ, mà trạng thái cũ thì câu thứ nhất vừa xoá.
  with muc_tieu as (
    select distinct x as student_id
      from unnest(p_student_ids) as x
  ),
  -- `materialized` là bắt buộc về NGỮ NGHĨA, không phải để tối ưu: CTE này giữ ảnh CHỤP
  -- TRƯỚC của trạng thái, và nó là nguồn DUY NHẤT của `from_status`. Không có nó thì cột
  -- quan trọng nhất của cuốn sổ (thứ mà lượt ghi đè xoá mất) không lấy được từ đâu —
  -- RETURNING của một câu ghi dữ liệu chỉ đưa ra giá trị MỚI.
  -- `coalesce(…, 'pending')`: chưa có dòng nào trong sổ duyệt nghĩa là chưa ai ký, và
  -- 'pending' đúng là tên mà `growth_report_approvals.status` đặt cho trạng thái đó
  -- (default của 0032) — không bịa thêm một từ thứ hai cho cùng một sự thật.
  truoc as materialized (
    select m.student_id,
           coalesce(a.status, 'pending') as from_status
      from muc_tieu m
      left join report.growth_report_approvals a
        on a.student_id = m.student_id
       and a.week_start = p_week_start
  ),
  ghi as (
    insert into report.growth_report_approvals
      (student_id, week_start, status, reviewer_id, reviewed_at, note)
    select t.student_id, p_week_start, p_to_status, core.current_user_id(), now(), v_reason
      from truoc t
     -- Hai điều kiện, hai việc khác nhau:
     --   · is_homeroom_of  — em ngoài lớp rơi vào `skipped` ÊM thay vì làm cả lô ném
     --     42501 (RLS vẫn là hàng rào thứ hai, độc lập; không tầng nào tin tầng kia).
     --   · v_ghi_de or from_status = 'pending'  — hành vi mặc định GIỮ NGUYÊN từ
     --     care.decideReports: không bật cờ thì chỉ chạm dòng chưa ai quyết.
     where core.is_homeroom_of(t.student_id)
       and (v_ghi_de or t.from_status = 'pending')
    on conflict (student_id, week_start) do update
       set status      = excluded.status,
           reviewer_id = excluded.reviewer_id,
           reviewed_at = now(),
           note        = excluded.note
     -- Lặp lại điều kiện cờ trên giá trị THẬT của dòng, không trên ảnh chụp của `truoc`.
     -- Hai lần canh không thừa: giữa lúc `truoc` chụp ảnh và lúc câu này ghi, một
     -- transaction khác có thể đã ký xong dòng đó. Ảnh chụp nói 'pending', sự thật thì
     -- không — và ca đó phải là `skipped`, không phải một lượt ghi đè lén.
     where v_ghi_de or report.growth_report_approvals.status = 'pending'
    returning student_id
  )
  insert into report.report_decisions
    (student_id, week_start, from_status, to_status, reason, decided_by, client_mutation_id)
  select g.student_id, p_week_start, t.from_status, p_to_status, v_reason,
         core.current_user_id(), p_client_mutation_id
    from ghi g
    join truoc t on t.student_id = g.student_id;

  get diagnostics v_updated = row_count;

  -- Em đã có người quyết mà không bật cờ, và em không thuộc lớp người gọi, đều rơi vào
  -- `skipped` — BỎ QUA chứ không ném lỗi. Ném lỗi ở đây là dựng một kênh dò: gửi một mã
  -- học sinh lạ rồi đọc thông báo lỗi để biết em đó có tồn tại và thuộc lớp nào. Đây đúng
  -- ngữ nghĩa mà 0053 đã chốt cho khối gửi muộn và care.decideReports đã chốt cho chính
  -- màn này — hai màn của cùng một cô phải hành xử như nhau.
  updated := v_updated;
  skipped := v_so_em - v_updated;
  return next;
end;
$$;

comment on function report.decide_reports(uuid[], date, text, text, boolean, uuid) is
  'ADR-031 — đường ghi HỢP LỆ DUY NHẤT cho quyết định duyệt Báo cáo Trưởng thành: upsert report.growth_report_approvals và ghi report.report_decisions trong MỘT câu lệnh, một transaction. p_ghi_de = false (mặc định) chỉ chạm dòng status = pending — hành vi hiện hành của care.decideReports, không đổi. p_ghi_de = true đè được lên approved/rejected và hàm TỰ ép có lý do (raise 22023), không tin tầng trên. §9: gọi lại cùng client_mutation_id là no-op êm (updated = 0), không phải lỗi. Em đã có người quyết (mà không bật cờ) hoặc không thuộc lớp người gọi thì vào skipped, KHÔNG ném lỗi — ném lỗi là dựng một kênh dò xem em đó có tồn tại không. KHÔNG security definer: hàm phải đi qua đúng RLS của người gọi trên CẢ HAI bảng. GIỚI HẠN: sổ trả lời được ai đổi/lúc nào/vì sao, KHÔNG trả lời được phụ huynh đã đọc bản nào.';

revoke all on function report.decide_reports(uuid[], date, text, text, boolean, uuid) from public;
grant execute on function report.decide_reports(uuid[], date, text, text, boolean, uuid) to authenticated;

commit;
