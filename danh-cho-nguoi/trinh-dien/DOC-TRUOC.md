# Trang trình diễn Hub — đọc trước khi sửa

Trang trình diễn 4 màn: **đăng nhập → video intro → intro sư tử → trang chủ**. Có nút bỏ
qua ở mọi màn, nên trình bày trước đám đông không bao giờ bị kẹt.

**Chỉ có MỘT bản**, ở `apps/hub/public/trinh-dien/index.html`. Xem bằng cách bật công tắc
(phần cuối tài liệu này) rồi mở `hub.truongvietanh.com`. Thư mục này giữ đúng tài liệu bạn
đang đọc — không giữ bản sao nào của trang, vì hai bản sao là hai chỗ sẽ lệch nhau.

## Nó đến từ đâu

Dự án Claude Design **"School data hub app"**
(`ad81b74b-ed81-4b0e-9cc0-d15a249a0c96`), file `home-6-show-light.html`.

Lấy từ **bản xuất .zip**, không phải bản đọc qua công cụ đồng bộ — đo ra hai bản lệch nhau
5 dòng: bản qua công cụ mang thêm `data-comment-anchor="…"`, là dấu neo bình luận của
trình soạn thảo, không thuộc thiết kế. Lần sau đồng bộ thì **cũng lấy từ .zip**.

Trang dùng chung logo, mascot và phông icon với app thật (`/logo.webp`,
`/mascot-sheet.webp`, `/fonts/…`) — **không có bản sao nào**, nên đổi logo trong app là
trang này đổi theo.

## Ba triệu chứng chậm/lag — ba nguyên nhân riêng

Chủ đầu tư 23/08/2026: *"nó load chậm thế, thậm chí video còn chưa chạy, mà nó còn scale
lên to nữa"*. Đo ra ba nguyên nhân khác nhau, không cái nào là cái kia.

### 1. Bộ lọc làm nét chạy trên từng khung hình

`.cin-bg` mang `filter: url(#vsharp)` — một **phép nhân chập 3×3** trên video toàn màn,
**24 lần mỗi giây**. Thứ đắt nhất có thể đặt lên video trong trình duyệt. **Đã bỏ.**

Độ nét không mất, chỉ chuyển chỗ: nguồn 4K xuống thang bằng lanczos, tức làm nét **một
lần lúc mã hoá** thay vì 24 lần mỗi giây lúc chạy. `brightness`/`saturate` giữ lại —
một lượt tô GPU, gần như miễn phí, và là màu người thiết kế chọn.

### 2. Video nặng hơn đường truyền

Đo băng thông thật qua tunnel: **~7,6 Mbps**. Video cũ 10,6 và 14,3 Mbps — nặng gấp đôi
đường truyền, nên không bao giờ chạy mượt được, và 4,4 giây đầu là màn tối.

| | trước | nay | qua tunnel |
|---|---|---|---|
| Nền đăng nhập | 10,07 MB · 10,6 Mbps | **1,55 MB · 1,6 Mbps** | 4,43s → **1,68s** |
| Video intro | 17,10 MB · 14,3 Mbps | **3,44 MB · 2,9 Mbps** | → 4,9s (tải sẵn từ màn đăng nhập) |
| Ảnh nền tĩnh | *(không có)* | **0,05 MB** | **0,31s** |

**Ảnh nền tĩnh (`poster`) mới là thứ chữa triệu chứng "video chưa chạy".** Trước đây
1,7 giây đầu là màn trống vì video chưa có dữ liệu. Nay poster về sau 0,31 giây, hiện
ngay khung hình đầu; video thay vào khi tải đủ, người xem không thấy khoảng trống nào.

Nền hạ xuống **1280×720** — nó nằm sau một lớp phủ tối, không ai soi chi tiết, mà nửa số
điểm ảnh thì nhẹ hẳn. Intro giữ 1080 vì đó là khoảnh khắc chính.

### 3. "Scale lên to" — trang có ĐÚNG 0 media query

Mọi kích thước là pixel cứng: tiêu đề `72px`, panel `right:64px bottom:110px
max-width:560px`, logo `left:40px top:26px`. Dựng cho màn rộng ~1600×900. Mở trên màn nhỏ
hơn thì mọi thứ giữ nguyên số pixel đó, nên chiếm phần màn lớn hơn nhiều — đó là cảm giác
"to", không phải video bị phóng.

*(Đã kiểm riêng chuyện video: trích khung từ bản 4K và bản 1080 cũ rồi so — **cùng khung
hình y hệt**, bản 4K chỉ nét hơn. SSIM 0,934 giữa hai bản là do chênh độ nét, không phải
do cắt khác.)*

Đã thêm một khối `<script>` cuối trang đặt `zoom` theo `min(rộng/1600, cao/900, 1)`.

### Và ép kích thước sáu lớp phủ màn bằng SỐ

Phần này thêm sau khi chủ đầu tư hỏi *"bạn đã cho chiều cao video bằng chiều cao màn
chưa"* — câu hỏi chạm đúng chỗ khối `zoom` vừa làm hỏng mà chưa ai kiểm.

Đọc chuỗi thừa kế trong CSS thì câu hỏi rút gọn được:

```
html          zoom: k
 └ .scene     position:fixed; inset:0
    └ .cin-bg position:absolute; inset:0; height:100%; object-fit:cover
```

`.cin-bg` bằng đúng `.scene`, và `object-fit:cover` luôn phủ kín hộp cả hai chiều — nên
*"video có cao bằng màn"* chính là *"`.scene` có bằng đúng màn"*.

**Trước** khi có `zoom`: chắc chắn, vì `fixed; inset:0` là viewport.
**Sau** khi có: phụ thuộc vào việc trình duyệt giải nghĩa `position:fixed` trong hệ toạ độ
đã thu nhỏ hay chưa. Hai cách hiểu cho hai kết quả, và cách hiểu sai để lộ viền trống ở
mép phải và mép dưới — tức video **không** cao bằng màn.

Nên script không dựa vào cách hiểu nào cả: nó đặt thẳng `innerWidth/k` và `innerHeight/k`
cho sáu phần tử phủ màn (`.scene`, `#gl`, `#flash`, `#vignette`, `#modal`, `#blackout`).
Nhân với hệ số thu `k` ra đúng số điểm ảnh thật của màn hình.

Danh sách sáu phần tử đó **đối chiếu bằng cách đọc CSS**, không gõ tay — quét mọi selector
có `position:fixed` kèm `inset:0`.

`tests/unit/trinh-dien.test.ts` canh danh sách đó khớp CSS. **Thêm một phần tử
`fixed; inset:0` mới mà quên khai vào script thì nó hụt mép, và hụt lặng lẽ.**

Vì sao `zoom` chứ không `transform: scale()`: `.scene` là `position:fixed; inset:0`. Đặt
`transform` lên tổ tiên của phần tử `fixed` sẽ biến tổ tiên thành khung tham chiếu mới,
bốn màn căn theo `#root` đã co và lộ viền trống quanh mép. `zoom` co cả hệ toạ độ nên
`fixed` vẫn bám viewport.

Vì sao không viết lại CSS cho co giãn: đây là **file thiết kế**, đồng bộ lại từ Claude
Design là ghi đè. Sửa hàng chục cỡ pixel là tạo một bản rẽ nhánh sẽ mất ở lần đồng bộ sau.
Một khối script thêm vào cuối thì sống sót được.

### Cả hai video đều dựng từ NGUỒN 4K

| Đang dùng | Nguồn |
|---|---|
| `su-tu-chay.mp4` (nền đăng nhập) | `Armored_lion_mascot_running_loop_202608220945.mp4` — 3840×2160, 24 MB |
| `intro-software.mp4` | `Armored_lion_software_intro_anim…_202608221018.mp4` — 3840×2160, 34 MB |

Cả hai đều **xuống thang bằng lanczos**, không chiếu 4K trực tiếp: 3840×2160 là 4× số điểm
ảnh mỗi khung, trong khi màn hình chỉ hiển thị tối đa ~1920 chiều ngang. Dùng 4K làm nguồn
cho ảnh nét hơn bản 1080 xuất sẵn, mà chi phí giải mã không tăng.

Kiểm mỗi lần đổi video, và đây là phép kiểm đã cứu một lần: **trích một khung từ bản cũ và
bản mới rồi NHÌN**, đừng chỉ tin SSIM. Lần đổi video nền, SSIM giữa hai bản chỉ 0,934 —
trông như hai bản cắt khác nhau. Nhìn ảnh thì thấy cùng khung hình y hệt, con số thấp chỉ
vì chênh độ nét. Tin số mà không nhìn thì đã đi sửa nhầm chỗ.

SSIM bản intro mới so nguồn 4K xuống thang: **0,972**.

### Video intro: chạy trước khi lộ diện, và bỏ phóng to 6%

Chủ đầu tư báo lần hai: *"vẫn hơi khựng… ngoài ra tôi thấy video intro vẫn hơi to về chiều
cao"*. Đọc mã ra **hai nguyên nhân riêng**, không cái nào là cái kia.

**Chiều cao.** Thẻ `#intro-video` mang `transform: scale(1.06)` và chỉ thu về `scale(1)`
**sau khi** sự kiện `playing` bắn. Buffer chậm thì nó ngồi ở 6% quá khổ suốt thời gian
chờ. Đã bỏ hẳn transform — video khớp đúng màn từ khung đầu; hiệu ứng lộ diện còn lại
`opacity`.

**Khựng.** Đọc `showFromPanel()` ra dòng thời gian:

| | |
|---|---|
| t = 0 | `go-dark` — khung hoá đen |
| t = 280ms | `zoom-out` — khối đen phóng to trùm màn |
| **t = 900ms** | **`startShow()` — chỗ DUY NHẤT gọi `play()`** |

Video mới bắt đầu tải và giải mã ở t=900ms, đúng lúc khối đen sắp tan. Nên khung đầu luôn
đến muộn.

Nay `chayTruoc()` gọi ngay tại `go-dark` (t=0): video chạy **câm** suốt 900ms màn còn đen —
thời gian cho không, không ai nhìn thấy gì — làm ấm cả bộ đệm mạng lẫn bộ giải mã. Tới
`startShow()` thì tua về 0 và mở tiếng. **Tua trong vùng đã đệm là miễn phí**, không tải
lại byte nào, nên người xem vẫn được xem trọn đoạn intro từ khung đầu.

Ba bài canh trong `tests/unit/trinh-dien.test.ts`, đã thử ngược cả ba: dựng lại transform ·
bỏ lời gọi chạy trước · chạy trước mà không câm.

### AV1 — cùng dung lượng, chất lượng hơn hẳn

Chủ đầu tư 23/08/2026: *"video intro hơi mờ, có phải bạn giảm chất lượng ko"*. **Có** — và
đo được: bản H.264 2,9 Mbps chỉ đạt **VMAF 89,5**, đúng mức mắt bắt đầu thấy mờ.

Bài học: **SSIM 0,972 mà tôi tin trước đó đo CẤU TRÚC, không đo độ nét.** VMAF sát cảm nhận
mắt hơn nhiều, và nó nói ngay ra vấn đề. Từ nay đo video bằng VMAF.

Rồi: *"có cách nào giảm dung lượng nhưng chất lượng giữ nguyên"*. Có — **đổi codec**. Cùng
nguồn 4K, cùng 1080p24, đo VMAF so nguồn xuống thang:

| Bản | Dung lượng | VMAF |
|---|---|---|
| H.264 (đang chạy, mờ) | 3,44 MB | 89,5 |
| AV1 | 2,51 MB | 94,9 |
| **AV1 — đã chọn** | **3,58 MB** | **97,7** |
| AV1 | 5,16 MB | 99,1 |
| H.264 chất lượng tương đương | 10,32 MB | 99,5 |

**H.264 cần gấp ba dung lượng để bằng AV1.** Chọn AV1 ở 3,58 MB: gần đúng cỡ cũ, chất lượng
nhảy 8 điểm VMAF. Video nền cũng đổi: 92,6 → **97,5** với thêm 0,2 MB.

### Đường lui H.264 — và hai cách làm mất nó, cả hai đều im lặng

Mỗi video có hai `<source>`: AV1 trước, H.264 sau. Chrome/Edge/Firefox đọc AV1; máy nào
không đọc được thì rơi xuống H.264.

**Cách mất thứ nhất:** thẻ `<video>` mang `src=` trực tiếp. Thuộc tính đó **át hết** mọi
`<source>` bên trong — bản AV1 không bao giờ được dùng, hoặc tệ hơn, nếu `src` trỏ bản AV1
thì máy không đọc được AV1 chết hẳn thay vì rơi xuống.

**Cách mất thứ hai:** hai `<source>` cùng ghi `type="video/mp4"` trơn. Trình duyệt không có
cách nào biết cái đầu là AV1 — nó nhận cái đầu rồi chết ở đó. Chuỗi codec RFC 6381 phải
khai **chính xác**: `av01.0.08M.08` (Main profile, level 8, tier Main, 8 bit — lấy bằng
`ffprobe`, không đoán).

Ba bài canh trong `tests/unit/trinh-dien.test.ts`, đã thử ngược cả hai cách mất trên.

### Lệnh AV1

```
# Video intro
ffmpeg -i <4k>.mp4 -vf "scale=1920:1080:flags=lanczos" -r 24   -c:v libsvtav1 -preset 4 -crf 38 -g 48 -pix_fmt yuv420p   -c:a libopus -b:a 96k -movflags +faststart intro-av1.mp4

# Video nền (bỏ tiếng, 720p vì nằm sau lớp phủ tối)
ffmpeg -i <4k>.mp4 -vf "scale=1280:720:flags=lanczos" -r 24   -c:v libsvtav1 -preset 4 -crf 38 -g 48 -pix_fmt yuv420p -an   -movflags +faststart su-tu-av1.mp4

# Đo chất lượng — DÙNG VMAF, đừng dùng SSIM
ffmpeg -i <ban-nen>.mp4 -i <4k>.mp4   -lavfi "[1:v]scale=1920:1080:flags=lanczos,setpts=PTS-STARTPTS[r];          [0:v]setpts=PTS-STARTPTS[d];[d][r]libvmaf" -f null -
```

### fps giữ nguyên 24 — cố ý

Chủ đầu tư đề nghị giảm fps. Đo ra **cả ba video vốn đã là 24 fps**, nên đó không phải chỗ
đang tốn. Hạ xuống 18 hay 15 chỉ làm chuyển động giật.

### Lệnh đã dùng, để lần sau làm lại được

```
# Nền đăng nhập: 4K -> 720p, BỎ TIẾNG (vốn muted), trần bitrate 1,6 Mbps
ffmpeg -i <4k>.mp4 -vf "scale=1280:720:flags=lanczos" -r 24   -c:v libx264 -profile:v high -preset veryslow -crf 28 -maxrate 1600k -bufsize 3200k   -pix_fmt yuv420p -g 48 -an -movflags +faststart su-tu-chay.mp4

# Ảnh nền tĩnh — thứ chữa "video chưa chạy"
ffmpeg -i <4k>.mp4 -frames:v 1 -vf "scale=1280:720:flags=lanczos" -q:v 72 su-tu-poster.webp

# Intro: giữ 1080 và tiếng
ffmpeg -i <goc>.mp4 -c:v libx264 -profile:v high -preset veryslow -crf 28   -maxrate 2600k -bufsize 5200k -pix_fmt yuv420p -g 48   -c:a aac -b:a 96k -movflags +faststart intro-software.mp4
```

`-movflags +faststart` **bắt buộc**. Bản xuất từ dự án thiết kế luôn để `moov` (bảng mục
lục) ở CUỐI file — đo được 100,0% và 99,9%. Trình duyệt không phát được khung hình nào cho
tới khi đọc được nó, tức phải tải trọn file trước khi có hình.

ffmpeg không có trong PATH nhưng **đã cài sẵn**:
`%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*fmpeg-*infmpeg.exe`

Chỉ cần dời `moov` mà **không** mã hoá lại: `node tools/mp4-faststart.mjs <file>`.

### 5 MB video nằm trong kho

Kho `.git` đã ngậm các bản cũ ở lịch sử — gỡ không thu nhỏ lại được, nhưng đã chặn lớn
thêm. Nếu video còn xuất lại nhiều lần thì chuyển sang `git-lfs`.

## Hai điều đã biết, cố ý chưa sửa

**1. Phụ thuộc mạng ngoài — `unpkg.com` (three.js) và `fonts.googleapis.com`.** Hiệu ứng
3D ở màn trang chủ nạp three.js từ unpkg lúc chạy. Mạng trường có lọc nội dung; unpkg bị
chặn thì canvas 3D **trắng trơn, không báo lỗi gì**. Phông icon thì đã tự host rồi
(`material-symbols-rounded-subset.woff2`), riêng Be Vietnam Pro vẫn từ Google Fonts.

Đây đúng là thứ mà quy tắc thiết kế của kho cấm ("tự host phông chữ, icon và thư viện").
Chưa sửa vì tự host three.js là thêm ~1,2 MB và sửa vào file thiết kế của chủ đầu tư.
**Trước khi trình bày trên wifi trường: mở thử một lần ngay tại chỗ đó.**

**2. `#hv-clock` — JS gọi một phần tử không tồn tại.** Có sẵn trong bản thiết kế gốc.
Vô hại: lời gọi được bọc `if(ck)`, nên chỉ là một `setInterval` chạy không mỗi giây. Giữ
nguyên: bản trong kho khớp bản thiết kế, trừ ba chỗ đã sửa có chủ ý (đường dẫn tài nguyên, tên video, và bộ lọc làm nét đã bỏ).

## Nội dung KHÁC với app đang chạy

Trang này chụp lại app ở thời điểm khoảng một tuần trước, nên có bốn chỗ nay đã khác.
Không phải lỗi — nhưng ai mang đi trình bày cần biết mình đang cho xem cái gì:

| Trong trang trình diễn | App thật hôm nay |
|---|---|
| Nhãn *"Chỉ thầy cô chủ nhiệm và thầy cô tâm lý thấy"* dưới bốn ô cảm xúc | Đã **gỡ khỏi cả ba màn** 22/08/2026. Phạm vi quyền không đổi — `core.can_read_mood()` vẫn là chính em ∨ tâm lý cụm ∨ GVCN của chính em. Xem nợ #70 |
| Ô *"Học tập · GĐ2"* và *"Y tế · GĐ2"* trong lưới Mini App | Đã **gỡ hẳn** 22/08/2026 — không dựng ô mờ quảng cáo việc chưa làm |
| Lưới Mini App có ô *"Check-in cảm xúc"* và *"Báo cáo"* | Cả hai **không còn ở lưới**: check-in nay là popup, Báo cáo là trang trong menu. Lưới của học sinh hiện **rỗng** |
| Bấm ô cảm xúc → nút *"Check-in ngay"* → hộp thoại → màn *"Tuyệt vời! 🎉"* | **Chạm một ô là xong**, popup đóng luôn, không màn xác nhận (21/08/2026) |

Muốn trang trình diễn khớp app thật thì sửa ở **dự án Claude Design trước**, rồi đồng bộ
lại về đây — đừng sửa thẳng file này, vì lần đồng bộ sau sẽ ghi đè.

---

# Công tắc trình diễn — bật/tắt thế nào

Từ 23/08/2026 trang này chạy được **ngay trên `hub.truongvietanh.com`**, không cần mở file.

## Bật

Trong `apps/hub/.env.local`:

```
HUB_TRINH_DIEN=1
```

rồi **khởi động lại máy chủ**. Đo được 23/08/2026: đổi `.env.local` mà không khởi động
lại thì cờ **không có tác dụng** — Next chỉ đọc biến môi trường lúc khởi động. Đây là
hành vi của Next, không phải lỗi của công tắc, nhưng nó làm người ta tưởng công tắc hỏng.

## Tắt

Đổi thành `HUB_TRINH_DIEN=0` (hoặc xoá dòng đó) rồi khởi động lại. **App trở lại y
nguyên** — không dòng nào của app bị sửa, bị xoá hay bị bọc điều kiện, nên không có gì
để hoàn tác.

## Bật thì che gì

| Đường | Khi cờ BẬT |
|---|---|
| `/` · `/login` · `/home` | **trang trình diễn** |
| `/tuan-nay` · `/diem-danh` · `/bao-cao` · `/thi-dua` · `/ho-so` · `/quan-tri/*` | app thật, y như cũ |
| `/` · `/login` · `/home` **kèm `?that=1`** | app thật — cửa sau |

Cố ý chỉ che **ba cửa vào**: giữa buổi trình bày ai hỏi *"cho xem thử màn điểm danh"* thì
mở được ngay, không phải đi tắt cờ rồi khởi động lại máy chủ trước mặt mọi người.

**Nhớ một địa chỉ duy nhất:** `hub.truongvietanh.com/home?that=1` là app thật.

## Thanh địa chỉ vẫn sạch

Dùng `rewrite`, không `redirect` — người xem thấy `hub.truongvietanh.com/`, không thấy
`/trinh-dien/index.html` lộ ra giữa buổi trình bày.

## Dọn hẳn sau khi trình diễn xong

Xoá dòng `HUB_TRINH_DIEN` là đủ để app bình thường trở lại. Muốn dọn sạch dấu vết thì gỡ
thêm ba thứ, cả ba đều tách rời khỏi app:

- `apps/hub/public/trinh-dien/` (trang + 27 MB video)
- `apps/hub/lib/trinh-dien.ts` và `tests/unit/trinh-dien.test.ts`
- khối `dangTrinhDien()` ở đầu `apps/hub/middleware.ts`
