---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 15
---

# Database — một PostgreSQL, schema theo domain, Core Data Model là Single Source of Truth

## Nguyên tắc nền tảng (ADR-011)

Dữ liệu lõi (người dùng, học sinh, giáo viên, phụ huynh, cơ sở, lớp, vai trò, quyền) **chỉ tồn tại một bản duy nhất trong `core`**. Mỗi Mini App có schema riêng, chỉ chứa dữ liệu nghiệp vụ của nó, và tham chiếu core bằng khóa ngoại. **Không bao giờ có `finance.students`, `attendance.students`** — thấy bảng như vậy trong PR là lỗi chặn merge.

## Schemas

| Schema | Loại | Bảng chính |
|---|---|---|
| `core` | **Nền tảng — SSOT** | `users`, `students`, `teachers`, `parents`, `schools` (cơ sở), `classes`, `class_assignments`, `enrollments`, `roles`, `permissions`, `id_mappings`, `identity_links`, `school_networks`, `parent_invite_codes` |
| `attendance` | Mini App | `checkins` (mood + điểm danh — dữ liệu cảm xúc lưu như dữ liệu thường, ADR-002), `checkin_rules` (khung giờ theo cơ sở), `help_requests` |
| `care` | Mini App (lõi) | `flags`, `care_cases`, `interventions`, `thresholds`, `escalations`, `counselor_notes` |
| `health` | Mini App (lõi) | `logs` (y tế bán trú — ADR-009), `meal_sleep_logs` |
| `evidence` | Mini App | `value_behaviors` (25 hành vi), `event_roles`, `pdr_reflections`, `dear_logs`, `rubric_scores`, `fitness_tests`, `club_attendance`, `survey_responses` |
| `tutor` | Mini App | `mastery_snapshots`, `cefr_results`, `cefr_trajectories`, `milestones`, `moodle_progress`; tương lai: `courses`, `lessons` |
| `finance` | Mini App (đặt chỗ) | `invoices`, `payments` — chưa xây, chỉ giữ tên miền dữ liệu |
| `social` | Mini App (đặt chỗ) | `posts`, `comments` — chưa xây |
| `ai` | Mini App (đặt chỗ) | `conversations`, `prompts` — chưa xây; mọi lời gọi model vẫn qua pii-stripper (§7) |
| `staging` | Nền tảng | `raw_tutor_events`, `raw_moodle`, `raw_cor_imports`, `raw_embedded_events` (webhook từ Mini App nhúng ngoài, ADR-015), `import_errors` |
| `ops` | Nền tảng | `job_runs`, `heartbeats`, `outbox_messages`, `source_freshness` |
| `report` | Nền tảng | `v_campus_trends`, `v_vaar_indicators`, `v_cohort_mastery`, `mv_growth_reports` |

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
- `pg_cron` job xóa chi tiết mood >12 tháng (giữ aggregate `attendance.mood_trends`) — lời hứa công khai, có test.
- Báo cáo học thuật/xếp loại không dùng dữ liệu cảm xúc (§5).
- Tái xác nhận 23/07/2026: điểm lệch với bản FINAL 15/07 (mô tả "kho riêng, mã hóa") đã chốt theo ADR-002 — không kho riêng, không mã hóa. Còn lại là tu chính văn bản Hiến chương điều 3, không phải quyết định kỹ thuật còn mở.

## Ma trận RLS — mỗi ô một policy, mỗi policy một pgTAP test

| Dữ liệu ↓ / Role → | student | guardian | teacher | homeroom | counselor | principal | board |
|---|---|---|---|---|---|---|---|
| core / tutor / evidence / attendance | own | children | assigned classes | homeroom class | cluster | campus | aggregate-only |
| care.flags + interventions | — | — | own-created | homeroom class | cluster | count-only* | count-only |
| health.logs (y tế) | — | children | **—** | homeroom | cluster | — | — |
| care.counselor_notes | — | — | — | homeroom | cluster | — | — |
| report (ẩn danh) | — | — | — | own class | cluster | campus | all |
| care.thresholds | read | read | read | read | read+propose | read | write (qua Hội đồng DL) |

*Hiệu trưởng chủ trì care team: xem danh sách ca qua màn hình care team có audit log, không có quyền tra cứu tự do.

**Nghĩa vụ test:** mỗi policy có pgTAP test khẳng định cả chiều cho phép lẫn chiều từ chối. PR thêm bảng mới thiếu policy + test → CI fail.

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
| `core.v_my_homeroom_teacher` bỏ hậu tố `"(GVCN 6A1)"` khỏi tên | `0022_homeroom_teacher_name_clean.sql` | Phát hiện khi chạy thật V5/V9: fixture đặt tên kiểu "Cô Lan (GVCN 6A1)" để phân biệt tài khoản thử ở màn đăng nhập — đúng chỗ đó nhưng đọc kỳ khi ghép câu ("gửi riêng cho Cô Lan (GVCN 6A1)"). Sửa một chỗ ở view, không lặp regex ở từng màn hình. |

Các migration `0013`–`0022` đều phụ thuộc baseline `0001`–`0009` — xem `packages/core/db/migrations/README.md`.

## Quy tắc migration (§2)

- Mọi thay đổi qua file trong `packages/core/db/migrations/`, đặt tên `NNNN_mo_ta.sql`.
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
