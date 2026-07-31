---
ban-doi-ung: none
sync-version: 2
---

# Prompt mẫu — cắm đăng nhập chung (Đường A) cho app ngoài

Dán nguyên khối bên dưới vào công cụ đang dựng app (Base44 / Lovable / v0 / Claude / Cursor…).
Trước khi dán, thay 3 chỗ trong ngoặc nhọn. Đây là **Đường A** trong `09-hop-dong-app-ngoai.md`:
chỉ đăng nhập, chưa đọc/ghi dữ liệu học sinh nào.

Cần thêm quyền ghi dữ liệu học sinh (fitness, căn tin…) thì làm xong Đường A trước, rồi mới nộp
App Manifest xin Đường B — không làm ngược.

---

```
Hãy tích hợp đăng nhập cho ứng dụng này bằng chuẩn OpenID Connect (OIDC), dùng
Authorization Code Flow kèm PKCE. Nhà cung cấp định danh là School Data Hub của
Hệ thống Trường Việt Anh.

THÔNG TIN CẤU HÌNH
- Discovery URL: <HUB_URL>/.well-known/openid-configuration
  (tự đọc từ đây, đừng hard-code từng endpoint)
- client_id: <CLIENT_ID>
- client_secret: <CLIENT_SECRET>   ← chỉ dùng nếu app có phần máy chủ riêng;
  app chỉ chạy trong trình duyệt thì KHÔNG được nhúng chuỗi này vào mã nguồn,
  hãy dùng PKCE public client.
- scope: openid profile

YÊU CẦU BẮT BUỘC — không đạt đủ thì đăng ký sẽ bị từ chối

1. PKCE bắt buộc, kể cả khi app có máy chủ riêng.
2. redirect_uri phải khớp chính xác từng ký tự với URL đã đăng ký. Không dùng
   wildcard, không dùng khớp theo tiền tố.
3. Dùng một thư viện OIDC client chuẩn của nền tảng đang dùng. TUYỆT ĐỐI không
   tự viết tay giao thức (rất dễ sai ở PKCE, kiểm chữ ký, và xoay khóa).
3b. Gửi client_secret bằng header "Authorization: Basic", tức khai
   token_endpoint_auth_method = "client_secret_basic". PHẢI KHAI RÕ RÀNG: nhiều
   thư viện (openid-client v6 chẳng hạn) mặc định nhét secret vào THÂN request
   (client_secret_post) — Hub chỉ nhận Basic nên sẽ trả invalid_client. Đo lại
   bằng một request thật: phải thấy header Authorization, và thân request KHÔNG
   còn client_secret. Lý do Hub chốt một cách duy nhất: vùng đệm lúc xoay khóa
   (nhận cả khóa cũ lẫn khóa mới trong thời hạn) chỉ phủ được cách gửi qua header.
4. Sau khi đăng nhập, app nhận một trường "sub" — đây là một chuỗi UUID vô nghĩa.
   Dùng đúng chuỗi này làm khóa tài khoản trong app.
5. TUYỆT ĐỐI KHÔNG lưu, không hiển thị, không suy đoán bất kỳ định danh HỌC SINH nào — tên
   thật, mã học sinh, email, số điện thoại, ngày sinh. App chỉ được biết "sub" của em đó.
   Điều này CHỈ áp dụng cho học sinh (dữ liệu trẻ em, Luật 91/2025/QH15) — nếu người đăng
   nhập là giáo viên/nhân viên và app hoàn toàn không chạm dữ liệu học sinh (rổ Xanh), được
   phép lấy tên từ trường "name" trong id_token và LƯU XUỐNG cơ sở dữ liệu để phục vụ nhật
   ký nghiệp vụ (vd "Cô Lan gửi duyệt gói X") — đúng như cách Hub tự hiển thị tên giáo viên
   trong chính giao diện của mình. App đụng dữ liệu học sinh (rổ Vàng) thì tuyệt đối không,
   kể cả với giáo viên: nhật ký ghi theo "sub", tra tên hiển thị (nếu cần) mỗi lần đọc lại
   qua "hub_profile"/API, không cache tên xuống DB riêng của app.
6. Vòng đời phiên:
   - access_token/id_token sống tối đa 15 phút. KHÔNG cache hồ sơ người dùng lâu
     hơn thời hạn token. Hết hạn thì hỏi lại Hub — đó chính là lúc Hub từ chối nếu
     tài khoản đã bị khóa.
   - Phải hiện thực back-channel logout: mở một endpoint (ví dụ /oidc/backchannel-logout)
     nhận logout_token từ Hub, xác thực chữ ký, rồi đóng phiên phía app ngay lập tức.
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
3. App có phần máy chủ riêng không, hay chỉ chạy trong trình duyệt
4. Thư viện OIDC đã dùng
5. Kết quả tự kiểm: đăng nhập 2 lần chỉ ra 1 tài khoản; thoát ở Hub thì app cũng thoát
```

---

# Bước 0 — bắt app tự khảo sát rồi hướng dẫn ngược lại cho người không chuyên

Chạy **trước** biến thể A hoặc B. Lý do: các chỗ `<DUONG-DAN-CALLBACK>`, tên file cấu hình, tên bảng
người dùng… đều nằm trong chính mã nguồn của app — người đi đăng ký Google không có cách nào biết,
và đoán sai một ký tự là Google từ chối. Thay vì bắt người dùng mò, bắt app tự đọc mã nguồn của nó
rồi in ra bản hướng dẫn thao tác.

Áp dụng cho mọi app: Viet Anh Class, Moodle, fitness, căn tin, app vibe team dựng sau này.

```
NHIỆM VỤ BƯỚC 1 — TUYỆT ĐỐI CHƯA VIẾT DÒNG CODE NÀO

Tôi muốn thêm "Đăng nhập bằng Google" vào ứng dụng này. Tôi là người quản lý, không
rành kỹ thuật, và tôi sẽ là người trực tiếp thao tác trên Google Cloud Console.

Trước khi viết bất kỳ dòng code nào, hãy làm đúng ba việc sau.

VIỆC 1 — TỰ ĐỌC MÃ NGUỒN VÀ TỰ TÌM, ĐỪNG HỎI TÔI
Hãy tự xác định và liệt kê ra:
- Ngôn ngữ, framework và thư viện app đang dùng
- Cách đăng nhập hiện tại đang hoạt động thế nào
- Bảng người dùng tên là gì, cột email tên là gì, khóa chính là gì
- App đang chạy thật ở địa chỉ nào (tìm trong cấu hình, biến môi trường, tài liệu triển khai)
- Nếu chạy thử trên máy thì ở cổng nào
- Đường dẫn quay về sau khi đăng nhập Google SẼ LÀ GÌ — tự quyết theo đúng quy ước của
  thư viện sẽ dùng, KHÔNG được bịa và KHÔNG được hỏi tôi
- File cấu hình biến môi trường tên là gì, đang nằm ở thư mục nào

VIỆC 2 — IN RA BẢN HƯỚNG DẪN THAO TÁC CHO TÔI
Viết như đang chỉ cho người chưa từng mở Google Cloud Console bao giờ. Không dùng từ
chuyên môn; nếu buộc phải dùng thì giải thích ngay trong ngoặc. Đủ 5 phần theo đúng
thứ tự này:

PHẦN A — Từng bước bấm ở đâu
  Đánh số, mỗi bước đúng MỘT hành động, ghi rõ tên menu và tên nút cần bấm.

PHẦN B — Bảng những ô cần điền
  Hai cột: "Tên ô trên màn hình Google" và "Giá trị cần điền".
  Giá trị phải là chuỗi HOÀN CHỈNH, chính xác từng ký tự, để tôi copy dán thẳng.
  TUYỆT ĐỐI không viết kiểu "your-domain.com", "<địa chỉ app của bạn>", "..." —
  nếu bạn không chắc giá trị nào, đưa nó xuống PHẦN E chứ đừng để chỗ trống.

PHẦN C — Sau khi làm xong, tôi phải gửi lại cho bạn những gì
  Liệt kê đúng tên từng thứ, và mô tả nó trông như thế nào để tôi khỏi copy nhầm
  (ví dụ: "một chuỗi dài kết thúc bằng .apps.googleusercontent.com").

PHẦN D — Tôi dán chúng vào đâu
  Ghi rõ tên file, tên biến, và dán theo đúng định dạng nào. Nếu cần tạo file mới
  thì nói rõ tạo ở thư mục nào. Nếu có nơi nào KHÔNG được dán vào (ví dụ file bị
  đẩy lên kho mã nguồn công khai) thì cảnh báo tôi.

PHẦN E — Kiểm tra và xử lý khi sai
  - Cách tôi tự biết là đã chạy đúng (bấm gì, thấy gì)
  - Ba lỗi hay gặp nhất, thông báo lỗi trông ra sao, và sửa thế nào
  - Những thông tin bạn KHÔNG tự tìm được và cần tôi cung cấp (nếu có)

VIỆC 3 — HỎI TỐI ĐA 3 CÂU
Chỉ hỏi những gì thực sự không thể tự tìm trong mã nguồn. Mỗi câu hỏi phải kèm gợi ý
tôi tìm câu trả lời ở đâu. Nếu tự tìm được hết thì không hỏi câu nào.

NHẮC LẠI: bước này CHỈ in ra bản hướng dẫn. Chưa viết code, chưa sửa file nào.
Sau khi tôi làm xong và đưa lại thông tin, tôi sẽ gửi bạn yêu cầu code ở bước sau.
```

**Vì sao bắt in ra 5 phần cố định:** nếu để AI tự do trả lời, nó hay đưa hướng dẫn nửa vời kiểu
"điền địa chỉ app của bạn vào ô Redirect URI" — đúng về lý thuyết, vô dụng khi thao tác. Ép nó ra
chuỗi hoàn chỉnh copy-paste được thì mới dùng được, và mới lộ ra chỗ nào nó đang đoán.

---

# Biến thể B — app ĐANG CHẠY THẬT, tạm dùng Google trong lúc chờ Hub

Dùng khi app đã có người dùng và tài khoản sẵn (Viet Anh Class, Moodle…), cần thêm đăng nhập
Google ngay bây giờ. Khác biến thể A ở hai chỗ sống còn: **nối tài khoản cũ** và **lưu nơi cấp**.

## Vai trò — đọc kỹ trước khi cấu hình Google Cloud

- Một **project Google Cloud** = một thư mục chứa, KHÔNG phải "Hub".
- Mỗi app = **một OAuth Client riêng** trong thư mục đó, điền địa chỉ quay về của chính nó.
- `redirect_uri` của app **không bao giờ đổi** khi chuyển sang Hub — nó là địa chỉ nhà của app.
  Cái đổi chỉ là app hỏi ai: `accounts.google.com` → `<HUB_URL>/oidc`.

```
HÔM NAY                          SAU KHI CÓ HUB
Class ──────► Google             Class ──────► Hub ──────► Google
Fitness ────► Google             Fitness ────► Hub ──────┘
```

## Prompt

```
Ứng dụng này ĐÃ ĐANG CHẠY và đã có người dùng cùng dữ liệu thật. Hãy thêm tính năng
"Đăng nhập bằng Google" theo chuẩn OpenID Connect, KHÔNG thay thế cách đăng nhập hiện có.

CẤU HÌNH
- Discovery URL: https://accounts.google.com/.well-known/openid-configuration
- client_id:     <CLIENT_ID>.apps.googleusercontent.com
- client_secret: <CLIENT_SECRET>   ← chỉ dùng ở phía máy chủ, không bao giờ trong mã chạy ở trình duyệt
- scope:         openid email profile
- redirect_uri:  https://<domain-app>/<duong-dan-callback>   ← khớp từng ký tự với ô đã khai ở Google

CÁCH LÀM
1. Dùng thư viện OIDC chuẩn của nền tảng đang dùng. TUYỆT ĐỐI không tự viết giao thức,
   và KHÔNG dùng bộ công cụ riêng của Google (gapi, firebase/auth) — dùng chúng thì ngày
   chuyển sang nhà cung cấp khác phải viết lại toàn bộ.
2. Bật PKCE.
3. Mọi địa chỉ đọc từ biến môi trường, không viết cứng trong mã. Sau này đổi nhà cung cấp
   chỉ được phép là đổi biến môi trường.

BẮT BUỘC 1 — NỐI VÀO TÀI KHOẢN CŨ, KHÔNG TẠO TÀI KHOẢN MỚI
Đây là yêu cầu quan trọng nhất. App đã có người dùng; nếu ai đó đăng nhập bằng Google mà
hệ thống tạo một hồ sơ trắng thì toàn bộ dữ liệu cũ của họ biến mất khỏi màn hình.
- Sau khi Google trả kết quả, lấy email đã xác thực (chỉ chấp nhận khi email_verified = true).
- Nếu email đó ĐÃ tồn tại trong bảng người dùng: gắn thông tin Google vào chính tài khoản đó.
- Nếu CHƯA tồn tại: mới tạo tài khoản mới.
- Việc này phải idempotent: đăng nhập 10 lần vẫn chỉ một tài khoản. Viết test cho nó.

BẮT BUỘC 2 — LƯU HAI CỘT, KHÔNG PHẢI MỘT
Tạo bảng liên kết định danh với các cột: user_id nội bộ, issuer, subject, thời điểm liên kết.
- Với Google: issuer = "https://accounts.google.com", subject = trường "sub" trong id_token.
- Khóa duy nhất theo (issuer, subject), VÀ khóa duy nhất theo (issuer, user_id).
- KHÔNG khoá tài khoản chỉ theo "sub". Ngày chuyển sang nhà cung cấp khác, số hiệu sẽ khác
  hẳn; có cột issuer thì chỉ cần thêm một dòng mới, dữ liệu cũ vẫn dính nguyên chủ.

BẮT BUỘC 3 — CHẶN NGƯỜI NGOÀI TRƯỜNG
- Gửi kèm tham số hd=<ten-mien-truong> khi chuyển sang Google.
- VÀ kiểm lại trường "hd" trong id_token ở phía máy chủ. Chỉ gửi tham số mà không kiểm lại
  thì bất kỳ ai có Gmail vẫn vào được — tham số chỉ là gợi ý giao diện, không phải hàng rào.

BẮT BUỘC 4 — GIỮ NGUYÊN ĐƯỜNG CŨ
Không tắt, không ẩn cách đăng nhập hiện tại. Chạy song song. Có người quên, có người đổi
email, có người không có tài khoản Google — phải còn đường lùi.

KHÔNG ĐƯỢC LÀM
- Không lưu, không hiển thị mã học sinh hay tên thật học sinh lấy từ nguồn nào khác.
- Không xin scope ngoài "openid email profile".
- Không nhúng client_secret vào mã chạy trong trình duyệt.

SAU KHI XONG, BÁO CÁO LẠI 5 THÔNG TIN:
1. redirect_uri chính xác đã dùng
2. Thư viện OIDC đã dùng
3. Tên bảng liên kết định danh và các cột của nó
4. Kết quả test: đăng nhập 2 lần chỉ ra 1 tài khoản; người có email cũ trong hệ thống
   đăng nhập bằng Google thì thấy đúng dữ liệu cũ của mình
5. Kết quả test: tài khoản Gmail ngoài trường bị từ chối
```

## Ngày chuyển sang Hub cần đổi gì

Đúng hai dòng cấu hình: `Discovery URL` và `client_id`. `redirect_uri` giữ nguyên.
Điều kiện để chuyện đó là sự thật chính là **BẮT BUỘC 2** ở trên.

---

## Việc của phía Hub sau khi nhận báo cáo

1. Kiểm `redirect_uri` khớp chính xác, không wildcard.
2. Kiểm app có khai `backchannel_logout_uri` — **thiếu là từ chối đăng ký** (ADR-016).
3. App không có máy chủ riêng → đăng ký dạng public client + PKCE, **không cấp `client_secret`**.
4. Thêm RP vào config tĩnh (`03-api.md`). PR này chạm `packages/core/**` nên cần 2 chữ ký (§10).
5. Chạy 3 bài kiểm bắt buộc trong `03-api.md`: đăng nhập lần 2 không tạo `identity_links` đôi ·
   `external_id` đã map người khác thì bị chặn · thiếu PKCE hoặc sai redirect thì `/authorize` từ chối.
