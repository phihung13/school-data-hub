---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 3
---

# Operations — SLO, Runbook, Incident, On-call, RACI, Go-live (Rev C)

## 1. SLO theo khung giờ nghiệp vụ

| SLO | Chỉ tiêu | Đo |
|---|---|---|
| Cửa sổ check-in 06:45–07:30 ngày học | ≥99% lượt thành công (kể cả offline queue) | log mutation + queue |
| Buồng lái sẵn sàng trước 06:30 | ≥99% ngày học | uptime monitor + freshness |
| Quét đêm xong trước 06:00 | 100%; trễ = SEV2 tự động | `ops.job_runs` |
| Nguồn tín hiệu còn tươi | mọi nguồn trong hạn `max_age`; quá hạn = băng vàng trên buồng lái, không phải im lặng (ADR-016) | `ops.source_freshness` + `ops.job_runs.degraded_sources` |
| Ngoài giờ học | 99,0% | monitor |
| Bản tin Zalo | đúng lịch ±24h | outbox |

Luật bảo trì: việc có kế hoạch chỉ làm sau 19:00 hoặc cuối tuần. CẤM deploy 06:00–08:00 ngày học.

## 2. Incident Response

| Mức | Định nghĩa | Phản ứng | Thông báo |
|---|---|---|---|
| SEV1 | mất dịch vụ giờ học, nghi lộ dữ liệu, mất dữ liệu | on-call ≤15 phút, cập nhật mỗi 30 phút | Chủ tịch + hiệu trưởng + nhóm GVCN (mẫu M1) |
| SEV2 | suy giảm chức năng chính ngoài giờ vàng | ≤2 giờ | nhóm vận hành + data champion |
| SEV3 | lỗi cục bộ có đường vòng | ≤1 ngày làm việc | ticket |

Mẫu thông báo M1 (gián đoạn, ngôn ngữ không kỹ thuật), M2 (khôi phục), M3 (sự cố dữ liệu cá nhân — pháp lý duyệt trước, theo nghĩa vụ Luật 91/2025). Postmortem không đổ lỗi trong 72h cho mọi SEV1/SEV2 (dòng thời gian, nguyên nhân gốc, việc sửa có hạn chót).

## 3. On-call

Dev 1 / dev 2 luân phiên tuần (tên người: MD-04, khóa trong go-live checklist). Giờ nóng: ngày học 06:00–18:00; ngoài giờ chỉ SEV1. Đầu mối không kỹ thuật: data champion cơ sở nhận báo từ GVCN, phân loại SEV, gọi on-call. Kênh báo động: uptime monitor + `/api/health` bắn vào nhóm Zalo vận hành.

## 4. Runbook — 10 kịch bản (viết đầy đủ tuần 5–6; mỗi RB phải có: dấu hiệu, bước, tiêu chí xong, mẫu thông báo, hậu kiểm)

| RB | Kịch bản | Mức |
|---|---|---|
| RB-01 | Supabase down trong cửa sổ check-in → mẫu M1, fallback bảng 4 màu, hệ tự bù qua queue | SEV1 |
| RB-02 | Quét đêm trễ/hỏng → chạy lại tay; 30 phút không xong: công bố buồng lái không có cờ mới hôm nay | SEV2 |
| RB-03 | IP WAN cơ sở đổi → điểm danh thành off-campus hàng loạt → data champion cập nhật `school_networks` qua màn hình admin | SEV3 |
| RB-04 | Connector chết (heartbeat đỏ) → restart, kiểm `import_errors`; nguồn còn giữ, chỉ trễ | SEV3 |
| RB-05 | Nghi lộ tài khoản CBGV → khóa, audit log phạm vi đọc, đổi mật khẩu, mẫu M3 nếu chạm dữ liệu HS | SEV1 |
| RB-06 | Restore khẩn theo kịch bản drill | SEV1 |
| RB-07 | Zalo OA lỗi/khóa → bản tin lùi (SLO ±24h), kênh dự phòng qua GVCN | SEV3 |
| RB-08 | Migration hỏng prod → PITR về trước thời điểm chạy, truy vì sao lọt staging | SEV1 |
| RB-09 | `import_errors` > 500/nguồn → dừng connector nguồn đó, sửa mapping, promote lại (idempotent, an toàn) | SEV3 |
| RB-10 | Mất quyền tài khoản hạ tầng → khôi phục qua chủ sở hữu tổ chức (MD-06) | SEV1 |

## 5. Drill

**Drill 0 (bắt buộc trước vườn ươm, tuần 6):** (a) xác nhận dump đêm trên R2 + ổ trường; báo động "thiếu dump >26h" hoạt động; (b) restore dump mới nhất vào Postgres trống, smoke test 10 điểm, đo thời gian so RTO 4h, ký biên bản. Sau đó mỗi quý trong "ngày bảo trì quý" (gộp cập nhật dependency; major upgrade chỉ trong hè).

## 6. RACI (mỗi quy trình đúng một A)

| Quy trình | R | A | C | I |
|---|---|---|---|---|
| Sự cố SEV1 | on-call dev | dev trưởng | SRE-role | Chủ tịch, hiệu trưởng |
| Đổi ngưỡng cờ | admin học vụ | hiệu trưởng cơ sở | tâm lý cụm | GVCN |
| Thêm trường dữ liệu | dev | Hội đồng dữ liệu | pháp lý (nếu nhạy cảm) | toàn hệ |
| Restore / drill | dev 1 | dev trưởng | — | Chủ tịch |
| Cấp/reset tài khoản HS | GVCN | hiệu trưởng cơ sở | dev khi lỗi hệ | phụ huynh |
| Đồng thuận & quyền xóa | văn phòng cơ sở | đầu mối pháp lý | dev | Hội đồng dữ liệu |
| Nới quyền xem dữ liệu nhạy cảm (y tế, tư vấn) | dev (thi hành) | Hội đồng dữ liệu (qua ADR) | pháp lý | tâm lý cụm |
| Tu chính Hiến chương / ADR | người đề xuất | Chủ tịch + Hội đồng | dev trưởng | toàn hệ |

## 7. Go-live checklist (vào vườn ươm — đủ 8 nhóm, có chữ ký từng dòng)

1. Kỹ thuật: pgTAP 2 chiều · contract test idempotency · secret scan · k6 3.000 check-in/30 phút p95<500ms · freshness/health chạy — *dev trưởng ký*
2. Chống gian lận: off-campus không tính chuyên cần · queued_late vào danh sách lệch — *QA-role*
3. An toàn dữ liệu: Drill 0 pass, biên bản có số đo RTO — *dev trưởng*
4. Bảo mật: pentest 0 finding cao chưa xử · MFA 100% CBGV/admin — *pháp lý + dev*
5. Pháp lý: DPIA (gồm MD-02 residency) · đồng thuận kép đủ · mẫu M3 duyệt — *đầu mối pháp lý*
6. Quản trị: MD-01 quy trình tài khoản + màn hình GVCN reset · MD-03 nội quy điện thoại · MD-04 tên người trực · MD-06 tài khoản hạ tầng tên tổ chức — *Chủ tịch*
7. Con người: GVCN tập huấn + tự check-in 1 tuần · data champion nắm RB-03/04 · bảng 4 màu in sẵn — *hiệu trưởng*
8. Vận hành: runbook đầy đủ · M1–M3 nạp sẵn · kênh báo động bắn thử — *SRE-role*

## 8. Kế hoạch rút lui

Chạm tiêu chí dừng giữa học kỳ: (1) hệ chuyển chỉ-đọc, lớp về quy trình giấy trong 1 ngày (đã tập); (2) xuất toàn bộ dữ liệu bàn giao hiệu trưởng; (3) dữ liệu cảm xúc xử lý theo Hiến chương; (4) postmortem toàn dự án trước khi bàn làm lại. Kịch bản rút lui được diễn tập trên giấy trong buổi tập huấn.
