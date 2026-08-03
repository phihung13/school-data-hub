---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 13
---

# Architecture — Hub là NỀN TẢNG (Super App + Mini App), không phải một ứng dụng nghiệp vụ

## 1. Định vị (quyết định Chủ tịch — ADR-011)

Hub là nền tảng thống nhất **dữ liệu** và **trải nghiệm người dùng**. Một **Super App** làm vỏ (đăng nhập một lần, điều hướng, hồ sơ, thông báo) và nhiều **Mini App** nghiệp vụ chạy bên trong. Mỗi Mini App chỉ sở hữu dữ liệu nghiệp vụ của chính mình và tham chiếu dữ liệu lõi bằng khóa ngoại — không bao giờ tạo bản sao.

Mini App hiện tại và kế hoạch: `attendance` (check-in cảm xúc + điểm danh), `care` (cờ ABC+E, hồ sơ can thiệp), `evidence` (dấu chân hoạt động, fitness), `tutor` (snapshot học thuật; tương lai: courses, lessons), `health` (y tế), và các Mini App tương lai đã đặt chỗ schema: `finance` (invoices, payments), `social` (posts, comments), `ai` (conversations, prompts).

## 2. Bốn lớp — Supabase CHỈ là hạ tầng

```
Super App + Mini Apps  (PWA — xem MD-07 / ADR-013)
        │
        ▼
Business Layer — API (tRPC/Fastify): TOÀN BỘ luật nghiệp vụ nằm đây
        │
        ▼
Data Layer — PostgreSQL: schema theo domain + RLS
        │
        ▼
Hosting — Supabase (Postgres + Auth + Storage; Realtime CHỈ khi thật cần)
```

**Luật cách ly hạ tầng:** business layer không gọi SDK Supabase rải rác trong code nghiệp vụ; mọi truy cập Database/Auth/Storage đi qua adapter tập trung trong `packages/core/`. **Không có đường tắt:** Mini App không được gọi thẳng Domain Service, bỏ qua tRPC Router — mọi mutation đi đúng chuỗi Client → tRPC Router → Auth/Policy → Domain Service (khớp View 08A). Nhờ vậy nếu một ngày Supabase không còn phù hợp: Supabase → Neon / self-host PostgreSQL / Cloud SQL = đổi adapter + biến kết nối, ứng dụng gần như không phải viết lại. (Khớp cơ chế thoát vendor + restore drill ở 06.)

## 3. Core Data Model — Single Source of Truth

- Schema `core` giữ **bản duy nhất** của: `users`, `students`, `teachers`, `parents`, `schools` (cơ sở), `classes`, `roles`, `permissions`, `id_mappings`, `school_networks`.
- Mọi Mini App dùng chung `core.students`, `core.users`, `core.schools`, `core.roles` — **không bao giờ có `finance.students` hay `attendance.students`**.
- Đường tiến hóa: một Mini App phát triển rất lớn có thể tách thành service riêng mà không đổi Core Data Model (nó vốn chỉ tham chiếu core bằng khóa, không ôm bản sao).

## 4. Auth indirection — không phụ thuộc trực tiếp Supabase Auth

Vẫn dùng Supabase Auth + JWT + RLS, nhưng nghiệp vụ không biết tới nó:

```
Supabase Auth UID → core.users → roles → permissions → Mini App
```

**CẤM Mini App đọc `auth.users` trực tiếp.** Mọi nghiệp vụ chỉ biết `core.users`; ánh xạ UID ↔ core.users nằm trong adapter auth của platform. Storage (avatar, ảnh check-in, tài liệu, file AI) dùng Supabase Storage, cũng qua adapter.

**Cửa đăng nhập tạm cũng nằm trong adapter, không nằm trong route** (02/08/2026, ADR-028). `packages/core/auth-adapter/dev-gate.ts` giữ **toàn bộ phán quyết** của cửa `dev-login` và cố ý **thuần** — không `next/*`, không Postgres — nên nó test được thẳng và hai route (`/api/auth/dev-login`, `/api/auth/dev-gate`) cùng màn `/login` nói chung một thứ tiếng gồm bốn trạng thái (`absent` / `misconfigured` / `locked` / `open`). Để phán quyết trong route là để ba bản sao của cùng một câu hỏi, và ba bản sao thì sớm muộn trả lời khác nhau — chỗ lệch nằm đúng trên đường "ai vào được hệ". Chi tiết cửa, các phép đo trước/sau và bốn cái bẫy: `06-resilience-security.md` mục 6b.

## 5. Frontend — MD-07 (ĐÃ CHỐT, ADR-013)

Super App là **PWA TypeScript (Next.js + tRPC)** — đúng nền đang chạy hôm nay, giữ nguyên. Không chuyển sang Flutter, dù ở dạng thuần (Fastify + Zod→OpenAPI→Dart client) hay vỏ Flutter + Mini App webview. Contract vẫn viết bằng Zod trong `packages/core/contracts`; không cần sinh OpenAPI cho client Dart vì không có client Dart.

### 5.1 Một bản khai cho mọi màn — điều hướng KHÔNG viết tay ở từng bề mặt (02/08/2026)

Hub là Super App: một vỏ chung cho mọi vai, nội dung phân nhánh theo người dùng. Trước 02/08/2026, phần **phân nhánh** được ba nơi tự trả lời riêng bằng `if` viết tay — `server/mini-apps.ts` (lưới tile trang chủ, 11 dòng), `components/hub-sidebar.tsx` (menu trái, 8), `components/tab-bar.tsx` (thanh tab điện thoại, 7). Ba nơi, một câu hỏi "vai này thấy gì", ba câu trả lời.

Ba lần lệch đã xảy ra thật, và **không lần nào làm hỏng build, hỏng test, hay in ra một dòng lỗi**:

- Màn Điều hành (`/dieu-hanh`) chạy thật, dữ liệu đủ, quyền đủ — suốt hai ngày **không một mục điều hướng nào dẫn tới**. Người duy nhất vào được là người đã biết phải gõ URL.
- Cô tâm lý cụm thấy hộp việc của mình trên máy tính, **không thấy trên điện thoại** — thiết bị mà DESIGN-GUIDELINES §3 gọi là thiết bị chính.
- Mục "Hồ sơ" đứng ở ba nơi cùng lúc cho cùng một người.

**Nguồn duy nhất nay là `apps/hub/lib/man-hinh.ts`**: mỗi màn một dòng khai `href`, `icon`, nhãn, **`vai` (ai vào được)**, và nó hiện ở bề mặt nào (`luoi` / `menu` / `tab`) kèm thứ tự. Ba file kia thôi quyết định, chỉ gọi `manChoLuoi()` / `manChoMenu()` / `manChoTab()` — 26 nhánh còn 2, và hai dòng còn lại không phải phân quyền (một chọn *nhãn* vai theo `ROLE_PRIORITY`, một chọn *kiểu bố cục* thanh tab vì bản học sinh có nút Check-in tròn nổi giữa).

**Cùng mô hình với sổ đăng ký Mini App ngoài (`core.embedded_apps`, `0052`), khác chỗ cất — có chủ ý:**

| | Màn của Hub | Mini App ngoài |
|---|---|---|
| Khai ở | `lib/man-hinh.ts` (mã) | `core.embedded_apps` (CSDL) |
| Hàng rào thật | câu `redirect()` trong chính `page.tsx` | KHÔNG có gì khác ngoài bảng đó |
| Đổi bằng | sửa mã + PR | một nút trên màn quản trị, hiệu lực ngay lượt request kế tiếp |

Đưa quyền vào màn của Hub xuống CSDL sẽ dựng **hai nguồn sự thật cho cùng một hàng rào** — và hai nguồn thì có ngày lệch, còn chỗ lệch là chỗ không ai kiểm. Cũng không nên tồn tại một cái nút cấp cho học sinh quyền vào màn tâm lý bằng một cú bấm. App ngoài thì ngược lại: chúng cần **tắt được trong mười giây** khi lộ dữ liệu, và chúng không có hàng rào nào khác.

**Hai thứ đi kèm, cả hai đều là hàng rào chứ không phải tiện ích:**

- `tests/unit/man-hinh.test.ts` (28 phép) đọc câu `redirect()` **thật** trong từng `page.tsx` rồi đối chiếu với `vai` đã khai — **cả hai chiều**. Khai rộng hơn hàng rào ⇒ mục hiện ra rồi bấm vào bị đá ngược ("menu 404", đã sửa ba lần). Khai hẹp hơn ⇒ màn có thật mà không đường nào tới. Từ nay khai sai là CI đỏ, không phải người dùng bị đá ngược.
- `/quan-tri/xem-truoc` — màn quản trị hiện trang chủ của **cả sáu vai cạnh nhau** (lưới · menu · thanh tab, kèm app ngoài đang bật cho vai đó). Nó **gọi đúng ba hàm mà sản phẩm thật gọi**, không dựng bảng mô tả riêng: một bảng mô tả sẽ lệch, và lúc đó chính công cụ sinh ra để canh lại là cái nói dối.

## 6. Giữ nguyên từ Rev B/C (không đổi)

Flag engine = `care.run_flag_engine()` (`0039`) + signal views `care.v_signal_*`, gọi bởi bộ lịch job chung `ops.job_schedule` × `tools/jobs/run-all.mjs` (`0041`) — **không pg_cron**: extension đó phải bật ở tầng nhà cung cấp, và lúc sự cố thì một lịch nằm trong database là thứ không ai gỡ ra đọc được bằng `git log`. Sửa 01/08/2026; câu cũ ở đây ghi "pg_cron" và mô tả một thứ chưa bao giờ được bật · connector chỉ ghi `staging`, vào kho qua `promote()` · `/api/health` một điểm đo (DB + heartbeat + last_engine_run) · không Realtime mặc định (ADR-010) · 3 môi trường dev → staging → prod, migration qua staging trước · repo vùng lõi (`packages/core`: db/migrations, auth-adapter, storage-adapter, flag-engine, pii-stripper, contracts) và vùng mở (`apps/*` = các Mini App).

## 7. Hub là Identity Provider cho hệ ngoài (ADR-014, mở rộng ADR-016)

Đăng nhập chỉ có một chỗ: Hub. Hệ ngoài (Moodle, và RP tương lai) không giữ mật khẩu riêng — tin định danh từ Hub qua **OIDC bridge** (`node-oidc-provider`, mount `/oidc/*` trong cùng deployable, không phải service riêng). Bridge đọc session qua `auth-adapter` hiện có, không import SDK Supabase ở nơi khác (đúng §4). `sub` = `core.users.id`. Bridge chỉ cấp định danh — không cấp quyền gọi API Hub cho RP. Chi tiết endpoint, đăng ký RP, bảo mật (PKCE, redirect allowlist), test bắt buộc: xem `03-api.md`.

**Bổ sung ADR-016 (27/07/2026) — vòng đời phải khép kín, không chỉ có chiều mở:**

- **Đăng xuất chung:** `end_session_endpoint` + back-channel logout (mỗi RP khai URI nhận trong config). Thoát Hub = thoát mọi RP đang mở. Lý do vận hành: phòng máy dùng chung, em sau ngồi vào không được thừa hưởng phiên của em trước.
- **Khóa là cắt:** token sống ≤15 phút; mỗi lần làm mới kiểm `core.users.status` — tài khoản disabled thì mất đường vào mọi hệ trong một chu kỳ token. Không đuổi theo thu hồi từng token đã phát.
- **Vai trò trong token:** scope `hub_profile` trả `hub_role` (student/teacher/parent/staff), `hub_school`, `hub_classes` — đủ để Moodle tự phân vai và xếp lớp. RP không khai scope thì không nhận. Cập nhật ở lần đăng nhập kế tiếp của user (không đẩy thông báo chủ động sang RP — thêm đường là thêm thứ hỏng được, lợi ích không tương xứng).
- **Tách sổ đối chiếu:** khớp tài khoản dùng `core.identity_links(system, external_id, user_id)`, KHÔNG dùng `core.id_mappings` (sổ đó FK về `core.students.id` nên không chứa được giáo viên/phụ huynh). Khóa duy nhất cả hai chiều: `UQ(system, external_id)` và `UQ(system, user_id)` — chặn cả ca một mã ngoài thuộc hai người lẫn ca một người sinh hai tài khoản trong cùng hệ ngoài. Upsert idempotent (§9).
