# Viet Anh School Hub — DESIGN.md

> **Nguồn sự thật vẫn là `danh-cho-may/DESIGN-GUIDELINES.md`** (12 mục, đã duyệt). File này là bản
> rút gọn theo định dạng công cụ thiết kế đọc được. Sửa guideline thì phải sửa file này cùng lúc.

## Theme

Sáng, nền trắng chủ đạo. Chọn sáng vì bối cảnh dùng thật: sân trường và lớp học lúc 7 giờ sáng,
ánh sáng mạnh, học sinh cầm điện thoại ngoài trời. Nền tối ở bối cảnh đó là quyết định sai.

Màu dồn vào icon, nút, trạng thái và header — không phủ nền. Chiến lược màu: **restrained**
(nền trung tính + navy làm màu thương hiệu duy nhất mang tải, vàng làm nhấn phụ).

## Palette

| Vai trò | Giá trị | Dùng ở đâu |
|---|---|---|
| Navy thương hiệu | `#0A2A5E` | hero, nút chính, tab active |
| Navy gradient | `linear-gradient(155deg,#0A2A5E,#1E5FB8)` | hero, nút chính |
| Vàng sáng / đậm | `#FFC629` / `#F5A300` | CTA phụ, badge, avatar, highlight |
| Chữ trên vàng | `#6B4A00`, `#8A5A00` | bắt buộc dùng cặp này, không dùng trắng trên vàng |
| Nền trang | `#F7F9FC` (mobile) / `#F5F7FA` (desktop) | body |
| Nền thẻ | `#FFFFFF` | card |
| Chữ chính | `#0F172A` | nội dung |
| Tiêu đề thẻ | `#0A2A5E` | heading trong thẻ |
| Chữ phụ | `#66707D` (`muted`), `#5F6B7D` (`muted2`) | mô tả |
| Caption | `#5F6B7D` (`caption`) / `#66707D` (`caption2`) | 4,90:1 và 4,56:1 ở nền tệ nhất `#F1F4F8` |
| Chữ gợi ý ô nhập | `#5B6B80` | đặt một lần ở `globals.css`, KHÔNG để rơi về `#9CA3AF` |
| Viền | `#E4E9F0` (`line`) / `#C9D2DE` (`line2`, viền nhạt & chevron) | border — `line2` KHÔNG dùng cho chữ |
| Chip xám | `#F1F4F8` | nền chip |
| Chữ phụ đậm | `#5B6B80` (`subtle`) | 5,73:1 — chữ phụ cần đọc chắc hơn caption |
| Tiêu đề thẻ cấp hai | `#33507C` (`cardtitle2`) | 8,17:1 — màn người lớn |
| Chữ liên kết | `#1D4E8F` (`link`) | 7,66:1 — liên kết trong thân trang |
| Chữ trên nền xanh nhạt | `#00693F` (`successText`) | 6,12:1 — KHÔNG dùng `#00A05F` (3,39:1) cho chữ |
| Chữ đỏ trên nền hồng | `#C7333A` (`dangerText`) | 4,94:1 trên `#FFF5F5` — `#D2383E` chỉ 4,49:1 |

### Nền trạng thái (`surface.*`, thêm 05/08/2026)

Giá trị giữ nguyên từng mã một — đợt này chỉ ĐẶT TÊN cho những nền đã chạy sẵn ở hơn 100 chỗ
dưới dạng mã hex viết tay, để câu hỏi "chữ này có đọc được trên nền kia không" tra được bằng tên
thay vì bằng mắt.

| Token | Mã | Dùng cho |
|---|---|---|
| `surface-success` | `#E3F8ED` | đã xong, đã tới nơi |
| `surface-warn` | `#FFF1C9` | đang chờ xử lý |
| `surface-warnSoft` | `#FFF7E0` | nhắc nhẹ, ô số liệu |
| `surface-gold` | `#FFFBEE` | nền nút phụ viền vàng |
| `surface-danger` / `surface-danger2` | `#FFF5F5` / `#FFF0F0` | lỗi, đăng xuất · pill khẩn |
| `surface-info` / `surface-infoSoft` | `#E2F0FC` / `#F0F7FF` | thông tin trung tính · thẻ giải thích |
| `surface-alt` · `surface-shell` · `surface-muted` | `#F5F8FC` · `#EAEFF6` · `#E9ECF2` | nền xen kẽ · nền ngoài khung thẻ · ô app chưa mở |

> **`muted2` đã đổi `#6B7789` → `#5F6B7D` (05/08/2026).** Mã cũ đạt 4,54:1 trên trắng nhưng
> tụt xuống 4,12:1 trên chip và 4,33:1 trên nền thẻ Glow — tức là nó chở chữ thật dưới chuẩn ở
> đúng bản báo cáo phụ huynh mở từ link Zalo. Ngoại lệ hạ sàn riêng cho token này trong
> `tests/unit/a11y.test.ts` cũng đã gỡ: bốn token chữ xám nay đo cùng một thước 4,5:1.
>
> **Luật một dòng cho màu chữ:** không thêm mã hex mới vào component. Thiếu màu thì thêm token
> ở `tailwind.config.ts` — bài học đã trả giá thật: lần sửa `#E8940D` hôm 01/08 chỉ chạm được
> 1 trong 7 chỗ vì sáu chỗ kia người sửa không mở file ra.

### Bốn màu tâm trạng — KHÔNG đổi

Thống nhất với bản giấy đang dùng trong lớp, nên đây là ràng buộc cứng chứ không phải lựa chọn thẩm mỹ.

| Tâm trạng | Gradient | Chữ/icon |
|---|---|---|
| Vui | `#00D97A → #00A85E` | trắng |
| Bình thường | `#4E9BFF → #2C7BF2` | trắng |
| Mệt | `#FFC833 → #F5A300` | `#6B4A00` |
| Buồn | `#FF7A7F → #F0474D` | trắng |

### Màu chủ từng mini app

Điểm danh `#2C7BF2→#0A4FBF` · Hoạt động `#FFB01F→#F58F00` · Học tập `#00D97A→#00A05F` ·
Y tế `#FF6B70→#E23A41` · Báo cáo `#9D6BFF→#7434E8` · Dấu chân `#00D3E8→#00A6BE` ·
Buồng lái `#2A5DA8→#0A2A5E` · Tâm lý `#6A34E0→#8B5CF6` (tím = riêng tư) · Zalo `#0068FF`

App chưa build: nền `#E9ECF2`, icon token `caption`, `opacity:.45`, nhãn "· sắp"
(kèm `<span class="sr-only"> — sắp có, chưa mở</span>`: mờ là tín hiệu cho mắt, không cho tai).

## Typography

**Một họ chữ duy nhất: Be Vietnam Pro** (400–900), tự host qua `next/font`. Không ghép font thứ hai —
phân cấp tạo bằng cân nặng và kích thước.

| Cấp | Cỡ | Cân nặng |
|---|---|---|
| Tiêu đề màn | 17–24px | 900 |
| Tiêu đề thẻ | 13–15px | 900 |
| Nội dung | 12–13px | 400–600 |
| Caption | 10–11.5px | 400–700 |

Sàn tuyệt đối 9.5px. Icon: Material Symbols Rounded `FILL 1` (class `.msr`) — **cấm emoji làm icon**.

## Layout

- Mobile 390×844, desktop 1440×900. Mọi màn phải hình dung được ở cả hai khung.
- **Hero cong**: header navy gradient + glow vàng, đáy là vòm trắng `border-radius:100% 100% 0 0`,
  thẻ đầu tiên nổi đè lên vòm (margin âm, `z-index:2`, không nằm trong container `overflow:hidden`).
- **Lưới mini app**: 4 cột ở cả hai khung, nhãn 10–11px/700 dưới tile.
- **Desktop hai cột**: nội dung chính `flex:1.6–1.7` + rail phải `flex:1`.
- **Tab bar mobile chỉ dành cho học sinh** (5 mục, nút check-in tròn vàng nổi giữa). Giáo viên và phụ
  huynh: 4 mục, không nút giữa. Mini app không bao giờ có tab bar Hub.

## Components

- **Nút chính**: navy gradient, bo 13–16px, chữ trắng 900, shadow `0 7–9px 16–22px rgba(10,42,94,.28)`.
  Hover nâng 2px, active scale .97.
- **Nút phụ**: viền `#FFC629` 1.6px, nền `#FFFBEE`, chữ `#8A5A00`.
- **Thẻ**: trắng, bo 16–22px, shadow `0 3px 12–14px rgba(10,42,94,.06)`; thẻ nổi hero `0 14px 32px rgba(10,42,94,.14)`.
- **Badge pill**: 9–10.5px/900, uppercase, nền nhạt + chữ đậm cùng tông.
- **Progress**: track `#EEF1F6` 6–7px, fill gradient theo màu domain.

## Chữ trên màn — cái gì được viết, cái gì phải để hình nói (06/08/2026)

DESIGN-GUIDELINES §1.5 đã có luật này từ đầu (*"Ít chữ — hình thể thay lời nói. Caption tối đa 1 dòng.
Nếu 1 icon + 5 từ diễn đạt được thì không viết 2 câu"*), nhưng app trôi khỏi nó dần: đo 06/08/2026 được
**106 câu dài** (trên 55 ký tự) nằm trong JSX, tập trung ở 14 màn. Chủ đầu tư mở buồng lái và nói thẳng:
*"lạm dụng quá nhiều chữ, ngôn ngữ phải được thể hiện qua thiết kế chứ không phải chữ viết"*.

**Bốn loại câu KHÔNG được viết ra màn** — chúng là chú thích cho người sửa mã, không phải cho người dùng:

| Loại | Ví dụ có thật đã bị cắt |
|---|---|
| Giải thích cơ chế máy | *"Bấm hai lần cùng một nội dung không tạo bản ghi thứ hai"* · *"Hiện ngay khi em bấm — không chờ lượt quét đêm"* |
| Dạy người dùng đọc màn của chính họ | *"Chỉ những em thầy cô vừa chọn mới được ghi"* (đã có checkbox và số đang chọn) |
| Biện minh vì sao màn thiếu dữ liệu | *"Bản phụ huynh đọc có thể còn một mục nữa dựa trên tâm trạng cả tuần. Màn này không dựng được mục đó vì…"* |
| Khuyên nhủ, an ủi, tự thuật | *"cùng sắp xếp giờ giấc buổi sáng nhé"* · *"báo cáo tuần này gần như không có dữ liệu thật để kể"* |

**Bốn loại câu PHẢI giữ** — bỏ là vi phạm điều khoản, không phải gọn gàng hơn:

1. **Nhãn quyền riêng tư tại chỗ nhập** (`NHAN_AI_DOC_CAM_XUC`) — ADR-026, §9 guideline.
2. **Mọi `sr-only`** — ngôn ngữ cho tai, không chiếm một pixel nào. Cắt nó là cắt người khiếm thị khỏi app.
3. **Câu báo lỗi của một hành động vừa hỏng** — đúng lúc hỏng thì người dùng cần chữ. Rút ngắn được, bỏ thì không.
4. **Câu nói ra dữ liệu đang thiếu hoặc đang cũ** (điều 8 sau ADR-030; phân biệt 5 trạng thái theo QĐ-3) — nhưng
   chuyển từ CÂU sang NHÃN/chip: một chip "gửi muộn" nói đúng thứ mà một câu 20 chữ đang nói.

**Cách thay, không phải chỉ xoá:** icon + nhãn 2–4 từ · chip trạng thái · nền + icon (không dùng màu một
mình, §11). Câu thật sự cần cho người muốn hiểu sâu thì cho vào `<details>/<summary>` — một dòng trên màn,
phần còn lại bấm mới mở, mẫu ở `components/tam-ly/tam-ly-shell.tsx`.

## Motion

- Thời lượng 150–300ms; stagger danh sách 40–80ms; đếm số 400–700ms; vẽ progress 700–800ms.
- Keyframes dùng chung: `floaty` (mascot 3.5–5s), `popIn` (cubic-bezier(.34,1.56,.64,1)),
  `pulseDot` (nút check-in), `confetti` (màn thành công).
- Mở mini app: Hub scale `.96` + mờ, app trượt từ đáy 320ms.
- **Không dùng vệt sáng sweep trên nút.** Hover đổi màu/bóng, không làm xô layout.
- `prefers-reduced-motion` là bắt buộc, không phải tuỳ chọn.

## Điểm cần rà lại (ghi ra để không quên)

`DESIGN-GUIDELINES.md` mục 7 quy định **thẻ cờ ở buồng lái dùng `border-left` 5px màu mức độ**.
Đây là mẫu mà công cụ rà thiết kế xếp vào diện cấm tuyệt đối (side-stripe border là dấu hiệu
giao diện do AI sinh). Hai bên đang mâu thuẫn: một bên là guideline đã duyệt của trường, một bên là
luật chung của công cụ. **Chưa tự ý đổi** — cần chốt với người duyệt thiết kế, vì border-left ở đây
còn mang chức năng phân mức độ khẩn, không chỉ trang trí. Nếu bỏ thì phải thay bằng cách phân mức
khác vẫn đọc được khi không phân biệt màu (§11 tiếp cận).

**Đã chốt được một nửa (01/08/2026)** — ranh giới là *ai đọc màn đó*:

- **Buồng lái / tâm lý / điều hành**: giữ nguyên `border-left` 5px theo §7. Việc treo ở trên vẫn treo.
- **Màn học sinh & phụ huynh**: đã BỎ. Không phải vì luật của công cụ, mà vì đo được hai chỗ nó
  đang sai nghĩa: (1) `growth-report-view.tsx` bản mobile — bản duy nhất phụ huynh mở từ link Zalo —
  dùng dải màu trái làm thứ **duy nhất** phân biệt ba loại Glow, không icon không chữ, nên người mù
  màu và người đọc bằng tai không nhận được gì (§11 "màu không phải tín hiệu duy nhất"); bản desktop
  cùng dữ liệu thì lại vẽ bằng nền nhạt + icon, tức hai bản đang nói khác nhau. (2)
  `help-request-view.tsx` dải "chờ xác nhận"/"đã nhận" có sẵn icon + chữ nên dải màu chỉ là thừa.
  Cả hai nay dùng **nền nhạt + icon + chữ** — thứ mang nghĩa thật.

**Đợt rà 05/08/2026 chạm thêm hai điều khoản nữa, và chỉ chạm vế đo được bằng số:**

- **§3 `opacity:.45` cho tile app chưa build** — đã sửa cách thi hành, KHÔNG sửa ý định. Trước đây
  mờ phủ cả khối nên nhãn chữ chỉ còn 2,21:1; nay mờ nằm ở **ô icon**, nhãn giữ màu đặc (12,55:1).
  Mắt vẫn đọc "app này chưa mở", tai vẫn nghe câu `sr-only` — không vế nào mất. Cùng cách xử lý cho
  `opacity-45` ở menu trái và `opacity-60/75` ở màn quản trị.
- **§Motion `popIn cubic-bezier(.34,1.56,.64,1)`** — công cụ rà xếp easing nảy vào diện cấm. **Giữ
  nguyên**: đây là chuyển động đã duyệt trên bản giấy, và nó chỉ dùng cho một khoảnh khắc ăn mừng
  của trẻ con, không phải cho mọi chuyển cảnh. Ghi vào `DEBT.md` #58 để người duyệt chốt, không tự đổi.

Ba món trên nay có số hiệu trong `danh-cho-may/DEBT.md`: **#58** (ba điều khoản đá nhau), **#59**
(hai màn buồng lái phân mức bằng hai ngôn ngữ hình), **#60** (cổng landmark còn chạy trên danh sách
file viết tay).
