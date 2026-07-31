---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 4
---

# Resilience & Security — chịu lỗi, backup đơn giản 2 lớp, chống gian lận, hardening

Nguyên tắc gốc: tách bạch hai loại rủi ro. **Downtime** (tạm ngưng vài phút–vài giờ) là chấp nhận được và có kịch bản; **mất dữ liệu** là KHÔNG chấp nhận được ở bất kỳ mức nào. Mọi quyết định dưới đây tối ưu cho vế thứ hai trước.

## 1. Mục tiêu đo được

| Chỉ tiêu | Giá trị | Nghĩa |
|---|---|---|
| RPO — lỗi trong Supabase (xóa nhầm, migration hỏng) | ≤ 24h (backup hằng ngày mặc định của Supabase Pro) | Không mua PITR — quyết định chốt 28/07/2026 (ADR-019), xem đánh đổi ở `10-mua-sam-ha-tang.md` §4 |
| RPO — thảm họa cấp nhà cung cấp (mất tài khoản, Supabase biến mất) | ≤ 7 ngày (bản pg_dump tuần trên ổ cứng trường là bản độc lập duy nhất) | Tụt so với thiết kế trước đây (từng là ≤24h nhờ có lớp R2); đã ghi `DEBT.md` #18 và báo BGH |
| RTO (thời gian dựng lại hệ) | ≤ 4 giờ | có diễn tập đo thật, không ước chừng |
| Downtime chấp nhận được | ≤ vài giờ/lần, lớp học không dừng | nhờ chế độ suy giảm có kiểm soát (mục 3) |

## 2. Backup — 2 lớp đơn giản (chốt 28/07/2026, ADR-019, sửa ADR-006)

**Đã bỏ so với thiết kế trước:** PITR (point-in-time recovery) và lớp kho trung gian ngoài nhà cung cấp (Cloudflare R2/Backblaze B2). Lý do: ưu tiên đơn giản — ít dịch vụ phải quản lý với 2 dev — hơn là RPO tối ưu nhất có thể mua được. Đây là quyết định có chủ đích, không phải bỏ sót.

1. **Lớp 1 — backup hằng ngày mặc định của Supabase Pro.** Không cấu hình thêm, không mua add-on. Giữ khoảng 7 ngày, quản lý tự động trong Supabase — lo sự cố xóa nhầm, migration hỏng, miễn là phát hiện trong vòng một ngày.
2. **Lớp 2 — pg_dump hằng tuần, chép trực tiếp vào ổ cứng vật lý tại trường**, cất két. File dump **mã hóa bằng age/gpg, khóa do trường giữ** (backup chứa toàn bộ dữ liệu nên bắt buộc mã hóa file, độc lập với quyết định không mã hóa trong DB). Đây là bản chống kịch bản "nhà cung cấp bốc hơi / khóa tài khoản / thiên tai vùng" — và bây giờ là **bản độc lập duy nhất** ngoài Supabase, không còn lớp R2 đứng giữa.

**Luật vàng: backup chưa từng restore thử = chưa có backup.** Diễn tập phục hồi **mỗi quý**: restore dump mới nhất (từ ổ cứng trường) vào một Postgres trống, chạy smoke test (đếm học sinh, mở buồng lái), đo thời gian, ghi biên bản. Trượt diễn tập = sự cố mức cao, xử trước mọi feature.

**Cải thiện rẻ, chưa quyết:** có thể chạy pg_dump mã hóa hằng ngày lên VPS ứng dụng (đã dư ổ đĩa) rồi mỗi tuần mới mang ra ổ cứng vật lý — giảm RPO cấp "mất Supabase" xuống ≤24h mà không tốn thêm hạ tầng. Chưa nằm trong quyết định đã chốt, để ngỏ nếu BGH thấy 7 ngày là rủi ro cao.

## 3. Ma trận sự cố — hệ phản ứng thế nào

| Sự cố | Hệ phản ứng | Mất gì |
|---|---|---|
| Mất wifi/mạng tại lớp | PWA xếp hàng check-in offline (IndexedDB), tự gửi lại khi có mạng — an toàn nhờ §9 idempotent | không mất gì |
| Supabase down vài giờ | check-in offline queue; lớp học tiếp tục; bộ quét đêm chạy bù khi DB trở lại; bản tin Zalo lùi giờ gửi | không mất gì, chỉ trễ |
| Supabase down nhiều ngày | kích hoạt kịch bản restore: backup hằng ngày Supabase → Postgres dự phòng (VPS bất kỳ), đổi connection string qua env | RTO ≤ 4h, RPO ≤ 24h |
| Nhà cung cấp mất sạch dữ liệu / khóa tài khoản | restore từ bản pg_dump tuần trên ổ cứng trường — bản độc lập duy nhất | RTO ≤ 4h, RPO ≤ 7 ngày |
| Connector chết ngầm | `ops_heartbeats` báo đỏ cho data champion trong ngày | không mất (nguồn còn giữ) |
| Dữ liệu ngoài bẩn/lệch mã | chặn ở staging (§8), vào `import_errors` chờ người xử | không lây vào core |
| Migration hỏng trên prod | migration bắt buộc qua staging trước (§2); tệ nhất restore từ backup hằng ngày Supabase | ≤ 24h |
| GVCN quên xử lý cờ | tự leo thang 7 ngày lên care team | không em nào bị rơi |
| Trường mất điện / sự cố toàn diện | fallback phi kỹ thuật đã ghi trong hồ sơ: bảng 4 màu + điểm danh giấy, nhập bù sau | văn hóa không chờ hạ tầng |

## 4. Thoát vendor — vì sao đây KHÔNG phải bom nổ chậm

- Toàn bộ dữ liệu là **Postgres chuẩn mở** — `pg_dump` mang đi bất cứ đâu (Supabase khác, RDS, VPS tự host). Cấm dùng tính năng độc quyền của nhà cung cấp ngoài Postgres chuẩn + RLS + pg_cron (đều là Postgres/extension mở).
- App là Next.js + tRPC chuẩn, chạy trên VPS tự quản (ADR-018/019) — vẫn deploy được sang Vercel/Cloud Run/Docker khác nếu cần, không khóa chặt vào một cách host.
- Kịch bản chuyển nhà cung cấp = restore dump + đổi 3 biến env. Với dữ liệu 10–30 GB: nửa ngày. **Lưu ý:** bản dump gần nhất có thể cũ tới 7 ngày (mục 2) — kịch bản này được diễn tập chung với restore drill quý để biết chính xác mất bao nhiêu.
- "Quả bom" thật sự chỉ tồn tại khi: (a) dữ liệu có một bản duy nhất trong tay một vendor, hoặc (b) code dính chặt tính năng độc quyền. Kiến trúc này cấm cả hai bằng văn bản.

## 5. Chống gian lận check-in / điểm danh

Check-in cảm xúc là tự khai — gian lận không phá được gì. **Điểm danh (chuyên cần)** mới cần chống gian lận:

1. **Server-side kiểm nguồn mạng:** bảng `core.school_networks` chứa IP WAN của từng cơ sở; request điểm danh chỉ được tính `on_campus=true` khi source IP khớp — **server kiểm, client không tự khai được**.
2. **Khung giờ:** điểm danh chỉ tính trong cửa sổ cấu hình (vd 06:45–07:30) theo cơ sở.
3. **Check-in ngoài trường vẫn nhận** (giá trị chăm sóc) nhưng gắn nhãn `off_campus`, KHÔNG tính chuyên cần, hiện rõ trên buồng lái.
4. **GVCN xác nhận danh sách lệch** (5 giây, đã có trong nhịp vận hành) — chốt chặn con người.
5. **Nâng cấp có sẵn thiết kế (bật khi cần): QR động trong lớp** — mã HMAC(classroom_id, time_bucket_30s) chiếu/dán trong phòng, đổi mỗi 30 giây; quét mới được tính điểm danh → chứng minh "ở trong phòng này". Chống nhờ-bạn-bấm-hộ tốt hơn IP.
6. **Giới hạn nói thẳng (đã ghi từ bản Final):** mọi điểm danh tự phục vụ chứng minh *thiết-bị-ở-trường*, không chứng minh *em-ngồi-trong-lớp*. Không kỹ thuật hóa thêm (GPS, camera, sinh trắc buộc) — xâm phạm, trái Hiến chương điều 2. Chốt cuối là con người.

## 6. Bảo mật nhiều lớp (defense in depth)

| Lớp | Biện pháp |
|---|---|
| Biên | Toàn bộ sau Cloudflare: WAF, chống DDoS, ẩn IP gốc; HTTPS + HSTS bắt buộc; security headers (CSP, X-Frame-Options, nosniff) |
| Đăng nhập | **MFA bắt buộc cho mọi tài khoản CBGV/admin** và cho Supabase dashboard/GitHub của dev; khóa tạm sau N lần sai; phiên hết hạn hợp lý; HS dùng tài khoản trường cấp |
| Ứng dụng | Zod validate mọi input; rate limit per-user; không secret ở client (§4); upload (nếu có) kiểm type + size |
| Dữ liệu | RLS từng dòng (§4–§5): một tài khoản bị chiếm chỉ lộ đúng phạm vi tài khoản đó — **blast radius nhỏ theo thiết kế**; audit log cho truy cập care/y tế/admin |
| Backup | dump mã hóa, khóa trường giữ (mục 2) |
| Con người | rủi ro số 1 của trường học là phishing lấy mật khẩu giáo viên → MFA + 30 phút tập huấn nhận diện lừa đảo trong tuần tập huấn |
| Quy trình | secret-scan + dependency-scan (npm audit/Dependabot) trong CI; cập nhật vá định kỳ; **pentest thuê ngoài trước vườn ươm và trước khi lên store** |

## 7. Cổng phát hành — "đủ tin tưởng" là danh sách đo được, không phải cảm giác

Chưa pass đủ bảng này thì chưa phát hành (thêm vào cổng nghiệm thu tuần 6 và trước mọi lần mở rộng):

- [ ] pgTAP toàn ma trận RLS: mọi ô, cả chiều cho phép lẫn từ chối
- [ ] Test leo quyền: lấy token học sinh thử gọi API của GVCN/admin → toàn bộ bị chặn
- [ ] Contract test idempotency (§9) pass toàn bộ mutation
- [ ] Secret scan sạch trên repo + client bundle
- [ ] Load test k6: 3.000 check-in/30 phút, p95 < 500ms
- [ ] Restore drill: khôi phục từ dump tuần (ổ cứng trường) về Postgres trống < 4h, smoke test pass
- [ ] Pentest bên thứ ba: không còn phát hiện mức cao/nghiêm trọng chưa xử
- [ ] Kiểm chống gian lận: check-in từ mạng ngoài không tính chuyên cần; QR động (nếu bật) không dùng lại được mã cũ

## 8. Bổ sung Rev B/C

- **`queued_late`:** bản check-in sync muộn (offline queue gửi lại ngoài khung giờ) KHÔNG tự tính chuyên cần, KHÔNG tự loại — vào danh sách lệch cho GVCN xác nhận. Không tin timestamp do client khai.
- **Giám sát backup:** thiếu dump tuần đúng hạn (quá 8 ngày chưa có bản pg_dump mới trên ổ cứng trường) = báo động cho on-call (không đợi tới drill quý mới phát hiện).
- **Hỏng im lặng:** freshness "Quét đêm qua: HH:mm" bắt buộc trên buồng lái (chi tiết ở 04-flag-engine).
- **IP WAN cơ sở đổi** là sự cố vận hành thường gặp: xem RB-03 trong 07-operations — data champion tự xử qua màn hình admin `school_networks`, không cần dev.
- SLO theo khung giờ nghiệp vụ + SEV matrix + on-call: xem `07-operations.md`.
