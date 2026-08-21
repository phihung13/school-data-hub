# Viet Anh School Hub — Quy tắc & Tiêu chuẩn thiết kế
*Áp dụng cho mọi màn hình hiện có và phát sinh sau này (mobile + desktop). Nguồn sự thật: `Hub Mobile.dc.html`, `Hub Desktop.dc.html`.*

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
- **Lưới mini app**: 4 cột (mobile & desktop card), nhãn 10–11px/700 dưới tile. Badge số góc trên phải tile (`#F0474D` đỏ khẩn, `#FFC629` vàng chờ xử lý, viền 2px nền trang).
- **Tab bar mobile (chỉ ở Hub, vai trò học sinh)**: nút **Check-in tròn vàng nổi giữa** (56px, `pulseDot`) — từ 21/08/2026 nó là `<button>` **mở popup ngay tại chỗ**, KHÔNG phải `<Link>` dẫn sang một trang (ADR-036 bản popup; `/checkin` đã gỡ). Vì thế nó **không** khai `aria-current` — nó không dẫn tới trang nào để mà "đang ở đó" — mà khai `aria-haspopup="dialog"`. GV/PH: 4 mục, không nút giữa. **Mini app KHÔNG có tab bar Hub.**
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
- Trạng thái nghiệp vụ chuẩn: **gửi muộn ≠ vắng** (vàng, "chờ xác nhận") · **"lớp ổn" ≠ thiếu dữ liệu** (kèm giờ quét, khung dashed xanh + mascot) · offline: "Offline vẫn lưu — tự gửi sau." (icon `cloud_off`, không hộp thoại).
- Nhắc quan trọng đi qua **Zalo OA**, app không đòi push.

## 9. Riêng tư & phân quyền

- Mood/check-in cảm xúc: **chính em, thầy cô tâm lý, và giáo viên chủ nhiệm CỦA EM** đọc được (`core.can_read_mood()` = `is_me ∨ in_my_cluster ∨ is_homeroom_of`, migration `0059`, ADR-035 — quyết định chủ đầu tư 21/08/2026, đảo ADR-026). Dòng này đã đổi chiều **ba lần** (31/07 mở GVCN → 01/08 cắt → 21/08 mở lại) — ai định đổi lần thứ tư phải đọc đủ ADR-025/026/035 trước. Phụ huynh, BGH, giáo viên bộ môn, GVCN lớp khác: **vẫn không** đọc được, cả ba lần đều thế.

  **NHÃN CHUẨN — hai câu dưới đây là hợp đồng, tầng màn hình in ĐÚNG chữ này.** Lý do phải chốt ở đây chứ không để mỗi màn tự viết: nhãn nói ít hơn hoặc nhiều hơn sự thật đều là nói dối, và một màn viết lệch là cả lời hứa lệch. Viết cho trẻ 11 tuổi đọc — §8 cấm từ vựng vận hành (cờ / ngưỡng / quét / leo thang) trước mặt học sinh, nên hai câu này không được chứa chữ nào trong số đó.

  1. **Nhãn ngắn, đặt ngay tại chỗ em nhập** (dưới bốn ô mặt cười trong **popup check-in**, lưới check-in trang chủ, mọi ô nhập cảm xúc phát sinh sau này), kèm icon `lock` (đổi 21/08/2026 theo ADR-035 — bản cũ "Chỉ thầy cô tâm lý đọc" hết đúng):

     > **Chỉ thầy cô tâm lý và thầy cô chủ nhiệm đọc**

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
