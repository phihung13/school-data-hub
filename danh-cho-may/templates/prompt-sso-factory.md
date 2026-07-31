---
ban-doi-ung: none
sync-version: 3
---

# Prompt cắm SSO cho Factory (factory.vietanh.org) — đã điền sẵn

Rổ dữ liệu: **Xanh** (không gắn định danh học sinh). Có backend riêng (tự host) → được dùng
`client_secret`. Đây là **Đường A** — chỉ đăng nhập, chưa cấp quyền đọc/ghi dữ liệu Hub.

Đo `curl -I https://factory.vietanh.org` ngày 29/07/2026: không có `X-Frame-Options`/CSP chặn
iframe → **Tier 2**, nhưng bước này (Đường A) không cần biết Tier, chỉ cần xong đăng nhập trước.

**`hub.truongvietanh.com` đã trỏ thật (29/07/2026)** qua named Cloudflare Tunnel cố định
(`cloudflared tunnel run hub-vietanh`) vào Hub đang chạy — địa chỉ này **không đổi** khi Hub
khởi động lại (khác tunnel tạm dùng lúc đầu buổi). Vẫn là hạ tầng tạm (máy dev, không phải VPS
theo ADR-018/019) — khi có VPS thật, chỉ cần trỏ lại DNS, không đổi `Discovery URL`/`client_id`
phía Factory.

**Chưa đăng ký `client_id`/`client_secret` dưới vào Hub thật** — còn thiếu `redirect_uri` chính
xác (chỉ Factory biết). Gửi prompt này, đợi dev báo lại đúng 5 mục cuối, rồi đăng ký (xem "Việc của
phía Hub" cuối `templates/prompt-sso-app-ngoai.md`).

---

Dán nguyên khối dưới đây cho dev Factory:

```
Hãy tích hợp đăng nhập cho ứng dụng này bằng chuẩn OpenID Connect (OIDC), dùng
Authorization Code Flow kèm PKCE. Nhà cung cấp định danh là School Data Hub của
Hệ thống Trường Việt Anh.

THÔNG TIN CẤU HÌNH
- Discovery URL: https://hub.truongvietanh.com/.well-known/openid-configuration
  (tự đọc từ đây, đừng hard-code từng endpoint)
- client_id: factory
- client_secret: <HỎI DEV — KHÔNG BAO GIỜ GHI VÀO FILE NÀY>
  (Repo này công khai từ 31/07/2026. Secret đọc từ biến môi trường
  `OIDC_CLIENT_SECRET_FACTORY` trên máy chủ Hub; gửi cho Factory qua kênh riêng,
  không dán vào tài liệu. Hai chuỗi từng nằm ở đây trong các bản trước — cả hai
  đã chết, đừng gửi lại nếu bạn thấy chúng trong lịch sử git.
  Xoay khóa thì theo §1b của `09-hop-dong-app-ngoai.md`: mở cửa sổ chồng lấn,
  báo trước, không âm thầm. App có máy chủ riêng nên dùng được client_secret;
  giữ trong biến môi trường phía máy chủ, TUYỆT ĐỐI không đưa vào mã chạy
  trong trình duyệt.)
- scope: openid profile

YÊU CẦU BẮT BUỘC — không đạt đủ thì đăng ký sẽ bị từ chối

1. PKCE bắt buộc, dù đã có client_secret.
2. redirect_uri phải khớp chính xác từng ký tự với URL đã đăng ký. Không dùng
   wildcard, không dùng khớp theo tiền tố.
3. Dùng một thư viện OIDC client chuẩn của nền tảng đang dùng. TUYỆT ĐỐI không
   tự viết tay giao thức (rất dễ sai ở PKCE, kiểm chữ ký, và xoay khóa).
4. Sau khi đăng nhập, app nhận một trường "sub" — đây là một chuỗi UUID vô nghĩa.
   Dùng đúng chuỗi này làm khóa tài khoản trong app.
5. TUYỆT ĐỐI KHÔNG lưu, không hiển thị, không suy đoán: tên thật học sinh, mã học
   sinh, email, số điện thoại, ngày sinh. App chỉ được biết "sub". Nếu cần hiển thị
   tên người đang đăng nhập, lấy từ trường "name" trong id_token và chỉ giữ trong
   phiên làm việc, không ghi xuống cơ sở dữ liệu của app.
6. Vòng đời phiên:
   - access_token/id_token sống tối đa 15 phút. KHÔNG cache hồ sơ người dùng lâu
     hơn thời hạn token. Hết hạn thì hỏi lại Hub — đó chính là lúc Hub từ chối nếu
     tài khoản đã bị khóa.
   - Phải hiện thực back-channel logout: mở một endpoint (ví dụ /oidc/backchannel-logout)
     nhận logout_token từ Hub, xác thực chữ ký bằng JWKS ở
     https://hub.truongvietanh.com/oidc/jwks, rồi đóng phiên phía app ngay lập tức.
   - Phải có nút Đăng xuất gọi end_session_endpoint của Hub, không chỉ xoá cookie
     phía app.
7. Đăng nhập lại nhiều lần với cùng một người KHÔNG được tạo thêm tài khoản mới
   trong app. Khoá theo "sub", dùng upsert. Hãy viết một bài test cho việc này.
8. Không xin thêm scope nào ngoài "openid profile". Nếu app thật sự cần biết người
   đăng nhập là giáo viên hay học sinh, xin thêm scope "hub_profile" — sẽ nhận thêm
   hub_role, hub_school, hub_classes. Không khai thì không nhận, và đó là mặc định đúng.
9. Đăng nhập KHÔNG kèm quyền đọc/ghi dữ liệu của Hub. Đừng viết bất kỳ đoạn mã nào
   gọi API dữ liệu của Hub — chưa được cấp, gọi sẽ bị chặn và ghi log.

SAU KHI LÀM XONG, HÃY BÁO CÁO LẠI CHO TÔI ĐÚNG 5 THÔNG TIN NÀY:
1. redirect_uri chính xác (đầy đủ https://…)
2. backchannel_logout_uri chính xác
3. Xác nhận: app có máy chủ riêng, client_secret có được giữ đúng phía máy chủ không
4. Thư viện OIDC đã dùng
5. Kết quả tự kiểm: đăng nhập 2 lần chỉ ra 1 tài khoản; thoát ở Hub thì app cũng thoát
```

## Việc của tôi (phía Hub) — ĐÃ XONG (29/07/2026)

1. ✅ `factory` đã đăng ký trong `apps/hub/server/oidc/clients.ts` với đúng `redirect_uri`/
   `backchannel_logout_uri` Factory báo cáo.
2. ✅ 5 bài test chạy trên Hub thật (không đụng server Factory): PKCE bắt buộc, redirect_uri
   sai bị từ chối, sai `client_secret` bị 401, đúng secret ra đúng claims, `identity_links`
   ghi đúng một dòng. Tất cả đạt.
3. ✅ Ô "Factory" đã lên lưới Mini App trang chủ Hub (`/embed/factory`), hiện cho mọi vai trò
   nhân viên (không hiện với học sinh/phụ huynh).

**→ Bạn (Factory) có thể bật nút "Tiếp tục với tài khoản trường" trên bản chạy thật ngay —
Đường A đã sống.**

---

# Phần 2 — Nhúng iframe (Tier 2) + gửi toàn bộ dữ liệu về Hub (Đường B)

Hai việc mới, độc lập với nhau, Factory tự chọn thứ tự làm.

## 2A. Nhúng iframe vào trang chủ Hub

Hub đã dựng xong khung bao ngoài (`/embed/factory`, có nút "← Quay lại Hub" NGOÀI iframe,
CSP `frame-src` chỉ cho phép `https://factory.vietanh.org`). Phần còn thiếu là ở phía Factory —
một trang **riêng cho ngữ cảnh nhúng**, khác trang chủ thường:

```
Dựng một route mới: https://factory.vietanh.org/embed
(route này CHỈ dùng khi bị nhúng trong iframe từ Hub — không phải trang chủ thường của Factory).

Route này phải:

1. Khi tải xong, tự sinh một cặp PKCE (code_verifier ngẫu nhiên + code_challenge = SHA256(verifier),
   y hệt cách bạn đã làm ở Đường A) — verifier CHỈ giữ trong bộ nhớ của chính trang này
   (biến JS hoặc sessionStorage), KHÔNG bao giờ gửi ra ngoài.

2. Gửi tín hiệu ra ngoài:
   window.parent.postMessage({ type: "embed:ready", codeChallenge: "<code_challenge vừa sinh>" },
     "https://hub.truongvietanh.com")

3. Lắng nghe postMessage trả về, BẮT BUỘC kiểm event.origin === "https://hub.truongvietanh.com"
   (bỏ qua nếu khác, không xử lý gì cả — đây là điểm chống giả mạo quan trọng nhất của cả luồng):
   window.addEventListener("message", (event) => {
     if (event.origin !== "https://hub.truongvietanh.com") return;
     if (event.data.type === "embed:token") {
       const code = event.data.code;
       // bước 4 dưới đây
     }
   });

4. Khi nhận được `code`: gọi từ BACKEND của Factory (server-to-server, dùng lại đúng logic
   openid-client đã viết cho Đường A) tới:
   POST https://hub.truongvietanh.com/oidc/token
   - grant_type=authorization_code
   - code=<code vừa nhận>
   - redirect_uri=https://hub.truongvietanh.com/embed/relay   ← LƯU Ý: URI NÀY THUỘC VỀ HUB,
     không phải của Factory. Đây là redirect_uri THỨ HAI, khác với redirect_uri Đường A
     (https://factory.vietanh.org/api/auth/oidc/callback). Đã đăng ký sẵn cả hai phía Hub.
   - code_verifier=<verifier đã sinh ở bước 1, CHƯA từng rời trình duyệt>
   - xác thực bằng client_id/client_secret như cũ

   Đổi được token thì dựng phiên như Đường A vẫn làm — chỉ khác chỗ nhận `code` (qua
   postMessage thay vì query string URL).

5. (Tùy chọn) nếu nội dung trang co giãn theo dữ liệu, gửi thêm:
   window.parent.postMessage({ type: "embed:resize", height: document.body.scrollHeight },
     "https://hub.truongvietanh.com")
   Hub sẽ tự chỉnh chiều cao khung nhúng theo giá trị này.

6. KHÔNG tự vẽ nút "quay lại" hay bất kỳ điều hướng ra khỏi trang nào trong route này —
   Hub đã có nút đó nằm NGOÀI iframe. Route /embed chỉ nên có đúng nội dung Factory, không
   có header/nav riêng của Factory (tránh 2 lớp điều hướng chồng nhau).

BÁO CÁO LẠI:
1. Route /embed đã dựng xong, phản hồi HTML hợp lệ khi tải trực tiếp (không cần nhúng)
2. Kết quả tự kiểm: mở Hub → bấm ô Factory → thấy đúng nội dung Factory hiện trong khung,
   không phải màn hình trắng, không bị hỏi đăng nhập lại
3. Kết quả tự kiểm: mở thẳng factory.vietanh.org/embed KHÔNG qua Hub (postMessage tới cửa sổ
   không tồn tại) → không crash, không lộ code_verifier ra console/network tab
```

## 2B. Gửi toàn bộ sự kiện nghiệp vụ về Hub (Đường B — cổng nhận chung)

Rổ Xanh, không giới hạn loại sự kiện — gửi bất kỳ việc gì Factory muốn Hub biết, giữ nguyên
payload tự do (JSON), Hub không ép khuôn trước. Factory **vẫn giữ toàn bộ dữ liệu chi tiết
trong DB riêng của mình** — đây chỉ là bản tóm tắt/audit gửi song song, không phải đồng bộ hai
chiều, không phải Hub trở thành nơi lưu chính.

```
Mỗi khi có một việc nghiệp vụ đáng ghi lại (tạo gói, gửi duyệt, duyệt, từ chối, xuất bản...),
gọi:

POST https://hub.truongvietanh.com/api/embed/webhook
Headers:
  Content-Type: application/json
  x-embed-app: factory
  x-embed-secret: yEkPs_fiMt-Z14fszczg9NOWSP78sGI6qKYG6k3DEZw
Body:
{
  "external_id": "<chuỗi LẶP LẠI ĐƯỢC cho đúng sự kiện này>",
  "event_type": "<tên tự đặt, ví dụ: package_created, package_submitted, package_approved>",
  "actor_user_id": "<sub của người thực hiện — CHÍNH LÀ trường 'sub' Factory đã nhận lúc
                     người đó đăng nhập qua Hub OIDC, không cần tra lại>",
  "payload": { ... tùy ý, bao nhiêu trường cũng được ... }
}

BẮT BUỘC:
- external_id phải SINH RA GIỐNG HỆT NHAU nếu gọi lại cho đúng sự kiện đó (ví dụ: hash của
  package_id + version + trạng thái, hoặc chính ID bản ghi trong DB Factory + tên event_type).
  KHÔNG sinh UUID mới mỗi lần gửi — sẽ mất tác dụng chống trùng, ghi đè lẫn nhau sai.
- Gọi lại với cùng external_id không tạo thêm bản ghi, chỉ cập nhật payload mới nhất — tự kiểm
  bằng cách gọi 2 lần cùng dữ liệu, xem Hub trả "already_promoted" ở lần thứ hai.
- KHÔNG gửi bất kỳ trường nào có tên/mã học sinh thật — Factory là rổ Xanh, không có gì liên
  quan học sinh; nếu sau này Factory bắt đầu chạm dữ liệu học sinh, việc này phải dừng lại và
  báo Hub trước, không tự ý gửi.

Phản hồi mẫu: {"ok":true,"rawId":"7","status":"promoted"}
("already_promoted" nếu external_id đã gửi trước đó — không phải lỗi.)

BÁO CÁO LẠI: thử gửi 1 sự kiện thật, dán lại response Hub trả về.
```

---

# Phần 3 — Sửa dứt điểm bước đổi token cho route /embed (29/07/2026)

Sau nhiều vòng debug (CSP tự chặn phía Hub, đua tranh `embed:ready` phía Hub, thiếu `iss` phía
Factory — cả ba đã sửa xong, request thật đã lần đầu chạm được `/oidc/token`), vẫn còn lỗi
`invalid response encountered` từ `openid-client`. Nguyên nhân gốc: hàm tiện ích
`callback()`/`authorizationCodeGrant()` của `openid-client` được thiết kế để validate **một URL
redirect HTTP thật** (đọc từ `req.url`, kiểm `iss`, `state`, và có thể còn kiểm thêm những thứ
khác chưa lộ ra hết). Route `/embed` không có URL redirect thật — code tới qua `postMessage` —
nên mọi lần dựng lại object giả cho hàm đó dùng là một chỗ có thể thiếu tiếp. Thay vì tiếp tục dò
từng trường object đó, bỏ hẳn hàm tiện ích cho riêng route này.

```
CHỈ ĐỔI CÁCH ĐỔI TOKEN CHO ROUTE /embed — Đường A (redirect thật) giữ nguyên, không đụng vào.

Bỏ hàm callback()/authorizationCodeGrant() của openid-client cho bước này. Gọi thẳng bằng
fetch/axios bình thường tới token_endpoint (đọc từ discovery document, đừng hard-code), không
qua bất kỳ lớp validate URL/callback nào của thư viện:

POST https://hub.truongvietanh.com/oidc/token
Headers:
  Content-Type: application/x-www-form-urlencoded
  Authorization: Basic <base64(client_id:client_secret)>
Body (application/x-www-form-urlencoded):
  grant_type=authorization_code
  code=<code nhận được qua postMessage>
  redirect_uri=https://hub.truongvietanh.com/embed/relay
  code_verifier=<verifier đã sinh trong trình duyệt lúc đầu>

Response thành công (200, JSON thường):
  { "access_token": "...", "id_token": "...", "expires_in": 900, "scope": "openid profile",
    "token_type": "Bearer" }

Đọc "id_token" (là một JWT chuẩn — decode bằng thư viện jose/jsonwebtoken sẵn có, KHÔNG cần
openid-client cho việc này) để lấy "sub". Không cần validate chữ ký JWT lại lần nữa nếu bạn tin
kết nối HTTPS trực tiếp tới Hub (server-to-server, không qua trình duyệt) — nhưng nếu muốn chắc
chắn tuyệt đối, verify chữ ký bằng JWKS ở https://hub.truongvietanh.com/oidc/jwks, đúng cách đã
làm cho logout_token.

Response lỗi (400/401, JSON thường): { "error": "...", "error_description": "..." } — đọc thẳng
2 trường này, không cần thư viện diễn giải.

Đây chính là lệnh tôi (Hub) đã tự chạy bằng curl và THÀNH CÔNG — copy logic y hệt, không có gì
bí ẩn ở phía Hub cả.

BÁO CÁO LẠI:
1. Đổi được token thành công qua cách gọi thẳng này chưa — dán response JSON (che access_token/
   id_token nếu muốn, chỉ cần thấy có đủ 5 trường)
2. Sau khi có token, phiên Factory bên trong khung nhúng có dựng lên bình thường không (cookie
   SameSite=None; Secure; Partitioned) — đây là nghi phạm TIẾP THEO nếu bước đổi token qua rồi
   mà khung vẫn treo ở màn tải
```

**Cập nhật 29/07/2026 — chạy được thật, xác nhận bằng ảnh chụp màn hình.** Nội dung Factory
("Bản đồ tri thức") hiện đúng trong khung Hub, `embed:resize` hoạt động, không còn hỏi đăng nhập
lại. Cảm ơn phần việc kỹ lưỡng của bạn.

---

# Phần 4 — Mở lại nội dung/điều hướng riêng của Factory bên trong `/embed` (29/07/2026)

Hub vừa đổi header bao ngoài từ dạng "← Quay lại Hub" (chữ) sang **capsule ⋯│✕** — đúng
component `MiniAppHeader` đang dùng cho mọi Mini App khác trong Hub (buồng lái, check-in…),
giống cách Zalo/Momo Mini App chỉ có một nút đóng cố định do nền tảng vẽ, còn lại **toàn bộ nội
dung và điều hướng bên trong là của chính mini app**.

Route `/embed` hiện tại của Factory đang dựng CHỈ một view duy nhất (bản đồ tri thức), không có
cách nào điều hướng sang các phần khác của Factory (nếu có). Đây là hệ quả của việc route đó cố
tình dựng tối giản trong lúc chỉ lo xong phần đăng nhập — giờ phần đăng nhập đã xong, đề nghị:

```
Route /embed giờ được nhúng dưới một capsule thoát cố định do Hub vẽ (nút ⋯ và ✕ ở góc trên bên
phải, NẰM NGOÀI iframe của bạn) — bạn không cần tự vẽ nút thoát/quay lại nữa (đã đúng, giữ
nguyên). Nhưng bạn CÓ THỂ và NÊN giữ lại toàn bộ điều hướng NỘI BỘ của Factory bên trong khung
(chuyển màn, menu giữa các tính năng, tab...) — Hub không giới hạn việc đó, chỉ giới hạn phần
"thoát ra khỏi Factory" phải đi qua nút của Hub.

Nếu /embed hiện tại chỉ mới dựng đúng 1 view để test đăng nhập, đây là lúc mở rộng nó thành trải
nghiệm đầy đủ của Factory (mọi màn hình, mọi tính năng bạn muốn người dùng dùng được ngay trong
Hub) — không cần rào trước bất kỳ phần nào trừ phi nó chạm dữ liệu học sinh (rổ Vàng/Đỏ, chưa áp
dụng cho Factory).
```


