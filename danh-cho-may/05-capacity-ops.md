---
ban-doi-ung: none
sync-version: 2
---

# Capacity & Ops — thiết kế cho 5.000 user, 300.000 request/ngày

## Sizing

| Chỉ số | Giá trị thiết kế | Ghi chú |
|---|---|---|
| User tối đa | 5.000 (HS + CBGV + tài khoản PH) | hiện tại ~1.000 — headroom 5× |
| Request/ngày | 300.000 | trung bình ~3,5 req/s |
| Đỉnh thực tế | cửa sổ check-in sáng 07:00–07:30 | ~3.000 HS × ~10 call/phiên trong 30 phút ≈ **50–100 req/s** |
| Mục tiêu chịu tải | **300 req/s burst** (3× đỉnh) | một Postgres + pooling là đủ, có đo để chứng minh |
| Dòng ghi/năm | check-in ~1,2M; attendance ~1,2M; tutor events thô 20–50M | tutor events aggregate giờ→ngày trước khi promote |
| Storage/năm | 10–30 GB | không đáng bàn ở Supabase |

**Kết luận:** không đổi kiến trúc so với bản 1.000 user — một monolith, một Postgres vẫn dư sức. Khác biệt duy nhất là bật sẵn các nút vận hành dưới đây từ ngày 1.

**Thiết bị người dùng: điện thoại cá nhân (không laptop, không App Store).** PWA mobile-first, phát hành qua link + QR, cài màn hình chính. Yêu cầu: bundle nhẹ, test trên Android RAM 2–3GB + wifi trường; iPhone dùng Safari "Thêm vào MH chính"; mọi thông báo đẩy đi qua Zalo, không dựa vào push của OS. Nghiệm thu UX check-in: hoàn thành trong 20 giây trên máy Android rẻ nhất mà trường thu thập được.

## Nút vận hành bắt buộc từ ngày 1

1. **Supavisor transaction pooling** cho mọi kết nối tới Postgres từ app runtime (VPS, không còn serverless — ADR-018/019) — tránh cạn connection.
2. **Index theo truy vấn buồng lái** (`flags(owner_id, status)`, `attendance(student_id, date)`…) — review index trong PR migration.
3. **Materialized views cho dashboard BGH/VAAR** — refresh trong cron đêm, không query nặng giờ cao điểm.
4. **PWA cache tĩnh** (assets qua CDN) — chỉ mutation chạm server.
5. **Rate limit per-user** ở middleware tRPC (xem `03-api.md`).
6. **Load test trước vườn ươm:** k6 script giả lập 3.000 check-in/30 phút — nghiệm thu ở p95 < 500ms.

## Khi nào mới phải nghĩ tiếp (ngưỡng theo dõi, chưa phải việc bây giờ)

- p95 mutation > 1s kéo dài → xem index/pooling trước, không đổi kiến trúc.
- Bảng ghi nhiều > 5M dòng → bật partition theo năm học (thiết kế sẵn trong `02-database.md`).
- > 10.000 user hoặc > 1M req/ngày → lúc đó mới bàn read replica.

## Vận hành

| Hạng mục | Chọn |
|---|---|
| Môi trường | `dev` → `staging` → `prod` (3 Supabase project); migration qua staging trước |
| Backup | Backup hằng ngày mặc định của Supabase Pro + pg_dump hằng tuần ra ổ cứng tại trường (ADR-019, chi tiết `06-resilience-security.md`) — dữ liệu 12 năm của trẻ không được mất |
| Giám sát | Sentry (lỗi) + `ops_heartbeats` (connector chết → data champion thấy ngay) + đo p95 |
| Bảo mật | audit log cho care team & admin; kiểm toán thuê ngoài trước vườn ươm |

## Lộ trình 6 tuần đầu (dev)

| Tuần | Việc | Cổng nghiệm thu |
|:-:|---|---|
| 1 | Monorepo, CI đủ cổng §1–§10, CODEOWNERS, 3 môi trường | PR mẫu vi phạm từng điều đều bị chặn — **luật chạy trước code** |
| 2 | Migration đợt 1: `core` + `id_mappings` + RLS căn bản; nhập danh sách thật | pgTAP pass; tra một em ra đúng lớp/cơ sở/GVCN |
| 3–4 | check-in cảm xúc + PWA; CBGV tự check-in 1 tuần | k6: 3.000 check-in/30 phút, p95<500ms, 0 bản ghi đôi |
| 5 | Flag engine + thresholds + buồng lái v0 | fixture 20 HS mẫu chạy đúng; leo thang 7 ngày hoạt động |
| 6 | Connector Tutor → staging → promote; heartbeat | KPI "dữ liệu chảy tự động ≥80%" đo được |
