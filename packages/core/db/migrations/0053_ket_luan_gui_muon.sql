-- 0053_ket_luan_gui_muon.sql
-- Thi hành ADR-029 (duyệt 06/08/2026, chủ đầu tư quyết trực tiếp): GVCN được kết luận
-- một check-in gửi muộn thành `absent`, nhưng CHỈ khi ghi lý do — và mỗi lượt ghi để
-- lại một dòng sổ có tên người, có giờ, có lý do.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ĐO THẬT TRƯỚC KHI VIẾT — và phép đo lật ngược giả định của chính giao việc
-- ═══════════════════════════════════════════════════════════════════════════
-- Giả định lúc nhận việc: "hôm nay database CẤM GVCN chuyển queued_late sang absent,
-- vì `checkins_confirm_late` (0014) khai `with check (status in ('present','late'))`".
-- Đo trên hub_dev ngày 06/08/2026, dưới đúng danh tính Cô Vân (GVCN 6A3), trên đúng
-- một dòng `queued_late` thật của em Lê Gia Bảo:
--
--     begin;
--     select set_config('request.jwt.claim.sub',
--                       '90000000-0000-0000-0000-000000000008', true);
--     set local role authenticated;
--     update attendance.checkins
--        set status = 'absent', confirmed_by = core.current_user_id()
--      where id = 'cd0e54e9-…-e834cfb8d935' and status = 'queued_late';
--     → UPDATE 1 ; dòng thành 'absent', confirmed_by = Cô Vân.
--     rollback;
--
-- Giả định SAI. Cửa `absent` đã mở từ `0032`: policy `checkins_update_by_homeroom`
-- là PERMISSIVE, và Postgres OR mọi policy permissive cùng lệnh, nên điều kiện UPDATE
-- thật trên bảng từ 0032 tới nay là
--     USING       (is_homeroom_of ∧ status='queued_late') ∨ is_homeroom_of ∨ is_me
--     WITH CHECK  (status in ('present','late'))
--                 ∨ (is_homeroom_of ∧ status in ('present','late','absent','excused'))
--                 ∨ (is_me ∧ …)
-- — nhánh giữa cho `absent` đi qua. Câu `comment on policy` của 0014 ("không tự ý sang
-- absent") vì thế **đã sai suốt từ 0032 tới hôm nay**, và sai theo kiểu tệ nhất: một
-- lời hứa an toàn viết trong chú thích mà cưỡng chế thật không còn nữa. Cùng loại bẫy
-- mà `0025` đã gỡ ("app chỉ UPDATE cột mood" là niềm tin, không phải hàng rào).
--
-- HỆ QUẢ CHO CÁCH ĐỌC FILE NÀY. Cái mà 0053 thêm KHÔNG phải là quyền ghi `absent` —
-- quyền đó đã có. Cái nó thêm là **cái giá của quyền đó**: lý do bắt buộc và một dòng
-- sổ cho mỗi lượt. Trước file này, cô đổi một ngày chuyên cần thành "vắng" mà hệ chỉ
-- giữ lại đúng một dấu vết: `confirmed_by`. Không giờ, không lý do, không biết trước
-- đó dòng ở trạng thái nào — tức là không hậu kiểm được.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ADR-029 SỬA ADR-007 Ở ĐÚNG MỘT ĐIỂM
-- ═══════════════════════════════════════════════════════════════════════════
-- ADR-007 cấm chuyển `queued_late` sang `absent`, và lý lẽ đó vẫn đúng ở chỗ nó sinh
-- ra: MÁY không được tự suy ra "vắng" từ một lần gửi muộn. Điều ADR-029 sửa là vế con
-- người: cô nhìn thấy chỗ ngồi trống của lớp mình, mà đường duy nhất để ghi lại điều
-- đó là mở CSDL sửa tay — một thao tác không ai soát được và không có lý do đi kèm.
--
-- Đánh đổi nói thẳng (nguyên văn ADR-029): mở quyền ghi `absent` là mở một đường làm
-- hỏng số chuyên cần nếu bấm ẩu; đối trọng là lý do bắt buộc, sổ vết đầy đủ, và việc
-- cô chỉ động được vào dòng `queued_late` của CHÍNH LỚP MÌNH (vế `using` của policy cũ
-- giữ nguyên từng chữ).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- BA TẦNG CANH LÝ DO — vì sao phải là ba chứ không phải một
-- ═══════════════════════════════════════════════════════════════════════════
--   1. Zod `.refine` trong `packages/core/contracts/care.ts` — bắt sớm, nói tiếng Việt
--      cho người nhập. Sửa được bằng một dòng TypeScript.
--   2. Hàm `attendance.decide_late_checkins` (file này) — `raise exception`. Hàm KHÔNG
--      tin tầng trên: một màn hình khác, một script, một lần gọi psql đều đi qua đây.
--   3. Ràng buộc `late_decisions_reason_chk` trên chính bảng sổ — tầng cuối. Kể cả khi
--      ai đó viết một hàm ghi sổ thứ hai thì hàng vẫn bị bảng từ chối.
-- Bỏ tầng 3 mà giữ tầng 2 là quay lại đúng mô hình "hàng rào sống bằng niềm tin vào
-- code" — bài pgTAP 0053 thử ngược đúng chỗ này (chèn thẳng vào sổ, thiếu lý do).
--
-- Phụ thuộc: 0004 (attendance.checkins), 0009 (core.is_homeroom_of, core.can_see_care,
--            grant schema attendance), 0014 (policy checkins_confirm_late — sửa ở đây),
--            0025 (grant theo cột + trigger checkins_guard_confirmation),
--            0032 (policy checkins_update_by_homeroom — không đụng).

begin;

-- ---------------------------------------------------------------------------
-- 1. Sổ kết luận gửi muộn
-- ---------------------------------------------------------------------------
create table attendance.late_decisions (
  id           uuid primary key default gen_random_uuid(),

  checkin_id   uuid not null references attendance.checkins(id) on delete cascade,

  -- §1: FK thẳng về core.students (ADR-011 — không bản sao thực thể lõi). Chép lại ở
  -- đây KHÔNG phải để nhân bản dữ liệu học sinh mà để truy vấn sổ khỏi phải join ngược
  -- qua attendance.checkins: câu hỏi thường gặp nhất của sổ này là "lớp/em này bị kết
  -- luận vắng mấy lần trong tháng", và phạm vi RLS của chính sổ cũng cần student_id.
  --
  -- CỐ Ý để mặc định NO ACTION (không cascade) trên FK này, khác với checkin_id ở trên.
  -- NO ACTION trong Postgres kiểm ở CUỐI câu lệnh, sau khi mọi cascade đã chạy — nên
  -- xoá một học sinh vẫn đi qua được (checkins cascade xoá, kéo theo sổ này qua
  -- checkin_id) mà không cần cấp thêm một đường xoá thứ hai vào chính cuốn sổ.
  student_id   uuid not null references core.students(id),

  from_status  text not null,
  to_status    text not null,

  reason       text,

  decided_by   uuid not null references core.users(id),
  decided_at   timestamptz not null default now(),

  -- §9: gửi lại cùng mã = cùng MỘT quyết định, không phải quyết định thứ hai.
  client_mutation_id uuid,

  constraint late_decisions_to_status_chk
    check (to_status in ('present', 'late', 'absent')),

  -- Tầng 3 của ba tầng canh lý do (xem đầu file). btrim + char_length chứ không
  -- `length(reason) >= 3`: ba dấu cách là ba ký tự và sẽ lọt.
  --
  -- THỬ NGƯỢC đã chạy thật 06/08/2026: bỏ đúng ràng buộc này ra, dựng lại hub_test từ
  -- số không rồi chạy lại bài 0053 → "not ok 14 — (b4) chèn thẳng vào sổ thiếu lý do"
  -- và CHỈ dòng đó đỏ (26/27 còn xanh, vì tầng hàm vẫn ném lỗi). Cắm lại → 27/27 xanh.
  -- Nghĩa là assertion (b4) đang đo chính cái ràng buộc này chứ không đo hộ tầng hàm.
  constraint late_decisions_reason_chk
    check (to_status = 'present'
           or (reason is not null and char_length(btrim(reason)) >= 3))
);

comment on table attendance.late_decisions is
  'ADR-029 (06/08/2026) — sổ ghi MỌI lượt GVCN kết luận một check-in gửi muộn: ai, lúc nào, từ trạng thái nào sang trạng thái nào, vì sao. Sổ này là ĐỐI TRỌNG của quyền ghi absent mà ADR-029 mở: trước nó, đổi một ngày chuyên cần thành "vắng" chỉ để lại đúng cột confirmed_by trên attendance.checkins — không giờ, không lý do, không trạng thái cũ, tức là không hậu kiểm được. Sổ CHỈ THÊM với người dùng cuối: authenticated có select + insert, KHÔNG có update/delete.';

comment on column attendance.late_decisions.checkin_id is
  'Dòng check-in bị kết luận. on delete cascade: khi bản ghi điểm danh gốc bị xoá (xoá học sinh, dọn dữ liệu quá hạn) thì dòng sổ về nó cũng đi theo — giữ lại một lời giải thích mồ côi cho một sự kiện không còn tồn tại là giữ dữ liệu trẻ em quá hạn dưới tên khác.';
comment on column attendance.late_decisions.student_id is
  '§1 — chép lại từ attendance.checkins để truy vấn sổ không phải join ngược, và để RLS của chính sổ có cột phạm vi. Không phải bản sao thực thể lõi (ADR-011): chỉ là khoá ngoại.';
comment on column attendance.late_decisions.from_status is
  'Trạng thái TRƯỚC khi kết luận. Hôm nay hàm decide_late_checkins chỉ động vào dòng queued_late nên cột luôn mang giá trị đó — cột vẫn ghi thật thay vì suy ra, vì ngày ADR sau mở thêm đường sửa (ví dụ đổi lại absent đã ghi nhầm) thì sổ cũ vẫn đọc được mà không phải đoán.';
comment on column attendance.late_decisions.to_status is
  'ADR-029 — ba kết luận: present (có mặt) · late (đi muộn) · absent (vắng). KHÔNG có excused ở đây: "có phép" là quyết định trên giấy tờ của nhà trường, đi đường điểm danh thường (0032), không phải kết luận về một bản gửi muộn.';
comment on column attendance.late_decisions.reason is
  'ADR-029 — BẮT BUỘC (>= 3 ký tự sau khi cắt khoảng trắng) khi to_status <> present, cưỡng chế bằng late_decisions_reason_chk. Đây là toàn bộ cái giá của quyền ghi absent: không có ô này thì mở quyền là mở một đường làm hỏng số chuyên cần mà không ai truy được vì sao.';
comment on column attendance.late_decisions.decided_by is
  'core.users.id của GVCN. Policy late_decisions_write cưỡng chế decided_by = core.current_user_id() — không ai ghi sổ dưới tên người khác.';
comment on column attendance.late_decisions.client_mutation_id is
  '§9 — mã do client sinh cho MỘT lượt bấm. Cùng mã gửi lại (double-tap, retry mạng) là cùng một quyết định: hàm trả no-op và chỉ mục late_decisions_mutation_uq chặn dòng đôi ở tầng bảng.';

-- §9 ở tầng bảng. `where client_mutation_id is not null`: đường ghi không mang mã
-- (job nền, sửa tay có kiểm soát) vẫn phải ghi được nhiều dòng cho cùng một check-in —
-- chỉ mục một phần cho đúng điều đó mà không nới lỏng ca có mã.
create unique index late_decisions_mutation_uq
  on attendance.late_decisions (checkin_id, client_mutation_id)
  where client_mutation_id is not null;

-- Câu hỏi thường gặp của sổ: "lớp/em này bị kết luận gì trong khoảng ngày nào".
create index late_decisions_student_time_idx
  on attendance.late_decisions (student_id, decided_at desc);

-- ---------------------------------------------------------------------------
-- 2. Phạm vi đọc/ghi của sổ
-- ---------------------------------------------------------------------------
alter table attendance.late_decisions enable row level security;

-- Đọc: GVCN của em ∪ tâm lý cụm (core.can_see_care). Rộng hơn "chỉ GVCN" đúng một vai,
-- và có lý do: khi tâm lý cụm mở hồ sơ một em có cờ chuyên cần, câu "ngày đó ai kết
-- luận vắng và vì sao" là một phần của bối cảnh. Sổ này KHÔNG chứa dữ liệu cảm xúc nên
-- nó không đụng §5/ADR-026.
create policy late_decisions_read on attendance.late_decisions for select to authenticated
  using (core.can_see_care(student_id));
comment on policy late_decisions_read on attendance.late_decisions is
  'Đọc = core.can_see_care (GVCN của em ∪ tâm lý cụm). Học sinh, phụ huynh, giáo viên bộ môn, hiệu trưởng đọc ra 0 DÒNG — sổ này là hồ sơ nội bộ về thao tác của giáo viên, không phải thông báo cho gia đình.';

create policy late_decisions_write on attendance.late_decisions for insert to authenticated
  with check (
    core.is_homeroom_of(student_id)
    and decided_by = core.current_user_id()
  );
comment on policy late_decisions_write on attendance.late_decisions is
  'ADR-029 — chỉ GVCN của chính em đó ghi sổ, và chỉ ký được tên mình (cùng khuôn mẫu interventions_insert_scope ở 0014). Không có policy update/delete: sổ chỉ thêm, sửa được sổ vết thì sổ vết hết nghĩa.';

-- ADR-006: bản sao lưu phải ĐỦ, không thủng bảng. Bật RLS mà không có policy cho
-- backup_reader là để vai đó nhận 0 dòng TRONG IM LẶNG — đúng thứ Rev F điều 3 cấm,
-- và là cái bẫy `0050` đã ghi lại.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'backup_reader') then
    execute 'grant select on attendance.late_decisions to backup_reader';
    execute 'create policy late_decisions_backup on attendance.late_decisions '
         || 'for select to backup_reader using (true)';
  end if;
end;
$$;

-- Chỉ select + insert. KHÔNG update, KHÔNG delete — sổ chỉ thêm.
-- KHÔNG cấp cho `reporting` (§5): vai đó không có usage trên schema attendance và
-- không được có; cấp ở đây là mở tường lửa chăm sóc ↔ đánh giá theo đường vòng.
grant select, insert on attendance.late_decisions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Policy checkins_confirm_late — nới VẾ with check, giữ nguyên VẾ using
-- ---------------------------------------------------------------------------
-- Nới đúng một chữ: thêm 'absent' vào danh sách trạng thái đích. Vế `using` giữ NGUYÊN
-- từng ký tự — đó là vế nói "chỉ GVCN của em đó, và chỉ trên dòng còn queued_late", tức
-- là phần ADR-029 CỐ Ý không đụng tới.
--
-- Chú thích cũ ("không tự ý sang absent") bị thay chứ không sửa chữ: nó đã sai từ 0032
-- (xem phép đo đầu file), và một chú thích sai về an toàn nguy hiểm hơn không có chú
-- thích — người đọc sau sẽ tin vào hàng rào không tồn tại.
drop policy if exists checkins_confirm_late on attendance.checkins;
create policy checkins_confirm_late on attendance.checkins for update to authenticated
  using (core.is_homeroom_of(student_id) and status = 'queued_late')
  with check (status in ('present', 'late', 'absent'));
comment on policy checkins_confirm_late on attendance.checkins is
  'ADR-029 (06/08/2026, sửa ADR-007 ở đúng một điểm) — GVCN của em đó kết luận một bản gửi muộn thành present / late / absent. Vế using giữ nguyên từ 0014: chỉ GVCN của chính em, và chỉ trên dòng CÒN queued_late. Kết luận absent hợp lệ vì đây là CON NGƯỜI nhìn thấy chỗ ngồi trống, không phải MÁY suy ra vắng từ một lần gửi muộn — điều ADR-007 cấm và vẫn cấm. Cái giá của quyền này nằm ở đường ghi hợp lệ duy nhất, attendance.decide_late_checkins: lý do bắt buộc + một dòng attendance.late_decisions cho mỗi lượt.';

-- ---------------------------------------------------------------------------
-- 4. Đường ghi hợp lệ: một lượt bấm = một transaction
-- ---------------------------------------------------------------------------
-- KHÔNG `security definer`, và đó là quyết định chứ không phải sơ suất: hàm definer sẽ
-- chạy bằng quyền chủ schema, tức bỏ qua cả RLS lẫn grant theo cột của `0025` — hai lớp
-- hàng rào mà `0025` dựng lên sau một lỗ leo quyền tái hiện được. Hàm invoker giữ đủ ba
-- lớp chồng lên nhau: policy (dòng) + trigger checkins_guard_confirmation (cột
-- status/confirmed_by) + điều kiện is_homeroom_of viết thẳng trong WHERE dưới đây.
--
-- Điều kiện `core.is_homeroom_of` lặp lại RLS một cách CÓ CHỦ Ý. Nếu ngày mai ai đó
-- thêm một policy PERMISSIVE mới (đúng thứ đã xảy ra ở 0032 và làm sai chú thích của
-- 0014), điều kiện trong WHERE vẫn giữ hàm này ở đúng phạm vi nó tự khai.
create or replace function attendance.decide_late_checkins(
  p_checkin_ids        uuid[],
  p_to_status          text,
  p_reason             text default null,
  p_client_mutation_id uuid default null
)
returns table (updated int, skipped int)
language plpgsql
as $$
declare
  v_reason  text;
  v_so_id   int;
  v_updated int := 0;
begin
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  -- Đếm id PHÂN BIỆT: client gửi trùng id trong một lô thì `skipped` tính theo mảng thô
  -- sẽ dương một cách vô nghĩa, và màn hình sẽ nói "bỏ qua 1 em" khi không có em nào bị bỏ.
  select count(distinct x)::int into v_so_id
    from unnest(coalesce(p_checkin_ids, '{}'::uuid[])) as x;

  -- ── Tầng 2 của ba tầng canh (xem đầu file): hàm KHÔNG tin tầng trên ────────
  if p_to_status is null or p_to_status not in ('present', 'late', 'absent') then
    raise exception
      'decide_late_checkins: kết luận không hợp lệ (%). ADR-029 chỉ nhận present / late / absent',
      coalesce(p_to_status, 'NULL')
      using errcode = '22023';
  end if;

  if p_to_status <> 'present' and (v_reason is null or char_length(v_reason) < 3) then
    raise exception
      'decide_late_checkins: phải ghi lý do (tối thiểu 3 ký tự) khi kết luận là %. ADR-029',
      p_to_status
      using errcode = '22023';
  end if;

  if v_so_id = 0 then
    updated := 0;
    skipped := 0;
    return next;
    return;
  end if;

  -- ── §9: lượt gửi lại là CÙNG MỘT quyết định, không phải quyết định thứ hai ──
  -- Chỉ mục late_decisions_mutation_uq một mình cũng chặn được dòng đôi, nhưng nó chặn
  -- bằng cách NÉM LỖI 23505 — mà lượt gửi lại của §9 phải là no-op ÊM, không phải lỗi
  -- đỏ trên màn hình của cô. Cổng sớm này biến ca thường (retry mạng) thành đường êm và
  -- để chỉ mục làm đúng việc của nó: bắt ca hiếm (hai transaction song song cùng mã).
  --
  -- Câu đọc này đi qua RLS của chính người gọi (late_decisions_read = can_see_care) —
  -- có chủ ý: một mã lượt bấm của lớp khác không được biến lượt bấm của cô thành no-op.
  if p_client_mutation_id is not null
     and exists (
       select 1 from attendance.late_decisions d
        where d.client_mutation_id = p_client_mutation_id
     ) then
    updated := 0;
    skipped := v_so_id;
    return next;
    return;
  end if;

  -- ── Đổi trạng thái VÀ ghi sổ trong MỘT câu lệnh ────────────────────────────
  -- CTE ghi dữ liệu: hai việc không thể lệch nhau. Viết thành hai câu (update rồi
  -- insert) thì vẫn cùng transaction, nhưng câu thứ hai phải đọc lại danh sách dòng vừa
  -- đổi bằng một điều kiện chép tay — và điều kiện chép tay là chỗ hai câu bắt đầu nói
  -- hai chuyện khác nhau.
  --
  -- `from_status` ghi cứng 'queued_late' vì mệnh đề WHERE đã ghim đúng trạng thái đó;
  -- RETURNING của một CTE ghi dữ liệu chỉ đưa ra giá trị MỚI, không đưa giá trị cũ.
  with doi as (
    update attendance.checkins c
       set status       = p_to_status,
           confirmed_by = core.current_user_id()
     where c.id = any (p_checkin_ids)
       and c.status = 'queued_late'
       and core.is_homeroom_of(c.student_id)
    returning c.id, c.student_id
  )
  insert into attendance.late_decisions
    (checkin_id, student_id, from_status, to_status, reason, decided_by, client_mutation_id)
  select d.id, d.student_id, 'queued_late', p_to_status, v_reason,
         core.current_user_id(), p_client_mutation_id
    from doi d;

  get diagnostics v_updated = row_count;

  -- Dòng không còn `queued_late` (ai đó đã xử trước, hoặc chính đây là lượt gửi lại) và
  -- dòng không thuộc lớp người gọi đều rơi vào `skipped` — BỎ QUA chứ không ném lỗi.
  -- Ném lỗi ở đây là dựng một kênh dò: gửi một id lạ rồi đọc thông báo lỗi để biết dòng
  -- đó có tồn tại và thuộc lớp nào. Đây đúng ngữ nghĩa mà 0014/0025 đã chốt cho cả bảng
  -- attendance.checkins ("người gọi nhận 0 dòng, y hệt trường hợp không có hàng nào khớp").
  updated := v_updated;
  skipped := v_so_id - v_updated;
  return next;
end;
$$;

comment on function attendance.decide_late_checkins(uuid[], text, text, uuid) is
  'ADR-029 — đường ghi HỢP LỆ DUY NHẤT cho kết luận gửi muộn: đổi attendance.checkins và ghi attendance.late_decisions trong MỘT câu lệnh, một transaction. Tự kiểm lý do (raise 22023) chứ không tin tầng trên. §9: gọi lại cùng client_mutation_id là no-op êm (updated = 0), không phải lỗi. Dòng không còn queued_late hoặc không thuộc lớp người gọi thì vào skipped, KHÔNG ném lỗi — ném lỗi là dựng một kênh dò xem dòng đó có tồn tại không. KHÔNG security definer: hàm phải đi qua đúng RLS + trigger checkins_guard_confirmation của người gọi (0025).';

revoke all on function attendance.decide_late_checkins(uuid[], text, text, uuid) from public;
grant execute on function attendance.decide_late_checkins(uuid[], text, text, uuid) to authenticated;

commit;
