-- 0046_dieu_khoan_dong_y.sql
-- Màn điều khoản kèm nút đồng ý: bản điều khoản có số phiên bản, sổ bằng chứng
-- "ai đồng ý cái gì lúc nào", và CHỐT CHẶN thật cho lời hứa "chưa bấm thì tài
-- khoản của con chưa bật".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HÔM QUA HỆ THỐNG KHÔNG CÓ GÌ VỀ VIỆC ĐỒNG Ý — đo, không đoán
-- ═══════════════════════════════════════════════════════════════════════════
-- Đo trên hub_dev ngày 01/08/2026: truy vấn information_schema.columns tìm tên cột
-- khớp 'consent|agree|dong_y|terms|policy|version' trên cả 14 schema trả về ĐÚNG
-- MỘT dòng, và là dòng lạc đề (`ops.job_runs.rule_version`). Không bảng, không cột,
-- không hàm, không màn, không đầu API, không một dòng nào trong `danh-cho-may/`.
-- Yêu cầu tồn tại duy nhất ở phía giấy: `lo-trinh-go-live.html` dòng 218 (việc tuần
-- 2), 302–304 (bảng gói việc), 403 (ô điều kiện mở cửa nhóm Pháp lý — hiệu trưởng
-- KÝ), 503 (rủi ro "em nào chưa có phiếu thì không bật tài khoản").
--
-- Nghĩa là file này không vá gì cả: nó dựng mới, và nó dựng một BẢNG BẰNG CHỨNG
-- PHÁP LÝ. Sửa hình dạng bảng sau khi đã có bản ghi thật là việc rất khó làm sạch,
-- nên mọi lựa chọn dưới đây đều được ghi lại lý do ngay tại chỗ.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CHỖ CHẶN Ở ĐÂU — và ba chỗ chặn SAI đã loại trừ được bằng đo đạc
-- ═══════════════════════════════════════════════════════════════════════════
-- SAI 1 — chặn ở giao diện (một redirect trong layout). Đo được là lời hứa rỗng:
--   không policy RLS nào trong hub_dev nhắc tới việc đồng ý (`core.can_see_student()`
--   gọi đúng sáu hàm is_me/is_my_child/teaches/is_homeroom_of/in_my_cluster/
--   principal_of, không có hàm thứ bảy), và không procedure tRPC nào hỏi. Ai giữ
--   cookie `hub_session` gọi thẳng POST /api/trpc là qua, không đi qua trang nào.
--
-- SAI 2 — nhét điều kiện đồng ý vào `core.is_me()` hay `core.can_see_student()`.
--   Sai tầng: RLS trả lời "ai thấy hàng nào", không trả lời "tài khoản có được bật
--   không". Sửa `is_me()` làm CÙNG LÚC câm sáu policy đang dựa vào nó
--   (checkins_insert_self, checkins_update_self, checkins_scope,
--   help_requests_insert_self, help_requests_update_self, help_requests_scope) —
--   và câm theo kiểu tệ nhất: không lỗi, chỉ trả 0 dòng.
--
-- SAI 3 — một job chạy sau để bật/tắt tài khoản. Job chạy sau nghĩa là có một
--   khoảng thời gian lời hứa nói sai. Việc chuyển trạng thái phải nằm TRONG cùng
--   giao dịch với lần ghi đồng ý.
--
-- ĐÚNG — chỗ chặn đã có sẵn và đang chạy, chỉ chưa ai dùng:
--   (1) `core.users.status` đã có giá trị 'pending' trong CHECK `users_status_chk`
--       từ 0002, và tính tới 01/08/2026 giá trị đó KHÔNG được dùng ở đâu — nó chờ
--       đúng ca này.
--   (2) `resolveIdentity` (dev-provider.ts:167) trả `null` khi status khác 'active'
--       ⇒ không dựng được phiên. Cả /api/auth/invite lẫn /api/auth/dev-login đều
--       dựa vào nó.
--   (3) `core.begin_user_context` (0029) và `core.resolve_user_id_uncached` (0001)
--       đều lọc `status = 'active'` ⇒ một cookie còn hạn cũng không có user_id để
--       RLS bám vào.
--   (4) /api/auth/refresh gọi lại resolveIdentity mỗi khi token còn dưới 5 phút
--       (token sống 15 phút, ADR-016) ⇒ đổi status là cắt quyền trong ≤15 phút.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RANH GIỚI — cái gì bị chặn, cái gì KHÔNG BAO GIỜ bị chặn (ADR-027)
-- ═══════════════════════════════════════════════════════════════════════════
-- Đồng ý của phụ huynh gác TÀI KHOẢN ĐĂNG NHẬP CỦA HỌC SINH — tức đường em tự nhập
-- dữ liệu về chính mình. Nó KHÔNG gác SỔ VẬN HÀNH CỦA TRƯỜNG.
--
-- Đo được, không suy đoán: `attendance.checkins` có HAI đường ghi, không phải một —
-- `checkins_insert_self` (core.is_me) và `checkins_insert_by_homeroom`
-- (core.is_homeroom_of AND source='teacher'). Em đã đi học mà bố mẹ chưa bấm nút thì
-- em VẪN được ghi nhận có mặt: cô ghi, `source='teacher'`, ràng buộc `checkins_uq`
-- nguyên vẹn. Việc trường ghi nhận em có mặt là nghĩa vụ trông giữ trẻ, đứng trên cơ
-- sở pháp lý khác, và không được phép phụ thuộc vào cái nút.
--
-- Cái em thật sự mất khi tài khoản chưa bật: tự chọn tâm trạng bằng máy của em, và —
-- đây mới là chỗ hại — kênh "Mình cần gặp thầy cô".
--
-- `attendance.help_requests` trước file này có ĐÚNG MỘT đường ghi:
-- `help_requests_insert_self WITH CHECK (core.is_me(student_id))`. Không đường nào
-- cho GVCN/tâm lý cụm ghi hộ. Nên nếu chỉ khoá tài khoản mà không làm gì thêm thì:
-- bố mẹ chưa bấm → tài khoản em pending → em không đăng nhập được → em KHÔNG CÓ CÁCH
-- NÀO nói "em cần gặp thầy cô", kể cả khi cô muốn giúp. Và em có phụ huynh chưa bấm
-- nút thường đúng là em có phụ huynh ít để tâm nhất — hệ thống tự động cắt đường kêu
-- cứu của chính đứa trẻ cần nó nhất, bằng một thao tác hành chính của người lớn.
--
-- Vì vậy file này mở đường ghi hộ (mục 6): kênh kêu cứu là an toàn của trẻ, không
-- phải tính năng thu thập dữ liệu, nên nó không đứng sau cái nút của bố mẹ.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CÁI FILE NÀY CỐ Ý KHÔNG LÀM
-- ═══════════════════════════════════════════════════════════════════════════
-- KHÔNG tự chuyển các tài khoản học sinh ĐANG active về 'pending'. Hai lý do, cả hai
-- đều là lý do thật chứ không phải sự e dè:
--   · Trên hub_dev hôm nay có ĐÚNG MỘT học sinh có tài khoản (Minh — 63 em còn lại
--     `core.students.user_id IS NULL`, tức "em chưa có tài khoản"). Ở trường thật,
--     chuyển hàng loạt về pending giữa năm học là khoá cửa của những đứa trẻ trước
--     khi bố mẹ chúng có đường bấm nút.
--   · Phụ huynh HÔM NAY KHÔNG CÓ đường đăng nhập lại: Zalo OAuth chưa nối,
--     /api/auth/dev-login là DEV ONLY, và mã mời chết sau 15 phút kể từ lần đổi đầu
--     (ADR-024). Bật cổng trước khi có đường quay lại là tự đặt bẫy.
-- Khoảng hở đó KHÔNG được để im lặng: `core.v_consent_gap` (mục 5) gọi tên từng em
-- đang có tài khoản bật mà chưa có phiếu đồng ý, và `DEBT.md` #40 ghi điều kiện trả.
--
-- Phụ thuộc: 0002 (core.users/students, CHECK status), 0009 (RLS nền), 0020
-- (attendance.help_requests), 0029 (core.begin_user_context), 0033 (khuôn trigger
-- chặn ghi đè + chính sách ON DELETE), 0037 (phạm vi help_requests).

begin;

-- ---------------------------------------------------------------------------
-- 1. Bản điều khoản có số phiên bản, và BẤT BIẾN CHỨNG MINH ĐƯỢC
-- ---------------------------------------------------------------------------
-- Vì sao lưu SỐ PHIÊN BẢN + BĂM chứ không chép nguyên văn vào từng bản ghi đồng ý:
-- chép nguyên văn là nhân bản cùng một đoạn text cho mỗi phụ huynh mỗi lần bấm.
-- Lưu số là đủ — VỚI ĐÚNG MỘT ĐIỀU KIỆN: bản đó phải bất biến chứng minh được. Nếu
-- bảng này cho UPDATE cột nội dung thì "đồng ý bản 2" là bằng chứng RỖNG: bản 2 hôm
-- nay có thể khác bản 2 hôm bấm, và không ai phát hiện vì không có dấu vết.
--
-- Hai lớp giữ lời hứa đó, và không lớp nào là lời hứa suông:
--   · `content_hash` là cột GENERATED từ chính `body_md` — không ai đặt tay được, nên
--     nó không thể nói dối về nội dung đang lưu. Bản ghi đồng ý chép lại giá trị này
--     tại thời điểm bấm; hai giá trị lệch nhau là bằng chứng nội dung đã đổi.
--   · trigger `terms_versions_immutable` chặn mọi sửa/xoá sau khi đã công bố.
create table if not exists core.terms_versions (
  id             uuid primary key default gen_random_uuid(),
  version        int  not null unique,
  title          text not null,
  body_md        text not null,
  -- `public.digest(text,text)` của pgcrypto (0001 đã bật) là IMMUTABLE nên dùng được
  -- cho cột generated. KHÔNG dùng `sha256(convert_to(body_md,'UTF8'))`: `convert_to`
  -- chỉ STABLE (kết quả phụ thuộc encoding của server) và Postgres từ chối thẳng —
  -- "generation expression is not immutable", đã vấp thật khi dựng lại DB từ đầu.
  -- Ghi rõ schema `public.`: cột generated giải tên hàm một lần lúc tạo bảng, không
  -- theo search_path của người ghi sau này.
  content_hash   text generated always as (encode(public.digest(body_md, 'sha256'), 'hex')) stored,
  -- KHÔNG có DEFAULT, và đó là chủ đích: người tạo bản mới BẮT BUỘC phải trả lời câu
  -- "bản này có buộc phụ huynh bấm lại không". Cho nó một giá trị mặc định là để câu
  -- hỏi pháp lý nặng nhất của bảng này lặng lẽ rơi vào `false`. Xem ADR-027.
  bat_dong_y_lai boolean not null,
  published_at   timestamptz,
  published_by   uuid references core.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint terms_versions_title_chk check (length(btrim(title)) between 1 and 200),
  -- Một bản điều khoản 3 chữ không phải điều khoản. Ngưỡng thấp, chỉ để chặn bản rỗng.
  constraint terms_versions_body_chk  check (length(btrim(body_md)) >= 200)
);

comment on table core.terms_versions is
  'Các bản điều khoản/thông báo xử lý dữ liệu mà phụ huynh bấm đồng ý. Bất biến sau khi published_at khác NULL (trigger terms_versions_immutable). content_hash sinh tự động từ body_md — đó là thứ chứng minh "bản tôi bấm đúng là bản đang lưu".';
comment on column core.terms_versions.bat_dong_y_lai is
  'Bản này có buộc mọi phụ huynh bấm lại không (ADR-027 phương án B). KHÔNG có mặc định — người tạo bản mới phải tự trả lời. true = sửa đáng kể (mở rộng dữ liệu thu thập, thêm bên thứ ba, đổi thời hạn lưu); false = sửa chính tả/diễn đạt.';
comment on column core.terms_versions.content_hash is
  'SHA-256 của body_md, cột GENERATED — không đặt tay được. Bản ghi đồng ý chép lại giá trị này lúc bấm; lệch nhau = nội dung đã bị đổi sau khi ký.';

create or replace function core.tg_terms_version_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then
      raise exception 'Không xoá bản điều khoản đã công bố (version %).', old.version
        using errcode = 'restrict_violation',
              hint    = 'Bản đã công bố là mỏ neo của mọi phiếu đồng ý trỏ về nó. Muốn thay thì CÔNG BỐ BẢN MỚI.';
    end if;
    return old;
  end if;

  -- Bản nháp (chưa công bố) vẫn sửa thoải mái — chưa ai bấm vào nó.
  if old.published_at is null then
    return new;
  end if;

  if new.body_md        is distinct from old.body_md
  or new.title          is distinct from old.title
  or new.version        is distinct from old.version
  or new.bat_dong_y_lai is distinct from old.bat_dong_y_lai
  or new.published_at   is distinct from old.published_at then
    raise exception 'Không sửa bản điều khoản đã công bố (version %).', old.version
      using errcode = 'restrict_violation',
            hint    = 'Sửa được nội dung sau khi công bố thì mọi phiếu "đồng ý bản %" thành giấy trắng. Công bố bản mới thay vì sửa bản cũ.';
  end if;

  return new;
end;
$$;

comment on function core.tg_terms_version_immutable() is
  'Chặn sửa/xoá bản điều khoản đã công bố. Không có cửa thoát hiểm — khác 0033: ở đó thứ được bảo vệ là một DÒNG dữ liệu, ở đây là bằng chứng pháp lý mà hàng nghìn phiếu đồng ý trỏ vào.';

drop trigger if exists terms_versions_immutable on core.terms_versions;
create trigger terms_versions_immutable
  before update or delete on core.terms_versions
  for each row
  execute function core.tg_terms_version_immutable();

alter table core.terms_versions enable row level security;

drop policy if exists terms_versions_read_published on core.terms_versions;
-- Ai đăng nhập cũng đọc được bản ĐÃ CÔNG BỐ: phụ huynh phải đọc trước khi bấm, và
-- học sinh/giáo viên có quyền biết trường đang cam kết gì với dữ liệu của các em.
-- Bản NHÁP không lọt ra ngoài — nó chưa phải lời của trường.
create policy terms_versions_read_published on core.terms_versions
  for select to authenticated
  using (published_at is not null);

grant select on core.terms_versions to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sổ đồng ý — SỔ SỰ KIỆN CHỈ THÊM, không phải một ô bật/tắt
-- ---------------------------------------------------------------------------
-- Hình dạng này được chọn để quyền RÚT LẠI gần như miễn phí về sau: mỗi dòng là một
-- quyết định có mốc thời gian, trạng thái hiện tại là dòng chưa bị thay thế. Một bảng
-- có cột `is_active` bật tắt sẽ phá mất lịch sử vĩnh viễn — và lịch sử chính là thứ
-- duy nhất trả lời được câu "ai đồng ý cái gì LÚC NÀO" sau nhiều năm.
--
-- KHOÁ IDEMPOTENT (§9) là chỉ mục riêng phần `consent_records_current_uq`:
-- MỘT quyết định đang hiệu lực cho mỗi cặp (người bấm, đứa con). Vì sao không dùng
-- unique (user_id, student_id, terms_version_id, decision) như đề xuất ban đầu: nó
-- gãy ở chuỗi đồng ý → rút lại → ĐỒNG Ý LẠI. Lần đồng ý thứ hai đụng đúng dòng cũ,
-- `on conflict do nothing` bỏ qua, và trạng thái tính theo dòng mới nhất vẫn là
-- 'withdrawn' — tức phụ huynh bấm đồng ý mà hệ thống vẫn coi là đã rút. Lỗi im lặng,
-- đúng loại nguy hiểm nhất.
--
-- Vì sao KHÔNG dùng ràng buộc EXCLUDE (kiểu `enrollments_no_overlap`): Postgres không
-- cho `ON CONFLICT` bám vào EXCLUDE, nên đường vá lỗi trùng sẽ NÉM LỖI chứ không im
-- lặng bỏ qua — đúng cái bẫy đã đo được ở `core.enrollments`.
create table if not exists core.consent_records (
  id               uuid primary key default gen_random_uuid(),
  -- BẰNG CHỨNG — NO ACTION có chủ ý (ADR-021). Xoá tài khoản đi đường
  -- core.anonymize_user(): dòng người dùng ở lại, phiếu đồng ý vẫn có chủ.
  user_id          uuid not null references core.users(id),
  -- Đồng ý cho CON NÀO. Một phụ huynh có thể có nhiều con — thiếu cột này thì bản ghi
  -- vô nghĩa. FK về core.students theo §1.
  student_id       uuid not null references core.students(id),
  terms_version_id uuid not null references core.terms_versions(id),
  decision         text not null,
  decided_at       timestamptz not null default now(),
  -- 'paper' để dành cho phiếu giấy ký ở buổi họp phụ huynh, 'admin' cho ca nhân viên
  -- nhà trường ghi theo yêu cầu bằng văn bản (đường rút lại hôm nay — xem DEBT #40).
  -- Khai sẵn ba giá trị để lần sau thêm đường vào không phải đổi schema.
  method           text not null default 'app_button',
  -- Băm nội dung TẠI THỜI ĐIỂM BẤM. Xem mục 1.
  content_hash     text not null,
  -- Dấu vết thiết bị. KHÔNG lưu IP trần: IP là dữ liệu cá nhân và không thêm được gì
  -- cho câu hỏi "ai bấm" mà `user_id` chưa trả lời.
  user_agent       text,
  -- NULL = dòng đang hiệu lực. Đây là cột bookkeeping DUY NHẤT được sửa sau khi ghi.
  superseded_at    timestamptz,
  -- BA giá trị, không phải hai. 'declined' = "đã hỏi, bố mẹ trả lời KHÔNG";
  -- 'withdrawn' = "đã đồng ý rồi rút lại". Gộp hai thứ đó làm một thì về sau không ai
  -- phân biệt được người chưa bao giờ đồng ý với người đã đồng ý rồi đổi ý — mà đó là
  -- hai câu chuyện pháp lý khác nhau, và cũng là hai câu chuyện KHÁC NHAU với đứa trẻ.
  constraint consent_records_decision_chk check (decision in ('granted', 'declined', 'withdrawn')),
  constraint consent_records_method_chk   check (method   in ('app_button', 'paper', 'admin')),
  constraint consent_records_hash_chk     check (content_hash ~ '^[0-9a-f]{64}$')
);

-- `create table if not exists` KHÔNG sửa ràng buộc của bảng đã tồn tại, nên file này
-- sẽ chạy qua mà giá trị 'declined' vẫn bị CHECK cũ chặn trên một CSDL đã có bảng —
-- lỗi im lặng ở đúng chỗ tệ nhất (đã suýt vấp thật khi thêm giá trị thứ ba trong lúc
-- hub_dev đã dựng bảng). Khai lại tường minh, cùng khuôn drop-if-exists của 0036.
alter table core.consent_records
  drop constraint if exists consent_records_decision_chk,
  add  constraint consent_records_decision_chk
       check (decision in ('granted', 'declined', 'withdrawn'));

create unique index if not exists consent_records_current_uq
  on core.consent_records (user_id, student_id)
  where superseded_at is null;

create index if not exists consent_records_student_live_idx
  on core.consent_records (student_id)
  where superseded_at is null;

comment on table core.consent_records is
  'Sổ đồng ý của người đại diện, CHỈ THÊM (trigger consent_append_only). Trạng thái hiện tại = dòng có superseded_at IS NULL. Khoá idempotent §9: consent_records_current_uq (user_id, student_id) where superseded_at is null.';
comment on column core.consent_records.superseded_at is
  'Mốc dòng này bị một quyết định mới thay thế. Cột DUY NHẤT được sửa sau khi ghi, và chỉ được sửa một lần từ NULL.';

create or replace function core.tg_consent_append_only()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  -- Cửa thoát hiểm khai báo tường minh trong CHÍNH phiên đó, cùng khuôn
  -- `hub.allow_user_hard_delete` của 0033. Dùng cho dọn dữ liệu RÁC do test sinh ra;
  -- `authenticated` không có quyền UPDATE/DELETE trên bảng này nên đây không phải bề
  -- mặt tấn công của người dùng cuối.
  if coalesce(current_setting('hub.allow_consent_rewrite', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Không xoá phiếu đồng ý (id=%).', old.id
      using errcode = 'restrict_violation',
            hint    = 'Rút lại đồng ý là GHI THÊM một dòng decision=''withdrawn'', không phải xoá dòng cũ. Xem core.record_consent().';
  end if;

  if old.superseded_at is not null or new.superseded_at is null then
    raise exception 'Chỉ được đánh dấu superseded_at đúng một lần, từ NULL (id=%).', old.id
      using errcode = 'restrict_violation';
  end if;

  if new.id               is distinct from old.id
  or new.user_id          is distinct from old.user_id
  or new.student_id       is distinct from old.student_id
  or new.terms_version_id is distinct from old.terms_version_id
  or new.decision         is distinct from old.decision
  or new.decided_at       is distinct from old.decided_at
  or new.method           is distinct from old.method
  or new.content_hash     is distinct from old.content_hash then
    raise exception 'Không sửa nội dung phiếu đồng ý (id=%).', old.id
      using errcode = 'restrict_violation',
            hint    = 'Phiếu đồng ý là bằng chứng. Quyết định mới thì ghi dòng mới.';
  end if;

  return new;
end;
$$;

comment on function core.tg_consent_append_only() is
  'Sổ đồng ý chỉ thêm: chặn DELETE, chặn mọi UPDATE trừ việc đặt superseded_at một lần từ NULL. Phanh tay: set local hub.allow_consent_rewrite = ''on'' (dọn dữ liệu test).';

drop trigger if exists consent_append_only on core.consent_records;
create trigger consent_append_only
  before update or delete on core.consent_records
  for each row
  execute function core.tg_consent_append_only();

alter table core.consent_records enable row level security;

drop policy if exists consent_records_self on core.consent_records;
-- Phụ huynh xem lại được chính phiếu của mình — đây là dữ liệu NGHIỆP VỤ của họ, không
-- phải sổ vận hành. (Ghi chú vì sao không dùng ops.audit_log làm chỗ lưu: 0024:183 khai
-- rõ audit_log KHÔNG được GRANT cho `authenticated`; nó là sổ máy, không phải bằng
-- chứng phụ huynh có quyền đọc lại.)
create policy consent_records_self on core.consent_records
  for select to authenticated
  using (user_id = core.current_user_id());

-- CHỈ SELECT. Không policy INSERT/UPDATE/DELETE nào: đường ghi duy nhất là
-- core.record_consent() — hàm SECURITY DEFINER kiểm quan hệ cha–con trước khi ghi.
grant select on core.consent_records to authenticated;

-- ---------------------------------------------------------------------------
-- 3. "Bản nào đang bắt buộc" và "em này đã có phiếu chưa"
-- ---------------------------------------------------------------------------
-- Phương án B của ADR-027, cài đúng hình dạng nhưng KHÔNG tự bật: bản mới chỉ bắt bấm
-- lại khi có người đánh dấu `bat_dong_y_lai = true`. Sửa một lỗi chính tả rồi công bố
-- bản mới với cờ false thì phiếu cũ vẫn còn hiệu lực — chứ không tắt tài khoản của
-- toàn bộ học sinh đang dùng, giữa năm học (phương án A).
create or replace function core.required_terms_version()
returns int
language sql
stable
security definer
set search_path = core, pg_catalog, pg_temp
as $$
  select coalesce(max(version), 0)
    from core.terms_versions
   where published_at is not null
     and bat_dong_y_lai;
$$;

comment on function core.required_terms_version() is
  'Số phiên bản điều khoản THẤP NHẤT còn được chấp nhận = bản đã công bố mới nhất có bat_dong_y_lai. Phiếu ký bản cũ hơn số này coi như hết hiệu lực (ADR-027 phương án B). Trả 0 khi chưa công bố bản nào — lúc đó không ai bị chặn.';

create or replace function core.has_student_consent(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core, pg_catalog, pg_temp
as $$
  -- MỘT người đại diện bấm là đủ. Đòi cả bố lẫn mẹ cùng bấm nghe có vẻ chặt hơn,
  -- nhưng thực tế là khoá cửa của những đứa trẻ chỉ sống với một người.
  select exists (
    select 1
      from core.consent_records cr
      join core.terms_versions  tv on tv.id = cr.terms_version_id
     where cr.student_id    = p_student_id
       and cr.superseded_at is null
       and cr.decision      = 'granted'
       and tv.version      >= core.required_terms_version()
  );
$$;

comment on function core.has_student_consent(uuid) is
  'Em này đã có phiếu đồng ý còn hiệu lực chưa (bất kỳ người đại diện nào). SECURITY DEFINER vì nó phải nhìn được phiếu của NGƯỜI KHÁC — phụ huynh A không đọc được phiếu của phụ huynh B, nhưng câu hỏi "em này đã có phiếu chưa" thì hệ thống phải trả lời được.';

-- ---------------------------------------------------------------------------
-- 4. CHỐT CHẶN: bật/tắt tài khoản học sinh trong CÙNG giao dịch với lần ghi
-- ---------------------------------------------------------------------------
create or replace function core.sync_student_account_status(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = core, pg_catalog, pg_temp
as $$
declare
  v_user   uuid;
  v_status text;
  v_target text;
begin
  select s.user_id into v_user from core.students s where s.id = p_student_id;
  if v_user is null then
    -- "Em chưa có tài khoản" là một trạng thái HỢP LỆ và phổ biến (63/64 em trên
    -- hub_dev). Không có gì để bật/tắt, và đó không phải lỗi.
    return 'no_account';
  end if;

  select u.status into v_status from core.users u where u.id = v_user for update;

  -- CHỈ đi lại giữa 'pending' và 'active'. Tài khoản 'disabled' — kể cả tài khoản đã
  -- ẩn danh hoá theo Luật 91/2025 (0033 đặt status='disabled') — KHÔNG được một cú bấm
  -- đồng ý làm sống lại. Đây là chỗ một hàm viết ẩu sẽ hồi sinh người đã yêu cầu xoá.
  if v_status not in ('active', 'pending') then
    return v_status;
  end if;

  v_target := case when core.has_student_consent(p_student_id) then 'active' else 'pending' end;
  if v_target = v_status then
    return v_status;  -- §9: gọi lại là no-op, không ghi audit rác
  end if;

  update core.users set status = v_target where id = v_user;

  insert into ops.audit_log (actor_id, action, object_type, object_id, scope, result)
       values (core.current_user_id(), 'core.sync_student_account_status', 'core.users', v_user::text,
               jsonb_build_object('student_id', p_student_id, 'from', v_status, 'to', v_target), 'ok');

  return v_target;
end;
$$;

comment on function core.sync_student_account_status(uuid) is
  'Đưa core.users.status của học sinh về đúng trạng thái phiếu đồng ý: có phiếu → active, không → pending. KHÔNG chạm tài khoản disabled (không hồi sinh người đã ẩn danh hoá). Gọi trong cùng giao dịch với core.record_consent — không phải job chạy sau.';

create or replace function core.record_consent(
  p_student_id       uuid,
  p_terms_version_id uuid,
  p_decision         text,
  p_method           text default 'app_button',
  p_user_agent       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = core, pg_catalog, pg_temp
as $$
declare
  v_user    uuid := core.current_user_id();
  v_tv      core.terms_versions%rowtype;
  v_live    core.consent_records%rowtype;
  v_id      uuid;
  v_created boolean := false;
  v_status  text;
begin
  if v_user is null then
    raise exception 'Chưa đăng nhập' using errcode = '28000';
  end if;

  if p_decision is null or p_decision not in ('granted', 'declined', 'withdrawn') then
    raise exception 'Quyết định phải là granted, declined hoặc withdrawn (nhận: %)', coalesce(p_decision, 'NULL')
      using errcode = '22023';
  end if;

  select * into v_tv from core.terms_versions where id = p_terms_version_id;
  if not found or v_tv.published_at is null then
    raise exception 'Bản điều khoản không tồn tại hoặc chưa được công bố'
      using errcode = '22023',
            hint    = 'Chỉ ký được vào bản đã công bố — bản nháp còn sửa được thì chữ ký không neo vào đâu cả.';
  end if;

  -- Hàng rào QUAN HỆ: chỉ người đại diện của CHÍNH em này mới bấm được cho em. Thiếu
  -- kiểm này thì một tài khoản phụ huynh bất kỳ bật được tài khoản của con nhà khác.
  if not exists (
    select 1
      from core.parent_students ps
      join core.parents p on p.id = ps.parent_id
     where p.user_id = v_user
       and ps.student_id = p_student_id
  ) then
    raise exception 'Tài khoản này không phải người đại diện của học sinh'
      using errcode = '42501';
  end if;

  -- Khoá dòng đang hiệu lực: hai lần bấm SONG SONG (bấm đúp, 4G rớt rồi bấm lại — ca
  -- đã kể ở 0036, cổng trường lúc tan học) không được cùng đi qua nhánh "chưa có".
  select * into v_live
    from core.consent_records
   where user_id = v_user and student_id = p_student_id and superseded_at is null
     for update;

  if found and v_live.decision = p_decision and v_live.terms_version_id = p_terms_version_id then
    -- §9 — đúng quyết định đó đang hiệu lực rồi: trả lại chính dòng cũ, KHÔNG sinh
    -- dòng thứ hai. Hồ sơ pháp lý không được có hai dòng nói cùng một chuyện với hai
    -- mốc thời gian khác nhau.
    v_id := v_live.id;
  else
    if found then
      update core.consent_records set superseded_at = now() where id = v_live.id;
    end if;

    begin
      insert into core.consent_records
             (user_id, student_id, terms_version_id, decision, method, content_hash, user_agent)
           values (v_user, p_student_id, p_terms_version_id, p_decision,
                   coalesce(nullif(btrim(p_method), ''), 'app_button'),
                   v_tv.content_hash,
                   left(nullif(btrim(p_user_agent), ''), 300))
        returning id into v_id;
      v_created := true;
    exception when unique_violation then
      -- Một giao dịch song song vừa ghi xong dòng hiệu lực. Không phải lỗi của người
      -- bấm: đọc lại dòng đó và trả về, đúng tinh thần §9.
      select id into v_id
        from core.consent_records
       where user_id = v_user and student_id = p_student_id and superseded_at is null;
    end;
  end if;

  v_status := core.sync_student_account_status(p_student_id);

  return jsonb_build_object(
    'consentId',            v_id,
    'decision',             p_decision,
    'created',              v_created,
    'termsVersion',         v_tv.version,
    'studentAccountStatus', v_status
  );
end;
$$;

comment on function core.record_consent(uuid, uuid, text, text, text) is
  'Đường ghi DUY NHẤT vào core.consent_records. Ghi phiếu VÀ bật/tắt tài khoản học sinh trong CÙNG một giao dịch (không job chạy sau). Idempotent §9: bấm hai lần trả lại đúng dòng cũ, created=false. Từ chối: 28000 chưa đăng nhập · 22023 bản điều khoản sai/chưa công bố · 42501 không phải người đại diện của em này.';

-- Trạng thái đồng ý của CHÍNH người đang đăng nhập, cho màn /dieu-khoan.
-- Là HÀM chứ không phải view: nó phải đọc `core.users.status` của ĐỨA CON, mà policy
-- `users_self` (0009) chỉ cho mỗi người đọc dòng của chính mình — một view thường sẽ
-- trả về NULL ở cột trạng thái tài khoản và màn hình sẽ nói sai.
create or replace function core.my_consent_status()
returns table (
  student_id       uuid,
  student_code     text,
  student_name     text,
  consent_id       uuid,
  decision         text,
  decided_at       timestamptz,
  terms_version    int,
  required_version int,
  needs_action     boolean,
  account_status   text
)
language sql
stable
security definer
set search_path = core, pg_catalog, pg_temp
as $$
  select s.id,
         s.student_code,
         s.full_name,
         cr.id,
         cr.decision,
         cr.decided_at,
         tv.version,
         core.required_terms_version(),
         (cr.id is null
          or cr.decision <> 'granted'
          or tv.version < core.required_terms_version()),
         coalesce(u.status, 'no_account')
    from core.parent_students ps
    join core.parents  p  on p.id = ps.parent_id
    join core.students s  on s.id = ps.student_id
    left join core.users u on u.id = s.user_id
    left join core.consent_records cr
           on cr.student_id = s.id and cr.user_id = p.user_id and cr.superseded_at is null
    left join core.terms_versions tv on tv.id = cr.terms_version_id
   where p.user_id = core.current_user_id()
   order by s.student_code;
$$;

comment on function core.my_consent_status() is
  'Một dòng cho mỗi đứa con của người đang đăng nhập: đã bấm chưa, bấm bản nào, tài khoản của con đang bật hay chờ. needs_action = true là thứ màn /dieu-khoan hỏi. Trả 0 dòng cho người không phải phụ huynh — đó là câu trả lời đúng, không phải lỗi.';

revoke execute on function core.sync_student_account_status(uuid)                from public;
revoke execute on function core.record_consent(uuid, uuid, text, text, text)     from public;
revoke execute on function core.has_student_consent(uuid)                        from public;
revoke execute on function core.required_terms_version()                         from public;
revoke execute on function core.my_consent_status()                              from public;

grant execute on function core.record_consent(uuid, uuid, text, text, text) to authenticated;
grant execute on function core.has_student_consent(uuid)                    to authenticated;
grant execute on function core.required_terms_version()                     to authenticated;
grant execute on function core.my_consent_status()                          to authenticated;
-- core.sync_student_account_status CỐ Ý không cấp cho authenticated: nó đổi
-- core.users.status. Người dùng cuối chỉ được chạm nó GIÁN TIẾP qua record_consent,
-- nơi có hàng rào quan hệ cha–con. (Lời gọi bên trong record_consent kiểm quyền theo
-- chủ hàm, không theo người gọi, nên vẫn chạy.)

-- ---------------------------------------------------------------------------
-- 5. Khoảng hở, gọi tên ra chứ không giấu
-- ---------------------------------------------------------------------------
-- File này KHÔNG tự chuyển tài khoản đang active về pending (xem phần đầu). Hệ quả:
-- hôm nay tồn tại những tài khoản học sinh đang bật mà chưa có phiếu nào. Nếu để im
-- thì đó đúng là kiểu "im lặng không phải kết luận" mà kho này chống — nên nó được
-- phơi ra thành một view có tên, đếm được bằng một câu SELECT.
create or replace view core.v_consent_gap as
  select s.id            as student_id,
         s.student_code,
         s.full_name     as student_name,
         s.school_id,
         u.id            as user_id,
         u.status        as account_status,
         core.required_terms_version() as required_version
    from core.students s
    join core.users    u on u.id = s.user_id
   where u.status = 'active'
     and not core.has_student_consent(s.id);

comment on view core.v_consent_gap is
  'Học sinh CÓ tài khoản đang bật mà CHƯA có phiếu đồng ý còn hiệu lực. Rỗng = lời hứa "chưa bấm thì chưa bật" đúng với mọi em. Cố ý KHÔNG grant cho authenticated: đây là danh sách vận hành, không phải màn hình. Điều kiện đóng khoảng hở: DEBT #40.';

-- ---------------------------------------------------------------------------
-- 6. Kênh "Mình cần gặp thầy cô" KHÔNG BAO GIỜ đứng sau cái nút của bố mẹ
-- ---------------------------------------------------------------------------
-- Xem phần "RANH GIỚI" ở đầu file. Trước file này bảng có đúng một đường ghi
-- (`help_requests_insert_self`), nên khoá tài khoản em là cắt luôn kênh kêu cứu.
--
-- `source` nói THẬT trên màn hình: dòng do thầy cô ghi hộ không được hiện ra như thể
-- chính em vừa viết. `created_by` là cột NGƯỜI THAO TÁC (ADR-021) — ghi hộ mà không
-- có tên người ghi thì không ai chịu trách nhiệm cho lời nhắn đó.
alter table attendance.help_requests
  add column if not exists source     text not null default 'self',
  add column if not exists created_by uuid references core.users(id) on delete set null;

alter table attendance.help_requests
  drop constraint if exists help_requests_source_chk,
  add  constraint help_requests_source_chk check (source in ('self', 'staff'));

comment on column attendance.help_requests.source is
  '''self'' = chính em bấm · ''staff'' = thầy cô ghi hộ (em chưa có tài khoản, hoặc tài khoản đang chờ phụ huynh đồng ý). Màn hình phải nói đúng cái nào là cái nào.';
comment on column attendance.help_requests.created_by is
  'NGƯỜI THAO TÁC — ai ghi hộ. NULL với dòng do chính em gửi. ON DELETE SET NULL theo ADR-021.';

-- Siết đường cũ: chính em ghi thì phải là 'self'. Không siết thì một tài khoản học
-- sinh tự khai `source='staff'` và lời nhắn của em hiện lên như của thầy cô.
drop policy if exists help_requests_insert_self on attendance.help_requests;
create policy help_requests_insert_self on attendance.help_requests
  for insert to authenticated
  with check (core.is_me(student_id) and source = 'self');

-- Đường ghi hộ. Phạm vi đúng bằng `core.can_see_care` — cùng tập người đã đọc được
-- yêu cầu này từ 0037 (GVCN của em, tâm lý cụm, người đại diện). Không mở rộng thêm
-- một ai: người ghi hộ phải là người vốn đã có trách nhiệm chăm sóc em.
drop policy if exists help_requests_insert_by_care on attendance.help_requests;
create policy help_requests_insert_by_care on attendance.help_requests
  for insert to authenticated
  with check (core.can_see_care(student_id) and source = 'staff');

-- ---------------------------------------------------------------------------
-- 7. Bản điều khoản số 1 — viết cho PHỤ HUYNH VIỆT đọc, không cho luật sư
-- ---------------------------------------------------------------------------
-- Luật tự đặt cho đoạn văn dưới đây: mỗi câu phải chỉ được vào một thứ ĐANG CHẠY THẬT
-- trong hệ. Không hứa mã hoá (ADR-002 chốt là không mã hoá). Không hứa nút tự rút lại
-- (chưa có — DEBT #40, nên câu viết là "gửi yêu cầu tới trường"). Không hứa app cho
-- phụ huynh xem tâm trạng từng ngày (ADR-025/026 chốt là KHÔNG được xem).
--
-- Nội dung đặt trong migration chứ không trong seed: seed không chạy ở CSDL của
-- trường thật, mà màn /dieu-khoan không có chữ thì không bấm được. Cùng lý lẽ với
-- `care.thresholds` seed trong 0005.
insert into core.terms_versions (version, title, body_md, bat_dong_y_lai, published_at)
values (
  1,
  'Trường Việt Anh dùng thông tin của con như thế nào',
$md$
Kính gửi bố mẹ,

Trường đang dùng một phần mềm để theo dõi và chăm sóc học sinh hằng ngày. Trước khi bật
tài khoản cho con, trường xin bố mẹ đọc và bấm đồng ý. Dưới đây là toàn bộ những gì
phần mềm làm với thông tin của con — không nhiều hơn.

## Trường ghi lại những gì

- **Con có đi học hôm nay không.** Giờ đến lớp, có mặt hay vắng, vắng có phép hay không.
  Thầy cô chủ nhiệm ghi; con cũng có thể tự bấm bằng điện thoại khi ở trường.
- **Hôm nay con thấy thế nào.** Con chọn một trong bốn mức: Vui, Bình thường, Mệt, Buồn.
  Con tự chọn, không ai chọn thay, và con có thể không chọn.
- **Khi con bấm "Mình cần gặp thầy cô".** Con chọn chuyện gì, mức độ gấp, và có thể
  viết vài dòng nếu muốn.
- **Ghi chép chăm sóc.** Khi thầy cô hoặc phòng tâm lý làm việc với con, việc đó được
  ghi lại để lần sau người khác biết đã có ai giúp con rồi.
- **Nhật ký y tế.** Nhân viên y tế ghi khi con vào phòng y tế, uống thuốc, hay có sự cố.

## Ai đọc được gì

- **Bố mẹ** đọc được: con đi học có đều không, và báo cáo trưởng thành của con. Bố mẹ
  **không** đọc được tâm trạng từng ngày của con, và **không** đọc được lời con viết ở
  mục "Mình cần gặp thầy cô". Đây không phải là giấu bố mẹ: một đứa trẻ chỉ nói thật
  khi biết chắc lời mình nói không bị đọc lại ở nhà ngay tối hôm đó.
- **Thầy cô chủ nhiệm** đọc được: con đi học thế nào, và tín hiệu "em này cần để ý" khi
  phần mềm phát hiện điều bất thường. Từ ngày 01/08/2026, thầy cô chủ nhiệm **không**
  còn đọc được nhật ký tâm trạng từng ngày của con.
- **Thầy cô tâm lý** đọc được nhật ký tâm trạng và lời con viết — đó là công việc của
  thầy cô ấy.
- **Ban giám hiệu** chỉ xem số tổng hợp theo lớp, không xem của từng em.

## Ba điều trường cam kết

1. **Không dùng cảm xúc để chấm điểm.** Tâm trạng của con và ghi chép của phòng tâm lý
   không bao giờ đi vào học bạ, điểm số hay xếp loại thi đua. Điều này được chặn bằng
   phần mềm, không chỉ bằng lời hứa.
2. **Chi tiết cảm xúc tự xoá sau 12 tháng.** Sau một năm, phần mềm xoá chi tiết từng
   ngày và chỉ giữ lại số tổng hợp. Việc xoá do máy tự làm theo lịch.
3. **Không bán, không cho ai ngoài trường.** Thông tin của con nằm trong hệ thống của
   trường. Các phần mềm phụ mà trường dùng thêm chỉ nhận một mã thay tên, không nhận
   tên thật và không nhận mã học sinh.

## Quyền của bố mẹ

- Xem lại phiếu đồng ý này bất cứ lúc nào.
- **Rút lại đồng ý.** Hiện tại bố mẹ gửi yêu cầu tới nhà trường (gặp giáo viên chủ
  nhiệm hoặc văn phòng); trường ghi nhận và tài khoản của con trở về trạng thái chờ.
  Nút tự rút lại ngay trên ứng dụng đang được làm.
- **Yêu cầu xoá thông tin cá nhân của con** theo Luật Bảo vệ dữ liệu cá nhân
  91/2025/QH15. Trường xoá tên, email và đường đăng nhập; riêng ghi chép "ai đã làm gì
  cho con" thì giữ lại, vì đó cũng là quyền của bố mẹ khi cần hỏi lại về sau.

## Nếu bố mẹ chưa bấm đồng ý

Tài khoản đăng nhập của con **chưa được bật**: con chưa tự bấm tâm trạng bằng điện
thoại được. Nhưng việc học của con **không** bị ảnh hưởng — thầy cô vẫn điểm danh cho
con như thường, và nếu con cần gặp thầy cô thì thầy cô ghi giúp con. Đường nhờ giúp đỡ
của một đứa trẻ không bao giờ phụ thuộc vào việc người lớn đã bấm nút hay chưa.
$md$,
  -- Bản đầu tiên: đương nhiên phải bấm mới có hiệu lực.
  true,
  now()
)
on conflict (version) do nothing;

commit;
