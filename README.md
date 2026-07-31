# School Data Hub — Repo quản trị kiến trúc + mã nguồn

Hệ thống theo dõi & chăm sóc học sinh, Hệ thống Trường Việt Anh. Thiết kế cho **≤5.000 user, ~300.000 request/ngày**.

## Bắt đầu từ đâu

- **Bạn là người duyệt (BGH, Chủ tịch, pháp chế):** mở file [`danh-cho-nguoi/ho-so-he-thong.html`](danh-cho-nguoi/ho-so-he-thong.html) bằng trình duyệt (double-click). Hồ sơ có sơ đồ, ví dụ, bảng chi phí và trang ký duyệt; in A4 bằng Ctrl+P. Không cần biết code.
- **Bạn là dev / vibe team / Claude:** `CLAUDE.md` tự nạp khi mở Claude Code tại đây. Đọc [`danh-cho-may/RULES.md`](danh-cho-may/RULES.md) trước khi làm bất cứ việc gì.
- **Bạn muốn chạy thử ứng dụng:** xem mục "Chạy local" bên dưới.

## Trạng thái: Giai đoạn 1 (vỏ) — 29/07/2026, đã chạy thử thật đầu-cuối

Đã xây: monorepo + `packages/core` (contracts, auth-adapter dev, db client RLS-aware) +
`apps/hub` (Next.js App Router) với đủ 4 màn GĐ1 theo `Hub Giai Doan 1.dc.html`:
đăng nhập (SSO dev + mã mời PH), trang chủ học sinh, check-in cảm xúc (+ offline
queue), buồng lái GVCN rút gọn, báo cáo Trưởng thành.

**Chưa xây (đúng phạm vi GĐ1, để làm tiếp):**
1. Cổng kết nối OIDC cho app ngoài (`/oidc/*`, ADR-014) — người dùng tự làm tiếp để cắm thử 1 app.
2. Flag engine tự động (pg_cron, `04-flag-engine.md`) — buồng lái GĐ1 tính cờ trực tiếp
   từ tín hiệu thô, xem ghi chú đầu file `apps/hub/server/routers/care.ts`.
3. Google/Zalo OAuth thật — GĐ1 dùng dev provider giả lập vì hạ tầng OAuth chưa mua.
4. `submitCheckout` (điểm danh ra về, có trong `03-api.md`) — wireframe GĐ1 không cần, chưa viết.
5. **Layout desktop riêng cho check-in/báo cáo/hồ sơ** — chỉ responsive đơn giản (co giãn
   max-width trong khung thẻ). **Đăng nhập và trang chủ đã có layout desktop riêng thật**
   (29/07/2026, xem mục ngay dưới) vì `Hub Desktop.dc.html` có bản thiết kế desktop cho 2 màn
   này (D1, D2); check-in/báo cáo/hồ sơ thì KHÔNG có bản D-series tương ứng trong nguồn thiết
   kế nên giữ nguyên responsive đơn giản, không tự bịa layout desktop cho chúng.

## Đăng nhập + Trang chủ: layout desktop riêng, không phải mobile phóng to (29/07/2026)

Đã đọc kỹ `Hub Desktop.dc.html` (D1 đăng nhập, D2 trang chủ) và `Hub Mobile.dc.html` (M1–M3)
để dựng lại đúng 2 bố cục THẬT SỰ khác nhau theo khung, không phải một bản co giãn:

- **Đăng nhập** (`components/login-form.tsx`): mobile giữ hero cong nhỏ ở trên (logo + tiêu
  đề) rồi tới form. Desktop (`md:`) chia đôi màn hình — panel trái là hero navy toàn chiều cao
  (vòng tròn đồng tâm, 4 chip icon nổi trôi, mascot lớn, khớp D1), panel phải là thẻ trắng nổi
  trên nền gradient nhạt.
- **Trang chủ** (`components/home-view.tsx`): tách hẳn `MobileHome` (một cột, thẻ check-in
  trồi lên vòm, tab bar dưới — khớp M3) và `DesktopHome` (hero rộng hơn, layout 2 cột — nội
  dung chính `flex-[1.65]` + rail phải `340px`, thẻ check-in nằm NGANG một hàng thay vì xếp
  dọc, KHÔNG có tab bar — khớp D2). Cả hai fetch chung dữ liệu tRPC một lần ở component cha,
  chỉ hiện/ẩn bằng `md:hidden` / `hidden md:block` — không gọi API hai lần.
- Rail phải desktop **không bịa dữ liệu GĐ2** (D2 gốc có thẻ tiến độ đọc sách/bơi/nói — GĐ1
  chưa có `evidence` module) — thay bằng thẻ chuỗi check-in thật + câu giải thích "cùng trang
  chủ, khác lưới mini app theo quyền" (đúng nguyên văn D2, không fabricate).

**Đã xác nhận:** `tsc --noEmit` sạch, `next build` pass (13 route). Ảnh chụp thật xác nhận
đăng nhập desktop render đúng pixel so với D1. Home desktop xác nhận bằng
`getComputedStyle` (không chụp được ảnh do công cụ trình duyệt lỗi tạm thời trong phiên) —
đã kiểm `flex-grow:1.65` cột trái, `width:340px` rail phải, `grid-template-columns:repeat(4,…)`
lưới mini app, `flex-direction:row` thẻ check-in — đúng cấu trúc D2, không phải đoán.

**Đã tự kiểm tra thật, không chỉ đoán** (dựng Postgres 16 qua Docker, chạy hết 17
migration + toàn bộ 16 file pgTAP ~150 assertion xanh, seed dữ liệu demo, chạy
`next dev`, gọi thật từng tRPC procedure qua HTTP, và bấm thật trong Chrome ở cả
2 vai trò):
- Đăng nhập dev (Google giả + mã mời PH) → tạo/khớp đúng phiên
- Check-in cảm xúc bấm thật → ghi `attendance.checkins`, idempotent (bấm lại đổi mood, không tạo dòng đôi)
- Báo cáo Trưởng thành đọc đúng dữ liệu của đúng học sinh (RLS chặn đúng — phụ huynh chỉ thấy con mình)
- Buồng lái GVCN: cờ ưu tiên, xác nhận gửi muộn, ghi can thiệp (bấm thật → tạo `care.care_cases`/`care.interventions` thật)
- `pnpm install`, `tsc --noEmit` (sạch cả hai package), `next build` (13 route)

**5 lỗi thật đã tìm thấy và sửa trong quá trình chạy thử** (không có trong bản
"vỏ" ban đầu vì chưa từng chạy trên Postgres thật):
1. `core.parents`/`core.parent_students` thiếu RLS + GRANT hoàn toàn — chặn luôn cả luồng phụ huynh (migration `0016`).
2. Thiếu policy UPDATE cho tự sửa mood trong ngày (chỉ có policy GVCN xác nhận gửi muộn) — bấm check-in lần 2 trong ngày bị chặn (migration `0017`).
3. `date + bigint` không hợp lệ trong Postgres — lỗi tính chuỗi ngày check-in liên tiếp (`checkin.ts`, `report.ts`).
4. Contract Zod ép `.uuid()` cho `flagId`/`caseId` trong khi GĐ1 dùng ID ghép tạm (flag engine chưa chạy) — chặn buồng lái và ghi can thiệp (`contracts/care.ts`).
5. `@import` font đặt sau `@tailwind` trong CSS (sai thứ tự theo spec) — icon Material Symbols không hiện, chỉ thấy tên chữ (`globals.css` → chuyển sang `<link>` trong `layout.tsx`).
6. `displayName.split(" ").at(-1)` để lấy tên gọi — vỡ với tên dạng "Cô Lan (GVCN 6A1)", hiện "Chào 6A1)" (`home-view.tsx`, sửa dùng nguyên tên hiển thị).

## Chạy local

Cần: Node 20+, pnpm (`corepack enable`), Docker (để chạy Postgres).

```bash
# 1. Cài dependency
pnpm install

# 2. Dựng Postgres 16 + chạy migrations
docker run -d --name pg_hub -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=hub_dev -p 5432:5432 postgres:16
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/hub_dev
for f in packages/core/db/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done

# 3. (khuyến nghị, đặc biệt cho migration 0013-0015 mới) Chạy pgTAP trước khi tin seed/app
docker exec pg_hub bash -c "apt-get update -qq && apt-get install -y -qq postgresql-16-pgtap"
./tools/run-db-tests.sh

# 4. Nạp dữ liệu demo (tài khoản dev + lịch sử check-in mẫu)
pnpm db:seed

# 5. Tạo apps/hub/.env.local
cp apps/hub/.env.example apps/hub/.env.local
# AUTH_SESSION_SECRET: chuỗi ngẫu nhiên ≥32 ký tự — tự sinh bằng: openssl rand -hex 32

# 6. Chạy dev server
pnpm dev
# mở http://localhost:3000 — chọn tài khoản dev ở tab "Học sinh & Thầy cô",
# hoặc nhập mã mời DEV001 ở tab "Phụ huynh" (xem output của db:seed)
```

### Tài khoản dev có sẵn sau khi seed

| Vai trò | Tên hiển thị | Vào được |
|---|---|---|
| Học sinh | Học sinh Minh | Trang chủ, Check-in, Báo cáo |
| GVCN 6A1 | Cô Lan | Trang chủ, Buồng lái (lớp 6A1) |
| GVCN 6A2 | Cô Hạnh | Trang chủ, Buồng lái (lớp 6A2) |
| GV bộ môn | Thầy Nam | Trang chủ (chưa có mini app riêng ở GĐ1) |
| Tâm lý cụm | Cô Mai | Trang chủ (chưa có mini app riêng ở GĐ1) |
| Phụ huynh (mã mời `DEV001`) | — | Trang chủ, Báo cáo (con: Bình) |

Đăng nhập ở đây là **dev provider giả lập** (`packages/core/auth-adapter/dev-provider.ts`),
thay cho Google/Zalo OAuth thật — hạ tầng OAuth thật chưa mua (`danh-cho-may/10-mua-sam-ha-tang.md`).
Khi nối OAuth thật: viết provider mới cùng shape trả về `{ authUid, displayName, roles }`,
đổi UI đăng nhập trỏ sang đó; không đổi `session.ts`, không đổi `db/client.ts`, không đổi router nào.

## Cấu trúc

```
school-data-hub/
├── CLAUDE.md                        ← luật gốc, tự nạp vào mọi phiên Claude
├── danh-cho-nguoi/
│   └── ho-so-he-thong.html          ← HỒ SƠ PHÊ DUYỆT: mở trình duyệt, in ký
├── danh-cho-may/                    ← bản thi hành (spec .md, luật cứng, thuật toán)
├── apps/hub/                        ← Super App (Next.js App Router) — GĐ1
│   ├── app/                          route: /login /home /checkin /gvcn /bao-cao /ho-so + /api/*
│   ├── components/                   UI dùng chung, theo DESIGN-GUIDELINES.md
│   ├── server/                       tRPC routers (checkin, care, report, session)
│   └── lib/                          tRPC client, session helper, offline queue
├── packages/core/                   ← vùng lõi — CI chặn PR chạm sai (RULES.md §10)
│   ├── contracts/                    Zod schemas dùng chung dev core ↔ vibe team
│   ├── auth-adapter/                 JWT session + dev provider (tạm thay Google/Zalo)
│   └── db/                           adapter Postgres DUY NHẤT, migrations, seed
├── .claude/agents/                  ← các agent đóng vai BA, QA, PM, Security
├── tools/check-sync.mjs             ← kiểm tra hai bản không lệch nhau
└── .github/CODEOWNERS               ← vùng lõi cần 2 dev approve
```

## Luật quan trọng nhất của repo

**Một sự thật, hai ngôn ngữ:** mỗi nội dung có bản-cho-người và bản-cho-máy. Sửa một bên bắt buộc sửa bên kia cùng commit (`node tools/check-sync.mjs` để kiểm tra). Tài liệu nghiệp vụ gốc: bản "Thiết kế Toàn trường — Final" 15/07/2026.

## Kiểm tra trước khi merge

- `node tools/check-sync.mjs` — hồ sơ người/máy đồng bộ
- `node tools/schema-lint.mjs` — §1/§2/ADR-011
- `node tools/secret-scan.mjs` — §4
- `pnpm typecheck` — cả hai package sạch kiểu (đã xác nhận pass)
- `./tools/run-db-tests.sh` — pgTAP trên Postgres thật (**đã xác nhận pass: 17 migration, 16 file test, ~150 assertion xanh**)
- `pnpm --filter @hub/app build` — đã xác nhận pass, 13 route
