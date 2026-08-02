---
ban-doi-ung: none
sync-version: 1
---

# Cắm một Mini App vào Hub — không sửa một dòng mã lõi nào

Dành cho **đội vibe** và bất kỳ ai dựng app ngoài (Base44, Lovable, v0, Firebase Studio, tự host).
Từ 02/08/2026 (migration `0052`), danh sách Mini App nằm trong bảng `core.embedded_apps` chứ không
còn trong mã. Cắm app mới = khai một dòng trên màn quản trị. Không PR, không build, không deploy.

> Bài này nói **cách làm**. Nói **luật** là `08-embedded-apps.md` — đọc mục 0 (ba rổ dữ liệu) và
> mục 3 (Embed Bridge) trước, vì hai chỗ đó quyết định app của bạn có được dựng hay không.

---

## 0. Trước khi khai: ba câu phải trả lời được

Khai app vào Hub là cấp cho một hệ thống bên ngoài một đường đi tới dữ liệu học sinh. Ba câu này
không phải thủ tục — chúng quyết định app đi đường nào, và trả lời sai câu nào cũng dẫn tới việc
phải dựng lại từ đầu.

**(a) App của bạn thuộc rổ nào?** (`08-embedded-apps.md` mục 0)

| Rổ | Nghĩa | Ví dụ |
|---|---|---|
| **Xanh** | Không gắn tên em nào | Thực đơn tuần căn tin, lịch CLB, bảng tin |
| **Vàng** | Có gắn định danh từng em | Fitness, suất ăn và dị ứng, điểm danh CLB |
| **Đỏ** | Cấm tuyệt đối | `care.*`, `health.*`, tâm trạng trong `attendance.checkins` |

**Bẫy phân loại hay gặp nhất:** fitness và căn tin *nghe* như rổ Xanh nhưng là **rổ Vàng** — app
fitness ghi chỉ số cơ thể của từng em, căn tin ghi em nào dị ứng món gì; cả hai buộc phải biết
"đây là em nào" mới chạy được. Chỉ app hiển thị nội dung chung cho cả trường mới là Xanh.

Rổ Đỏ không có đường xin, và không có cách khai: `CHECK` của bảng chỉ nhận `xanh` và `vang`.

**(b) App có nhúng được không?** Đo, đừng đoán:

```bash
curl -I https://ten-mien-cua-app/trang-embed
```

Có `X-Frame-Options: DENY`/`SAMEORIGIN`, hoặc có `Content-Security-Policy: frame-ancestors 'none'`
⇒ nền tảng đó **chặn nhúng**, app phải đi Tier 3 (mở tab riêng) và bài này không áp dụng.
Không có hai thứ đó ⇒ Tier 2, nhúng được, đi tiếp.

**(c) App có máy chủ riêng không?** Không có (app no-code thuần UI) ⇒ nó chỉ nhận được **context
token** để hiển thị, không tự đổi được token, và **không được cấp API key**. Mọi lệnh ghi vẫn phải
đi qua Embed API.

---

## 1. Dựng phía app con — bốn việc, và một việc cấm

Bản mẫu chạy được: **`tools/mini-app-mau/index.html`**. Một file HTML, không phụ thuộc gói nào,
host ở bất kỳ đâu có HTTPS. Mở nó ra đọc — nó tự nói ra từng bước bắt tay đang ở đâu.

1. Tải xong thì gửi `{type:'embed:ready', version:1}` lên `window.parent`. Hub nạp iframe bằng URL
   **trần** và chỉ gửi mã sau khi nhận được `ready`. Không gửi ⇒ không bao giờ có token.
2. Nghe `message`, **kiểm `event.origin`** khớp origin của Hub **trước khi đọc bất cứ thứ gì**.
   Thiếu bước này là lỗ hổng đánh cắp token kinh điển.
3. Nhận `{type:'embed:token'}` → POST mã đó tới `/oidc/token` của Hub **server-to-server** (không
   qua trình duyệt) để đổi lấy `id_token`.
4. Chiều cao đổi thì gửi `{type:'embed:resize', version:1, height}`.

**CẤM:** app con tự vẽ nút "quay lại Hub". Hub vẽ nút đó **ngoài** iframe. App con vẽ thì Hub mất
quyền kiểm soát điều hướng — và một nút quay lại hỏng bên trong app là thứ người dùng ghét nhất ở
trải nghiệm "app trong app" làm ẩu.

**Cấm nữa:** đừng host app mẫu ở cùng origin với Hub để "thử cho nhanh". `08-embedded-apps.md` §3:
cặp `allow-scripts` + `allow-same-origin` chỉ an toàn *vì* iframe khác origin; cùng origin thì app
con thoát được sandbox và chạm được DOM của Shell. `CHECK` của bảng cũng chặn: `origin` phải là
`https://`.

---

## 2. Khai vào Hub — màn quản trị, sáu ô

Đăng nhập bằng tài khoản có vai `admin` → menu **Mini App** (`/quan-tri/mini-app`) → **Khai app mới**.

| Ô | Ghi gì | Đổi được sau không |
|---|---|---|
| Mã app | chữ thường, số, gạch ngang. Thành `/embed/<mã app>` | **Không** |
| Tên hiện cho người dùng | tên người dùng đọc | Có |
| Rổ dữ liệu | Xanh hoặc Vàng (mục 0) | **Không** |
| Người chịu trách nhiệm | đội làm app + dev lõi bảo trợ | Có |
| Ngày rà lại | thường 6 tháng | Có |
| Origin | `https://ten-mien` — **không** đường dẫn, **không** dấu `/` cuối | Có |
| URL iframe | phải nằm trong origin ở trên | Có |
| Tên biến môi trường chứa secret | CHỈ tên, ví dụ `EMBED_WEBHOOK_SECRET_TENAPP` | Có |

**Mã app và rổ dữ liệu không sửa được** — cố ý. Mã app nằm trong URL, trong header `x-embed-app`
của mọi webhook app đang gửi, và trong alias đã sinh cho từng em (`sha256(app-id + alias + …)`);
đổi nó là làm đứt cả ba, và cái thứ ba **không dựng lại được**. Rổ dữ liệu là thứ Hội đồng dữ liệu
duyệt — đổi nó trên một màn hình là đi vòng qua chính hội đồng đó. Muốn đổi: tắt app cũ, khai app
mới, để lịch sử còn lại hai dòng.

**Secret webhook không bao giờ vào cơ sở dữ liệu.** Ô đó nhận *tên biến môi trường*, không nhận giá
trị. Lý do: bản sao lưu database đi ra khỏi máy chủ (3-2-1, `06-resilience-security.md`), mọi
`pg_dump` để dựng môi trường dev là một lần nhân bản secret, và người có quyền đọc bảng quản trị
không đồng nghĩa với người được biết secret. Giá trị đặt trên máy chủ:

```bash
# apps/hub/.env.local (máy dev) hoặc biến môi trường của tiến trình (máy chủ thật)
EMBED_WEBHOOK_SECRET_TENAPP=<chuỗi ngẫu nhiên ≥32 ký tự>
```

Màn quản trị sẽ tự nói **"khai `X` nhưng biến này CHƯA được đặt trên máy chủ — webhook sẽ trả 401"**
nếu bạn khai tên mà quên đặt giá trị. Đó là ca hỏng im lặng mà cột đó sinh ra để bắt.

---

## 3. Cấp vai và bật — hai bước, cố ý không gộp

App vừa khai **luôn TẮT** và **chưa cấp cho vai nào**. Đây không phải là thiếu tiện lợi:

- "App này tồn tại" và "app này được chạm vào dữ liệu học sinh" là hai quyết định khác nhau. Gộp
  vào một cú bấm thì cú bấm đó sẽ được bấm lúc đang vội.
- Mảng vai rỗng = **không ai** mở được (fail-closed). App mới quên cấp vai sẽ hỏng ngay lần bấm
  đầu tiên, lúc còn người ngồi nhìn — thay vì mở toang cho mọi vai rồi sáu tháng sau mới phát hiện
  một em học sinh vào được app nhân viên.

Bấm **Sửa cấu hình** → tick vai → **Lưu** → bấm **Bật app**.

---

## 4. Nghiệm thu: bốn thứ phải thấy tận mắt

Không có bước nào trong đây thay được bước nào.

1. **Tile hiện đúng vai.** Đăng nhập bằng một vai **đã tick** → trang chủ có tile. Đăng nhập bằng
   một vai **chưa tick** → tile **không** có. Thiếu vế thứ hai thì "tile hiện ra" chưa chứng minh
   được gì về phân quyền.
2. **Gõ thẳng URL cũng bị chặn.** Vai chưa tick mở `/embed/<mã app>` phải nhận 404. Giấu tile
   không phải là chặn — đây là chỗ phân biệt hai điều đó.
3. **App con đi hết bốn bước.** Mở bằng vai đã tick, xem `tools/mini-app-mau/index.html` (hoặc log
   của app thật): phải thấy đủ `ready` → `token` → `resize`.
4. **Công tắc thu hồi có tác dụng ngay.** Bấm **Tắt app** → tải lại trang chủ → tile biến mất, và
   `/embed/<mã app>` trả 404. Không phải chờ, không phải deploy.

---

## 5. Khi nào hỏng và hỏng ở đâu

| Triệu chứng | Nguyên nhân theo thứ tự nên kiểm |
|---|---|
| Tile không hiện | (1) app đang TẮT · (2) vai đang đăng nhập chưa được tick · (3) app không có `origin`/`iframe_url` nên nó là app-chỉ-webhook, không có UI để mở |
| Bấm tile ra 404 | vai chưa được tick — đây là hàng rào thật, không phải lỗi |
| Khung trắng, app không nạp | origin khai trong sổ **không khớp** origin thật ⇒ CSP `frame-src` chặn. Mở DevTools → Console, lỗi CSP nói rõ domain nào bị chặn |
| Màn chờ đứng ở "quá lâu" | app con chưa gửi `embed:ready`, hoặc gửi rồi mà Hub chưa lấy được mã OIDC |
| App nhận `ready` nhưng không có token | app con không kiểm/không khớp `event.origin`, nên nó bỏ qua chính thông điệp của Hub |
| Webhook trả 401 | (1) biến môi trường chứa secret **chưa được đặt** trên máy chủ — màn quản trị nói thẳng ca này · (2) `event_type` gửi lên không nằm trong danh sách đã khai |
| Webhook trả 401 sau khi vừa khai xong | Hub đệm sổ đăng ký 10 giây. Đợi 10 giây, hoặc bấm bất kỳ nút nào trên màn quản trị (mọi mutation tự xoá đệm) |

---

## 6. Vòng đời: app không chỉ có ngày sinh

`08-embedded-apps.md` mục 5: mỗi Manifest có **ngày rà lại**; quá hạn mà chủ sở hữu không xác nhận
app còn dùng thì **thu hồi** quyền. Trước 02/08/2026 luật này không có chỗ nào để ghi ngày, nên nó
tồn tại trên giấy và chưa từng chạy. Nay:

- Cột `review_due_on` là `NOT NULL` — không khai được một app "không bao giờ đến hạn".
- Màn quản trị hiện số ngày còn lại, và bật đỏ khi quá hạn.
- `core.v_mini_app_can_ra_lai` liệt kê app tới hạn trong 30 ngày tới.

Việc **thu hồi vẫn do người bấm**, không tự động. Máy nói cho người biết; quyết định tắt một app
đang có người dùng là quyết định của người.

App bị nền tảng ngoài khai tử (Base44 đóng cửa, domain hết hạn rồi bị người khác mua lại) xử lý y
như vậy — và ca "domain bị người khác mua lại" là ca gấp nhất, vì `frame-src` vẫn đang allowlist
domain đó.

**Dữ liệu đã promote vào Hub thì giữ nguyên.** Nó thuộc về trường, không thuộc về app.
