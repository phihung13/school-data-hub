---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 4
---

# Bảng kê cấu hình hạ tầng cần trang bị

Tài liệu này biến "Hạ tầng và triển khai" (11) từ mô tả kiến trúc thành **bảng kê để đi mua**: cần đúng thứ gì, cấu hình bao nhiêu, số lượng bao nhiêu, mua đợt nào. **Không ghi giá** — giá do bộ phận mua sắm hỏi báo giá tại thời điểm ký.

**Chốt đơn giản nhất — 28/07/2026 (ADR-019).** Sau khi cân nhắc, chọn phương án ít mảnh ghép nhất: **1 VPS mạnh** chạy toàn bộ ứng dụng (không chia nhiều máy, không load balancer, không Kubernetes) + **Supabase Pro** lo CSDL/Auth/Storage + **GitHub** giữ mã nguồn + backup 2 lớp đơn giản (không PITR, không kho trung gian R2). Đổi lại một số cấu hình vượt xa số đo tải thực tế — chấp nhận có chủ đích để không phải động vào hạ tầng lần nữa trong nhiều năm tới, xem lý do ở §4b.

## 0. Điều kiện tiên quyết — chốt trước khi đặt mua

| Điều kiện | Vì sao chặn |
|---|---|
| **Thẻ thanh toán quốc tế đứng tên trường** (visa/mastercard doanh nghiệp) | Toàn bộ là dịch vụ thuê theo tháng của nhà cung cấp nước ngoài. Không được dùng thẻ cá nhân dev — vi phạm nguyên tắc "tài khoản hạ tầng đứng tên tổ chức" (MD-06). Mua qua đại lý = tài khoản đứng tên đại lý |
| **Email hạ tầng của tổ chức** (vd `hatang@truongvietanh.com`) làm owner mọi tài khoản | Dev nghỉ việc không được kéo theo quyền sở hữu hệ thống. Bật MFA, khóa khôi phục cất két |
| **Kết luận data residency trong DPIA** | Luật 91/2025 + Nghị định 13. Nếu buộc lưu trong nước thì đổi nhà cung cấp — xem §5 |
| **Người biết vận hành Linux cơ bản** (SSH, systemd/PM2, Nginx, gia hạn TLS) | App chạy trên VPS tự quản, không nền tảng quản lý sẵn (ADR-018/019) — không còn ai "bấm nút deploy" hộ nữa. Nếu 2 dev chưa quen, dành nửa ngày dựng script deploy mẫu trước khi tính vào lộ trình |

## 1. Đợt 1 — trang bị ngay, để tuần 1 có chỗ làm việc

Mức tối thiểu để dựng 3 môi trường và bật CI làm cổng chặn §1–§10. Chưa có dữ liệu thật của trẻ ở giai đoạn này.

| # | Hạng mục | Cấu hình cần | SL | Vì sao đúng mức này |
|:-:|---|---|:-:|---|
| 1 | **Máy chủ CSDL — chạy thật (production)** | Supabase Pro · PostgreSQL 15+ · Compute tier mặc định (2 nhân chia sẻ · 2 GB RAM) · 8 GB đĩa · pooling giao dịch (Supavisor) · sao lưu hằng ngày giữ 7 ngày · 250 GB băng thông/tháng | 1 | Không mua thêm compute tier cao hơn mặc định — tải thiết kế (3,5 req/s trung bình) chưa chạm tới mức cần nâng. Nâng chỉ khi k6 không đạt (xem dòng dự phòng §2) |
| 2 | **Máy chủ CSDL — tập dượt (staging)** | PostgreSQL cùng phiên bản · compute nhỏ nhất · 8 GB đĩa | 1 | Chỉ chạy migration + smoke test, không có người dùng thật |
| 3 | **Môi trường dev** | Chạy local trên máy lập trình viên (Docker) — **không thuê** | 0 | Không trả tiền cho môi trường không ai truy cập từ xa |
| 4 | **VPS chạy ứng dụng — 1 máy duy nhất** <span>(tự quản, thay Vercel — ADR-018/019)</span> | 1 VPS dedicated · **16 vCPU · 32 GB RAM** · SSD ≥100 GB · Ubuntu LTS · Node.js 20+ chạy qua PM2 (giữ tiến trình sống, auto-restart khi crash) · Nginx làm reverse proxy + cache tài sản tĩnh · Let's Encrypt (chứng chỉ TLS tự gia hạn) · script CI tự deploy (build → rsync/scp → restart PM2 → health check) + **rollback về bản trước bằng một lệnh** | 1 | **Chốt đơn giản nhất:** một máy duy nhất, không chia nhiều VPS, không load balancer, không Kubernetes — khớp kiến trúc modular monolith (1 deployable). Cấu hình 16 vCPU/32GB vượt xa tải đo được (3,5 req/s trung bình, đỉnh 50–100 req/s) — đây là lựa chọn có chủ đích đổi lấy việc **không phải quay lại nâng cấp hạ tầng này trong nhiều năm**, xem đánh đổi ở §4b |
| 5 | **Kho mã nguồn + CI** | GitHub, repo private · **CODEOWNERS + required review + branch protection** · ≥2.000 phút CI/tháng · **4 tài khoản** (2 dev lõi + 2 vibe) | 1 | Bản miễn phí **không** cho CODEOWNERS trên repo private. Không có nó thì §1–§10 chỉ là lời hứa, không phải cổng chặn |
| 6 | **Lá chắn cổng vào (edge)** | Cloudflare · DNS + CDN + **WAF** + chống DDoS + HSTS + chứng chỉ TLS | 1 | Bản miễn phí của Cloudflare đã đủ mức này. Chỉ nâng khi có tấn công thật |
| 7 | **Két giữ bí mật (secret manager)** | **5 tài khoản** · nhật ký ai xem gì · chia sẻ theo nhóm · MFA bắt buộc | 1 | §8 cấm secret trong mã nguồn — phải có chỗ cất hợp lệ có audit |
| 8 | **Theo dõi lỗi** | ≥5.000 lỗi/tháng (bản miễn phí đủ cho giai đoạn thử) | 1 | Nâng ở đợt 2 khi chạy thật |
| 9 | **Canh sống/chết + cảnh báo** | Kiểm mỗi 1–5 phút · cảnh báo qua email + Zalo · trang trạng thái | 1 | Đo SLO "buồng lái sẵn sàng trước 06:30" |
| 10 | **Tên miền** | 1 tên miền + DNS | 1 | Kiểm tra trước — trường có thể đã có |

**Thiết bị vật lý mua một lần:**

| Hạng mục | Cấu hình cần | SL | Vì sao |
|---|---|:-:|---|
| Ổ cứng ngoài | **2 TB · USB 3.0** · có vỏ chống sốc | 2 | **Bản sao duy nhất nằm ngoài Supabase** (§4) — luân phiên tuần chẵn/lẻ, một cái luôn nằm trong két. Quan trọng hơn trước vì không còn lớp R2 trung gian |
| Điện thoại thử nghiệm | **Android 11+ · RAM 3 GB · màn 6.5"** — máy giá rẻ, cố ý chọn máy yếu | 2 | Nghiệm thu "check-in xong trong 20 giây trên máy rẻ nhất trường có". Không có máy thật thì cổng này không đo được |
| iPhone thử nghiệm | iOS 15+ (máy cũ được) | 1 | PWA trên iOS đi đường Safari "Thêm vào MH chính" — hành vi khác Android, phải thử thật |
| Hộp chống ẩm / két nhỏ | Có khóa | 1 | Chỗ cất ổ cứng backup |

## 2. Đợt 2 — trang bị trước khi dữ liệu thật của học sinh vào hệ (mốc ~29/08)

| # | Hạng mục | Cấu hình cần | Vì sao |
|:-:|---|---|---|
| 11 | **Theo dõi lỗi — bản trả phí** | **≥50.000 lỗi/tháng** · giữ 90 ngày · gắn được release · cảnh báo theo ngưỡng | Hạn mức 5.000 lỗi hết trong tuần đầu khi 800 máy cùng dùng |
| 12 | **Kênh Zalo tới phụ huynh** | Zalo OA **đã xác thực doanh nghiệp** · template tin theo mẫu đã duyệt · năng lực **~32.000 tin/năm** (800 PH × 1 tin/tuần × 40 tuần) · ưu tiên gửi qua UID | Bản tin gộp một lần/tuần/phụ huynh như thiết kế. Gửi qua UID rẻ hơn gửi qua số điện thoại |
| 13 | **Kiểm toán bảo mật thuê ngoài** | Phạm vi: web app + API + cấu hình RLS · có **retest sau khi sửa** · báo cáo bàn giao được cho rà soát pháp lý | Hồ sơ đã cam kết. **Đặt lịch trước 2–3 tuần** — việc gấp nhất hiện nay |
| 14 | *Dự phòng, chỉ khi cần:* **nâng compute tier CSDL** | Lên 1 bậc (compute tier kế tiếp) | **Chỉ nâng nếu** k6 không đạt p95 < 500ms sau khi đã sửa index. Không nâng trước — nguyên tắc "không mua sẵn năng lực chưa dùng". (VPS ứng dụng đã cố tình dư tải nên hiếm khi là nút thắt) |

## 3. Đợt 3 — theo lượng dùng, bắt buộc có trần

| # | Hạng mục | Cấu hình cần | Ghi chú |
|:-:|---|---|---|
| 15 | **AI API** | Model nhỏ cho việc nhẹ · **hạn mức trần theo tháng cấu hình được** · cảnh báo ở 80% trần · có DPA với nhà cung cấp | §5: mọi lời gọi qua `pii-stripper`. Trần tháng là điều kiện đã ghi trong hồ sơ AI |
| 16 | **Máy chủ Moodle** | **2 vCPU · 4 GB RAM · 80 GB SSD** · PHP 8.1+ · MySQL/MariaDB riêng | Kiểm tra trước: trường có thể đã có máy chủ Moodle đang chạy |
| 17 | **Dự phòng vượt định mức** | Băng thông, dung lượng đĩa, số người dùng hoạt động | Thiết kế dự tính 10–30 GB/năm — nằm gọn trong định mức, khó dùng tới |

## 4. Backup — đã chốt 2 lớp đơn giản, không PITR, không R2 (ADR-019, sửa ADR-006)

**Đã chốt, không còn là quyết định mở:**

1. **Lớp 1 — backup hằng ngày mặc định của Supabase Pro** (không mua thêm PITR). Giữ khoảng 7 ngày, quản lý tự động trong Supabase.
2. **Lớp 2 — pg_dump hằng tuần, mã hóa (age/gpg), chép trực tiếp vào ổ cứng vật lý tại trường** theo ADR-006. Không qua kho trung gian (Cloudflare R2/Backblaze B2) — bỏ bước đó để giảm một dịch vụ phải quản lý.

**Hệ quả về RPO — phải nói rõ, không được im lặng:**

| Loại sự cố | RPO trước đây (có PITR + R2) | RPO sau khi chốt đơn giản |
|---|---|---|
| Lỗi trong Supabase (xóa nhầm, migration hỏng) | ~phút (PITR) | **≤ 24h** (backup hằng ngày mặc định) |
| Thảm họa cấp nhà cung cấp (mất tài khoản, Supabase biến mất) | ≤ 24h (dump đêm ở R2) | **≤ 7 ngày** (bản pg_dump tuần là bản độc lập duy nhất) |

Đây là đánh đổi có chủ đích: ưu tiên đơn giản/ít dịch vụ phải vận hành hơn RPO tối ưu. **Đã ghi vào `DEBT.md` #18** và phải báo lại BGH — đây là thay đổi so với con số đã từng viết trong hồ sơ trình duyệt trước đó.

**Cải thiện rẻ, không cần hạ tầng mới (tùy chọn, chưa quyết):** có thể chạy `pg_dump` mã hóa **hằng ngày** lên chính VPS ứng dụng (đã dư ổ đĩa) thay vì chỉ hằng tuần, và chỉ mang ra ổ cứng vật lý mỗi tuần — khi đó RPO cấp "mất tài khoản Supabase" giảm xuống còn ≤24h mà không tốn thêm tiền. Không nằm trong "chốt đơn giản nhất" hiện tại nhưng đáng cân nhắc nếu BGH thấy 7 ngày là rủi ro cao.

## 4b. Đánh đổi đã chọn — 1 VPS mạnh, tự quản, thay Vercel (ADR-018/019)

**Đã chốt:** ứng dụng chạy trên **một** VPS dedicated 16 vCPU/32 GB RAM, tự quản, không dùng nền tảng quản lý sẵn (Vercel), không nhiều VPS, không load balancer, không Kubernetes. CSDL/Auth/Storage **vẫn ở Supabase**, không đổi — quyết định này chỉ chạm phần "nơi chạy ứng dụng", không đụng ADR-011/012.

| | 1 VPS mạnh, tự quản (đã chọn) | Nền tảng quản lý sẵn (không chọn) |
|---|---|---|
| Chi phí máy | tùy nhà cung cấp — không chắc rẻ hơn ở mức 16 vCPU/32GB, nhưng **giá cố định, không tính theo lượt/ghế** | trả theo lượt dùng + số ghế, tăng dần theo thời gian |
| Deploy | script CI tự viết (build → chuyển file → restart) | tự động, không cấu hình |
| CDN / cache tĩnh | tự cấu hình qua Nginx/Cloudflare | có sẵn |
| Auto-scale | không có — nhưng kiến trúc là 1 deployable/monolith, và máy đã dư tải rất nhiều nên gần như không bao giờ cần | có sẵn |
| Vá bảo mật hệ điều hành | 2 dev tự làm | nhà cung cấp lo |
| Rollback | script tự viết, phải test trước khi cần dùng thật | một chạm có sẵn |

**Vì sao chấp nhận đánh đổi:** ưu tiên **đơn giản và ổn định lâu dài** hơn tối ưu chi phí sát nhất. Một máy đủ mạnh để không phải quay lại bàn chuyện scale, thêm máy, hay load balancer trong nhiều năm — đổi lại phần khó (CSDL, Auth, Storage) vẫn ở Supabase quản lý sẵn, chỉ tự quản phần dễ hơn (một tiến trình Node.js). Rủi ro đổi lại: **script deploy/rollback phải viết và test kỹ trước go-live**, không được để lần đầu chạy thật là lần đầu thử; và cấu hình 16 vCPU/32GB là over-provision có chủ đích so với tải đo được — không phải sai sót, đã ghi rõ lý do ở đây để không ai hiểu nhầm là tính sai.

## 5. Rủi ro pháp lý có thể đảo toàn bộ bảng kê

Nhà cung cấp CSDL đang chọn **không có region Việt Nam**; gần nhất là Singapore. Nếu DPIA kết luận dữ liệu trẻ em phải lưu trong nước:

- Phương án B: nhà cung cấp trong nước (VNG Cloud / Viettel Cloud) + **tự dựng PostgreSQL, tự lo Auth và Storage**.
- Vì VPS ứng dụng đã có sẵn nhiều tài nguyên dư (16 vCPU/32GB), có thể cân nhắc chạy Postgres tự dựng ngay trên máy đó thay vì thuê thêm máy riêng — tiết kiệm chi phí, đổi lại một sự cố có thể kéo cả hai (mất tách bạch). Quyết định này để lúc cần, không quyết trước.
- Hệ quả nếu tách máy riêng cho Postgres: **thêm ~3 tuần công dev** và tăng gánh vận hành thường trực (tự lo backup, không còn Supabase Pro backup mặc định).
- Kiến trúc đã chuẩn bị sẵn (adapter tập trung trong `packages/core/`) nên **không phải viết lại nghiệp vụ** — nhưng thời gian thì không có chỗ bù.

**Vì vậy: chốt data residency trước khi ký hợp đồng năm. Trong lúc chờ, thuê theo tháng, không mua gói năm trả trước.**

## 6. Checklist trang bị (đánh dấu khi xong)

- [ ] Thẻ thanh toán quốc tế đứng tên trường đã có
- [ ] Email `hatang@…` tạo xong, bật MFA, khóa khôi phục cất két
- [ ] Mọi tài khoản owner = email tổ chức, **không** email cá nhân dev
- [ ] CSDL: chọn region, tạo 2 project (prod, staging) trên Supabase Pro, **không** bật thêm PITR
- [ ] VPS: đặt đúng 16 vCPU/32 GB RAM, cài PM2 + Nginx + Let's Encrypt
- [ ] Kho mã nguồn: bật CODEOWNERS + required review + branch protection trên `main`, kiểm bằng một PR mẫu cố tình vi phạm §1
- [ ] Két bí mật: nạp toàn bộ secret, xóa mọi secret còn nằm trong `.env` chia sẻ qua chat
- [ ] Đặt lịch kiểm toán bảo mật (cần trước 2–3 tuần) — **việc gấp nhất, không đợi code xong**
- [ ] Zalo OA: xác thực doanh nghiệp, đăng ký template, nạp lần đầu
- [ ] Đặt trần tháng cho AI API + cảnh báo 80%
- [ ] Thuê theo tháng cho tới khi DPIA chốt data residency
- [ ] Viết và **test thật** script deploy + rollback trên VPS trước khi có dữ liệu học sinh (không thử lần đầu lúc go-live)
- [ ] Viết script pg_dump hằng tuần + mã hóa age/gpg + quy trình chép ra ổ cứng tại trường; **test phục hồi thử** trước go-live
- [ ] Xác nhận `DEBT.md` #18 (RPO 24h/7 ngày) đã báo cho BGH, không chỉ ghi trong sổ nợ mà không ai biết
