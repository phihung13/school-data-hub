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

## Video — vì sao lag, và đã sửa thế nào

Chủ đầu tư báo lag 23/08/2026. Đo ra **hai nguyên nhân**, và cái lớn hơn không phải video.

### 1. Bộ lọc làm nét chạy trên từng khung hình (nguyên nhân chính)

`.cin-bg` mang `filter: url(#vsharp)` — một **phép nhân chập 3×3** trên một video toàn
màn, **24 lần mỗi giây**. Đây là thứ đắt nhất có thể đặt lên video trong trình duyệt.

**Đã bỏ.** Độ nét không mất: nó chuyển sang chỗ rẻ hơn nhiều — nguồn 4K xuống thang
1920×1080 bằng lanczos, tức **làm nét một lần lúc mã hoá** thay vì 24 lần mỗi giây lúc
chạy. `brightness`/`saturate` giữ lại: một lượt tô GPU, gần như miễn phí, và là màu người
thiết kế chọn.

### 2. Bitrate quá cao, và một bẫy ngược đời về 4K

Chủ đầu tư đưa bản 4K để "nét hơn". Nhưng **thả thẳng 4K vào là lag NẶNG hơn**: 3840×2160
là **4× số điểm ảnh mỗi khung** so với 1080, trong khi màn hình chỉ hiển thị tối đa ~1920
chiều ngang. Nên bản 4K dùng làm **nguồn**, không dùng làm thứ đem chiếu.

| | cũ | nay | |
|---|---|---|---|
| Nền đăng nhập | 10,07 MB · 10,6 Mbps | **4,01 MB · 4,2 Mbps** | từ nguồn 4K, SSIM 0,983 |
| Video intro | 17,10 MB · 14,3 Mbps | **7,52 MB · 6,3 Mbps** | SSIM 0,975 |
| **Cộng** | **27,2 MB** | **11,5 MB** | giảm 58% |

SSIM đo bằng ffmpeg so với bản gốc; trên 0,97 là mắt thường không phân biệt được.

### fps giữ nguyên 24 — cố ý

Chủ đầu tư đề nghị giảm fps. Đo ra **cả ba video vốn đã là 24 fps**, nên đó không phải
chỗ đang tốn. Hạ thấp hơn nữa (18, 15) chỉ làm chuyển động giật, mà không lấy lại được
bao nhiêu — cái tốn nằm ở bộ lọc và ở bitrate, cả hai đã sửa.

### Lệnh đã dùng, để lần sau làm lại được

```
# Nền đăng nhập: 4K -> 1080 sắc nét, BỎ TIẾNG (video này vốn muted)
ffmpeg -i <4k>.mp4 -vf "scale=1920:1080:flags=lanczos" -r 24 \
  -c:v libx264 -profile:v high -preset slow -crf 26 -maxrate 4M -bufsize 8M \
  -pix_fmt yuv420p -g 48 -an -movflags +faststart su-tu-chay.mp4

# Video intro: giữ 1080 và tiếng, hạ bitrate
ffmpeg -i <goc>.mp4 -c:v libx264 -profile:v high -preset slow -crf 25 \
  -maxrate 6M -bufsize 12M -pix_fmt yuv420p -g 48 \
  -c:a aac -b:a 128k -movflags +faststart intro-software.mp4
```

`-movflags +faststart` là **bắt buộc**. Bản xuất từ dự án thiết kế luôn để `moov` (bảng
mục lục) ở CUỐI file — đo được: 100,0% và 99,9%. Trình duyệt không phát được khung hình
nào cho tới khi đọc được nó, tức phải tải trọn file trước khi có hình. Trên localhost
không ai thấy; trên wifi trường thì đó là màn đen. Nay `moov` ở **byte 36**.

ffmpeg không có trong PATH nhưng **đã cài sẵn** trên máy này:
`%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*\bin\ffmpeg.exe`.

Nếu chỉ cần dời `moov` mà **không** mã hoá lại, dùng `node tools/mp4-faststart.mjs <file>`
— công cụ tự viết cho ca không có ffmpeg, có tự kiểm mọi ô offset trước khi ghi.

### 11,5 MB video nằm trong kho

Chấp nhận có chủ ý: trang trình diễn thiếu video là một buổi trình bày hỏng. Kho `.git`
đã ngậm cả bản 27 MB cũ ở lịch sử — gỡ không thu nhỏ lại được, nhưng đã chặn nó lớn thêm.
Nếu về sau video được xuất lại nhiều lần thì chuyển sang `git-lfs`.

Trang **vẫn chạy khi thiếu video**: `startShow()` kiểm `introVideo.error` rồi nhảy thẳng
vào trang chủ.

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
