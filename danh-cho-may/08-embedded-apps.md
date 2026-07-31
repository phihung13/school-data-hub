---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 5
---

# Embedded Apps — chuẩn nhúng Mini App/tool ngoài vào Super App Shell (ADR-015, mở rộng ADR-017)

Áp dụng cho MỌI Mini App không sống trong monorepo hiện tại — kể cả app tự code trên hạ tầng khác, kể cả app dựng bằng công cụ AI/no-code (Base44, Google AI Studio / Firebase Studio, Lovable, v0, Bolt, hoặc tương đương). Mục tiêu người dùng cuối: thấy **một app duy nhất** — không có màn hình đăng nhập thứ hai, không có tab trình duyệt thứ hai, chỉ có một nút quay lại — trừ khi kỹ thuật của nền tảng ngoài ép buộc (Tier 3, xem mục 2).

## 0. Ba rổ dữ liệu — phân loại TRƯỚC cả Tier (ADR-017, 27/07/2026)

Tier trả lời "nhúng bằng cách nào". Rổ trả lời "được đụng vào dữ liệu gì" — câu hỏi này phải trả lời trước, vì nó quyết định app có được build hay không.

| Rổ | App kiểu gì | Được làm gì | Ai duyệt |
|---|---|---|---|
| **Xanh** — không gắn định danh học sinh | Bảng tin, thực đơn tuần căn tin, lịch CLB, nội dung hướng dẫn chung | Đọc & ghi dữ liệu chung. Không nhận alias, không nhận `student_id` dưới bất kỳ hình thức nào | 1 dev bảo trợ, PR thường |
| **Vàng** — có gắn định danh từng em | Fitness (chỉ số cơ thể, kết quả thể lực), căn tin (suất ăn, dị ứng), điểm danh CLB | Đọc & ghi qua ổ cắm chuẩn (mục 1): alias theo app + đường ghi staging + quyền theo người dùng | Hội đồng dữ liệu duyệt App Manifest |
| **Đỏ** — cấm tuyệt đối | `care.*`, `care.counselor_notes`, `health.*`, `attendance.checkins` (mood) | Không app ngoài nào chạm, ở mọi Tier, kể cả read-only | — không có đường xin |

**Cảnh báo phân loại sai hay gặp:** fitness và căn tin *nghe* như rổ Xanh nhưng là **rổ Vàng** — app fitness ghi chỉ số cơ thể của từng em, căn tin ghi em nào dị ứng món gì; cả hai buộc phải biết "đây là em nào" mới chạy được. Chỉ app hiển thị nội dung chung cho cả trường (thực đơn tuần, lịch CLB) mới là rổ Xanh.

## 1. Ổ cắm chuẩn — ba tính chất không đổi theo app (ADR-017)

Vì hướng đi là lâu dài và sẽ có nhiều app (quyết định 27/07/2026), Hub xây một ổ cắm dùng chung thay vì mỗi app một kiểu đấu dây.

### 1.1 Alias riêng theo từng app, do Hub sinh

`core.id_mappings(system='embed:<app-id>', external_id=<alias ngẫu nhiên>, student_id)` — **Hub sinh alias, app ngoài không được gửi external_id của riêng nó lên để tự khai**. Mỗi app một dải alias riêng: cùng một em thì app căn tin và app fitness nhận hai chuỗi khác nhau, nên hai app ngoài **không đối chiếu chéo dữ liệu học sinh với nhau được**; chỉ Hub ghép lại được.

### 1.2 Ghi qua staging, nhưng xử lý ngay

Không mở đường ghi mới: app ngoài đi đúng Đường 2 (`03-api.md`) — webhook → `staging.raw_embedded_events` (UQ `(source, external_id)`) → `promote()`. Khác một điểm với connector Tutor/Moodle: `promote()` cho nguồn embed chạy **theo sự kiện, ngay khi nhận**, không đợi cron đêm — độ trễ tính bằng giây, người dùng không cảm nhận được.

### 1.3 Quyền đi theo người dùng, không đi theo app

Mặc định app ngoài **không cầm khóa riêng**. Mọi lệnh ghi mang thẻ ngắn hạn của chính người đang mở app (lấy qua OIDC bridge, ADR-014), nên:

- RLS chạy đúng như khi người đó thao tác trong Hub — không phải viết nhánh policy mới cho "danh tính app";
- audit log ghi **tên người**, không ghi tên app — vẫn trả lời được câu "ai đã ghi dòng này";
- app không có cách nào lôi dữ liệu ngoài phạm vi của người đang dùng.

**Chỉ app tự host có máy chủ riêng** mới được cấp thêm scoped API key cho việc máy-gọi-máy (đồng bộ đêm, batch), và key đó vẫn chỉ mở 1–2 procedure đã khai trong Manifest.

> **Vì sao không phát khóa cho app no-code:** app dựng bằng Base44/Lovable phần lớn chỉ có phần giao diện, không có nơi kín để cất secret — nhét key vào đó thì ai mở trang cũng nhặt được, tức là vi phạm §4 dưới một cái tên khác. App **không có backend riêng ⇒ chỉ đi được đường 1.2 + 1.3**, không bao giờ được cấp key.

### 1.4 Bộ mẫu cho vibe team — điều kiện để ổ cắm sống được

Có chuẩn mà mỗi app mới lại phải hỏi 2 dev chính thì chuẩn vô nghĩa. Kèm theo ADR-017 phải có: **một app mẫu sao chép được** (đã đấu sẵn đăng nhập + một lệnh ghi mẫu qua Embed API) và **một trang hướng dẫn duy nhất**. Quy trình của vibe team: chép mẫu → điền tên app → khai rổ + Tier → mở PR. Không cần đọc hết hồ sơ kiến trúc.

### 1.5 Đăng nhập chung giai đoạn tạm — Google làm IdP cho app CHƯA cắm vào Hub (27/07/2026, cập nhật 31/07/2026)

**Hub đã chạy và đã cấp `HUB_URL`/`client_id` thật.** RP đầu tiên (Factory, factory.vietanh.org)
đăng nhập thật qua `/oidc/*` của Hub từ 30/07/2026 (Đường A — chỉ đăng nhập, chưa cấp quyền đọc/ghi
dữ liệu Hub) — xem `templates/prompt-sso-factory.md` để lấy mẫu prompt đã chạy thật, và
`09-hop-dong-app-ngoai.md` §1b cho quy trình xoay `client_secret` không làm gãy RP đang chạy.

Mục 1.5 này giờ chỉ còn áp dụng cho app **CHƯA cắm vào Hub được** — Viet Anh Class (đang chạy thật,
chưa migrate) và app mới của vibe team chưa tới lượt. App nào cắm được thẳng vào Hub thì đi thẳng
đường của Factory, không cần đường tạm dưới đây nữa.

Với app còn đi đường tạm: **được phép dùng Google làm nơi cấp định danh**, với điều kiện làm đúng ba
điều dưới — sai điều nào thì ngày cắm sang Hub phải viết lại phần đăng nhập:

1. **Chuẩn OIDC generic, KHÔNG dùng SDK riêng của nhà cung cấp** (`gapi`, `firebase/auth`, nút
   "Sign in with Google" đóng gói sẵn). Google là OIDC provider hợp chuẩn — vấn đề nằm ở SDK, không
   nằm ở Google.
2. **Discovery URL + client_id nằm trong biến môi trường**, không hard-code.
3. **Bảng liên kết định danh lưu `(issuer, subject)`, không chỉ `subject`.** Với Google
   `issuer = https://accounts.google.com`. Thiếu cột `issuer` thì khi đổi IdP, toàn bộ tài khoản mồ
   côi — đây chính là lý do `core.identity_links` ở Hub cũng khóa theo `(system, external_id)`.

**Cấu hình Google Cloud:** một project chung cho cả trường (consent screen khai một lần, chọn
Internal nếu có Workspace), **mỗi app một OAuth client riêng**. Cấm gom nhiều app vào một client:
không thu hồi riêng được, và log không phân biệt được app nào gọi. Ngoại lệ: cùng một app với nhiều
`redirect_uri` (prod + localhost).

**Ba giới hạn phải chấp nhận trong giai đoạn tạm** — đều biến mất khi Hub lên:

| Giới hạn | Hệ quả | Bù tạm |
|---|---|---|
| Google không có back-channel logout | "Thoát một nơi thoát mọi nơi" (ADR-016) chưa có | Token ≤15 phút |
| Khóa trong Hub không cắt được Google | Phải khóa tài khoản Google mới thật sự cắt | Quy trình tay khi có người nghỉ |
| Google giới hạn tuổi tài khoản | Học sinh mầm non/tiểu học không đăng nhập được | Giáo viên thao tác hộ |

**Gắn vào app ĐANG CHẠY** (Class, Moodle): bắt buộc khớp theo `email_verified` và gắn vào tài khoản
sẵn có, KHÔNG tạo hồ sơ mới — tạo mới thì người dùng thấy màn hình trắng và tưởng mất dữ liệu. Giữ
song song cách đăng nhập cũ ≥1 học kỳ.

**Quy trình hai bước, đừng làm ngược** (`templates/prompt-sso-app-ngoai.md`):

- **Bước 0 — bắt app tự khảo sát.** App đọc mã nguồn của chính nó, tự xác định `redirect_uri`, tên
  file cấu hình, tên bảng người dùng, rồi in ra bản hướng dẫn thao tác Google Console cho người
  không chuyên (5 phần cố định: bấm ở đâu · bảng ô-điền-gì với chuỗi hoàn chỉnh · cần gửi lại gì ·
  dán vào đâu · kiểm tra và lỗi hay gặp). Lý do bắt buộc có bước này: các giá trị đó nằm trong mã
  nguồn app, người đi đăng ký Google không thể biết, và sai một ký tự là Google từ chối.
- **Bước 2 — prompt code:** biến thể A (app mới) hoặc B (app đang chạy, có tài khoản cũ phải nối).

Ép định dạng đầu ra ở bước 0 là có chủ ý: để tự do thì mô hình hay trả lời "điền địa chỉ app của bạn
vào ô Redirect URI" — đúng lý thuyết, vô dụng khi thao tác, và giấu mất chỗ nó đang đoán.

## 2. Ba tầng tin cậy — chọn tier TRƯỚC khi viết dòng code đầu tiên

| Tier | Định nghĩa | Ai duyệt |
|---|---|---|
| **Tier 1 — Native** | Code sống trong monorepo (`apps/*`), cùng deployable với Hub | dev-agent, theo luật §1–§10 thông thường, không có gì mới |
| **Tier 2 — Embedded External** | Build ngoài monorepo (kể cả no-code/AI builder), nền tảng **cho phép** nhúng iframe | Hội đồng dữ liệu (đụng dữ liệu ra ngoài tầm kiểm soát trực tiếp của Hub) |
| **Tier 3 — Linked External** | Nền tảng **chặn** nhúng iframe (`X-Frame-Options`/CSP `frame-ancestors`) — không còn lựa chọn kỹ thuật nào khác ngoài mở tab | Hội đồng dữ liệu, rủi ro cao hơn Tier 2 vì Hub mất quyền kiểm soát UI hoàn toàn |

**Cách xác định Tier 2 hay Tier 3 — đo bằng lệnh thật, không đoán, không hứa trước khi đo:**

```
curl -sI https://<domain-app-ngoai> | grep -i "x-frame-options\|content-security-policy"
```

Thấy `X-Frame-Options: DENY`/`SAMEORIGIN` hoặc CSP `frame-ancestors` không cho domain Hub → tự động Tier 3, không thương lượng được vì đây là chính sách của nhà cung cấp nền tảng ngoài, Hub không sửa được. Việc đo này là bước đầu tiên của mọi hồ sơ đăng ký App Manifest (mục 5).

## 3. Tier 2 — Embed Bridge: vì sao "cứ nhúng iframe" là không đủ

Cookie phiên của Hub **không tự chia sẻ được** sang domain khác qua iframe — SameSite cookie, và trình duyệt (đặc biệt Safari ITP) ngày càng chặn chặt cookie cross-site trong iframe. "Không đăng nhập lại" cho Tier 2 phải làm bằng **trao token qua postMessage/redirect nội bộ**, không phải bằng chia sẻ cookie.

### Luồng chuẩn

1. Người dùng bấm mở Mini App ngoài trong Shell → Shell điều hướng route nội bộ `/embed/<app-id>` (cùng origin Hub, có session Hub sẵn — không phải trang của app ngoài).
2. `/embed/<app-id>` dựng khung: **header cố định NẰM NGOÀI iframe** (tên Mini App + nút "← Quay lại Hub") + một `<iframe>` trỏ domain ngoài đã duyệt trong App Manifest.
3. Trước khi set `src` của iframe, Hub gọi OIDC bridge (ADR-014, `packages/core/auth-adapter`) lấy authorization code ngắn hạn (TTL ≤ 60 giây).
4. **Trao mã bằng `postMessage`, không bằng query string** (sửa 27/07/2026, ADR-017). Hub nạp iframe với URL trần, đợi app con gửi `{type:'embed:ready'}`, rồi mới `postMessage` mã sang đúng `targetOrigin` = domain trong Manifest. Lý do bỏ query param: chuỗi truy vấn lọt vào `Referer` khi app con gọi bên thứ ba, vào log máy chủ của nền tảng ngoài và vào lịch sử trình duyệt — TTL 60 giây có giảm rủi ro nhưng không xóa được vết.
   - Hub **bắt buộc** kiểm `event.origin` khớp Manifest ở mọi thông điệp nhận về — thiếu bước này là lỗ hổng đánh cắp token kinh điển, CI có test.
   - Schema thông điệp cố định trong `packages/core/contracts` (`embed:ready`, `embed:token`, `embed:resize`, `embed:error`), có version.
   - Có timeout: app con không gửi `ready` trong 10 giây → Shell hiện lỗi và giữ nguyên nút thoát.
5. Nếu nền tảng ngoài cho chạy script khởi tạo tùy chỉnh (nhiều no-code builder cho việc này): app con tự POST tới `/oidc/token` của Hub (server-to-server, không qua trình duyệt) để đổi code lấy `id_token` (`sub = core.users.id`).
6. Nếu nền tảng ngoài **không** cho chạy script tùy chỉnh để tự đổi token (chỉ cho nhúng UI thuần): hạ xuống chế độ tối thiểu — app ngoài chỉ nhận **context token** (alias do Hub sinh theo mục 1.1, không phải định danh thật), TTL ≤ 5 phút, cũng qua `postMessage`. Đây KHÔNG phải "đăng nhập" theo chuẩn OIDC đầy đủ, chỉ là truyền ngữ cảnh hiển thị; mọi lệnh ghi dữ liệu vẫn bắt buộc qua Embed API (mục 4) có xác thực riêng.
7. Mọi ghi dữ liệu từ app ngoài gọi vào **Embed API** — không bao giờ tự lưu trực tiếp vào DB riêng của nền tảng ngoài.

### Vì sao nút quay lại phải nằm NGOÀI iframe

Nút "← Quay lại Hub" do Hub tự vẽ. Nếu để app ngoài tự vẽ nút quay lại bên trong nội dung của họ, họ có thể (vô tình hoặc do lỗi) làm nút không hoạt động, bị ẩn, hoặc đổi hành vi — Hub mất quyền kiểm soát điều hướng, đúng thứ người dùng ghét nhất ở trải nghiệm "app trong app" làm ẩu.

### CSP & sandbox bắt buộc

- `frame-src` chỉ allowlist domain đã ghi trong App Manifest — không wildcard.
- `<iframe sandbox="allow-scripts allow-forms allow-same-origin">` — KHÔNG `allow-top-navigation`, KHÔNG `allow-popups`, trừ khi App Manifest xin và được duyệt riêng theo từng trường hợp.
- Lưu ý về `allow-scripts` + `allow-same-origin` đi cùng nhau: cặp này chỉ an toàn **vì iframe khác origin với Hub** (app con giữ origin riêng của nó). **Cấm dùng bộ sandbox này để nhúng nội dung cùng origin với Hub** — khi đó app con thoát được sandbox và chạm được DOM của Shell.
- `Referrer-Policy: no-referrer` trên route `/embed/*`.

## 4. Embed API — cánh cửa ghi dữ liệu duy nhất cho app ngoài

Không bao giờ cấp `service_role` hay quyền tRPC đầy đủ cho app ngoài (đúng RULES §4, §10 — vẫn nguyên luật, không có ngoại lệ cho embedded app). Thay vào đó, theo thứ tự ưu tiên:

1. **Mặc định — quyền theo người dùng (mục 1.3):** lệnh ghi mang thẻ ngắn hạn của người đang mở app; RLS và audit chạy nguyên như trong Hub. Đây là con đường duy nhất cho app **không có backend riêng** (mọi app no-code thuần).
2. **Chỉ khi app tự host có máy chủ riêng:** cấp thêm **một API key phạm vi hẹp** (scoped, rate-limited theo `packages/core/contracts`, mặc định **30 req/phút/app**, khai khác thì ghi trong Manifest), chỉ gọi được đúng 1–2 tRPC procedure đã khai báo. Ví dụ: "Sổ tay đọc sách" chỉ được gọi `evidence.logDear` — không gọi được gì khác, kể cả đọc. Key nằm trong biến môi trường phía máy chủ của app, không bao giờ trong bundle client.
3. **Nếu nền tảng ngoài chỉ hỗ trợ webhook** (không gọi API tùy ý): dùng lại **nguyên xi** pattern connector đã có — webhook → `staging.raw_embedded_events` (UQ theo `source, external_id`, đúng §9) → `promote()` xử lý giống Tutor/Moodle/COR (chạy ngay theo sự kiện, mục 1.2). Không có luật mới, không có đường ghi thứ ba — đây vẫn là Đường 2 đã định nghĩa trong `03-api.md`, chỉ thêm một nguồn.

**`external_id` phải lặp lại được cho cùng một sự kiện.** Hub **từ chối** webhook thiếu `external_id`; Manifest phải khai cách sinh nó (ví dụ hash của `app-id + alias + ngày + loại sự kiện`). Công cụ no-code thường sinh UUID mới mỗi lần gửi lại — khi đó unique constraint vô hiệu và §9 chỉ còn trên giấy.

### Cấm tuyệt đối — điểm mấu chốt tuân thủ Luật 91/2025/QH15

App ngoài (Base44/Firebase Studio/v.v. đều có hạ tầng lưu trữ riêng của họ, thường ngoài tầm kiểm soát residency của trường) **không bao giờ** được lưu `student_code`, tên thật, hoặc bất kỳ định danh học sinh thật nào trong DB riêng của nền tảng đó. App ngoài chỉ được cầm **external reference token** — một chuỗi vô nghĩa, map qua `core.id_mappings(system='embed:<app-id>', external_id, student_id)` giống mọi connector khác (§1, không ngoại lệ).

## 5. App Manifest — hồ sơ đăng ký bắt buộc trước khi Tier 2/3 được duyệt

| Trường | Ví dụ |
|---|---|
| Tên app | Sổ tay đọc sách DEAR |
| **Rổ dữ liệu (mục 0)** | **Vàng** — có gắn định danh từng em |
| Nền tảng xây | Base44 / Google AI Studio / Lovable / tự host |
| **Có backend riêng?** | Không → chỉ đi đường quyền-theo-người-dùng + webhook, **không được cấp API key** |
| Domain nguồn | `dear-log.base44.app` |
| Kết quả đo `curl -I` | Không có X-Frame-Options chặn → Tier 2 |
| Owner | Tên vibe team + 1 dev bảo trợ |
| Quyền Embed API | `evidence.logDear` (chỉ ghi), không đọc gì |
| Rate limit | mặc định 30 req/phút/app |
| Cách sinh `external_id` | `sha256(app-id + alias + ngày + 'dear')` — lặp lại được |
| Dữ liệu chạm tới | `evidence` (không `care`/`health`) |
| Đăng ký OIDC RP | Không (chỉ dùng context token, không tự đổi token) |
| Ngày rà lại | mỗi 6 tháng — quá hạn không rà thì thu hồi quyền |

Chưa xây bảng quản trị + màn hình UI ngay từ đầu — quản lý bằng file config `packages/core/embedded-apps/registry.json`, review qua PR như mọi thay đổi vùng lõi (§10), tới khi có ≥5 app mới cân nhắc xây màn hình quản trị (không xây thứ chưa cần).

**Vòng đời app, không chỉ ngày sinh:** mỗi Manifest có ngày rà lại. Đến hạn mà owner không xác nhận app còn dùng → thu hồi alias + key, gỡ khỏi `frame-src`. App bị nền tảng ngoài khai tử (Base44 đóng cửa, domain hết hạn) xử lý y như vậy. Dữ liệu đã promote vào Hub vẫn giữ — nó thuộc về trường, không thuộc về app.

## 6. Không đổi — mọi luật cũ áp dụng nguyên xi, không có ngoại lệ cho embedded app

- **§1** (một mã học sinh): external reference qua `id_mappings`, không map thẳng bằng `student_code`.
- **§4** (không service_role ở client): Embed API key là scoped token qua middleware, không phải service_role, không phải JWT nội bộ đầy đủ quyền.
- **§7** (PII stripper): Mini App ngoài có tính năng gọi AI vẫn phải qua `pii-stripper` — cấm app ngoài tự gọi SDK AI với dữ liệu học sinh thô.
- **§8** (connector chỉ ghi staging): webhook từ app ngoài đối xử y hệt Tutor/Moodle/COR — không có đường ghi thứ ba.
- **§9** (idempotent): Embed API + webhook đều bắt buộc unique constraint + upsert, test bắn 2 lần.
- **ADR-011/012**: Core vẫn là Single Source of Truth; app ngoài không bao giờ là System of Record cho dữ liệu học sinh, dù ở Tier nào.

## 7. Test bắt buộc trước khi một Mini App Tier 2/3 go-live

- Đo lại `X-Frame-Options`/CSP xác nhận đúng Tier đã khai trong Manifest (nền tảng ngoài có thể đổi chính sách bất kỳ lúc nào — đo lại mỗi lần review, không tin kết quả đo lần đầu mãi mãi).
- Nút "Quay lại Hub" hoạt động cả khi app con bị treo/lỗi/trắng trang.
- **`postMessage` từ origin lạ bị bỏ qua** — bắn thông điệp từ một origin không có trong Manifest, Shell phải im lặng bỏ và ghi log, không được xử lý.
- **App con không gửi `embed:ready`** trong 10 giây → Shell hiện lỗi, nút thoát vẫn hoạt động.
- Embed API: gọi ngoài phạm vi được cấp (endpoint không thuộc manifest) → bị chặn, có log.
- Webhook (nếu dùng): bắn 2 lần cùng payload → không tạo bản ghi đôi (idempotency, §9); thiếu `external_id` → bị từ chối.
- **Alias không trùng dải giữa hai app:** cùng một `student_id` qua hai `app-id` khác nhau phải cho hai alias khác nhau.
- Rà thủ công: không trường nào trong request/response gửi cho app ngoài chứa `student_code`/tên thật ngoài phạm vi đã khai trong Manifest.
- **Rổ Đỏ bị chặn ở tầng contract:** Manifest khai procedure chạm `care`/`health`/mood → CI fail, không đợi review người.

## 8. Việc chưa làm, ghi rõ để không âm thầm bỏ qua

- Chưa có UI quản trị App Manifest (mục 5) — đang dùng file config, hợp lý ở quy mô hiện tại, xem `DEBT.md`.
- Chưa có cơ chế tự động phát hiện nền tảng ngoài đổi chính sách CSP giữa hai lần review (hiện là thủ công theo mục 7) — cân nhắc cron kiểm định kỳ khi số app Tier 2 đủ lớn.
- Chưa có cron nhắc hạn rà lại Manifest 6 tháng (mục 5) — hiện là lịch tay của dev bảo trợ.
- Tier 3 (mở tab, không nhúng được) vẫn cần màn hình cảnh báo rõ ràng phía Hub trước khi điều hướng ra ngoài ("Bạn sẽ rời khỏi Hub — đăng nhập lại có thể được yêu cầu tùy nền tảng") — chưa thiết kế UI cụ thể cho cảnh báo này.
- Bộ mẫu + trang hướng dẫn cho vibe team (mục 1.4) **chưa viết** — đây là điều kiện để ADR-017 thực sự dùng được, xếp cùng đợt với ổ cắm (sau khai giảng, ~T10/2026).
