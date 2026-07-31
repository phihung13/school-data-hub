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
| Chữ phụ | `#66707D`, `#6B7789` | mô tả |
| Caption | `#8A94A6`–`#9AA5B5` | **chỉ ≤11px**, không dùng cho nội dung |
| Viền | `#E4E9F0` | border |
| Chip xám | `#F1F4F8` | nền chip |

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

App chưa build: nền `#E9ECF2`, icon `#8A94A6`, `opacity:.45`, nhãn "· sắp".

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
