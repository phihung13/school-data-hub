-- 0047_duong_keu_cuu_khong_khoa.sql
-- Trả `core.users.status` về đúng nghĩa của nó (công tắc DANH TÍNH), dời cổng đồng ý
-- sang đúng đường nó phải gác (việc XỬ LÝ DỮ LIỆU của con), và khoá chặt bằng trigger +
-- bài test cái đường mà không thao tác nào của người lớn được phép cắt.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CÁI HỎNG, ĐO ĐƯỢC ĐẦU-CUỐI TRÊN SERVER THẬT — không phải suy đoán
-- ═══════════════════════════════════════════════════════════════════════════
-- Chuỗi sự kiện, đúng thứ tự, mỗi bước đều đọc được trong mã của 0046:
--
--   1. Phụ huynh bấm "rút lại đồng ý"  → `core.record_consent` (0046:436).
--   2. `record_consent` gọi `core.sync_student_account_status` (0046:520).
--   3. Hàm đó đặt `core.users.status = 'pending'` cho tài khoản của em (0046:418-423).
--   4. `core.resolve_user_id_uncached` (0029:97) chỉ trả `u.id` khi `u.status='active'`
--      ⇒ `core.current_user_id()` trả NULL cho em.
--   5. NULL nghĩa là `core.is_me(student_id)` false ⇒ MỌI policy dựa vào nó câm — trong
--      đó có `help_requests_insert_self`, đường DUY NHẤT để chính em bấm
--      "Mình cần gặp thầy cô".
--
-- Nghiệm thu đợt E tái hiện đủ năm bước trên bản chạy thật: phụ huynh bấm rút lại →
-- `studentAccountStatus='pending'` → cùng cookie còn hạn của em, `checkin.submitMood`
-- và `checkin.requestHelp` đều 403. Em không còn cách nào nói "con cần gặp thầy cô".
--
-- Trớ trêu là 0046 BIẾT chuyện này: nó viết hẳn một mục 6 ("Kênh Mình cần gặp thầy cô
-- KHÔNG BAO GIỜ đứng sau cái nút của bố mẹ") và mở đường ghi hộ cho thầy cô. Nhưng ghi
-- hộ là đường của NGƯỜI KHÁC. Nó đòi em phải mở lời trực tiếp với một người lớn trước —
-- mà cái nút trong máy tồn tại chính vì có những đứa trẻ không mở lời trực tiếp được.
-- Giữ đường ghi hộ và coi như đã bù xong là đổi một cái nút riêng tư lấy một cuộc trò
-- chuyện phải xin phép; với em cần nó nhất thì đó là mất hẳn.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CHỖ SAI GỐC: MỘT CỘT GÁNH HAI KHÁI NIỆM
-- ═══════════════════════════════════════════════════════════════════════════
-- `core.users.status` là công tắc DANH TÍNH — "người này còn là người dùng của hệ không"
-- (nghỉ học, thôi việc, đã ẩn danh hoá theo Luật 91/2025 — 0033 đặt 'disabled').
-- Phiếu đồng ý trả lời một câu KHÁC HẲN — "trường được xử lý dữ liệu nào của đứa trẻ này".
--
-- 0046 mượn cột danh tính làm công tắc đồng ý vì nó có sẵn và có răng thật. Cái giá của
-- việc gộp hai khái niệm vào một cột hiện ra ngay ở ca đầu tiên: tắt công tắc đồng ý là
-- tắt luôn danh tính, mà danh tính là thứ MỌI quyền bám vào — kể cả quyền kêu cứu. Không
-- có cách nào tinh chỉnh một công tắc như thế: nó chỉ có bật và tắt, và tắt là tắt hết.
--
-- Nên file này TÁCH ĐÔI:
--   · `core.users.status`            → chỉ còn là công tắc DANH TÍNH. Đồng ý không chạm.
--   · `core.has_student_consent()`   → vị ngữ ĐỒNG Ý (0046 đã dựng sẵn, chưa gác gì).
--     Từ đây nó gác ĐÚNG những đường là "xử lý dữ liệu của con".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RANH GIỚI MỚI — TỪNG ĐƯỜNG MỘT, KHÔNG NÓI CHUNG CHUNG (ADR-027 bản 2)
-- ═══════════════════════════════════════════════════════════════════════════
-- (1) "Mình cần gặp thầy cô" (chính em bấm) — KHÔNG BAO GIỜ KHOÁ.
--     An toàn của một đứa trẻ không phải một tính năng để cân đối với thứ khác. Sau file
--     này không có trạng thái hành chính nào của người lớn tắt được nó, vì đồng ý không
--     còn chạm tới danh tính của em nữa. Khoá bằng trigger (mục 2) + bài test (0047 pgTAP
--     và tests/db/dieu-khoan.test.ts), không bằng lời hứa trong chú thích.
--
-- (2) Ghi tâm trạng hằng ngày — KHOÁ.
--     Đây đúng là thứ phiếu đồng ý nói tới: dữ liệu cảm xúc của trẻ, do chính em khai, và
--     KHÔNG có cơ sở pháp lý nào khác ngoài sự đồng ý của người đại diện. Nếu cổng đồng ý
--     không gác cái này thì nó không gác gì cả, và cái nút của phụ huynh thành đồ trang
--     trí. Gác ở RLS (mục 3), theo CỘT `mood` chứ không theo DÒNG — dòng check-in vẫn ghi
--     được, chỉ ô tâm trạng là trống.
--
-- (3) Điểm danh — KHÔNG khoá, cả đường cô ghi lẫn đường em tự bấm có mặt.
--     Trường có nghĩa vụ trông giữ trẻ và phải biết đứa trẻ có ở trong trường hay không;
--     nghĩa vụ đó đứng trên một cơ sở pháp lý khác cái nút của bố mẹ, và một trường không
--     điểm danh được là một trường không giữ được trẻ. Vì mood và điểm danh nằm CHUNG một
--     dòng `attendance.checkins`, cổng phải gác theo cột — gác theo dòng là lấy mất điểm
--     danh theo, đúng cái bẫy 0044 đã gặp và ghi lại.
--
-- (4) Đọc Báo cáo Trưởng thành (phụ huynh đọc về con mình) — KHÔNG khoá.
--     Hai lý do, mỗi lý do đủ đứng một mình:
--       · Luật 91/2025 đòi sự đồng ý phải TỰ NGUYỆN. Giữ lại một thứ phụ huynh vốn có
--         quyền biết về con mình để đổi lấy chữ ký là biến phiếu đồng ý thành phí vào
--         cửa — và một sự đồng ý bị mua bằng cách đó thì không còn giá trị pháp lý.
--       · Nó KHÔNG thêm được lớp bảo vệ nào: dữ liệu vào báo cáo đã bị gác từ đầu nguồn
--         (chưa đồng ý ⇒ không có mood để tổng hợp). Gác thêm ở cửa đọc chỉ phạt đúng
--         người vừa được hỏi ý kiến.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- MỘT CÂU HỨA CŨ KHÔNG CÒN ĐÚNG NGUYÊN VĂN — NÓI RA, KHÔNG ĐỂ TỰ PHÁT HIỆN
-- ═══════════════════════════════════════════════════════════════════════════
-- Chủ đầu tư yêu cầu nguyên văn: "em nào chưa có phiếu thì không bật tài khoản". Sau file
-- này câu đó KHÔNG còn đúng — tài khoản của em vẫn bật. Câu thay thế, đúng với thứ đang
-- chạy:
--
--   "Chưa bấm thì phần mềm chưa ghi tâm trạng của con — và đường con nhờ giúp đỡ thì
--    không bao giờ khoá."
--
-- Vì sao câu mới ĐÚNG HƠN chứ không phải yếu hơn: câu cũ nghe như bảo vệ đứa trẻ, nhưng
-- thứ nó thật sự tắt là ĐƯỜNG của đứa trẻ, còn dữ liệu thì trường vẫn ghi bình thường
-- (cô vẫn điểm danh, y tế vẫn ghi, ghi chép chăm sóc vẫn chạy). Câu mới tắt đúng thứ
-- phụ huynh muốn tắt — việc thu thập cảm xúc của con — và không tắt thứ không ai muốn tắt.
-- Bản điều khoản số 2 (mục 5) viết lại đoạn đó bằng lời phụ huynh đọc được, và
-- `danh-cho-nguoi/ho-so-he-thong.html` nói lại đúng như vậy.
--
-- Phụ thuộc: 0002 (core.users, CHECK status), 0014/0017/0025 (policy tự check-in),
-- 0029 (core.begin_user_context, resolve_user_id_uncached), 0033 (ẩn danh hoá đặt
-- 'disabled'), 0046 (bảng điều khoản + sổ đồng ý + has_student_consent).

begin;

-- ---------------------------------------------------------------------------
-- 1. Đồng ý THÔI chạm vào danh tính
-- ---------------------------------------------------------------------------
-- Bỏ hẳn `core.sync_student_account_status` thay vì để lại một hàm rỗng: một hàm tên
-- "sync" mà không sync gì là một cái bẫy đọc — người sau sẽ gọi nó và tin rằng trạng thái
-- đã được đồng bộ. Bỏ hàm thì lời gọi nào còn sót lại sẽ ném lỗi ồn ào lúc chạy, chứ
-- không im lặng trả về một chuỗi vô nghĩa.
drop function if exists core.sync_student_account_status(uuid);

-- `record_consent` giữ NGUYÊN chữ ký (5 tham số, trả jsonb) — đổi chữ ký là đổi hợp đồng
-- với router và với bài test đang xanh, mà thứ cần đổi ở đây là HÀNH VI chứ không phải
-- hình dạng. Khoá idempotent §9, hàng rào quan hệ cha-con, khoá dòng đang hiệu lực: giữ
-- nguyên từng chữ của 0046, đã đo là đúng, không sửa cái đang đúng.
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
  v_mood    boolean;
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

  select * into v_live
    from core.consent_records
   where user_id = v_user and student_id = p_student_id and superseded_at is null
     for update;

  if found and v_live.decision = p_decision and v_live.terms_version_id = p_terms_version_id then
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
      select id into v_id
        from core.consent_records
       where user_id = v_user and student_id = p_student_id and superseded_at is null;
    end;
  end if;

  -- ĐÂY là dòng đã cắt đường kêu cứu của một đứa trẻ, và đây là chỗ nó biến mất:
  --     v_status := core.sync_student_account_status(p_student_id);   -- 0046
  -- Nay chỉ ĐỌC trạng thái danh tính để trả về cho màn hình. Ghi phiếu đồng ý không còn
  -- là một lệnh bật/tắt tài khoản của bất kỳ ai.
  select coalesce(u.status, 'no_account')
    into v_status
    from core.students s
    left join core.users u on u.id = s.user_id
   where s.id = p_student_id;
  v_status := coalesce(v_status, 'no_account');

  -- Thứ lần bấm này THẬT SỰ đổi. Trả về để màn hình nói đúng hậu quả của cú bấm thay vì
  -- nói một câu chung chung: đây là hợp đồng giữa nút bấm của phụ huynh và cái tắt đi.
  v_mood := core.has_student_consent(p_student_id);

  return jsonb_build_object(
    'consentId',            v_id,
    'decision',             p_decision,
    'created',              v_created,
    'termsVersion',         v_tv.version,
    'studentAccountStatus', v_status,
    'moodEnabled',          v_mood
  );
end;
$$;

comment on function core.record_consent(uuid, uuid, text, text, text) is
  'Đường ghi DUY NHẤT vào core.consent_records. Từ 0047: KHÔNG còn chạm core.users.status — phiếu đồng ý gác việc XỬ LÝ DỮ LIỆU (mood), không gác DANH TÍNH của đứa trẻ. Idempotent §9: bấm hai lần trả lại đúng dòng cũ, created=false. Trả thêm moodEnabled = hậu quả thật của cú bấm. Từ chối: 28000 chưa đăng nhập · 22023 bản điều khoản sai/chưa công bố · 42501 không phải người đại diện của em này.';

-- `my_consent_status` phải nói thêm MỘT sự thật mới: cú bấm của bố mẹ bật/tắt cái gì.
-- Đổi danh sách cột trả về nên phải drop trước — Postgres không cho `create or replace`
-- đổi kiểu trả về của hàm.
drop function if exists core.my_consent_status();
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
  account_status   text,
  mood_enabled     boolean
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
         coalesce(u.status, 'no_account'),
         -- CỐ Ý hỏi `has_student_consent` chứ không suy từ `needs_action`: nhà có hai
         -- người đại diện mà người kia đã bấm thì phần tâm trạng của con ĐANG BẬT, dù
         -- người đang đăng nhập vẫn còn việc phải làm. Suy từ needs_action là nói với
         -- một người bố rằng phần mềm đang không ghi tâm trạng con mình, trong khi nó có.
         core.has_student_consent(s.id)
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
  'Một dòng cho mỗi đứa con của người đang đăng nhập: đã bấm chưa, bấm bản nào, và (từ 0047) mood_enabled — phần ghi tâm trạng của con đang bật hay tắt, tức thứ cú bấm này thật sự điều khiển. account_status là trạng thái DANH TÍNH, không còn liên quan tới phiếu đồng ý. Trả 0 dòng cho người không phải phụ huynh.';

revoke execute on function core.record_consent(uuid, uuid, text, text, text) from public;
revoke execute on function core.my_consent_status()                          from public;
grant  execute on function core.record_consent(uuid, uuid, text, text, text) to authenticated;
grant  execute on function core.my_consent_status()                          to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Trigger: KHÔNG ai đẩy được một tài khoản đang dùng về trạng thái chờ
-- ---------------------------------------------------------------------------
-- Vì sao cần trigger khi vừa bỏ lời gọi gây lỗi: bỏ một dòng code chỉ sửa được HÔM NAY.
-- Đường đi từ "ai đó đặt status='pending'" tới "một đứa trẻ không bấm được nút kêu cứu"
-- dài năm bước và đi qua bốn file — không ai đọc `update core.users set status='pending'`
-- mà thấy trước hậu quả đó. Gói việc dựng màn điều khoản đã ghi mệnh lệnh này bằng chữ in
-- hoa và vẫn vấp, nên lần này nó phải là ràng buộc của máy.
--
-- Chỉ chặn ĐƯỜNG VÀO 'pending' bằng UPDATE. INSERT vẫn tạo được tài khoản 'pending' — đó
-- là ca thật và vô hại: tài khoản vừa lập, chưa bàn giao cho ai, chưa có đứa trẻ nào đang
-- dựa vào nó. Cái bị cấm là HẠ một tài khoản đang dùng xuống chờ.
--
-- Muốn ngừng cho một tài khoản dùng hệ thì đã có đúng đường: 'disabled' (và
-- `core.anonymize_user` cho yêu cầu xoá theo Luật 91/2025). Cố ý KHÔNG mở cửa thoát hiểm
-- kiểu `hub.allow_*` như 0033/0046: hai chỗ đó bảo vệ một DÒNG dữ liệu và cần đường dọn
-- rác test; chỗ này bảo vệ đường kêu cứu của một đứa trẻ, và một cửa thoát hiểm ở đây sẽ
-- được dùng đúng vào lúc không nên dùng.
-- `security definer` + `set search_path` cố định: giống hệt ba hàm canh cùng loại của kho
-- (`tg_consent_append_only`, `tg_terms_version_immutable`, `tg_block_user_hard_delete`), và
-- không phải cho đẹp đội hình. Thân hàm so sánh chuỗi bằng toán tử `=`; hàm không neo
-- search_path thì toán tử đó được phân giải theo search_path của NGƯỜI GỌI, nên ai tạo
-- được một schema đứng trước `pg_catalog` là dựng được một `=`(text,text) luôn trả false —
-- cái chặn biến mất mà không dòng nào trong file này đổi. Một hàng rào bảo vệ đường kêu cứu
-- của đứa trẻ thì không được phụ thuộc vào biến phiên của kẻ đang ghi.
create or replace function core.tg_users_no_pending_downgrade()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status = 'pending' and old.status is distinct from 'pending' then
    raise exception 'Không hạ tài khoản đang dùng (%) xuống trạng thái chờ.', old.status
      using errcode = 'restrict_violation',
            hint    = 'status là công tắc DANH TÍNH. Mọi phép kiểm quyền bám vào nó, GỒM CẢ đường học sinh bấm "Mình cần gặp thầy cô" (help_requests_insert_self → core.is_me → core.current_user_id → status=active). Muốn ngừng cho dùng thì đặt ''disabled''; muốn tắt việc thu thập dữ liệu thì ghi phiếu đồng ý (core.record_consent), không đụng cột này. ADR-027 bản 2.';
  end if;
  return new;
end;
$$;

comment on function core.tg_users_no_pending_downgrade() is
  'Chặn UPDATE đưa core.users.status về ''pending''. Vá lỗi chặn đo được 01/08/2026: phụ huynh rút lại đồng ý → 0046 hạ status của học sinh về pending → core.current_user_id() NULL → em KHÔNG ghi được help_requests. INSERT không bị chặn (tài khoản mới lập chưa ai dựa vào).';

drop trigger if exists users_no_pending_downgrade on core.users;
create trigger users_no_pending_downgrade
  before update on core.users
  for each row
  execute function core.tg_users_no_pending_downgrade();

-- ---------------------------------------------------------------------------
-- 3. Cổng đồng ý về đúng chỗ: CỘT mood, không phải danh tính
-- ---------------------------------------------------------------------------
-- Gác theo CỘT chứ không theo DÒNG. Nếu điều kiện là `core.has_student_consent(student_id)`
-- trơn thì em chưa có phiếu sẽ không tự bấm được có mặt nữa — tức là lại lấy mất một thứ
-- không liên quan tới phiếu đồng ý, đúng kiểu hỏng mà cả file này sinh ra để dẹp. Điều
-- kiện `mood is null or …` cho phép đúng một việc: dòng check-in vẫn ghi, ô tâm trạng để
-- trống.
--
-- Vì sao ở RLS chứ không ở router: router là thứ sửa được bằng một dòng TypeScript, và
-- lời hứa với phụ huynh không được sống bằng niềm tin vào code server (cùng lý lẽ 0025 đã
-- viết khi đổi "app chỉ UPDATE cột mood" từ niềm tin sang cưỡng chế). Router VẪN kiểm
-- trước — nhưng để NÓI CHO EM BIẾT vì sao, không phải để chặn.
drop policy if exists checkins_insert_self on attendance.checkins;
create policy checkins_insert_self on attendance.checkins for insert to authenticated
  with check (
    core.is_me(student_id)
    and (mood is null or core.has_student_consent(student_id))
  );
comment on policy checkins_insert_self on attendance.checkins is
  'Chỉ tự check-in cho chính mình. Từ 0047 (ADR-027 bản 2): ghi kèm TÂM TRẠNG đòi phiếu đồng ý còn hiệu lực của người đại diện; ghi CÓ MẶT thì không — điểm danh là nghĩa vụ trông giữ trẻ, đứng trên cơ sở pháp lý khác.';

drop policy if exists checkins_update_self on attendance.checkins;
create policy checkins_update_self on attendance.checkins for update to authenticated
  using (core.is_me(student_id))
  with check (
    core.is_me(student_id)
    and (mood is null or core.has_student_consent(student_id))
  );
comment on policy checkins_update_self on attendance.checkins is
  'Tự sửa lại check-in của chính mình trong ngày (nhánh ON CONFLICT DO UPDATE của submitMood). Quyền theo cột (0025) + trigger checkins_guard_confirmation cưỡng chế phần status/confirmed_by. Từ 0047: đặt giá trị mood đòi phiếu đồng ý — xoá mood về NULL thì không, vì rút lại đồng ý phải luôn đi được theo chiều tắt.';

-- ---------------------------------------------------------------------------
-- 4. Khoảng hở được đo lại theo THƯỚC MỚI
-- ---------------------------------------------------------------------------
-- `core.v_consent_gap` của 0046 đo "tài khoản đang bật mà chưa có phiếu" — sau file này
-- câu đó không còn là một khoảng hở, vì tài khoản bật không còn nghĩa là dữ liệu đang bị
-- thu thập. Giữ nguyên tên (đã có tài liệu và bài test trỏ vào) nhưng đo đúng câu hỏi còn
-- lại: em nào CÓ TÀI KHOẢN mà nhà chưa có phiếu — tức danh sách trường phải đi xin, không
-- phải danh sách lỗi.
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
   where u.status <> 'disabled'
     and not core.has_student_consent(s.id);

comment on view core.v_consent_gap is
  'Học sinh CÓ tài khoản mà nhà chưa có phiếu đồng ý còn hiệu lực — danh sách trường phải đi xin phiếu. Từ 0047 đây KHÔNG còn là danh sách lỗi: tài khoản của các em vẫn bật (đường kêu cứu không khoá), chỉ phần ghi tâm trạng là đang tắt. Danh sách lỗi thật nằm ở core.v_mood_khong_phieu.';

-- Khoảng hở THẬT sau 0047, và nó đếm được bằng một câu SELECT: dòng tâm trạng đang nằm
-- trong kho của những em không có phiếu đồng ý còn hiệu lực. Sau file này không đường nào
-- sinh thêm được dòng như vậy (RLS chặn), nên mọi dòng đếm được đều là dòng CŨ — thu
-- trước khi có cổng, hoặc thu hợp lệ rồi phụ huynh rút lại sau.
--
-- Vì sao KHÔNG tự xoá chúng ngay trong file này: rút lại đồng ý là "ngừng xử lý từ nay",
-- còn xoá dữ liệu đã thu là một quyền KHÁC và phải do người ta yêu cầu (Luật 91/2025).
-- Tự xoá là tự quyết thay phụ huynh, và xoá một chiều thì không có đường lùi. Job dọn
-- 12 tháng của 0031 vẫn chạy trên các dòng này như thường.
create or replace view core.v_mood_khong_phieu as
  select s.id        as student_id,
         s.student_code,
         s.school_id,
         count(*)::int         as so_dong_mood,
         min(c.occurred_on)    as tu_ngay,
         max(c.occurred_on)    as den_ngay
    from attendance.checkins c
    join core.students s on s.id = c.student_id
   where c.mood is not null
     and not core.has_student_consent(s.id)
   group by s.id, s.student_code, s.school_id;

comment on view core.v_mood_khong_phieu is
  'Dữ liệu tâm trạng đang lưu của những em KHÔNG có phiếu đồng ý còn hiệu lực. Rỗng = lời hứa "chưa bấm thì phần mềm chưa ghi tâm trạng của con" đúng với mọi em. Không rỗng = dòng thu trước khi có cổng (0047) hoặc thu hợp lệ rồi phụ huynh rút lại — xoá là quyền RIÊNG của phụ huynh, không tự làm thay (DEBT #48). Cố ý không GRANT cho authenticated: sổ vận hành, không phải màn hình.';

-- ---------------------------------------------------------------------------
-- 5. Bản điều khoản số 2 — sửa đúng câu đã nói sai với phụ huynh
-- ---------------------------------------------------------------------------
-- Bản 1 (0046) viết: "Tài khoản đăng nhập của con CHƯA ĐƯỢC BẬT". Sau file này câu đó
-- không còn đúng. Bản 1 là bằng chứng pháp lý nên KHÔNG được sửa (trigger
-- terms_versions_immutable, và đó là điều đúng) — đường duy nhất để nói lại cho đúng là
-- CÔNG BỐ BẢN MỚI. Đúng cái cửa mà 0046 đã dựng sẵn cho tình huống này.
--
-- `bat_dong_y_lai = false`, và đây là câu hỏi pháp lý nặng nhất của bản này nên phải trả
-- lời có lý do chứ không chọn cho tiện:
--   · Bản 2 KHÔNG mở rộng dữ liệu thu thập, KHÔNG thêm bên thứ ba, KHÔNG đổi thời hạn
--     lưu — ba tiêu chí "sửa đáng kể" mà chú thích cột bat_dong_y_lai liệt kê. Nó thu HẸP
--     phạm vi hậu quả: cái mất khi chưa bấm nhỏ hơn bản 1 nói.
--   · Đánh dấu true là đẩy `core.required_terms_version()` lên 2 ⇒ mọi phiếu bản 1 hết
--     hiệu lực cùng lúc ⇒ tâm trạng của toàn bộ học sinh đang dùng tắt giữa năm học, vì
--     một lần sửa câu chữ. Đó đúng là phương án A mà ADR-027 (c) đã cân và loại.
--   · Phụ huynh nào đã ký bản 1 thì phiếu của họ giữ nguyên hiệu lực, và họ vẫn đọc được
--     bản 2 trên màn (router lấy bản ĐÃ CÔNG BỐ MỚI NHẤT để trình).
insert into core.terms_versions (version, title, body_md, bat_dong_y_lai, published_at)
values (
  2,
  'Trường Việt Anh dùng thông tin của con như thế nào',
$md$
Kính gửi bố mẹ,

Trường đang dùng một phần mềm để theo dõi và chăm sóc học sinh hằng ngày. Bản này thay cho
bản trước, và trường xin nói rõ ngay điều đã viết chưa đúng ở bản trước: **trường KHÔNG
khoá tài khoản của con khi bố mẹ chưa bấm đồng ý.** Đường con dùng để nhờ giúp đỡ không
bao giờ bị khoá bởi bất kỳ thao tác nào của người lớn. Cái phiếu này quyết định là trường
được ghi lại những gì về con, chứ không phải con có được dùng phần mềm hay không.

## Trường ghi lại những gì

- **Con có đi học hôm nay không.** Giờ đến lớp, có mặt hay vắng, vắng có phép hay không.
  Thầy cô chủ nhiệm ghi; con cũng có thể tự bấm bằng điện thoại khi ở trường.
- **Hôm nay con thấy thế nào.** Con chọn một trong bốn mức: Vui, Bình thường, Mệt, Buồn.
  Con tự chọn, không ai chọn thay, và con có thể không chọn. **Đây chính là phần cần bố mẹ
  đồng ý** — chưa có phiếu của bố mẹ thì phần mềm không ghi mức nào cả.
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
  nhiệm hoặc văn phòng); trường ghi nhận và phần mềm ngừng ghi tâm trạng của con ngay từ
  lúc đó. Nút tự rút lại ngay trên ứng dụng đang được làm.
- **Yêu cầu xoá thông tin cá nhân của con** theo Luật Bảo vệ dữ liệu cá nhân
  91/2025/QH15. Trường xoá tên, email và đường đăng nhập; riêng ghi chép "ai đã làm gì
  cho con" thì giữ lại, vì đó cũng là quyền của bố mẹ khi cần hỏi lại về sau. Những mức
  tâm trạng con đã chọn trước khi bố mẹ rút lại thì trường giữ cho tới hạn 12 tháng ở
  trên, hoặc xoá sớm nếu bố mẹ yêu cầu.

## Nếu bố mẹ chưa bấm đồng ý

Phần mềm **không ghi tâm trạng của con** — mục "Hôm nay con thấy thế nào" ở máy của con
tắt, và trường không có mức nào của con trong kho.

Còn lại giữ nguyên, không thứ nào bị cắt:

- **Tài khoản của con vẫn dùng được.** Con vẫn đăng nhập, vẫn xem được lịch và chuyên cần
  của mình.
- **Nút "Mình cần gặp thầy cô" của con vẫn bấm được.** Đường một đứa trẻ nhờ giúp đỡ không
  bao giờ phụ thuộc vào việc người lớn đã bấm nút hay chưa — kể cả khi bố mẹ đã trả lời
  "chưa đồng ý", kể cả sau khi bố mẹ rút lại.
  Nếu con không muốn tự bấm thì thầy cô ghi giúp con.
- **Thầy cô vẫn điểm danh cho con** như thường, và con vẫn tự bấm có mặt được.
- **Bố mẹ vẫn xem được chuyên cần và Báo cáo Trưởng thành của con.** Trường không giữ lại
  thứ gì của bố mẹ để đổi lấy chữ ký.
$md$,
  false,
  now()
)
on conflict (version) do nothing;

commit;
