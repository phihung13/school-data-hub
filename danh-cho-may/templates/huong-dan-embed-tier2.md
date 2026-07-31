---
ban-doi-ung: none
sync-version: 1
---

# Hướng dẫn duy nhất — cắm Mini App Tier 2 (nhúng iframe) vào Hub

Rút ra từ ca thật đầu tiên (Factory, factory.vietanh.org, 29/07/2026) — không phải lý thuyết.
Đây là "công thức sao chép" cho ADR-017 mục 1.4. Đọc kèm `08-embedded-apps.md` mục 0–3 để hiểu
rổ dữ liệu + Tier trước khi bắt đầu.

## Trước khi viết dòng code đầu tiên

1. **Xác định rổ dữ liệu** (Xanh/Vàng/Đỏ, mục 0 `08-embedded-apps.md`). Đỏ thì dừng, không có
   đường xin.
2. **Đo Tier bằng lệnh thật, không đoán:**
   ```
   curl -sI https://<domain-app> | grep -i "x-frame-options\|content-security-policy"
   ```
   Có `X-Frame-Options`/`frame-ancestors` chặn → Tier 3 (mở tab, không nhúng được). Không có →
   Tier 2, làm theo hướng dẫn này.
3. Có backend riêng (tự host) hay không — quyết định có được cấp `client_secret` (Đường A) và
   webhook secret (Đường B) hay chỉ đi quyền-theo-người-dùng.

## Đường A — SSO (làm trước, xong hẳn rồi mới sang Tier 2)

Dùng `templates/prompt-sso-app-ngoai.md` — gửi nguyên khối, KHÔNG bỏ qua bước "Bước 0 tự khảo
sát" nếu app đã chạy thật. Chạy 5 test bắt buộc trong `03-api.md` mục "Đăng ký RP" trước khi
đụng vào phần nhúng iframe. **Đừng làm tắt** — mọi lỗi ở Tier 2 phía dưới đều giả định Đường A
đã chạy sạch.

## Phần việc của Hub (dev-agent làm, mỗi app một lần)

### 1. Đăng ký thêm redirect_uri thứ hai cho OIDC client

Trong `apps/hub/server/oidc/clients.ts`, thêm vào mảng `redirect_uris` sẵn có của app:

```ts
redirect_uris: [
  "https://<domain-app>/api/auth/oidc/callback",      // Đường A — đã có
  "https://hub.truongvietanh.com/embed/relay",         // Tier 2 — thêm dòng này
],
```

URI thứ hai này **thuộc về Hub**, không cần hỏi app ngoài gì cả — cùng một giá trị cho MỌI app
Tier 2.

### 2. Đăng ký embed config trong `apps/hub/server/embed/registry.ts`

```ts
{
  appId: "<app-id>",
  webhookSecret: process.env.EMBED_WEBHOOK_SECRET_XXX ?? "",
  basket: "xanh" | "vang" | "do",  // "do" thì không đăng ký được, chặn ngay
  allowedEventTypes: ["*"],         // hoặc liệt kê cụ thể nếu muốn giới hạn (rổ Vàng nên giới hạn)
  embed: {
    displayName: "<Tên hiện trên tile + header>",
    origin: "https://<domain-app>",           // CHÍNH XÁC, không path, dùng cho CSP + kiểm postMessage
    iframeUrl: "https://<domain-app>/embed",  // route RIÊNG cho ngữ cảnh nhúng — không phải trang chủ
    iconImageUrl: "/<app-id>-icon.svg",       // tự host, xem bước 5
  },
},
```

### 3. Thêm tile vào trang chủ

Trong `apps/hub/server/routers/session.ts`, hàm `buildMiniApps()` — thêm một dòng `tiles.push(...)`
trong đúng nhóm vai trò cần thấy app này (staff/student/homeroom...). `href: "/embed/<app-id>"`.

### 4. Không cần viết thêm code cho `/embed/[appId]`, `embed-frame.tsx`, `middleware.ts`,
   `embed-floating-menu.tsx`

Bốn file này đã **tổng quát hoá sẵn** (đọc từ registry, không hard-code tên app nào) — app mới
chỉ cần đăng ký ở bước 1–3, không đụng vào các file này.

**Bố cục đã chốt (29/07/2026, sau khi thử với người dùng thật):** KHÔNG có thanh header ngang
lặp lại tên/logo app — app con đã có thương hiệu riêng (sidebar/logo của chính nó), một thanh
ngoài là thừa. Chỉ còn:
- Nền viền cách quanh khung (gradient tím→navy) + khối nội dung bo góc + đổ bóng — cảm giác
  "một mảnh nằm trong Hub", không phải trang web riêng chiếm trọn màn hình.
- Capsule ⋯│✕ NỔI đè lên góc trên phải (không chiếm hàng riêng). Nút ⋯ có menu thật (Tải lại,
  Mở tab mới) — không phải trang trí, giống nút "..." của Zalo Mini App.
- iframe giữ kích thước CỐ ĐỊNH khớp khung — KHÔNG dùng `embed:resize` để giãn iframe theo nội
  dung nữa (từng làm vậy, xung đột với bố cục thẻ cố định: nội dung dài hơn khung bị cắt mất,
  không cuộn được). Để trình duyệt tự cho iframe cuộn nội bộ — mặc định, không cần code thêm.

### 5. Logo thật, tự host

```bash
curl -s -o "apps/hub/public/<app-id>-icon.svg" "https://<domain-app>/icon.svg"
```
Không trỏ thẳng domain app ngoài trong `<img src>` — tự host để tile Hub không phụ thuộc app đó
còn sống hay không. Kiểm `favicon.ico`/`icon.svg`/`apple-icon.png` — hầu hết app Next.js hiện đại
có sẵn.

## Phần việc của app ngoài (gửi nguyên khối này cho dev app đó)

```
Route /embed (RIÊNG, không phải trang chủ thường) cần:

1. Sinh cặp PKCE TRONG TRÌNH DUYỆT lúc mount (verifier ≥43 ký tự theo RFC 7636 — dùng
   crypto.getRandomValues, KHÔNG dùng Math.random). Giữ verifier trong useRef/biến JS, KHÔNG
   đưa vào React state (tránh lộ qua DevTools), KHÔNG log ra console.

2. postMessage({ type: "embed:ready", codeChallenge }, "https://hub.truongvietanh.com") —
   NHẮC LẠI mỗi ~700ms tối đa ~20 lần cho tới khi nhận được embed:token. Bên nhận (Hub) có thể
   gắn listener SAU khi trang đã tải — gửi một lần duy nhất sẽ bị lỡ.

3. Lắng nghe postMessage trả về, BẮT BUỘC kiểm event.origin === "https://hub.truongvietanh.com":
   - { type: "embed:token", code } → đổi token (bước 4)
   Chặn double-invoke: đánh dấu code đã xử lý NGAY khi nhận, TRƯỚC mọi await (React StrictMode
   dev mode gọi effect 2 lần — nếu không chặn, gọi đổi token 2 lần, lần 2 luôn invalid_grant vì
   code chỉ dùng được 1 lần).

4. Đổi token — GIỮ NGUYÊN thư viện OIDC chuẩn đã dùng cho Đường A (đừng tự viết fetch thuần,
   đừng hạ chuẩn bỏ verify chữ ký id_token). Nếu thư viện đó validate response theo kiểu
   "callback URL thật" (đọc iss/state từ req.url) — dựng lại object đó thủ công đủ trường,
   ĐẶC BIỆT chú ý "iss" nếu Hub khai authorization_response_iss_parameter_supported (RFC 9207):
   iss = "https://hub.truongvietanh.com"
     redirect_uri = "https://hub.truongvietanh.com/embed/relay"   ← CỦA HUB, không phải của bạn
     code_verifier = verifier đã sinh ở bước 1

5. embed:error khi hỏng — gửi kèm "reason" (chuỗi ngắn, không phải secret) để Hub thấy được
   trong khung nhúng mà không cần soi console xuyên domain khác (Hub KHÔNG đọc được console
   bên trong iframe khác domain).

6. embed:resize — Hub HIỆN KHÔNG CÒN DÙNG (bố cục khung cố định từ 29/07/2026, xem mục 4 phía
   trên) — cứ gửi nếu muốn (vô hại), nhưng đừng phụ thuộc vào nó để hiện đủ nội dung. Đảm bảo
   trang của bạn tự cuộn được bên trong kích thước iframe cố định (thường vừa khít khung Hub
   cấp) — không giả định iframe sẽ giãn theo chiều cao nội dung.

7. Mở /embed trực tiếp (không qua Hub) → hiện màn "dành cho khung nhúng", KỂ CẢ khi đã có phiên
   sẵn — đừng chỉ tự kiểm ở trạng thái chưa đăng nhập rồi kết luận cho mọi trường hợp.

8. KHÔNG tự vẽ nút thoát/quay lại/menu ra ngoài Hub trong route này — Hub đã vẽ một capsule NỔI
   cố định (⋯│✕) đè lên góc trên phải, NGOÀI iframe. Toàn bộ điều hướng NỘI BỘ giữa các tính
   năng của chính app vẫn là của bạn (sidebar, tab, menu riêng) — không cần rào, không cần ẩn —
   chỉ "thoát khỏi app" là việc của Hub. KHÔNG cần hiện lại logo/tên app ở đầu trang riêng cho
   ngữ cảnh nhúng — Hub không còn vẽ thanh header lặp lại nữa, sidebar/thương hiệu của chính
   bạn là đủ.
```

## Bẫy kỹ thuật đã gặp thật — đọc trước khi debug lại từ đầu

1. **CSP `frame-src` của Hub tự chặn iframe ẨN của chính Hub.** `/embed/[appId]` còn dựng một
   iframe ẩn trỏ `/oidc/auth` (bước lấy mã) — CSP phải có `'self'` NGOÀI domain app, không chỉ
   domain app. (`middleware.ts` đã sửa, chỉ ghi lại để không ai lặp lại.)
2. **Đua tranh khi `embed:ready` nhắc lại.** Hub chỉ được xử lý ĐÚNG MỘT LẦN — dùng `useRef` gate
   ngay đầu handler, không dùng state (state update là async, nhiều lượt nhắc lọt qua trước khi
   re-render kịp).
3. **`iss` thiếu trong callback giả lập phía app ngoài** (RFC 9207) — xem mục "Phần việc của app
   ngoài" bước 4.
4. **Double-invoke đổi token 2 lần** (React StrictMode dev, hoặc app tự retry) → lần 2 luôn
   `invalid_grant` vì code dùng một lần. Chặn ở CẢ hai tầng: trình duyệt (cờ ngay khi nhận
   message) VÀ máy chủ (nhớ theo code trong ~60 giây, gọi lại trả cùng kết quả, không gọi Hub
   lần nữa) — tầng trình duyệt không đỡ được trường hợp remount/2 tab.
5. **Hydration mismatch do tiện ích chặn quảng cáo xóa `<link>` Google Fonts trước khi React
   hydrate.** Không liên quan trực tiếp Embed Bridge nhưng lộ ra rõ nhất khi test app nhúng —
   tự host font qua `next/font/google`; font không hỗ trợ (icon font biến thể) thì nạp bằng
   `useEffect` sau khi hydrate xong, không render `<link>` lúc SSR.
6. **Sandbox iframe thiếu `allow-same-origin`** → cookie phiên app con (thường
   `SameSite=None; Secure; Partitioned`) không lưu/gửi lại được, khung "đổi token xong vẫn quay
   về màn tải" — triệu chứng giống hệt token hỏng nhưng nguyên nhân khác hẳn. Chuẩn tối thiểu:
   `sandbox="allow-scripts allow-forms allow-same-origin"`, thêm `allow-popups` nếu app cần mở
   tab/tải file từ trong khung.
7. **Timeout "không phản hồi" tự bật rồi tự tắt.** App con nhắc lại `embed:ready` tới ~20 lần ×
   ~700ms (~14 giây) trước khi bỏ cuộc — nếu Hub đặt timeout ngắn hơn khoảng đó (từng để 10 giây)
   thì banner lỗi hay lóe lên đúng lúc mọi thứ vẫn đang chạy bình thường. Đặt timeout Hub dư ra so
   với mức app con tự chịu (đã đổi thành 18 giây).
8. **Hiệu ứng "lò xo" (rubber-band/overscroll) khi trang không có gì để cuộn.** Lướt 2 ngón trên
   trackpad kéo lộ màu nền ngoài viền trang. Khóa bằng `overscroll-behavior: none` trên `html` và
   `body` — không ảnh hưởng cuộn bình thường khi trang thật sự dài hơn màn hình.
9. **Icon font hiện chữ thật ("more_horiz", "close"...) đúng lúc trang vừa tải/tải lại**, trước
   khi font tải xong (glyph chưa thay được chữ). Ẩn phần tử icon (`visibility: hidden`, không
   dùng `display: none` để khỏi giật layout) cho tới khi `document.fonts.load(...)` xác nhận
   xong, lúc đó mới thêm class hiện lại (`icon-font-loader.tsx` + rule `.msr`/`html.msr-ready .msr`
   trong `globals.css`).

## Test bắt buộc trước khi app Tier 2 go-live (khớp `08-embedded-apps.md` mục 7)

- Bấm ô app trên trang chủ Hub → hiện đúng nội dung app, không màn trắng, không hỏi đăng nhập lại.
- Mở thẳng route `/embed` của app (không qua Hub) → hiện màn "dành cho khung nhúng", không lộ nội
  dung thật.
- `postMessage` từ origin lạ (giả lập bằng cách gửi thử từ console một tab khác origin) → Hub bỏ
  qua im lặng, có log cảnh báo.
- Không phản hồi `embed:ready` trong 18 giây → Hub hiện lỗi, nút thoát vẫn hoạt động.
- Gọi webhook 2 lần cùng `external_id` → không tạo bản ghi đôi, response thứ hai `already_promoted`.
- Đăng xuất ở Hub → phiên app con cũng đóng (back-channel logout, đã có sẵn cho Đường A, không
  cần làm gì thêm cho Tier 2).
