---
ban-doi-ung: none
sync-version: 1
---

# Brief cho người vẽ lại giao diện Hub — 06/08/2026

> **Cách dùng:** dán trọn file này vào công cụ thiết kế (Claude Design hoặc tương đương).
> Nó mô tả HỆ ĐANG CHẠY THẬT, không phải một ý tưởng. Mọi tên màn, tên vai, tên bảng dữ liệu
> trong đây đều lấy từ mã nguồn ngày 06/08/2026 — vẽ sai tên là vẽ một hệ khác.

---

## 0. Sản phẩm này là gì, và ai dùng

**Viet Anh School Hub** — hệ theo dõi và chăm sóc học sinh của Hệ thống Trường Việt Anh.
Mô hình **Super App + Mini App**: mọi vai đăng nhập vào **cùng một trang chủ**, chỉ khác nhau ở
lưới mini app và menu hiện ra theo quyền. Quy mô thiết kế ≤5.000 người dùng, ~300.000 request/ngày.

Tám vai, tên đúng như trong mã: `student` · `guardian` · `teacher` (giáo viên bộ môn) ·
`homeroom` (giáo viên chủ nhiệm) · `counselor` (tâm lý cụm) · `principal` · `board` · `admin`.

Ba việc lõi phải trơn mỗi sáng:
1. Học sinh check-in cảm xúc trước 8:00 (mất mạng vẫn lưu, tự gửi sau).
2. GVCN mở buồng lái, 2 phút đầu giờ thấy ngay lớp mình: ai chưa tới, ai gửi muộn, em nào cần để ý.
3. Phụ huynh xem Báo cáo Trưởng thành của con.

---

## 1. Ràng buộc CỨNG — vẽ sai là hệ phạm luật, không phải xấu

**Riêng tư (Luật 91/2025 + quyết định của trường):**
- Mức cảm xúc (mood) chỉ **chính em** và **thầy cô tâm lý** đọc được. GVCN **không** đọc được.
  Nhãn bắt buộc in tại mọi chỗ nhập cảm xúc: **"Chỉ thầy cô tâm lý đọc"**.
- Lời "Mình cần gặp thầy cô": chính em · GVCN của em · tâm lý cụm. Giáo viên bộ môn: **không**.
- Ghi chú tư vấn tâm lý: GVCN và phụ huynh **không** xem được, luôn có badge `visibility_off`.
- Giáo viên bộ môn chỉ thấy: lớp mình dạy · danh sách em · trạng thái điểm danh. Không cảm xúc,
  không cờ chăm sóc, không lời cần gặp.
- Hiệu trưởng/hội đồng chỉ xem **số tổng hợp**, không tra cứu từng em.

**Hai giọng, không trộn:** học sinh và phụ huynh chỉ thấy giọng "Glow & Grow" (tỏa sáng, đang lớn
lên). Từ vựng vận hành — *cờ, ngưỡng, leo thang, định mức, GVCN* — CHỈ xuất hiện ở buồng lái,
tâm lý cụm, điều hành. Đây là ràng buộc đạo đức, không phải sở thích văn phong.

**Chữ trên màn (vừa siết 06/08/2026):** hình phải nói thay chữ. Bốn loại câu **cấm** viết ra màn:
giải thích cơ chế máy ("bấm hai lần không tạo bản ghi thứ hai") · dạy người dùng đọc màn của
chính họ · biện minh vì sao màn thiếu dữ liệu · khuyên nhủ/an ủi/tự thuật. Caption tối đa **một
dòng**. Bốn loại **phải giữ**: nhãn quyền riêng tư · mọi nội dung cho trình đọc màn hình · câu báo
lỗi khi thao tác vừa hỏng · câu nói ra dữ liệu đang thiếu hoặc đang cũ (nhưng dạng chip, không dạng câu).

**Không bao giờ vẽ:** affordance giả (ô tìm kiếm không tìm được gì, chuông không có thông báo
thật, nút dẫn tới màn chưa có). Một cái chuông rỗng từng bị gỡ khỏi trang chủ ngày 31/07/2026 vì
đúng lý do đó. Nếu bản vẽ có chuông thì phải ghi rõ **nguồn dữ liệu của nó**.

**Tiếp cận:** vùng chạm ≥44px · tương phản chữ ≥4,5:1 đo trên nền THẬT · màu không bao giờ là tín
hiệu duy nhất (luôn kèm icon hoặc chữ) · tôn trọng `prefers-reduced-motion`.

---

## 2. Ngôn ngữ hình đang dùng (giữ nguyên, đừng phát minh lại)

- **Nền trắng chủ đạo.** Màu dồn vào icon, nút, trạng thái, header. Chiến lược màu: restrained.
- **Navy thương hiệu** `#0A2A5E`, gradient `#0A2A5E → #1E5FB8`. **Vàng** `#FFC629 / #F5A300`.
  Chữ trên vàng bắt buộc là `#6B4A00` hoặc `#8A5A00` — **không dùng trắng trên vàng**.
- Nền trang `#F7F9FC` (điện thoại) / `#F5F7FA` (máy tính). Thẻ trắng, bo 16–22px,
  đổ bóng `0 3px 14px rgba(10,42,94,.06)`.
- **Bốn màu tâm trạng, KHÔNG đổi:** Vui `#00D97A→#00A85E` · Bình thường `#4E9BFF→#2C7BF2` ·
  Mệt `#FFC833→#F5A300` (chữ `#6B4A00`) · Buồn `#FF7A7F→#F0474D`.
- **Màu chủ từng miền:** Điểm danh `#2C7BF2` · Hoạt động `#FFB01F` · Học tập `#00D97A` ·
  Y tế `#FF6B70` · Báo cáo `#9D6BFF` · Buồng lái `#2A5DA8` · Tâm lý `#8B5CF6` (tím = riêng tư).
- **Chữ:** một họ duy nhất **Be Vietnam Pro** (400–900). Tiêu đề màn 17–24px/900, tiêu đề thẻ
  13–15px/900, nội dung 12–13px, caption 10–11.5px. Sàn tuyệt đối 9.5px.
- **Icon:** Material Symbols Rounded, FILL 1. **Cấm emoji làm icon.**
- **Hero cong:** header navy gradient + quầng sáng vàng, đáy là vòm trắng
  `border-radius: 100% 100% 0 0`, thẻ đầu tiên nổi đè lên vòm.
- **Khổ vẽ:** điện thoại 390×844 và máy tính 1440×900. Mọi màn phải có cả hai.

---

## 3. CÂY MÀN HÌNH — hệ đang có gì

Ký hiệu bề mặt: `[M]` = có trong menu trái (từ 768px) · `[T]` = có trong thanh tab dưới cùng
(dưới 768px) · `[Ô]` = có ô trong lưới mini app ở trang chủ.

```
/login                       — mọi người, chưa đăng nhập
│                              máy tính: tranh parallax 6 lớp bên trái + thẻ đăng nhập bên phải
│                              điện thoại: dải hero navy cong + thẻ, không parallax
│
└── /home  [M][T]            — MỌI VAI đăng nhập xong đều vào đây (một cửa vào chung)
    │
    ├── HỌC SINH (student)
    │   ├── /checkin           [Ô][T-giữa]  Check-in cảm xúc — nút tròn vàng nổi giữa thanh tab
    │   ├── /tuan-nay          [M]          Tuần này của mình
    │   ├── /diem-danh         [M]          Lịch điểm danh
    │   ├── /bao-cao           [Ô][M]       Báo cáo Trưởng thành
    │   ├── /can-gap-thay-co                Mình cần gặp thầy cô (vào từ /home và từ /checkin)
    │   └── /ho-so             [T-phải]     Hồ sơ của mình
    │
    ├── PHỤ HUYNH (guardian)
    │   ├── /bao-cao           [Ô][M][T]    Báo cáo Trưởng thành của con
    │   ├── /dieu-khoan                     Phiếu đồng ý (chặn đường vào khi chưa ký)
    │   └── "Điểm danh của con"  [Ô mờ]     GĐ2 — vẽ ở thể mờ, có nhãn "· sắp"
    │
    ├── GIÁO VIÊN BỘ MÔN (teacher)          ← vai này vừa có màn đầu tiên ngày 06/08/2026
    │   └── /lop-toi-day       [M][T]       Lớp tôi dạy — chọn lớp, danh sách em, điểm danh hôm nay
    │
    ├── GIÁO VIÊN CHỦ NHIỆM (homeroom)      ← cũng dạy môn, nên có cả /lop-toi-day
    │   ├── /gvcn              [Ô][M][T]    Bảng điều khiển (buồng lái)
    │   ├── /gvcn/lop          [M]          Lớp chủ nhiệm
    │   ├── /gvcn/diem-danh    [M][T]       Điểm danh lớp
    │   ├── /gvcn/duyet-bao-cao[M]          Duyệt báo cáo (chọn hàng loạt: duyệt · trả lại · sửa)
    │   ├── /gvcn/ghi-chu      [M]          Ghi chú can thiệp
    │   └── /gvcn/hoc-sinh/<id>             Hồ sơ một em (vào từ danh sách lớp và thẻ cờ)
    │
    ├── TÂM LÝ CỤM (counselor)
    │   ├── /tam-ly            [M]          Hộp việc của cụm
    │   └── /tam-ly/ho-so/<id>              Hồ sơ chăm sóc một em
    │
    ├── HIỆU TRƯỞNG / HỘI ĐỒNG (principal, board)
    │   └── /dieu-hanh         [M]          Điều hành — số tổng hợp theo khối/lớp
    │
    ├── QUẢN TRỊ (admin)
    │   ├── /quan-tri/mini-app [M]          Sổ đăng ký Mini App
    │   └── /quan-tri/xem-truoc[M]          Trang chủ theo vai (xem hệ qua mắt vai khác)
    │
    └── MINI APP NGOÀI (nhúng)
        └── /embed/<app-id>                 khung nhúng + capsule ⋯│✕ nổi để thoát về Hub
```

**Hai mini app đang khai thật trong CSDL:** `factory` (Factory, rổ xanh, đang bật) và một app
Điều hành. Danh sách nằm ở bảng `core.embedded_apps`, quản trị bật/tắt được trong 10 giây.

---

## 4. LUỒNG — cái gì dẫn tới cái gì

```
SÁNG CỦA HỌC SINH
  mở app → /home → thẻ "Check-in" → /checkin → chạm 1 trong 4 ô cảm xúc
    ├─ có mạng  → ghi ngay → màn "đã ghi hôm nay" (đổi được, mỗi ngày giữ một)
    └─ mất mạng → lưu trong máy, tự gửi sau → màn nói rõ "chưa gửi được", KHÔNG ăn mừng
  Trong cùng màn: nút "Mình cần gặp thầy cô" → /can-gap-thay-co (3 bước: chuyện gì · khi nào · nói gì)
    → tín hiệu này đi NGAY tới buồng lái GVCN, không chờ lượt quét đêm

SÁNG CỦA GVCN
  /home → /gvcn → thấy 5 ô số + "Việc cần làm sáng nay"
    ├─ check-in gửi muộn → chọn từng em (có giờ gửi) → kết luận: Có mặt · Đi muộn · Vắng
    │                       (hai kết luận sau bắt buộc ghi lý do, mọi lượt đều vào sổ vết)
    ├─ thẻ cờ "cần để ý"  → tên em → /gvcn/hoc-sinh/<id>
    └─ hồ sơ chăm sóc đang mở → /gvcn/lop (cột Chăm sóc chỉ ra em nào)

DUYỆT BÁO CÁO (GVCN, mỗi tuần)
  /gvcn/duyet-bao-cao → chọn nhiều em → Duyệt gửi phụ huynh · Trả lại (kèm lý do) · Bỏ chọn
    → nếu lô có em ĐÃ ký: hiện thêm một ô tick "Đổi quyết định đã ký cho N em" → mới ghi được
    → mọi lượt đổi để lại dòng sổ: ai · lúc nào · từ gì sang gì · vì sao

CHĂM SÓC (tâm lý cụm)
  /tam-ly (hộp việc của cụm) → /tam-ly/ho-so/<id> → ghi việc đã làm · đóng hồ sơ
  Màn này CỐ TÌNH không hiện tâm trạng và lời em viết — và nói ra điều đó ngay trên đầu màn

DỮ LIỆU CHẢY TỪ ĐÂU
  Học sinh bấm → attendance.checkins (mood là một cột, quyền đọc cắt ở tầng cột)
  Bộ quét cờ chạy theo lịch → care.flags → buồng lái đọc
  Số liệu tổng hợp → view riêng cho /dieu-hanh, không đọc thẳng bảng học sinh
  App ngoài ghi → phòng chờ (staging) → job promote() có kiểm → mới vào schema nghiệp vụ
```

---

## 5. NHỮNG CHỖ ĐANG THIẾU — phần cần anh vẽ

Chủ đầu tư mở `/home` bằng tài khoản **quản trị** và **giáo viên** và nói: *"thiếu thiếu gì á"*.
Đúng: trang chủ của các vai người lớn hiện gần như trống — một thẻ "Mini App" với 2 ô, rồi hết.
Trong khi trang chủ của học sinh có hero cong, thẻ check-in, dải tuần này, thẻ số liệu.

**Vẽ lại `/home` cho vai người lớn, ở cả hai khổ, gồm:**

1. **Hero** — giữ dải navy gradient + quầng vàng như hiện tại, nhưng bên phải hero cần chỗ cho:
   - **Ô tìm mini app** — chỉ hiện khi số app ≥ 5 (hôm nay 2 app, một ô tìm kiếm là thừa).
     Vẽ cả hai thể: có ô tìm và không có ô tìm.
   - **Chuông thông báo** — *chỉ vẽ nếu nêu được nguồn dữ liệu*. Nguồn khả dĩ đang có thật:
     việc cần làm của buồng lái (gửi muộn chờ xác nhận, cờ mới, báo cáo chờ duyệt), lời "cần gặp
     thầy cô" chưa ai đánh dấu. Vẽ kèm: thể rỗng (không có gì) · thể có N việc · lớp nổi khi bấm.
     **Không vẽ chuông trang trí** — một cái chuông rỗng đã bị gỡ một lần rồi.
2. **Cột phải (rail)** — máy tính chia 2 cột: nội dung `flex 1.6–1.7`, rail `flex 1`. Trang chủ
   người lớn hiện KHÔNG có rail. Đề xuất nội dung rail theo vai (chỉ dùng dữ liệu có thật):
   - GVCN: việc cần làm hôm nay · lượt quét gần nhất · lối tắt tới lớp mình
   - Giáo viên bộ môn: các lớp dạy hôm nay + sĩ số đã ghi
   - Tâm lý cụm: số ca đang mở trong cụm
   - Hiệu trưởng/hội đồng: 3 số tổng hợp toàn trường
   - Quản trị: trạng thái hệ (job chạy lần cuối, app đang bật/tắt)
3. **Lưới mini app** — 4 cột ở cả hai khổ, nhãn 10–11px/700 dưới tile. App chưa build vẽ ở thể
   mờ, nền `#E9ECF2`, nhãn "· sắp". Cần vẽ thêm: thể **1 app**, thể **12 app** (cuộn/ngắt dòng ra sao).
4. **Thể rỗng tử tế** — vai chưa có app nào và chưa có việc gì thì màn nói gì? Hiện tại là một
   khoảng trắng lớn.

**Vẽ lại `/ho-so` theo mẫu ảnh chủ đầu tư gửi (bản 2 cột):**
- Cột trái: thẻ danh tính (avatar tròn màu vàng, tên, lớp · cơ sở · mã học sinh, email, chip
  "GOOGLE SSO") + **ba ô số** (chuỗi check-in · huy hiệu · đọc sách tuần) + thẻ **"Tài khoản &
  thiết bị"** (đăng nhập bằng Google · thiết bị đang đăng nhập · trợ giúp và liên hệ GVCN) +
  thẻ **"Cài đặt"** (ngôn ngữ · nhắc check-in buổi sáng — công tắc).
- Cột phải: thẻ **"Ai thấy gì của mình?"** (ba dòng: cô chủ nhiệm ✓ · bố mẹ ✓ · bạn cùng lớp ✗)
  + thẻ mascot nhỏ + nút **Đăng xuất** viền đỏ + dòng phiên bản.
- Lớp nổi tài khoản mở từ chân menu trái: Hồ sơ của tôi · Cài đặt · Trợ giúp · Đăng xuất.
- **Lưu ý luật:** thẻ "Ai thấy gì" phải in ĐÚNG phạm vi quyền hiện hành — cô chủ nhiệm **không**
  đọc được cảm xúc; nội dung ô đó do mã sinh ra, người vẽ giữ chỗ chứ đừng viết lại chữ.

---

## 6. TÍNH NĂNG TƯƠNG LAI — vẽ sẵn chỗ, đừng vẽ nội dung bịa

Hệ đã có sẵn cơ chế nhúng app ngoài (ba tầng tin cậy, sổ đăng ký trong CSDL, quản trị bật/tắt).
Cần bản vẽ cho những thứ sắp cắm vào:

1. **Trang tin nhúng** — `truongvietanh.com`, `nguyenmanhduong.com` và tương tự:
   - Ô trong lưới mini app (icon + nhãn), mở ra khung nhúng toàn màn có capsule ⋯│✕ để thoát.
   - Nếu nền tảng ngoài **chặn nhúng** (Tier 3) thì phải vẽ **màn cảnh báo trước khi rời Hub**:
     nói rõ sắp mở tab ngoài, và người dùng bấm xác nhận. Màn này chưa có, đang là nợ kỹ thuật.
   - Thể đang tải (app ngoài chậm) và thể hỏng (app ngoài chết) — vẽ cả hai.
2. **Bảng tin trong Hub** — nếu muốn đưa tin bài vào thẳng trang chủ thay vì mở app ngoài:
   vẽ một khối "Tin từ trường" trong rail hoặc dưới lưới app, có ảnh nhỏ + tiêu đề + ngày.
   Vẽ kèm thể rỗng và thể lỗi (không lấy được tin).
3. **Điểm danh cho giáo viên bộ môn** — đang chờ quyết định: cho phép thầy cô ghi điểm danh tiết
   mình dạy hay không. Nếu có, màn `/lop-toi-day` cần thêm nút ghi trên từng em + ghi hàng loạt.
4. **Học tập, Y tế** (GĐ2) — hiện là hai ô mờ. Vẽ trước hình dạng màn để biết chỗ mà chừa.
5. **Thông báo đẩy** (Zalo OA / SMS) — chưa mua hạ tầng. Nếu vẽ chuông ở mục 5.1 thì vẽ luôn
   trạng thái "đã gửi tới Zalo" trong lớp nổi thông báo.

---

## 7. ĐẦU RA MONG MUỐN

Với mỗi màn: **hai khổ** (390×844 và 1440×900), và với mỗi màn có dữ liệu thì vẽ đủ **bốn thể**:
đang tải · có dữ liệu · rỗng · lỗi. Kèm chú thích ngắn nói rõ mỗi con số lấy từ đâu.

Ưu tiên theo thứ tự: (1) `/home` cho năm vai người lớn · (2) `/ho-so` · (3) chuông + lớp nổi
thông báo · (4) khung nhúng trang tin + màn cảnh báo rời Hub · (5) các thể rỗng/lỗi còn thiếu.

**Đừng vẽ:** dashboard SaaS (thẻ số khổng lồ + mũi tên tăng trưởng), bảng xếp hạng học sinh,
biểu đồ cho đẹp, tim/thả cảm xúc công khai, emoji làm icon, dải màu dày một cạnh làm điểm nhấn,
chữ gradient, thẻ kính mờ trang trí.

---

## 8. HIẾN PHÁP UI/UX — 30 điều, và chỗ nào của nó KHÔNG áp được ở đây

Chủ đầu tư đưa một bộ 30 điều làm chuẩn nghề cho người thiết kế. Áp trọn, **trừ ba chỗ** đá nhau
với luật đã duyệt của trường; ba chỗ đó xử lý ở mục 9 chứ không im lặng chọn bên.

**Mục tiêu và luồng (điều 1–2, 17, 21–23).** Mỗi màn một mục tiêu chính. Không màn cụt: mọi màn
phải trả lời *tôi đang ở đâu · quay lại thế nào · đi tiếp đâu được*. Trước khi vẽ, hỏi đủ: thiếu
gì · có cần chọn hàng loạt · có cần tìm/lọc · có cần lịch sử · có cần xác nhận · có cần các thể
rỗng/đang tải/lỗi. **Điều 23 (luật vàng):** đừng vẽ đúng y yêu cầu nếu làm vậy để lại một luồng
dở dang — vẽ luồng hoàn chỉnh nhỏ nhất.

**Vòng đời dữ liệu (điều 3, 5).** Với MỌI thực thể người dùng tự tạo, cân nhắc đủ: tạo · xem ·
sửa · xoá · xem chi tiết · nhân bản · lưu trữ · khôi phục · lịch sử. Ở Hub, quy tắc này áp cho
**sổ đăng ký Mini App, ghi chú can thiệp, hồ sơ chăm sóc, quyết định duyệt báo cáo** — không áp
cho dữ liệu của một đứa trẻ (không ai được "xoá" một lượt check-in; sửa thì phải để lại vết).
Chỗ nào làm việc theo lô thì phải có: chọn tất cả · chọn nhiều · thao tác hàng loạt · và nói ra
số dòng bị bỏ qua.

**Màn danh sách (điều 4, 19).** Cân nhắc đủ: tìm · lọc · sắp xếp · phân trang · ẩn/hiện cột ·
bảng co theo màn · thao tác trên dòng · thao tác hàng loạt · nhập · xuất · làm mới · thể rỗng ·
đang tải · lỗi · báo thành công · số đang chọn · thanh thao tác dính đáy. Vẽ ở **bốn quy mô**:
10 · 100 · 10.000 · 100.000 dòng. Một lớp 40 em khác một trường 5.000 em, và cùng một màn phải
sống được ở cả hai.

**Biểu mẫu (điều 6).** Kiểm tính hợp lệ · dấu bắt buộc · nhãn rõ · lỗi ngay tại ô · thể vô hiệu ·
thể đang gửi · báo thành công · Huỷ và Lưu · **cảnh báo khi rời trang lúc chưa lưu** · tự đặt con
trỏ đúng ô đầu · thứ tự Tab hợp lý · đi hết được bằng bàn phím.

**Phản hồi (điều 7).** Mọi thao tác phải có phản hồi: đang chạy · xong · hỏng · rỗng · **mất mạng**
· **không có quyền**. Không thất bại im lặng. (Hub đã có luật này cho check-in offline — giữ nguyên
tinh thần đó ở mọi màn.)

**Hình và chữ (điều 8–10, 25–30).** Không viết lời chào, câu động viên, mô tả tính năng, khẩu hiệu.
Một CTA chính mỗi màn, hành động phụ không tranh chỗ. Dùng lại component/khoảng cách/chữ/icon/màu/bo
góc — hai màn giống nhau không được vẽ khác nhau. **Mọi câu trên màn phải giúp ít nhất một trong
bốn: điều hướng · hiểu · quyết định · làm xong việc.** Không thì bỏ. Thay đoạn giải thích bằng bố
cục, phân cấp, nhãn, icon, tương tác tốt hơn.

**Không rò nội tình hệ thống (điều 24, 29).** Không hiện: mã nội bộ, tên cột CSDL, trạng thái API,
thông tin gỡ lỗi, ghi chú của lập trình viên, công thức tính điểm. Người dùng thấy **kết quả**,
không thấy thuật toán. Ví dụ xấu: *"Điểm ≥80 vì chuyên cần chiếm 30%"*. Ví dụ đúng: **"Ổn định"**.

**Kỹ thuật (điều 11–13).** Điện thoại trước, rồi bảng, rồi máy tính, rồi màn rộng. Không cuộn ngang.
Chạm ≥44px. Bàn phím đi hết, có viền focus, ARIA, tương phản, HTML ngữ nghĩa. Ưu tiên cảm giác
nhanh: khung xương khi tải, tải chậm ảnh ngoài màn, ảo hoá danh sách dài.

**Mặc định thông minh và chống nhầm (điều 14–15).** Nhớ bộ lọc lần trước, điền sẵn khi an toàn,
bớt cú bấm và bớt gõ. Hỏi lại trước thao tác không lùi được, khoá thao tác bất khả thi, kiểm trước
khi gửi, đừng để ai mất công đang làm dở.

**Quyền (điều 16).** Vai nào không có quyền thì **ẩn hẳn**, không hiện rồi khoá.

**Thể rỗng (điều 18).** Nói được ba điều: vì sao trống · tạo dữ liệu bằng cách nào · làm gì tiếp.

**Chất lượng xuất xưởng (điều 20).** Không chỗ giữ chỗ, không chữ mẫu, không số liệu bịa, không nút
dở dang, không liên kết chết, không nhãn gỡ lỗi, không huy hiệu trang trí.

---

## 9. BA CHỖ HIẾN PHÁP ĐÁ VỚI LUẬT CỦA TRƯỜNG — và bên nào thắng

Ghi ra để người vẽ khỏi phải đoán, và để nếu sau này có ai hỏi "sao lại làm ngược điều 24" thì có
câu trả lời viết sẵn.

**(a) Điều 24 cấm hiện trạng thái job/cron — nhưng `RULES.md` điều 8 BẮT hiện.**
Buồng lái phải nói ra khi con số đang là số của lượt quét cũ (ví dụ *"số của lần quét 08:54 02-08"*).
→ **Luật trường thắng.** Lý do: bỏ nó đi thì ô "Em cần để ý: 0 — chưa em nào" thành một câu nói dối
đúng lúc bộ quét chết, và người chịu hậu quả là một đứa trẻ không ai để ý tới. Nhưng thi hành theo
đúng tinh thần điều 25: đây **là** thông tin để quyết định (cô có nên tin con số hôm nay không), và
phải ở dạng **một dòng phụ ngắn dưới đúng ô số bị ảnh hưởng**, không phải một dải cảnh báo toàn màn
— chính là điều ADR-030 vừa chốt ngày 06/08/2026.

**(b) Điều 24 cấm "visibility labels" — nhưng ADR-026 BẮT in nhãn "Chỉ thầy cô tâm lý đọc".**
→ **Luật trường thắng.** Đây không phải nhãn kỹ thuật mà là **một lời hứa với một đứa trẻ** ngay tại
chỗ em sắp viết ra điều riêng tư nhất; nó cũng là thứ quyết định em có viết hay không — tức đúng
tiêu chí của điều 30. Nhãn phải in đúng một câu chuẩn, lấy từ hằng số dùng chung, không viết lại.

**(c) Điều 16 nói ẩn hẳn thứ không có quyền — nhưng Hub đang hiện ô mờ "Học tập · GĐ2".**
→ **Chia đôi:** thứ vai đó **không có quyền** thì ẩn hẳn (đúng điều 16). Thứ **cả trường chưa xây**
thì giữ ô mờ kèm nhãn "· sắp" — đó là kỳ vọng, không phải quyền, và người dùng cần biết trường có
định làm hay không. Ô mờ phải có chữ cho trình đọc màn hình ("sắp có, chưa mở"), vì mờ là tín hiệu
cho mắt chứ không cho tai.
