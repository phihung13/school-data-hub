-- 0049_chi_tiet_co_roi_tam_doc_cua_gvcn.sql
-- Đóng nốt khe cuối của ADR-026: cột `care.flags.detail` rời khỏi tầm đọc của GVCN.
-- Thi hành nợ `DEBT.md` #39.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LỜI HỨA ĐANG BỊ PHÁ — nguyên văn, và chỗ nó thủng
-- ═══════════════════════════════════════════════════════════════════════════
-- Quyết định chủ đầu tư 01/08/2026 (ADR-026, thi hành ở `0044`):
--
--   "Cô chủ nhiệm KHÔNG còn xem được nhật ký cảm xúc từng ngày của học sinh —
--    không trên màn hình, VÀ CẢ KHI HỎI THẲNG CƠ SỞ DỮ LIỆU CŨNG BỊ TỪ CHỐI.
--    Cô VẪN nhận cờ 'em này cần để ý'."
--
-- `0044` đóng ba cửa đọc `mood` và làm đúng vế đầu. Nhưng cờ E_MOOD do
-- `care.run_flag_engine` (0039) sinh ra mang theo một cột `detail` chở CHÍNH CÁI
-- SỐ đã dẫn tới cờ, và cột đó chưa bao giờ bị che. RLS `flags_scope` (0009:207)
-- gác bằng `core.can_see_care()` — hàm CỐ Ý giữ nhánh chủ nhiệm để cô còn nhận
-- được cờ. Giữ nhánh đó là đúng; hệ quả kèm theo là cô nhận luôn cả cột `detail`,
-- vì **RLS lọc theo DÒNG, mà `detail` là một CỘT nằm chung dòng với cờ** — đúng
-- một chữ với cái bẫy `0038` đã gỡ cho `attendance.checkins.mood`.
--
-- ── ĐO THẬT TRƯỚC KHI VÁ (hub_dev, 02/08/2026) ─────────────────────────────
-- Không suy luận. Chạy dưới đúng từng danh tính, `test_support.login_as()` trong
-- MỘT transaction (hàm dùng `set_config(..., true)` nên nó là thiết lập cấp
-- transaction — chạy ngoài transaction thì mọi phép đo ra 0 dòng và trông y hệt
-- "cửa đã kín". Bẫy này đã cắn một lần trong chính buổi làm gói này):
--
--     begin;
--     select test_support.login_as('…0008');   -- Cô Vân, GVCN 6A3 + 6A4
--     select s.full_name, f.rule_code, f.detail
--       from care.flags f join core.students s on s.id = f.student_id
--      where f.rule_code = 'E_MOOD';
--     rollback;
--
--   → 4 dòng, trong đó:
--
--     Lê Đăng Khôi   | E_MOOD | {"mode":"streak","nguong":5,
--                                "negative_days":6,"negative_streak":6}
--
-- Cô đọc được rằng em Khôi có SÁU ngày cảm xúc xấu, SÁU ngày liên tiếp, và ngưỡng
-- của trường là 5. Đó chính là "chuyện gì" mà quyết định trên hứa là cô sẽ không
-- đọc được. Cô Lan (…0001) đọc được `{"help_requested": true}` của cờ E_URGENT —
-- vô hại, nhưng nó tới qua cùng một cửa mở.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HAI HÌNH THỨC, VÌ SAO CHỌN HÌNH THỨC THỨ HAI
-- ═══════════════════════════════════════════════════════════════════════════
-- `DEBT.md` #39 để ngỏ hai đường:
--
--   (a) ENGINE THÔI GHI SỐ vào `detail` của cờ E — cờ chỉ ghi LOẠI tín hiệu.
--       Sạch hơn vì nó BỎ dữ liệu đi thay vì giấu đi. Loại, vì hai lý do đo được:
--         · Tâm lý cụm MẤT thật. ADR-026 viết "Tâm lý cụm giữ nguyên mọi quyền".
--           Cô Mai mở hồ sơ em Khôi mà chỉ thấy "có cờ E_MOOD" thì cô mất đúng thứ
--           quyết định định giao cho cô: chuỗi 6 ngày khác hẳn chuỗi 15 ngày, và
--           cuộc gặp đầu tiên khác nhau vì con số đó.
--         · Mất luôn khả năng hậu kiểm ngưỡng. `nguong` trong `detail` là bằng
--           chứng "cờ này bật theo ngưỡng nào" — ADR-023 hẹn rà lại ngưỡng sau
--           ≥1 học kỳ dữ liệu thật, mà rà bằng gì nếu lịch sử không ghi ngưỡng
--           lúc bật? Xoá cột là xoá luôn bằng chứng của lần rà đó.
--
--   (b) CHE CỘT khỏi vai chủ nhiệm, mở lại đúng vai tâm lý cụm. Chọn cái này.
--
-- Trong PostgreSQL, "che một cột khỏi một người" có ĐÚNG HAI cơ chế và `0038` đã
-- thử cả hai trên hub_dev rồi ghi lại kết luận: **GRANT THEO CỘT** (sai phạm vi
-- thì Postgres NÉM LỖI 42501 ngay tại câu SQL) thắng **VIEW che cột bằng
-- `case when`** (sai phạm vi thì âm thầm trả NULL, và job nền chạy vai hệ thống
-- đọc ra NULL rồi ghi đè dữ liệu thật). File này đi lại đúng con đường `0038` đã
-- lát, không phát minh cách thứ ba: một lời hứa bị phá phải hỏng THÀNH TIẾNG.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- BA ĐƯỜNG ĐANG SỐNG — phải còn sống nguyên vẹn sau file này
-- ═══════════════════════════════════════════════════════════════════════════
-- Rà cả kho 02/08/2026 tìm mọi câu chạm `care.flags`. Có đúng ba đường, cộng một
-- đường thứ tư mà việc rà mới lôi ra (mục dưới):
--
--   1. BỘ QUÉT `care.run_flag_engine()` — chạy vai `postgres` qua
--      `tools/jobs/run-flag-engine.mjs`. Vai chủ schema bỏ qua cả RLS lẫn grant
--      theo cột, và hàm KHÔNG phải SECURITY DEFINER (bài pgTAP `0044` đã ghim
--      điều đó). File này không đụng một chữ nào tới nó.
--
--   2. BUỒNG LÁI GVCN — `apps/hub/server/routers/care.ts:749`, câu duy nhất trong
--      cả `apps/hub` đọc `care.flags`. Nó chọn `f.as_of_date`, lọc `f.rule_code`
--      và `f.origin`, và CỐ Ý không lấy `f.detail` (chú thích tại chỗ, dòng 649).
--      Ba cột đó nằm trong danh sách grant dưới đây ⇒ câu này không đổi một ký tự.
--      Nói cách khác: kỷ luật tầng ứng dụng đã đúng từ trước, file này chỉ dựng
--      hàng rào phía sau nó.
--
--   3. MÀN TÂM LÝ CỤM — `getClusterCaseDetail` / `listClusterCases`. Đo lại từng
--      câu SQL của hai thủ tục này: chúng đọc `care.care_cases`,
--      `care.interventions`, `care.counselor_notes`, `attendance.help_requests` —
--      KHÔNG câu nào đọc `care.flags`. Nghĩa là hôm nay tâm lý cụm chưa dùng
--      `detail` qua giao diện; cô đọc nó bằng psql lúc cần. Cửa mới ở mục 3 giữ
--      đúng khả năng đó và đặt tên cho nó.
--
--   ĐƯỜNG THỨ TƯ, việc rà lôi ra (giao việc dặn "nếu phát hiện đường thứ tư thì
--   nói ra"): `report.v_vaar_indicators` (0009:347, sửa ở 0012) đọc `care.flags`
--   để đếm chỉ số quản trị theo tháng. Nó `security_invoker = true` và **chỉ được
--   cấp cho `postgres`** (đo: `information_schema.table_privileges` trả đúng một
--   grantee) — không cho `authenticated`, không cho `reporting`. Nó chỉ chọn
--   `student_id`/`rule_code`/`as_of_date`/`origin`, không chạm `detail`. Nên nó
--   không gãy; ghi ra đây để lần sau không phải rà lại từ đầu.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- AI MẤT GÌ
-- ═══════════════════════════════════════════════════════════════════════════
-- · GVCN: mất quyền đọc CỘT `detail`. Đây là điểm chính. Vẫn đọc nguyên vẹn mọi
--   cột còn lại của `care.flags` — cờ nào, của em nào, ngày nào, live hay backfill.
--   Cô vẫn biết CÓ CHUYỆN, đúng nửa còn lại của quyết định.
-- · Tâm lý cụm: KHÔNG mất gì — đọc qua `care.flags_tam_ly` (mục 3).
-- · Học sinh, phụ huynh, hiệu trưởng, giáo viên bộ môn: không đổi. Họ vốn đọc ra
--   0 DÒNG ở `care.flags` (RLS `flags_scope` = `can_see_care`, đo lại 02/08: Minh
--   …0005 và Hùng …0007 đều 0 dòng) nên che thêm một cột không đổi gì cho họ.
-- · `backup_reader`: KHÔNG đụng — ADR-006 đòi bản sao lưu phải ĐỦ, không thủng
--   bảng. Lệnh revoke dưới đây chỉ nhắm `authenticated`, và bài pgTAP ghim lại.
-- · Job nền / adapter / `report.*`: không đụng (chạy vai `postgres`).
--
-- Phụ thuộc: 0005 (care.flags), 0009 (flags_scope, can_see_care, in_my_cluster,
--            grant select on all tables in schema care to authenticated),
--            0012 (cột origin), 0038 (tiền lệ grant theo cột + view chủ-quyền),
--            0044 (ADR-026).

begin;

-- ---------------------------------------------------------------------------
-- 1. Cột `detail` ra khỏi quyền SELECT của `authenticated`
-- ---------------------------------------------------------------------------
-- Postgres KHÔNG cho revoke một cột ra khỏi quyền đã cấp ở MỨC BẢNG: lệnh chạy,
-- in một WARNING, và quyền bảng vẫn còn nguyên. Phải revoke cả bảng rồi grant lại
-- theo danh sách cột — đúng cách `0025` và `0038` đã làm.
--
-- Danh sách này là HỢP ĐỒNG: thêm cột mới vào `care.flags` mà quên thêm vào đây
-- thì cột đó vô hình với cả buồng lái. Bài pgTAP `0049` canh đúng chỗ đó bằng
-- cách so danh sách cột được cấp với `information_schema.columns`.
revoke select on care.flags from authenticated;
grant select (id, student_id, rule_code, as_of_date, origin, created_at)
  on care.flags to authenticated;

comment on column care.flags.detail is
  'Luật "cờ E gọn": chỉ số đo và loại tín hiệu. TUYỆT ĐỐI không sao chép nội dung tâm sự vào đây. Từ 0049 (ADR-026, DEBT #39): cột này cố tình KHÔNG nằm trong grant SELECT của authenticated — GVCN đọc care.flags được nhưng đọc cột này thì Postgres từ chối 42501. Đường đọc hợp lệ của tâm lý cụm là care.flags_tam_ly. Thêm cột mới vào bảng này thì PHẢI thêm vào danh sách grant ở 0049.';

comment on table care.flags is
  'Cờ do care.run_flag_engine sinh (0039). Phạm vi DÒNG = core.can_see_care (GVCN + tâm lý cụm) — cố ý giữ nhánh chủ nhiệm để cô còn nhận được cờ. Phạm vi CỘT hẹp hơn từ 0049: cột detail chỉ tâm lý cụm đọc, qua care.flags_tam_ly. Cô biết CÓ CHUYỆN mà không đọc được CHUYỆN GÌ — đó là nguyên văn ADR-026.';

-- ---------------------------------------------------------------------------
-- 2. Mở lại đúng vai tâm lý cụm — view chủ-quyền, phạm vi tự khai
-- ---------------------------------------------------------------------------
-- CỐ Ý **không** `security_invoker = true`, ngược luật chung mà `0024` đặt cho các
-- view khác, và cùng lý do với `attendance.checkins_care` ở `0038`: view invoker
-- kiểm quyền bằng quyền NGƯỜI GỌI, mà người gọi vừa bị revoke đúng cột `detail` ở
-- mục 1 — view sẽ tự chặn chính nó.
--
-- View chủ-quyền đọc được `detail`, đổi lại nó BỎ QUA RLS của bảng nền, nên phạm
-- vi DÒNG phải tự khai ở WHERE. An toàn của cách này dựa vào một bất đẳng thức
-- phải luôn đúng:
--
--     in_my_cluster  ⊂  can_see_care = is_homeroom_of ∨ in_my_cluster
--
-- ⇒ view KHÔNG mở thêm một dòng nào mà RLS của bảng đã đóng; nó chỉ mở lại một
-- CỘT cho một TẬP CON của những người vốn đã thấy dòng đó. Bài pgTAP `0049` ghim
-- lại điều này, vì đây là chỗ duy nhất trong file có thể âm thầm sai.
--
-- Không thêm `core.has_role('counselor')`: `core.in_my_cluster()` (0009:57) đã
-- mang sẵn điều kiện `role_code = 'counselor'` bên trong — cùng lý lẽ `0035` đã
-- ghi. Viết lại điều kiện đó ở đây là dựng sẵn hai định nghĩa cho một câu hỏi.
--
-- `security_barrier`: chặn kiểu tấn công hàm-rẻ-tiền. Không có nó, planner được
-- phép chạy `where leaky_fn(detail)` của người gọi TRƯỚC mệnh đề phạm vi.
create or replace view care.flags_tam_ly with (security_barrier = true) as
  select f.id, f.student_id, f.rule_code, f.as_of_date, f.origin, f.created_at,
         f.detail
    from care.flags f
   where core.in_my_cluster(f.student_id);

comment on view care.flags_tam_ly is
  'Đường ĐỌC cột care.flags.detail duy nhất của người dùng cuối, và chỉ dành cho TÂM LÝ CỤM (core.in_my_cluster — hàm này đã tự mang điều kiện role_code = counselor). ADR-026 hứa "tâm lý cụm giữ nguyên mọi quyền" nên cắt cột detail mà không mở lại cửa này là phá nửa lời hứa còn lại. View CHỦ-QUYỀN nên tự khai phạm vi dòng: in_my_cluster ⊂ can_see_care, KHÔNG mở thêm dòng nào so với RLS flags_scope. GVCN đọc ra 0 DÒNG ở đây (màn hình hiện "không có", không hiện "hỏng") và bị Postgres TỪ CHỐI nếu đọc thẳng care.flags.detail.';

-- Chỉ đúng một vai người dùng cuối. Không cấp cho `reporting` (§5 tường lửa báo
-- cáo học thuật — số đếm cảm xúc tuyệt đối không đi vào đường học thuật), không
-- cấp cho `connector`, không cấp cho PUBLIC. `backup_reader` không cần: nó đã đọc
-- thẳng bảng nền với đủ mọi cột.
revoke all on care.flags_tam_ly from public;
grant select on care.flags_tam_ly to authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- ĐO LẠI SAU KHI VÁ (hub_dev, 02/08/2026) — chép ra đây để lần sau khỏi đoán
-- ═══════════════════════════════════════════════════════════════════════════
-- Cùng bộ câu hỏi, cùng từng danh tính, mỗi phép đo trong MỘT transaction:
--
--   Cô Vân (…0008, GVCN 6A3+6A4)
--     select count(*) from care.flags                      →  10  (trước: 10)
--     select detail   from care.flags                      →  ERROR 42501
--                                                             permission denied
--                                                             for table flags
--     select count(*) from care.flags_tam_ly               →   0  (đúng: cô không
--                                                                  phải tâm lý cụm)
--   Cô Lan (…0001, GVCN 6A1)
--     select count(*) from care.flags                      →   1  (trước: 1)
--     select detail   from care.flags                      →  ERROR 42501
--   Cô Mai (…0003, tâm lý cụm Q7)
--     select count(*) from care.flags                      →  17  (trước: 17)
--     select detail   from care.flags                      →  ERROR 42501
--       ← CÓ Ý: cửa hợp lệ của cô là view, không phải bảng. Cô mất một CÁCH GÕ,
--         không mất dữ liệu nào — dòng dưới chứng minh.
--     select count(detail) from care.flags_tam_ly          →  17  (đủ, không thiếu
--                                                                  một dòng)
--   Minh (…0005) / Hùng (…0007)                            →   0 dòng, như trước
--   postgres (bộ quét)                                     →  17 dòng, 17 detail
--
-- Bộ quét sau khi vá — `tools/jobs/run-flag-engine.mjs --dry-run` trên hub_dev
-- (dry-run: cùng câu lệnh, chỉ khác chỗ kết thúc bằng rollback, nên con số là con
-- số thật của lần chạy thật):
--     Luật đã chạy   : A_ATTENDANCE, E_MOOD, E_URGENT
--     Bỏ qua         : B_BEHAVIOR (nguồn hết tươi) · C_MASTERY, C_CEFR (chưa khai nguồn)
--     Cờ mới 10 · Hồ sơ mới 10 · Cờ gắn vào hồ sơ 10 · Leo thang 0
-- Engine KHÔNG hề chạm hàng rào mới, và không phải may: nó chạy vai `postgres`, vai
-- chủ schema bỏ qua cả RLS lẫn grant theo cột (bài pgTAP `0044` đã ghim rằng
-- `care.run_flag_engine` không phải SECURITY DEFINER — đổi điều đó là bộ quét mù ngay).
--
-- Buồng lái GVCN, đo qua HTTP THẬT (đăng nhập cô Vân …0008 rồi gọi
-- `GET /api/trpc/care.getDashboard`): HTTP 200, lớp 6A3, một thẻ cờ E_URGENT hiện
-- đủ, `moodVisibility = {readable:false, reason:"chi_tam_ly"}`. Không câu nào ném
-- 42501 — vì câu SELECT của buồng lái vốn đã không lấy `f.detail` từ trước.
