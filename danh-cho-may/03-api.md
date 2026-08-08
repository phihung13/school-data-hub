---
ban-doi-ung: none
sync-version: 5
---

# API — tRPC routers, 2 đường ghi duy nhất

Chỉ có **hai đường ghi** vào Hub. PR mở đường thứ ba bị từ chối.

## Đường 1 — tRPC (người dùng, realtime)

Bảng dưới là **bề mặt đang chạy thật** tính tới 31/07/2026 — cột "Trạng thái" phân biệt thứ đã cài với thứ mới đặt chỗ, vì một bảng API nói quá cũng nói dối y như một ma trận phân quyền nói quá.

| Router | Procedures | Cổng vào | Trạng thái |
|---|---|---|---|
| `session` | `me`, `miniApps` | public / protected | ✅ chạy |
| `checkin` | `getTodayStatus`, `getAttendanceOverview`, `submitMood`, `requestHelp`, `getMyHelpRequests`, `getMyHomeroomTeacher` | protected | ✅ chạy. `submitMood` gọi `attendance.resolve_checkin` (ADR-007) — router **không** tự quyết `status`/`source` |
| `profile` | `getMyStudentProfile` | protected | ✅ chạy |
| `report` | `getMyLatestReport`, `getReportForWeek`, `getMyGuardians` | protected | ✅ chạy, read-only |
| `care` (buồng lái GVCN) | `getDashboard`, `acknowledgeLate`, `getMyClasses`, `getClassRoster`, `markAttendance`, `listReportApprovals`, `approveReport`, `getStudentDetail` | `homeroomProcedure` | ✅ chạy — bốn màn hình GVCN (31/07/2026). **`getDashboard` nay nhận `{ classId? }`** (đợt B): một cô chủ nhiệm hai lớp trước đây chỉ thấy "lớp một" của một `SELECT` không `ORDER BY`, và màn hình không nói đang xem lớp nào. Bỏ trống `classId` = lớp đầu **theo mã lớp**, cùng thứ tự `getMyClasses` trả về; output mang thêm `classId` để mọi con số nói rõ nó thuộc lớp nào |
| `care` (chăm sóc) | `acknowledgeHelpRequest`, `logIntervention`, `closeCase`, `listClassInterventions` | `careStaffProcedure` = `roleProcedure("homeroom","counselor")` | ✅ chạy |
| `care` (tâm lý cụm) | `listClusterCases`, `getClusterCaseDetail` | `counselorProcedure` = `roleProcedure("counselor")` | ✅ chạy — hai màn `/tam-ly` (31/07/2026). **Cố ý KHÔNG dùng `careStaffProcedure`:** phạm vi hai màn này là CỤM chứ không phải một lớp. Output **không** mang cột `note` của `attendance.help_requests` — đường chuyển tuyến "em đồng ý cho phòng tâm lý đọc" chưa tồn tại (ADR-025) |
| `report` (điều hành) | `getOperationsOverview` | `roleProcedure("principal","board")` | ✅ chạy — màn `/dieu-hanh` (31/07/2026). Đọc qua `report.class_pulse`/`grade_pulse` (`0040`): **không cột nào trả về học sinh cá nhân**, đơn vị nhỏ nhất là một lớp, lớp dưới 10 em trả NULL + `cohortTooSmall` chứ không trả 0 (DESIGN-GUIDELINES §9) |
| `checkin.submitCheckout` | điểm danh ra về | — | ⛔ chưa viết (wireframe GĐ1 không có) |
| `evidence` | `submitBehaviors`, `submitPdr`, `logDear`, `scoreRubric`, `logEventRole` | — | ⛔ chưa có router (đường vào hiện tại chỉ qua Đường 2 / embed) |
| `fitness` | `submitTest`, `logClubAttendance` | — | ⛔ vùng vibe team, chưa mở |
| `admin` | `updateThreshold`, `manageMapping`, `reviewImportErrors` | — | ⛔ chưa có. Vai `admin` trong DB hiện gần như chưa mở quyền nào (`02-database.md`). Hệ quả cần biết: `04-flag-engine.md` nói "sửa ngưỡng không cần deploy" — đúng ở tầng dữ liệu (`care.thresholds` + `care.resolve_threshold`), nhưng hôm nay vẫn phải chạy tay một câu UPDATE vì màn hình chưa có |

**Bốn cổng vào, không phải ba** (`apps/hub/server/trpc.ts`): `publicProcedure` → `protectedProcedure` (đã đăng nhập) → `homeroomProcedure` (có lớp chủ nhiệm, gắn `ctx.homeroomClassId`) → **`roleProcedure(...roles)`** — một hàm sinh cổng theo vai, đối chiếu `core.v_my_scopes`. `careStaffProcedure` và `counselorProcedure` không còn là hai đoạn mã riêng mà là hai lần gọi cùng một hàm đó; cổng vai điều hành (`principal`/`board`) cũng vậy. Lý do gộp: mỗi cổng viết tay là một chỗ có thể quên một nhánh, mà quên một nhánh ở đây không báo lỗi — nó chỉ lặng lẽ cho một vai đi qua. Đường cũ chỉ có "đã đăng nhập chưa" là nguồn của lỗ leo quyền đã vá ở `0025` — `acknowledgeLate` từng là `protectedProcedure`.

**Cổng vai ở tầng API KHÔNG thay cổng ở tầng dữ liệu.** `getOperationsOverview` đi qua `roleProcedure("principal","board")` rồi vẫn gọi hàm `0040` tự kiểm vai một lần nữa và **RAISE** khi sai. Hai lần kiểm không phải thừa: nếu chỉ kiểm ở API thì một truy vấn viết tay lúc trực sự cố đi thẳng vào DB là đi vòng qua cổng; nếu chỉ kiểm ở DB mà trả bảng rỗng thay vì lỗi thì người gọi sai vai đọc "cả khối hôm nay không có gì" — im lặng thành kết luận, đúng thứ repo này cấm.

## Đường 2 — Connector (máy, theo lịch)

- Tutor/Class → `staging`: batch mỗi giờ.
- Moodle → `staging`: webhook completion + cron đối soát đêm.
- COR → `staging`: upload file theo kỳ, màn hình xử lỗi map.
- `promote()`: validate + gắn `student_id` → ghi `core`/`academic`; lỗi → `import_errors`.
- Role DB connector: INSERT-only trên `staging` (§8). **Cưỡng chế thật từ 31/07/2026:** cửa vào là `staging.ingest_embedded_event()` chạy dưới vai `connector`; trước đó route webhook gọi bằng ngữ cảnh hệ thống (không `SET ROLE`) nên hàng rào vai trò của §8 chưa từng được thi hành.
- **`promote()` không bao giờ được ném lỗi ra ngoài vì payload xấu.** Bản cũ ném exception ⇒ transaction rollback sạch ⇒ bản ghi thô không nằm lại `staging`, không có dòng `import_errors`, app ngoài nhận 500 rồi retry vô hạn — ngược hẳn §8. Nhánh lỗi cũng phải idempotent (§9): trước bản vá, app retry mỗi 30 giây bơm 2.880 dòng/ngày vào đúng hàng đợi mà con người phải xử tay. Chi tiết: `02-database.md`, mục `0028`.

## Luật endpoint (mọi router)

1. **Idempotent (§9):** unique constraint tự nhiên (vd `(student_id, date, type)`) + upsert. Contract test bắn 2 lần.
2. **Check-in một round-trip:** đỉnh sáng ~5.000 user là ~100–150 req/s (xem `05-capacity-ops.md`) — mutation gọn, không N+1.
3. **Zod tại biên:** mọi input/output khai báo trong `packages/core/contracts/` — là hợp đồng chung cho dev + vibe team. Không `any`.
4. **Lỗi có mã:** `TRPCError` với code chuẩn; message tiếng Việt thân thiện ở client, chi tiết kỹ thuật chỉ trong log server. **Đã cài** qua `errorFormatter` trong `apps/hub/server/trpc.ts` — một chỗ duy nhất, không phải mỗi router tự bọc `try/catch` rồi mỗi nơi lộ một kiểu.
5. **Rate limit — ĐÃ CÀI THẬT (31/07/2026), không còn là spec.** `apps/hub/lib/rate-limit.ts`, token bucket, middleware tRPC + các route `/api/auth/*`. Hạn mức nằm trong một hằng số duy nhất `RATE_LIMITS`, không rải số trong code:

   | Khóa | Hạn mức | Áp cho |
   |---|---|---|
   | `default` | 60 req/phút/người | mọi procedure tRPC |
   | `checkinMutation` | 10 req/phút/người | **chỉ mutation** `checkin.*` — đọc trạng thái hôm nay là truy vấn màn hình bình thường, thứ cần chặn là dòng GHI lặp lại (ADR-007) |
   | `embedApp` | 30 req/phút/app | Embed API (`08-embedded-apps.md` mục 4) |
   | `inviteCode` | 10 req/phút/**IP** | cửa mã mời 6 ký tự — siết theo IP vì kẻ dò mã chưa có tài khoản |
   | `sessionRefresh` | 20 req/phút/người | gia hạn phiên trượt (bình thường ~6 lượt/giờ) |

   Chọn token bucket thay vì cửa sổ cố định để một cụm request ngắn (mở buồng lái = ~13 truy vấn cùng lúc) vẫn qua được, còn dòng đều đặn vượt hạn mức thì bị chặn. **Trước bản này Hub không có giới hạn tốc độ ở bất kỳ đâu:** một vòng lặp trong tab trình duyệt của một em đủ để kéo sập buồng lái cả trường, và cửa mã mời là bãi thử brute-force miễn phí. **Giới hạn phải biết:** bộ đếm nằm trong bộ nhớ tiến trình, đúng vì Hub chạy MỘT deployable (ADR-001/018) — ngày chạy >1 instance thì hạn mức thật nhân lên theo số instance (`DEBT.md` #22, ADR-022).
6. **Hợp đồng nội bộ có version (bổ sung 27/07/2026):** `packages/core/contracts` mang số phiên bản + changelog; đổi phá tương thích đi theo expand–contract y như migration (thêm mới → chuyển dần → gỡ cũ). Lý do: hợp đồng giữa lõi và Mini App là ranh giới giữa **hai đội khác nhau** (2 dev core ↔ vibe team) — không có version thì vibe team phát hiện gãy lúc chạy thật, không phải lúc build.

## Sẵn sàng lên CH Play / App Store (lộ trình đã chốt: sau khi hệ chạy tốt)

Đường lên store: bọc PWA hiện có bằng **Capacitor** (Android + iOS) hoặc TWA (Android). Không viết lại; tRPC + Supabase auth chạy nguyên trong webview. Ba quy tắc phải giữ NGAY TỪ BÂY GIỜ để ngày đó không đau:

1. **Version gate:** client gửi `app_version` trong header; server có endpoint `meta.minSupportedVersion`. App bản store không ép update được như web — bản cũ phải nhận màn hình "vui lòng cập nhật" thay vì lỗi khó hiểu. Mọi thay đổi breaking của API phải qua deprecation window ≥ 1 phiên bản.
2. **Không dùng API chỉ-có-trên-trình-duyệt** ngoài lớp adapter (để webview Capacitor chạy được nguyên vẹn).
3. **Xóa tài khoản trong app:** Apple bắt buộc app có tạo tài khoản phải cho xóa tài khoản ngay trong app — quyền xóa theo Hiến chương điều 7 đã có sẵn ở backend, chỉ cần màn hình gọi nó.

Việc chỉ làm khi phát hành store (không làm trước): đăng ký Google Play Console + Apple Developer, khai Data safety form / Privacy nutrition label cho dữ liệu trẻ em (DPIA và Hiến chương là nguồn khai sẵn), trang privacy policy công khai, thêm 1–2 tính năng native (push APNs/FCM, đăng nhập sinh trắc học) để qua cửa Apple Guideline 4.2 "minimum functionality" — Apple từ chối app chỉ là website bọc vỏ trần.

## Định danh ra ngoài — Hub là Identity Provider (ADR-014, không phải đường ghi thứ ba)

"Chỉ có hai đường ghi" ở đầu file nói về **dữ liệu**; đây là chuyện khác — **định danh** chảy từ Hub ra ngoài, không phải dữ liệu chảy vào. Người dùng đăng nhập Hub một lần; hệ ngoài (Moodle, và các RP tương lai) tin định danh đó qua chuẩn OIDC, không giữ mật khẩu riêng, không cần đường ghi mới vào `staging`/`core`.

### Kiến trúc

- Thư viện chuẩn **`node-oidc-provider`** — không tự viết OAuth/OIDC (dễ lộ lỗi PKCE, replay token, xoay JWKS sai).
- Mount ở `/oidc/*` **trong cùng deployable** — không phải service riêng, giữ đúng modular monolith.
- Bridge **không tự giữ mật khẩu**: `/oidc/authorize` đọc session Supabase Auth đã đăng nhập của Hub qua `auth-adapter` hiện có trong `packages/core` — không import SDK Supabase ở nơi khác (đúng luật cách ly hạ tầng, `01-architecture.md` §4).
- `sub` (định danh trong token) = `core.users.id` — không phải `auth.users.id` (cấm đọc trực tiếp), không phải `student_code` (mã hiển thị, không dùng làm khóa kỹ thuật).

### Endpoint bắt buộc

`/.well-known/openid-configuration` · `/oidc/authorize` · `/oidc/token` · `/oidc/userinfo` · `/oidc/jwks` · **`/oidc/session/end`** (`end_session_endpoint`) — theo chuẩn OIDC, thư viện tự sinh, không tự implement tay.

### Đăng xuất chung và thu hồi (ADR-016, 27/07/2026)

Đăng nhập một lần mà không có đường thoát chung thì chỉ làm xong một nửa.

- **`end_session_endpoint`**: thoát ở Hub → gọi back-channel logout tới mọi RP đang có phiên (mỗi RP khai `backchannel_logout_uri` trong config RP). Ca vận hành thật: phòng máy dùng chung, em sau ngồi vào không được thừa hưởng phiên Moodle của em trước.
- **Token sống ngắn:** `id_token`/`access_token` TTL ≤ 15 phút; refresh token có, nhưng **mỗi lần refresh kiểm `core.users.status`** — `disabled` thì từ chối. Tài khoản bị khóa mất đường vào mọi hệ trong tối đa một chu kỳ token, không cần đuổi theo thu hồi từng token đã phát.
- **Refresh token nay CÓ THẬT (31/07/2026).** Trước đó tài liệu hứa có mà cấu hình `grant_types` chỉ có `authorization_code` — nghĩa là dòng TTL refresh trong cấu hình là chữ chết, và câu "mỗi lần refresh kiểm status" ở trên **không có lần refresh nào để chạy**. Nay: grant `refresh_token` bật, RP phải xin scope `offline_access` mới nhận được (RP không xin thì không có gì đổi — tương thích ngược), TTL 12 giờ, và mỗi lần đổi token thư viện gọi lại hàm tra tài khoản nên `status='disabled'` bị chặn ngay tại đó. Đây là điều kiện để ADR-016 "khóa là cắt" đứng vững chứ không chỉ là lời hứa.
- **`/oidc/session/end` nay xóa cả cookie phiên của Hub (`hub_session`)**, không chỉ phiên phía thư viện OIDC. Thiếu bước này thì "đăng xuất chung" trả người dùng về Hub trong trạng thái vẫn đang đăng nhập — phòng máy dùng chung, em sau ngồi vào vẫn là em trước. Cưỡng chế bằng **middleware bám ĐƯỜNG DẪN**, không bằng hook của thư viện: đo thật trên `oidc-provider` 9.11.1 cho thấy khi chưa có phiên OIDC, hoặc khi RP có khai `post_logout_redirect_uri` (Factory có khai), thư viện **bỏ qua hook hoàn toàn**. Bản vá dựa vào hook sẽ TRÔNG như xanh mà cookie không bao giờ bị xóa cho đúng RP thật.
- **Biến môi trường bắt buộc ở `NODE_ENV=production`** (thiếu là dừng ngay lúc khởi động, không chạy nửa vời): `AUTH_SESSION_SECRET`, `INTERNAL_RPC_SECRET`, `OIDC_COOKIE_KEYS` (nhiều khóa cách nhau dấu phẩy, khóa đầu là khóa đang ký), và một trong hai `OIDC_JWKS` / `OIDC_SIGNING_KEY_PEM`.
- **Thông báo cho RP đang tích hợp (Factory):** `logout_token` từ nay có `exp` (2 phút), `typ: logout+jwt`, và `kid` là thumbprint thật của khóa. **RP phải tra JWKS theo `kid` trong header token, không được ghim cứng một tên khóa** — RP nào đang ghim thì đây là thay đổi phá vỡ, phải hẹn giờ đổi trước.
- **Nguồn sự thật của trạng thái là `core.users`**, không phải phiên đã cấp. RP không được cache hồ sơ người dùng quá TTL token.

### Claims vai trò — để Moodle tự xếp lớp (ADR-016)

Scope `hub_profile` (RP phải khai mới nhận được; mặc định vẫn chỉ là định danh trần):

| Claim | Kiểu | Ví dụ |
|---|---|---|
| `hub_role` | enum | `student` \| `teacher` \| `parent` \| `staff` |
| `hub_school` | string | `VA-Q7` (mã cơ sở) |
| `hub_classes` | array | `["6A1"]` — lớp đang học / đang dạy |

Không có claim nào chứa tên thật, `student_code`, số điện thoại hay địa chỉ. Cập nhật theo **lần đăng nhập kế tiếp** của user — Hub không đẩy thông báo chủ động sang RP khi em chuyển lớp (thêm một đường là thêm một thứ hỏng được; độ trễ thực tế thường dưới một ngày).

### Đăng ký Relying Party (RP) — từ 07/08/2026 nằm trong sổ Mini App, không còn trong mã (ADR-032, `0055`)

**Bản cũ của mục này viết:** *"khai báo qua config tĩnh (env/JSON) … chưa xây bảng + màn hình quản trị riêng cho tới khi có ≥3–4 RP thật — không xây thứ chưa cần"*. Ngưỡng đó đặt lúc chưa ai đấu nối app thứ hai, và cái nó bỏ qua không phải là sự tiện lợi:

> **Thu hồi một app phải qua một lần deploy.** Tắt app trong `/quan-tri/mini-app` cắt được nhúng và webhook, nhưng client OIDC nằm trong mảng TypeScript nên vẫn sống và vẫn đổi được `authorization_code` lấy token. Công tắc thu hồi thu hồi được hai phần ba, và không tầng nào nói ra điều đó.

Nay RP là **cùng một dòng** với Mini App trong `core.embedded_apps`, và **`client_id` chính là `app_id`** — không có cột thứ hai để lệch.

| Trường | Nguồn | Ghi chú |
|---|---|---|
| `client_id` | `app_id` | Đi thẳng vào URL `/embed/<app_id>`, header `x-embed-app`, và alias đã sinh cho từng em — nên nó không sửa được (`0052`) |
| `client_secret` | `process.env[sso_client_secret_env]` | Bảng giữ **TÊN** biến, không giữ giá trị. Biến chưa đặt ⇒ client **không được nạp** (fail-closed) + một dòng `console.error`. Không rơi về chuỗi rỗng |
| `redirect_uris` | `sso_redirect_uris` | Khớp chính xác chuỗi, không wildcard. https, không fragment — cưỡng chế bằng `core.moi_uri_la_https()` |
| `backchannel_logout_uri` | `sso_backchannel_logout_uri` | ADR-016 |
| `scope` | `sso_scopes` | **Nay được truyền xuống thư viện thật** — xem cảnh báo dưới |
| Hiệu lực | `enabled AND sso_enabled` | Đặt trong `core.v_oidc_clients`, một chỗ duy nhất |

**`/embed/relay` KHÔNG nằm trong bảng.** `clients.ts` tự thêm `${HUB_URL}/embed/relay` cho app có `origin`: URI đó thuộc về Hub (Embed Bridge, `08-embedded-apps.md` mục 3), không thuộc về app ngoài, và nạp nó vào bảng là ghi cứng một tên miền của chính mình vào dữ liệu.

**Cách nạp:** `provider.ts` truyền `clients: []` và một `adapter` factory — model `Client` đọc từ sổ, mọi model khác giữ `MemoryAdapter` của thư viện. `oidc-provider` tra danh sách tĩnh trước, không thấy thì gọi `adapter('Client').find(id)` rồi cache theo **băm của metadata trả về** (`lib/models/client.js`): dòng đổi ⇒ băm đổi ⇒ client dựng lại; dòng không đổi ⇒ dùng lại bản cache. Đường thay thế — dựng lại provider sau mỗi lần sửa — bị loại vì nó **đá văng mọi interaction, session và refresh_token đang sống của MỌI app khác** chỉ vì ai đó đổi một ô "ngày rà lại".

> **CẢNH BÁO TƯƠNG THÍCH (07/08/2026).** `scopes` trước nay được khai trong `clients.ts` rồi **không bao giờ truyền xuống thư viện**, nên mọi RP xin được cả bốn scope — kể cả `hub_profile` (vai + cơ sở + lớp) và `offline_access`. Mục "Phạm vi cố định" ngay dưới mô tả một hàng rào **chưa từng tồn tại**. Từ `0055` nó đi xuống thật: RP xin ngoài danh sách đã khai nhận `invalid_scope` tại `/oidc/auth`. Nếu một RP đang chạy gãy vì điều này, cách sửa là **tích thêm ô scope trên `/quan-tri/mini-app`** — không cần deploy.

### Khớp tài khoản — idempotent, dùng `core.identity_links` (sửa 27/07/2026)

Trước đây file này ghi `core.id_mappings(..., student_id/user_id)`. **Sai**: bảng đó FK về `core.students.id`, không có cột `user_id`, nên giáo viên và phụ huynh không map được — mà Moodle thì có giáo viên. Đã tách bảng (`02-database.md`, ADR-016):

- `core.id_mappings` = **sổ dữ liệu**, chỉ học sinh.
- `core.identity_links(system, external_id, user_id)` = **sổ đăng nhập**, mọi loại tài khoản.

Luật khớp:

- Lần đầu RP xác thực một user: upsert `core.identity_links(system='moodle', external_id=<id bên Moodle>, user_id)` (§9) — đăng nhập lần sau không tạo bản ghi đôi.
- **`UQ(system, external_id)`** — external_id RP báo về đã map user khác: chặn, ghi log, chờ người xử, không tự đoán (§8).
- **`UQ(system, user_id)`** — một user Hub chỉ có một tài khoản trong mỗi hệ ngoài. Thiếu ràng buộc này thì một người sinh nhiều tài khoản Moodle mà không ai thấy, và điểm/tiến độ nằm rải rác giữa các tài khoản.

### Bảo mật bắt buộc

- **PKCE bắt buộc** cho mọi client, kể cả confidential client.
- **Redirect URI** khớp chính xác chuỗi, không match theo prefix.
- Authorization code dùng một lần, hết hạn ≤60 giây.
- JWKS xoay vòng theo mặc định thư viện; không tự đặt khóa tĩnh vĩnh viễn.
- Mỗi lần issue token ghi audit log (ai, RP nào, khi nào) — khớp yêu cầu audit chung `06-resilience-security.md`.
- **Phạm vi cố định:** bridge chỉ cấp định danh (`openid profile`), KHÔNG cấp quyền gọi API/dữ liệu Hub cho RP — Moodle biết "đây là ai", không có nghĩa Moodle gọi được tRPC của Hub.

### Test bắt buộc

- Đăng nhập lần 2 cùng user → không tạo `identity_links` đôi (idempotency test theo mẫu chung §9).
- External_id đã map user khác → bị chặn, không tự gán.
- **Cùng user đăng nhập RP bằng external_id thứ hai → bị chặn** (`UQ(system, user_id)`), không sinh tài khoản trùng.
- Thiếu PKCE / redirect URI sai → `/authorize` từ chối, có log.
- **Đăng xuất chung:** gọi `end_session` → RP nhận back-channel logout; mở lại RP phải hỏi đăng nhập.
- **Khóa là cắt:** đặt `core.users.status='disabled'` → refresh token bị từ chối; sau khi token cũ hết hạn, RP không vào được.
- **Claims:** RP không khai scope `hub_profile` → token không chứa `hub_role`/`hub_school`/`hub_classes`; RP có khai → nhận đúng lớp hiện tại của user.

### Đã triển khai + chạy thật đầu-cuối (29/07/2026)

Không còn là spec — đã cắm thử một app ngoài thật (tiến trình Node độc lập, ngoài repo build của
Hub) qua toàn bộ luồng: SSO im lặng (đã có session Hub → 0 lần nhập lại), PKCE, đổi token, đọc
`hub_role`/`hub_school`/`hub_classes` qua `/oidc/me`, và đăng xuất chung (back-channel logout xóa
đúng phiên phía RP). Code: `apps/hub/server/oidc/{provider,interaction-handler,claims,clients}.ts`,
mount qua custom server `apps/hub/server.mjs`; app RP mẫu ở `apps/test-external-app/server.mjs`.

**Bẫy kỹ thuật đã gặp, ghi lại để không lặp lại:** `server.mjs` nạp `provider.ts` bằng Node ESM gốc
(Type Stripping) — MỘT instance Provider duy nhất, giữ đúng MỘT khóa ký JWKS ephemeral cho cả tiến
trình. Route handler nào nằm trong `app/api/**` được Next.js build bằng webpack RIÊNG — nếu route đó
`import` thẳng `provider.ts`, webpack tạo ra một module instance THỨ HAI, tự gọi `buildProvider()` lần
nữa, sinh một khóa RSA ephemeral KHÁC — ký `logout_token` bằng khóa không khớp JWKS thật đang phục vụ
ở `/oidc/jwks`, RP xác minh chữ ký luôn thất bại. Cách đúng: route handler gọi HTTP nội bộ vào
`server.mjs` (`POST /internal/oidc/backchannel-logout`, có `x-internal-secret`), không bao giờ
`import` thẳng bất kỳ file nào giữ state của Provider đang sống. Áp dụng cho MỌI route mới cần chạm
Provider thật, không riêng đăng xuất.

Vì sao endpoint mặc định của `oidc-provider` (`/auth`, `/token`, `/me`, `/jwks`, `/session/end`, `/request`)
KHÔNG tự nằm dưới `/oidc/*`: thư viện mount ở gốc issuer theo mặc định. `server.mjs` chỉ chuyển tiếp
path bắt đầu bằng `/oidc/*` sang Provider, nên phải khai `routes: {...}` trong cấu hình Provider để dịch
lại từng endpoint vào dưới `/oidc/` — thiếu bước này thì discovery document tự quảng cáo đúng nhưng
điều hướng ra ngoài phạm vi routing của `server.mjs`, mọi endpoint trả 404 từ chính Next.js.
