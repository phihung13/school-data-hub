---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 9
---

# RULES — 10 điều khoản hợp đồng kiến trúc (luật cứng, máy cưỡng chế)

> Mọi Claude/dev/agent làm việc trong hệ này PHẢI đọc file này trước khi viết code. Vi phạm = CI chặn merge. Đề nghị đổi luật → `templates/adr.md`, không tranh luận trong PR.

## §1 — Một mã học sinh

Mọi bảng dữ liệu học sinh ở mọi schema FK về `core.students.id` (UUID). Mã hiển thị `student_code` (vd `VA-2026-00417`) duy nhất, bất biến 12 năm. Không bảng nào lưu tên/mã tự chế.
**Cưỡng chế:** schema-lint trong CI quét mọi migration — bảng mới có dữ liệu học sinh mà thiếu FK là fail.

## §2 — Schema chỉ đổi qua migration được review

Cấm sửa tay trên Supabase dashboard ở staging/prod.
**Cưỡng chế:** job đêm diff schema thực tế với migration files; lệch là báo động đỏ.

## §3 — Dữ liệu cảm xúc lưu như dữ liệu thường

Quyết định Chủ tịch 19/07 (tái khẳng định): KHÔNG mã hóa, KHÔNG schema khóa riêng. check-in cảm xúc nằm trong `attendance.checkins`; `counselor_notes` nằm trong `care` (cùng mức với ghi chú can thiệp). Phân quyền theo ma trận chung trong `02-database.md`. Giữ hai lời hứa công khai của trường: báo cáo học thuật/xếp loại không dùng dữ liệu cảm xúc (§5) và chi tiết tự xóa sau 12 tháng (job có test).
**Cưỡng chế:** pgTAP ma trận chung + test job xóa 12 tháng. ADR-002: Duyệt, tái xác nhận 23/07/2026; hành động kèm còn lại chỉ là văn bản: tu chính Hiến chương điều 3 (không còn là quyết định kỹ thuật mở).

## §4 — Không service_role ở client

PWA/web chỉ đi qua tRPC + RLS. Secret chỉ tồn tại trong env server.
**Cưỡng chế:** CI quét bundle client tìm pattern khóa.

## §5 — Tường lửa chăm sóc / đánh giá

Mọi bộ sinh báo cáo học thuật/xếp loại không được dùng dữ liệu cảm xúc (`attendance.checkins`, `care.counselor_notes`, `evidence.survey_responses`).
**Cưỡng chế:** pgTAP trên quyền của role `reporting`; review bắt buộc với mọi view mới trong `report`.

## §6 — Ngưỡng cờ nằm trong config

Không số ngưỡng nào hard-code trong flag engine — đọc từ `care.thresholds`.
**Cưỡng chế:** test khẳng định engine đọc ngưỡng từ bảng; review checklist.

## §7 — PII stripper trước mọi AI API

Mọi lời gọi model ngoài đi qua wrapper duy nhất `packages/core/pii-stripper/` (tên → mã, xóa SĐT/địa chỉ). Import SDK AI ở nơi khác là lỗi lint.
**Cưỡng chế:** lint rule + bộ eval ~30 ca mẫu chạy trong CI.

## §8 — Connector chỉ ghi staging

Đường vào các schema nghiệp vụ duy nhất là job `promote()` có validate. Bản ghi không map được mã học sinh → `staging.import_errors`, chờ người xử — không tự đoán.
**Cưỡng chế:** role DB của connector chỉ có INSERT trên `staging`.

## §9 — Mọi mutation idempotent

Gọi 2 lần cho cùng kết quả (unique constraint + upsert). Double-tap, retry mạng không sinh bản ghi đôi. **Áp dụng cho MỌI đường ghi, người và máy:** `promote()` upsert theo `(source, external_id)`; flag engine theo `(student_id, rule_code, as_of_date)`; bản tin Zalo qua outbox `dedup_key`.
**Cưỡng chế:** contract test bắn mỗi mutation 2 lần trong CI; test chạy lại engine/promote là no-op.

## §10 — Vùng lõi cần 2 chữ ký

PR chạm `packages/core/**` bắt buộc approve của cả 2 dev chính. Vibe team (và vibe-agent) không có quyền merge vào đó.
**Cưỡng chế:** CODEOWNERS + branch protection.

---

## Phân quyền agent

| Agent | Phạm vi được sửa | Cấm tuyệt đối |
|---|---|---|
| dev-agent | toàn repo | vi phạm §1–§10 |
| vibe-agent | `apps/fitness`, `apps/hub-web` (UI), form, dashboard, nội dung | `packages/core/**`, migrations, `RULES.md`, `.github/` |
| ba-agent | `danh-cho-may/srs/`, `danh-cho-nguoi/` (đề xuất) | mọi code |
| qa-agent | `danh-cho-may/test-plans/` | sửa code (chỉ đọc + chạy test) |
| pm-agent | `danh-cho-may/tien-do.md` | mọi code, mọi luật |
| security-agent | báo cáo audit | sửa bất cứ gì (chỉ đọc) |

## Checklist PR (mọi agent tự chạy trước khi kết thúc)

- [ ] Không vi phạm §1–§10
- [ ] `node tools/check-sync.mjs` pass (đã sửa cả bản người nếu đổi nội dung có cặp)
- [ ] Migration kèm cập nhật `02-database.md`
- [ ] Mutation mới có test idempotency
- [ ] Không secret trong client bundle
- [ ] Typecheck + test pass

## Phụ lục Rev B/C — ràng buộc bổ sung (cưỡng chế như luật)

1. **Dữ liệu y tế thuộc vùng lõi** (`care.health_logs`, ADR-009) — vibe team chỉ chạm qua tRPC contract, không chạm schema.
2. **Flag engine chỉ đọc qua `care.v_signal_*`** (ADR-010) — SQL đọc thẳng bảng domain khác trong engine là lỗi review.
3. **Không suy tin tốt từ im lặng:** mọi job ghi `ops.job_runs`; màn hình phụ thuộc job phải hiển thị freshness. (Mở rộng xuống mức từng nguồn tín hiệu — xem Rev F điều 8.)
4. **Expand–contract** cho migration khi đã có app store (xem 02-database).
5. **Break-glass vùng lõi** (ADR-008): 1 dev vắng >48h + sự cố cao → merge 1 approve + security-agent review + hậu kiểm 72h, log và báo Chủ tịch.

## Phụ lục Rev D — luật nền tảng Super App / Mini App (ADR-011, ADR-012; cưỡng chế như luật)

1. **Core Data Model là Single Source of Truth:** dữ liệu lõi (users, students, teachers, parents, schools, classes, roles, permissions) chỉ có một bản trong `core`. Mini App tạo bảng bản sao thực thể lõi (kiểu `finance.students`) là lỗi chặn merge — schema-lint quét tên bảng.
2. **Mini App chỉ sở hữu dữ liệu nghiệp vụ của mình** và tham chiếu core bằng khóa ngoại (§1). Đọc chéo dữ liệu Mini App khác: qua contract/view công bố, không JOIN thẳng bảng nội bộ của nhau.
3. **Cấm đọc `auth.users` trực tiếp** trong mọi Mini App và mọi query nghiệp vụ — chỉ adapter auth của platform được chạm; nghiệp vụ chỉ biết `core.users` → roles → permissions.
4. **Cách ly hạ tầng:** cấm import SDK Supabase (DB/Auth/Storage) ngoài các adapter trong `packages/core/` — lint rule quét import. Đổi nhà cung cấp hạ tầng không được làm đổi code nghiệp vụ.
5. **Realtime chỉ khi thật cần**, bật theo từng tính năng qua ADR (mặc định tắt — ADR-010).

## Phụ lục Rev E — chuẩn Mini App nhúng ngoài (ADR-015, ADR-014; cưỡng chế như luật)

Chi tiết kỹ thuật đầy đủ: `08-embedded-apps.md`. Tóm tắt bốn điều cưỡng chế:

1. **Ba tầng tin cậy bắt buộc phân loại trước khi build:** Tier 1 (native, trong monorepo) · Tier 2 (embedded, nền tảng ngoài cho phép nhúng iframe) · Tier 3 (linked, nền tảng chặn nhúng). Tier 2/3 phải qua Hội đồng dữ liệu duyệt App Manifest trước khi vibe team bắt đầu build trên nền tảng ngoài (Base44, Google AI Studio, Lovable hay tương đương).
2. **Cấm app ngoài lưu `student_code`/tên thật/bất kỳ định danh học sinh nào** trong DB riêng của nền tảng ngoài — chỉ external reference qua `core.id_mappings(system='embed:<app-id>', ...)`, đúng cơ chế connector đã có, không ngoại lệ.
3. **Mọi ghi dữ liệu từ app ngoài qua Embed API scoped** (1–2 procedure khai báo trước trong Manifest) hoặc webhook → `staging` → `promote()` — không service_role, không quyền tRPC rộng, không đường ghi thứ ba ngoài Đường 2 đã định nghĩa.
4. **Nút điều hướng quay lại Hub phải do Hub tự vẽ, nằm ngoài DOM của iframe** — app ngoài không được có khả năng ẩn/vô hiệu hóa đường thoát của người dùng.

## Phụ lục Rev F — rổ dữ liệu, ổ cắm app ngoài, vòng đời định danh (ADR-016, ADR-017; cưỡng chế như luật)

Chốt 27/07/2026. Chi tiết: `08-embedded-apps.md` mục 0–1, `03-api.md` mục định danh.

1. **Rổ dữ liệu khai trước Tier.** Xanh (không gắn định danh học sinh) · Vàng (gắn từng em: fitness, căn tin, điểm danh CLB) · **Đỏ (cấm tuyệt đối: `care.*`, `counselor_notes`, `health.*`, mood trong `attendance.checkins`)**. Manifest khai procedure chạm rổ Đỏ → **CI fail**, không đợi review người. Fitness/căn tin là rổ Vàng — phân loại xuống Xanh là lỗi chặn merge.
2. **Alias do Hub sinh, mỗi app một dải riêng.** App ngoài không được tự khai `external_id` định danh học sinh. Hai app ngoài không được nhận cùng một alias cho cùng một em.
3. **Không cấp API key cho app không có backend riêng.** App chỉ có frontend (no-code thuần) đi đường quyền-theo-người-dùng hoặc webhook. Cấp key cho bundle client là vi phạm §4 dưới tên khác.
4. **`external_id` phải lặp lại được**; Hub từ chối webhook thiếu nó. Không có ràng buộc này thì §9 chỉ còn trên giấy đối với nguồn ngoài.
5. **`postMessage` bắt buộc kiểm `event.origin`** khớp Manifest, có schema trong `packages/core/contracts` và có timeout. Cấm trao mã/token qua query string của `iframe src`.
6. **Sổ đăng nhập tách khỏi sổ dữ liệu:** `core.identity_links(system, external_id, user_id)` cho định danh, `core.id_mappings(system, external_id, student_id)` cho dữ liệu học sinh. Cả hai chiều đều `UNIQUE`.
7. **Đăng nhập chung phải kèm đăng xuất chung:** `end_session_endpoint` + back-channel logout; token ≤15 phút; mỗi lần refresh kiểm `core.users.status`. RP đăng ký mới mà không khai `backchannel_logout_uri` → từ chối.
8. **Không suy tin tốt từ im lặng — mức nguồn tín hiệu:** flag engine bỏ qua rule có nguồn quá hạn tươi (`ops.source_freshness`), ghi `degraded_sources`, buồng lái hiện băng vàng. Cờ sinh từ nạp bù mang `origin='backfill'`: không tạo case, không leo thang.
9. **Một tên cho sổ nhật ký máy: `ops.job_runs`.** Mọi tài liệu và code dùng đúng tên này (trước đây tồn tại song song `ops.ops_job_runs`, `care.ops_job_runs`).
