---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 17
---

# Database — một PostgreSQL, schema theo domain, Core Data Model là Single Source of Truth

## Nguyên tắc nền tảng (ADR-011)

Dữ liệu lõi (người dùng, học sinh, giáo viên, phụ huynh, cơ sở, lớp, vai trò, quyền) **chỉ tồn tại một bản duy nhất trong `core`**. Mỗi Mini App có schema riêng, chỉ chứa dữ liệu nghiệp vụ của nó, và tham chiếu core bằng khóa ngoại. **Không bao giờ có `finance.students`, `attendance.students`** — thấy bảng như vậy trong PR là lỗi chặn merge.

## Schemas

| Schema | Loại | Bảng chính |
|---|---|---|
| `core` | **Nền tảng — SSOT** | `users`, `students`, `teachers`, `parents`, `schools` (cơ sở), `classes`, `class_assignments`, `enrollments`, `roles`, `permissions`, `id_mappings`, `identity_links`, `school_networks`, `parent_invite_codes` |
| `attendance` | Mini App | `checkins` (mood + điểm danh — dữ liệu cảm xúc lưu như dữ liệu thường, ADR-002), `checkin_rules` (khung giờ + dải IP theo cơ sở), `help_requests`, `mood_trends` (xu hướng tổng hợp giữ lại sau khi xóa chi tiết 12 tháng) |
| `care` | Mini App (lõi) | `rules` (sổ đăng ký mã luật cờ), `flags`, `care_cases`, `care_case_flags`, `interventions`, `thresholds`, `escalations`, `counselor_notes` |
| `health` | Mini App (lõi) | `logs` (y tế bán trú — ADR-009), `meal_sleep_logs` |
| `evidence` | Mini App | `value_behaviors` (25 hành vi), `event_roles`, `pdr_reflections`, `dear_logs`, `rubric_scores`, `fitness_tests`, `club_attendance`, `survey_responses` |
| `tutor` | Mini App | `mastery_snapshots`, `cefr_results`, `cefr_trajectories`, `milestones`, `moodle_progress`; tương lai: `courses`, `lessons` |
| `finance` | Mini App (đặt chỗ) | `invoices`, `payments` — chưa xây, chỉ giữ tên miền dữ liệu |
| `social` | Mini App (đặt chỗ) | `posts`, `comments` — chưa xây |
| `ai` | Mini App (đặt chỗ) | `conversations`, `prompts` — chưa xây; mọi lời gọi model vẫn qua pii-stripper (§7) |
| `staging` | Nền tảng | `raw_tutor_events`, `raw_moodle`, `raw_cor_imports`, `raw_embedded_events` (webhook từ Mini App nhúng ngoài, ADR-015), `import_errors` |
| `ops` | Nền tảng | `job_runs`, `heartbeats`, `outbox_messages`, `source_freshness`, `audit_log`, `embedded_app_events` (cổng nhận sự kiện rổ Xanh từ app nhúng — **không FK `core.students`**, RLS deny-by-default), `rls_exemptions` (danh sách bảng cố ý không có RLS, có tên và có lý do) |
| `report` | Nền tảng | `v_campus_trends`, `v_vaar_indicators` (đã có), `growth_report_approvals` (sổ duyệt Báo cáo Trưởng thành, 0032). **Chưa xây:** `v_cohort_mastery`, `mv_growth_reports` — hai tên này từng nằm ở đây như thể đã có; giữ lại chỉ để đặt chỗ tên miền dữ liệu, không có migration nào tạo chúng. |

## Auth indirection (ADR-012)

`auth.users` của Supabase KHÔNG phải dữ liệu nghiệp vụ. Ánh xạ một chiều `auth.users.id → core.users.auth_uid` nằm trong adapter auth của platform. **Mini App cấm SELECT trực tiếp `auth.users`** — mọi nghiệp vụ chỉ biết `core.users` + `roles` + `permissions`.

## Luật ID (§1)

- PK nội bộ: `core.students.id` UUID. Mã hiển thị `student_code` (`VA-YYYY-NNNNN`) — duy nhất, bất biến 12 năm, không đổi khi chuyển cơ sở.
- Mọi bảng dữ liệu học sinh FK về `core.students.id`. Không ngoại lệ.
- `core.id_mappings(system, external_id, student_id)` map mã ngoài (Moodle, Tutor, COR, Zalo PH, và Mini App nhúng ngoài với `system='embed:<app-id>'` — ADR-015/`08-embedded-apps.md`). Không map được → `staging.import_errors`, không tự đoán. `id_mappings` tự nó cũng FK về `core.students.id` — nó không phải nguồn FK cho bảng nghiệp vụ khác; mọi bảng domain (kể cả `attendance.checkins`) FK thẳng về `core.students.id`, không qua `id_mappings`.
- **Hai sổ, không nhét chung (ADR-016, 27/07/2026):** `core.id_mappings` là **sổ dữ liệu** — chỉ map học sinh, FK `student_id`. `core.identity_links(system, external_id, user_id)` là **sổ đăng nhập** — map tài khoản bất kỳ (giáo viên, phụ huynh, nhân viên, học sinh có tài khoản) với hệ ngoài qua OIDC. Trước đây `03-api.md` viết `student_id/user_id` vào cùng một bảng; bảng đó không có cột `user_id` nên giáo viên không map được — đã tách hẳn.
- `identity_links` khóa duy nhất **cả hai chiều**: `UQ(system, external_id)` (một mã ngoài chỉ thuộc một người) và `UQ(system, user_id)` (một người chỉ có một tài khoản trong mỗi hệ ngoài — chặn sinh tài khoản Moodle trùng). Vi phạm chiều nào cũng chặn + ghi log, không tự đoán (tinh thần §8).
- **Alias cho Mini App ngoài do Hub sinh**, không phải app gửi lên: `id_mappings(system='embed:<app-id>', external_id=<alias ngẫu nhiên>, student_id)`. Mỗi app một dải alias riêng ⇒ hai app ngoài không đối chiếu chéo dữ liệu học sinh với nhau (ADR-017).

## Dữ liệu cảm xúc (§3, ADR-002) — lưu như dữ liệu thường

- Không mã hóa, không khu vực khóa riêng: check-in cảm xúc nằm trong `attendance.checkins` như dữ liệu thường; `counselor_notes` trong `care`.
- Phân quyền theo ma trận chung dưới đây, y như mọi dữ liệu khác.
- Cờ E chỉ ghi loại tín hiệu, không sao chép nội dung vào cờ.
- Job xóa chi tiết mood >12 tháng (giữ aggregate `attendance.mood_trends`) — lời hứa công khai, **đã có hàm thật + test từ 31/07/2026**: `attendance.rollup_mood_trends()` chạy trước, `attendance.purge_old_emotion_details()` xóa sau (`0031`). Phần còn thiếu là bộ lập lịch gọi chúng hằng đêm — ghi `DEBT.md` #24, không được nói là đã tự chạy.
- Báo cáo học thuật/xếp loại không dùng dữ liệu cảm xúc (§5).
- Tái xác nhận 23/07/2026: điểm lệch với bản FINAL 15/07 (mô tả "kho riêng, mã hóa") đã chốt theo ADR-002 — không kho riêng, không mã hóa. Còn lại là tu chính văn bản Hiến chương điều 3, không phải quyết định kỹ thuật còn mở.

## Ma trận RLS — mỗi ô một policy, mỗi policy một pgTAP test

Luật đọc bảng này (siết lại 31/07/2026): **ô nào không ghi `GĐ2` thì phải có policy thật + pgTAP thật.** Trước đợt rà này ma trận hứa nhiều hơn code — tài khoản BGH đăng nhập vào không thấy gì ngoài bảng ngưỡng, mà không ai biết vì hồ sơ vẫn ghi "campus"/"all". Ma trận là lời hứa với Hội đồng dữ liệu, không phải bản phác thảo.

| Dữ liệu ↓ / Role → | student | guardian | teacher | homeroom | counselor | principal | board |
|---|---|---|---|---|---|---|---|
| core / tutor / evidence / attendance | own | children | assigned classes | homeroom class | cluster | campus | **GĐ2** |
| care.flags + interventions | — | — | **GĐ2** | homeroom class | cluster | **GĐ2** | **GĐ2** |
| health.logs (y tế) | — | children | **—** | homeroom | cluster | — | — |
| care.counselor_notes | — | — | — | homeroom | cluster | — | — |
| report (ẩn danh) | — | — | — | **GĐ2** | **GĐ2** | **GĐ2** | **GĐ2** |
| care.thresholds | read | read | read | read | read+propose | read | write (qua Hội đồng DL) |
| attendance.checkin_rules (dải IP, khung giờ) | — | — | — | — | — | — | read (cùng `admin`) |
| report.growth_report_approvals (sổ duyệt) | — | — | — | read+write (ký tên mình) | read | — | — |

**`GĐ2` nghĩa là gì:** chưa có đường nào ở tầng DB, và **không** được coi là đã có khi viết màn hình. Bốn ô này đã đối chiếu với migration thật ngày 31/07/2026:

- `principal` / `board` trên `core/tutor/evidence/attendance`: `core.can_see_student` (0009) cố ý không gồm `board`; `principal_of` có nhưng chỉ dùng cho hàng 1 ở mức campus — phần `aggregate-only` của board chưa có view nào phục vụ.
- `teacher` trên `care.flags`: `core.can_see_care` (0009) chỉ gồm `is_homeroom_of` + `in_my_cluster`. Không có nhánh "own-created" nào. Giáo viên bộ môn không thấy cờ, kể cả cờ do chính mình tạo.
- `principal` trên `care`: cột "count-only" chưa có view đếm nào, và **cố ý chưa mở** — mở kiểu tra cứu tự do sẽ vi phạm tinh thần §5. Màn hình care team có audit log là hình thức đúng, chưa xây.
- Hàng `report`: hai view `report.v_campus_trends` / `v_vaar_indicators` được tạo ở 0009 **sau** câu `grant … to authenticated` cùng file, nên **chưa ai có quyền SELECT** — cả hàng là code chết cho tới khi có grant + policy. 0024 đã bịt lỗ ngược lại (đặt `security_invoker` để view không vượt mặt §5); phần cấp quyền là việc của sprint BGH. Ngoại lệ duy nhất đang sống trong schema `report` là `growth_report_approvals` (0032) — có grant, có policy, có RLS, và **không** cấp cho role `reporting` (§5).

**Hàng `health.logs` đọc kỹ hơn từ 0034:** RLS vẫn đúng như ô ghi (GVCN của em, tâm lý cụm, phụ huynh của em), nhưng quyền cột đã bị thu — `category` và `detail` (nội dung y tế thật) **không SELECT thẳng được nữa**, phải đi qua `health.read_logs(student_id, from, to)`, và mỗi lượt gọi ghi một dòng `ops.audit_log` kể cả lượt bị từ chối. Nói cho chính xác điều mà comment cũ trên bảng đã hứa suông từ 0007: **audit hiện phủ nội dung y tế đọc qua hàm, chưa phủ mọi màn hình có hiển thị dữ liệu y tế.** Câu "hiệu trưởng xem qua màn hình care team có audit log" là mô tả hình thức mong muốn, chưa phải mô tả thứ đang chạy.

**Vai `admin` (0003) chưa được dùng ở đâu ngoài `checkin_rules_admin_read` (0024).** Nó tồn tại trong bảng vai trò nhưng gần như không mở thêm quyền nào — đừng thiết kế màn hình quản trị dựa trên giả định nó đã có nghĩa.

**Vai `counselor` có quyền DB nhưng chưa có đường API:** `can_see_care` + `in_my_cluster` (0009) mở đúng phạm vi cụm và có pgTAP khẳng định, nhưng procedure duy nhất tiêu thụ quyền đó (`care.getDashboard`) chạy qua `homeroomProcedure` nên tâm lý cụm gọi vào bị `FORBIDDEN`. Một nhánh trọn vẹn của ma trận đã trả giá bằng policy + test mà chưa dùng được — ghi sổ nợ (`DEBT.md` #25), không sửa ma trận, vì quyền DB là thật.

**Nghĩa vụ test:** mỗi policy có pgTAP test khẳng định cả chiều cho phép lẫn chiều từ chối. PR thêm bảng mới thiếu policy + test → CI fail (`tools/schema-lint.mjs`, từ `0023` trở đi cổng bao cả policy và GRANT, không chỉ bảng).

## Bộ máy thi hành ma trận — hàm phạm vi và signal view (baseline `0001`–`0009`)

Ma trận ở trên không được cài đặt bằng cách chép điều kiện vào từng policy. Nó có **một bộ hàm phạm vi**; policy chỉ gọi hàm. Đổi định nghĩa "cụm" là sửa một hàm, không phải đi lùng 40 policy.

| Hàm / view | Trả lời câu hỏi | Ghi chú |
|---|---|---|
| `core.current_auth_uid()` (`0001`) | "phiên này là `auth_uid` nào" | **Chỗ duy nhất trong toàn hệ chạm định danh của nhà cung cấp auth** (ADR-012). |
| `core.current_user_id()` / `core.begin_user_context()` (`0001`, viết lại `0029`) | "phiên này là `core.users.id` nào" | Nghiệp vụ chỉ biết `core.users`, không bao giờ biết `auth.users` (§Rev D 3). |
| `core.has_role(code)` (`0009`) | "tôi có vai này không" | Đọc `core.user_role_scopes` + `core.role_permissions`. |
| `core.is_me` / `core.is_my_child` / `core.teaches` / `core.is_homeroom_of` / `core.in_my_cluster` / `core.principal_of` (`0009`) | sáu hướng "em này có thuộc tầm của tôi không" | Sáu nhánh của hàng 1 ma trận. |
| `core.can_see_student()` (`0009`) | hàng 1 ma trận | Hợp của sáu hàm trên. **Cố ý không gồm `board`** — hiệu trưởng cấp hệ và hội đồng chỉ xem số tổng hợp. |
| `core.can_see_care()` (`0009`) | vùng chăm sóc | Hẹp hơn hẳn, **không dùng chung hàm trên**: chỉ `is_homeroom_of` + `in_my_cluster`. |
| `core.can_see_health()` (`0009`) | vùng y tế (ADR-009) | Giáo viên bộ môn **không có mặt ở đây** — đó là chủ ý, không phải sót. |
| `core.role_permissions` (`0003`) | bảng nối vai ↔ quyền | Quyền là dữ liệu, không phải hằng số trong code. |
| `core.issue_embed_alias()` (`0003`) | cấp alias cho app ngoài theo `student_id` | Bản theo học sinh; bản theo tài khoản là `core.issue_embed_alias_for_user()` (`0028`). |
| `care.v_signal_attendance` · `v_signal_behavior` · `v_signal_course` · `v_signal_emotion` (`0009`, `v_signal_emotion` viết lại `0026`) | bốn nguồn tín hiệu của flag engine | **Hợp đồng ADR-010: engine chỉ được đọc qua đây.** SQL đọc thẳng bảng của Mini App khác trong engine là lỗi review. Đổi bảng gốc phải sửa view cùng PR. |

## Cột và bảng thêm bởi ADR-016/017 — đã có migration

| Đối tượng | Migration | Ghi chú |
|---|---|---|
| `core.identity_links(system, external_id, user_id)` | `0010_identity_links.sql` | RLS deny-by-default (chỉ auth-adapter chạm). Hàm `core.link_identity()` upsert idempotent, raise khi xung đột một trong hai chiều. |
| `ops.source_freshness(source, label, max_age, last_success_at)` + view `ops.v_stale_sources` | `0011_source_freshness.sql` | Seed sẵn 5 nguồn theo bảng System of Record bên dưới. `authenticated` SELECT được (buồng lái cần), không sửa được. |
| `ops.job_runs.degraded_sources text[]` | `0011_source_freshness.sql` | Nguồn bị bỏ qua trong lần chạy — buồng lái đọc để hiện băng vàng. |
| `care.flags.origin text` (`live` \| `backfill`) | `0012_flag_origin.sql` | Mặc định `live`. Trigger trên `care.care_case_flags` **chặn ở tầng DB** việc gắn cờ `backfill` vào care_case — không phụ thuộc tầng ứng dụng nhớ kiểm tra. |
| `core.parent_invite_codes(code, student_id, expires_at, redeemed_by)` + hàm `core.redeem_parent_invite_code()` | `0013_parent_invite_codes.sql` | Mã mời 6 ký tự cho đăng nhập phụ huynh (GĐ1 shell, `apps/hub`). RLS deny-by-default như `id_mappings` — chỉ hàm SECURITY DEFINER chạm. Idempotent theo mã (§9): redeem hai lần trả về đúng người cũ. **DEV:** hàm tự sinh `auth_uid` giả vì chưa nối Zalo OAuth thật (hạ tầng chưa mua) — thay 1 dòng khi có Zalo thật, chữ ký hàm giữ nguyên. |
| RLS + GRANT ghi cho `attendance.checkins/help_requests`, `care.care_cases/interventions` | `0014_mutation_policies.sql`, `0017_checkins_self_update.sql` | 0001-0012 chỉ có chiều **đọc** (0009) — chưa có đường ghi cho tRPC (`apps/hub`). Phát hiện khi chạy thật: thiếu policy UPDATE cho tự sửa mood trong ngày (0017 vá riêng, vì 0014 chỉ có policy GVCN xác nhận gửi muộn). |
| `core.v_my_scopes` (view) | `0015_my_scopes_view.sql` | "Tôi có vai trò gì, lớp nào" — buồng lái GVCN cần để biết đúng lớp mình mà không đọc thẳng `core.user_role_scopes` (không có grant). |
| RLS + GRANT cho `core.parents`/`core.parent_students` | `0016_parent_self_lookup.sql` | Trước đó KHÔNG có RLS lẫn GRANT nào (chặn hoàn toàn, không chủ đích) — chặn cả phụ huynh tự tra "con mình là ai". Phát hiện khi chạy thật báo cáo Trưởng thành cho phụ huynh 29/07/2026. |
| `attendance.help_requests.topic/urgency/note` + policy UPDATE tự sửa trong ngày | `0020_help_request_details.sql` | V5 "Cần gặp thầy cô" (Hub Desktop V2): em chọn chủ đề + mức khẩn + lời nhắn tự do trước khi gửi — trước đó bảng chỉ ghi "đã bấm nút". Nội dung là dữ liệu cảm xúc thường (§4 CLAUDE.md), `care.v_signal_emotion` (0009) không đổi — vẫn chỉ đếm tín hiệu, không đọc 3 cột mới. |
| `core.v_my_homeroom_teacher` (view) | `0020_help_request_details.sql` | Tên GVCN của lớp em đang học, để hiện "gửi riêng cho cô X" ở V5 — cùng khuôn mẫu `v_my_scopes`. |
| `core.v_my_guardians` (view) | `0021_my_guardians_view.sql` | V8 Báo cáo Trưởng thành: "gửi cho ai" — CHỈ tên + quan hệ, KHÔNG có trạng thái đã đọc (chưa có bảng theo dõi đọc, không bịa). Chiều ngược của `parent_students_self` (0016: phụ huynh tự tra con mình) — ở đây là em tự tra phụ huynh của mình. |
| `report.growth_report_approvals(student_id, week_start, status, reviewer_id, reviewed_at, note)` + policy ghi cho GVCN trên `attendance.checkins` (`checkins_insert_by_homeroom`, `checkins_update_by_homeroom`) | `0032_gvcn_screens.sql` | Bốn màn hình GVCN (gói `gvcn-man-hinh`, 31/07/2026). **Sổ duyệt** chỉ lưu QUYẾT ĐỊNH của GVCN về Báo cáo Trưởng thành một tuần — nội dung báo cáo vẫn sinh lại từ dữ liệu thô mỗi lần mở, không có bản sao nào để lệch. Khóa duy nhất `(student_id, week_start)` + CHECK `week_start` phải là thứ Hai ⇒ §9: bấm duyệt hai lần chỉ ra một dòng. Đọc theo `core.can_see_care` (hẹp hơn báo cáo: phụ huynh/học sinh KHÔNG thấy sổ nội bộ này), ghi chỉ GVCN và chỉ ký được tên mình. **KHÔNG cấp cho role `reporting`** (§5). **Policy điểm danh:** trước 0032, `0014` chỉ cho em tự check-in (`is_me`) và cho GVCN xác nhận bản gửi muộn — em không tự bấm thì không có dòng nào và cô không tạo được, tức màn "Điểm danh lớp" không thể ghi vắng/có phép. Hai policy mới dựng trên `core.is_homeroom_of`, không đụng grant theo cột của `0025` (occurred_on/source vẫn ngoài tầm UPDATE) và vẫn qua trigger `checkins_guard_confirmation`. |
| `core.v_my_homeroom_teacher` bỏ hậu tố `"(GVCN 6A1)"` khỏi tên | `0022_homeroom_teacher_name_clean.sql` | Phát hiện khi chạy thật V5/V9: fixture đặt tên kiểu "Cô Lan (GVCN 6A1)" để phân biệt tài khoản thử ở màn đăng nhập — đúng chỗ đó nhưng đọc kỳ khi ghép câu ("gửi riêng cho Cô Lan (GVCN 6A1)"). Sửa một chỗ ở view, không lặp regex ở từng màn hình. |

| `ops.embedded_app_events` | `0019_embed_generic_capture.sql` | Cổng nhận CHUNG cho mọi sự kiện rổ Xanh từ Mini App nhúng ngoài (ADR-017 mục 1): app không tự khai bảng đích, chỉ bắn sự kiện vào một chỗ. **Cố ý không FK `core.students`** — rổ Xanh theo định nghĩa là dữ liệu không gắn định danh học sinh; thêm FK vào đây là hạ cấp phân loại rổ bằng schema. RLS deny-by-default (bổ sung ở `0024` — xem dòng dưới): trước đó đây là bảng DUY NHẤT trong repo chưa có một dòng `enable row level security` nào. |

## Đợt củng cố 0023–0034 (31/07/2026) — bịt lỗ, cài đặt thật những thứ mới nằm trên giấy

Đây là đợt rà toàn hệ thống trước go-live. Đặc điểm chung của phần lớn các mục dưới đây: **thứ được vá không phải là tính năng thiếu, mà là kiểm soát đã được tuyên bố mà chưa tồn tại** — nguy hiểm hơn thiếu hẳn, vì người đọc schema tin là đã có nên không ai xây.

| Đối tượng | Migration | Ghi chú |
|---|---|---|
| Unique index `core.user_role_scopes_one_homeroom_idx` + trigger hàm `core.guard_homeroom_scope()` | `0023_role_scope_guard.sql` | Nửa đầu của việc chốt MỘT nguồn sự thật cho "GVCN ↔ lớp". Hệ đang có hai sổ ghi cùng một sự thật: `core.class_assignments` (nguồn RLS thật sự tin, qua `core.is_homeroom_of`) và `core.user_role_scopes` (bản sao phục vụ claim OIDC + đăng nhập dev). Chưa có màn hình quản trị nên phải gõ tay cả hai bảng ⇒ lệch là chuyện thường. Nguy hiểm nhất là chiều "có bản sao, thiếu bản gốc": buồng lái mở đúng lớp nhưng RLS lọc sạch ⇒ **cô thấy lớp trống rỗng và tưởng cả lớp chưa check-in** — im lặng bị đọc thành tin tốt. Trigger từ chối cấp vai `homeroom` khi chưa có phân công tương ứng. **Thứ tự đúng luôn là phân công trước, cấp vai sau.** |
| `care.care_case_flags` bật RLS · `ops.embedded_app_events` bật + force RLS · `attendance.checkin_rules` bật RLS + policy `checkin_rules_admin_read` | `0024_rls_gaps.sql` | Ba bảng **được GRANT mà thiếu RLS**, do 0009 bật RLS theo danh sách viết tay còn câu grant thì quét theo schema — hai cơ chế lệch nhau một nhịp là đủ mở cửa. Hậu quả thật: mọi tài khoản đăng nhập (kể cả học sinh) đọc được `care_case_flags` — không có tên nhưng có SỐ LƯỢNG, đủ để đếm "lớp mình có mấy bạn đang bị theo dõi"; và đọc được `campus_cidrs` của `checkin_rules` — tức đọc được đúng cơ chế chống gian lận điểm danh của ADR-007. |
| `security_invoker = true` cho toàn bộ view (`report.v_campus_trends`, `v_vaar_indicators`, 4 view `care.v_signal_*`, `ops.v_stale_sources`, 3 view `core.v_my_*`) | `0024_rls_gaps.sql` | Trên PostgreSQL 15/16 view mặc định chạy bằng quyền CHỦ view, bỏ qua cả RLS lẫn GRANT của người gọi. Với `core.v_my_*` đó là chủ ý (view tự khóa theo `core.current_user_id()`). Với `report.v_campus_trends` thì **không**: view đó `select avg(mood) from attendance.checkins` — đúng thứ §5 cấm role `reporting` chạm, và §5 đang được thi hành bằng `revoke usage on schema attendance from reporting`. Cấp SELECT trên một view definer là vô hiệu hóa toàn bộ lệnh revoke đó. |
| `ops.rls_exemptions` + view `ops.v_rls_gaps` | `0024_rls_gaps.sql` | Đổi cách kiểm từ "danh sách viết tay" sang "hỏi chính database". `v_rls_gaps` liệt kê mọi bảng chưa bật RLS mà không có tên trong `rls_exemptions` ⇒ **bảng sinh sau cũng bị soi**, không cần ai nhớ cập nhật danh sách. Miễn trừ phải có tên và có lý do ghi trong bảng — không có miễn trừ ngầm. |
| Thu `GRANT` `attendance.checkins` xuống đúng 3 cột + trigger hàm `attendance.guard_checkin_confirmation()` | `0025_checkins_column_grants.sql` | **Bịt lỗ leo quyền tái hiện được trên máy dev:** học sinh tự duyệt bản check-in gửi muộn của chính mình (`status='present', confirmed_by=` chính em đó). Postgres OR mọi policy PERMISSIVE cùng lệnh, nên nhánh `is_me` của `0017` mở toang MỌI CỘT của dòng chính mình — **RLS lọc theo DÒNG, không lọc theo CỘT.** Vá hai lớp, cả hai ở tầng DB nên không lớp nào phụ thuộc "code server tử tế": (1) `occurred_on` và `source` ra ngoài tầm ghi của người dùng cuối — hai cột ADR-007 sinh ra để chống việc dựng lại lịch sử điểm danh và giả chữ "cô ghi hộ"; (2) trigger gác đúng hai cột quyết định chuyên cần. |
| `care.rules` (sổ đăng ký mã luật) + `care.thresholds` đổi khóa chính sang `id` với `UQ(rule_code, school_id)` | `0026_care_router.sql` | Cột `school_id` có từ `0005` kèm comment "NULL = áp dụng toàn hệ", nhưng PK chỉ là `rule_code` nên **hệ 6 cơ sở không bao giờ khai được dòng thứ hai** — lời hứa suông suốt từ 27/07. Tách `care.rules` ra vì `care.flags.rule_code` FK vào bảng ngưỡng: chừng nào `rule_code` còn là PK ở đó thì mỗi luật chỉ được có đúng một ngưỡng. Giờ mã luật ở một sổ, ngưỡng theo cơ sở ở sổ kia. |
| `care.resolve_threshold(rule_code, school_id)` | `0026_care_router.sql` | Nơi DUY NHẤT trả lời "ngưỡng áp cho cơ sở này là bao nhiêu" (ưu tiên dòng theo cơ sở, rơi về dòng toàn hệ). §6 + mệnh lệnh 7 CLAUDE.md: **không số ngưỡng nào nằm trong TypeScript** — đổi ngưỡng là một câu UPDATE, không phải một lần deploy. |
| `care.v_signal_emotion` viết lại: thêm cột `negative_streak` bên cạnh `negative_days` | `0026_care_router.sql` | **Quyết định nghiệp vụ của chủ đầu tư 31/07/2026: cờ E_MOOD bật khi 5 ngày mood xấu LIÊN TIẾP** (chuỗi thật), không phải 5 ngày bất kỳ trong cửa sổ 14 ngày. Bảng vẫn khai được cả hai cách đếm qua `care.thresholds.params.mode` (`"streak"` mặc định \| `"window"`) để lần sau đổi cách đếm vẫn chỉ là một câu UPDATE. Đóng `DEBT.md` #21 — trước đó tên tham số nói "liên tiếp" còn view đếm "bất kỳ", hai thứ khác nhau mà không ai chọn. |
| `care.interventions.client_mutation_id` + unique index | `0026_care_router.sql` | §9: cô bấm "ghi can thiệp" hai lần, hoặc mạng chập chờn khiến client retry, vẫn ra đúng một dòng. |
| Policy `care_cases_close_scope`, `help_requests_handle_care` + trigger hàm `attendance.guard_help_request_handling()` | `0026_care_router.sql` | Cờ trước đây chỉ MỞ ra chứ không tắt đi được (`closeCase` có trong `03-api.md`, không có grant/policy UPDATE nào), và cột `handled_by`/`handled_at` của `help_requests` có từ `0004` nhưng chưa đường ghi nào chạm — nên yêu cầu "cần gặp thầy cô" nằm lại buồng lái cho tới khi hết cửa sổ hiển thị. |
| `attendance.resolve_checkin(student, at, ip, is_offline_replay)` | `0027_checkin_rules.sql` | **ADR-007 được cài đặt thật** — trước file này nó chỉ tồn tại trên giấy: `grep campus_cidrs` toàn repo chỉ ra chính file định nghĩa bảng. Router viết cứng `status='present', source='app'` cho mọi lần bấm, nên hai thẻ "Chờ xác nhận" và "Vắng" trên buồng lái GVCN **luôn bằng 0 trên dữ liệu thật** — không phải vì lớp đi học đủ mà vì không đường nào sinh ra `queued_late`; và em bấm check-in lúc 11 giờ trưa, ở nhà, vẫn được ghi "có mặt đúng giờ". Là `SECURITY DEFINER` vì `0024` đã (đúng) đóng `checkin_rules` lại: công khai dải IP trường cho học sinh chính là chỉ dẫn cách gian lận. |
| `attendance.checkin_rules.queue_max_age_days` + unique index `checkin_rules_one_active_idx` | `0027_checkin_rules.sql` | Một cơ sở chỉ được có MỘT bộ luật đang hiệu lực (trước đó chèn hai dòng `active` mâu thuẫn nhau vẫn hợp lệ ở tầng DB — "luật nào thắng" tùy vào `limit 1`). `queue_max_age_days`: hàng đợi offline gửi lên sau bao nhiêu ngày thì không còn được tính. |
| `attendance.checkins.client_id` + unique index | `0027_checkin_rules.sql` | Khóa idempotent của hàng đợi offline (§9) — chống một item bị gửi hai lần từ hai tab. |
| `staging.raw_embedded_events.failed_at` + unique index `import_errors_dedup_uq` + `core.record_import_error()` | `0028_embed_hardening.sql` | Nhánh LỖI cũng phải idempotent (§9): trước đó mỗi lần retry promote trên cùng một bản ghi hỏng lại chèn thêm một dòng `import_errors` — app ngoài retry mỗi 30 giây bơm **2.880 dòng/ngày** vào đúng hàng đợi mà con người phải xử tay. `failed_at` cố ý tách khỏi `promoted_at`: trộn hai nghĩa vào một cột thì mọi báo cáo "bao nhiêu sự kiện đã vào kho" lập tức nói dối. |
| `core.promote_embedded_event(raw_id)` (viết lại) + `staging.ingest_embedded_event(app, kind, payload)` | `0028_embed_hardening.sql` | `promote()` **không được ném lỗi vì payload xấu**. Trước bản này exception rollback sạch cả transaction ⇒ bản ghi thô KHÔNG nằm lại staging, KHÔNG có dòng `import_errors`, app ngoài nhận 500 rồi retry vô hạn — ngược hẳn §8 ("bản ghi hỏng nằm trong `staging.import_errors` chờ NGƯỜI xử, không tự đoán"). `ingest_embedded_event` là cửa vào chạy bằng vai `connector` (§8: connector chỉ INSERT trên `staging`) — trước đó route gọi `withSystemContext` nên hàng rào vai trò đó chưa từng được cưỡng chế. |
| `core.issue_embed_alias_for_user(app_id, user_id)` | `0028_embed_hardening.sql` | Alias do **Hub sinh**, mỗi app một dải riêng (ADR-017 mục 2) — app ngoài không được tự khai `external_id` định danh học sinh, và hai app ngoài không nhận cùng một alias cho cùng một em. |
| `core.begin_user_context(auth_uid)` · `core.resolve_user_id_uncached()` · `core.current_user_id()` (viết lại có cache) | `0029_perf_indexes.sql` | **Không đổi một dòng ngữ nghĩa phân quyền nào** — chữ ký giữ nguyên, không policy nào phải sửa. Lý do tồn tại là con số đo được: chạy MỘT lần câu buồng lái, `core.users` bị tra **2.241 lần** vì mỗi dòng được quét đều chạy lại `can_see_student` → 6 hàm phạm vi → mỗi hàm gọi `current_user_id()` → mỗi lần gọi là một truy vấn. Con số đó lớn tuyến tính theo sĩ số × số ngày: **càng dùng thật càng chậm.** `begin_user_context` là đường production đi qua (`withUserContext`), `current_user_id` là đường cũ — mọi kiểm soát phải vá **cả hai**, vá một đường là để lại lối đi thật. |
| 5 index đường nóng (`enrollments`, `user_role_scopes`, `ops.job_runs`, `care.care_cases`, `care.interventions`) | `0029_perf_indexes.sql` | Đo bằng EXPLAIN (ANALYZE, BUFFERS) trên hai database song sinh cùng dữ liệu cỡ thật (3.600 học sinh · 216.000 check-in): buồng lái GVCN 67→37 ms, "quét đêm qua lúc mấy giờ" 49→0,1 ms, danh sách can thiệp gần đây 38→5,9 ms. |
| `core.v_my_homeroom_classes` (view) | `0030_homeroom_source.sql` | "Lớp tôi chủ nhiệm", đọc **thẳng từ nguồn sự thật** `core.class_assignments`. Nửa sau của 0023: 0023 làm cho bản sao không nói dối được, 0030 chuyển mọi NGƯỜI ĐỌC sang đúng nguồn. Sau file này, THÊM một dòng `user_role_scopes` không mở thêm được gì và THIẾU nó không đóng nhầm gì — muốn đổi GVCN của một lớp thì sửa đúng một chỗ. |
| `core.v_my_scopes`, `core.v_my_homeroom_teacher` viết lại + trigger hàm `core.gc_homeroom_scope()` | `0030_homeroom_source.sql` | Cả ba view giờ suy từ `class_assignments`. Trigger dọn rác: gỡ phân công thì dòng `user_role_scopes` tương ứng biến mất theo — nếu không, claim OIDC `hub_classes` sẽ mang một lớp mà người đó **không còn chủ nhiệm** ra ngoài Hub cho RP. |
| `ops.v_homeroom_drift` (view) | `0030_homeroom_source.sql` | Chiều "có phân công mà thiếu bản sao" **cố ý không tự sinh** dòng `user_role_scopes` (làm vậy sẽ gãy fixture đang chèn tường minh). Thay vào đó phần lệch còn lại **hiện ra** trong view này (`kind='thieu_ban_sao'`) thay vì im lặng. Nên gắn vào job giám sát đêm để lệch sinh ra bằng đường khôi phục backup cũng bị bắt. |
| `attendance.rollup_mood_trends(month)` + `attendance.purge_old_emotion_details(before)` | `0031_emotion_retention.sql` | **Thi hành lời hứa công khai của §3 / mệnh lệnh 4: chi tiết cảm xúc quá 12 tháng bị xóa, chỉ giữ xu hướng tổng hợp** (Luật 91/2025). Trước migration này lời hứa đó chỉ tồn tại trong hai dòng comment — không hàm, không job, không test nào thi hành nó. Rollup chạy TRƯỚC khi xóa. Cả hai là `SECURITY DEFINER` nên **bắt buộc `revoke execute from public`**: quên câu đó là mọi tài khoản đăng nhập đều gọi được hàm xóa dữ liệu. |
| `ops.mark_source_fresh(source)` + trigger trên `attendance.checkins`, `evidence.dear_logs` | `0031_emotion_retention.sql` | `0011` dựng bảng `ops.source_freshness` và view `v_stale_sources` nhưng **không dòng code nào ghi `last_success_at`** ⇒ băng vàng "nguồn quá hạn" bật vĩnh viễn kể cả khi mọi thứ đang chạy. Cảnh báo luôn kêu = không ai còn tin nó, đúng ngược dấu Rev F điều 8. |
| `core.touch_updated_at()` + trigger trên `core.users` | `0031_emotion_retention.sql` | `core.users.updated_at` chưa bao giờ được cập nhật, luôn bằng `created_at`. Rev F điều 7 ("mỗi lần refresh kiểm status") và mọi đồng bộ tăng dần sau này sẽ **im lặng cho kết quả sai** nếu dựa vào cột này. |
| `core.users.anonymized_at` + chính sách `ON DELETE` nhất quán cho 12 cột trỏ về `core.users` | `0033_anonymize_user.sql` | Trước file này 12 cột đó mang BA ngữ nghĩa khác nhau (cascade / no action / không ai quyết định) — khác nhau do lịch sử viết file chứ không do ai chọn, nên `delete from core.users` hỏng **nửa vời**: cascade xuống `core.teachers` rồi bị `evidence.value_behaviors` chặn bằng mã lỗi Postgres trần, người vận hành không biết hệ đang ở trạng thái nào. Chốt: cột trỏ **người thao tác** → `on delete set null`; cột **bằng chứng** (audit, can thiệp, ghi chú tư vấn, y tế) → giữ `NO ACTION` **có chủ ý**, có comment giải thích — chúng phải chặn, và phải chặn có tiếng nói. |
| `core.anonymize_user(user_id, reason)` + trigger hàm `core.tg_block_user_hard_delete()` | `0033_anonymize_user.sql` | Đường CHÍNH THỨC thi hành quyền xóa dữ liệu (Luật 91/2025). Xóa dữ liệu ĐỊNH DANH (tên, email, `auth_uid`, sổ đăng nhập) nhưng **giữ dòng và giữ mọi khóa ngoại lịch sử**. Đây không phải cách lách luật: cái luật bảo vệ là thông tin cá nhân, còn "ca này ai xử lý, ai ghi can thiệp" là bằng chứng vận hành về một ĐỨA TRẺ — mất nó là mất khả năng trả lời "ai đã làm gì với con tôi", thứ cũng do chính luật đó bảo hộ. Trigger chặn `DELETE` bằng thông điệp tiếng Việt chỉ đúng đường thay thế; có cửa thoát hiểm khai báo tường minh cho ca hiếm Hội đồng dữ liệu quyết định xóa thật. **Đã kiểm: sau khi ẩn danh, tài khoản không đăng nhập lại được trên CẢ HAI đường** `core.current_user_id()` và `core.begin_user_context()` — vá một đường mà quên đường kia thì tài khoản "đã xóa" vẫn vào được qua đúng lối đi thật (ADR-016 "khóa là cắt"). |
| `health.read_logs(student_id, from, to)` + thu `GRANT` cột `category`/`detail` của `health.logs` | `0034_health_read_audit.sql` | Comment trên `health.logs` từ `0007` ghi "mọi lượt ĐỌC bảng này đều ghi audit" — thực tế **không có trigger nào**, và toàn repo chỉ có đúng một chỗ ghi `ops.audit_log`. Một kiểm soát được viết ra, được comment ngay trong schema, và không tồn tại; đúng câu này sẽ được đem ra trình khi bị hỏi về bảo vệ dữ liệu y tế của trẻ. PostgreSQL không có trigger cho SELECT, nên cách duy nhất là đóng đường đọc thẳng và mở một hàm. **Thu theo CỘT chứ không thu cả bảng**: thu cả bảng thì mất luôn khả năng chứng minh RLS còn sống (`select 1 from health.logs` cũng "permission denied") — đổi một kiểm soát lấy một kiểm soát khác, không phải thêm. Ghi audit cả lượt **bị từ chối**. Cùng loại lỗi phải bịt như `0031`/`0028`: `revoke execute … from public`, nếu không vai `anon` (chưa đăng nhập) cũng gọi được hàm `SECURITY DEFINER` đọc dữ liệu y tế trẻ em. |

Các migration `0013`–`0022` đều phụ thuộc baseline `0001`–`0009`; `0023`–`0034` phụ thuộc thêm vào nhau theo cặp (`0023`↔`0030`, `0025`↔`0032`) — xem `packages/core/db/migrations/README.md`.

## Quy tắc migration (§2)

- Mọi thay đổi qua file trong `packages/core/db/migrations/`, đặt tên `NNNN_mo_ta.sql`. **Số phải duy nhất** — `tools/schema-lint.mjs` chặn trùng số từ 31/07/2026, sau khi trùng số xảy ra thật trong một phiên có nhiều agent làm song song (hai file cùng mang `0030`). Trước khi đặt tên file, `ls` thư mục migration một lần: "số trống" ghi trong một bản giao việc có thể đã bị lấp trong lúc bạn đọc nó.
- **Chưa có bộ chạy migration và chưa có sổ ghi migration đã chạy** (`DEBT.md` #23): hôm nay không có đường nào áp một migration mới lên database đang sống ngoài việc chạy tay đúng file đó và tự nhớ đã chạy tới đâu. Mọi con số kiểm chứng trong tài liệu này đều đo trên database dựng lại từ đầu.
- Cùng PR phải cập nhật file này **và** mục "Dữ liệu &amp; ERD" trong `danh-cho-nguoi/ho-so-he-thong.html` nếu đổi cấu trúc có ý nghĩa nghiệp vụ (luật đồng bộ, tăng sync-version cả hai phía).
- Bảng ghi nhiều (`attendance.checkins`, `staging.raw_tutor_events`): partition theo năm học khi >5 triệu dòng — có sẵn trong thiết kế, chưa cần bật ngày 1.
- **Expand–contract (khi đã có app store):** thay đổi phá tương thích đi 2 bước (thêm mới → chuyển dần → gỡ cũ); chỉ drop cột khi không còn phiên bản app được hỗ trợ nào đọc nó (nối với `meta.minSupportedVersion` ở 03-api).

## System of Record (Rev B) — Hub không phải chủ mọi dữ liệu

| Lớp dữ liệu | SoR | Hub giữ | Độ trễ chấp nhận |
|---|---|---|---|
| Mastery, phút luyện | AI Tutor | snapshot read-only | ≤1h |
| Tiến độ khóa online | Moodle | snapshot read-only | ≤24h |
| Quan sát mầm non | COR | import theo kỳ | theo kỳ |
| Attendance, mood, evidence, care, y tế | **Hub** | bản gốc | — |

**Luật:** dữ liệu Hub không phải SoR thì KHÔNG có màn hình sửa trong Hub. Mọi dashboard/báo cáo in dấu "dữ liệu tính đến HH:mm".

## Idempotency tầng máy (Rev B — mở rộng §9)

- `staging.*` mang UNIQUE `(source, external_id)`; `promote()` upsert theo khóa đó, **mỗi dòng một transaction** (dòng hỏng vào `import_errors`, không chặn dòng sạch).
- **`external_id` phải lặp lại được cho cùng một sự kiện.** Hub từ chối webhook thiếu `external_id`; App Manifest của Mini App ngoài phải khai cách sinh nó (công cụ no-code hay sinh mã mới mỗi lần gửi lại — khi đó unique constraint vô hiệu và gửi lại sẽ ghi thêm bản mới). Test go-live: bắn 2 lần cùng payload → 1 dòng.
- Flag engine: UNIQUE `(student_id, rule_code, as_of_date)` — chạy lại là no-op.
- Bản tin Zalo: outbox `ops.outbox_messages (dedup_key UNIQUE, sent_at)` — chỉ gửi khi claim được dòng chưa sent.
