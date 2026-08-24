# Viet Anh School Hub — Quy tắc & Tiêu chuẩn thiết kế
*Áp dụng cho mọi màn hình hiện có và phát sinh sau này (mobile + desktop). Nguồn sự thật: `Hub Mobile.dc.html`, `Hub Desktop.dc.html`.*

---

## 0. GIAO DIỆN TỐI "MAJOR OS" — đổi 24/08/2026

Chủ đầu tư: *"trang home phải là thay trang home cũ đi chứ, có tương tác thật luôn mà, thay
cho tất cả các vai, không phải đồ giả nữa đâu"*.

**Mọi vai dùng chung PHONG CÁCH mới, giữ nguyên NỘI DUNG theo vai.** Hiệu trưởng vẫn thấy
việc của hiệu trưởng — chỉ khác nước sơn. Không vai nào bị đổi sang trang của vai khác.

### Cách thi hành: đổi ĐỊNH NGHĨA token, không đổi chỗ dùng

App vốn dùng token ngữ nghĩa (`text-ink`, `bg-surface-alt`, `border-line`…) ở phần lớn chỗ,
nên đổi một chỗ trong `tailwind.config.ts` là **mọi màn đổi theo** — kể cả màn chưa ai mở
ra xem. Đợt này đổi **27 token**, quét **265 lớp CSS** và **372 mã hex** viết thẳng, trên
**47 file**.

### Hai token mới, và vì sao KHÔNG ghi đè `white`

`card` (#0E1E3C) và `cardline` (#1E3A6B). Cám dỗ là ghi đè thẳng token `white` cho gọn —
nhưng `bg-white` (133 chỗ) là **nền**, còn `text-white` (70 chỗ) là **chữ trắng trên nền
màu** (nút navy, ô cảm xúc). Ghi đè `white` thì cả hai cùng tối và **chữ biến mất**. Hai
vai trò khác nhau phải là hai token khác nhau.

### `color-scheme: dark` không phải trang trí

Nó bảo trình duyệt vẽ thanh cuộn, ô nhập, ô chọn theo hệ tối. Thiếu dòng đó thì mọi
`<input>`/`<select>` vẫn nền trắng chữ đen nằm giữa các thẻ tối — **chỗ hở dễ bỏ sót nhất**
khi đổi tông, vì nó chỉ lộ ra ở đúng những màn có biểu mẫu.

### Tương phản: đã tính lại toàn bộ, KHÔNG hạ ngưỡng

Luật §11 không đổi một chữ — vẫn ≥4,5:1 trên mặt nền tệ nhất. Chỉ danh sách mặt nền đổi
theo thực tế: `#0E1E3C` · `#050F26` · `#12244A` · `#16294B` · `#081730`, tệ nhất là
`#16294B`. Cả **12 token chữ đều đạt**, thấp nhất `caption2` ở **4,91:1**.

Bộ test tương phản **bắt được ba lỗi thật** trong lượt đổi này, cả ba đều là "chữ và nền
đi ngược chiều nhau":

| Chỗ | Hỏng thế nào | Sửa |
|---|---|---|
| Chữ gợi ý ô nhập | `#5B6B80` trên nền thẻ tối — 3,04:1. Nằm trong `.css` nên lọt lưới quét `.tsx` | `#8298B8` — 5,62:1 |
| Ô lịch điểm danh `late` | Chữ `#6B4A00` giữ nguyên nhưng **nền của nó tối đi** — 1,65:1 | `#FFD98A` — 9,87:1 |
| Nút điểm danh đang chọn | `#00A05F` bị brighten vì tưởng là chữ, nhưng ở đây nó là **nền**, chữ trắng nằm trên — 1,64:1 | nền sáng + chữ tối, 6,8–8,9:1 |

Bài học: **một mã hex có thể vừa là chữ vừa là nền tuỳ chỗ.** Quét máy móc theo mã màu sẽ
brighten cả hai, và ca "nó là nền" sẽ hỏng lặng lẽ. Chỉ bộ test tương phản bắt được.

### Cái chuông đã reo xong

`tests/unit/a11y-man-nguoi-lon.test.ts` từng ghim: *"`muted` KHÔNG đạt trên nền
`/dieu-khoan`"* — một chỗ hụt đã biết, cố ý khoá lại. Sang bảng tối cả hai token đều đạt,
nên bài đã lật thành *"cả hai đều đạt"*. Giữ nguyên câu cũ là để CI bảo vệ một lời nói dối.

### Luồng đăng nhập → intro → trang chủ

Luồng của bản trình diễn nay là luồng THẬT (24/08/2026).

**Trang đăng nhập** bỏ nền parallax sáu lớp ảnh, thay bằng chính video sư tử đã tối ưu cho
bản trình diễn (AV1 1,55 MB, `moov` ở đầu, poster 50 KB). Ba cái được cùng lúc: khớp tông
với phần còn lại của app; **nhẹ hơn thứ nó thay** — sáu lớp ảnh cộng một vòng lặp rAF 60fps
chạy suốt thời gian người ta còn ở trang, đổi lấy một video 8 giây có phần cứng giải mã; và
không thêm một byte nào vào kho.

Giữ nguyên tên sản phẩm **"Viet Anh School Hub"**. Bản thiết kế ghi "Major Operating System"
nhưng đổi tên sản phẩm là quyết định của chủ đầu tư, không phải hệ quả của một lượt đổi màu.

**Đoạn intro** chạy một lần sau đăng nhập, gác bằng cờ `sessionStorage`. Bốn quyết định,
mỗi cái vì một ca hỏng cụ thể:

| Quyết định | Vì sao |
|---|---|
| Cờ ở `sessionStorage`, không phải `?intro=1` | `goAfterLogin()` cố ý dùng hard navigation để Server Component đọc được cookie mới — lý lẽ đó không được đụng. Tham số URL thì nằm lại trên thanh địa chỉ cho người ta bookmark, và F5 phát lại phim mỗi lần |
| **Xoá cờ TRƯỚC khi phát** | Xoá lúc phim kết thúc thì một lần F5 giữa chừng để lại cờ còn nguyên → phát lại mỗi lần tải trang, không dứt |
| Chỉ đặt cờ khi đích là `/home` | `?then=` hợp lệ có thể là `/oidc/interaction/<uid>` — người dùng đang giữa luồng đăng nhập của app khác; chen phim toàn màn vào đó là chặn đúng việc họ đang làm |
| **Chạy CÂM** | Bản trình diễn mở tiếng được vì mọi thứ cùng một trang, cú bấm đăng nhập còn hiệu lực làm cử chỉ người dùng. Ở đây có một lần nạp trang xen vào nên trang mới không còn cử chỉ nào — `play()` có tiếng sẽ bị chặn. Và đây là app dùng trong lớp: nhạc tự bật khi cô giáo đăng nhập giữa giờ là thứ không ai muốn |

Kèm ba đường ra bắt buộc: nút bỏ qua có mặt từ khung hình đầu, `onEnded`, và `onError` —
thiếu cái cuối thì video hỏng để lại **một màn đen phủ cả app**. Tôn trọng
`prefers-reduced-motion`: người đặt tuỳ chọn đó không phải xem phim toàn màn tự chạy.

### Người canh

`tests/unit/giao-dien-toi.test.ts` — cấm `bg-white` và bảy mã hex nền sáng cũ quay lại bất
kỳ file `.tsx` nào, cấm ghi đè token `white`, đòi `color-scheme: dark`. Đã thử ngược cả ba.

---

## 1. Nguyên tắc cốt lõi

1. **Một cửa vào chung**: mọi vai trò (học sinh, giáo viên, BGH, kế toán…) đăng nhập xong đều vào **cùng một trang chủ super app**. Không thiết kế "trang chủ riêng cho từng vai trò" — chỉ **lưới mini app đổi theo quyền** (SSO trả danh sách app).
2. **Phân quyền ở mini app, không ở trang chủ**: mở app riêng (Buồng lái, Tâm lý cụm, Điều hành…) mới kiểm tra quyền.
3. **Web app, không phải native**: chạy trên Safari/Chrome. Mockup luôn vẽ kèm chrome trình duyệt (thanh URL `hub.truongvietanh.com/...`, khóa 🔒). Mobile dùng `theme-color` navy.
4. **Cả hai nền tảng cho mọi người**: học sinh cũng dùng desktop, người lớn cũng dùng mobile. Mọi màn mới phải hình dung được ở cả 2 khung.
5. **Ít chữ — hình thể thay lời nói**: không câu giải thích thừa, không "tip" dông dài. Caption tối đa 1 dòng. Nếu 1 icon + 5 từ diễn đạt được thì không viết 2 câu.
6. **Trắng là nền chủ đạo**; màu chỉ dồn vào icon, nút, trạng thái, header.

## 2. Khung & tỉ lệ

| Khung | Kích thước | Ghi chú |
|---|---|---|
| Mobile | **390 × 844** (iPhone 14) | + status bar, thanh URL Safari trên, toolbar Safari dưới, home indicator. Vùng thiết kế thực ~390×700 |
| Desktop | **1440 × 900** (laptop 16:10) | + tab bar macOS (3 chấm đỏ/vàng/lá) + hàng URL |
| Bo góc khung | mobile 44px · desktop 14px | shadow `0 18px 46px rgba(10,42,94,.22–.26)` |

## 3. Màu

### Brand (theo logo)
- **Navy chính**: `#0A2A5E` → gradient `linear-gradient(155deg,#0A2A5E 0%,#1E5FB8 100%)` (hero, nút chính, tab active)
- **Vàng**: `#FFC629` (sáng) / `#F5A300` (đậm) / text-on-yellow `#6B4A00`, `#8A5A00` — CTA phụ, badge, highlight, avatar
- Glow trang trí trên navy: `radial-gradient(circle at 36% 36%, rgba(255,198,41,.5), transparent 72%)`

### Nền & chữ
- Nền trang: `#F7F9FC` (mobile) / `#F5F7FA` (desktop) · thẻ: `#fff`
- Chữ chính `#0F172A` · tiêu đề thẻ `#0A2A5E` · phụ `#66707D`/`#6B7789` · caption `#8A94A6`–`#9AA5B5` (chỉ ≤11px)
- Viền: `#E4E9F0` · nền chip xám: `#F1F4F8`

### 4 màu mood (thống nhất bản giấy — KHÔNG đổi)
| Mood | Gradient | Chữ/icon |
|---|---|---|
| Vui | `#00D97A → #00A85E` | trắng |
| Bình thường | `#4E9BFF → #2C7BF2` | trắng |
| Mệt | `#FFC833 → #F5A300` | `#6B4A00` |
| Buồn | `#FF7A7F → #F0474D` | trắng |

### Màu chủ từng mini app (icon tile + header shell riêng)
Điểm danh `#2C7BF2→#0A4FBF` · Hoạt động `#FFB01F→#F58F00` · Học tập `#00D97A→#00A05F` · Y tế `#FF6B70→#E23A41` · Báo cáo `#9D6BFF→#7434E8` · Dấu chân `#00D3E8→#00A6BE` · Buồng lái `#2A5DA8→#0A2A5E` · Tâm lý `#6A34E0→#8B5CF6` (tím = riêng tư) · Zalo `#0068FF`
- Tile icon: 50–54px, bo 16–17px, icon trắng 24–26px, shadow cùng màu `0 5px 12px rgba(màu,.3)`
- App chưa build: nền `#E9ECF2`, icon `#8A94A6`, `opacity:.45`, nhãn "· sắp"

## 4. Chữ & icon

- **Font duy nhất**: `Be Vietnam Pro` (400–900). Tiêu đề màn 17–24px/900 · tiêu đề thẻ 13–15px/900 · nội dung 12–13px · caption 10–11.5px. Không dưới 9.5px.
- **Icon**: Material Symbols Rounded, `FILL 1` (class `.msr`). **Cấm emoji làm icon UI** (🔥→`local_fire_department`, 🏅→`military_tech`…). Emoji chỉ được xuất hiện trong copy lời chào họch sinh (👋) — tiết chế.
- Logo trường: `uploads/channels4_profile.jpg` — luôn đặt trong **tile trắng bo góc** khi trên nền màu.

## 5. Mascot (sư tử Việt Anh)

- File đã tách nền + làm mượt viền: `uploads/mascot-sheet.png` (1448×1086, lưới **4 cột × 2 hàng**, ô tỉ lệ **2:3**).
- Crop bằng CSS: `background-size:400% 200%` + `background-position: X% Y%` với X ∈ {0, 33.333, 66.667, 100}, Y ∈ {0, 100}.
- Pose map: (0,0) vẫy tay · (33,0) thumbs-up · (67,0) chỉ tay · (100,0) đọc sách · (0,100) ăn mừng · (33,100) chạy · (67,100) suy nghĩ · (100,100) laptop.
- **Kích thước phải giữ tỉ lệ 2:3** (vd 42×63, 52×78) — sai tỉ lệ sẽ lộ pose bên cạnh.
- Liều lượng: tối đa **1 mascot/màn** (trừ login). Dùng ở: chào mừng, trạng thái rỗng/ổn, ăn mừng thành công, banner báo cáo. Không dùng trong bảng số liệu BGH.

## 6. Mẫu bố cục (patterns)

- **Hero cong**: header navy gradient + glow vàng; đáy là **vòm trắng** `height:32–44px; border-radius:100% 100% 0 0; margin-top:-32px`; thẻ đầu tiên **nổi đè lên vòm** (`margin-top` âm, `z-index:2`, KHÔNG đặt trong container `overflow:hidden`).
- **LƯỚI LÀ CHỖ CỦA MINI APP, KHÔNG PHẢI CHỖ CỦA MỌI MÀN** (chốt 22/08/2026, chủ đầu tư: *"báo cáo và thi đua không phải là mini app. nó là trang trong menu thôi"*). Vào lưới trang chủ khi và chỉ khi thứ đó là **mini app thật**: có vòng đời riêng, có đội chủ quản, đăng ký ở `core.embedded_apps`, và **tắt được bằng một nút** ở `/quan-tri/mini-app`. Trang của chính Hub (Bảng thi đua, Báo cáo Trưởng thành, Lịch điểm danh…) là route Next — chúng ở **menu trái** và **thanh tab**, không ở lưới. Xếp sai chỗ là dạy người dùng một phân loại sai, và ngày đầu tiên ai đó đi tìm nút tắt "app Thi đua" là ngày phân loại sai ấy tốn thời gian thật.

  Hệ quả đã đo và chấp nhận: **lưới của học sinh nay RỖNG** — em chưa được cấp mini app nào. Trạng thái rỗng đã có sẵn và nói đúng sự thật ("Tài khoản này chưa có mini app nào" + đường sang Hồ sơ), nên đây không phải màn cụt. Phụ huynh cũng không còn ô lưới bật được, nhưng vào Báo cáo bằng **thanh tab** (điện thoại) và **menu trái** (máy tính) — `tests/unit/nav-links.test.ts` canh cả hai cửa đó, vì nếu cả ba cùng đóng thì phụ huynh mở app lên và không tới được thứ duy nhất họ vào để xem.

- **KHÔNG DỰNG Ô MỜ QUẢNG CÁO VIỆC CHƯA LÀM.** Hai ô "Học tập · GĐ2" và "Y tế · GĐ2" (`href: "#"`) đã gỡ 22/08/2026 khỏi cả lưới lẫn menu. Chúng hứa một thứ không ai đặt ngày, và chiếm đúng phần màn đắt nhất của một đứa trẻ mở app buổi sáng. Ngày dựng thật thì thêm lại bằng mục **có `href` thật**. Ô mờ chỉ còn đúng một chỗ được phép: việc mà **quyền đã có ở tầng dữ liệu nhưng màn hình chưa dựng** (`attendance-con` của phụ huynh) — ở đó "mờ" nói thật "chưa có", còn xoá hẳn khiến phụ huynh tưởng hệ thống không theo dõi việc đó.

- **Lưới mini app**: 4 cột (mobile & desktop card), nhãn 10–11px/700 dưới tile. Badge số góc trên phải tile (`#F0474D` đỏ khẩn, `#FFC629` vàng chờ xử lý, viền 2px nền trang).
- **Bố cục hai khổ: dùng gợi ý của trình duyệt cho lượt vẽ ĐẦU** (21/08/2026). Máy chủ không biết bề rộng màn nên `lib/viewport.ts` chọn dựng bản điện thoại — đúng thứ tự ưu tiên, nhưng cái giá là máy tính thấy bản điện thoại rồi mới đổi (chủ đầu tư đo: *"hiện 1s"*). Khi trình duyệt TỰ KHAI (`Sec-CH-UA-Mobile`, Chromium gửi mặc định) thì không còn gì để đoán: `lib/kho-man.ts` đọc header, trang truyền xuống, và lượt vẽ đầu ra đúng bố cục. Safari/Firefox không khai → rơi về đúng hành vi cũ, không xấu đi. Gợi ý chỉ nói "máy có phải điện thoại không", KHÔNG nói bề rộng cửa sổ — nên sau hydrate `useIsDesktop()` giành lại quyền quyết định.
- **Tab bar mobile (chỉ ở Hub, vai trò học sinh)**: nút **Check-in tròn vàng nổi giữa** (56px, `pulseDot`) — từ 21/08/2026 nó là `<button>` **mở popup ngay tại chỗ**, KHÔNG phải `<Link>` dẫn sang một trang (ADR-036 bản popup; `/checkin` đã gỡ). Vì thế nó **không** khai `aria-current` — nó không dẫn tới trang nào để mà "đang ở đó" — mà khai `aria-haspopup="dialog"`. GV/PH: 4 mục, không nút giữa. **Mini app KHÔNG có tab bar Hub.**
- **MỘT THANH CUỘN, KHÔNG HAI.** Khung chuẩn của mọi màn Hub: ngoài cùng `flex min-h-screen … md:h-screen md:min-h-0 md:overflow-hidden`, `MainContent` `md:overflow-hidden`, hộp nội dung `flex-1 … md:overflow-y-auto`. Chữ `md:` trên hộp nội dung là **bắt buộc**: ở khổ điện thoại trang tự cuộn theo thân trang, nên một hộp `overflow-y-auto` không tiền tố sẽ lồng thêm một vùng cuộn thứ hai bên trong một trang cũng cuộn được — hai thanh kéo cạnh nhau, và trang trông như chưa full màn. Chín màn theo đúng khuôn này; `thi-dua-view.tsx` từng là ngoại lệ và bị chủ đầu tư bắt 22/08/2026 (*"nó còn màn con nên thành ra có 2 thanh kéo lên xuống cạnh nhau trông rất xấu"*).

- **Shell mini app** (mobile + desktop): màn chuyển tiếp (icon nảy + 3 chấm) → app có header riêng theo màu chủ + **capsule ⋯│✕** (kiểu Zalo Mini App) luôn nổi để thoát về Hub; điều hướng riêng của app (tab pill nổi, nav ngang…).
- **Desktop 2 cột**: nội dung chính `flex:1.6–1.7` + rail phải `flex:1` (thống kê, hoạt động gần đây).
- **Đăng nhập**: 2 tab "Học sinh & Thầy cô" (2/3) ↔ "Phụ huynh" (1/3, giãn khi chọn). Nội bộ = nút **Google SSO** (logo G chuẩn SVG 4 màu) + chip `@vietanh.edu.vn`. PH = nút Zalo `#0068FF` mở link mời + 6 ô mã mời. **Không form mật khẩu, không câu giải thích.**

## 7. Thành phần chuẩn

- **Nút chính**: navy gradient, bo 13–16px, chữ trắng 900, shadow `0 7–9px 16–22px rgba(10,42,94,.28)`. Hover nâng 2px, active scale .97.
- **Nút phụ**: viền `#FFC629` 1.6px, nền `#FFFBEE`, chữ `#8A5A00`.
- **Badge pill**: 9–10.5px/900, uppercase, nền nhạt + chữ đậm cùng tông (vd `#FFF1C9`/`#8A5A00`).
- **Thẻ**: trắng, bo 16–22px, shadow thường `0 3px 12–14px rgba(10,42,94,.06–.07)`; thẻ nổi hero `0 14px 32px rgba(10,42,94,.14)`.
- **Progress**: track `#EEF1F6` 6–7px, fill gradient màu domain, số % bên phải 900.
- **Thẻ cờ (buồng lái)**: border-left 5px màu mức độ (đỏ `#F0474D` leo thang · vàng `#FFC629` ưu tiên · xanh `#2C7BF2` việc thường) + badge + 1–2 nút hành động.

## 8. Ngôn ngữ & giọng

- **Hai chế độ ngôn ngữ** (bất di bất dịch): HS/PH chỉ thấy giọng **Glow & Grow** ("tỏa sáng", "đang lớn lên"); từ vựng vận hành **cờ / ngưỡng / leo thang / định mức** CHỈ xuất hiện trong Buồng lái, Tâm lý, Điều hành.
- Học sinh xưng "con/mình", thân thiện; người lớn gọn, nghiệp vụ.
- Trạng thái nghiệp vụ chuẩn: **gửi muộn ≠ vắng** (vàng, "chờ xác nhận") · **"lớp ổn" ≠ thiếu dữ liệu** (kèm giờ quét, khung dashed xanh + mascot) · offline: **hành vi** giữ nguyên (cất vào hàng đợi, tự gửi lại, không hộp thoại) nhưng **câu "Offline vẫn lưu — tự gửi sau." + icon `cloud_off` đã gỡ khỏi popup check-in và trang chủ 22/08/2026** theo lệnh chủ đầu tư. Nó vẫn được nói ở chỗ nó là TIN MỚI — màn check-in khi lượt bấm thật sự vào hàng đợi. Nói trước khi chưa có chuyện gì là chiếm một dòng để trấn an về một việc chưa xảy ra.
- Nhắc quan trọng đi qua **Zalo OA**, app không đòi push.

## 9. Riêng tư & phân quyền

- Mood/check-in cảm xúc: **chính em, thầy cô tâm lý, và giáo viên chủ nhiệm CỦA EM** đọc được (`core.can_read_mood()` = `is_me ∨ in_my_cluster ∨ is_homeroom_of`, migration `0059`, ADR-035 — quyết định chủ đầu tư 21/08/2026, đảo ADR-026). Dòng này đã đổi chiều **ba lần** (31/07 mở GVCN → 01/08 cắt → 21/08 mở lại) — ai định đổi lần thứ tư phải đọc đủ ADR-025/026/035 trước. Phụ huynh, BGH, giáo viên bộ môn, GVCN lớp khác: **vẫn không** đọc được, cả ba lần đều thế.

  **NHÃN CHUẨN — hai câu dưới đây là hợp đồng, tầng màn hình in ĐÚNG chữ này.** Lý do phải chốt ở đây chứ không để mỗi màn tự viết: nhãn nói ít hơn hoặc nhiều hơn sự thật đều là nói dối, và một màn viết lệch là cả lời hứa lệch. Viết cho trẻ 11 tuổi đọc — §8 cấm từ vựng vận hành (cờ / ngưỡng / quét / leo thang) trước mặt học sinh, nên hai câu này không được chứa chữ nào trong số đó.

  1. ~~**Nhãn ngắn, đặt ngay tại chỗ em nhập**~~ — **ĐÃ GỠ 22/08/2026** theo lệnh chủ đầu tư, khỏi cả ba màn từng in nó (popup check-in · trang chủ · /tuan-nay). Hằng số `NHAN_AI_DOC_CAM_XUC` trong `ui/labels.ts` đã xoá; `tests/unit/giong-noi.test.ts` lật thành bài canh CHIỀU NGƯỢC LẠI (không màn nào được chép tay lại câu đó).

     Câu cũ, giữ lại đây để không ai chép tay: *"Chỉ thầy cô tâm lý và thầy cô chủ nhiệm đọc"*.

     **GỠ CÂU KHÔNG GỠ LỜI HỨA.** `core.can_read_mood()` không đổi một dòng — chính em ∨ thầy cô tâm lý cụm ∨ GVCN của chính em, không ai khác (migration 0059, ADR-035). Cái mất là chỗ em ĐỌC ĐƯỢC điều đó ngay trước khi bấm. Luật 91/2025 đòi báo trước tại điểm thu thập, nên phần nghĩa vụ ấy chuyển sang **nợ #69** chứ không biến mất.

     Ngày muốn nói lại: dựng lại HẰNG SỐ ở `ui/labels.ts` trước, đừng chép tay vào một màn lẻ — câu này đã đổi ba lần trong ngày 01/08/2026 theo phạm vi quyền, và ba bản chép tay là ba chỗ sẽ lệch.

  2. **Câu dài, trong thẻ "Ai thấy gì của mình?"** (`profile-view.tsx`) — dòng giáo viên chủ nhiệm gộp lại được từ 21/08/2026, vì sự thật đã gộp lại:

     > **Thầy cô tâm lý** — đọc được nhật ký cảm xúc của con và lời nhắn con gửi.
     >
     > **{tên cô chủ nhiệm}** — xem điểm danh, đọc được nhật ký cảm xúc của con và lời nhắn con gửi.

  Hai điều **vẫn cấm** in ra phía GVCN (điều thứ ba của bản 01/08 — "chiều của cảm xúc" — đã hết hiệu lực vì cô đọc được nhật ký rồi): **số ngày trong chi tiết cờ** (`negativeDays`, `negativeStreak` — cột `care.flags.detail` vẫn khoá với authenticated, migration `0049` không đảo theo ADR-035) và **mọi từ vựng vận hành** trong giao diện của em (§8). Chi tiết cờ vẫn cắt tại contract (`packages/core/contracts/care.ts`, `FlagSummary.detail`), không chỉ ẩn bằng CSS.
- **Check-in cảm xúc KHOÁ APP bằng POPUP** (ADR-036, 21/08/2026 — chủ đầu tư chọn "Chặn thật", rồi bác bản chuyển trang: *"nếu lúc vào bắt checkin thì phải hiện ra popup checkin, xung quanh mờ, ko thoát được, thì nó mới là khóa app, chứ vô trang checkin làm gì"*).

  Học sinh chưa khai tâm trạng hôm nay → **popup mở trên chính trang em đang đứng**, nền mờ, **không nút đóng, Escape không đóng, bấm ra ngoài không đóng**. Xong một lần là thôi hỏi trong ngày. Cổng dựng ở `app/layout.tsx` nên nó phủ **mọi trang** — bản đầu gác đúng `/home` và gõ thẳng `/tuan-nay` là đi vòng được.

  **Trang `/checkin` đã GỠ.** Một trang riêng cho một việc mất bốn giây là một lần đổi trang thừa, và nó nói sai chuyện đang xảy ra: trang mới nghĩa là "em đang ở chỗ khác", trong khi sự thật là "app đang chờ em một việc". Bốn ràng buộc của cổng, không được bỏ bớt cái nào:
  1. **Em chưa có phiếu đồng ý của nhà thì KHÔNG chặn** — `0047` không cho ghi `mood` khi thiếu phiếu, nên chặn là nhốt em ngoài cửa bằng một điều kiện em không tự thoát được. Điều kiện `has_student_consent` nằm trong chính câu SQL của cổng.
  2. **Chỉ học sinh** — giáo viên, phụ huynh, quản trị không bao giờ bị hỏi tới.
  3. **Dòng cô ghi hộ không tính** — nhịp này là của em, không phải của sổ điểm danh.
  4. **Lỗi cơ sở dữ liệu không được biến thành cổng** — hỏng kết nối thì cho qua và ghi log, không phạt sai người.

  Không có nút "bỏ qua" (và chưa từng có). **Đường ra mọc ĐÚNG LÚC việc xong**: nút "Vào Hub" hiện sau khi em ghi, chứ không phải một dấu ✕ nằm sẵn từ đầu — một nút đóng không đóng được thì tệ hơn hẳn không có nút, vì nó mời người ta bấm rồi không phản hồi.

  **Đổi tâm trạng lúc 3 giờ chiều**: nút tròn giữa thanh tab mở lại chính popup đó, và lần này CÓ đường ra. Một popup, hai chế độ — không phải hai màn.

  **TÁM LUẬT CỦA POPUP**, rút ra từ ba lượt rà ngày 21/08/2026 khi chủ đầu tư mở app và nói *"nó bị full màn, rồi checkin 2 lần"*. Cả năm đều là "bớt đi", và cả năm đều có bài canh riêng (`tests/unit/popup-checkin-khong-hoi-hai-lan.test.ts`, thử ngược từng cái một):

  1. **Hỏi ĐÚNG MỘT LẦN.** Hộp thoại đã in "Hôm nay con thấy thế nào?" ở tiêu đề — màn chọn bên trong KHÔNG in lại. Bản đầu in cả hai, lệch cả đại từ (con/em).
  2. **Không vòng quay chờ.** Máy chủ vừa tính "em này chưa khai" để quyết định mở popup; hỏi lại chính nó rồi bày spinner là bắt em nhìn ô trống chờ một câu trả lời đã có.
  3. **Chỉ MỘT chỗ hỏi trên màn.** Thẻ check-in ở trang chủ tự tắt khi cổng đang khoá.
  4. **Ô cảm xúc 112px trong popup** (148px là cỡ cho một TRANG). Bốn ô 148px cộng thành 308px trên tổng ~640px của hộp; ở khổ iPhone 14 viền mờ chỉ còn 16px và mắt không đọc ra "đây là lớp phủ".
  5. **CHỈ MỘT bản popup check-in trong toàn kho.** Trang chủ từng có `CheckinModal` riêng, tự mở bằng `useEffect` — nó ra đời trước cổng ADR-036 và làm gần đúng việc cổng làm. Thêm cổng mà không gỡ nó thì em nhận **hai popup chồng nhau** trên máy tính (chủ đầu tư: *"có 2 loại checkin"*). Bản giữ lại là bản của cổng, vì nó khoá thật, phủ mọi trang, và dùng lại NGUYÊN ruột `CheckinView` — một bản sao của hàng đợi ngoại tuyến là một chỗ sẽ lệch.
  6. **`CheckinView` tải RỜI khỏi gói của layout gốc** (`next/dynamic`). Cổng có mặt trên mọi trang; import thẳng là kéo ~950 dòng kèm hàng đợi IndexedDB vào gói JS của mọi trang, kể cả trang giáo viên. Gói nặng → hydrate lâu → cú nháy bố cục dài ra.
  7. **Nền bị `inert`, ngay trong HTML máy chủ.** Bẫy Tab không che được con trỏ ảo của trình đọc màn hình — không có `inert` thì người dùng NVDA/VoiceOver vẫn đọc được nguyên trang phía sau, gồm cả lời mời check-in thứ hai. Đặt bằng prop trong JSX, KHÔNG bằng `useEffect`: effect chỉ chạy sau hydrate nên HTML lần đầu vẫn hở.

  8. **CHẠM MỘT Ô LÀ XONG — không màn xác nhận, không nút "Vào Hub".** Chủ đầu tư, lượt rà thứ ba: *"chỗ checkin cảm xúc, chỉ cần ấn vào icon là được, ẩn đi, không cần hiện lên xác nhận"*. Máy chủ nhận xong thì popup đóng ngay; lời cảm ơn chuyển sang thẻ trang chủ (query `getTodayStatus` được dọn ngay trong nhánh thành công, nên thẻ tự đổi thành "Đã check-in lúc … — cảm ơn con!"). Cho TAI thì vẫn phải nói: một vùng `role="status" aria-live="polite"` `sr-only` đặt **ngoài** hộp thoại — để trong thì nó bị tháo cùng hộp và trình đọc màn hình không kịp đọc.

     **ĐÚNG HAI NGOẠI LỆ ở lại, và cả hai đều KHÔNG phải màn xác nhận** — chúng là những ca có một sự thật em cần biết mà không chỗ nào khác nói:
     - **Nhà chưa có phiếu đồng ý** (0047): máy chủ nhận lượt điểm danh nhưng KHÔNG nhận mức tâm trạng. Đóng sập là để em tin mình vừa ghi được một thứ không vào kho.
     - **Đang chờ mạng**: lượt bấm nằm trong hàng đợi trên máy em, máy chủ chưa biết, nên `getTodayStatus` không được dọn — thẻ trang chủ vẫn đọc bản cũ và **mời em check-in lần nữa**. Đóng ở đó là dựng lại đúng con lỗi "check-in 2 lần" ở một chỗ mới.

     Và một luật con, học được bằng cách suýt gửi đi bản sai: **tín hiệu MỞ KHOÁ tách rời tín hiệu ĐÓNG**. `CheckinView` báo `onGhiXong` ở **mọi** ca thành công (kèm hai cờ `moodSaved`/`choMang`); việc gọi hàm đó là thứ mở khoá, hai cờ chỉ quyết đóng hay ở lại. Bản viết trước gộp làm một — im lặng ở ca "chưa có phiếu" — và nó **nhốt em vĩnh viễn**: cổng chờ đúng thứ em không thể làm, mà phiếu đồng ý thì là việc của bố mẹ.

  Hàm cổng vẫn ở `apps/hub/server/checkin-gate.ts` (đo được, có bài kiểm riêng); ba trạng thái của popup ở `components/cong-checkin.tsx` (`trangThaiCong`, hàm thuần, 8 ca). Nó là LỚP NHỊP, không phải chốt chặn dữ liệu — người mở devtools xoá lớp phủ thì xoá được, và thứ họ giành được là quyền xem trang chủ của chính mình mà chưa khai tâm trạng.
- Ghi chú tư vấn (Tâm lý cụm): GVCN & PH không xem được — luôn hiện badge `visibility_off`.
- BGH/Điều hành: chỉ dữ liệu **tổng hợp theo lô**, ghi rõ "không tra cứu học sinh cá nhân".
- Cờ chỉ ghi *loại tín hiệu*, không sao chép nội dung tâm sự.
- Care engine chạy ngầm — **không bao giờ** hiện như mini app với học sinh.

## 10. Hiệu ứng (ghi chú dưới mỗi màn để dev code)

- Thời lượng chuẩn 150–300ms; stagger danh sách 40–80ms; đếm số 400–700ms; progress/ring vẽ 700–800ms.
- Keyframes dùng chung: `floaty` (mascot/logo, 3.5–5s) · `popIn` (cubic-bezier(.34,1.56,.64,1)) · `pulseDot` (nút check-in) · `confetti` (màn thành công).
- Mở mini app: Hub scale `.96` + mờ, app trượt từ đáy 320ms; đóng bằng capsule ✕.
- KHÔNG dùng vệt sáng sweep trên nút. Hover đổi màu/bóng, không làm xô layout. Tôn trọng `prefers-reduced-motion`.

## 11. Accessibility

- Touch target ≥ 44px (mọi nút/tile mobile). `cursor:pointer` cho mọi thứ bấm được (desktop).
- Tương phản chữ ≥ 4.5:1 — **không có ngoại lệ theo cỡ chữ**. Đo trên **mặt nền tệ nhất** mà màu đó có thể bị dán vào (`#FFFFFF` · `#F7F9FC` · `#F1F4F8`), không phải chỉ trên nền trắng.
  - *Sửa 01/08/2026*: dòng cũ ghi "chữ xám nhạt `#9AA5B5` chỉ cho caption ≤11px" — câu đó tự mâu thuẫn với chính vế "≥4.5:1" đứng ngay trước nó (cỡ chữ nhỏ KHÔNG hạ ngưỡng WCAG; ngoại lệ 3:1 của 1.4.3 chỉ dành cho chữ **lớn** ≥18.66px bold / ≥24px). Đo thật ở 360px: `#9AA5B5` = 2,49:1 và `#8A94A6` = 3,06:1, mà chúng đang chở email của học sinh và các câu trạng thái rỗng. Token nay là `caption` `#5F6B7D` (4,90:1 ở nền tệ nhất) và `caption2` `#66707D` (4,56:1). `tests/unit/a11y.test.ts` đo lại từ `tailwind.config.ts`, không chép số.
- Chữ gợi ý trong ô nhập (`::placeholder`) cũng là chữ: `#5B6B80` đặt một lần ở `globals.css` (mặc định Tailwind là `#9CA3AF` = 2,54:1). Placeholder **không được là nhãn duy nhất** — nó biến mất ngay khi gõ ký tự đầu (WCAG 3.3.2), nên mọi ô nhập phải có `<label htmlFor>` hoặc `aria-label` thật.
- Màu không phải tín hiệu duy nhất: badge/cờ luôn kèm chữ hoặc icon. Hai trạng thái khác nghĩa (ví dụ *có mặt* vs *gửi muộn*) không được chỉ khác nhau ở màu nền — phải khác **icon + chữ**, và có `sr-only` cho tai.
- 4 ô mood có `aria-label`; focus ring hiển thị khi điều hướng bàn phím.
- Hộp thoại nổi (popup) phải là hộp thoại thật: `role="dialog" aria-modal="true" aria-labelledby`, đặt focus vào trong khi mở, trả focus về chỗ cũ khi đóng, Escape đóng được, Tab quẩn trong hộp.
- Đổi màn sau một cú bấm (form → màn "đã gửi") phải báo cho tai: khối mới bọc `role="status" aria-live="polite"` **và** dời focus lên tiêu đề của nó (`ref` + `tabIndex={-1}`) — nút vừa bấm biến mất thì focus rơi về `<body>`.

## 12. Checklist trước khi giao màn mới

- [ ] Có khung đúng (390×844 hoặc 1440×900) + chrome trình duyệt?
- [ ] Trắng chủ đạo, navy–vàng đúng mã? Mood đúng 4 màu?
- [ ] Icon Material Symbols (không emoji)? Mascot đúng tỉ lệ 2:3, ≤1 con/màn?
- [ ] Chữ thừa đã cắt? Caption ≤1 dòng?
- [ ] Trang chủ chung — không tạo home riêng theo vai trò? Mini app có capsule ⋯/✕, không tab bar Hub?
- [ ] Đúng giọng (Glow & Grow vs vận hành)? Trạng thái offline/gửi muộn/rỗng-vì-ổn xử lý chưa?
- [ ] Ghi chú hiệu ứng dưới khung? `data-screen-label` trên khung?
- [ ] Không tràn khung 844/900px (test bằng validator)?
