# BẢN YÊU CẦU ĐẤU NỐI MINI APP VÀO SCHOOL DATA HUB

**Hub:** `{{HUB_URL}}` · **Bản yêu cầu:** {{NGAY}} · **Phiên bản phiếu:** 1

---

## ĐỌC PHẦN NÀY TRƯỚC. NÓ QUYẾT ĐỊNH BẠN CÓ PHẢI LÀM LẠI HAY KHÔNG.

Bạn (đội phát triển, hoặc AI được giao) sắp nối một ứng dụng vào Hub của Hệ thống Trường Việt Anh. Hub giữ dữ liệu của **trẻ em đang đi học**, chịu Luật Bảo vệ dữ liệu cá nhân **91/2025/QH15**. Không có ngoại lệ nào cho "app nhỏ", "chỉ để thử", hay "làm nhanh rồi sửa sau".

**Cách làm việc — theo đúng thứ tự này:**

1. Đọc **trọn** tài liệu này. Không lướt.
2. Viết mã theo mục 3–5 — **bộ mã mẫu chép-dán ở mục 6**.
3. Chạy **hết** phần tự kiểm ở mục 9. Tự chạy thật, không suy luận là "chắc chạy được".
4. Trả về **ĐÚNG MỘT KHỐI JSON** theo mục 10.

**Về bước 4 — đây là yêu cầu cứng:**

> Câu trả lời cuối cùng của bạn phải là **một khối JSON duy nhất và không có gì khác**. Không lời chào, không "đây là kết quả", không giải thích, không ghi chú, không khối mã thứ hai, không văn bản trước hay sau khối JSON đó.
>
> Người nhận sẽ **dán thẳng** nội dung đó vào một ô trên màn quản trị của Hub. Bất kỳ chữ nào ngoài JSON sẽ làm bước dán thất bại, và người nhận không phải là kỹ sư để đi cắt bớt hộ bạn.

**Mọi app ở đây có CÙNG MỘT hình dạng, và phải làm đủ cả ba việc:**

| | |
|---|---|
| **Nhúng** (mục 3) | Hub hiện app của bạn trong khung của nó |
| **Gửi dữ liệu về** (mục 4) | App bắn sự kiện của mình về một cửa duy nhất |
| **Đăng nhập bằng tài khoản Hub** (mục 5) | Không app nào có hệ tài khoản riêng |

Không có nhánh nào để bỏ, không khoá nào để `null`. Chưa làm kịp phần nào thì **báo lại nhà trường** — đừng gửi phiếu thiếu, và đừng khai một phần chưa chạy. Khai rồi mà không chạy là dạng hỏng tệ nhất ở đây: nó im lặng, và người phát hiện ra là một cô giáo đang cần dùng.

---

## 1. Hub là gì, và app của bạn nằm ở đâu trong đó

Hub là **Super App**: người dùng đăng nhập một lần, thấy một lưới ứng dụng, bấm vào là dùng. App của bạn là một **Mini App** chạy bên trong khung đó.

Người dùng **không được cảm nhận ranh giới kỹ thuật**. Cụ thể:

- Không có màn hình đăng nhập thứ hai.
- Không có tab trình duyệt thứ hai.
- Chỉ có **một** nút quay lại, và **Hub tự vẽ nút đó** — bạn không vẽ.

Có **ba đường** nối vào Hub. App của bạn dùng một, hai, hoặc cả ba:

| Đường | Để làm gì | Khai trong phiếu |
|---|---|---|
| **Nhúng** | App hiện lên trong khung của Hub | `urlIframe` |
| **Webhook** | App đẩy dữ liệu về kho của Hub | `cacLoaiSuKien` |
| **SSO** | Người dùng vào app bằng tài khoản Hub, không gõ lại mật khẩu | `redirectUris` |

**Cả ba đều bắt buộc.** Không đường nào bỏ được — xem bảng ở phần đầu.

---

## 2. Rổ dữ liệu — trả lời câu này TRƯỚC khi viết dòng mã đầu tiên

| Rổ | Nghĩa | Ví dụ |
|---|---|---|
| **`xanh`** | App **không bao giờ** biết dữ liệu thuộc về em nào | Thực đơn tuần, lịch câu lạc bộ, bảng tin, nội dung hướng dẫn chung |
| **`vang`** | App có gắn dữ liệu với từng em | Thể lực (chỉ số cơ thể), căn tin (suất ăn, dị ứng), điểm danh CLB |
| **`đỏ`** | **CẤM TUYỆT ĐỐI** — không app ngoài nào chạm, ở mọi mức, kể cả chỉ đọc | Hồ sơ chăm sóc, hồ sơ tâm lý, y tế, tâm trạng (mood) của học sinh |

**Nhầm hay gặp, đọc kỹ:** app thể lực và app căn tin *nghe như* rổ Xanh nhưng là **rổ Vàng** — app thể lực ghi chỉ số cơ thể của từng em, căn tin ghi em nào dị ứng món gì. Cả hai buộc phải biết "đây là em nào" mới chạy được.

**Rổ Đỏ không có đường xin.** Kho dữ liệu của Hub chỉ nhận hai giá trị `xanh` và `vang`; không ai khai được rổ Đỏ, kể cả quản trị, kể cả bằng dòng lệnh. Nếu ý tưởng sản phẩm của bạn cần dữ liệu rổ Đỏ thì **dừng lại và báo lại nhà trường**, đừng tìm đường vòng.

**Khai sai rổ là lỗi nặng nhất trong tài liệu này.** Khai `xanh` cho một app thật ra có gắn tên em nghĩa là app đi qua cửa duyệt nhẹ hơn mức nó đáng phải qua.

---

## 3. NHÚNG — bắt buộc với mọi app

### 3.1 Cho phép Hub nhúng

App phải trả header:

```
Content-Security-Policy: frame-ancestors {{HUB_URL}}
```

Và **tuyệt đối không** gửi `X-Frame-Options: DENY` hoặc `SAMEORIGIN`.

> Hub đã cho phép domain của bạn ở phía Hub. Nhưng nếu app tự chặn thì khung **vẫn trắng**, không có thông báo lỗi nào, và cả hai bên sẽ đi tìm nguyên nhân ở phía kia suốt buổi chiều. **Tự đo bằng `curl -I <url-embed-cua-ban>` và đọc header trả về** — đừng tin cấu hình, hãy tin phép đo.

### 3.2 Nhận danh tính người dùng qua `postMessage`, không qua URL

Hub **không** đặt token vào query string. Luồng bắt buộc:

1. Hub nạp iframe của bạn bằng **URL trần** (không tham số).
2. App tự sinh cặp PKCE, rồi gửi lên khung cha — **kèm `codeChallenge`**:
   ```js
   window.parent.postMessage({ type: "embed:ready", codeChallenge }, "{{HUB_URL}}");
   ```
   `targetOrigin` phải là chuỗi địa chỉ Hub ở trên. **Không dùng `"*"`.**

   > **`codeChallenge` là bắt buộc.** Gửi `embed:ready` trống thì Hub coi là lỗi và khung đứng im, không có thông báo nào. Đây là chỗ hay hỏng nhất ở bước này.

   > **Nhắc lại mỗi ~700ms** cho tới khi Hub đáp, tối đa ~20 lần. Có một khoảng đua: iframe của bạn có thể sẵn sàng trước khi Hub gắn xong bộ nghe, và lượt `embed:ready` đầu tiên rơi vào khoảng trống đó.

3. Hub gửi mã về, đúng hình dạng này:
   ```js
   { type: "embed:token", code: "<authorization_code>" }
   ```
4. App **bắt buộc kiểm `event.origin`** trước khi xử lý bất kỳ thông điệp nào:
   ```js
   window.addEventListener("message", (e) => {
     if (e.origin !== "{{HUB_URL}}") return;   // BẮT BUỘC. Thiếu dòng này là lỗ hổng đánh cắp token.
     if (e.data?.type !== "embed:token") return;
     // …đổi e.data.code lấy token, xem mục 6
   });
   ```
5. Hỏng ở phía bạn thì báo ngược lên, đừng im:
   ```js
   window.parent.postMessage({ type: "embed:error", reason: "pkce_unavailable" }, "{{HUB_URL}}");
   ```

**Không gửi `embed:resize`** — Hub cố tình bỏ qua từ 29/07/2026. Khung nhúng có kích thước cố định; nội dung dài thì iframe tự cuộn, không cần JS.

**Quá 10 giây không có `embed:ready`** thì Hub hiện màn báo lỗi. Người dùng vẫn thoát được, nhưng app của bạn coi như hỏng.

**Nếu app không gửi `embed:ready` trong 10 giây**, Hub hiện màn báo lỗi. Người dùng vẫn thoát được, nhưng app của bạn coi như hỏng.

### 3.3 Ba điều app nhúng KHÔNG được làm

- **Không** tự vẽ header, thanh điều hướng, nút "quay lại", hay menu của riêng mình ở mép trên. Hub đã có, và hai cái chồng nhau là màn hình gãy.
- **Không** `window.top.location = …`, không phá khung, không mở tab mới, không popup. App bị phát hiện làm việc này sẽ bị thu hồi quyền nhúng.
- **Không** hiện màn hình đăng nhập của riêng app. Nếu app cần biết người dùng là ai, dùng đường SSO ở mục 5.

---

## 4. GỬI DỮ LIỆU VỀ HUB — bắt buộc với mọi app

> **Luật của nhà trường:** *mọi app cắm vào Hub đều phải đổ dữ liệu của mình về.* Đây không phải một tuỳ chọn để cân nhắc — nó là lý do Hub tồn tại.
>
> Dữ liệu về một đứa trẻ hôm nay nằm rải trong những app không nói chuyện với nhau. Nhà trường chỉ nhìn thấy vài mảnh, và thường nhìn thấy muộn. App của bạn giữ một mảnh; **mảnh đó phải về được một chỗ** thì thầy cô mới ghép được bức tranh.
>
> **Không có ngoại lệ nào** (chốt 23/08/2026). Kể cả app thực đơn: ai mở, mở lúc nào, xem tuần nào — đó đã là dữ liệu, và nó phải về một chỗ.
>
> **Rổ Xanh vẫn phải gửi.** Rổ dữ liệu quyết định bạn có được **gắn tên em** hay không, KHÔNG quyết định bạn có phải gửi hay không. App rổ Xanh gửi dữ liệu không gắn tên ai — thực đơn tuần, học liệu đã soạn, lịch câu lạc bộ — và nó vẫn phải gửi.

### 4.1 Một cửa duy nhất

```
POST {{HUB_URL}}/api/embed/webhook
Content-Type: application/json
x-embed-app: <mã app của bạn>
x-embed-secret: <chuỗi bí mật do nhà trường cấp>
```

Thân request:

```json
{
  "external_id": "chuỗi ổn định, lặp lại được cho CÙNG một sự kiện",
  "event_type": "ten_loai_su_kien",
  "actor_user_id": "uuid người thực hiện, nếu có",
  "payload": { }
}
```

**Không có cửa thứ hai.** App không bao giờ nối thẳng vào cơ sở dữ liệu của Hub, không bao giờ được cấp `service_role`, không bao giờ gọi API nội bộ nào khác.

### 4.2 GỌI TÊN MỘT EM HỌC SINH — dùng đúng thứ bạn đã có trong tay

Khi em đăng nhập vào app bạn bằng nút "Đăng nhập bằng tài khoản trường", token Hub trả về có trường `sub`. **Đó chính là mã người dùng của em trong hệ thống trường** — bạn không phải xin thêm ở đâu cả, không phải gọi thêm API nào.

**Đặt nó vào đâu khi gửi dữ liệu:** trường `user_id` trong `payload`.

```json
{
  "external_id": "the-luc-2026-08-08-em01",
  "event_type": "ket_qua_the_luc",
  "payload": { "user_id": "<sub lấy từ token của em>", "chay_30m": "5.8s" }
}
```

**Bốn điều phải nắm:**

1. **`user_id` là mã của EM, không phải của sự kiện.** Mọi sự kiện của em đó đều mang cùng một `user_id`. Đừng nhầm với `external_id` ở mục 4.3 — thứ phải **khác nhau** giữa hai lần gửi.
2. **Chỉ gửi được dữ liệu của người ĐÃ ĐĂNG NHẬP vào app bạn.** Hub từ chối một `user_id` chưa bao giờ đăng nhập vào app này, kể cả khi mã đó có thật. Đây là hàng rào cố ý: chuỗi bí mật webhook dùng chung cho mọi app, nên nếu không có điều kiện này thì bất kỳ ai cầm chuỗi đó đều ghi được dữ liệu dưới tên một em bất kỳ.
3. **`user_id` không nhất thiết là học sinh.** Thầy cô dùng app cũng có `sub`. Sự kiện của thầy cô vẫn được nhận — nó chỉ không gắn vào hồ sơ em nào. Nếu app bạn để thầy cô nhập hộ cho một em, thì `user_id` phải là của **em đó** (và em đó phải đã từng đăng nhập vào app bạn), còn người thao tác đặt ở `actor_user_id`.
4. **Không gửi `user_id` cũng hợp lệ** — dùng cho sự kiện không thuộc về ai (thực đơn tuần, lịch câu lạc bộ). Nhưng nếu app bạn khai rổ **Xanh** thì gửi `user_id` của một em sẽ **bị chặn**: rổ Xanh nghĩa là không gắn tên em nào, và Hub cưỡng chế điều đó chứ không chỉ ghi trong tài liệu.

> **Gửi `user_id` mà Hub không nhận ra — hoặc người đó chưa từng đăng nhập vào app bạn — thì sự kiện vào hàng đợi lỗi, không được lưu.** Cố ý: lưu thành `null` sẽ trông y hệt một sự kiện không gắn em nào, và từ đó không ai còn cách nào phân biệt. Thà hỏng ngay, thấy được, đọc được lý do.
>
> **Nếu bạn dựng app theo bản brief trước ngày 21/08/2026** và đang gửi trường `alias`: Hub **từ chối tường minh** trường đó kèm câu chỉ đường. Đổi `alias` thành `user_id` và bỏ lời gọi `POST /api/embed/alias` — endpoint đó đã gỡ.

### 4.3 `external_id` phải LẶP LẠI ĐƯỢC — đây là chỗ hay hỏng nhất

`external_id` là thứ Hub dùng để biết "sự kiện này mình nhận rồi". Nó phải được **tính ra** từ nội dung sự kiện, ví dụ:

```
sha256(ma-app + ma-em + ngay + loai-su-kien)
```

**Cấm dùng UUID sinh mới mỗi lần gửi.** Công cụ no-code hay làm đúng như vậy, và hậu quả là: app gửi lại một sự kiện đã gửi → Hub thấy `external_id` mới → ghi thêm một bản nữa → dữ liệu của một em bị đếm hai lần. Không có lỗi nào nổ ra.

**Tự kiểm:** gửi **đúng cùng một request hai lần**. Lần hai phải trả `status: "already_promoted"`. Nếu nó trả `"promoted"` thì `external_id` của bạn sai.

### 4.4 Đọc đúng mã trả về

| Mã | Nghĩa | App phải làm gì |
|---|---|---|
| `200` | Đã nhận và đã vào kho | Xong |
| `202` | Đã nhận, **chưa** vào kho, đang nằm hàng đợi lỗi chờ người xử | **KHÔNG gửi lại.** Gửi lại không sửa được gì |
| `400` | Thân request sai khuôn | Sửa mã |
| `401` | Sai mã app hoặc sai chuỗi bí mật | Hỏi nhà trường |
| `403` | `event_type` này chưa được khai trong hồ sơ | Khai vào phiếu (mục 10) rồi xin duyệt |
| `503` | Hub tạm trục trặc | Thử lại sau, có giãn cách tăng dần |

### 4.5 Điều Hub KHÔNG hứa, nói trước để không ai hiểu nhầm

Mọi loại sự kiện bạn gửi đều **vào kho và đọc được**. Nhưng chỉ những loại **đã được nhà trường viết luật ánh xạ riêng** mới trở thành dữ liệu nghiệp vụ (một buổi điểm danh, một khoá học). Loại khác nằm ở dạng JSON thô: tra cứu được, thống kê được, **không** tự biến thành hàng nghiệp vụ.

Nếu app của bạn cần dữ liệu trở thành nghiệp vụ thật, **ghi rõ trong phiếu** ở khoá `webhook.cacLoaiSuKien` và nói với nhà trường — đó là một việc của kỹ sư Hub, không phải một ô tích trên màn hình.

### 4.6 Chuỗi bí mật — MỘT chuỗi dùng chung cho mọi app

Nhà trường cấp **một chuỗi duy nhất, dùng chung cho tất cả các app**. Bạn không có chuỗi riêng, và không cần xin cấp riêng.

**Ba điều đi kèm, đọc kỹ:**

1. **Chuỗi để ở máy chủ của bạn, trong biến môi trường.** Không bao giờ trong mã chạy phía trình duyệt, không trong biến `NEXT_PUBLIC_*`/`VITE_*`, không trong file cấu hình đẩy lên kho mã. Vì nó dùng chung, lộ chuỗi của bạn là lộ chuỗi của **mọi app khác**.
2. **Nhà trường đổi chuỗi lúc nào cũng được, và khi đó MỌI app phải đổi theo cùng lúc.** Hãy để nó là một biến môi trường đọc lúc chạy — đừng ghi cứng vào mã, đừng nhúng vào bản build. Đổi chuỗi phải là sửa một dòng cấu hình rồi khởi động lại, không phải một lần phát hành mới.
3. **App không có phần hậu trường riêng thì KHÔNG được cấp chuỗi.** App dựng bằng Base44, Lovable, v0, Bolt… chỉ có giao diện, không có chỗ kín để cất — nhét chuỗi vào đó thì ai mở trang cũng nhặt được. App loại đó ghi dữ liệu dưới danh nghĩa chính người đang dùng, qua đường ở mục 3.2.

> Nếu app của bạn có lý do thật sự cần một chuỗi **riêng** — ví dụ nó chạy trên hạ tầng của một nhà cung cấp khác, hoặc nhà trường cần thu hồi riêng nó mà không đụng app khác — thì **nói rõ khi gửi phiếu**. Nhà trường cấp riêng được, và khi đó app bạn **chỉ** dùng chuỗi riêng đó; chuỗi chung sẽ không còn mở cửa cho bạn nữa.

---

## 5. ĐĂNG NHẬP BẰNG TÀI KHOẢN HUB (SSO) — bắt buộc với mọi app

### 5.1 Thông số

| Mục | Giá trị |
|---|---|
| Chuẩn | OpenID Connect, Authorization Code + PKCE |
| Bản khai (discovery) | `{{HUB_URL}}/.well-known/openid-configuration` |
| issuer | `{{HUB_URL}}` |
| `client_id` | **chính là mã app của bạn** |
| `client_secret` | **Cùng một chuỗi với mục 4.6** — nhà trường dùng chung một chuỗi cho cả gửi dữ liệu lẫn đăng nhập |
| Cách gửi secret | **`client_secret_basic`** — Hub chỉ nhận đúng cách này |
| PKCE | **`S256`, bắt buộc**, kể cả với confidential client |
| scope được xin | Chỉ những scope bạn khai trong phiếu |

### 5.2 Sáu điều bắt buộc

1. **Dùng thư viện OIDC chuẩn** (`openid-client` v6 hoặc tương đương của ngôn ngữ bạn dùng). **Không tự viết tay luồng OAuth.** Không dùng SDK riêng của một nhà cung cấp (Firebase Auth, gapi…) — chúng buộc bạn vào IdP đó.
2. **`client_secret_basic`.** Thư viện của bạn có thể mặc định `client_secret_post`; **phải đổi**. Hub chỉ quảng cáo một cách, và cách kia sẽ chạy được ở đâu đó rồi gãy im lặng đúng vào ngày nhà trường xoay khoá.
3. **`redirect_uri` khớp chính xác từng ký tự.** Không khớp theo tiền tố, không wildcard. Thừa một dấu `/` hay một khoảng trắng dán kèm là không đăng nhập được, với một câu lỗi không hề nhắc tới khoảng trắng.
4. **Chỉ `https`, không dấu `#`.** URI có fragment bị chuẩn OIDC cấm và bị Hub từ chối.
5. **Lưu định danh theo cặp `(issuer, subject)`, không chỉ `subject`.** `sub` mà Hub trả về là mã người dùng trong Hub. Thiếu cột `issuer` thì ngày đổi nhà cung cấp danh tính, toàn bộ tài khoản mồ côi.
6. **Nếu khai `backchannelLogoutUri`:** endpoint đó nhận `POST` với `logout_token`, và bạn **bắt buộc kiểm chữ ký** bằng JWKS lấy từ bản khai ở trên. Nhận một token không kiểm chữ ký nghĩa là bất kỳ ai cũng đăng xuất được người khác.

### 5.3 Hai điều xảy ra mà app phải chịu được

- **Nhà trường khoá một tài khoản trong Hub ⇒ app của bạn mất quyền trong ≤15 phút.** Access token sống 15 phút; mỗi lần app xin token mới, Hub kiểm lại trạng thái tài khoản. App phải xử lý được ca "đang dùng thì mất quyền" mà không văng lỗi trắng màn.
- **Người dùng thoát khỏi Hub ⇒ Hub gọi vào `backchannelLogoutUri` của bạn.** App phải đóng phiên phía mình.

---

## 6. BỘ MÃ MẪU — chép, thay ba hằng số, xong

Ba khối dưới đây là **mã chạy được**, không phải mô tả. Thay đúng ba thứ:

```
HUB      = {{HUB_URL}}
MA_APP   = mã app bạn khai trong phiếu
BI_MAT   = chuỗi nhà trường gửi riêng cho bạn (chỉ để ở máy chủ)
```

### 6.1 Cho Hub nhúng — một dòng, theo khung bạn dùng

```js
// Next.js — next.config.js
async headers() {
  return [{ source: "/:path*", headers: [
    { key: "Content-Security-Policy", value: "frame-ancestors {{HUB_URL}}" },
  ]}];
}
```
```js
// Express
app.use((_, res, next) => {
  res.setHeader("Content-Security-Policy", "frame-ancestors {{HUB_URL}}");
  res.removeHeader("X-Frame-Options");   // nhiều middleware bảo mật tự thêm — phải gỡ
  next();
});
```
```nginx
# Nginx
add_header Content-Security-Policy "frame-ancestors {{HUB_URL}}" always;
proxy_hide_header X-Frame-Options;
```

Đo lại, đừng tin cấu hình: `curl -I <url-embed-cua-ban>`.

### 6.2 Bắt tay lấy danh tính — chạy trong trình duyệt

```js
const HUB = "{{HUB_URL}}";

// PKCE: verifier ở lại máy người dùng, Hub không bao giờ thấy nó.
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function taoPkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(digest) };
}

export async function xinDanhTinh() {
  const { verifier, challenge } = await taoPkce();

  const code = await new Promise((resolve, reject) => {
    let nhac;
    function nghe(e) {
      if (e.origin !== HUB) return;                 // BẮT BUỘC — thiếu là lỗ hổng
      if (e.data?.type !== "embed:token") return;
      clearInterval(nhac);
      window.removeEventListener("message", nghe);
      resolve(e.data.code);
    }
    window.addEventListener("message", nghe);

    // NHẮC LẠI: Hub có thể chưa gắn bộ nghe lúc iframe của bạn sẵn sàng.
    const gui = () => window.parent.postMessage({ type: "embed:ready", codeChallenge: challenge }, HUB);
    gui();
    let lan = 0;
    nhac = setInterval(() => {
      if (++lan >= 20) {                            // ~14 giây rồi bỏ cuộc
        clearInterval(nhac);
        window.removeEventListener("message", nghe);
        window.parent.postMessage({ type: "embed:error", reason: "no_token" }, HUB);
        reject(new Error("Hub không trả mã"));
      } else gui();
    }, 700);
  });

  // Đổi mã ở MÁY CHỦ CỦA BẠN, không đổi ở đây: bước đó cần chuỗi bí mật.
  const r = await fetch("/api/hub/doi-ma", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, verifier }),
  });
  return r.json();     // { sub, name, hub_role, hub_school, hub_classes }
}
```

### 6.3 Đổi mã lấy token — chạy ở MÁY CHỦ của bạn

> **Vì sao không đổi thẳng trong trình duyệt:** bước này cần `BI_MAT`, và chuỗi bí mật đặt vào mã trình duyệt là ai mở DevTools cũng đọc được. Trình duyệt chỉ chuyển `code` + `verifier` về máy chủ của bạn; cả hai đều dùng một lần.

```js
// POST /api/hub/doi-ma   { code, verifier }
const HUB = "{{HUB_URL}}";

export async function doiMa(code, verifier) {
  const r = await fetch(`${HUB}/oidc/token`, {
    method: "POST",
    headers: {
      // client_secret_basic — Hub CHỈ nhận cách này.
      authorization: "Basic " + Buffer.from(`${process.env.MA_APP}:${process.env.BI_MAT}`).toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      // ĐÂY LÀ CHỖ HAY SAI NHẤT: khi chạy TRONG KHUNG, redirect_uri là trang cầu nối
      // CỦA HUB, không phải callback của bạn. Sai chỗ này thì Hub trả invalid_grant
      // và câu lỗi không hề nhắc tới redirect_uri.
      redirect_uri: `${HUB}/embed/relay`,
    }),
  });
  if (!r.ok) throw new Error(`đổi mã hỏng: ${r.status}`);
  const { id_token } = await r.json();
  // Kiểm chữ ký id_token bằng JWKS ở bản khai — dùng thư viện OIDC, đừng tự giải.
  return id_token;
}
```

### 6.4 Bắn dữ liệu về Hub — chạy ở MÁY CHỦ của bạn

```js
import { createHash } from "node:crypto";

// external_id TÍNH TỪ NỘI DUNG, không phải UUID mới mỗi lần — xem mục 4.3.
const maSuKien = (...phan) => createHash("sha256").update(phan.join("|")).digest("hex").slice(0, 32);

export async function banVeHub(eventType, actorUserId, payload, ...khoa) {
  const r = await fetch(`{{HUB_URL}}/api/embed/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-embed-app": process.env.MA_APP,
      "x-embed-secret": process.env.BI_MAT,
    },
    body: JSON.stringify({
      external_id: maSuKien(eventType, ...khoa),
      event_type: eventType,
      actor_user_id: actorUserId,
      payload,
    }),
  });
  if (r.status === 202 || r.status === 200) return;   // nhận rồi — ĐỪNG gửi lại
  if (r.status === 503) throw new Error("hub_ban");    // thử lại, giãn cách tăng dần
  throw new Error(`hub từ chối ${r.status}`);          // 400/401/403 — sửa mã hoặc hỏi trường
}
```

---

## 7. DỮ KIỆN BẠN CẦN — không phải hỏi ai

### 7.1 Trong `id_token` có gì

| Trường | Kiểu | Nội dung |
|---|---|---|
| `sub` | chuỗi | Mã người dùng **trong Hub**. Ổn định, dùng làm khoá. Lưu kèm `iss` — xem mục 5.2 |
| `name` | chuỗi | Tên hiển thị |
| `hub_role` | chuỗi | Đúng **một** trong: `student` · `parent` · `teacher` · `staff` |
| `hub_school` | chuỗi hoặc `null` | Mã cơ sở |
| `hub_classes` | mảng chuỗi | Mã các lớp của người này. Học sinh: lớp đang học. Giáo viên: lớp đang dạy/chủ nhiệm |

Ba trường `hub_*` đi kèm scope `hub_profile`, và **nhà trường cấp sẵn cho mọi app** — bạn không khai `scopes`, không phải xin. Nếu bạn nhận được token mà thiếu ba trường đó thì đấy là lỗi cấu hình phía nhà trường, **báo lại ngay** chứ đừng viết mã đoán vai.

**`hub_role` chỉ có bốn giá trị.** Hub gộp `counselor`/`principal`/`board`/`admin` thành `staff` — app không cần phân biệt sâu hơn, và ngày nhà trường thêm một vai mới thì app của bạn không gãy.

### 7.2 Mã trả về của webhook

| Mã | Nghĩa | Bạn làm gì |
|---|---|---|
| `202` / `200` | Đã nhận | **Không** gửi lại |
| `already_promoted` | Đã nhận từ trước, cùng `external_id` | Không làm gì. Đây là dấu hiệu ĐÚNG |
| `400` | Thân request sai khuôn | Sửa mã |
| `401` | Sai mã app hoặc sai chuỗi bí mật | Hỏi nhà trường |
| `403` | `event_type` chưa khai trong phiếu | Xin nhà trường khai thêm |
| `503` | Hub tạm trục trặc | Thử lại, giãn cách tăng dần |

### 7.3 Những con số

| | |
|---|---|
| Hạn `embed:ready` | **10 giây**, kể từ lúc iframe nạp xong |
| Nhịp nhắc lại `embed:ready` | ~**700ms**, tối đa ~20 lần |
| Access token sống | **15 phút** |
| Hub khoá tài khoản ⇒ app mất quyền | trong **≤15 phút** |
| Nhà trường tắt app | **hiệu lực ngay lượt request kế tiếp** |
| Nhịp rà lại hồ sơ app | **6 tháng** |

---

## 8. NHỮNG CÂU BẠN SẮP HỎI — trả lời sẵn

**Chuỗi bí mật lấy ở đâu?** Nhà trường gửi riêng cho bạn qua kênh an toàn, sau khi phiếu được dán. Nó **không** nằm trong tài liệu này, và bạn **không** khai nó trong phiếu.

**Chưa được đăng ký thì thử kiểu gì?** Gửi phiếu trước, nhà trường dán và cấp chuỗi, rồi bạn thử. Trước đó thử được hai thứ không cần Hub: header `frame-ancestors` (bằng `curl -I`) và phần sinh PKCE.

**`maApp` tự đặt hay nhà trường đặt?** Bạn đặt, trong phiếu. **Không đổi được về sau** — nó đi thẳng vào địa chỉ và mọi lời gọi.

**App tôi có tài khoản riêng rồi thì sao?** Bỏ đi. Không app nào ở đây có hệ tài khoản riêng — mọi người vào bằng tài khoản Hub. Ghép dữ liệu cũ theo `sub`.

**Không có `event_type` nào phù hợp thì sao?** Bạn tự đặt tên và khai vào `cacLoaiSuKien`. Hub nhận mọi loại đã khai; loại chưa khai bị trả `403`.

**Gửi trùng thì sao?** Không sao — đó là thiết kế. Cùng `external_id` thì lần hai trả `already_promoted` và kho vẫn chỉ có một bản ghi. Nên khi không chắc đã gửi hay chưa, **cứ gửi lại**.

**Người dùng thoát Hub thì tôi biết bằng cách nào?** Hub `POST` vào `urlDangXuat` của bạn kèm `logout_token`. Kiểm chữ ký bằng JWKS rồi đóng phiên.

**Vẫn không rõ chỗ nào?** Hỏi nhà trường **một lần, gộp hết câu hỏi**, kèm đoạn mã bạn đang vướng. Đừng đoán rồi gửi phiếu — phiếu sai thì phải làm lại từ đầu.

---

## 9. TỰ KIỂM — chạy hết trước khi trả JSON

Đánh dấu từng dòng. **Chưa chạy thật thì không được đánh dấu.**

**Chung**

- [ ] Đã xác định đúng rổ dữ liệu (`xanh` / `vang`), và đọc lại mục 2 một lần nữa để chắc.
- [ ] Không lưu bản sao danh sách học sinh, lớp, người dùng của trường trong cơ sở dữ liệu của app.
- [ ] Không có chuỗi bí mật nào trong mã nguồn phía trình duyệt hay trong kho mã.
- [ ] Không gọi trực tiếp bất kỳ API AI nào với dữ liệu học sinh chưa được làm sạch.
- [ ] App không hiện bất kỳ mã nội bộ, tên bảng, hay trạng thái job nào ra màn hình.

**Nhúng**

- [ ] `curl -I` cho thấy `frame-ancestors` có địa chỉ Hub, và **không có** `X-Frame-Options`.
- [ ] App gửi `embed:ready` với `targetOrigin` là địa chỉ Hub, **không phải `"*"`**.
- [ ] Mọi `message` nhận về đều kiểm `event.origin` trước khi xử lý.
- [ ] App không vẽ header/nút quay lại/menu riêng.
- [ ] App không phá khung, không mở tab mới.

**Gửi dữ liệu về**

- [ ] `external_id` tính từ nội dung, **lặp lại được**.
- [ ] Gửi cùng một request **hai lần** → lần hai trả `already_promoted`. Đã chạy thật.
- [ ] Nhận `202` thì **không** gửi lại.
- [ ] Chuỗi bí mật chỉ nằm ở biến môi trường phía máy chủ.

**Đăng nhập**

- [ ] Dùng thư viện OIDC chuẩn, không tự viết luồng OAuth.
- [ ] PKCE `S256` bật.
- [ ] `client_secret_basic`, đã kiểm chứ không tin mặc định của thư viện.
- [ ] `redirect_uri` là `https`, không `#`, khớp chính xác chuỗi đã khai.
- [ ] Lưu định danh theo `(issuer, subject)`.
- [ ] Nếu có `backchannelLogoutUri`: đã kiểm chữ ký `logout_token` bằng JWKS.

---

## 10. TRẢ VỀ — ĐÚNG MỘT KHỐI JSON, KHÔNG CHỮ NÀO KHÁC

### 10.1 Khuôn — chép nguyên, thay giá trị

```json
{
  "phienBan": 1,
  "maApp": "chu-thuong-so-va-gach-ngang",
  "tenHienThi": "Tên hiện cho người dùng",
  "moTaMotCau": "Một câu nói app này làm gì",
  "roDuLieu": "xanh",
  "doiChiuTrachNhiem": "Tên đội + email liên hệ",
  "urlIframe": "https://ten-mien-cua-ban/duong-dan",
  "cacLoaiSuKien": ["ten_loai_1", "ten_loai_2"],
  "redirectUris": ["https://ten-mien-cua-ban/callback"],
  "urlDangXuat": "https://ten-mien-cua-ban/backchannel-logout"
}
```

**Phẳng, không lồng nhau, không khoá nào để `null`.** Mọi app ở đây đều nhúng, đều bắn dữ liệu về, đều đăng nhập bằng tài khoản Hub — nên không có nhánh nào để bật/tắt.

### 10.2 Từng khoá

| Khoá | Bắt buộc | Luật |
|---|---|---|
| `phienBan` | ✔ | Luôn là `1` |
| `maApp` | ✔ | 3–40 ký tự, **chỉ chữ thường, số, gạch ngang**; bắt đầu bằng chữ, kết thúc bằng chữ hoặc số. Đi thẳng vào địa chỉ và vào mọi lời gọi — **không đổi được về sau** |
| `tenHienThi` | ✔ | 1–60 ký tự, tiếng Việt có dấu |
| `moTaMotCau` | — | ≤200 ký tự. Hiện lúc chờ app nạp. Bỏ trống thì chỉ hiện tên |
| `roDuLieu` | ✔ | `"xanh"` hoặc `"vang"`. Xem mục 2 |
| `doiChiuTrachNhiem` | ✔ | ≥2 ký tự. Tên đội + cách liên lạc |
| `urlIframe` | ✔ | `https`, không `#`, không `?`. Trang Hub sẽ nhúng. **Không khai `origin` riêng** — Hub tự cắt phần tên miền ra từ đây |
| `cacLoaiSuKien` | ✔ | Ít nhất một loại. Đây là danh sách `event_type` app được phép gửi; loại chưa khai bị Hub trả `403` |
| `redirectUris` | ✔ | Ít nhất một. Khớp **chính xác từng ký tự** với thứ app gửi lên — thừa một dấu `/` là không đăng nhập được |
| `urlDangXuat` | — | Hub gọi vào đây khi người dùng thoát khỏi Hub. Bỏ trống thì app không biết để đóng phiên |

**Không khai `scopes`** — mọi app nội bộ dùng `openid profile`, Hub tự đặt.

### 10.3 BỐN THỨ BẠN KHÔNG ĐƯỢC KHAI

Khai vào là phiếu bị từ chối, kèm câu nói rõ vì sao:

| Khoá | Vì sao không phải của bạn |
|---|---|
| `allowedRoles` / `vai` | **Vai nào được mở app** — nhà trường cấp trên màn hình sau khi dán |
| `enabled` | **App bật hay tắt** — app dán vào luôn TẮT cho tới khi có người có thẩm quyền bật |
| `reviewDueOn` / `ngayRaLai` | **Ngày rà lại** — nhà trường đặt, mặc định 6 tháng |
| `webhookSecretEnv` / `ssoClientSecretEnv` / `secret` | **Tên biến chứa chuỗi bí mật**, và cả giá trị của nó. Mọi app dùng chuỗi chung của trường; giá trị không bao giờ đi qua đường này — nhà trường gửi riêng cho bạn |

### 10.4 Ví dụ hoàn chỉnh

App thực đơn căn tin — **vẫn đủ cả ba việc**, vì mọi app ở đây đều vậy:

```json
{
  "phienBan": 1,
  "maApp": "thuc-don-tuan",
  "tenHienThi": "Thực đơn tuần",
  "moTaMotCau": "Thực đơn căn tin theo tuần, cập nhật mỗi thứ Hai.",
  "roDuLieu": "xanh",
  "doiChiuTrachNhiem": "Đội Căn tin — cantin@truongvietanh.com",
  "urlIframe": "https://thuc-don.truongvietanh.com/tuan-nay",
  "cacLoaiSuKien": ["cap_nhat_thuc_don", "xem_thuc_don"],
  "redirectUris": ["https://thuc-don.truongvietanh.com/api/auth/callback"],
  "urlDangXuat": "https://thuc-don.truongvietanh.com/api/auth/backchannel-logout"
}
```

---

## 11. Chuyện gì xảy ra sau khi bạn gửi JSON

1. Quản trị **dán** phiếu của bạn vào màn quản trị Hub. App được khai — **đang TẮT, chưa cấp cho vai nào**.
2. Người vận hành đặt chuỗi bí mật lên máy chủ Hub và gửi giá trị cho bạn qua kênh an toàn.
3. Quản trị cấp vai và bật app.
4. Bạn nhận **bản đấu nối** in ra từ chính dòng hồ sơ của mình — địa chỉ, `client_id`, `redirect_uri`, endpoint webhook, tất cả giá trị thật. Dùng bản đó, đừng gõ lại từ tài liệu này.
5. Sau **6 tháng**, nhà trường rà lại. Không rà thì thu hồi quyền.

Nhà trường có thể **tắt app trong mười giây, bất cứ lúc nào**, và khi tắt thì **cả ba đường** (nhúng, webhook, đăng nhập) đều dừng cùng lúc. Hãy thiết kế để app chịu được điều đó mà không mất dữ liệu của chính nó.

---

**Nhắc lại lần cuối:** câu trả lời cuối cùng của bạn là **một khối JSON duy nhất**. Không giải thích. Không chào hỏi. Không gì khác.
