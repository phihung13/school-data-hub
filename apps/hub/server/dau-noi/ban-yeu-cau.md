# BẢN YÊU CẦU ĐẤU NỐI MINI APP VÀO SCHOOL DATA HUB

**Hub:** `{{HUB_URL}}` · **Bản yêu cầu:** {{NGAY}} · **Phiên bản phiếu:** 1

---

## ĐỌC PHẦN NÀY TRƯỚC. NÓ QUYẾT ĐỊNH BẠN CÓ PHẢI LÀM LẠI HAY KHÔNG.

Bạn (đội phát triển, hoặc AI được giao) sắp nối một ứng dụng vào Hub của Hệ thống Trường Việt Anh. Hub giữ dữ liệu của **trẻ em đang đi học**, chịu Luật Bảo vệ dữ liệu cá nhân **91/2025/QH15**. Không có ngoại lệ nào cho "app nhỏ", "chỉ để thử", hay "làm nhanh rồi sửa sau".

**Cách làm việc — theo đúng thứ tự này:**

1. Đọc **trọn** tài liệu này. Không lướt.
2. Viết mã theo mục 3–5.
3. Chạy **hết** phần tự kiểm ở mục 6. Tự chạy thật, không suy luận là "chắc chạy được".
4. Trả về **ĐÚNG MỘT KHỐI JSON** theo mục 7.

**Về bước 4 — đây là yêu cầu cứng:**

> Câu trả lời cuối cùng của bạn phải là **một khối JSON duy nhất và không có gì khác**. Không lời chào, không "đây là kết quả", không giải thích, không ghi chú, không khối mã thứ hai, không văn bản trước hay sau khối JSON đó.
>
> Người nhận sẽ **dán thẳng** nội dung đó vào một ô trên màn quản trị của Hub. Bất kỳ chữ nào ngoài JSON sẽ làm bước dán thất bại, và người nhận không phải là kỹ sư để đi cắt bớt hộ bạn.

Nếu bạn **không hoàn thành được** một phần nào đó: vẫn trả về JSON, nhưng **bỏ hẳn** nhánh tương ứng (`nhung` hoặc `sso` để `null`). Đừng khai một nhánh chưa chạy được — khai rồi mà không chạy là dạng hỏng tệ nhất ở đây: nó im lặng, và người phát hiện ra là một cô giáo đang cần dùng.

**Nhánh `webhook`** — mặc định là **bắt buộc**: mọi app sinh ra dữ liệu đều phải đổ về (mục 4). Có **đúng một ngoại lệ**, và mục 4 định nghĩa nó: app **thuần hiển thị nội dung chung**, không sinh ra bản ghi nào của riêng nó (thực đơn, bảng tin, trang giới thiệu). App đó để `"webhook": null` — hợp lệ, xem ví dụ ở mục 7.5.

Nếu app bạn **có** sinh ra bản ghi (ai làm gì, lúc nào, kết quả ra sao) mà chưa kịp làm webhook: **báo lại nhà trường**, đừng lặng lẽ để `null`. Để `null` cho một app có dữ liệu là khai sai, và cái sai đó im lặng.

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
| **Nhúng** | App hiện lên trong khung của Hub | `nhung` |
| **Webhook** | App đẩy dữ liệu về kho của Hub | `webhook` — **bắt buộc**, xem mục 4 |
| **SSO** | Người dùng vào app bằng tài khoản Hub, không gõ lại mật khẩu | `sso` |

Nhánh `nhung` và `sso` không dùng thì để `null`. **`webhook` thì khác** — mọi app đều phải đổ dữ liệu về, xem mục 4.

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

## 3. Nếu app có NHÚNG — yêu cầu bắt buộc

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
2. App của bạn, khi đã sẵn sàng, gửi lên khung cha:
   ```js
   window.parent.postMessage({ type: "embed:ready" }, "{{HUB_URL}}");
   ```
   `targetOrigin` phải là chuỗi địa chỉ Hub ở trên. **Không dùng `"*"`.**
3. Hub gửi lại mã cho bạn bằng `postMessage`.
4. App **bắt buộc kiểm `event.origin`** trước khi xử lý bất kỳ thông điệp nào:
   ```js
   window.addEventListener("message", (e) => {
     if (e.origin !== "{{HUB_URL}}") return;   // BẮT BUỘC. Thiếu dòng này là lỗ hổng đánh cắp token.
     // …xử lý
   });
   ```

**Nếu app không gửi `embed:ready` trong 10 giây**, Hub hiện màn báo lỗi. Người dùng vẫn thoát được, nhưng app của bạn coi như hỏng.

### 3.3 Ba điều app nhúng KHÔNG được làm

- **Không** tự vẽ header, thanh điều hướng, nút "quay lại", hay menu của riêng mình ở mép trên. Hub đã có, và hai cái chồng nhau là màn hình gãy.
- **Không** `window.top.location = …`, không phá khung, không mở tab mới, không popup. App bị phát hiện làm việc này sẽ bị thu hồi quyền nhúng.
- **Không** hiện màn hình đăng nhập của riêng app. Nếu app cần biết người dùng là ai, dùng đường SSO ở mục 5.

---

## 4. GỬI DỮ LIỆU VỀ HUB — mặc định là BẮT BUỘC

> **Luật của nhà trường:** *mọi app cắm vào Hub đều phải đổ dữ liệu của mình về.* Đây không phải một tuỳ chọn để cân nhắc — nó là lý do Hub tồn tại.
>
> Dữ liệu về một đứa trẻ hôm nay nằm rải trong những app không nói chuyện với nhau. Nhà trường chỉ nhìn thấy vài mảnh, và thường nhìn thấy muộn. App của bạn giữ một mảnh; **mảnh đó phải về được một chỗ** thì thầy cô mới ghép được bức tranh.
>
> **Ngoại lệ duy nhất, và phải nói rõ khi gửi phiếu:** app thuần hiển thị nội dung chung, không sinh ra dữ liệu nào của riêng nó (bảng tin, trang giới thiệu). Nếu app bạn *có* sinh ra bất kỳ bản ghi nào — ai làm gì, lúc nào, kết quả ra sao — thì nó không thuộc ngoại lệ này.
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
| `403` | `event_type` này chưa được khai trong hồ sơ | Khai vào phiếu (mục 7) rồi xin duyệt |
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

## 5. Nếu app dùng ĐĂNG NHẬP BẰNG TÀI KHOẢN HUB (SSO) — yêu cầu bắt buộc

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

## 6. TỰ KIỂM — chạy hết trước khi trả JSON

Đánh dấu từng dòng. **Chưa chạy thật thì không được đánh dấu.**

**Chung**

- [ ] Đã xác định đúng rổ dữ liệu (`xanh` / `vang`), và đọc lại mục 2 một lần nữa để chắc.
- [ ] Không lưu bản sao danh sách học sinh, lớp, người dùng của trường trong cơ sở dữ liệu của app.
- [ ] Không có chuỗi bí mật nào trong mã nguồn phía trình duyệt hay trong kho mã.
- [ ] Không gọi trực tiếp bất kỳ API AI nào với dữ liệu học sinh chưa được làm sạch.
- [ ] App không hiện bất kỳ mã nội bộ, tên bảng, hay trạng thái job nào ra màn hình.

**Nếu có nhúng**

- [ ] `curl -I` cho thấy `frame-ancestors` có địa chỉ Hub, và **không có** `X-Frame-Options`.
- [ ] App gửi `embed:ready` với `targetOrigin` là địa chỉ Hub, **không phải `"*"`**.
- [ ] Mọi `message` nhận về đều kiểm `event.origin` trước khi xử lý.
- [ ] App không vẽ header/nút quay lại/menu riêng.
- [ ] App không phá khung, không mở tab mới.

**Nếu có webhook**

- [ ] `external_id` tính từ nội dung, **lặp lại được**.
- [ ] Gửi cùng một request **hai lần** → lần hai trả `already_promoted`. Đã chạy thật.
- [ ] Nhận `202` thì **không** gửi lại.
- [ ] Chuỗi bí mật chỉ nằm ở biến môi trường phía máy chủ.

**Nếu có SSO**

- [ ] Dùng thư viện OIDC chuẩn, không tự viết luồng OAuth.
- [ ] PKCE `S256` bật.
- [ ] `client_secret_basic`, đã kiểm chứ không tin mặc định của thư viện.
- [ ] `redirect_uri` là `https`, không `#`, khớp chính xác chuỗi đã khai.
- [ ] Lưu định danh theo `(issuer, subject)`.
- [ ] Nếu có `backchannelLogoutUri`: đã kiểm chữ ký `logout_token` bằng JWKS.

---

## 7. TRẢ VỀ — ĐÚNG MỘT KHỐI JSON, KHÔNG CHỮ NÀO KHÁC

### 7.1 Khuôn

```json
{
  "phienBan": 1,
  "maApp": "chu-thuong-so-va-gach-ngang",
  "tenHienThi": "Tên hiện cho người dùng",
  "moTaMotCau": "Một câu nói app này làm gì",
  "roDuLieu": "xanh",
  "doiChiuTrachNhiem": "Tên đội + email liên hệ",
  "nhung": {
    "origin": "https://ten-mien-cua-ban",
    "urlIframe": "https://ten-mien-cua-ban/duong-dan"
  },
  "webhook": {
    "cacLoaiSuKien": ["ten_loai_1", "ten_loai_2"]
  },
  "sso": {
    "redirectUris": ["https://ten-mien-cua-ban/callback"],
    "backchannelLogoutUri": "https://ten-mien-cua-ban/backchannel-logout",
    "scopes": ["openid", "profile"]
  }
}
```

### 7.2 Từng khoá

| Khoá | Bắt buộc | Luật |
|---|---|---|
| `phienBan` | ✔ | Luôn là `1` |
| `maApp` | ✔ | 3–40 ký tự, **chỉ chữ thường, số, gạch ngang**; bắt đầu bằng chữ, kết thúc bằng chữ hoặc số. Đi thẳng vào địa chỉ và vào mọi lời gọi — **không đổi được về sau** |
| `tenHienThi` | ✔ | 1–60 ký tự, tiếng Việt có dấu |
| `moTaMotCau` | — | ≤200 ký tự. Hiện lúc chờ app nạp. Bỏ trống thì chỉ hiện tên |
| `roDuLieu` | ✔ | `"xanh"` hoặc `"vang"`. Xem mục 2 |
| `doiChiuTrachNhiem` | ✔ | ≥2 ký tự. Tên đội + cách liên lạc |
| `nhung` | — | `null` nếu app không có giao diện nhúng |
| `nhung.origin` | ✔ nếu có `nhung` | Dạng `https://ten-mien` — **không đường dẫn, không dấu `/` cuối** |
| `nhung.urlIframe` | ✔ nếu có `nhung` | `https`, **phải nằm trong `origin`** ở trên |
| `webhook` | **✔ bắt buộc** | Chỉ được `null` cho app thuần hiển thị nội dung chung, không sinh ra bản ghi nào — và phải nói rõ lý do khi gửi phiếu. Xem mục 4 |
| `webhook.cacLoaiSuKien` | ✔ nếu có `webhook` | Mảng tên loại sự kiện, chữ thường và gạch dưới. **Không dùng `"*"`** trừ khi rổ Xanh và có lý do đã được duyệt |
| `sso` | — | `null` nếu app không đăng nhập bằng tài khoản Hub |
| `sso.redirectUris` | ✔ nếu có `sso` | Mảng ≥1. `https`, **không dấu `#`**. Khớp chính xác chuỗi |
| `sso.backchannelLogoutUri` | — | `https`, hoặc `null`. Khai rồi thì **phải** kiểm chữ ký (mục 5.2) |
| `sso.scopes` | ✔ nếu có `sso` | Tập con của `["openid","profile","hub_profile","offline_access"]`, **bắt buộc có `"openid"`**. Xin đúng phần cần — xin thừa sẽ bị cắt |

**`scopes` — chọn ít nhất có thể:**

| scope | Cho bạn biết gì | Khi nào xin |
|---|---|---|
| `openid` | Mã người dùng (`sub`) | Luôn luôn |
| `profile` | Tên hiển thị | Khi cần hiện tên |
| `hub_profile` | Vai trò, cơ sở, lớp | **Chỉ khi** app thật sự phân quyền theo vai |
| `offline_access` | Giữ phiên dài, tự gia hạn | **Chỉ khi** app cần chạy nền, không có người ngồi trước máy |

### 7.3 BỐN THỨ BẠN KHÔNG ĐƯỢC KHAI

Nhà trường quyết, không phải bạn. Có mặt trong JSON là **phiếu bị từ chối**:

| Không khai | Vì sao |
|---|---|
| Vai nào được mở app | Ai được dùng app là quyết định của nhà trường, không phải của đội làm app |
| App bật hay tắt | App khai xong **luôn TẮT**, tới khi có người có thẩm quyền bật |
| Ngày rà lại | Nhà trường đặt, mặc định 6 tháng |
| Tên biến chứa chuỗi bí mật | Hub tự sinh theo mã app. Bạn nhận **giá trị** từ người vận hành, không đặt tên biến |

### 7.4 Ví dụ một phiếu hoàn chỉnh

```json
{
  "phienBan": 1,
  "maApp": "the-luc",
  "tenHienThi": "Thể lực",
  "moTaMotCau": "Ghi kết quả kiểm tra thể lực và theo dõi tiến bộ theo học kỳ.",
  "roDuLieu": "vang",
  "doiChiuTrachNhiem": "Đội Thể chất — theluc@truongvietanh.com",
  "nhung": {
    "origin": "https://the-luc.truongvietanh.com",
    "urlIframe": "https://the-luc.truongvietanh.com/embed"
  },
  "webhook": {
    "cacLoaiSuKien": ["ket_qua_the_luc", "diem_danh_clb"]
  },
  "sso": {
    "redirectUris": ["https://the-luc.truongvietanh.com/api/auth/callback"],
    "backchannelLogoutUri": "https://the-luc.truongvietanh.com/api/auth/backchannel-logout",
    "scopes": ["openid", "profile", "hub_profile"]
  }
}
```

### 7.5 App chỉ có giao diện, không có webhook, không có đăng nhập

```json
{
  "phienBan": 1,
  "maApp": "thuc-don-tuan",
  "tenHienThi": "Thực đơn tuần",
  "moTaMotCau": "Thực đơn căn tin theo tuần, cập nhật mỗi thứ Hai.",
  "roDuLieu": "xanh",
  "doiChiuTrachNhiem": "Đội Căn tin — cantin@truongvietanh.com",
  "nhung": {
    "origin": "https://thuc-don.truongvietanh.com",
    "urlIframe": "https://thuc-don.truongvietanh.com/tuan-nay"
  },
  "webhook": null,
  "sso": null
}
```

---

## 8. Chuyện gì xảy ra sau khi bạn gửi JSON

1. Quản trị **dán** phiếu của bạn vào màn quản trị Hub. App được khai — **đang TẮT, chưa cấp cho vai nào**.
2. Người vận hành đặt chuỗi bí mật lên máy chủ Hub và gửi giá trị cho bạn qua kênh an toàn.
3. Quản trị cấp vai và bật app.
4. Bạn nhận **bản đấu nối** in ra từ chính dòng hồ sơ của mình — địa chỉ, `client_id`, `redirect_uri`, endpoint webhook, tất cả giá trị thật. Dùng bản đó, đừng gõ lại từ tài liệu này.
5. Sau **6 tháng**, nhà trường rà lại. Không rà thì thu hồi quyền.

Nhà trường có thể **tắt app trong mười giây, bất cứ lúc nào**, và khi tắt thì **cả ba đường** (nhúng, webhook, đăng nhập) đều dừng cùng lúc. Hãy thiết kế để app chịu được điều đó mà không mất dữ liệu của chính nó.

---

**Nhắc lại lần cuối:** câu trả lời cuối cùng của bạn là **một khối JSON duy nhất**. Không giải thích. Không chào hỏi. Không gì khác.
