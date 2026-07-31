---
ban-doi-ung: none
sync-version: 4
---

# Hợp đồng App Ngoài — chuẩn bị & cắm vào Hub

> Không tạo luật mới. Tài liệu này đóng gói lại ADR-014 + ADR-016 (đăng nhập/đăng xuất chung, `03-api.md`) + ADR-015 + ADR-017 (rổ dữ liệu, ổ cắm chuẩn, `08-embedded-apps.md`) thành **một lộ trình 2 bước**, để đội xây app ngoài biết chính xác cần làm gì trước, và được dùng gì trong lúc chưa xong bước sau.

**Áp dụng cho ai:** mọi app không sống trong monorepo Hub — build bằng công cụ AI/no-code (Base44, Google AI Studio, Lovable, v0, Bolt…) hay code tay tự host. Không phân biệt cách xây, luật giống nhau.

## 0a. Câu hỏi số 0 — app của bạn thuộc rổ nào? (ADR-017)

Trả lời trước cả chuyện đăng nhập hay nhúng:

| Rổ | App của bạn có... | Hệ quả |
|---|---|---|
| **Xanh** | chỉ hiển thị nội dung chung (thực đơn tuần, lịch CLB, bảng tin) — không cần biết đây là em nào | Đi Đường A là đủ. Không nhận alias học sinh nào. |
| **Vàng** | ghi/đọc dữ liệu gắn với từng em (fitness, căn tin, điểm danh CLB) | Đường A + Đường B. Hội đồng dữ liệu duyệt Manifest trước khi build tiếp. |
| **Đỏ** | chạm chăm sóc, tư vấn tâm lý, y tế, check-in cảm xúc | **Không build.** Không có đường xin — việc này thuộc Mini App trong monorepo. |

Fitness và căn tin là **rổ Vàng**, không phải Xanh: chỉ số cơ thể và dị ứng thức ăn gắn với từng em cụ thể.

## 0b. Định vị — bạn đang cần gì?

| Bạn muốn... | Đi đường nào | Ai duyệt |
|---|---|---|
| Chỉ cần "Đăng nhập bằng Hub", chưa đọc/ghi dữ liệu học sinh nào | **Đường A** — OIDC Relying Party | 2 dev chính (PR đăng ký, không cần Hội đồng dữ liệu) |
| Ghi dữ liệu học sinh thật về Hub (log, điểm danh, kết quả…) | **Đường B** — Mini App nhúng (Tier 2/3) | Hội đồng dữ liệu, **trước khi** build tiếp |

Đường A dùng được **ngay**, không cần chờ Đường B xong — đây chính là cách "chưa cắm vào vẫn đăng nhập được".

## 1. Đường A — Đăng nhập chung trước, chưa ghi gì

App của bạn không cần tự làm màn hình đăng nhập, không cần giữ mật khẩu riêng — dùng chuẩn **OIDC/OAuth2** (rất nhiều nền tảng no-code có sẵn ô cấu hình "Login with OIDC" / "Custom SSO"; tự code thì dùng một thư viện OIDC client chuẩn, không tự viết tay giao thức).

**Các bước:**

1. Xác nhận nền tảng bạn dùng hỗ trợ OIDC Authorization Code + PKCE.
2. Gửi cho 2 dev chính: tên app, `redirect_uri` chính xác (URL quay lại sau khi đăng nhập).
3. Dev đăng ký app bạn thành một Relying Party (RP) trong config — bạn nhận `client_id` + `client_secret`. Đây là PR chạm `packages/core/**` nên cần 2 chữ ký theo luật vùng lõi, không phải việc vibe team tự làm được.
4. App trỏ tới endpoint chuẩn: `/.well-known/openid-configuration`, `/oidc/authorize`, `/oidc/token`, `/oidc/userinfo` — thư viện OIDC client tự xử lý phần còn lại.
5. Sau khi đăng nhập, bạn nhận một mã định danh (`sub`) — **một chuỗi vô nghĩa (UUID nội bộ)**, không phải tên thật, không phải mã học sinh. Dùng chuỗi này làm khóa tài khoản riêng trong app của bạn — giống kiểu "Đăng nhập bằng Google" chỉ nhận một ID, không nhận cả hồ sơ Google.

**Bạn được:** đăng nhập một lần, không hỏi mật khẩu lại; giữ dữ liệu nghiệp vụ riêng của app (tiến độ, tùy chọn…) khóa theo `sub` đó trong hệ thống của bạn.

**Bạn KHÔNG được ở bước này:** đọc hay ghi bất kỳ dữ liệu học sinh nào của Hub. Biết "đây là ai vừa đăng nhập" không có nghĩa gọi được API Hub — scope cố định chỉ là định danh (`openid profile`).

**Hai nghĩa vụ kèm theo (ADR-016) — không làm thì không được duyệt RP:**

1. **Nhận đăng xuất từ Hub:** khai `backchannel_logout_uri`; nhận được thì đóng phiên phía bạn ngay. Người dùng thoát ở Hub mà app bạn vẫn mở phiên là lỗi của bạn, không phải tính năng.
2. **Không cache hồ sơ quá hạn token:** token sống ≤15 phút. Hết hạn phải hỏi lại Hub — đó chính là lúc Hub từ chối nếu tài khoản đã bị khóa. Cache lâu hơn là giữ cửa cho tài khoản đã bị thu hồi.

**Nếu app bạn cần biết vai trò** (giáo viên hay học sinh, lớp nào): khai thêm scope `hub_profile`, sẽ nhận `hub_role` / `hub_school` / `hub_classes`. Không khai thì không nhận — mặc định là ít quyền nhất.

### 1b. Xoay `client_secret` — luật hai chiều (bổ sung 30/07/2026)

Bài học có thật: Hub đổi secret giữa chừng mà không báo, RP đang chạy gãy im lặng — không lỗi rõ ràng, chỉ là mọi lượt đăng nhập bỗng hỏng. Vì vậy:

**Hub cam kết:**

1. **Không bao giờ đổi secret của một RP đang chạy mà không báo trước.** Đổi khóa là việc có hẹn giờ, không phải việc tiện tay.
2. Mỗi lần xoay đều mở **cửa sổ chồng lấn**: trong khoảng đó Hub nhận CẢ khóa cũ lẫn khóa mới, RP đổi lúc nào trong khoảng cũng được, không cần canh cùng giây với Hub. Cấu hình bằng hai biến của Hub — `..._PREVIOUS` (khóa cũ) và `..._PREVIOUS_UNTIL` (hạn chót, ISO 8601). Thiếu hạn chót thì cửa sổ **không** bật: cửa sổ không có ngày đóng là hai khóa sống song song vĩnh viễn, không phải cửa sổ.
3. Hết hạn, khóa cũ tự chết. Mỗi lần còn ai dùng khóa cũ, Hub ghi cảnh báo vào log kèm tên RP — để biết ai chưa đổi trước khi cửa đóng.
4. **Phát khóa thì phát GIÁ TRỊ, không phát tên biến môi trường của Hub.** Mỗi app có quy ước đặt tên riêng, có app đang dùng tiền tố `OIDC_` cho nhà cung cấp khác. Hub giao đúng ba thứ — issuer, `client_id`, `client_secret` — app tự đặt tên biến của mình.

**RP cam kết:**

1. Đọc secret từ cấu hình/biến môi trường, **không nhúng cứng vào code** — không thì mỗi lần xoay là một lần build lại.
2. Đổi xong báo lại Hub, để đóng cửa sổ sớm thay vì đợi hết hạn.

**Chỉ có MỘT cách gửi khóa: header `Authorization: Basic` (`client_secret_basic`).** Hub cố ý chỉ quảng cáo và chỉ nhận cách này — vì vùng đệm xoay khóa ở trên chỉ phủ được nó.

Lưu ý cho đội tích hợp, đây là bẫy có thật (Factory dính 30/07/2026): nhiều thư viện OIDC — `openid-client` v6 chẳng hạn — mặc định nhét secret vào **thân** request (`client_secret_post`). Phải khai rõ `client_secret_basic`, rồi **đo bằng một request thật**: thấy header `Authorization`, và thân request không còn `client_secret`. Trước đây Hub nhận cả hai cách nên RP cấu hình sai vẫn chạy ngon lúc đấu nối, chỉ tới lúc xoay khóa mới gãy — gãy lặng lẽ, đúng lúc dở nhất. Nay sai là hỏng ngay hôm đấu nối, lúc còn người ngồi nhìn.

## 2. Đường B — Cắm đầy đủ: được ghi dữ liệu thật về Hub

Khi cần Hub và app trao đổi dữ liệu học sinh thật, làm theo `08-embedded-apps.md` — tóm tắt:

1. **Đo Tier bằng lệnh thật**, không đoán: `curl -sI https://<domain app bạn> | grep -i "x-frame-options\|content-security-policy"` — cho nhúng khung (iframe) → Tier 2; bị chặn → Tier 3 (mở tab riêng).
2. **Điền App Manifest** (tên app, **rổ dữ liệu**, nền tảng xây, **có backend riêng hay không**, domain, dữ liệu sẽ chạm tới, đúng 1–2 hành động ghi cần xin, cách sinh `external_id`) — nộp Hội đồng dữ liệu duyệt **trước khi build tiếp**, không phải xin phép sau khi đã xong.
3. Sau khi duyệt, bạn ghi dữ liệu bằng **một trong ba cách**, theo đúng thứ tự ưu tiên này:
   - **Mặc định — quyền theo người dùng:** lệnh ghi mang thẻ ngắn hạn của chính người đang mở app. Không cần giữ secret nào. **Đây là cách duy nhất nếu app bạn không có backend riêng** (mọi app no-code thuần).
   - **Webhook → phòng chờ:** nếu nền tảng của bạn chỉ bắn được webhook. Bắt buộc có `external_id` **lặp lại được** cho cùng một sự kiện — nền tảng no-code hay sinh mã mới mỗi lần gửi lại, khi đó gửi lại sẽ ghi thêm bản mới và đó là lỗi của app, không phải của Hub.
   - **API key phạm vi hẹp:** chỉ cấp cho app **tự host có máy chủ riêng**, dùng cho việc máy-gọi-máy. Key nằm trong biến môi trường phía máy chủ, không bao giờ trong mã chạy ở trình duyệt. Không bao giờ `service_role`, không bao giờ quyền rộng.
4. **Bạn nhận alias, không nhận mã học sinh.** Hub sinh alias và mỗi app một dải riêng — app của bạn và app khác nói về cùng một em vẫn thấy hai chuỗi khác nhau. Đừng cố đoán hay ghép.
5. **Trước go-live:** đo lại Tier (nền tảng ngoài có thể đổi chính sách bất kỳ lúc nào), test nút quay lại Hub hoạt động cả khi app treo, test gọi ngoài phạm vi bị chặn có log, test gửi trùng dữ liệu không tạo bản ghi đôi, rà tay không có tên thật/mã học sinh lọt ra ngoài phạm vi đã khai.
6. **Sau go-live:** Manifest có hạn rà lại **6 tháng**. Đến hạn không xác nhận app còn dùng → Hub thu hồi alias và quyền, gỡ domain khỏi allowlist. Dữ liệu đã đẩy về Hub vẫn giữ — nó thuộc về trường.

## 3. Nâng cấp từ A lên B

Không cần đăng nhập lại hay đổi định danh — `sub` (UUID) đã có từ Đường A vẫn là `sub` đó; phần đăng nhập nằm ở `core.identity_links` không đụng tới. Bước thêm chỉ là App Manifest + Hội đồng dữ liệu duyệt, sau đó Hub cấp alias học sinh cho app bạn qua `core.id_mappings`.

## 4. Cấm tuyệt đối — áp dụng cả hai đường, không ngoại lệ

- Không bao giờ lưu tên thật/`student_code` trong DB riêng của app — kể cả ở Đường A, `sub` nhận được cũng là UUID vô nghĩa.
- Không bao giờ được cấp `service_role` hay quyền gọi API rộng, dù Đường A hay B.
- **App không có backend riêng thì không được cấp API key** — không phải vì không tin bạn, mà vì app chỉ có phần giao diện thì không có chỗ nào giấu được key: ai mở trang cũng nhặt ra.
- Không có đường ghi dữ liệu thứ ba ngoài Embed API/webhook (Đường B) — Đường A không cấp quyền ghi gì cả.
- Không chạm rổ Đỏ ở bất kỳ Tier nào, kể cả chỉ để đọc.
- Mọi lần đăng nhập/ghi dữ liệu đều idempotent — lặp lại 2 lần không tạo bản ghi đôi.

## 5. Cam kết

| Vai trò | Tên | Ngày | Đường (A/B) | Kết luận |
|---|---|---|---|---|
| Owner app (vibe team / dev ngoài) | | | | |
| Dev bảo trợ | | | | |
| Hội đồng dữ liệu (bắt buộc nếu đi Đường B) | | | | |
