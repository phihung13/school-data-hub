-- 0059_gvcn_doc_lai_mood.sql
-- ADR-035 — giáo viên chủ nhiệm đọc lại được nhật ký cảm xúc từng ngày.
-- ĐẢO ADR-026 (`0044`), trở về một phần ADR-025 (`0038`). Quyết định chủ đầu tư
-- 21/08/2026, trong đợt hợp nhất sơ đồ "AI OS" của cấp trên (ADR-034).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUYẾT ĐỊNH, nguyên văn thứ phải thi hành
-- ═══════════════════════════════════════════════════════════════════════════
-- "Cô chủ nhiệm đọc lại được nhật ký cảm xúc từng ngày của học sinh lớp mình —
--  trên màn hình và cả khi hỏi qua cửa hợp lệ của cơ sở dữ liệu. Tâm lý cụm,
--  chính em: không đổi. Phụ huynh, BGH, giáo viên bộ môn, GVCN lớp khác: VẪN
--  không đọc được. Sổ vết truy cập và §5 (cấm dùng cảm xúc xếp loại) giữ nguyên."
--
-- Nói bằng công thức: `core.can_read_mood` NHẬN LẠI nhánh `is_homeroom_of`.
--
--     0038 (ADR-025): is_me ∨ can_see_care  = is_me ∨ is_my_child(*) ∨ is_homeroom_of ∨ in_my_cluster
--     0044 (ADR-026): is_me ∨ in_my_cluster
--     0059 (ADR-035): is_me ∨ in_my_cluster ∨ is_homeroom_of      ← file này
--
-- (*) Vẫn KHÔNG quay về `can_see_care` như 0038: phụ huynh (`is_my_child`) không
--     nằm trong quyết định lần này, và bài học ADR-025 "bốn câu hỏi phạm vi, bốn
--     hàm" giữ nguyên — nhánh chủ nhiệm viết TƯỜNG MINH, không mượn hàm vùng
--     chăm sóc. pgTAP 0044 vẫn khẳng định `can_read_mood` không nhắc
--     `can_see_care`/`can_see_student`; chỉ assertion "không nhắc is_homeroom_of"
--     là bị đảo — có ghi chú ngay tại chỗ trong file test.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CÁI GIÁ — chép lại từ ADR-035 để người chạy migration này biết mình đang đổi gì
-- ═══════════════════════════════════════════════════════════════════════════
-- ADR-026 cắt nhánh chủ nhiệm vì một lẽ: người chấm điểm và xếp loại em mà đọc
-- được lời em tự nói với mình thì §5 chỉ còn sống bằng kỷ luật cá nhân. Lẽ đó
-- KHÔNG sai đi — chủ đầu tư nghe lại đúng lập luận đó ngày 21/08/2026 và quyết
-- đổi, trong khuôn hợp nhất sơ đồ AI OS (cấp trên đặt GVCN trong vòng đọc).
-- Ràng buộc kỹ thuật còn lại quanh §5 sau file này:
--   · role `reporting` vẫn bị revoke khỏi `attendance` (0009) — bộ sinh báo cáo
--     học thuật vẫn KHÔNG chạm được mood;
--   · `report.class_pulse`/`grade_pulse` vẫn gác bằng cổng vai BGH (0040);
--   · cột `care.flags.detail` vẫn khoá với authenticated (0049).
-- Thứ KHÔNG còn: bức tường giữa chính-cô-GVCN và nhật ký của em lớp cô.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ĐO THẬT (hub_dev, 21/08/2026 — kho seed dựng lại 02/08, khác số liệu 01/08)
-- ═══════════════════════════════════════════════════════════════════════════
-- Số dòng có mood đọc được qua `attendance.checkins_care`, dưới đúng từng danh tính
-- (vai `authenticated` + GUC `request.jwt.claim.sub`):
--
--     TRƯỚC file này:  cô Lan (GVCN 6A1)   0     · cô Mai (tâm lý cụm)  478
--     SAU  file này:   cô Lan              63(*) · cô Mai               478
--
-- (*) 63 = đúng tổng số dòng có mood của 12 em đang enrolled lớp cô (đếm bằng vai
--     postgres). Tổng kho 538 dòng — cô KHÔNG đọc được 475 dòng của em lớp khác.
--     Số đo SAU được ghi lại phía dưới file này ngay khi chạy thật; lệch là dừng.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- BA CỬA CỦA 0044 — lần này mở MỘT, chỉnh MỘT, giữ nguyên MỘT
-- ═══════════════════════════════════════════════════════════════════════════
--   (1) `attendance.checkins_care`  — MỞ qua `can_read_mood` (mục 1). View không
--       phải sửa: nó đã trỏ hàm từ 0038.
--   (2) `attendance.mood_trends`    — KHÔNG SỬA GÌ: policy `mood_trends_scope`
--       trỏ `can_read_mood` từ 0044, nên nó mở/đóng theo hàm. Đó chính là phần
--       thưởng của việc 0044 dồn phạm vi về một hàm.
--   (3) `attendance.happy_days()`   — CHỈNH cổng: thêm nhánh chủ nhiệm (mục 2).
--       SÀN 5 NGÀY GIỮ NGUYÊN cho mọi vai: với cô nó nay chỉ là chuyện tiện —
--       cô đọc được từng ngày qua cửa (1) rồi; với phụ huynh nó vẫn là hàng rào
--       chống đọc-từng-ngày-bằng-đường-vòng, và phụ huynh KHÔNG được mở thêm gì
--       trong quyết định này.
--
-- Phụ thuộc: 0009 (is_homeroom_of), 0038 (can_read_mood, checkins_care),
-- 0044 (bản bị đảo). Tầng màn hình đi cùng đợt (không được hoãn): nhãn
-- "Chỉ thầy cô tâm lý đọc" tại chỗ em nhập PHẢI đổi lời — in một lời hứa về quyền
-- riêng tư đã hết đúng còn tệ hơn không in gì.

begin;

-- ---------------------------------------------------------------------------
-- 1. `core.can_read_mood` nhận lại nhánh chủ nhiệm
-- ---------------------------------------------------------------------------
-- Thân hàm vẫn cố ý MỘT DÒNG, không chú thích bên trong: pgTAP đọc
-- `pg_proc.prosrc` để khoá hình dạng (0044 nhóm 4, đã đảo chiều assertion
-- is_homeroom_of), mà prosrc giữ cả chú thích.
create or replace function core.can_read_mood(p_student uuid)
returns boolean
language sql stable
as $$
  select core.is_me(p_student) or core.in_my_cluster(p_student) or core.is_homeroom_of(p_student);
$$;

comment on function core.can_read_mood(uuid) is
  'ADR-035 (21/08/2026, đảo ADR-026) — "ai được thấy em này CẢM THẤY GÌ": chính em, thầy cô tâm lý cụm, và giáo viên chủ nhiệm CỦA EM. Nhánh chủ nhiệm viết tường minh — KHÔNG quay về core.can_see_care() (hàm đó thêm phụ huynh qua is_my_child, không nằm trong quyết định) và vẫn KHÔNG phải core.can_see_student() (bốn câu hỏi phạm vi, bốn hàm — ADR-025). Lịch sử: 0038 mở GVCN → 0044 cắt → 0059 mở lại.';

-- ---------------------------------------------------------------------------
-- 2. `attendance.happy_days()` — cổng thêm nhánh chủ nhiệm, sàn 5 ngày giữ
-- ---------------------------------------------------------------------------
-- Chép nguyên hàm 0044 và đổi ĐÚNG MỘT ĐIỀU KIỆN (thêm is_homeroom_of). RAISE
-- 22023 cho khoảng hẹp, NULL cho "không được phép biết", 4 = "Vui": tất cả giữ
-- nguyên — lý do từng dòng đã ghi ở 0044, không chép lại đây.
create or replace function attendance.happy_days(
  p_student uuid,
  p_from    date,
  p_to      date
) returns integer
language plpgsql
stable
security definer
set search_path = attendance, core, pg_temp
as $$
declare
  v_so_ngay integer;
begin
  if p_student is null or p_from is null or p_to is null then
    return null;
  end if;

  if p_to - p_from < 4 then
    raise exception
      using errcode = '22023',   -- invalid_parameter_value
            message = 'attendance.happy_days: khoảng hỏi quá hẹp, tối thiểu 5 ngày.',
            detail  = format('Nhận p_from=%s, p_to=%s (rộng %s ngày).',
                             p_from, p_to, (p_to - p_from) + 1),
            hint    = 'Hàm này trả SỐ TỔNG HỢP. Với vai không được đọc từng ngày (phụ huynh), hỏi từng ngày một là đọc nhật ký cảm xúc bằng đường vòng — sàn 5 ngày giữ nguyên từ ADR-026, ADR-035 không nới.';
  end if;

  if not (core.is_me(p_student)
          or core.is_my_child(p_student)
          or core.in_my_cluster(p_student)
          or core.is_homeroom_of(p_student)) then
    return null;
  end if;

  select count(*)::int into v_so_ngay
    from attendance.checkins c
   where c.student_id  = p_student
     and c.occurred_on between p_from and p_to
     and c.mood = 4;
  return v_so_ngay;
end;
$$;

comment on function attendance.happy_days(uuid, date, date) is
  'Số ngày mood = "Vui" trong một khoảng — SỐ TỔNG HỢP cho Báo cáo Trưởng thành. Cổng từ ADR-035: chính em ∨ bố mẹ em ∨ tâm lý cụm ∨ GVCN của em (nhánh chủ nhiệm trở lại 21/08/2026; giáo viên bộ môn / hiệu trưởng vẫn nhận NULL). Khoảng hỏi hẹp hơn 5 ngày vẫn bị TỪ CHỐI bằng lỗi 22023 cho MỌI vai — hàng rào này che phụ huynh, và ADR-035 không mở gì cho phụ huynh. Trả NULL (khác 0) khi không được phép biết.';

-- ---------------------------------------------------------------------------
-- 3. Viết lại những dòng chú thích 0044 để lại mà nay đã sai
-- ---------------------------------------------------------------------------
comment on column attendance.checkins.mood is
  '§3/ADR-002 — lưu như dữ liệu thường (không mã hóa, không bảng riêng). Từ 0038: cố tình KHÔNG nằm trong grant SELECT của authenticated — đọc mood đi qua attendance.checkins_care. Phạm vi từ 0059/ADR-035: chính em + tâm lý cụm + GVCN của em (nhánh chủ nhiệm bị cắt 0044, mở lại 0059). Thêm cột mới vào bảng này thì PHẢI thêm vào danh sách grant ở 0038 — bài pgTAP 0038 canh đúng chỗ đó.';

comment on view attendance.checkins_care is
  'Đường ĐỌC mood duy nhất của người dùng cuối. Từ 0059/ADR-035 phạm vi là core.can_read_mood = chính em ∨ tâm lý cụm ∨ GVCN của em. View CHỦ-QUYỀN nên tự khai phạm vi dòng thay vì mượn RLS. Phụ huynh, hiệu trưởng, giáo viên bộ môn, GVCN LỚP KHÁC đọc ra 0 DÒNG ở đây (màn hình hiện "không có", không hiện "hỏng") và bị Postgres TỪ CHỐI (42501) nếu đọc thẳng attendance.checkins.mood.';

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- SỐ ĐO SAU KHI CHẠY THẬT trên hub_dev (điền ngay lúc migrate, 21/08/2026):
--   cô Lan qua checkins_care: 0 → 63  (đúng tổng mood 12 em lớp cô — khớp kỳ vọng)
--   cô Hạnh (GVCN 6A2) đọc em 6A1: 0 dòng (không rò theo cơ sở)
--   cô Mai (tâm lý cụm): 478 → 478 (không đổi một dòng)
--   phụ huynh qua checkins_care: 0 (không đổi)
--   happy_days(em 6A1, 5 ngày) dưới cô Lan: NULL → số nguyên; 1 ngày: vẫn 22023
-- ═══════════════════════════════════════════════════════════════════════════
