---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 32
---

# Database — một PostgreSQL, schema theo domain, Core Data Model là Single Source of Truth

## Nguyên tắc nền tảng (ADR-011)

Dữ liệu lõi (người dùng, học sinh, giáo viên, phụ huynh, cơ sở, lớp, vai trò, quyền) **chỉ tồn tại một bản duy nhất trong `core`**. Mỗi Mini App có schema riêng, chỉ chứa dữ liệu nghiệp vụ của nó, và tham chiếu core bằng khóa ngoại. **Không bao giờ có `finance.students`, `attendance.students`** — thấy bảng như vậy trong PR là lỗi chặn merge.

## Schemas

| Schema | Loại | Bảng chính |
|---|---|---|
| `core` | **Nền tảng — SSOT** | `users`, `students`, `teachers`, `parents`, `schools` (cơ sở), `classes`, `class_assignments`, `enrollments`, `roles`, `permissions`, `id_mappings`, `identity_links`, `school_networks`, `parent_invite_codes`, `terms_versions` + `consent_records` (bản điều khoản + sổ đồng ý của phụ huynh, ADR-027/`0046` — sổ chỉ thêm, đường ghi duy nhất là hàm) |
| `attendance` | Mini App | `checkins` (mood + điểm danh — dữ liệu cảm xúc lưu như dữ liệu thường, ADR-002), `checkin_rules` (khung giờ + dải IP theo cơ sở), `help_requests`, `mood_trends` (xu hướng tổng hợp giữ lại sau khi xóa chi tiết 12 tháng), `late_decisions` (sổ kết luận gửi muộn của GVCN — ADR-029/`0053`, sổ chỉ thêm) |
| `care` | Mini App (lõi) | `rules` (sổ đăng ký mã luật cờ), `flags`, `care_cases`, `care_case_flags`, `interventions`, `thresholds`, `escalations`, `counselor_notes` |
| `health` | Mini App (lõi) | `logs` (y tế bán trú — ADR-009), `meal_sleep_logs` |
| `evidence` | Mini App | `value_behaviors` (25 hành vi), `event_roles`, `pdr_reflections`, `dear_logs`, `rubric_scores`, `fitness_tests`, `club_attendance`, `survey_responses` |
| `tutor` | Mini App | `mastery_snapshots`, `cefr_results`, `cefr_trajectories`, `milestones`, `moodle_progress`; tương lai: `courses`, `lessons` |
| `finance` | Mini App (đặt chỗ) | `invoices`, `payments` — chưa xây, chỉ giữ tên miền dữ liệu |
| `social` | Mini App (đặt chỗ) | `posts`, `comments` — chưa xây |
| `ai` | Mini App (đặt chỗ) | `conversations`, `prompts` — chưa xây; mọi lời gọi model vẫn qua pii-stripper (§7) |
| `staging` | Nền tảng | `raw_tutor_events`, `raw_moodle`, `raw_cor_imports`, `raw_embedded_events` (webhook từ Mini App nhúng ngoài, ADR-015), `import_errors`, `import_limits` (ngưỡng dừng lô theo nguồn, mệnh lệnh 7 — `0045`) |
| `ops` | Nền tảng | `job_runs`, `heartbeats`, `outbox_messages`, `source_freshness`, `audit_log`, `embedded_app_events` (cổng nhận sự kiện rổ Xanh từ app nhúng — **không FK `core.students`**, RLS deny-by-default), `rls_exemptions` (danh sách bảng cố ý không có RLS, có tên và có lý do), `schema_migrations` (sổ ghi migration đã áp trên chính database này — `0050`, xem đợt F) |
| `report` | Nền tảng | `v_campus_trends`, `v_vaar_indicators` (đã có), `growth_report_approvals` (sổ duyệt Báo cáo Trưởng thành, 0032), `report_decisions` (sổ vết mọi lượt quyết định duyệt/trả lại — ADR-031/`0054`, sổ chỉ thêm, đường ghi duy nhất là hàm `report.decide_reports`). **Chưa xây:** `v_cohort_mastery`, `mv_growth_reports` — hai tên này từng nằm ở đây như thể đã có; giữ lại chỉ để đặt chỗ tên miền dữ liệu, không có migration nào tạo chúng. |

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
- ~~Phân quyền theo ma trận chung dưới đây, y như mọi dữ liệu khác.~~ **Sửa 31/07/2026 (`0038`):** cột `attendance.checkins.mood` **KHÔNG** đi theo hàng 1 ma trận nữa. "Lưu như dữ liệu thường" là câu về CÁCH LƯU (không mã hóa, không bảng riêng) — nó chưa bao giờ có nghĩa "ai cũng đọc được như nhau". Phạm vi đọc mood là `core.can_read_mood()`; xem mục "Che cột `mood`" bên dưới. **Siết tiếp 01/08/2026 (`0044`, ADR-026):** phạm vi đó nay là **chính em ∪ tâm lý cụm** — **GVCN đã bị cắt**. Dòng này trước đó còn ghi "chính em ∪ GVCN của em ∪ tâm lý cụm" và đã sai kể từ `0044`: nó nói **rộng hơn** quyền thật, tức là người đọc sau sẽ tưởng GVCN được đọc và mở lại đúng cửa vừa đóng. Ma trận ngay dưới (ô `homeroom` của hai hàng ngoại lệ) là bản có hiệu lực.
- Cờ E chỉ ghi loại tín hiệu, không sao chép nội dung vào cờ.
- Job xóa chi tiết mood >12 tháng (giữ aggregate `attendance.mood_trends`) — lời hứa công khai, **đã có hàm thật + test từ 31/07/2026**: `attendance.rollup_mood_trends()` chạy trước, `attendance.purge_old_emotion_details()` xóa sau (`0031`). Phần còn thiếu là bộ lập lịch gọi chúng hằng đêm — ghi `DEBT.md` #24, không được nói là đã tự chạy.
- Báo cáo học thuật/xếp loại không dùng dữ liệu cảm xúc (§5).
- Tái xác nhận 23/07/2026: điểm lệch với bản FINAL 15/07 (mô tả "kho riêng, mã hóa") đã chốt theo ADR-002 — không kho riêng, không mã hóa. Còn lại là tu chính văn bản Hiến chương điều 3, không phải quyết định kỹ thuật còn mở.

## Ma trận RLS — mỗi ô một policy, mỗi policy một pgTAP test

Luật đọc bảng này (siết lại 31/07/2026): **ô nào không ghi `GĐ2` thì phải có policy thật + pgTAP thật.** Trước đợt rà này ma trận hứa nhiều hơn code — tài khoản BGH đăng nhập vào không thấy gì ngoài bảng ngưỡng, mà không ai biết vì hồ sơ vẫn ghi "campus"/"all". Ma trận là lời hứa với Hội đồng dữ liệu, không phải bản phác thảo.

| Dữ liệu ↓ / Role → | student | guardian | teacher | homeroom | counselor | principal | board |
|---|---|---|---|---|---|---|---|
| core / tutor / evidence / attendance | own | children | assigned classes | homeroom class | cluster | campus | **GĐ2** |
| ↳ **ngoại lệ: cột `attendance.checkins.mood`** (`0038`, siết tiếp `0044`) | own | **—** | **—** | **—** | cluster | **—** | **GĐ2** |
| ↳ **ngoại lệ: `attendance.mood_trends`** (`0044` — cùng phạm vi, vì bảng này chỉ chứa cảm xúc) | own | **—** | **—** | **—** | cluster | **—** | **GĐ2** |
| care.flags + interventions | — | — | **GĐ2** | homeroom class | cluster | **GĐ2** | **GĐ2** |
| health.logs (y tế) | — | children | **—** | homeroom | cluster | — | — |
| care.counselor_notes | — | — | — | homeroom | cluster | — | — |
| attendance.help_requests ("cần gặp thầy cô") | **own** | **—** | **—** | homeroom class | cluster | **—** | — |
| report (ẩn danh) | — | — | — | **GĐ2** | **GĐ2** | **GĐ2** | **GĐ2** |
| care.thresholds | read | read | read | read | read+propose | read | write (qua Hội đồng DL) |
| attendance.checkin_rules (dải IP, khung giờ) | — | — | — | — | — | — | read (cùng `admin`) |
| report.growth_report_approvals (sổ duyệt) | — | — | — | read+write (ký tên mình) | read | — | — |
| report.report_decisions (sổ vết quyết định, `0054`) | — | — | — | read + **insert** (ký tên mình, không sửa không xoá) | read | — | — |

**`GĐ2` nghĩa là gì:** chưa có đường nào ở tầng DB, và **không** được coi là đã có khi viết màn hình. Bốn ô này đã đối chiếu với migration thật ngày 31/07/2026:

- `principal` / `board` trên `core/tutor/evidence/attendance`: `core.can_see_student` (0009) cố ý không gồm `board`; `principal_of` có nhưng chỉ dùng cho hàng 1 ở mức campus — phần `aggregate-only` của board chưa có view nào phục vụ.
- `teacher` trên `care.flags`: `core.can_see_care` (0009) chỉ gồm `is_homeroom_of` + `in_my_cluster`. Không có nhánh "own-created" nào. Giáo viên bộ môn không thấy cờ, kể cả cờ do chính mình tạo.
- `principal` trên `care`: cột "count-only" chưa có view đếm nào, và **cố ý chưa mở** — mở kiểu tra cứu tự do sẽ vi phạm tinh thần §5. Màn hình care team có audit log là hình thức đúng, chưa xây.
- Hàng `report`: hai view `report.v_campus_trends` / `v_vaar_indicators` được tạo ở 0009 **sau** câu `grant … to authenticated` cùng file, nên **chưa ai có quyền SELECT** — cả hàng là code chết cho tới khi có grant + policy. 0024 đã bịt lỗ ngược lại (đặt `security_invoker` để view không vượt mặt §5); phần cấp quyền là việc của sprint BGH. Hai ngoại lệ đang sống trong schema `report` là `growth_report_approvals` (0032) và `report_decisions` (`0054`) — đều có grant, có policy, có RLS, và **không** cấp cho role `reporting` (§5). Với `report_decisions`, §5 còn được tháo tường minh bằng `revoke all … from reporting`, vì `reporting` **vẫn giữ** `usage` trên schema `report` (`0009:264`) nên ở đây quyền bảng là lớp hàng rào duy nhất — khác `attendance`, nơi `usage` đã bị thu hồi.

**Hàng `health.logs` đọc kỹ hơn từ 0034:** RLS vẫn đúng như ô ghi (GVCN của em, tâm lý cụm, phụ huynh của em), nhưng quyền cột đã bị thu — `category` và `detail` (nội dung y tế thật) **không SELECT thẳng được nữa**, phải đi qua `health.read_logs(student_id, from, to)`, và mỗi lượt gọi ghi một dòng `ops.audit_log` kể cả lượt bị từ chối. Nói cho chính xác điều mà comment cũ trên bảng đã hứa suông từ 0007: **audit hiện phủ nội dung y tế đọc qua hàm, chưa phủ mọi màn hình có hiển thị dữ liệu y tế.** Câu "hiệu trưởng xem qua màn hình care team có audit log" là mô tả hình thức mong muốn, chưa phải mô tả thứ đang chạy.

**Hàng `attendance.help_requests` tách khỏi hàng 1 từ `0037`.** Bảng này nằm trong schema `attendance` nên trước đó nó chạy chung điều kiện `core.can_see_student()` với danh sách lớp và bảng điểm — tức gồm cả `is_my_child` và `principal_of`. Đo trên hub_dev 31/07/2026: **phiên phụ huynh SELECT ra bản ghi của con, đọc được cả cột `note`** — nguyên văn lời em viết khi bấm "cần gặp thầy cô"; hiệu trưởng cơ sở cũng vậy. Trong khi màn hình `/can-gap-thay-co` in cho em đọc ngay tại chỗ nhập: *"Bạn cùng lớp · thầy cô khác · bố mẹ — không nhìn thấy"*. Không đường code nào đang phơi dữ liệu đó ra (`report.ts` cố ý không đọc bảng, `care.ts` chỉ đọc dưới phiên GVCN/tâm lý cụm), nên lời hứa được giữ **bằng kỷ luật tầng ứng dụng, không bằng tầng dữ liệu** — một câu `select` viết đúng cú pháp trong tính năng sau là lộ lại, và lộ trong im lặng. Phạm vi mới: `core.is_me() OR core.can_see_care()` — trùng đúng phạm vi policy UPDATE `help_requests_handle_care` (`0026`), nên người đọc được lời nhắn và người bấm "đã gặp em rồi" là cùng một tập.

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
| `ops.source_freshness(source, label, max_age, last_success_at)` + view `ops.v_stale_sources` | `0011_source_freshness.sql` | Seed **đúng 2 nguồn** đã có người ghi thật: `attendance`, `evidence` (sửa 31/07/2026 — câu cũ ở đây ghi "5 nguồn"; ba dòng `tutor`/`moodle`/`cor` đã bị chính `0011` xoá đi vì chưa connector nào ghi `last_success_at` cho chúng, để lại thì băng vàng sáng vĩnh viễn từ ngày đầu). `authenticated` SELECT được (buồng lái cần), không sửa được. Cột `age` của view được `0043` sửa để không vỡ khi có nguồn chưa chạy lần nào — xem mục `0043` bên dưới. |
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

## Siết phạm vi đọc dữ liệu cảm xúc (`0037`) — lời hứa in trên màn hình là ràng buộc kỹ thuật

| Đối tượng | Migration | Ghi chú |
|---|---|---|
| Policy `help_requests_scope` viết lại: `core.can_see_student()` → `core.is_me() OR core.can_see_care()` | `0037_help_requests_scope.sql` | **Lỗ riêng tư ở tầng dữ liệu, đo được trên hub_dev trước khi vá.** Chi tiết đầy đủ ở đoạn "Hàng `attendance.help_requests` tách khỏi hàng 1" trong mục Ma trận RLS phía trên. Ba điểm cần nhớ khi đọc lại file này về sau: (1) `attendance.help_requests` **không còn** đi theo vòng lặp 16 bảng của `0009` — sửa vòng lặp đó không sửa được bảng này, và đó là chủ ý; (2) phạm vi mới trùng khít policy UPDATE `help_requests_handle_care` (`0026`) nên đọc và ghi cho **cùng một kết luận quyền** — không còn cảnh ghi được mà không đọc được; (3) `care.v_signal_emotion` (`0009`, viết lại `0026`) vẫn chỉ ĐẾM tín hiệu, không đọc `note`, nên mọi cờ và mọi số tổng hợp không đổi — buồng lái GVCN vẫn bật `E_URGENT`, chỉ là nội dung không đi theo cờ. Cùng họ với `0035` trên `care.counselor_notes`: hai lần cùng một lỗi gốc — **dùng chung một hàm phạm vi cho hai câu hỏi khác nhau** ("em này có thuộc tầm quản lý của tôi không" ≠ "ai được đọc lời em kể"). |

Kiểm chứng đã chạy (31/07/2026): `0037_help_requests_scope_test.sql` 13 assertion và `tests/db/help-request-rieng-tu.test.ts` 8 ca. Cả hai đã được thử ngược — trả policy về `core.can_see_student()` thì pgTAP đỏ 7/13 và vitest đỏ 3/8, trong đó có đúng câu "phụ huynh đọc ra 0 dòng".

## Che cột `mood` (`0038`) — lần thứ BA của cùng một lỗi gốc

> **Đọc mục này cùng mục `0044` bên dưới.** Nhãn và phạm vi ghi ở đây là bản 31/07/2026 và **đã bị ADR-026 siết tiếp ngày 01/08/2026**: giáo viên chủ nhiệm không còn đọc mood. Giữ nguyên văn bản cũ ở đây (không viết đè) vì nó là hồ sơ của một quyết định đã ban hành và của một lỗi đã sửa; phần hiệu lực hiện hành nằm ở mục `0044`.

Màn `/checkin` in chữ cho học sinh đọc, ngay tại chỗ em bấm bốn ô cảm xúc. Cho tới 01/08/2026 câu đó là **"Chỉ thầy cô chủ nhiệm thấy"**, và `DESIGN-GUIDELINES §9` ghi đúng câu đó. Câu đã sửa một lần trong ngày thành **"Chỉ thầy cô chủ nhiệm và thầy cô tâm lý thấy"** — vì `core.can_read_mood()` khi đó cho ĐÚNG hai vai đọc, mà nhãn cũ chỉ kể một: **nói thiếu một vai cũng là nói dối, chỉ khó bắt hơn.** (Chiều ngày 01/08, ADR-026 cắt tiếp vai chủ nhiệm nên nhãn chuẩn nay là **"Chỉ thầy cô tâm lý đọc"** — xem mục `0044`.) Ở tầng dữ liệu thì trước `0038` câu đó không đúng: `attendance.checkins` nằm trong vòng lặp 16 bảng của `0009:150-176` nên dùng chung `core.can_see_student()` — hàm gồm cả `is_my_child` và `principal_of`. **RLS lọc theo DÒNG, mà `mood` là một CỘT nằm chung dòng với điểm danh.**

Đo trên hub_dev trước khi vá, dưới đúng danh tính từng vai: phiên **phụ huynh đọc ra 7 dòng có mood**, phiên **hiệu trưởng 8 dòng**.

Quyết định nghiệp vụ chủ đầu tư 31/07/2026: mood CHỈ GVCN và tâm lý cụm thấy; phụ huynh và hiệu trưởng KHÔNG thấy mood từng ngày, nhưng phụ huynh VẪN thấy điểm danh và VẪN thấy báo cáo tổng hợp.

| Đối tượng | Migration | Ghi chú |
|---|---|---|
| `core.can_read_mood(uuid)` | `0038_checkins_mood_scope.sql` | Hàm phạm vi **thứ tư**, đứng cạnh `can_see_student` / `can_see_care` / `can_see_health`: `core.is_me() OR core.can_see_care()`. Lý do nó phải có TÊN RIÊNG: đây là lần thứ BA trong một ngày cùng một lỗi gốc — `0035` (`care.counselor_notes`), `0037` (`attendance.help_requests`), giờ là `mood`. Cả ba đều là **dùng chung một hàm phạm vi cho hai câu hỏi khác nhau**: "ai được thấy em này" ≠ "ai được thấy em này CẢM THẤY GÌ". Không đặt tên cho câu hỏi thứ hai thì sẽ có lần thứ tư. |
| Thu `GRANT SELECT` trên `attendance.checkins` xuống **mọi cột trừ `mood`** | `0038_checkins_mood_scope.sql` | Cùng khuôn mẫu `0025` đã dùng cho UPDATE. Postgres không cho revoke một cột ra khỏi quyền cấp ở mức bảng (chỉ WARNING), nên phải revoke cả bảng rồi grant lại theo danh sách cột. **Rủi ro đã biết:** danh sách viết tay thì lệch — thêm cột mới vào `attendance.checkins` mà quên grant là cột đó vô hình với cả hệ thống. Cả pgTAP `0038` lẫn `tests/db/mood-rieng-tu.test.ts` đều có một assertion canh đúng chỗ đó (so danh sách cột với `has_column_privilege`). |
| View `attendance.checkins_care` | `0038_checkins_mood_scope.sql` | Đường ĐỌC mood duy nhất của người dùng cuối. **Cố ý KHÔNG `security_invoker = true`**, ngược luật chung mà `0024` đặt ra: view invoker kiểm quyền bằng quyền người gọi, mà người gọi vừa bị revoke đúng cột `mood` ⇒ view tự chặn chính nó. View chủ-quyền đọc được `mood`, đổi lại nó bỏ qua RLS nên **phạm vi dòng phải tự khai trong mệnh đề WHERE** (`core.can_read_mood`). An toàn dựa vào bất đẳng thức `can_read_mood ⊂ can_see_student` — view không mở thêm một dòng nào mà RLS đã đóng; pgTAP `0038` ghim lại. |
| `attendance.happy_days(student, from, to)` | `0038_checkins_mood_scope.sql` | Số "ngày Vui" trong một khoảng — **SỐ TỔNG HỢP** cho Báo cáo Trưởng thành mà phụ huynh đọc, không phải mood từng ngày. Ranh giới chủ đầu tư chốt: phụ huynh mất mood từng ngày, giữ báo cáo tổng hợp. `SECURITY DEFINER` (phải đọc được `mood`) nên tự kiểm phạm vi bằng `core.can_see_student()` và **bắt buộc `revoke execute from public`** (cùng lý do `0031`). Trả **NULL** — không phải 0 — khi người gọi không được xem em này: "không được phép biết" khác "không có ngày vui nào". |

**Đánh đổi đã cân, ghi lại để lần sau không phải cân lại.** PostgreSQL chỉ có đúng hai cách giấu một cột khỏi một người; đã thử cả hai trên hub_dev (PG 16.14):

- **View che cột** (`case when core.can_read_mood(...) then mood end`) — ưu: không câu đọc nào trong `apps/hub` phải sửa. **Bị loại** vì hai lý do đo được: (1) cột tính bằng biểu thức thì không ghi được, muốn giữ đường ghi thì phải đổi `attendance.checkins` thành view + trigger `INSTEAD OF`, mà `INSERT … ON CONFLICT` trên view có trigger `INSTEAD OF` bị Postgres từ chối thẳng ⇒ gãy đúng `checkin.submitMood`; (2) nguy hiểm hơn — `attendance.rollup_mood_trends()` (`0031`) chạy dưới vai hệ thống, không có ngữ cảnh người dùng ⇒ `can_read_mood()` false ⇒ `avg(mood)` toàn NULL ⇒ job ghi xu hướng RỖNG rồi `purge_old_emotion_details()` xóa chi tiết ngay sau. **Mất sạch dữ liệu 12 tháng mà không một dòng lỗi nào.**
- **Grant theo cột** (đã chọn) — bảng vẫn là BẢNG nên mọi INSERT/UPDATE, RLS, trigger `0025`, index, job nền, view nội bộ chủ-quyền (`care.v_signal_emotion`, `report.*`) và role `backup_reader` đều nguyên vẹn. Đọc sai phạm vi thì Postgres **ném lỗi 42501 ngay tại câu SQL**. Giá phải trả, nói thẳng: mọi câu ĐỌC `mood` dưới vai `authenticated` phải đổi nguồn sang `attendance.checkins_care` — danh sách đầy đủ nằm ở cuối file migration.

Lý do quyết định không phải "ít việc hơn" mà là: **một lời hứa bị phá phải hỏng thành tiếng.** Với cách che cột, ngày nó che nhầm chỗ thì không ai biết cho tới lúc mở bảng xu hướng ra thấy trống.

Kiểm chứng đã chạy (31/07/2026): `0038_checkins_mood_scope_test.sql` 20 assertion và `tests/db/mood-rieng-tu.test.ts` 11 ca, cả hai xanh trên Postgres thật. Hai bài test cũ đổi chiều **có chủ ý** và phải đi kèm ADR: `0023_principal_scope_test.sql` (chính file đó đã viết sẵn "nếu Hội đồng dữ liệu sau này quyết định che mood khỏi BGH thì đây là assertion đỏ đầu tiên") và `0017_checkins_self_update_test.sql` (`excluded.mood` bị Postgres tính là ĐỌC cột `mood` nên đòi quyền SELECT — gán thẳng tham số thì không). *(Sau `0044`: bài pgTAP `0038` vẫn 20 assertion nhưng assertion #1 đã đổi chiều — xem mục `0044`.)*

## `0042_nguong_theo_co_so.sql` — ngưỡng E_MOOD hết lệch tầng

`0026` dựng `care.resolve_threshold(rule_code, school_id)` và đổi khoá của `care.thresholds` thành `(rule_code, school_id)` với đúng một mục đích: cho phép "mỗi cơ sở một ngưỡng riêng, cơ sở chưa khai thì dùng số chung". Cùng file đó, `care.v_signal_emotion` lại gọi `care.resolve_threshold('E_MOOD')` — **thiếu tham số thứ hai**. Thân hàm lọc `(t.school_id = p_school_id or t.school_id is null)`, mà `t.school_id = null` không bao giờ đúng, nên nhánh "dòng riêng của cơ sở" bị loại sạch và view **luôn** lấy dòng toàn hệ. Trong khi tầng ứng dụng (`apps/hub/server/care-thresholds.ts`) gọi CÓ `school_id`.

Vì sao chưa ai thấy: đo trên hub_dev 01/08/2026, cả 6 dòng `care.thresholds` đều `school_id IS NULL` — hai đường trùng nhau **ngẫu nhiên**. Ngày đầu tiên có người khai một dòng riêng cho một cơ sở là ngày buồng lái và bộ quét cờ tính bằng hai con số khác nhau, và **không lỗi nào được ném**: cả hai đều trả số, chỉ là số khác nhau. Người khai ngưỡng tưởng mình vừa đổi hành vi hệ thống, trong khi chỉ đổi được một nửa.

| Đối tượng | Migration | Ghi chú |
|---|---|---|
| View `care.v_signal_emotion` (viết lại) | `0042_nguong_theo_co_so.sql` | Đọc `window_days` **và** `bad_mood_max` qua `care.resolve_threshold('E_MOOD', s.school_id)` bằng `cross join lateral` trên `core.students` — đúng khuôn `0039` đã dùng cho `care.v_signal_attendance` / `care.v_signal_behavior`. Từ nay ba view tín hiệu hỏi ngưỡng theo cùng một cách. `bad_mood_max` đi theo **từng dòng** check-in thay vì nhân chéo một ngưỡng cho cả bảng, nếu không mỗi em lại bị so với ngưỡng của mọi cơ sở. Cột và kiểu giữ nguyên từng nét nên `create or replace` chạy được và `care.run_flag_engine` không phải sửa một chữ. `coalesce(..., 14/2)` giữ nguyên: bảng ngưỡng thiếu dòng thì view vẫn trả số chứ không trả rỗng — rỗng ở đây trông y hệt "cả lớp đều ổn". View này **chưa từng grant cho `authenticated`** nên việc nó join thêm `core.students` không mở thêm quyền cho ai. |

Kiểm chứng đã chạy (01/08/2026): `0042_nguong_theo_co_so_test.sql` **11 assertion xanh** trên database dựng lại từ đầu. Bài test tự khai một dòng ngưỡng riêng cho cơ sở Q2 rồi khẳng định view đổi theo, và chứng minh **hai tham số riêng biệt** (`window_days` trước, `bad_mood_max` sau) với một em ở cơ sở khác làm đối chứng mỗi lần — không có bước khai đó thì bài test xanh y hệt trên cả bản cũ lẫn bản mới. **Thử ngược:** dựng lại bản `0026` cũ rồi chạy lại đúng bài đó cho **4 assertion đỏ**. Trả xong chốt chặn (e) của `DEBT.md` #32.

## `0044_mood_chi_tam_ly.sql` (ADR-026) — nhật ký cảm xúc rời khỏi tầm đọc của GVCN

Quyết định chủ đầu tư 01/08/2026, **đảo một phần ADR-025**: giáo viên chủ nhiệm không còn xem được nhật ký cảm xúc từng ngày — không trên màn hình, và hỏi thẳng cơ sở dữ liệu cũng bị từ chối. Cô **vẫn** nhận cờ "em này cần để ý" và **vẫn** nhận ngay tín hiệu "cần gặp thầy cô". Tâm lý cụm, chính em, phụ huynh, BGH: không đổi.

Lý do đảo, ghi như biên bản chứ không như lời khen: ADR-025 đặt đúng câu hỏi ("ai được thấy em này" ≠ "ai được thấy em này CẢM THẤY GÌ") nhưng trả lời còn rộng một vai. Nhật ký cảm xúc từng ngày là lời một đứa trẻ nói với chính mình, không phải dữ kiện quản lý lớp; để nó trong tầm đọc thường ngày của đúng người chấm điểm và xếp loại em là bắt §5 sống bằng kỷ luật cá nhân thay vì bằng ràng buộc kỹ thuật.

**Ba cửa, không phải một** — cắt một cửa mà để hai cửa kia là chưa cắt gì:

| Đối tượng | Migration | Ghi chú |
|---|---|---|
| `core.can_read_mood(uuid)` (viết lại) | `0044_mood_chi_tam_ly.sql` | `core.is_me() OR core.in_my_cluster()`. **Cố ý không gọi `core.can_see_care()`** nữa (bản `0038` gọi): hàm đó còn nhánh `is_homeroom_of`, gọi lại nó là mở lại đúng cửa vừa đóng, kín đáo hơn nhiều so với thêm thẳng một chữ. Thân hàm chỉ có một dòng và **không có chú thích bên trong** — pgTAP `0044` đọc `pg_proc.prosrc` để khẳng định hàm không nhắc `can_see_care` / `is_homeroom_of` / `can_see_student`, mà `prosrc` giữ cả chú thích. |
| Policy `mood_trends_scope` trên `attendance.mood_trends` (viết lại) | `0044_mood_chi_tam_ly.sql` | Từ `core.can_see_student(student_id)` sang `core.can_read_mood(student_id)`. Bảng này chứa `avg_mood` + `sample_count` theo tháng của từng em và **không chứa gì khác** — nó lọt vào vòng lặp 16 bảng của `0009` chỉ vì "có cột student_id", đúng cái bẫy mà ADR-025 đặt tên. Hôm nay chưa lộ **chỉ vì** `attendance.rollup_mood_trends()` chưa từng chạy (`DEBT` #33): 0 dòng vì bảng rỗng, không phải vì cửa đóng. Giữ nguyên TÊN policy để `ops.v_rls_gaps` (`0024`) và các bài test đang gọi tên nó không phải sửa theo. |
| `attendance.happy_days(uuid, date, date)` (viết lại) | `0044_mood_chi_tam_ly.sql` | Hai thay đổi. **(a) Cổng:** bỏ `core.can_see_student()` (6 nhánh, có chủ nhiệm / bộ môn / hiệu trưởng), thay bằng `is_me ∨ is_my_child ∨ in_my_cluster` — cổng của hàm nay khớp **người đọc báo cáo**, không khớp người quản lý lớp. **(b) Độ rộng khoảng hỏi:** từ chối khoảng hẹp hơn 5 ngày bằng lỗi `22023`. Không có (b) thì cổng (a) vẫn để lọt câu hỏi "hôm qua em có Vui không" cho phụ huynh, mà ranh giới `0038` đã chốt là họ xem SỐ TỔNG HỢP. 5 ngày là số nhỏ nhất còn dùng được: `report.buildGrowthReport` hỏi thứ Hai → thứ Sáu (`p_to - p_from = 4`), khít mép và cố ý khít. Đổi `language sql` → `plpgsql` **chỉ** để ném được lỗi có thông điệp: NULL ở hàm này đã mang nghĩa "không được phép biết về EM NÀY", nhồi thêm nghĩa "câu hỏi sai hình dạng" vào cùng một giá trị là dựng sẵn một lần đọc nhầm (`report.ts` làm `stats.happy_days >= 3`, mà `null >= 3` là false ⇒ mục Glow biến mất trong im lặng). |

**Cửa hậu `happy_days` đo được thật, không phải giả định:** đăng nhập cô Lan rồi gọi hàm cho từng ngày một, 25/07 → 01/08, nhận đúng chuỗi `1/0/1/1/0/0/0/0` — tức là đọc lại nguyên nhật ký "hôm nay em có Vui không", chỉ khác cách gõ.

**`core.can_see_care()` giữ nguyên cả ba nhánh** — đó không phải là quên. Nó đang gác `care.flags`, `care.care_cases`, `care.interventions` và `attendance.help_requests`, tức gác đúng hai thứ quyết định trên hứa cô vẫn nhận được. Siết nó ở đây là phá đúng lời hứa vừa ký, và phá theo kiểu im lặng: cô mở buồng lái thấy trống, màn hình không nói gì.

Đo trước/sau trên hub_dev (số dòng có mood đọc được qua `attendance.checkins_care`): cô Lan **75 → 0** · cô Mai (tâm lý cụm) **358 → 358** · Minh (chính em) **9 → 9** · phụ huynh **0 → 0**. Bộ quét cờ chạy trước/sau trên cùng dữ liệu: **11/11 cờ, phân bố y hệt** (A_ATTENDANCE 4 · E_MOOD 3 · E_URGENT 4) — vì `care.run_flag_engine` **không** phải `SECURITY DEFINER` nên chạy bằng vai người gọi (`postgres`, bỏ qua RLS lẫn grant theo cột) và đọc mood qua `care.v_signal_emotion` → `attendance.checkins` **trực tiếp**. Bảo đảm đó chết ngay nếu ai đổi view sang đọc `checkins_care` hoặc cho engine chạy dưới vai `authenticated`; pgTAP `0044` ghim đúng hai điều kiện ấy.

**Đánh đổi, nói thẳng:** (1) cô mất ngữ cảnh — thấy cờ mà không thấy chuỗi ngày dẫn tới cờ, mà **đường chuyển tuyến GVCN ↔ tâm lý cụm chưa tồn tại**; (2) tâm lý cụm thành nút thắt, một người cho nhiều lớp và nay là vai duy nhất ngoài chính em; (3) mất khả năng cô tự phát hiện sớm bằng mắt, đổi lại phải tin ngưỡng `care.thresholds` mà ngưỡng đó chưa qua một học kỳ dữ liệu thật (ADR-023); (4) buồng lái phụ thuộc hoàn toàn vào nhịp quét đêm cho E_MOOD — dải "Quét đêm qua" từ chỗ tiện lợi trở thành **thiết bị an toàn**. Khe còn hở (phép trừ hai khoảng trên `happy_days`) ghi thành nợ có tên: `DEBT.md` #38.

**Việc bắt buộc của tầng màn hình, cùng commit:** bốn màn GVCN đang lấy `attendance.checkins_care` làm nguồn cho CẢ cột điểm danh chứ không riêng mood — đo thật sau khi cắt, cùng một câu LEFT JOIN cho 5/5 em `status NULL`, đổi nguồn về `attendance.checkins` thì 5/5 em `status=present`. Không sửa cùng lượt thì bảng điểm danh của cô trắng toàn NULL và UI vẽ NULL thành "chưa điểm danh". Chi tiết ba việc: `DEBT.md` #34. Nhãn chuẩn mà màn hình phải in: `DESIGN-GUIDELINES` §9.

Kiểm chứng đã chạy (01/08/2026): `0044_mood_chi_tam_ly_test.sql` **26 assertion xanh** trên database dựng lại từ đầu (`plan(26)` khớp đúng 26 dòng `ok`), và `tests/db/mood-rieng-tu.test.ts` **14 ca xanh** trên hub_dev thật. **Thử ngược:** trả cả ba cửa về đúng bản `0038` rồi chạy lại bài pgTAP → **7/26 assertion đỏ**, gồm cả ba cửa và ba câu khoá hình dạng — bài test bắt đúng lỗ đang vá, không xanh vì may. Toàn bộ bộ pgTAP sau khi thêm `0042` + `0044`: **601 assertion xanh, 0 not-ok**, tổng `plan(N)` cũng đúng 601. Hai assertion đổi chiều **có chủ ý**: `0038_checkins_mood_scope_test.sql` #1 ("GVCN CỦA EM đọc được ĐÚNG GIÁ TRỊ mood" → "đọc ra 0 DÒNG") và ca cùng tên trong `tests/db/mood-rieng-tu.test.ts`. Cả hai được **lật chứ không xoá**, kèm chú thích tại chỗ trỏ về ADR-026 — một ca bị xoá là một lời hứa mất người canh.

## Đợt mở cho cả khối (`0039`–`0041`, 31/07–01/08/2026)

Ba migration cuối của đợt B không siết quyền — chúng trả lời ba câu hỏi mà hệ chỉ gặp khi số lớp tăng từ một lên cả khối: **ai quét cờ**, **BGH nhìn bằng gì**, và **làm sao biết job đêm qua có chạy không**. Cả ba đều là biến thể của cùng một luật: *im lặng không phải kết luận.*

### `0039_flag_engine.sql` — bộ quét cờ có thật, chạy một lần, để lại dấu

| Đối tượng | Ghi chú |
|---|---|
| `care.rules.source_key` (cột mới, FK → `ops.source_freshness`) | Khai **luật nào sống nhờ nguồn nào**, để thi hành hành vi cố định số 5 của `04-flag-engine.md` ("nguồn hết tươi thì BỎ QUA rule, không kết luận ổn"). `C_MASTERY`/`C_CEFR` để NULL **có chủ ý** — chưa connector nào ghi hạn tươi cho Tutor/COR, nên engine bỏ qua hai luật đó **kèm lý do** thay vì quét bảng rỗng rồi im. `ON DELETE SET NULL`: xoá một dòng nguồn thì luật quay về "chưa khai nguồn", không kéo theo cả dòng luật. |
| `care.run_flag_engine(p_on_date date, p_school uuid, p_dry_run bool)` | Toàn bộ thuật toán trong MỘT hàm, chạy được từ `psql` lẫn từ job Node. Ghi `ops.job_runs` mỗi lần chạy — nhờ vậy buồng lái trả lời được "quét đêm qua lúc mấy giờ", và **buồng lái trống mà không có dòng đó là hệ hỏng, không phải lớp ổn**. Idempotent theo `(student, rule, date)` (§9): chạy hai lần không sinh cờ đôi. **KHÔNG** `grant execute to authenticated` — chỉ vai hệ thống gọi. |
| `care.v_signal_attendance`, `care.v_signal_behavior` (viết lại) | Bỏ cửa sổ `current_date - 30` viết chết, đọc `window_days` từ `care.thresholds` qua `care.resolve_threshold` **theo từng cơ sở** (mệnh lệnh 7). Trước đó bảng ngưỡng và mã nguồn nói hai con số cho cùng một điều: người sửa bảng tưởng mình vừa đổi hành vi hệ thống, trong khi không. |

`0039` **cố ý không sửa `care.ts`** — buồng lái vẫn tính trực tiếp cho tới khi có gói chuyển sang đọc `care.flags`. Hai đường cùng tồn tại và phải cho **cùng một kết quả**; đó là cách đối chiếu. Đổi cả hai cùng lúc thì hôm lệch số không biết bên nào sai.

### `0040_report_aggregate.sql` — BGH nhìn bằng số tổng hợp, không nhìn bằng tên em

Trước file này `principal` và `board` có **0 màn hình**: `board` không nằm trong `core.can_see_student()` nên nhìn đâu cũng trống, còn `principal` đọc được từng em nhưng không có bất kỳ con số tổng nào. `0040` là hệ luận đúng chiều của ADR-025 — đầu kia siết đường đọc **cá nhân**, đầu này mở đường đọc **tổng hợp**.

| Đối tượng | Ghi chú |
|---|---|
| `report.min_cohort()` | Ngưỡng ẩn danh — **một con số, một chỗ**. `0009` đã đặt 10 cho `report.v_campus_trends`; hàm này giữ để hai chỗ không lệch nhau về sau. Cố ý **không** đặt vào `care.thresholds`: bảng đó là ngưỡng CẢNH BÁO (mệnh lệnh 7), còn đây là ngưỡng RIÊNG TƯ — trộn hai thứ là mở đường cho một câu `UPDATE` vận hành hạ ngưỡng ẩn danh xuống 1. |
| `report.aggregate_school_ids()` | Cổng vai. Sai vai thì **RAISE**, không trả bảng rỗng: bảng rỗng đọc y hệt "cả khối hôm nay không có gì". |
| `report.class_pulse_raw(p_on_date date)` | Nơi thật sự chạm dữ liệu. `SECURITY DEFINER` (phải đếm `care.care_cases` mà `principal` không đọc được), `search_path` khoá cứng, và **không cấp execute cho bất kỳ ai** — chỉ hai hàm bọc đã qua cổng vai gọi được. |
| `report.class_pulse(...)`, `report.grade_pulse(...)` | Hai hàm bọc, viết bằng **plpgsql chứ không phải SQL thuần**, vì trong SQL thuần cổng nằm trong mệnh đề `IN` có thể không bao giờ chạy khi truy vấn ngoài đã ra 0 dòng — **cổng không chạy là cổng không tồn tại**. Đơn vị nhỏ nhất là MỘT LỚP; lớp dưới `min_cohort()` trả **NULL + `cohort_too_small = true`, không trả 0** ("không được phép nói" ≠ "không có ai vắng"). |

**Cố ý không có trong `0040`:** không cột nào trả `student_id`/tên/mã học sinh kể cả gián tiếp; không tên GVCN kèm số liệu lớp (ghép "cô nào" với "tâm trạng lớp" là dựng sẵn bảng xếp hạng giáo viên bằng cảm xúc trẻ con — §5 cấm cả việc dọn sẵn đường cho nó); không nội dung cờ, ghi chú tư vấn, y tế hay "cần gặp thầy cô". Role `reporting` (§5) **không** được cấp execute, nếu không thì `revoke usage on schema attendance from reporting` của `0009` bị đi vòng.

### `0041_job_schedule.sql` — máy chạy cron chết phải thành MỘT DÒNG QUÁ HẠN

Đo được 31/07/2026: `select count(*) from ops.job_runs` trên hub_dev trả về **0**. `run-retention.mjs` thi hành lời hứa "xoá chi tiết cảm xúc sau 12 tháng" (mệnh lệnh 4, Luật 91/2025) — và chưa ai gọi nó lần nào. `ops.v_homeroom_drift` (`0030`) nằm im vì job giám sát chưa tồn tại.

| Đối tượng | Ghi chú |
|---|---|
| `ops.job_schedule` (bảng) | Sổ khai job nào phải chạy, bao lâu một lần, `grace` bao lâu thì tính là quá hạn. Có khai thì mới có cái để so "đáng lẽ đã phải chạy rồi". `runner` chỉ là **TÊN FILE**, không phải câu lệnh — một dòng trong bảng này không được phép trở thành lệnh shell; `run-all.mjs` còn soi lại bằng biểu thức chính quy trước khi ghép vào `tools/jobs/`. Luật của bảng, chép từ `0011`/ADR-016: **chỉ khai job đã có bộ chạy thật** — khai trước là tự bật một cảnh báo sáng vĩnh viễn, mà cảnh báo lúc nào cũng sáng là cảnh báo đã chết. |
| `ops.v_job_health` (view) | Một dòng một job. **`chua_chay_lan_nao` là một trạng thái RIÊNG, không phải `ok`** — đây là cả lý do view tồn tại. |
| `ops.start_job_run` / `ops.finish_job_run` / `ops.record_job_run` | Mở, đóng, và ghi-một-phát cho một lượt chạy. Mọi job đi qua ba hàm này thay vì tự `insert` vào `ops.job_runs`, để "đã chạy" chỉ có một định nghĩa. |
| `ops.reap_stale_runs(p_max_age interval)` | Job chết giữa chừng để lại dòng `running` treo vĩnh viễn — treo thì `v_job_health` đọc thành "đang chạy", tức là im lặng. Hàm này biến nó thành `failed` **thấy được, kèm lý do**. |
| `ops.job_due(p_job_name text)` | "Đến giờ chưa?" — tách khỏi bộ chạy để lịch nằm trong CSDL chứ không nằm trong crontab. |
| `ops.check_homeroom_drift()` | Job đọc `ops.v_homeroom_drift` (`0030`, ADR-020) và báo khi bản sao `user_role_scopes(homeroom)` lệch khỏi nguồn gốc `core.class_assignments`. |
| `ops.run_sql_job(p_job_name text)` | Đường chạy cho job `kind='sql'` — việc nằm trọn trong một hàm SQL, không cần sinh tiến trình Node. |

Đầu vào duy nhất của cả ba: `tools/jobs/run-all.mjs` (Task Scheduler của Windows hoặc cron). Chính bộ lịch cũng có một dòng `kind='batch'` trong `ops.job_schedule` — nhờ dòng đó, "máy chạy cron chết" trở thành **một dòng quá hạn nhìn thấy được** thay vì một buồng lái xanh không có gì để nói.

Kiểm chứng đã chạy (01/08/2026): `0041_job_schedule_test.sql` 42 assertion pgTAP xanh trên database dựng lại từ đầu; `tests/db/job-schedule.test.ts` và `tests/db/flag-engine.test.ts` xanh.

### `0043_rule_health.sql` — luật nào đang ngủ, vì sao, và cái nào đáng gọi người trực

Bộ quét `0039` khai rất tử tế mọi luật nó bỏ qua kèm lý do (`chua_cai_dat`, `chua_khai_nguon_tuoi`, `nguon_het_tuoi`, `khong_co_nguong_dang_bat`) — nhưng khai vào `ops.job_runs.metrics` dạng JSON, và đo ngày 01/08/2026: `grep -rl "v_job_health\|jobHealth" apps/hub packages/core` trả về **0 file**. Muốn biết đêm qua bộ quét chấm mấy luật thì phải mở `psql`. **Một lời khai trung thực mà không ai đọc được thì về hiệu lực không khác gì im lặng.**

| Đối tượng | Ghi chú |
|---|---|
| `ops.v_rule_health` (view) | Một dòng một luật: `state` (`dang_cham` · `dang_ngu` · `chua_chay` · `khong_ro`), `ly_do`, `giai_thich` bằng tiếng Việt, `needs_attention`, kèm `last_run_id`/`last_as_of_date`/`stale_verdict`. **Thuật lại** metrics của lượt `care.run_flag_engine` thành công gần nhất chứ không tự suy — chép mảng `c_implemented` của `0039` ra chỗ thứ hai là dựng nguồn sự thật thứ hai, và nguồn thứ hai bao giờ cũng lệch về phía trấn an. `security_invoker = true` (quy tắc `0024`); quyền đi qua policy đọc của `care.rules` + `ops.job_runs`. |
| `ops.v_stale_sources` (sửa view của `0011`) | Cột `age` **nổ tung** khi có nguồn `last_success_at IS NULL`: `now() - '-infinity'` ⇒ `ERROR: cannot subtract infinite timestamps`. Đo được thật ngày 01/08/2026 — `select source,label` chạy, `select *` chết. Hôm nay chưa ai vấp vì cả hai nguồn đang khai đều đã chạy thật và `care.getDashboard` chỉ `select label` (Postgres cắt luôn biểu thức `age`). Cả hai là may mắn, không phải thiết kế, và cùng hết hiệu lực đúng ngày connector đầu tiên khai nguồn mới. Nay `age` trả **NULL** cho nguồn chưa chạy lần nào; mệnh đề `WHERE` giữ nguyên từng chữ — chưa từng chạy VẪN tính là hết tươi. |

**`needs_attention` cố ý KHÔNG bật cho `chua_cai_dat`/`chua_khai_nguon_tuoi`.** C_CEFR sẽ ngủ nhiều tháng nữa (`DEBT.md` #35); cho nó sáng đèn mỗi đêm là chế tạo lại đúng cái "cảnh báo lúc nào cũng sáng" mà `0011` vừa gỡ ngày 31/07 — và cảnh báo luôn sáng kéo theo mọi cảnh báo thật khác chết chung. Đèn chỉ bật khi có việc cần tay người **đêm nay**: nguồn hết tươi (máy bơm dữ liệu hỏng), ngưỡng bị tắt (ai đó vừa tắt một luật đang bảo vệ trẻ con), chưa quét lần nào, hoặc bảng luật lệch với bộ quét.

**Quyết định đi kèm, ghi ở đây để khỏi bàn lại:** KHÔNG dựng `care.v_signal_cefr` và KHÔNG khai `ops.source_freshness('tutor_cefr')` lúc này. Đo bằng transaction rồi rollback trên hub_dev: khai nguồn không đổi được một chữ trong `rules_skipped` (nhánh `c_implemented` của `0039` chặn trước), chỉ thêm một dòng `degraded_sources` vĩnh viễn; còn dựng view trên hai bảng `tutor.cefr_*` đang rỗng tuyệt đối (0 dòng, không bộ ghi nào trong repo) thì 0 dòng đọc y hệt "không em nào lệch lộ trình" — hỏng im lặng, ADR-016 cấm. Chi tiết + ba câu hỏi thiết kế còn treo: `DEBT.md` #35.

Kiểm chứng đã chạy (01/08/2026): `0043_rule_health_test.sql` **37/37 assertion pgTAP xanh** trên database dựng lại từ đầu (`plan(37)` khớp đúng 37 dòng `ok`), gồm cả hai chiều của cái đèn — luật ngủ vì nợ thì đèn tắt, nguồn hết tươi thì đúng ba luật ăn nguồn đó cùng kêu. Toàn bộ bộ pgTAP sau khi thêm: **564 assertion xanh, 0 not-ok**, tổng `plan(N)` cũng đúng 564.

## Đợt E (01/08/2026) — cửa nạp danh sách thật, phiếu đồng ý của phụ huynh, và một bộ dữ liệu mẫu đủ để hỏi

Ba gói hạ cánh cùng ngày, chung một chủ đề: **hệ chuyển từ "chạy được trên dữ liệu do dev gõ" sang "nhận được dữ liệu của trường và hỏi được người lớn trước khi động vào đứa trẻ"**. Hai migration (`0045`, `0046`) và một gói không đổi một dòng lược đồ nào.

Ba gói viết tài liệu vào `danh-cho-may/.wip/` rồi một lượt gộp duy nhất đưa vào file này — lý do là cơ học chứ không phải quy trình mới: `02-database.md` và `ho-so-he-thong.html` mỗi bên chỉ có MỘT bản, ba agent cùng sửa là xung đột chắc chắn. `sync-version` vì thế tăng **một lần cho cả ba gói** (23 → 24). Người gộp đọc thẳng hai file migration để tự kiểm chứ không chép niềm tin từ bản nháp.

### `0045_nap_danh_sach.sql` — cửa nạp danh sách cả khối, và những gì nó TỪ CHỐI làm

Trước file này hệ **không có cửa nào** nhận danh sách học sinh: `core.students` chỉ có người do `seed.mjs` gõ vào. Nghĩa là đến ngày khai giảng, nhà trường gửi file khối 6 thì không có chỗ nhận.

| Đối tượng | Migration | Ghi chú |
|---|---|---|
| `staging.raw_cor_imports.failed_at timestamptz` | `0045_nap_danh_sach.sql` | Chép nguyên quy ước `0028` đã dựng cho `raw_embedded_events`: "đã gọi promote() và hỏng vĩnh viễn". Tách khỏi `promoted_at` để mọi báo cáo "bao nhiêu dòng đã vào kho" không nói dối. Không có cột này thì `promote()` diễn lại toàn bộ phần ánh xạ mỗi lần gọi và mất hẳn nhánh `already_failed` (§9 cho nhánh LỖI). Người xử lỗi xong thì `set failed_at = null` để nạp lại. Hai bảng thô còn lại (`raw_moodle`, `raw_tutor_events`) **cố ý chưa vá** — chưa có bộ đọc nào, vá trước là thêm cột chết. |
| `staging.import_limits(source, max_errors, note, updated_at)` | `0045_nap_danh_sach.sql` | Mệnh lệnh 7 — ngưỡng dừng cả lô cho từng nguồn nạp. Seed đúng **một** dòng: `('cor', 500)` theo RB-09 (`07-operations.md`). Đổi ngưỡng là một câu `UPDATE`, không phải một lần deploy. **Không dùng lại `care.thresholds`** có chủ ý: bảng đó gắn `care.rules` (mã luật, phạm vi theo cơ sở, `resolve_threshold`) và do BGH đổi; ngưỡng nạp do người vận hành đổi — hai vòng đời khác nhau, một bảng nhỏ riêng rẻ hơn một lần dùng nhầm. |
| `staging.nguong_loi_nap(text) → integer` | `0045_nap_danh_sach.sql` | Đọc ngưỡng của một nguồn. Nguồn chưa khai thì **NÉM LỖI**, không trả `NULL`: thiếu ngưỡng phải nổ lúc khởi động chứ không im lặng thành "chạy vô hạn" tới dòng cuối của một file rác. |
| `staging.ingest_cor_row(text, jsonb) → bigint` | `0045_nap_danh_sach.sql` | Cửa vào duy nhất cho danh sách học sinh, nguyên khuôn `staging.ingest_embedded_event` (`0028`). Upsert theo `(source, external_id)`, trả `raw_id` cũ khi đã nhận rồi và **không ghi đè payload** — bản đầu tiên là bản có thẩm quyền. `external_id = '<ma_lo>:<student_code>'`, xem "hai tầng chống trùng" bên dưới. |
| `staging.ghi_loi_nap(text, text, jsonb) → bigint` | `0045_nap_danh_sach.sql` | Ghi một dòng lỗi **cấp FILE** — thứ chưa gắn được vào một bản ghi thô nào, ví dụ "trùng mã học sinh trong cùng một file". `promote()` nhìn từng dòng một nên không bao giờ thấy được thuộc tính của cả file. Idempotent qua `import_errors_dedup_uq` (`0028`). |
| `core.record_cor_import_error(staging.raw_cor_imports, text, jsonb) → text` | `0045_nap_danh_sach.sql` | Một chỗ duy nhất ghi sổ lỗi của nguồn `cor`, khuôn `core.record_import_error` (`0028`). Khác đúng một điểm: tham số `jsonb` để nhét ngữ cảnh riêng từng ca (lớp cũ, lớp mới, cơ sở đang thuộc). Không có nó thì câu "em đang học lớp khác" không dùng được — người xử phải tự đi tra lớp cũ là lớp nào. |
| `core.promote_cor_row(bigint, boolean default false) → text` | `0045_nap_danh_sach.sql` | Đưa MỘT dòng thô vào `core.students`/`core.classes`/`core.enrollments`, hoặc vào `staging.import_errors`. Hợp đồng chép từ `0028`: **không bao giờ ném lỗi vì dữ liệu xấu**; trả một trong `raw_not_found` \| `already_promoted` \| `already_failed` \| `import_error` \| `promoted`. Tham số thứ hai (`p_tao_lop_moi`) mặc định `false` có chủ ý — xem "bốn ca không tự động". **Viết lại ở `0048`** (hợp đồng trả về không đổi một chữ, thêm đúng một lời hứa): trả `import_error` thì ba bảng đích **không đổi một cột nào** — xem mục `0048` bên dưới. |
| `core.doi_soat_vang_mat(text) → integer` | `0045_nap_danh_sach.sql` | Đối soát em có kỳ học mở trong các lớp mà lô vừa nạp có nhắc tới, nhưng không xuất hiện trong lô. **CHỈ GHI DANH SÁCH CHỜ NGƯỜI** — không `update students.status`, không đóng `enrollments`, không xoá gì. Chạy lại trả `0` (§9, nhờ `import_errors_dedup_uq`). Phạm vi cố tình HẸP (chỉ lớp trong lô): so cả trường sẽ báo "vắng mặt" cho học sinh của mọi khối không nằm trong file, và một hàng đợi vài nghìn dòng vô nghĩa là một hàng đợi không ai đọc. |
| `staging.v_loi_nap_danh_sach` (view) | `0045_nap_danh_sach.sql` | Hàng đợi người-xử đọc được bằng mắt: `dong_trong_file` · `ma_hoc_sinh` · `ho_ten` · `ma_lop` · `ly_do` (tiếng Việt). **Không cấp cho `authenticated`** — nó trả họ tên học sinh chưa qua bất kỳ cổng RLS nào. `0048` thêm cột `ho_so_chua_ap_dung` (jsonb): với dòng bị từ chối, nó nói *file định đổi họ tên / ngày sinh thành gì mà hệ đã KHÔNG đổi* — bốn khoá `ho_ten_trong_so`, `ho_ten_trong_file`, `ngay_sinh_trong_so`, `ngay_sinh_trong_file`. Từ chối cả dòng mà im luôn là giấu mất việc file có mang theo một thay đổi hồ sơ. |

Cả 6 hàm đều `revoke execute from public` (PostgreSQL mặc định cấp `EXECUTE` cho `PUBLIC`; ba trong số đó là `SECURITY DEFINER` **ghi thẳng vào `core.students`/`classes`/`enrollments`**, tức chạy vượt mọi RLS). **Cố ý không cấp gì cho vai `connector`**, khác `0028`: nguồn embed là một app ngoài tự đẩy webhook nên nó cần một vai hẹp; nạp danh sách là người vận hành chạy một lệnh trên máy chủ với một file trong tay. Đã đối chiếu với file migration khi gộp: không một câu `grant` nào trong `0045`.

**Hai tầng chống trùng, khác nhau, không được lẫn (§9).** `staging` chống trùng **FILE**: `raw_cor_imports` UNIQUE `(source, external_id)` với `external_id = '<ma_lo>:<student_code>'`, `ma_lo` là băm sha256 của *nội dung file + `--nam-hoc` + `--hieu-luc-tu`* — nạp lại cùng một file thì bị chặn ngay ở cửa. Bảng đích chống trùng **DỮ LIỆU**: file mới (tháng 12, lớp đã đổi) cho `ma_lo` mới ⇒ `external_id` mới ⇒ `promote()` chạy lại, và lúc đó tính idempotent do `core.students.student_code` UNIQUE và `core.classes` UNIQUE `(school_id, code, academic_year)` gánh. Lẫn một cái là mất một cái: lấy thẳng `student_code` làm `external_id` thì file tháng 12 bị chặn ở cửa staging, `promote()` không bao giờ thấy em đã đổi lớp, và báo cáo nói *"đã nạp, 0 lỗi"*.

**BẪY ĐO ĐƯỢC — `on conflict` trên `core.enrollments` NUỐT IM LẶNG.** Bảng này không có ràng buộc duy nhất thường mà có **EXCLUDE** `enrollments_no_overlap` (gist trên `student_id` + `daterange(valid_from, valid_to, '[]')`). Bốn dạng đã dựng lại trên một database riêng và đo ngày 01/08/2026:

| Viết thế nào | Kết quả THẬT |
|---|---|
| `on conflict do nothing`, không target, trùng đúng kỳ cũ | `INSERT 0 0` — **im**, không lỗi |
| `on conflict do nothing`, không target, **LỚP KHÁC** nhưng kỳ chồng lấn | **`INSERT 0 0` — im.** Dòng chuyển lớp biến mất không dấu vết |
| `on conflict (student_id, class_id, valid_from) do nothing` | `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification` |
| không có `on conflict` | `ERROR 23P01 conflicting key value violates exclusion constraint` |

Chỉ dạng có target mới ném lỗi; **dạng nguy hiểm nhất là dạng im**. `core.enrollments` chính là bảng quyết định *"cô có được xem em này không"* (`0002`), nên nuốt một dòng chuyển lớp nghĩa là cô mới không thấy em, cô cũ vẫn thấy, và job báo `success` 0 lỗi. `core.promote_cor_row()` vì thế **cấm `ON CONFLICT` ở bảng này, dù có target hay không**: nó đọc kỳ đang mở rồi quyết — trùng `class_id` ⇒ bỏ qua (idempotent thật); khác `class_id` ⇒ ghi `staging.import_errors` kèm cả lớp cũ lẫn lớp mới, **không tự đóng kỳ cũ**; chưa có kỳ nào ⇒ `insert` trần, để `23P01` nổ nếu còn chồng lấn ngoài dự kiến — nổ to hơn là nuốt. *(`seed.mjs` và `fixtures/000_test_support.sql` vẫn dùng dạng không-target một cách hợp lệ: mỗi em một lớp, không có ca chuyển lớp. Đừng chép câu đó sang job nạp.)*

> **Biên `daterange`:** dùng `'[]'` **hai đầu đóng**, nên người xử đóng kỳ cũ phải đặt `valid_to` = ngày mở mới **trừ 1 ngày**. Đặt bằng chính ngày mở mới là vẫn chồng và vẫn bị `enrollments_no_overlap` chặn.

**Bốn ca không tự động, một ca tuyệt đối không.** Nguyên tắc có sẵn ở hai chỗ, không phải chọn bừa: comment `staging.import_errors` (`0008`) — *"không map được thì nằm ở đây chờ NGƯỜI xử, tuyệt đối không tự đoán; một dòng lỗi không chặn dòng sạch"* — và RB-09 (`07-operations.md`). Mặc định là **ghi sổ rồi đi tiếp**; chỉ dừng khi hỏng ở mức cả lô.

1. **Mã sai khuôn** (`core.students.student_code` CHECK `^VA-\d{4}-\d{5}$`) — ghi sổ, đi tiếp, **tuyệt đối không nắn**. Thêm số 0, đổi `VA-26` thành `VA-2026`: mỗi phép nắn là một lần bịa ra một em có thật.
2. **Trùng mã, khác tên trong cùng file** — ghi sổ **cả hai dòng**, bỏ qua cả hai. Giữ lại một dòng là tự chọn hộ nhà trường xem em nào mới là em thật. (Trùng **tên** khác mã **không phải lỗi**: mã mới là khoá.)
3. **Lớp chưa tồn tại** — ghi sổ, **không tự tạo**. `core.classes` cần `grade` và `academic_year` mà file có thể không có, và một lỗi gõ `6A11` thay `6A1` phải kêu lên chứ không được đẻ ra một lớp ma. Muốn tạo thì phải có cờ tường minh `--tao-lop-moi`, và job **in danh sách lớp sẽ tạo TRƯỚC khi tạo**. Kể cả có cờ, **không suy khối từ mã lớp** (`6A1` → 6): đúng gần hết và **sai im lặng** ở lớp đặt tên khác quy ước.
4. **Học sinh biến mất khỏi file mới** — **KHÔNG chạm dữ liệu**, chỉ ghi một dòng chờ người. *"Trường xuất nhầm bộ lọc"* và *"em chuyển trường thật"* cho ra **cùng một dấu hiệu**; hệ không có phép đo nào phân biệt. Tự đặt `status='left'` hay tự đóng `enrollments` là kết luận không có căn cứ, và nó cắt em khỏi tầm nhìn của cô đúng lúc không ai đang nhìn.
5. **Dừng cả job chỉ ở ba ca**, đều là hỏng ở mức cả lô: file không đọc được / thiếu cột bắt buộc · `--nam-hoc` hoặc `--hieu-luc-tu` không hợp lệ · số dòng lỗi vượt `staging.import_limits`.

**Vì sao KHÔNG có dòng nào thêm vào `ops.job_schedule`.** Nạp danh sách là việc **chạy tay theo yêu cầu**: cần một file do nhà trường gửi, hai tham số người vận hành gõ, và một người đọc sổ lỗi sau đó. Khai nó vào `ops.job_schedule` sẽ làm đúng cái hỏng mà `0041` vừa dựng đèn để chống — `ops.v_job_health` hiện `chua_chay` rồi `qua_han` **vĩnh viễn** giữa hai đợt tuyển sinh, `needs_attention` bật mãi, và một cảnh báo lúc nào cũng sáng là một cảnh báo đã chết (bài học `0011`/ADR-016). Nhưng job **vẫn ghi sổ**: `tools/jobs/run-nap-danh-sach.mjs` gọi `ops.start_job_run('nap_danh_sach')` / `ops.finish_job_run()` như mọi job khác. Có sổ mà không có lịch — đúng hình dạng của `run-anonymize-user.mjs` (`0033`). Lý do viết thành comment trong migration và có một assertion pgTAP khẳng định bảng lịch **không** có dòng đó.

### `0046_dieu_khoan_dong_y.sql` (ADR-027) — phiếu đồng ý của phụ huynh, và chốt chặn thật

Trước file này hệ thống **không có gì** về việc đồng ý. Đo trên hub_dev 01/08/2026: truy vấn `information_schema.columns` tìm tên cột khớp `consent|agree|dong_y|terms|policy|version` trên cả 14 schema trả về đúng một dòng, và là dòng lạc đề (`ops.job_runs.rule_version`). Yêu cầu tồn tại duy nhất ở phía giấy (`lo-trinh-go-live.html`).

| Đối tượng | Loại | Migration | Ghi chú thiết kế |
|---|---|---|---|
| `core.terms_versions` | bảng | `0046_dieu_khoan_dong_y.sql` | Bản điều khoản có số phiên bản. `content_hash` là cột **GENERATED** từ `body_md` nên không đặt tay được. `bat_dong_y_lai boolean not null` **KHÔNG có DEFAULT** (ADR-027 (c)): người tạo bản mới buộc phải trả lời câu "bản này có bắt phụ huynh bấm lại không". |
| `core.consent_records` | bảng | `0046_dieu_khoan_dong_y.sql` | Sổ **chỉ thêm**. Trạng thái hiện tại = dòng có `superseded_at IS NULL`. `decision in ('granted','declined','withdrawn')` — ba giá trị chứ không phải hai: gộp "chưa bao giờ đồng ý" với "đã đồng ý rồi rút" là mất hai câu chuyện pháp lý khác nhau. |
| `consent_records_current_uq` | chỉ mục duy nhất riêng phần | `0046_dieu_khoan_dong_y.sql` | **Khoá idempotent §9**: `(user_id, student_id) where superseded_at is null` — một quyết định đang hiệu lực cho mỗi cặp (người bấm, đứa con). |
| `consent_records_student_live_idx` | chỉ mục riêng phần | `0046_dieu_khoan_dong_y.sql` | `(student_id) where superseded_at is null` — đường đọc của `core.has_student_consent`. |
| `core.tg_terms_version_immutable()` | trigger fn | `0046_dieu_khoan_dong_y.sql` | Chặn sửa/xoá bản đã công bố (`restrict_violation`). **Không có cửa thoát hiểm** — khác `0033`, và khác có chủ ý: một tờ giấy ký mà nội dung sửa được sau khi ký thì chữ ký không chứng minh điều gì. |
| `core.tg_consent_append_only()` | trigger fn | `0046_dieu_khoan_dong_y.sql` | Chặn DELETE, chặn mọi UPDATE trừ đặt `superseded_at` một lần từ NULL. |
| `core.required_terms_version()` | hàm (stable, definer) | `0046_dieu_khoan_dong_y.sql` | `max(version)` trong các bản đã công bố có `bat_dong_y_lai`. Trả `0` khi chưa công bố bản nào ⇒ không ai bị chặn vì một bảng rỗng. |
| `core.has_student_consent(uuid)` | hàm (stable, definer) | `0046_dieu_khoan_dong_y.sql` | Em này đã có phiếu còn hiệu lực chưa, của **bất kỳ** người đại diện nào. |
| `core.sync_student_account_status(uuid)` | hàm (definer) | `0046_dieu_khoan_dong_y.sql` | Đưa `core.users.status` của em về `active`/`pending`. **Không chạm `disabled`** — một cú bấm đồng ý không được hồi sinh tài khoản đã ẩn danh hoá (`0033`). Không GRANT cho `authenticated`. |
| `core.record_consent(uuid,uuid,text,text,text)` | hàm (definer) | `0046_dieu_khoan_dong_y.sql` | **Đường ghi duy nhất** vào sổ. Ghi phiếu VÀ bật/tắt tài khoản trong **cùng một giao dịch**, không job chạy sau. Từ chối: `28000` chưa đăng nhập · `22023` quyết định lạ / bản sai hoặc chưa công bố · `42501` không phải người đại diện của em này. |
| `core.my_consent_status()` | hàm (stable, definer) | `0046_dieu_khoan_dong_y.sql` | Một dòng cho mỗi đứa con của người đang đăng nhập. Là **hàm chứ không phải view** vì nó phải đọc `core.users.status` của đứa con, mà `users_self` (`0009`) chỉ cho mỗi người đọc dòng của chính mình. |
| `core.v_consent_gap` | view | `0046_dieu_khoan_dong_y.sql` | Học sinh **có tài khoản đang bật mà chưa có phiếu**. Cố ý không GRANT cho `authenticated` — danh sách vận hành, không phải màn hình. Đo 01/08/2026: **1 dòng** (Minh). Điều kiện đóng: `DEBT.md` #42. |
| `attendance.help_requests.source` + `.created_by` | cột | `0046_dieu_khoan_dong_y.sql` | `'self'` (mặc định) / `'staff'`; `created_by` là NGƯỜI THAO TÁC (ADR-021), `on delete set null`. |
| `help_requests_insert_by_care` | policy | `0046_dieu_khoan_dong_y.sql` | `WITH CHECK (core.can_see_care(student_id) AND source = 'staff')` — GVCN/tâm lý cụm ghi hộ. |
| `help_requests_insert_self` | policy (siết lại) | `0046_dieu_khoan_dong_y.sql` | Thêm `AND source = 'self'`: học sinh không tự khai lời mình là lời thầy cô. |
| `terms_versions_read_published` | policy | `0046_dieu_khoan_dong_y.sql` | Ai đăng nhập cũng đọc được bản **đã công bố**; bản nháp không lọt ra ngoài. |
| `consent_records_self` | policy | `0046_dieu_khoan_dong_y.sql` | Chỉ SELECT, `user_id = core.current_user_id()`. **Không** policy INSERT/UPDATE/DELETE — đường ghi duy nhất là hàm. |

**Chốt chặn nằm ở TẦNG DANH TÍNH, không ở giao diện và không ở RLS.** Nó dùng đúng cơ chế đã có sẵn và đang chạy: (1) `core.users.status = 'pending'` — giá trị đã nằm trong CHECK `users_status_chk` từ `0002` và cho tới `0046` **chưa được dùng ở đâu**; (2) `resolveIdentity` trả `null` khi status khác `'active'` ⇒ không dựng được phiên, và mọi cửa đăng nhập đều qua đây; (3) `core.begin_user_context` (`0029`) và `core.resolve_user_id_uncached` (`0001`) đều lọc `status='active'` ⇒ một cookie **còn hạn** cũng không có `user_id` để RLS bám vào; (4) `/api/auth/refresh` gọi lại `resolveIdentity` khi token còn dưới 5 phút (token 15 phút, ADR-016) ⇒ đổi status là cắt quyền trong **≤15 phút**, không đợi hết phiên.

Ba chỗ chặn đã loại trừ, kèm lý do đo được: **giao diện** — không policy RLS nào và không procedure tRPC nào biết tới việc đồng ý trước `0046`, ai giữ cookie gọi thẳng `POST /api/trpc` là qua; **`core.is_me()` / `core.can_see_student()`** — sai tầng, và sửa `is_me()` làm câm cùng lúc sáu policy đang dựa vào nó theo kiểu tệ nhất (không lỗi, chỉ trả 0 dòng); **job chạy sau** — có một khoảng thời gian lời hứa nói sai.

Đo được trên bản chạy thật (01/08/2026, HTTP thật): `consent.decide` (granted) lần 1 `created=true, accountStatus=active`, lần 2 `created=false` cùng `consentId`, `core.consent_records` đúng **1 dòng** (§9) · `GET /home` phiên phụ huynh chưa bấm → `307 → /dieu-khoan`, sau khi bấm → `200` · `checkin.getAttendanceOverview` phiên em → `200 có dữ liệu`, sau khi phụ huynh bấm `withdrawn` thì **cùng cookie còn hạn** → `403 FORBIDDEN`.

**Bẫy đã gặp, ghi lại để lần sau không ai phải vấp:**

- **Cột GENERATED và tính bất biến của hàm.** `encode(sha256(convert_to(body_md,'UTF8')),'hex')` bị Postgres từ chối thẳng: `generation expression is not immutable` — `convert_to` chỉ STABLE (phụ thuộc encoding của server). Phải dùng `public.digest(body_md,'sha256')` của pgcrypto (`0001` đã bật), và **ghi rõ schema `public.`** vì cột generated giải tên hàm một lần lúc tạo bảng, không theo `search_path` của người ghi sau này.
- **Khoá idempotent suýt sai.** Đề xuất ban đầu là `unique (user_id, student_id, terms_version_id, decision)`. Nó **gãy** ở chuỗi đồng ý → rút lại → đồng ý lại: lần đồng ý thứ hai đụng đúng dòng cũ, `on conflict do nothing` bỏ qua, trạng thái tính theo dòng mới nhất vẫn là `withdrawn` — phụ huynh bấm đồng ý mà hệ thống coi là đã rút, **không một dòng lỗi nào**.
- **`create table if not exists` không sửa ràng buộc của bảng đã tồn tại.** Thêm giá trị thứ ba (`declined`) vào CHECK phải khai lại tường minh bằng `drop constraint if exists … add constraint …`, nếu không file chạy qua sạch trên CSDL đã có bảng mà giá trị mới vẫn bị chặn.
- **Bảng tạm trong pgTAP + `login_as`.** `create temporary table` do vai chủ schema tạo, còn lời gọi chạy bằng vai `authenticated` ⇒ `permission denied for table`. Cần `grant insert, select on <bảng tạm> to public`.
- **Trang gác không được là nhánh loading trắng.** tRPC không prefetch phía máy chủ, nên `if (isLoading) return <LoadingState/>` ở đầu component làm HTML lần đầu **không có `<h1>`, không có landmark `<main>`** — người dùng trình đọc màn hình nghe đúng hai chữ "Đang tải" ở một trang pháp lý. Khung trang phải là chữ tĩnh; chỉ phần dữ liệu mới chờ.

**Cái file này CỐ Ý không làm:** `0046` **không** chuyển các tài khoản học sinh đang `active` về `pending`. Lý do và điều kiện trả: `DEBT.md` #42 (phụ thuộc Zalo OAuth) và #43 (đường ghi hộ phải có nút bấm trước). Khoảng hở được gọi tên bằng `core.v_consent_gap`, không để im lặng.

### `0047_duong_keu_cuu_khong_khoa.sql` (ADR-027 **bản 2**) — phiếu đồng ý thôi gác danh tính của đứa trẻ

**Đây là bản vá một LỖI CHẶN, không phải một cải tiến.** Chuỗi năm bước, đo đầu-cuối trên bản chạy thật 01/08/2026: phụ huynh bấm "rút lại đồng ý" → `core.record_consent` gọi `core.sync_student_account_status` → hàm này đặt `core.users.status='pending'` → `core.resolve_user_id_uncached` (`0029`) chỉ trả `id` khi `status='active'` nên `core.current_user_id()` trả NULL → `core.is_me()` false ⇒ **`help_requests_insert_self` câm, tức chính em không bấm được "Mình cần gặp thầy cô" nữa.** Một thao tác hành chính của người lớn cắt đường kêu cứu của một đứa trẻ, và nó cắt đúng em có phụ huynh ít để tâm nhất.

`0046` biết rủi ro này (nó mở đường ghi hộ `help_requests_insert_by_care`) nhưng bù chưa đủ: ghi hộ là đường của **người khác**, nó đòi đứa trẻ mở lời trực tiếp với một người lớn trước — mà cái nút trong máy tồn tại chính vì có những đứa trẻ không làm được điều đó.

**Chỗ sai gốc là một cột gánh hai khái niệm.** `core.users.status` trả lời "người này còn là người dùng của hệ không" (nghỉ học, thôi việc, đã ẩn danh hoá — `0033`). Phiếu đồng ý trả lời "trường được xử lý dữ liệu nào của đứa trẻ này". Mượn cột danh tính làm công tắc đồng ý thì tắt cái sau là tắt luôn cái trước, và danh tính là thứ **mọi** quyền bám vào.

| Đối tượng | Loại | Migration | Ghi chú thiết kế |
|---|---|---|---|
| `core.sync_student_account_status(uuid)` | **BỎ HẲN** | `0047_duong_keu_cuu_khong_khoa.sql` | `drop function`. Không để lại thân rỗng: một hàm tên "sync" mà không sync gì là cái bẫy đọc — người sau gọi nó rồi tin trạng thái đã đồng bộ. Bỏ hẳn thì lời gọi sót lại ném lỗi ồn ào lúc chạy. |
| `core.record_consent(uuid,uuid,text,text,text)` | hàm (thay thân) | `0047_duong_keu_cuu_khong_khoa.sql` | Giữ NGUYÊN chữ ký và toàn bộ hàng rào của `0046` (quan hệ cha-con, khoá dòng đang hiệu lực, §9). Bỏ đúng một dòng: lời gọi ghi vào `core.users`. Trả thêm `moodEnabled` — **hậu quả thật** của cú bấm. |
| `core.my_consent_status()` | hàm (thêm cột) | `0047_duong_keu_cuu_khong_khoa.sql` | Thêm `mood_enabled` = `core.has_student_consent(s.id)`. Hỏi theo **đứa trẻ**, không suy từ `needs_action`: nhà hai người đại diện mà người kia đã bấm thì phần này đang bật thật. Phải `drop` trước vì Postgres không cho `create or replace` đổi kiểu trả về. |
| `core.tg_users_no_pending_downgrade()` + trigger `users_no_pending_downgrade` | trigger fn | `0047_duong_keu_cuu_khong_khoa.sql` | **Khoá cấu trúc.** Chặn mọi UPDATE đưa `core.users.status` về `'pending'`. INSERT không chặn (tài khoản mới lập chưa ai dựa vào). **Cố ý không có cửa thoát hiểm** `hub.allow_*` như `0033`/`0046`: hai chỗ đó bảo vệ một dòng dữ liệu và cần đường dọn rác test; chỗ này bảo vệ đường kêu cứu của một đứa trẻ. Ngừng cho dùng thì đặt `'disabled'`. |
| `checkins_insert_self` | policy (siết) | `0047_duong_keu_cuu_khong_khoa.sql` | `core.is_me(student_id) AND (mood is null OR core.has_student_consent(student_id))`. **Gác theo CỘT, không theo DÒNG**: mood và điểm danh nằm chung một dòng `attendance.checkins`, gác theo dòng là lấy mất điểm danh theo. |
| `checkins_update_self` | policy (siết) | `0047_duong_keu_cuu_khong_khoa.sql` | Cùng điều kiện ở `WITH CHECK`. `USING` giữ nguyên `is_me` — **xoá mood về NULL vẫn đi được**, vì rút lại đồng ý phải luôn đi được theo chiều tắt. |
| `core.v_consent_gap` | view (đổi nghĩa) | `0047_duong_keu_cuu_khong_khoa.sql` | Nay là "em có tài khoản mà nhà chưa có phiếu" — **danh sách phải đi xin phiếu**, không phải danh sách lỗi. Điều kiện `u.status <> 'disabled'`. |
| `core.v_mood_khong_phieu` | view (mới) | `0047_duong_keu_cuu_khong_khoa.sql` | **Khoảng hở THẬT sau `0047`**, đếm được bằng một câu SELECT: số dòng tâm trạng đang lưu của những em không còn phiếu (thu trước khi có cổng, hoặc thu hợp lệ rồi phụ huynh rút lại). Không tự xoá — rút lại là "ngừng xử lý từ nay", xoá dữ liệu đã thu là quyền **riêng** phải do người ta yêu cầu (`DEBT.md` #48). Không GRANT cho `authenticated`. |
| `core.terms_versions` bản **2** | dữ liệu | `0047_duong_keu_cuu_khong_khoa.sql` | `bat_dong_y_lai = false`. Bản 1 bất biến (trigger, không có cửa thoát hiểm) nên đường duy nhất để nói lại cho đúng là **công bố bản mới**. Đánh dấu `true` sẽ đẩy `required_terms_version()` lên 2 ⇒ mọi phiếu bản 1 hết hiệu lực cùng lúc ⇒ tắt tâm trạng của toàn bộ học sinh đang dùng vì một lần sửa câu chữ (đúng phương án A mà ADR-027 (c) đã loại). |

**Ranh giới mới, từng đường một** (ADR-027 bản 2 — không nói chung chung, vì "nói chung chung" là cách con lỗi này lọt qua lần đầu):

| Đường | Khoá theo phiếu đồng ý? | Vì sao |
|---|---|---|
| **"Mình cần gặp thầy cô" (chính em bấm)** | **KHÔNG BAO GIỜ** | An toàn của một đứa trẻ không phải tính năng để cân đối. Sau `0047` không trạng thái hành chính nào của người lớn tắt được nó — đồng ý không còn chạm tới danh tính. |
| **Ghi tâm trạng hằng ngày** | **CÓ** | Đúng thứ phiếu đồng ý nói tới: dữ liệu cảm xúc của trẻ, do chính em khai, **không có cơ sở pháp lý nào khác** ngoài sự đồng ý của người đại diện. Cổng không gác cái này thì nó không gác gì cả. |
| **Điểm danh** (cô ghi **và** em tự bấm có mặt) | KHÔNG | Nghĩa vụ trông giữ trẻ, đứng trên cơ sở pháp lý khác. Trường không điểm danh được là trường không giữ được trẻ. |
| **Đọc Báo cáo Trưởng thành** (phụ huynh đọc về con) | KHÔNG | (1) Luật 91/2025 đòi đồng ý **tự nguyện** — giữ lại thứ phụ huynh vốn có quyền biết về con mình để đổi lấy chữ ký là biến phiếu thành phí vào cửa, và một sự đồng ý mua bằng cách đó không còn giá trị pháp lý. (2) Không thêm lớp bảo vệ nào: dữ liệu vào báo cáo đã bị gác từ đầu nguồn. |

**MỘT CÂU HỨA CŨ KHÔNG CÒN ĐÚNG NGUYÊN VĂN.** Yêu cầu chủ đầu tư ghi trong `lo-trinh-go-live.html` là *"em nào chưa có phiếu thì không bật tài khoản"*. Sau `0047` câu đó **sai** — tài khoản của em vẫn bật. Câu thay thế, đúng với thứ đang chạy:

> **"Chưa bấm thì phần mềm chưa ghi tâm trạng của con — và đường con nhờ giúp đỡ thì không bao giờ khoá."**

Câu mới **chặt hơn chứ không lỏng hơn**: câu cũ nghe như bảo vệ đứa trẻ nhưng thứ nó thật sự tắt là **đường của đứa trẻ**, còn dữ liệu thì trường vẫn ghi bình thường (cô vẫn điểm danh, y tế vẫn ghi, ghi chép chăm sóc vẫn chạy). Câu mới tắt đúng thứ phụ huynh muốn tắt.

Đo được sau khi vá (cùng CSDL, cùng thao tác đã tái hiện lỗi): phụ huynh `withdrawn` → `studentAccountStatus='active'`, `moodEnabled=false` · `core.users.status` **không đổi** · em gọi `checkin.requestHelp` ngay sau đó → `delivered=true`, dòng vào sổ với `source='self'` · em gọi `checkin.submitMood` → **không lỗi**, `moodSaved=false`, `moodBlockedReason='chua_co_phieu_dong_y'`, lượt điểm danh vẫn ghi, cột `mood` NULL · `update core.users set status='pending'` → `23001` ngay cả với vai chủ schema.

**Hệ quả tới bộ test đang xanh, nói ra chứ không giấu:** năm bài pgTAP (`0014`, `0017`, `0025`, `0038`, `0044`) và hai bài vitest (`idempotency`, `mood-rieng-tu`) ghi `mood` dưới vai học sinh mà không có phiếu — chúng **phải** đỏ sau `0047`, vì chúng mã hoá luật cũ. Cách sửa là dựng sẵn một phiếu ở phần chuẩn bị (`tests/helpers/db.ts` có `capPhieuDongY`/`goPhieuDongY`), **không** phải nới policy. `seed.mjs` cố ý vẫn **không** tạo phiếu cho ai: hôm nay trường chưa gửi phiếu tới phụ huynh nào, và giấu sự thật đó trong seed là làm mọi phép đo về cổng đồng ý mất mẫu số.

### `0048_nap_mot_dong_la_mot_don_vi.sql` — dòng bị từ chối phải sạch

**Cái hỏng thật, đo trên `hub_dev` 01/08/2026.** Em `VA-2026-97001` trước lô: họ tên `Bùi Thị Lan, Jr`, ngày sinh `2015-02-02`, đang học `6A1`. Nạp một lô xếp em sang `6A2` kèm họ tên khác và ngày sinh khác:

| | Trước `0048` | Từ `0048` |
|---|---|---|
| `core.promote_cor_row()` trả về | `import_error` — **đúng thiết kế**, chuyển lớp phải có người duyệt | `import_error` |
| Màn hình job in ra | `Đã vào kho: 0 · Vào sổ lỗi: 1` | như cũ |
| `core.students.full_name` sau lô | **`TÊN TRONG FILE`** — bị ghi đè | `Bùi Thị Lan, Jr` |
| `core.students.date_of_birth` sau lô | **`2016-12-31`** — bị ghi đè | `2015-02-02` |
| Lớp mới do một dòng bị từ chối tạo ra (`--tao-lop-moi`) | **ở lại** thành lớp ma | bị hoàn tác |

Người vận hành đọc *"0 vào kho"* rồi tin là không có gì đổi. Kho đã đổi. Đây là **ghi một phần trong im lặng** — đúng loại hỏng cả hệ này dựng ra để chống, và lần này chính bộ nạp làm.

**Vì sao xảy ra.** `0045` viết phần ánh xạ theo trình tự tự nhiên của câu chuyện (cơ sở → lớp → học sinh → ghi danh) và mỗi lần từ chối là một `return core.record_cor_import_error(…)`. Trong PL/pgSQL, **`return` không hoàn tác gì cả**: mọi `INSERT`/`UPDATE` chạy trước đó đã nằm trong transaction và ở lại đó. Nên "từ chối" của `0045` thật ra có nghĩa là *"làm tới đâu giữ tới đó rồi ghi một dòng sổ lỗi"*.

Rà hết đường promote chứ không chỉ chỗ được báo — ba lệnh ghi, theo thứ tự chúng chạy trong `0045`:

| Lệnh ghi | Còn cửa từ chối nào phía sau nó |
|---|---|
| `insert core.classes` (`0045:374`, chỉ khi `p_tao_lop_moi`) | 5 cửa: tra lại lớp không ra · em thuộc cơ sở khác · ghi sổ học sinh hỏng · em đang học lớp khác · ghi danh chồng lấn |
| `upsert core.students` (`0045:401`) | 2 cửa: em đang học lớp khác *(ca đo được ở trên)* · ghi danh chồng lấn *(em có kỳ ĐÃ ĐÓNG mà `daterange '[]'` vẫn phủ ngày hiệu lực ⇒ `23P01`)* |
| `insert core.enrollments` (`0045:425`) | không còn cửa nào — lệnh cuối, không hỏng |

`core.doi_soat_vang_mat()` chỉ ghi `staging.import_errors`, không chạm dữ liệu nghiệp vụ — đã đúng từ đầu, không sửa.

**Cách sửa.** PL/pgSQL chỉ có **đúng một** cách hoàn tác phần đã ghi mà không giết cả transaction: một khối `begin … exception when … end`, tức một subtransaction. `0048` bọc toàn bộ phần ánh xạ vào một khối con và đổi mọi cửa từ chối thành `raise exception using errcode = 'HB045', message = <lý do>, detail = <jsonb>`. Lý do và ngữ cảnh đi ra ngoài qua `get stacked diagnostics`; **dòng sổ lỗi được ghi ở NGOÀI khối nên nó sống**, còn mọi thứ ghi trong khối bị cuốn sạch. `'HB045'` là SQLSTATE tự đặt (HB = Hub, 045 = migration sinh ra hợp đồng), không đụng lớp mã chuẩn nào. `0048` cũng thêm nhánh **`when others`** mà `0045` không có: hợp đồng nói `promote()` không bao giờ ném lỗi vì dữ liệu, nhưng `0045` chỉ đỡ được bốn chỗ nó đoán trước; một lỗi ngoài dự kiến ở chỗ khác sẽ bay ra ngoài và giết cả lô đang chạy. Ngoài ra `0048` **đổi thứ tự**: tra học sinh và quyết chuyện ghi danh **trước** mọi lệnh ghi — khối con đã đủ để hoàn tác, nhưng hoàn tác một việc chưa làm là rẻ nhất, và người đọc mã thấy ngay thứ tự đúng thay vì phải tin vào lưới.

**Vì sao gộp cứng chứ không tách thành hai kết quả** (*"đã cập nhật hồ sơ, chưa chuyển lớp"*). Đã cân, ba lý do theo thứ tự sức nặng: (1) ca *"sửa chính tả tên em, lớp chờ duyệt"* **đã có đường đi sẵn** — dòng không đổi lớp thì promote bình thường và tên vào kho (có assertion khoá); tách chỉ mua được "tên vào sớm hơn vài ngày", trả bằng một trạng thái thứ sáu trong hợp đồng trả về. (2) **Từ chối một dòng nghĩa là không tin dòng đó** — ca hỏng phổ biến nhất của file xuất từ Excel là **lệch cột**, và lệch cột làm sai mọi cột cùng lúc. (3) Trạng thái "vào một nửa" **không có đường lùi**: `promoted_at` và `failed_at` loại trừ nhau, và câu hỏi §9 *"gọi lại promote thì sao"* mất câu trả lời đơn nghĩa.

**Nhưng không được im.** Mỗi dòng bị từ chối **sau khi đã tra ra em** đều kèm khối `ho_so_chua_ap_dung` trong payload sổ lỗi, và `staging.v_loi_nap_danh_sach` có một cột riêng cho nó. **Lời hứa in ra màn hình là ràng buộc kỹ thuật:** `tools/jobs/run-nap-danh-sach.mjs` in thêm hai dòng khi có dòng vào sổ lỗi — *"Dòng vào sổ lỗi KHÔNG đổi một cột nào trong kho"* và *"Đã vào kho: N ở trên là con số đầy đủ của lần chạy này"* — và hai câu đó có `core.promote_cor_row` cùng ba file test đứng sau.

**Kiểm chứng:** `0045_nap_danh_sach_test.sql` lên `plan(55)` (từ 52), `0048_nap_mot_dong_la_mot_don_vi_test.sql` **`plan(34)`**, `tests/db/nap-danh-sach.test.ts` 9 ca. **Thử ngược:** lùi `core.promote_cor_row` về định nghĩa `0045` rồi chạy lại — `0045` đỏ **5** assertion, `0048` đỏ **13**, vitest đỏ đúng câu `expected 'TÊN TRONG FILE' to be 'Bùi Thị Lan, Jr'`. Một assertion đỏ theo cách đáng chú ý: *"Danh sách chờ người gọi đúng tên em"* — `doi_soat_vang_mat()` đọc `core.students.full_name`, nên khi họ tên bị dòng-đã-bị-từ-chối ghi đè thì **hàng đợi chờ người cũng gọi sai tên em**. Một lần ghi lén lan sang cả màn hình của người đi xử lỗi.

### Bộ dữ liệu mẫu nhiều khối — không đổi một dòng lược đồ, nhưng đóng lại một mẫu số rỗng

Gói thứ ba **không có migration**. Thứ thiếu không phải là bảng mới mà là *dữ liệu đủ đa dạng để câu hỏi đặt ra được*. Đo trên `hub_dev` sáng 01/08/2026: `select grade, count(*) from core.classes` trả về đúng một dòng, `6 | 5`. Một khối. Nghĩa là mọi khẳng định dạng *"cô chủ nhiệm khối 7 không thấy học sinh khối 6"* đều trả 0 dòng — **0 vì không có khối khác để mà thấy, không vì hàng rào chặn**. Loại xanh này không hỏng khi policy hỏng, nên nó không bảo vệ gì cả.

Gieo bởi `packages/core/db/seed/seed.mjs` (cho `hub_dev` và lớp test TypeScript) và `test_support.seed_khoi_7_8()` trong `packages/core/db/fixtures/000_test_support.sql` (cho pgTAP). **Hai file là song sinh**: cùng UUID, cùng mã lớp, cùng mã học sinh. Sửa một bên mà quên bên kia thì bài pgTAP và bài TypeScript chạy trên hai thế giới khác nhau, và cả hai cùng báo xanh.

| Đối tượng dữ liệu mẫu | Ghi chú |
|---|---|
| `core.classes` — `7A1`, `7A2`, `8A1` (Quận 7), `8B1` (**Quận 2**) | Bốn lớp, hai khối, **hai cơ sở**. Cặp `8A1`/`8B1` **cùng khối 8, khác cơ sở** là chỗ duy nhất tách được hai giả thuyết "cụm của tâm lý = CƠ SỞ" và "cụm = khối": trên dữ liệu một-khối chúng cho **cùng một đáp số**, nên không phép đo nào phân biệt được. |
| 5 người lớn mới (4 GVCN + Thầy Sơn, bộ môn Tiếng Anh) | **Thầy Lộc mang `core.teachers.school_id = Quận 2`** — không phải chi tiết trang trí: để thầy ở Q7 thì "giáo viên cơ sở khác" và "giáo viên cùng cơ sở" là một người, và mọi khẳng định về biên cơ sở đo trên thầy đều không nói lên điều gì. |
| `core.class_assignments` — 4 dòng `homeroom` + 2 dòng `subject` của Thầy Sơn (`6A5`, `7A1`) | **Thầy Sơn dạy chéo khối**: 2 lớp thuộc 2 khối, trên tổng 9 lớp. Dạy một khối thì "chéo khối" chỉ là chữ; dạy hết thì câu *"thầy không thấy em ở lớp mình không dạy"* lại rỗng mẫu số — đúng cái bẫy cũ dời lên một tầng. **Khối 8 cố ý không có lớp nào của thầy**, nhờ vậy Cô Yến (GVCN `8A1`) là một GVCN có phép giao với thầy **rỗng thật**, còn Cô Thu (`7A1`) thì khác rỗng. |
| `core.user_role_scopes` — 4 `homeroom` + 2 `teacher` | Bản sao (sổ B) **phải ghi SAU** `class_assignments`: trigger `core.guard_homeroom_scope` (`0023`) từ chối dòng `homeroom` chưa có phân công gốc. Dòng của Thầy Lộc mang `school_id = Q2`; ghi nhầm Q7 vào đây là tự tay mở một cửa mà bản gốc không hề mở, và `ops.v_homeroom_drift` **không bắt được** vì nó soi theo lớp chứ không theo cơ sở. |
| `core.students` + `core.enrollments` — 48 em (12 em × 4 lớp) | Sĩ số 12 giữ hằng `PER_CLASS` của khối 6 và vì cùng lý do: dưới `report.min_cohort()` (= 10) thì màn Điều hành che sạch mọi ô của khối mới, mà **"che vì nhóm quá nhỏ" trông y hệt "màn hình hỏng"**. Mã `VA-2026-<khối><lớp><3 số>` — 5 chữ số, khớp CHECK, không đụng khuôn của khối 6. |
| `attendance.checkins` — 5 ngày, tất cả `present`, `mood` ∈ {3, 4} | **Cố ý không có em nào "xấu" ở khối mới.** Cho khối mới một em xấu là thêm cờ vào mọi phép đếm cờ tuyệt đối đang xanh — và đỏ vì dữ liệu demo đổi là loại đỏ dạy người ta bỏ qua màu đỏ. Sân dựng cờ vẫn là khối 6. |

Tổng sau khi gieo: **9 lớp / 3 khối / 2 cơ sở**, 109 học sinh, 108 kỳ ghi danh đang mở — **96 em ở Quận 7, 12 em ở Quận 2, và ĐÚNG MỘT em chưa xếp lớp** (Lê Văn Cường, `VA-2026-00419`: không có dòng `core.enrollments` nào, cả đang mở lẫn đã đóng). Con số cuối cùng đó cố ý giữ trong bộ mẫu chứ không phải sót: em không lớp là ca mà mọi truy vấn đi qua `join core.enrollments` sẽ **âm thầm bỏ rơi**, nên phải có một em như vậy nằm sẵn trong dữ liệu để bài test nào cộng nhầm 96+12 thành 109 sẽ lộ ra. Nghiệm thu 01/08/2026 bắt đúng lỗi đó trong chính dòng này: bản gộp đầu tiên viết "13 ở Quận 2" — cộng cho tròn 109 bằng cách gán em chưa xếp lớp vào một cơ sở em chưa từng thuộc về. Đếm lại bằng `group by` trên `core.schools`: Quận 2 là **12**, dưới mọi định nghĩa. `verify()` của `seed.mjs` được mở rộng để **chặn seed** nếu <3 khối phân biệt, nếu GV bộ môn chéo khối dạy <2 khối hoặc dạy HẾT, nếu không có GVCN ở khối thầy không dạy, nếu không có lớp ngoài Q7, hoặc nếu `ops.v_homeroom_drift` lệch ở khối mới.

**Luật tự áp cho hai bài kiểm mới:** mọi khẳng định phủ định (*"X không thấy Y"*) phải có một phép đo mẫu số đứng trước, và mẫu số đó phải khác 0. Đã đo rằng hai bài **thật sự cắn**: đổi `grade` của `7A1`/`7A2` thành 6 (mô phỏng bộ seed mất khối 7) → 6 ca đỏ kèm câu `MẪU SỐ RỖNG — sĩ số khối 7 đang là 0`; thêm một dòng `class_assignments` cho Thầy Sơn ở `8A1` (mô phỏng rò chéo khối) → ca *"KHÔNG thấy em nào ở khối mình không có lớp nào"* đỏ với `expected 12 to be +0`.

**Nợ có tên do gói này để lại:** `packages/core/auth-adapter/dev-provider.ts` giữ danh sách `DEV_ACCOUNTS` cố định, và `/api/auth/dev-login` từ chối `authUid` không nằm trong đó. Năm người mới **có** trong CSDL và **được** kiểm đầy đủ ở tầng máy chủ (RLS + `careRouter`), nhưng **một người thật chưa mở được màn hình của họ trên trình duyệt**. `seed.mjs` vì thế in **hai danh sách tách rời** — "đăng nhập dev được ngay" và "có trong CSDL nhưng chưa đăng nhập dev được" — vì gộp làm một là in lên màn hình một lời hứa hệ thống không giữ.

### Kiểm chứng của cả đợt E

| Bài | Chạy ở đâu | Số |
|---|---|---|
| `packages/core/db/tests/0045_nap_danh_sach_test.sql` | pgTAP, DB dựng lại từ đầu | `plan(52)`, 52 `ok`, 0 `not ok` — *`0048` nâng lên `plan(55)`, xem mục `0048`* |
| `packages/core/db/tests/0048_nap_mot_dong_la_mot_don_vi_test.sql` | pgTAP, DB dựng lại từ đầu | `plan(34)`, 34 `ok`, 0 `not ok` |
| `packages/core/db/tests/0046_cheo_khoi_test.sql` | pgTAP, DB dựng lại từ đầu | `plan(38)`, 38 `ok` — 11 phần, **phần 0 đo MẪU SỐ trước khi đăng nhập bất kỳ ai** |
| `packages/core/db/tests/0046_dieu_khoan_test.sql` | pgTAP, DB dựng lại từ đầu | `plan(45)`, 45 `ok` — **bốn assertion của bản đầu đã bị LẬT** ở `0047`, không xoá: chúng nay khẳng định điều ngược lại nên ai khôi phục lối cũ sẽ làm chúng đỏ |
| `packages/core/db/tests/0047_duong_keu_cuu_test.sql` | pgTAP, DB dựng lại từ đầu | `plan(25)`, 25 `ok` — bài KHOÁ CHẶT: chưa có phiếu và sau khi RÚT LẠI, chính em vẫn ghi được `help_requests` |
| `tests/db/nap-danh-sach.test.ts` · `cheo-khoi.test.ts` · `dieu-khoan.test.ts` | vitest, Postgres thật | 8 · 21 · 8 ca |

**Đo lại lúc gộp tài liệu (01/08/2026), không chép số từ bản nháp:** dựng một database sạch, chạy toàn bộ migration + fixtures rồi chạy hết `packages/core/db/tests/*.sql` — **731 assertion `ok`, 0 dòng `not ok`, và tổng `select plan(N)` cũng đúng 731**. *(Sau `0047`, đo lại trên database dựng lại từ đầu: **796 assertion / 47 file**, mọi file khớp `plan(N)`.)* Phép so `plan` với số dòng `ok` là bắt buộc chứ không thừa: pgTAP dừng dở giữa chừng **không in `not ok`** nào, nên một bài chết ở assertion thứ 3/40 vẫn trông như một bài sạch nếu chỉ đếm `not ok`.

*Hai số cũ trong file này (`564` ở mục `0043`, `601` ở mục `0044`) là số của đúng thời điểm đó và cố ý giữ nguyên — chúng là hồ sơ của một lần đo, không phải một con số phải cập nhật.*

## Đợt F (02/08/2026) — khe cuối của ADR-026, cuốn sổ ghi migration, và hai cổng canh chính bộ kiểm thử

Năm gói hạ cánh cùng ngày. Hai migration (`0049`, `0050`) và ba gói không đổi một dòng lược đồ nào — nhưng cả năm chung một câu hỏi: **cái đang xanh, nó xanh vì đúng hay xanh vì chưa ai thử?** Cùng cách chia việc của đợt E (mỗi gói viết bản nháp vào `danh-cho-may/.wip/`, một lượt gộp duy nhất đưa vào hai file dùng chung rồi xoá thư mục nháp), nên `sync-version` tăng **một lần cho cả đợt** (25 → 26). Người gộp đọc thẳng `0049`/`0050` để tự kiểm thay vì chép niềm tin từ bản nháp — và đã bắt được một số sai trong chính bản nháp (`0048` khai `plan(32)`, số thật là **34**).

### `0049_chi_tiet_co_roi_tam_doc_cua_gvcn.sql` (ADR-026, nợ #39) — chi tiết cờ rời khỏi tầm đọc của GVCN

`0044`/ADR-026 cắt nhật ký cảm xúc khỏi tầm đọc của giáo viên chủ nhiệm, và `apps/hub/server/routers/care.ts` cắt nốt ở tầng hợp đồng. Nhưng cột `care.flags.detail` thì **chưa bao giờ bị che**: RLS `flags_scope` (`0009:207`) gác bằng `core.can_see_care()` — hàm cố ý giữ nhánh chủ nhiệm để cô còn **nhận được cờ**. Hệ quả kèm theo: cô nhận luôn cả cột `detail`, vì **RLS lọc theo DÒNG mà `detail` là một CỘT nằm chung dòng với cờ** — đúng một chữ với cái bẫy `0038` đã gỡ cho `attendance.checkins.mood`. Đây là lần thứ **tư** của cùng một lỗi gốc, sau `0035`, `0037`, `0038`.

Đo thật trên `hub_dev` 02/08/2026, phiên cô Vân (`…0008`, GVCN 6A3+6A4), `select f.detail from care.flags f where f.rule_code = 'E_MOOD'` trả về `{"mode":"streak","nguong":5,"negative_days":6,"negative_streak":6}` cho em Lê Đăng Khôi. Mỗi phép đo phải nằm **trong một transaction**: `test_support.login_as` dùng `set_config(..., true)` nên nó là thiết lập cấp transaction — chạy ngoài transaction thì mọi phép đo ra 0 dòng và trông y hệt "cửa đã kín". Bẫy này đã cắn một lần trong chính buổi làm gói này; ghi ra đây vì nó là cách dễ nhất để nghiệm thu nhầm một hàng rào không tồn tại.

| Đối tượng | Kiểu | Migration | Ghi chú |
|---|---|---|---|
| `care.flags` — quyền SELECT của `authenticated` | đổi từ mức BẢNG sang mức CỘT | `0049` | Danh sách được cấp: `id, student_id, rule_code, as_of_date, origin, created_at`. **`detail` không nằm trong đó.** Danh sách này là HỢP ĐỒNG: thêm cột mới vào `care.flags` mà quên thêm vào đây thì cột đó vô hình với cả buồng lái. |
| `care.flags_tam_ly` | view chủ-quyền, `security_barrier = true` | `0049` | Đường đọc `detail` duy nhất của người dùng cuối. Phạm vi dòng tự khai: `core.in_my_cluster(student_id)` — hàm đó (`0009:57`) đã mang sẵn điều kiện `role_code = 'counselor'` nên **không** viết lại điều kiện vai ở đây. Cấp `select` cho `authenticated`, **không** cho `reporting` (§5) / `connector` / PUBLIC. |

Phạm vi đọc `care.flags` sau `0049`, nói bằng công thức:

```
DÒNG  : core.can_see_care  = is_homeroom_of ∨ in_my_cluster     (KHÔNG đổi)
CỘT   : mọi cột trừ detail                                       (mới)
detail: in_my_cluster, qua care.flags_tam_ly                     (mới)
```

Bất đẳng thức giữ an toàn của view chủ-quyền: `in_my_cluster ⊂ can_see_care`, nên view **không mở thêm một dòng nào** mà RLS đã đóng — nó chỉ mở lại một CỘT cho một TẬP CON của những người vốn đã thấy dòng đó. pgTAP `0049` ghim lại điều này bằng cách soi `pg_get_viewdef` (phải nhắc `in_my_cluster`, **không** được nhắc `can_see_care` / `is_homeroom_of`), vì đây là chỗ duy nhất trong file có thể âm thầm sai.

**Vì sao chọn che cột chứ không bỏ số khỏi `detail`.** `DEBT` #39 để ngỏ hai đường; đường "engine thôi ghi số" sạch hơn về nguyên tắc (bỏ dữ liệu đi thay vì giấu đi) nhưng bị loại vì hai lý do đo được: (a) **tâm lý cụm mất thật** — ADR-026 viết "tâm lý cụm giữ nguyên mọi quyền", mà chuỗi 6 ngày khác hẳn chuỗi 15 ngày và cuộc gặp đầu tiên khác nhau vì con số đó; (b) **mất bằng chứng hậu kiểm ngưỡng** — khoá `nguong` trong `detail` là bằng chứng "cờ này bật theo ngưỡng nào", mà ADR-023 hẹn rà lại ngưỡng sau ≥1 học kỳ dữ liệu thật.

**Cái bẫy đã gặp, ghi lại để không ai đi lại.** Postgres **không** cho revoke một cột ra khỏi quyền đã cấp ở mức bảng: lệnh chạy, in một WARNING, quyền bảng vẫn còn nguyên. Phải `revoke select on care.flags from authenticated` rồi `grant select (…danh sách cột…)` — đúng cách `0025` và `0038` đã làm. pgTAP `0049` canh **cả hai chiều**: `detail` phải đóng, VÀ mọi cột khác phải còn mở (câu thứ hai bắt ca revoke tay nặng hơn dự định, hoặc cột mới thêm vào bảng mà quên đưa vào danh sách grant — cả hai đều làm buồng lái của cô trắng trơn, mà trắng trơn đọc y hệt "lớp mình đang ổn").

Ba đường đang sống, đo trước và sau dưới **từng danh tính**:

| Đường | Trước `0049` | Sau `0049` |
|---|---|---|
| Bộ quét `care.run_flag_engine` (vai `postgres`) | 17 cờ, 17 `detail` | y nguyên. `run-flag-engine.mjs --dry-run`: A_ATTENDANCE + E_MOOD + E_URGENT, 10 cờ mới, 10 hồ sơ, 0 leo thang |
| Buồng lái GVCN — cô Vân `…0008` | 10 dòng cờ, đọc được `detail` | 10 dòng cờ, `select detail` → **42501** |
| Buồng lái GVCN — cô Lan `…0001` | 1 dòng cờ, đọc được `detail` | 1 dòng cờ, `select detail` → **42501** |
| Tâm lý cụm — cô Mai `…0003` | 17 dòng, đọc được `detail` | 17 dòng; `care.flags` → 42501, `care.flags_tam_ly` → **17/17 dòng có `detail`** |
| Học sinh `…0005` / quản trị `…0007` | 0 dòng | 0 dòng (RLS, không đổi) |

Cô Mai mất một **CÁCH GÕ**, không mất dữ liệu nào: cửa hợp lệ của cô là view chứ không phải bảng. `backup_reader` **không đụng** — ADR-006 đòi bản sao lưu phải ĐỦ, không thủng bảng; bài pgTAP ghim lại.

**Đường thứ tư mà việc rà lôi ra** (giao việc dặn nói ra nếu có): `report.v_vaar_indicators` (`0009:347`, sửa ở `0012`) đọc `care.flags` để đếm chỉ số quản trị theo tháng. Nó `security_invoker = true` và **chỉ được cấp cho `postgres`** — đo bằng `information_schema.table_privileges`: đúng một grantee, không `authenticated`, không `reporting`. Nó chỉ chọn `student_id`/`rule_code`/`as_of_date`/`origin`, không chạm `detail`. **Không gãy** — ghi ra đây để lần sau khỏi rà lại từ đầu.

Buồng lái đo qua HTTP thật (đăng nhập cô Vân rồi `GET /api/trpc/care.getDashboard`): HTTP 200, lớp 6A3, thẻ cờ E_URGENT hiện đủ, `moodVisibility = {readable:false, reason:"chi_tam_ly"}`. Không câu nào ném 42501, vì câu SELECT của buồng lái vốn đã không lấy `f.detail` từ trước — kỷ luật tầng ứng dụng đã đúng, `0049` chỉ dựng hàng rào phía sau nó.

**Kiểm chứng:** `0049_chi_tiet_co_test.sql` **`plan(20)`, 20 assertion xanh** trên database dựng lại từ đầu; `tests/db/flags-detail.test.ts` **8 ca xanh**. **Thử ngược:** `grant select on care.flags to authenticated` (mở lại đúng cửa vừa đóng) → **7 assertion đỏ** trên hai file (`0049`: 6 câu — ba đường hỏi thẳng/`select *`/lọc theo cột, cộng ba câu hình dạng quyền; `0044`: 1 câu). Hoàn nguyên → xanh lại cả hai.

**Một assertion đổi chiều, có chủ ý.** `0044_mood_chi_tam_ly_test.sql` có một câu đọc `care.flags.detail` **dưới phiên cô Lan** để khẳng định "detail chỉ mang bốn khoá số". Nó xanh vì cô **đọc được** cột đó — mà chính việc đó là khe hở #39. Sau `0049` câu ấy ném 42501 và làm cả file abort (chạy 7/26 assertion). Câu được **lật chứ không xoá**: nay là `throws_ok(…, '42501')`, tức ghim một điều **mạnh hơn**. Phép kiểm hình dạng `detail` (danh sách khoá cho phép — hợp đồng thật với `0039`) **chuyển sang** `0049_chi_tiet_co_test.sql`, chỗ nó đọc được qua cửa hợp lệ của tâm lý cụm. Tổng plan của `0044` không đổi (26).

### `0050_so_ghi_migration.sql` (nợ #23) — sổ ghi migration đã chạy

Trước gói này kho có 48 migration và **không sổ nào** ghi cái nào đã chạy ở đâu. Công cụ duy nhất là vòng lặp `for f in migrations/*.sql` trong `tools/run-db-tests.sh` — đúng cho database dựng lại từ đầu và chỉ cho ca đó. Ba câu hỏi không ai trả lời được: máy chủ thật đang ở migration số mấy · file `0031` trên đĩa hôm nay có còn đúng cái đã áp tháng trước · ai áp, lúc nào, mất bao lâu. **Câu thứ hai là câu im lặng nhất:** một dòng bị sửa trong migration ĐÃ ÁP không gây lỗi nào cả — file mới không được chạy lại (đã có trong sổ), nên máy chủ giữ hành vi cũ trong khi kho mô tả hành vi mới.

| Đối tượng | Kiểu | Migration | Ghi chú |
|---|---|---|---|
| `ops.schema_migrations` | bảng | `0050` | `version` (PK, `^[0-9]{4}$`) · `filename` · `checksum` (sha256 hex) · `applied_at` · `applied_by` · `duration_ms` · `nhan_no` · `ghi_chu` |
| `schema_migrations_applied_idx` | index | `0050` | `(applied_at desc)` — câu hỏi của người trực lúc 2 giờ sáng, không phải câu hỏi của báo cáo |
| dòng `('ops','schema_migrations')` trong `ops.rls_exemptions` | dữ liệu | `0050` | Khai ngoại lệ RLS, xem dưới |

Ba ràng buộc CHECK, mỗi cái chặn một kiểu **dòng sổ nói dối**:

- `schema_migrations_version_chk` — `version` phải bốn chữ số. Chặn ca một công cụ khác nhét khoá kiểu `latest` / `2026-08-02` rồi thứ tự áp thành thứ tự chuỗi ngẫu nhiên.
- `schema_migrations_checksum_chk` — `checksum` phải sha256 hex 64 ký tự. Bắt ca ghi nhầm **tên file** vào ô băm; lúc đó cột phát hiện lệch nội dung thành vô nghĩa mà vẫn trông đầy đủ.
- `schema_migrations_nhan_no_chk` — dòng **nhận nợ** (`nhan_no = true`) **không** được mang `duration_ms`; dòng **chạy thật** bắt buộc phải có. Đây là ràng buộc quan trọng nhất của bảng: nó giữ cho *"tôi đã chạy file này"* phân biệt được với *"tôi tin file này đã có sẵn"*.

**Quyền:** không cấp cho `authenticated` (schema `ops` vốn không nằm trong câu grant của `0009` — sổ vận hành không phải dữ liệu nghiệp vụ); `revoke all from public`; `grant select` cho `backup_reader` (ADR-006 — một bản khôi phục không mang theo sổ ghi là một database không ai biết đang ở migration số mấy).

**Ngoại lệ RLS, và vì sao khai chứ không bật RLS.** Cổng `ops.v_rls_gaps` (`0024`) bắt được bảng này **ngay bản nháp đầu**: `0024_rls_gaps_test.sql` đỏ ở assertion 14 trên database dựng lại từ đầu. Chép lại ở đây vì đó đúng là bằng chứng cổng còn sống — một cổng chưa từng bắt được gì thì chưa phải cổng. Chọn **khai ngoại lệ** (đường của `ops.audit_log` / `heartbeats` / `outbox_messages`) chứ không `enable row level security`: bật RLS mà không policy sẽ chặn luôn `backup_reader` — vai đó không phải chủ bảng nên nó nhận **0 dòng, im lặng**, và bản sao lưu mất đúng cuốn sổ nói database đang ở đâu.

**File duy nhất trong kho được chạy KHÔNG THEO THỨ TỰ.** `0050` mang dòng đánh dấu `-- migrate:so-ghi`. Khi sổ chưa tồn tại trên database rỗng, bộ chạy chạy nó **trước cả `0001`** để có chỗ ghi dòng đầu. Hai hệ quả bắt buộc, đều đã cài: `create schema if not exists ops` (vì `0001` chưa chạy), và GRANT cho `backup_reader` phải bọc trong kiểm tra vai tồn tại (vai đó do `0001` tạo). Vì lần đầu GRANT và câu khai ngoại lệ bị bỏ qua, bộ chạy **chạy lại file mồi** ở cuối lượt `up` — không có bước đó thì database dựng bằng `up` thiếu đúng một quyền so với database dựng bằng `run-db-tests.sh`, và **hai đường dựng ra hai kết quả khác nhau là loại lệch tệ nhất**: bài test chạy trên đường này còn máy chủ chạy trên đường kia.

### Bộ chạy `tools/migrate/migrate.mjs` — không phải đối tượng CSDL, nhưng là thứ duy nhất được ghi vào sổ

Ba lệnh: `status` (chỉ-xem, mã thoát 1 khi lệch băm / mất file ⇒ dùng được như cổng CI), `up [--dry-run]`, `baseline --to=NNNN [--ghi-chu=…]`. Thêm `--dir=` / `--url=`. Tài liệu đầy đủ: `tools/migrate/README.md`; mục runbook go-live: `07-operations.md` RB-11.

**Bước "nhận nợ ban đầu" — chỗ dễ làm sai nhất.** Sổ trống **không** có nghĩa "chưa áp gì": 49 migration đã áp bằng tay lên `hub_dev` trước khi có sổ. Hai cổng chặn đối xứng: `up` **từ chối** khi sổ chưa tồn tại mà database đã có `core.users` (chỉ sang `baseline`); `baseline` **từ chối** trên database rỗng — nhận một món nợ mình không có nghĩa là lần `up` kế tiếp bỏ qua đúng những file **chưa bao giờ chạy**, và chỉ lộ ra khi ứng dụng gọi một bảng không tồn tại.

**Một transaction thật, và cái bẫy đã đo được.** Cả 50 file của kho đều là `begin;` … `commit;` với `commit;` là câu SQL cuối. Bộ chạy **chèn câu ghi sổ vào ngay trước `commit;` của chính file** rồi gửi cả khối đi một lượt ⇒ migration và dòng sổ nằm trong cùng một transaction. Cách ngây thơ (mở transaction ở phía Node rồi gửi thân file vào) hỏng thầm lặng: `begin;` bên trong chỉ sinh WARNING, còn `commit;` bên trong **commit luôn transaction của bộ chạy**, nên dòng sổ rơi ra ngoài. Bộ chạy vì thế **cưỡng chế hình dạng file** và từ chối file lạ; file buộc phải chạy ngoài transaction khai tường minh bằng `-- migrate:khong-transaction`.

**Sổ nhật ký chạy máy:** mỗi lượt `up`/`baseline` ghi `ops.job_runs` với `job_name = 'migrate'`. **Cố ý không** khai vào `ops.job_schedule` — migration không có nhịp, khai vào đó là để `ops.v_job_health` báo "quá hạn" mỗi ngày không ai áp gì, và một báo động giả mỗi ngày giết cả bảng cảnh báo (bài học `0011`/ADR-016). pgTAP `0050` ghim lại. Hai bẫy đã cắn và đã vá: trên database dựng từ số không, `ops.job_runs` (`0008`) **chưa tồn tại** lúc lượt chạy bắt đầu, nên lần dựng đầu tiên của một máy chủ mới là lần duy nhất không để lại dấu vết nào — bộ chạy nay ghi một dòng đã-kết-thúc ở cuối lượt cho ca đó; và migration hỏng giữa chừng để lại một transaction **đang mở và đã hỏng**, nên câu `update ops.job_runs` sau đó im lặng thất bại và dòng kẹt ở `'running'` vĩnh viễn — phải `rollback` trước rồi mới ghi.

**Đã chạy thật trên `hub_dev` 02/08/2026:**

```
up                      → TỪ CHỐI (sổ trống + database đã sống), chỉ sang baseline
baseline --to=0049      → 49 dòng nhan_no = true + 0050 chạy thật (45 ms)
up                      → "Không có gì để áp — 50/50 file đã ở trong sổ."
```

Đo lại lúc gộp tài liệu: `select count(*) filter (where nhan_no)` trên `hub_dev` = **49**, `count(*) filter (where not nhan_no)` = **1**, `max(version)` = `0050`.

**Kiểm chứng:** `0050_so_ghi_migration_test.sql` **`plan(14)`, 14 assertion xanh**; `tests/db/migrate.test.ts` **17 ca xanh** trên ba database tự dựng tự xoá (`hub_migrate_gia_test`, `hub_migrate_tay_test`, `hub_migrate_that_test`) — gồm cả corpus GIẢ (kiểm logic) lẫn corpus THẬT 50 file (kiểm rằng logic đó đúng trên thứ sẽ chạy thật). **Thử ngược:** sửa đúng một dòng chú thích vào `0031` đã áp → `up` và `status` đều trả mã thoát **1** kèm `LỆCH BĂM` + hai băm in ra; hoàn nguyên → xanh lại. Cùng cách với: xoá file đã áp, hai file cùng số, file không có `begin;/commit;`, migration hỏng giữa chừng (không đối tượng nào ở lại, không dòng sổ nào ở lại, `ops.job_runs` ghi `failed`).

### Kho trên máy học sinh (IndexedDB) — nửa thứ hai của một lượt check-in

Một tài liệu về CSDL phải kể một kho nằm ngoài CSDL, vì lượt check-in của học sinh có **hai chỗ trú**: `attendance.checkins` trong Postgres, và IndexedDB trên máy em khi lúc bấm không có mạng. Chỗ thứ hai không có RLS, không có migration, không ai soi — nhưng nó giữ đúng thứ dữ liệu mà cả hệ này dựng ra để chăm, và **mọi lần nó mất một bản ghi thì buồng lái của thầy cô đọc khoảng trống đó thành "em ổn"**. Nợ #31 sống được nửa năm vì kho đó chưa từng có một dòng nào trong tài liệu.

| Tiền tố khoá (kho mặc định của `idb-keyval`) | Ai ghi | Nội dung | Khi nào rời đi |
|---|---|---|---|
| `hub:queued-checkin:<clientId>` | `enqueueCheckin()` khi em bấm lúc mất mạng (hoặc mạng chập chờn) | `QueuedCheckinInput` — `mood`, `wantsHelp`, `clientOccurredAt`, `clientId` (UUID v4, khoá idempotent) | `flushQueuedCheckins()` gửi được, HOẶC bản ghi bị kết luận là hỏng vĩnh viễn (chuyển sang khoá thứ hai) |
| `hub:checkin-chua-gui:<clientId>` | `flushQueuedCheckins()` khi một bản ghi **rời hàng đợi mà không đi trọn vẹn** | `FailedCheckin` — thêm `reason`, `message` (câu tiếng Việt của máy chủ), `httpStatus` | **Chỉ** khi em bấm "Đã hiểu" trên `/checkin` (`clearFailedCheckin`). Không có đường tự dọn nào khác |

**Một ngày một bản ghi.** `enqueueCheckin` tra bản cùng ngày *địa phương* (`sameLocalDay`, không đi vòng qua UTC) và **giữ nguyên `clientId` cũ** khi ghi đè. Hai bản ghi cùng ngày trong hàng đợi nghĩa là thứ tự `keys()` của IndexedDB quyết định tâm trạng nào của em sống sót — ghi đè im lặng do máy tự quyết.

Hợp đồng của `flushQueuedCheckins` — **ba đường ra, không đường nào im**:

| Kết quả lời gọi `checkin.submitMood` | Bản ghi đi đâu | Em thấy gì |
|---|---|---|
| 2xx, `moodSaved = true` | rời hàng đợi | không nói gì thêm (đúng lời hứa "tự gửi sau") |
| Lỗi **tự khỏi khi có mạng**: không có phản hồi (mạng/DNS/wifi cổng đăng nhập), 5xx, 408, 429 | **ở lại** hàng đợi, thử lại lượt sau | không nói gì (chưa có gì hỏng, mạng sẽ có lại) |
| Lỗi **hỏng y hệt lần sau**: 401, 403, 400… | rời hàng đợi, ghi `hub:checkin-chua-gui:` với `reason = loi-vinh-vien` | khối trên `/checkin`: lần bấm nào, chưa gửi được, và làm gì tiếp (gửi lại, hoặc đăng nhập lại khi 401) |
| 2xx nhưng `moodSaved = false` (`0047` — nhà em chưa có phiếu đồng ý) | rời hàng đợi, `reason = tam-trang-chua-duoc-ghi` | khối trên `/checkin`: lượt điểm danh đã vào sổ, **riêng** mức tâm trạng thì chưa, và không phải lỗi của em |

Luật phân loại nằm ở **một** hàm duy nhất — `shouldQueueOffline` trong `apps/hub/lib/offline-queue.ts`. Trước 02/08/2026 nó ở `components/checkin-view.tsx` và hàng đợi **không dùng luật nào cả** (cứ lỗi là giữ). Hai bản luật cho cùng một câu hỏi thì sớm muộn trả lời khác nhau, và chỗ lệch nằm đúng trên đường "lượt bấm của em còn hay mất".

**§9 — flush hai lần không gửi đôi.** `flushQueuedCheckins` giữ **một lượt chạy tại một thời điểm**: lượt gọi thứ hai nhận lại đúng promise của lượt đầu. Vì sao cần: `tryFlush` chạy cả lúc mở màn lẫn mỗi sự kiện `online`, mà trình duyệt bắn `online` nhiều lần khi wifi chập chờn; hai lượt chồng nhau cùng đọc hàng đợi trước khi lượt nào kịp xoá. Máy chủ idempotent theo `(student_id, occurred_on, kind)` nên không sinh dòng đôi — **đã đo bằng HTTP thật** (hai lượt `submitMood` liên tiếp trả cùng một `checkinId`, `select` ra đúng một dòng) — nhưng gửi đôi vẫn tiêu hạn mức 429 của chính em, và nó để sẵn một cái bẫy cho đường ghi không-idempotent nào ra đời sau.

Ba cái bẫy đã gặp: (1) **`vi.mock("idb-keyval", …)` KHÔNG chạy** — `idb-keyval` là phụ thuộc của `apps/hub`, pnpm không dựng liên kết ở gốc kho, nên tên trần phân giải từ `tests/unit/…` ra con số không và vitest bỏ qua **trong im lặng**; cách đúng là phân giải từ `apps/hub`, đọc `exports["."].import` (không phải `module` — `module` của gói này trỏ sang bản `compat.js` còn vite nạp `index.js`), rồi `vi.doMock` theo đường dẫn tuyệt đối. (2) **Cổng quét mã nguồn bằng `toContain` bắt cả chuỗi con** — lần thử ngược đầu tiên đổi `listFailedCheckins` thành `listFailedCheckinsXX` mà cổng vẫn xanh vì tên mới vẫn *chứa* tên cũ; phải khớp lời gọi (`/listFailedCheckins\(\)/`). (3) **Ghi dấu vết TRƯỚC, xoá khỏi hàng đợi SAU** — đảo thứ tự là mở một khe mất trắng: tab bị đóng đúng giữa hai lệnh thì bản ghi đã ra khỏi hàng đợi mà chưa có gì nói lại cho em.

### Database test tách khỏi `hub_dev`, và schema `test_meta` (nợ #41)

Gói này **không thêm migration nào**. Nó thêm đúng một đối tượng, và đối tượng đó **cố ý nằm ngoài bộ migration**:

| Đối tượng | Ở đâu | Do ai tạo | Vì sao không phải migration |
|---|---|---|---|
| schema `test_meta` + bảng `test_meta.dau_van (id, van, dung_luc)` | chỉ trong database test (`hub_test`) | `tests/helpers/chuan-bi-db-test.ts` lúc dựng database | Nó là siêu dữ liệu của **bộ kiểm thử**, không phải của trường. Nằm trong migration thì nó có mặt trên cả database vận hành, và bước "diff schema" của CI (chỉ so 9 schema nghiệp vụ) sẽ phải học cách bỏ qua nó. Để ngoài thì không ai phải học gì cả. |

`dau_van.van` là **dấu vân của hình dạng database đúng**: sha256 của (tên + nội dung mọi file trong `packages/core/db/migrations/`) cộng nội dung `packages/core/db/seed/seed.mjs`, kèm số file ở đầu chuỗi. Vân khớp ⇒ dùng lại database sẵn có (một truy vấn, 80–90 ms). Vân lệch hoặc chưa có database ⇒ **drop + create + chạy lại toàn bộ migration + gọi `seed.mjs`** (3,5 giây, một lần).

Luật đổi tên nằm ở `tests/helpers/db-test-url.ts` (`hub_dev` → `hub_test`, `TEST_DATABASE_URL` được ưu tiên nhưng **vẫn bị soát tên**), cắm vào ba chỗ: `tests/global-setup-db.ts` (một lần cho cả lượt), `tests/setup-db-url.ts` trong **từng worker** (đứng **trước** `teardown.ts` trong `setupFiles`), và đầu `tools/run-db-tests.sh` (từ chối mọi tên database không dạng `_test`). Worker phải đổi lại dù `globalSetup` đã đổi vì **biến môi trường đặt ở tiến trình chính KHÔNG chảy sang worker của vitest** — bỏ `setup-db-url.ts` đi thì database được dựng đúng mà test vẫn chạy vào `hub_dev`.

**Hàng rào gọi lại chính hàm nó đang canh thì không phải hàng rào.** Lúc 00:40 ngày 02/08, khi thử ngược cổng #41, `laTenDbTest()` được tạm cho trả `true` với mọi tên để xem cổng có đỏ không. Lớp kiểm trong `chuanBiDbTest()` gọi đúng hàm vừa bị phá nên nó gật đầu, và `drop database` chạy trên **`hub_dev`** — database mà Hub đang phục vụ. Server sống lại được (migrations + seed chạy lại ngay sau đó, `tools/start-local.sh` xác nhận 7 tệp JS tải được), nhưng **454 dòng `ops.job_runs` và mọi dữ liệu gõ tay trên máy dev thì mất hẳn**. Cách sửa đã áp: điều kiện `_test` được viết lại bằng **hằng số ngay cạnh câu lệnh nguy hiểm** — trong `dungLaiDatabase()` (trước `drop database`) và trong `setup-db-url.ts` (trước khi gán `DATABASE_URL`) — không gọi `laTenDbTest()`. Thử ngược lần ba: phá `laTenDbTest()` y như cũ, lần này chặn ở `Từ chối chạy test trên database "hub_dev"`, 0 test chạy, `hub_dev` không suy suyển.

Hai hệ quả phải ghi vì chúng đổi mẫu số của các phép đo sau: `ops.job_runs` trên `hub_dev` nay là **0 dòng** (xem `DEBT.md` #33 — đừng lấy view sức khoẻ job trên `hub_dev` làm bằng chứng nghiệm thu), và `hub_test` mà pgTAP để lại **có sẵn một cửa hậu** — fixture `000_test_support.sql` chạy ngoài transaction nên định nghĩa hàm ở lại, trong đó có `test_support.login_as()` cấp cho `public`. Nay `globalSetup` dựng lại `hub_test` từ migrations + seed trước khi vitest chạy nên cửa hậu biến mất; bước `pnpm db:seed` riêng trong CI đã bỏ vì thừa.

### Cổng tín hiệu thứ ba của bộ pgTAP (nợ #46)

`tools/run-db-tests.sh` + `tools/pgtap-plan-check.mjs` + `tools/pgtap-moc.tsv`. Ba tín hiệu, và lý do phải có đủ cả ba:

1. **`not ok`** — assertion sai. Cổng cũ đã bắt.
2. **`ran ≠ plan`** — pgTAP dừng dở giữa chừng **không in một dòng `not ok` nào**, nó chỉ ngừng in. Một bài khai `plan(40)` chết ở assertion thứ 3 trông y hệt một bài sạch nếu người đọc chỉ đếm `not ok`.
3. **Tụt so với mốc** — thứ hai tín hiệu trên *không thể* tự thấy: xoá 3 assertion rồi sửa `plan(40)`→`plan(37)` cho khớp là một lượt chạy hoàn toàn hợp lệ; và một file đổi tên khỏi khuôn `*_test.sql` thì vòng lặp còn không biết mình vừa mất một bài.

`tools/pgtap-moc.tsv` ghi **plan của từng file**, không ghi tổng (tổng che được chuyện đắp chỗ này bù chỗ kia) và không ghi số dòng `ok` (số `ok` tụt theo mọi lỗi tạm thời, một mốc dao động theo lỗi tạm thời là mốc không ai tin). Mốc là **bánh cóc**: viết thêm assertion thì mốc tự nâng và thành một diff trong PR; viết bớt thì cổng đỏ, và hạ mốc phải gõ `--cap-nhat` ra tay. Chọn thế để cổng không làm phiền người làm đúng — một cổng làm phiền mỗi lần làm đúng là một cổng sẽ bị tắt.

`tools/run-db-tests.sh` thêm `HUB_PSQL` (chạy psql qua `docker exec` — máy dev Windows không có psql trên PATH nên trước nay cổng này **chưa từng chạy được tại chỗ**), đổi `-f` thành stdin cho tương thích, thêm `HUB_TAP_KET_QUA` để giữ bảng kê từng file, và gọi cổng mốc **SAU** vòng lặp kể cả khi vòng lặp đã đỏ, để một lượt in trọn danh sách vấn đề. Cách chạy đầy đủ: `07-operations.md` RB-12.

**Đã thử ngược, cả ba đều bắt đúng bài:** chèn `select khong_co_ham_nay_dau();` vào giữa `0002_core_identity_test.sql` → `✗ 0002_core_identity_test.sql — chạy 4/8 assertion`, **0 dòng `not ok` trong output**; đổi tên file đó khỏi khuôn `*_test.sql` → vòng lặp báo `0/48 file test có lỗi` nhưng cổng mốc vẫn ĐỎ với `CÓ TRONG MỐC nhưng lượt này KHÔNG CHẠY — bài test biến mất (8 assertion)`; hạ plan `0039` 35→32 trong bảng kê → `plan TỤT 35 → 32 (mất 3 assertion)`, exit 1. Cộng hai cổng của luật đổi tên database: chĩa `run-db-tests.sh` vào `hub_dev` → `TU CHOI`, exit 2; `TEST_DATABASE_URL` trỏ vào `hub_dev` → 0 test chạy.

### Kiểm chứng của cả đợt F

| Bài | Chạy ở đâu | Số |
|---|---|---|
| `packages/core/db/tests/0049_chi_tiet_co_test.sql` | pgTAP, DB dựng lại từ đầu | `plan(20)`, 20 `ok` |
| `packages/core/db/tests/0050_so_ghi_migration_test.sql` | pgTAP, DB dựng lại từ đầu | `plan(14)`, 14 `ok` |
| `tests/db/flags-detail.test.ts` · `migrate.test.ts` | vitest, Postgres thật | 8 · 17 ca |
| `tests/unit/offline-queue.test.ts` | vitest, không cần Postgres | 10 bài, đã thử ngược từng bài |
| `tests/unit/dev-login-gate.test.ts` | vitest, không cần Postgres | 19 ca (chi tiết: `06-resilience-security.md`) |

**Toàn bộ bộ pgTAP sau đợt F, đo trên database dựng lại từ đầu: 832 assertion / 49 file, mọi file khớp `plan(N)`** (đầu đợt: 798 / 47). Từ nay con số này **kiểm được chứ không phải là một lần đo trong quá khứ** — nguồn là `tools/pgtap-moc.tsv`, và lệch với nguồn đó là CI đỏ kèm tên file.

*Các số cũ trong file này (`564` ở mục `0043`, `601` ở mục `0044`, `731`/`796` ở mục đợt E) là số của đúng thời điểm đó và cố ý giữ nguyên — chúng là hồ sơ của một lần đo.*

## Đợt G (`0051`, 02/08/2026) — hệ biết job hỏng, nhưng chưa có đường nào tới một con người

`ops.outbox_messages` (`0008`) có **bộ GHI** mà chưa có **bộ GỬI**. Đo 01/08/2026: bảng có đúng một chỗ ghi (`0039_flag_engine.sql:534`), `grep -rn "outbox" apps/ tools/ packages/core/src` ra **0 hit**, và bảng rỗng. Hệ **biết** job hỏng (`ops.v_job_health`, `ops.v_rule_health`) nhưng lời biết đó không đi đâu cả.

Sau ADR-026 chuyện này nặng hơn hẳn: buồng lái GVCN phụ thuộc **hoàn toàn** vào lượt quét đêm để có cờ cảm xúc. Engine ngủ một đêm là cô mất khả năng phát hiện sớm — và không ai được báo.

### Cột thêm vào `ops.outbox_messages`

| Cột | Kiểu | Việc |
|---|---|---|
| `status` | `text not null default 'cho_gui'` | `cho_gui` · `da_gui` · `gui_hong` · `het_luot` · `khong_co_kenh` |
| `max_attempts` | `smallint not null default 5` | hết lượt ⇒ `het_luot`, **nổi lên**, không nằm im |
| `next_attempt_at` | `timestamptz not null default now()` | giãn dần 5 phút → 10 → 20 … trần 6 giờ |
| `last_attempt_at` | `timestamptz` | lần thử gần nhất |

Ràng buộc trung tâm của cả gói: `outbox_sent_khop_chk check ((status = 'da_gui') = (sent_at is not null))`. Trước `0051`, `sent_at is null` gộp **bốn sự thật khác hẳn nhau** vào một chỗ, và nguy hiểm nhất là để "không có kênh nào để gửi" đọc thành "đã gửi" — lúc đó màn hình khẳng định đã báo cho một tin **chưa từng rời khỏi database**. Ràng buộc này biến điều đó thành lỗi Postgres chứ không phải một quy ước trong đầu người viết mã.

### Bảng, hàm, view mới

| Đối tượng | Việc |
|---|---|
| `ops.alert_channels` | Sổ khai kênh, cùng hình dạng và cùng luật với `ops.job_schedule` (`0041`): **chỉ khai kênh đã có adapter thật**. Hôm nay đúng một dòng, `tep_nhat_ky`. RLS bật, không policy, không GRANT. |
| `ops.alert_deliveries` | Bằng chứng từng lần gửi. Tách bảng chứ không thêm cột vì một tin đi qua nhiều kênh: "đã gửi" của TIN là hợp của các kênh, còn lý do hỏng thuộc về TỪNG kênh. Chỉ mục một phần `(message_id, channel_id) where status = 'da_gui'` **chính là §9 ở tầng database**. |
| `ops.kenh_cho`, `ops.co_kenh_khai_bao` | Kênh đang bật cho một đối tượng nhận; và đối tượng đó đã từng có kênh nào được khai chưa. |
| `ops.sinh_bao_dong` | Đọc `v_job_health` + `v_rule_health` rồi ghi tin. `dedup_key` mang **NGÀY** — một chuyện hỏng cả tuần ra 7 tin, không phải 168. |
| `ops.claim_bao_dong` | Nhặt tin tới lượt và **khoá** (`for update skip locked`). Phải gọi BÊN TRONG transaction; gọi ngoài là mở lại cửa "hai tiến trình cùng gửi một tin". |
| `ops.ghi_ket_qua_gui`, `ops.da_gui_qua`, `ops.ket_thuc_gui` | Ghi một lần gửi · lớp hỏi-trước · chốt trạng thái tin theo **bốn ngả tách bạch**. `khong_co_kenh` **không đốt lượt thử** — đốt thì sau 5 lượt tin mang lý do SAI "thử 5 lần đều hỏng" trong khi chưa ai từng thử. |
| `ops.v_bao_dong` | **Sổ trực** — mỗi tin một dòng kèm một câu tiếng Việt nói đúng trạng thái, không phải một mã. |
| `ops.v_bao_dong_ton` | Tin đang **mắc kẹt**, cần tay người. Ranh giới đèn chép nguyên từ `0043`: tin `khong_co_kenh` của một đối tượng **chưa từng có kênh nào** (ví dụ `care_team`) KHÔNG tính là mắc kẹt — đó là nợ hạ tầng có tên (#40). Nhưng "đã khai kênh rồi mà tắt hết" thì có người vừa tắt một đường báo động, và điều đó phải kêu. |
| `ops.v_suc_khoe_kenh` | Sức khoẻ **từng kênh**. Ra đời từ một lỗ hổng tìm được bằng thử ngược: một tin gửi được qua kênh A vẫn là `da_gui` dù kênh B hỏng, mà tin đã `da_gui` thì không bao giờ được nhặt lại — **kênh B chết trong im lặng** nếu chỉ nhìn trạng thái của tin. |

Cả ba view **không** GRANT cho `authenticated`: chúng đọc `ops.outbox_messages`, bảng đó cố ý đóng từ `0024` vì chứa nội dung bản tin. Ngày có màn hình trực thật thì mở bằng một migration riêng, có `security_invoker` và policy — đừng mở lén.

Kèm một dòng `ops.job_schedule`: `kenh_bao_dong`, kind `script`, runner `run-bao-dong.mjs`, mỗi 1 giờ, dung sai 2 giờ — khai được vì bộ chạy ra đời trong cùng commit (luật của `0041`).

**Nửa còn nợ, đừng đọc nhẹ đi:** tệp nhật ký là kênh **KÉO**. Nó không rung điện thoại ai lúc 2 giờ sáng — vẫn phải có người đi mở ra xem. Và bộ sinh báo động nằm **trong chính bộ lịch nó canh**, nên cron chết thì không tin nào được sinh, kể cả tin "cron đã chết". Không vá được từ bên trong; người canh vòng ngoài vẫn là nợ #33.

Kiểm chứng: `0051_kenh_bao_dong_test.sql` **39 assertion** + `tests/db/kenh-bao-dong.test.ts` chạy tiến trình thật và hệ tệp thật. **Toàn bộ pgTAP sau đợt G: 871 assertion / 50 file**, mọi file khớp `plan(N)`.

## Đợt H (`0052`, 02/08/2026) — sổ đăng ký Mini App rời khỏi mã nguồn

`core.embedded_apps` — App Manifest (ADR-015 mục 5) nay là một **bảng**, không còn là mảng TypeScript trong `apps/hub/server/embed/registry.ts`. Trả nợ `DEBT.md` #8.

**Cái đang thiếu, đo được 02/08/2026.** Danh sách app ngoài nằm trong mã nên ba việc đều phải qua một chu trình build: thêm app, **tắt app**, và ghi ngày rà lại. Vế thứ hai là vế nguy hiểm — app ngoài lộ dữ liệu hoặc domain hết hạn rồi bị người khác mua lại thì đường thu hồi nhanh nhất vẫn phải chờ hai dev lõi mở máy. Vế thứ ba làm một luật đã chốt (`08-embedded-apps.md` mục 5: "quá hạn không rà thì thu hồi quyền") sống trên giấy suốt từ ngày viết, vì không có chỗ nào ghi cái ngày đó.

**Bảy ràng buộc, mỗi cái chặn một ca hỏng câm** — cả bảy đã dựng dòng vi phạm và đo database từ chối (`0052_so_dang_ky_mini_app_test.sql`, 29 assertion):

| Ràng buộc | Chặn điều gì |
|---|---|
| `basket in ('xanh','vang')` | Rổ **Đỏ** không biểu diễn được — kể cả bằng psql, kể cả bằng quản trị. Mục 0 nói "không có đường xin"; đây là chỗ câu đó thành một trạng thái không tồn tại thay vì một lời dặn |
| `embedded_apps_nhung_du_bo` | Có `origin` mà thiếu `iframe_url` (khung trống) hoặc ngược lại (CSP không có gì để allowlist) |
| `embedded_apps_iframe_thuoc_origin` | `iframe_url` trỏ miền khác miền đã allowlist ⇒ CSP chặn, app trắng, không ai hiểu vì sao |
| `embedded_apps_sao_chi_cho_ro_xanh` | Rổ **Vàng** khai `allowed_event_types = {*}` — ở đó "mọi loại sự kiện" là ký một tờ giấy trắng về từng em |
| `allowed_roles <@ array[...]` | Một vai gõ sai là một hàng rào không bao giờ khớp ai |
| `origin ~ '^https://…'` (không path) | `http://` trần, và origin mang đường dẫn — cả hai làm phép so `event.origin` của postMessage trượt |
| `app_id ~ '^[a-z][a-z0-9-]…'` | Mã app đi thẳng vào `/embed/<app_id>` |

**Mặc định fail-closed:** `enabled = false`, `allowed_roles = '{}'` (mảng rỗng = **không ai** mở được). App mới quên cấp vai hỏng ngay lần bấm đầu, lúc còn người ngồi nhìn.

**Secret webhook KHÔNG vào database.** Cột `webhook_secret_env` giữ **tên biến môi trường**, không giữ giá trị. Ba lý do: bản sao lưu đi ra khỏi máy chủ (3-2-1), mọi `pg_dump` dựng môi trường dev là một lần nhân bản secret, và người có quyền đọc bảng quản trị không đồng nghĩa với người được biết secret. Màn quản trị vẫn trả lời được "app này đã cấp secret chưa" — máy chủ đọc `process.env` rồi trả về một **boolean**.

**RLS:** người đăng nhập bất kỳ đọc được app **đang bật** (trang chủ cần danh sách để dựng lưới tile); quản trị thấy cả app đang tắt và là người duy nhất ghi được.

> **Điều đo được quan trọng nhất của đợt này — RLS trên UPDATE KHÔNG ném lỗi.** Chính sách chỉ-quản-trị áp cho `update` bằng cách **lọc hàng**, không bằng cách từ chối câu lệnh. Cô giáo chạy `update core.embedded_apps set enabled = true` thì câu lệnh hợp lệ, chạy xong, đổi **0 dòng**, và Postgres im lặng tuyệt đối. `insert` thì khác — `with check` không có hàng nào để lọc nên nó ném `42501` thật. Hệ quả nằm ở tầng trên: mọi handler trong `apps/hub/server/routers/admin.ts` phải tự đọc `rowCount` và biến sự im lặng đó thành một lời từ chối, nếu không màn hình sẽ báo "đã lưu" cho một thao tác chưa từng xảy ra — với người vừa tưởng mình thu hồi xong một app đang lộ dữ liệu. `tests/db/mini-app-so-dang-ky.test.ts` (15 phép) gọi đúng procedure màn hình gọi, bằng đúng phiên của một cô giáo, rồi đòi nó **ném**.

`core.v_mini_app_can_ra_lai` — app tới hạn rà trong 30 ngày tới hoặc đã quá hạn. Máy nói cho người biết; việc thu hồi vẫn do người bấm.

**Middleware và Edge runtime.** Header CSP `frame-src` dựng trong `apps/hub/middleware.ts`, chạy trên Edge — không có `net`/`tls` nên không chạy được `pg`. Nó lấy origin qua `/api/embed/manifest` (route Node) và **fail-closed**: không hỏi được thì đặt `frame-src 'self'`, tức app ngoài không nạp. Đường kia (bỏ hẳn header khi hỏng) biến một sự cố database thành một lần gỡ allowlist trên toàn bộ `/embed/*` — đúng lúc hệ đang hỏng là lúc hàng rào biến mất. Một app không mở được thì có người kêu ngay; một allowlist bị gỡ thì không ai biết.

Cách cắm một app mới: `danh-cho-may/09-cam-mini-app.md`. Bản mẫu phía app con: `tools/mini-app-mau/index.html`.

Kiểm chứng: `0052_so_dang_ky_mini_app_test.sql` **29 assertion** + `tests/db/mini-app-so-dang-ky.test.ts` **15 phép** qua router thật. **Toàn bộ pgTAP sau đợt H: 900 assertion / 51 file**, mọi file khớp `plan(N)`.

## Đợt I (`0053`, 06/08/2026) — kết luận gửi muộn có tên người, có giờ, có lý do (ADR-029)

ADR-029 sửa ADR-007 ở **đúng một điểm**: GVCN được kết luận một check-in gửi muộn thành `absent`, nhưng chỉ khi ghi lý do, và mỗi lượt để lại một dòng sổ. Lý lẽ gốc của ADR-007 giữ nguyên — **MÁY** không được tự suy ra "vắng" từ một lần gửi muộn; cái đổi là vế **con người** nhìn thấy chỗ ngồi trống của lớp mình.

### Phép đo lật ngược giả định của chính bản giao việc

Giả định lúc nhận việc: "database đang CẤM `queued_late → absent` vì `checkins_confirm_late` (`0014`) khai `with check (status in ('present','late'))`". Đo trên hub_dev 06/08/2026, dưới đúng danh tính Cô Vân (GVCN 6A3), trên một dòng `queued_late` thật:

```
set request.jwt.claim.sub = '…0008'; set local role authenticated;
update attendance.checkins set status='absent', confirmed_by=core.current_user_id()
 where id='cd0e54e9-…' and status='queued_late';        → UPDATE 1
```

**Giả định sai.** Cửa `absent` đã mở từ `0032`: `checkins_update_by_homeroom` là PERMISSIVE, Postgres **OR** mọi policy permissive cùng lệnh, nên `with check` thật của bảng là `('present','late') ∨ (is_homeroom_of ∧ ('present','late','absent','excused')) ∨ (is_me ∧ …)`. Câu `comment on policy` của `0014` ("không tự ý sang absent") **đã sai suốt từ `0032` tới nay** — một lời hứa an toàn sống trong chú thích mà cưỡng chế thật không còn. Cùng loại bẫy `0025` đã gỡ ("app chỉ UPDATE cột mood" là niềm tin, không phải hàng rào), và là lần thứ hai phép OR của policy permissive lừa được người đọc tài liệu.

**Hệ quả cho cách đọc `0053`:** nó KHÔNG thêm quyền ghi `absent` — quyền đó đã có. Nó thêm **cái giá** của quyền đó. Trước file này, đổi một ngày chuyên cần thành "vắng" chỉ để lại đúng cột `confirmed_by`: không giờ, không lý do, không trạng thái cũ ⇒ không hậu kiểm được.

### `attendance.late_decisions` — sổ chỉ thêm

| Cột | Ghi chú |
|---|---|
| `checkin_id` → `attendance.checkins` **on delete cascade** | Lời giải thích không sống lâu hơn sự kiện nó giải thích: bản ghi điểm danh gốc bị xoá (xoá học sinh, dọn dữ liệu quá hạn) thì dòng sổ đi theo |
| `student_id` → `core.students` (§1, **NO ACTION**) | Chép lại để truy vấn sổ khỏi join ngược và để RLS của chính sổ có cột phạm vi. NO ACTION kiểm ở **cuối câu lệnh**, sau khi cascade qua `checkin_id` đã chạy ⇒ không chặn đường xoá học sinh |
| `from_status` / `to_status` | `to_status ∈ {present, late, absent}`. **Không có `excused`**: "có phép" là quyết định giấy tờ, đi đường điểm danh `0032` |
| `reason` | Bắt buộc `>= 3` ký tự **sau `btrim`** khi `to_status <> 'present'` (`late_decisions_reason_chk`) |
| `decided_by` → `core.users`, `decided_at` | Policy ghi cưỡng chế `decided_by = core.current_user_id()` — không ai ký tên người khác |
| `client_mutation_id` | §9. Unique một phần `(checkin_id, client_mutation_id) where client_mutation_id is not null` |

**RLS.** Đọc = `core.can_see_care` (GVCN của em ∪ tâm lý cụm) — học sinh, phụ huynh, giáo viên bộ môn, hiệu trưởng đọc ra **0 dòng**: đây là hồ sơ nội bộ về thao tác của giáo viên, không phải thông báo cho gia đình. Ghi = `core.is_homeroom_of ∧ decided_by = current_user_id`. **Không có policy update/delete và không cấp grant update/delete** — sửa được sổ vết thì sổ vết hết nghĩa. Không cấp cho `reporting` (§5). `backup_reader` có grant **và** policy riêng (ADR-006: bật RLS mà quên policy cho vai đó là để bản sao lưu thủng bảng **trong im lặng** — cái bẫy `0050` đã ghi).

### Policy `checkins_confirm_late` — nới vế `with check`, giữ nguyên vế `using`

```
using      (core.is_homeroom_of(student_id) and status = 'queued_late')   -- NGUYÊN VĂN 0014
with check (status in ('present', 'late', 'absent'))                      -- thêm 'absent'
```

Vế `using` là phần ADR-029 **cố ý không đụng**: chỉ GVCN của chính em, chỉ trên dòng còn `queued_late`. Chú thích cũ bị **thay** chứ không sửa chữ — một chú thích sai về an toàn nguy hiểm hơn không có chú thích.

Hai assertion của `0053` đo riêng policy này, và chúng phải **bỏ `checkins_update_by_homeroom` đi trong chính transaction của bài test** mới đo được: khi cả hai policy còn nguyên thì phép OR làm "GVCN đổi được sang absent" không chứng minh được nhánh nào cho phép.

### `attendance.decide_late_checkins(uuid[], text, text, uuid) → (updated int, skipped int)`

Đường ghi **hợp lệ duy nhất**. Đổi `attendance.checkins` và ghi `late_decisions` trong **một câu lệnh** (CTE ghi dữ liệu) — viết thành hai câu thì câu thứ hai phải chép tay điều kiện chọn dòng, và điều kiện chép tay là chỗ hai câu bắt đầu kể hai chuyện khác nhau.

- **Không `security definer`.** Hàm definer chạy bằng quyền chủ schema ⇒ bỏ qua cả RLS lẫn grant theo cột của `0025`. Hàm invoker giữ ba lớp chồng lên nhau: policy (dòng) + trigger `checkins_guard_confirmation` (cột `status`/`confirmed_by`) + `core.is_homeroom_of` viết thẳng trong `WHERE`. Điều kiện cuối **lặp lại RLS có chủ ý**: policy permissive mới thêm vào ngày mai (đúng thứ `0032` đã làm) không kéo hàm này ra khỏi phạm vi nó tự khai.
- **Ba tầng canh lý do:** Zod `.refine` (`packages/core/contracts/care.ts`) → `raise exception 22023` trong hàm → `late_decisions_reason_chk` trên bảng. Hàm **không tin tầng trên**; bảng **không tin tầng hàm**.
- **§9:** cổng sớm — có `client_mutation_id` đã nằm trong sổ thì trả `updated = 0` **êm**, không phải lỗi đỏ trên màn hình của cô. Chỉ mục duy nhất là lớp sau, bắt ca hiếm (hai transaction song song cùng mã).
- **Dòng không còn `queued_late` hoặc không thuộc lớp người gọi → `skipped`, KHÔNG ném lỗi.** Ném lỗi ở đây là dựng một kênh dò: gửi một id lạ rồi đọc thông báo lỗi để biết dòng đó có tồn tại và thuộc lớp nào. Đúng ngữ nghĩa `0014`/`0025` đã chốt cho cả bảng `attendance.checkins`.
- `skipped` đếm theo **id phân biệt**: client gửi trùng id trong một lô thì đếm theo mảng thô sẽ nói "bỏ qua 1 em" khi không em nào bị bỏ.

### Khe còn hở — đo được, KHÔNG vá trong `0053`, và vì sao viết ra thay vì im

Sổ `late_decisions` là đối trọng của quyền ghi `absent` **chỉ khi nó là đường duy nhất**. Nó chưa phải. Đo trên hub_dev sau khi `0053` đã áp, dưới đúng danh tính Cô Vân:

```
update attendance.checkins set status='absent', confirmed_by=core.current_user_id()
 where id='cd0e54e9-…' and status='queued_late';        → UPDATE 1
select count(*) from attendance.late_decisions where checkin_id='cd0e54e9-…';  → 0
```

`checkins_update_by_homeroom` (`0032`) cho GVCN sửa **mọi** dòng của lớp mình sang `present/late/absent/excused`, không phân biệt dòng đó có còn `queued_late` hay không — nên câu UPDATE thẳng vẫn đi được, **không lý do, không dòng sổ**. Nghĩa là hôm nay `decide_late_checkins` là đường ghi hợp lệ duy nhất **theo quy ước**, chưa phải theo cưỡng chế.

Không vá trong `0053` vì vá đúng chỗ này là đổi hành vi của màn "Điểm danh lớp" (`0032`) — sửa lại điểm danh đã ghi là việc hàng ngày của cô và không thuộc phạm vi ADR-029. Ba đường ra, cả ba đều cần một quyết định riêng: (a) thu `checkins_update_by_homeroom` xuống `using (status <> 'queued_late')` để hai đường không chồng nhau; (b) trigger `BEFORE UPDATE` bắt buộc mọi lượt rời `queued_late` phải đi kèm một dòng sổ; (c) chấp nhận và ghi vào `DEBT.md`. Viết ra đây thay vì im, vì một đối trọng chỉ đúng một nửa mà tài liệu kể như đúng cả là đúng cái bẫy mà chính đợt này vừa gỡ ở chú thích của `0014`.

### Kiểm chứng

`0053_ket_luan_gui_muon_test.sql` — **27 assertion**, xanh trên database dựng lại từ số không. Sáu câu hỏi của ADR-029 mỗi câu một assertion đọc được thành lời: ba trạng thái đổi được (a) · thiếu lý do → lỗi ở cả tầng hàm lẫn tầng bảng (b) · GVCN lớp khác 0 dòng (c) · học sinh 0 dòng, không có chữ ký giả (d) · gọi lại cùng `client_mutation_id` → `updated = 0` và sổ vẫn đúng một dòng (e) · dòng đã xử bị bỏ qua, lô trộn trả `1/1` (f).

**Thử ngược đã chạy thật 06/08/2026:** bỏ `late_decisions_reason_chk` ra khỏi migration, dựng lại `hub_test` từ số không, chạy lại bài → `not ok 14 — (b4) chèn thẳng vào sổ thiếu lý do` và **chỉ dòng đó đỏ** (26/27 còn xanh, vì tầng hàm vẫn ném lỗi). Cắm lại → 27/27 xanh. Nghĩa là assertion (b4) đang đo chính ràng buộc bảng chứ không đo hộ tầng hàm.

**Toàn bộ pgTAP sau đợt I: 927 assertion / 52 file**, mọi file khớp `plan(N)`, khớp mốc `tools/pgtap-moc.tsv`.

## Đợt J (`0054`, 06/08/2026) — sửa được một chữ ký ĐÃ KÝ, có cờ, có lý do, có vết (ADR-031)

Gói này là **bản sao cùng hình dạng của `0053` cho miền báo cáo**: một sổ chỉ thêm, một hàm invoker ghi sổ và đổi trạng thái trong một câu lệnh, cùng ngữ nghĩa `skipped`. Chép hình dạng là có chủ ý — hai màn của cùng một cô chủ nhiệm mà hành xử khác nhau ở cùng một thao tác (chọn hàng loạt, bấm lại, em ngoài lớp) là chỗ người dùng học sai một lần rồi mang cái sai sang màn kia.

### Phép đo: ghi đè hôm nay XOÁ TRẮNG lượt ký trước

Đo trên hub_dev 06/08/2026, dưới danh tính Cô Lan (GVCN 6A1), em Nguyễn Văn Minh, tuần `2026-08-03`, bằng đúng câu lệnh `care.approveReport` đang gửi:

```
lượt ký thứ nhất → {status: approved, reviewer_id: 4000…0001, note: null}
lượt ghi đè      → UPDATE 1 → {status: rejected, reviewer_id: 4000…0001, note: 'doi y'}
select count(*) from report.growth_report_approvals where …;   → 1
```

**Một dòng trước, một dòng sau.** Chuỗi `approved` của lượt ký đầu không còn tồn tại ở đâu trong database: `growth_report_approvals` có `unique (student_id, week_start)` (`0032`) nên một lượt ghi đè xoá **cả bốn** dữ kiện của chữ ký trước (`status`, `reviewer_id`, `reviewed_at`, `note`). Đường thoát duy nhất không cần migration là `ops.audit_log`; đo tiếp cùng phiên: `has_table_privilege('authenticated','ops.audit_log','insert')` → **false** (`0024` khai thẳng). Nghĩa là trước `0054` hệ **không có chỗ nào** ghi được "ai đổi chữ ký của ai, lúc nào, vì sao". Đường còn lại — nhét chữ "đổi từ Đã duyệt" vào ô ghi chú — bị loại: nó vẫn xoá dấu vết lượt ký đầu và không tra cứu được. **Ghi đè có vết giả tệ hơn không ghi đè.**

### `report.report_decisions` — sổ chỉ thêm

| Cột | Ghi chú |
|---|---|
| `student_id` → `core.students` (§1, **on delete cascade**) | Khác `late_decisions` (`0053`, NO ACTION) và khác có lý do: sổ đó đi theo `checkins` qua `checkin_id` nên không cần đường xoá thứ hai; sổ này không có FK nào khác về phía dữ liệu học sinh, để NO ACTION là tự biến nó thành cái chặn đường xoá một học sinh — giữ hồ sơ trẻ em quá hạn dưới tên "sổ vết" là vi phạm Luật 91/2025 chứ không phải cẩn thận |
| `week_start` | Thứ Hai của tuần, cùng đơn vị với `growth_report_approvals.week_start`. **Cố ý KHÔNG có CHECK `isodow`** ở tầng bảng — hàm canh trước bằng `22023` nói thành lời, thay vì để `growth_report_approvals_monday_chk` của `0032` ném một `23514` mang tên ràng buộc mà tầng trên phải đoán ngược |
| `from_status` / `to_status` | `to_status ∈ {approved, rejected}` (`report_decisions_to_status_chk`). `from_status` nhận thêm `pending`. **`from_status` là cả lý do tồn tại của cuốn sổ** — đó đúng là dữ kiện mà một lượt ghi đè xoá mất ở sổ duyệt |
| `reason` | Bắt buộc `>= 3` ký tự **sau `btrim`** ở mọi lượt **trừ** lượt ký đầu mang quyết định `approved` (`report_decisions_reason_chk`). Một ràng buộc gộp hai luật: ghi đè phải có lý do (ADR-031) **và** trả lại phải có lý do (luật màn hiện hành, trước file này chỉ sống trong TypeScript) |
| `decided_by` → `core.users`, `decided_at` | Policy ghi cưỡng chế `decided_by = core.current_user_id()` |
| `client_mutation_id` | §9. Unique một phần `(student_id, week_start, client_mutation_id) where client_mutation_id is not null` — khoá gồm cả `student_id` vì **một lượt bấm phủ nhiều em**: mã lượt bấm không duy nhất theo dòng, nó duy nhất theo (em, tuần) trong phạm vi một lượt bấm |

**Trả nốt một khe hở đã có tên.** `packages/core/contracts/CHANGELOG.md` (mục `care.decideReports`, ý 3) ghi: hợp đồng nhận `clientMutationId` nhưng máy chủ **không lưu**, vì `growth_report_approvals` chưa có cột chống trùng. §9 của thủ tục đó vì thế phải đứng nhờ trên khoá `(student_id, week_start)` + mệnh đề `status = 'pending'` — đủ cho ca thường, thủng đúng một ca: một lượt gửi lại tới **muộn**, sau khi ai đó đã lật dòng sang quyết định khác, rơi vào `skipped` mà không được nhận ra là bản sao. Cột + chỉ mục ở trên là chỗ trả nốt: từ nay câu hỏi "lượt này đã ghi chưa" trả lời bằng chính mã lượt bấm, không phải bằng cách suy ra từ trạng thái hiện tại của dòng.

**RLS.** Đọc = `core.can_see_care` — **đúng tập** của `growth_report_approvals_read` (`0032`). Sổ vết không được rộng hơn thứ nó ghi vết: cấp rộng hơn là để một người đọc được lịch sử quyết định về một em mà chính quyết định hiện hành thì họ không đọc được. Ghi = `core.is_homeroom_of ∧ decided_by = current_user_id`. **Không có policy update/delete và không grant update/delete.** `backup_reader` có grant + policy riêng (ADR-006).

**§5 ở đây cần một câu `revoke` tường minh, khác `0053`.** Khác biệt đo được: `reporting` bị `revoke usage on schema attendance` (`0009:274`) nên sổ của `0053` nằm ngoài tầm với ngay từ schema; còn `grant usage on schema report to reporting` (`0009:264`) **vẫn còn**, vì vai đó phải đọc các view tổng hợp trong chính schema này. Hàng rào §5 cho bảng này vì thế chỉ còn **một lớp** là quyền bảng — nên `0054` tháo tường minh (`revoke all … from reporting`) và pgTAP đo riêng một assertion cho nó.

### `report.decide_reports(uuid[], date, text, text, boolean, uuid) → (updated int, skipped int)`

Đường ghi **hợp lệ duy nhất**. Upsert `report.growth_report_approvals` và ghi `report_decisions` trong **một câu lệnh** (CTE ghi dữ liệu). Ở đây hậu quả của việc tách hai câu nặng hơn `0053`: câu thứ hai còn phải đọc lại **trạng thái cũ**, mà trạng thái cũ thì câu thứ nhất vừa xoá.

- **`p_ghi_de = false` (mặc định): hành vi hiện hành, không đổi** — chỉ chạm dòng `status = 'pending'`, đúng ngữ nghĩa `care.decideReports` đã chốt.
- **`p_ghi_de = true`:** đè được lên `approved`/`rejected`, và hàm **tự ép có lý do** (`raise … 22023`) chứ không tin tầng trên. Ép cả lượt chứ không từng dòng, vì lúc canh hàm chưa đọc dòng nào — và nó không làm hỏng ca nào: bật cờ ghi đè mà không định ghi đè gì thì cũng nên nói được vì sao mình bật.
- **Điều kiện cờ canh HAI lần, không thừa:** một lần trên ảnh chụp `truoc` (lọc nguồn), một lần trong `on conflict … where` trên giá trị **thật** của dòng. Giữa lúc chụp ảnh và lúc ghi, một transaction khác có thể đã ký xong dòng đó — ảnh chụp nói `pending`, sự thật thì không, và ca đó phải là `skipped` chứ không phải một lượt ghi đè lén.
- **CTE `truoc as materialized` là bắt buộc về ngữ nghĩa, không phải để tối ưu:** nó giữ ảnh chụp TRƯỚC và là nguồn **duy nhất** của `from_status` — `RETURNING` của một câu ghi dữ liệu chỉ đưa ra giá trị MỚI.
- **Không `security definer`**, cùng lý lẽ `0053`: RLS là toàn bộ thứ giữ cho một cô chủ nhiệm không ký lên báo cáo lớp khác. `core.is_homeroom_of` viết thẳng trong `WHERE` còn làm một việc RLS không làm được: **RLS trên INSERT ném `42501`, còn `skipped` đòi bỏ qua êm** — lọc ở nguồn là cách duy nhất để em ngoài lớp không làm cả lô đổ.
- **§9:** cổng sớm — mã lượt bấm đã nằm trong sổ thì trả `updated = 0` **êm**. Chỉ mục duy nhất là lớp sau, bắt ca hiếm (hai transaction song song cùng mã).
- `skipped` đếm theo **id phân biệt** (cũng là điều kiện chạy: Postgres từ chối `on conflict do update` chạm cùng một dòng hai lần trong một câu lệnh).

### Giới hạn thật — sổ vết KHÔNG phải bảo hiểm

Đây là sửa một thứ **đã gửi ra ngoài nhà trường**. Phụ huynh có thể đã đọc bản cũ, và hệ không có cách nào thu hồi thứ đã đọc. Sổ `report_decisions` trả lời được **"ai đổi, lúc nào, vì sao"**; nó **không** trả lời được **"phụ huynh đã đọc bản nào"**. Nguyên văn ADR-031, chép lại ở đây vì người đọc tài liệu database thường không mở ADR — và vì một hồ sơ kể sổ vết như thể nó đóng luôn được rủi ro kia là đúng loại lời hứa an toàn mà đợt `0053` vừa phải gỡ khỏi một câu chú thích.

Ngày có đường báo cho phụ huynh biết bản báo cáo đã đổi (mục "xem lại khi" của ADR-031), câu hỏi tiếp theo mới là có nên chặn sửa sau N ngày không.

### Kiểm chứng

`0054_sua_duoc_chu_ky_da_ky_test.sql` — **33 assertion**, xanh trên database dựng lại từ số không. Sáu câu hỏi của ADR-031, mỗi câu đọc được thành lời: lượt ký đầu vẫn đi như cũ và để lại một dòng sổ đủ dữ kiện (a) · không bật cờ thì **không** đè (b) · bật cờ mà thiếu lý do → lỗi ở cả tầng hàm lẫn tầng bảng (c) · bật cờ kèm lý do → đè được, sổ giữ lại `from_status` mà sổ duyệt vừa xoá (d) · GVCN lớp khác `0/1`, không ném lỗi (e) · gọi lại cùng `client_mutation_id` → sổ vẫn đúng một dòng, kể cả lượt gửi lại tới muộn có kèm cờ ghi đè (f).

**Một cái bẫy đã gặp khi viết bài test, ghi lại:** pgTAP chạy trọn một file trong MỘT transaction nên `decided_at` của mọi dòng sổ do bài sinh ra **bằng nhau**. Bản nháp đầu dùng `string_agg(… order by decided_at)` để kiểm hai dòng theo thứ tự thời gian — thứ tự đó không xác định, bài sẽ xanh/đỏ theo tâm trạng trình tối ưu. Bài hiện tại chỉ tay vào từng dòng bằng một điều kiện xác định (`from_status = 'approved'`) và đếm số dòng riêng. Cùng họ với cái bẫy "bộ test bịa được lịch sử chạy máy" (nợ #41).

**Thử ngược đã chạy thật 06/08/2026:** thay `report_decisions_reason_chk` bằng `check (true)`, dựng lại một database từ số không, chạy lại → `not ok 18 — (c4)` và `not ok 19 — (c5)`, **chỉ hai dòng đó đỏ** (31/33 còn xanh, vì tầng hàm vẫn ném lỗi). Cắm lại → 33/33 xanh. Nghĩa là (c4)/(c5) đang đo chính ràng buộc bảng chứ không đo hộ tầng hàm.

**Đo lại trên hub_dev sau khi áp**, dưới danh tính Cô Lan, cùng em và cùng tuần của phép đo đầu mục: lượt ký đầu `{updated: 1, skipped: 0}` → đổi mà **không** bật cờ `{0, 1}` → đổi **có** bật cờ `{1, 0}`; sổ duyệt còn một dòng `rejected`, còn sổ vết có **hai** dòng — `pending→approved` (không lý do) và `approved→rejected|Thieu phan nhan xet`, cùng `decided_by`. Đúng dữ kiện mà phép đo đầu mục cho thấy đã bốc hơi.

**Toàn bộ pgTAP sau đợt J: 960 assertion / 53 file**, mọi file khớp `plan(N)`, khớp mốc `tools/pgtap-moc.tsv`.

## Đợt K (`0055`, 07/08/2026) — đăng ký SSO rời khỏi mã nguồn (ADR-032)

Gói này làm cho miền **đăng nhập** đúng việc mà `0052` đã làm cho miền **nhúng**: gỡ một danh sách khỏi mảng TypeScript, đưa vào bảng, và nhờ thế biến một lần deploy thành một cái công tắc.

**Phép đo mở đầu (06/08/2026, trên bản đang chạy, bằng chính API của `/quan-tri/mini-app`).** Khai một app thử (`tin-truong`), cấp vai, bật:

| Đường | Kết quả |
|---|---|
| `/embed/tin-truong` | **404** khi tắt → **200** khi bật. Nhúng chạy, không deploy |
| Tile trên lưới trang chủ | Hiện đúng vai |
| `POST /api/embed/webhook` sai secret | **401** |
| SSO | **Không có gì** — khai app không sinh ra client OIDC nào |

**Vế nguy hiểm không phải "thêm app phải deploy" mà là "thu hồi cũng phải deploy".** Trước `0055`, tắt một app trong sổ cắt nhúng và webhook, nhưng client OIDC vẫn sống trong `apps/hub/server/oidc/clients.ts` và vẫn đổi được `authorization_code` lấy token. Công tắc thu hồi thu hồi được **hai phần ba**, và không chỗ nào trong hệ nói ra điều đó.

### Năm cột, một khung nhìn, một hàm — trên chính `core.embedded_apps`

**Không thêm bảng `core.oidc_clients`.** Mini App và RP không phải hai thực thể: Factory là cùng một app, nhúng bằng iframe **và** đăng nhập bằng tài khoản Hub. Hai bảng nghĩa là hai sổ cho một app, hai ngày rà lại, hai người chịu trách nhiệm, và một ngày có người tắt bảng này mà quên bảng kia. **`client_id` chính là `app_id`** — ràng buộc mạnh nhất có thể có cho việc đó, vì nó không phải hai cột nên không thể lệch.

| Đối tượng | Vai trò |
|---|---|
| `sso_enabled` | Công tắc RIÊNG, không suy ra từ `enabled`. Có app nhúng mà không cần đăng nhập (trang tin), có app đăng nhập mà không nhúng (Đường A). Suy ra thì mọi app nhúng tự nhiên thành RP xin được token — cấp quyền bằng cách quên không khai |
| `sso_redirect_uris text[]` | So khớp tuyệt đối theo OIDC. **Không** chứa `/embed/relay`: URI đó thuộc về Hub, `clients.ts` tự thêm từ `HUB_URL` cho app có nhúng — nạp vào bảng là ghi cứng một tên miền của chính mình vào dữ liệu |
| `sso_backchannel_logout_uri` | ADR-016 "thoát Hub = thoát mọi RP" dựa vào cột này |
| `sso_scopes text[]` | Bốn scope `provider.ts` công bố, bắt buộc có `openid` |
| `sso_client_secret_env` | **TÊN** biến môi trường, không phải giá trị — y hệt `webhook_secret_env`. Ba lý do ở đầu `0052` không đổi một chữ khi đối tượng là secret OIDC: bản sao lưu đi ra khỏi máy chủ, `pg_dump` nhân bản secret thật, người được đọc bảng quản trị ≠ người được biết secret |
| `core.v_oidc_clients` (view) | Phép lọc `enabled and sso_enabled` nằm ở **đúng một chỗ**. Đây chính là chỗ vế nguy hiểm ở trên hỏng lần trước: một tầng quên một điều kiện thì app đã thu hồi vẫn cấp được token |
| `core.moi_uri_la_https(text[])` (immutable) | CHECK trong Postgres **không nhận subquery**, mà điều cần kiểm là "mọi phần tử của mảng đều thoả" — thứ chỉ viết được bằng `unnest`. Bọc vào hàm là đường duy nhất còn lại, và hai ràng buộc dùng chung một định nghĩa "URI hợp lệ" nên chúng không thể lệch nhau về sau |

**Năm ràng buộc, mỗi cái chặn một ca hỏng câm** (`0055_khai_sso_ngay_trong_so_test.sql`, 39 assertion — cả năm đều dựng dòng vi phạm và đo database từ chối):

| Ràng buộc | Ca nó chặn |
|---|---|
| `embedded_apps_sso_du_bo` | Bật SSO mà thiếu redirect_uri hoặc thiếu tên biến secret → client dựng lên hỏng câm; RP nhận `invalid_client` / `redirect_uri mismatch`, hai câu lỗi không nói được rằng nguyên nhân là một ô bỏ trống trên màn quản trị |
| `embedded_apps_sso_redirect_https` | `http://` (authorization_code đi qua đường không mã hoá) và `#` (fragment — OIDC Core 3.1.2.1). Đo trên **từng phần tử**: một URI hỏng lẫn giữa hai URI tốt vẫn bị chặn |
| `embedded_apps_sso_backchannel_https` | `logout_token` là JWT ký — không gửi qua đường trần |
| `embedded_apps_sso_secret_env_hoa` | Tên biến sai khuôn |
| `embedded_apps_sso_scope_biet_truoc` | Scope provider không biết. oidc-provider **im lặng bỏ qua** scope lạ: RP xin `hub_profil` (thiếu chữ e) vẫn đăng nhập được nhưng không bao giờ nhận được vai |

### Chuyển Factory một-đổi-một

Cùng nguyên tắc mục 5 của `0052`: bảng thay một mảng đang có nội dung cụ thể, nên bước chuyển phải là một-đổi-một — sai một ký tự là Factory mất đăng nhập. Bốn assertion đối chiếu đúng bốn dòng đang nằm trong `clients.ts` trước gói này (redirect_uri, backchannel, tên biến secret, scope `{openid, profile}`). `test-external-app` **không** nạp — nó ở sau hàng rào `NODE_ENV` và secret ghi trần trong kho; chỗ đúng của nó vẫn là mã nguồn.

### Một siết chặt thật, ghi ra để không ai tưởng là dọn dẹp

`OidcClientConfig.scopes` trước nay được khai rồi **không bao giờ truyền xuống thư viện** — dòng chú thích "chỉ cho phép khai `hub_profile` nếu app thật sự cần vai trò" mô tả một hàng rào **chưa từng tồn tại**: mọi RP xin được cả bốn scope, kể cả `hub_profile` (vai + cơ sở + lớp) và `offline_access`. Từ `0055` nó đi xuống thật, và RP xin ngoài danh sách nhận `invalid_scope` tại `/oidc/auth`. Đây có thể làm gãy một RP đang xin nhiều hơn phần đã khai — nên nó nằm ở đây thay vì trong một dòng chú thích. Cái giá của việc siết nhầm nay là **một ô tích trên màn quản trị**, không phải một lần deploy: đó chính là thứ gói này mua được.

### Kiểm chứng

`0055_khai_sso_ngay_trong_so_test.sql` — **39 assertion**, xanh trên database dựng lại từ số không. Bài chính là mục 4: dựng đủ **ba** loại app (bật+SSO · tắt+SSO · bật+không SSO) rồi đòi `v_oidc_clients` chỉ chứa loại thứ nhất — hai loại sau là hai kiểu "không được cấp token" khác nhau, và nhầm loại nào cũng là một cánh cửa mở. Mỗi phủ định có một mẫu số đứng trước (`>= 1` dòng của từng loại), theo đúng luật tự áp của `0052`.

**Một sai đã bắt được ngay lượt chạy đầu, giữ lại vì nó nói đúng điều màn quản trị phải nói:** bản nháp khai `sso-du-bo` với `sso_enabled = true` rồi kiểm nó có mặt trong `v_oidc_clients` → **đỏ**. Không phải lỗi của view: `enabled` mặc định `false` (`0052`), nên **"khai xong" không bao giờ đồng nghĩa với "đang chạy"**.

**Toàn bộ pgTAP sau đợt K: 999 assertion / 54 file**, mọi file khớp `plan(N)`, khớp mốc `tools/pgtap-moc.tsv`.

## Đợt L (`0056`, 08/08/2026) — thư về đúng hồ sơ từng em, và có người đọc (ADR-033)

Chủ đầu tư hỏi: *"các app mini nhúng vào bây giờ đổ dữ liệu của app về hết được chưa"*. Đợt K trả lời được câu "app nối vào được chưa"; đợt này trả lời câu **dữ liệu có về tới nơi không**.

**Phép đo mở đầu (08/08/2026, một Mini App thử gửi sự kiện thật qua đường hầm công khai):**

| Đo | Kết quả |
|---|---|
| `POST /api/embed/webhook` | `{"ok":true,"status":"promoted"}` |
| Gửi lại y hệt | `already_promoted`, vẫn **đúng một dòng** |
| Loại sự kiện chưa khai | **403** |
| Secret sai | **401** |

Mọi van an toàn đóng đúng. Nhưng dữ liệu hạ cánh thế này — và đó là chỗ hai khớp cuối còn hở:

```
ops.embedded_app_events
app_id | event_type      | payload
do-thu | ket_qua_the_luc | {"alias":"…","chay_30m":"5.8s","bat_xa":"1.6m"}
```

| Khớp hở | Đo được |
|---|---|
| **(a) Không cột nào nối về học sinh** | Mã em nằm CHÌM trong JSON. `promote_embedded_event` có đúng MỘT nhánh giải alias — `dear_log`. Không ai hỏi được "kết quả thể lực của em Minh cả năm" dù dữ liệu đã trong kho |
| **(b) Không vai nào đọc được** | `has_table_privilege` cho `authenticated` · `connector` · `reporting` đều **false**. Bảng là kho chỉ ghi vào: không màn hình, không báo cáo. Dữ liệu về mà không ai đọc thì gần như chưa về |

### Vì sao KHÔNG tách sang NoSQL — câu hỏi đã được đặt ra và đã trả lời bằng phép đo

Chủ đầu tư hỏi thẳng *"nếu dữ liệu phân tán thì làm NoSQL thì sao?"*. Đo trước khi trả lời: kho **đã có 19 cột `jsonb` và 16 chỉ mục GIN** — mô hình tài liệu vốn đang chạy ở đây, và chính sự kiện thể lực ở trên hạ cánh nguyên si không cần khai lược đồ nào.

Hai khớp hở **không phải vấn đề lược đồ**: một cái là nối khoá ngoại, một cái là phân quyền. Cả hai đều **khó hơn** khi tách kho — mất FK do máy canh (thành quy ước tầng ứng dụng, đúng loại hỏng câm mà `DEBT.md` đầy rẫy); toàn bộ RLS (`can_see_student`, `can_read_mood`, cụm/lớp) phải viết lại bằng tay trong mọi truy vấn; và xoá theo Luật 91/2025 từ **một transaction** thành xoá phân tán không transaction, khiến câu *"đã xoá hết chưa"* thành câu không trả lời chắc được. Quy mô cũng chưa tới ngưỡng xét lại của ADR-001 (5.000 user / 300.000 req/ngày so với >10.000 / >1.000.000).

**Ranh giới đúng không phải SQL/NoSQL mà là trường nào được NHẤC LÊN thành cột.** File này nhấc đúng ba thứ mọi sự kiện đều cần — em nào · loại gì · lúc nào — phần còn lại ở lại trong `payload`. Đó chính là thiết kế `staging → promote` đã có sẵn, dùng đúng việc nó sinh ra để làm.

### Bốn mảnh

| Đối tượng | Vai trò |
|---|---|
| `ops.embedded_app_events.student_id` | FK `core.students`, **on delete cascade**. NULL = sự kiện không gắn em nào (thực đơn tuần) — hợp lệ. Cascade vì giữ hồ sơ trẻ em quá hạn dưới tên "dữ liệu app" là vi phạm Luật 91/2025, không phải cẩn thận |
| `core.promote_embedded_event` (sửa) | Giải `payload.alias` → `student_id` cho **mọi** loại sự kiện. Nhánh `dear_log` giữ nguyên từng chữ — trộn hai việc vào một migration là không ai đối chiếu được về sau |
| `ops.tg_su_kien_ro_xanh_khong_gan_em` | Rổ Xanh **không gắn được tên em**, kể cả ghi thẳng vào bảng không qua `promote`. Trigger chứ không CHECK vì điều kiện phải tra sang `core.embedded_apps`. Đây là chỗ lời hứa "rổ Xanh = không định danh" thành máy từ chối thay vì thành một dòng người ta đọc rồi quên (nợ #55 vừa dạy đúng bài này) |
| `ops.v_mini_app_da_nhan` | `security_invoker` — app nào gửi loại gì, bao nhiêu, cho bao nhiêu em, lần cuối lúc nào. Quên `security_invoker` là view vượt mặt chính RLS vừa dựng, đúng lỗi `0024` đã phải vá một lượt cho các view của `report` |

**`alias` KHÔNG phải `external_id`.** Hai mã hai việc: `external_id` là mã của **sự kiện** (chống ghi trùng, phải khác nhau giữa hai lần gửi); `alias` là mã của **em** (dùng đi dùng lại, giống nhau qua mọi sự kiện của em đó). Gộp hai vai vào một trường là mỗi em chỉ gửi được đúng một sự kiện trong đời. Alias do Hub sinh, app xin qua `POST /api/embed/alias` — endpoint này **đã tồn tại từ ADR-017 nhưng chưa từng được viết vào bản yêu cầu gửi đội làm app**, nên một app rổ Vàng đọc tài liệu đó sẽ không biết cách gọi tên một em. Đã bổ sung cùng đợt (`ban-yeu-cau.md` mục 4.2).

**Alias không giải được thì vào hàng đợi lỗi, KHÔNG lưu null.** App gửi mã Hub không nhận ra là một lỗi thật — app tự bịa mã, hoặc dùng alias của app khác (mỗi app một dải riêng), hoặc em đã rời trường. Lưu null thì dòng ấy trông y hệt một sự kiện không gắn em nào, và từ đó không ai còn cách nào phân biệt.

### Ai đọc được — quyết định của chủ đầu tư, và hai chốt đi kèm

Được đưa ba lựa chọn, chủ đầu tư **chọn rộng nhất: thêm cả phụ huynh và học sinh**, sau khi đã được nói trước rằng đó là lựa chọn dễ lộ nhất nếu app con gửi nhầm thứ không nên gửi. Chính sách thi hành đúng quyết định đó, với hai điều kiện AND nhau:

- **CHỐT 1** — `core.can_see_student(student_id)`, đúng hàm `evidence.dear_logs` đang dùng. Phụ huynh thấy con mình, không thấy danh sách lớp.
- **CHỐT 2** — app phải `enabled` **và** `allowed_roles` chứa vai của chính người đang đọc. Từ nay `allowed_roles` là **trần của quyền đọc dữ liệu app đó**, không chỉ quyền bấm vào tile.

Chốt 2 là chỗ đáng đọc kỹ: `can_see_student` là hợp của sáu nhánh, **rộng hơn** danh sách chủ đầu tư nêu (gồm cả giáo viên bộ môn đang dạy em và hiệu trưởng). Bắt nó AND với `allowed_roles` biến câu "ai đọc được dữ liệu app này" thành một ô tích trên màn quản trị — nhà trường quyết, cho từng app, đổi trong mười giây không cần deploy. `0056` có một assertion riêng chứng minh chốt 2 **gánh việc thật**: thầy giáo bộ môn `can_see_student` em Minh nhưng đọc ra **0 dòng** vì app không mở cho vai `teacher`.

**Supersede một quyết định cũ, ghi rõ thay vì xoá:** `0024` từng đòi người đăng nhập chạm bảng này là `42501` (deny-by-default vì payload tự do từ app ngoài). Nay hàng rào chuyển từ tầng GRANT sang tầng RLS. Phép kiểm trong `0024_rls_gaps_test.sql` được viết lại **chặt hơn** bản cũ: bản cũ chỉ chứng minh "không có quyền bảng"; bản mới chứng minh **có quyền bảng mà vẫn 0 dòng** ngoài phần của mình — tức đo đúng hàng rào đang thật sự gánh việc.

### Kiểm chứng

`0056_thu_ve_dung_ho_so_tung_em_test.sql` — **34 assertion**, xanh trên database dựng lại từ số không. Đi qua đúng đường webhook đi (`ingest` → `promote`), không insert thẳng vào bảng đích. Các ca đáng kể: alias của app **khác** bị từ chối (hai app không ghép được dữ liệu em) · app rổ Xanh gửi kèm alias bị chặn **cả qua `promote` lẫn ghi thẳng** · tắt app là **cắt luôn đường đọc** · xoá em thì dữ liệu app đi theo.

**Toàn bộ pgTAP sau đợt L: 1.034 assertion / 55 file**, khớp mốc.

## Đợt M (`0057`, 08/08/2026) — một chuỗi cho cả đường đăng nhập

Nới đúng MỘT vế của `embedded_apps_sso_du_bo`: bỏ `sso_client_secret_env IS NOT NULL`, giữ `cardinality(sso_redirect_uris) >= 1`.

**Vì sao.** Chủ đầu tư quyết hai lượt trong cùng buổi: *"mặc định chuỗi là vietanh2026, cho mọi app"* → rồi khi được nêu rủi ro của việc gộp nốt đường đăng nhập: *"gộp đi"*. Ràng buộc cũ đúng khi mỗi app một khoá — khai SSO mà không nói lấy khoá ở đâu thì client dựng lên hỏng câm. Nay `NULL` mang một nghĩa **rõ ràng và hợp lệ**: *dùng chuỗi chung của trường*, và đó là đường **mặc định** của mọi app mới. Giữ nguyên ràng buộc là cấm đúng cái đường mặc định.

**Đổi lấy gì, đo được:** khai một app mới nay **không còn bước nào chạm vào máy chủ**. Trước `0057` còn đúng một bước (đặt `OIDC_CLIENT_SECRET_<APP>` rồi khởi động lại), và đó là bước duy nhất giữa "dán phiếu" và "app chạy đủ ba đường". Đo trọn vòng với app mới sau khi áp: dán phiếu → cấp vai → bật → **nhúng 200 · webhook `promoted` (dữ liệu vào đúng hồ sơ em Minh) · đăng nhập 303**, thẻ app hiện *"Sẵn sàng — không còn việc nào"*.

**Mất gì — nói bằng phép đo, không bằng lời doạ.** KHÔNG mất: người biết chuỗi vẫn không tự chế được token, vì hai hàng rào còn nguyên và cả hai không đụng `client_secret` — **PKCE bắt buộc** (đo lại sau khi gộp: thiếu `code_challenge` → `error=invalid_request`) và **`redirect_uri` khớp tuyệt đối** (đo: URI lạ → `invalid_redirect_uri`). MẤT: ranh giới giữa các app ở tầng xác thực client — đội làm app A cầm luôn chìa của app B; ai có chuỗi thì gọi được `/oidc/token/revocation` dưới danh nghĩa app bất kỳ, tức **thu hồi được token của app khác** (quấy rối, không đọc được dữ liệu); và xoay chuỗi phải xoay **đồng loạt** cho mọi app. Điều kiện thoát ở `DEBT.md` #65 — cùng mốc #19 và #63, trước ngày nạp danh sách học sinh thật.

**Ranh giới ở tầng nạp là LỜI KHAI, không phải giá trị** (`oidc/clients.ts`, chép đúng ngữ nghĩa của `embed/registry-db.ts` để hai cửa của cùng một hệ không hành xử khác nhau): app **không** khai biến riêng → chuỗi chung; app **có** khai → bắt buộc đúng biến đó, chưa đặt thì **không nạp client**. Vế sau giữ cho một app được cấp khoá riêng — vì cần mạnh hơn hoặc cần thu hồi riêng — không lặng lẽ tụt xuống chạy bằng chuỗi ai cũng đoán được.

**Factory chuyển cùng lượt**, một-đổi-một. Để nó ở khoá riêng trong khi mọi app sau dùng chuỗi chung là để lại đúng một ngoại lệ mà sáu tháng nữa không ai nhớ vì sao nó ngoại lệ.

**Kiểm chứng.** `0057_mot_chuoi_cho_ca_dang_nhap_test.sql` — **8 assertion**, khẳng định **cả hai chiều** vì nới một ràng buộc là việc dễ nới quá tay: vế bị bỏ thì thật sự hết chặn, vế phải giữ (`redirect_uris >= 1`, tên biến viết HOA) thì vẫn chặn, khoá riêng vẫn khai được, và Factory **vẫn có mặt** trong `core.v_oidc_clients` — `NULL` không được làm hàng biến mất khỏi danh sách RP, nếu không thì "chuyển sang chuỗi chung" thành "mất đăng nhập". Một assertion của `0055` đổi theo và **ghi rõ là bị supersede**, không sửa lặng.

**Toàn bộ pgTAP sau đợt M: 1.043 assertion / 56 file**, khớp mốc.

## Quy tắc migration (§2)

- Mọi thay đổi qua file trong `packages/core/db/migrations/`, đặt tên `NNNN_mo_ta.sql`. **Số phải duy nhất** — `tools/schema-lint.mjs` chặn trùng số từ 31/07/2026, sau khi trùng số xảy ra thật trong một phiên có nhiều agent làm song song (hai file cùng mang `0030`). Trước khi đặt tên file, `ls` thư mục migration một lần: "số trống" ghi trong một bản giao việc có thể đã bị lấp trong lúc bạn đọc nó.
- **Đã có bộ chạy migration và sổ ghi migration đã chạy từ 02/08/2026** (`0050` + `tools/migrate/migrate.mjs`, trả nợ `DEBT.md` #23): áp lên database đang sống bằng `node tools/migrate/migrate.mjs up`, hỏi trạng thái bằng `status` (mã thoát 1 khi lệch băm hoặc mất file). Database đã sống trước khi có sổ thì **phải `baseline --to=NNNN` trước** — `up` tự từ chối và chỉ đường. Chi tiết ở mục đợt F phía trên. Các con số kiểm chứng của những đợt trước 02/08 vẫn là số đo trên database dựng lại từ đầu, vì lúc đó không có đường nào khác.
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
