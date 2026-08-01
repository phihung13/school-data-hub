---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 4
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
| RB-08 | Migration hỏng prod → **đọc `node tools/migrate/migrate.mjs status` TRƯỚC khi động vào backup** (từ 02/08/2026 một migration hỏng không để lại đối tượng nào và không để lại dòng sổ nào — nó chạy trong một transaction thật, xem RB-11); chỉ khi schema đã lệch thật mới restore từ backup hằng ngày Supabase. Rồi truy vì sao lọt staging | SEV1 |
| RB-09 | `import_errors` > 500/nguồn → dừng connector nguồn đó, sửa mapping, promote lại (idempotent, an toàn) | SEV3 |
| RB-10 | Mất quyền tài khoản hạ tầng → khôi phục qua chủ sở hữu tổ chức (MD-06) | SEV1 |
| RB-11 | **Áp migration lên máy chủ thật** — xem mục 4b | SEV3 (kế hoạch) / SEV1 (nếu hỏng giữa chừng, về RB-08) |
| RB-12 | **Chạy bộ kiểm thử cơ sở dữ liệu** (pgTAP + vitest) — xem mục 4c | — |

*Ghi chú sửa 02/08/2026:* RB-08 trước đây viết "PITR về trước thời điểm chạy". **PITR đã bị bỏ từ 28/07/2026** (ADR-019, `06-resilience-security.md` mục 2), nên câu đó chỉ một đường không tồn tại — đúng loại runbook làm người trực lúc 2 giờ sáng đi tìm một cái nút không có trên màn hình.

## 4b. RB-11 — áp migration lên máy chủ thật (từ 02/08/2026)

Bộ chạy: `tools/migrate/migrate.mjs`; sổ: `ops.schema_migrations` (`0050`). Tài liệu đầy đủ `tools/migrate/README.md`, thiết kế và bẫy đã gặp ở `02-database.md` mục đợt F.

| Bước | Lệnh | Tiêu chí xong |
|---|---|---|
| 1. Hỏi trước, đừng áp trước | `node tools/migrate/migrate.mjs status --url=<prod>` | Mã thoát **0**. Mã thoát **1** = lệch băm hoặc mất file ⇒ **DỪNG**, không áp gì; đây là ca "file đã áp mà nội dung trên đĩa đã đổi", xử bằng cách truy commit chứ không bằng cách chạy tiếp |
| 2. Database đã sống mà sổ trống | `node tools/migrate/migrate.mjs baseline --to=NNNN --ghi-chu="..."` | Đúng N dòng `nhan_no = true`. `up` sẽ **tự từ chối** và chỉ sang đây, nên đừng ép; `baseline` cũng tự từ chối trên database rỗng |
| 3. Xem trước | `node tools/migrate/migrate.mjs up --dry-run` | Danh sách file sắp áp đọc bằng mắt, khớp với PR |
| 4. Áp | `node tools/migrate/migrate.mjs up` | Mỗi file + dòng sổ của nó nằm trong **cùng một transaction**; hỏng giữa chừng thì không đối tượng nào ở lại, không dòng sổ nào ở lại, và `ops.job_runs` ghi `failed` |
| 5. Hậu kiểm | `status` lần nữa | "N/N file đã ở trong sổ" |

Ba điều phải nhớ, vì cả ba đã cắn thật một lần: (a) **sổ trống không có nghĩa là chưa áp gì** — trên `hub_dev` có 49 file đã áp bằng tay trước khi có sổ; (b) migration **không** được khai vào `ops.job_schedule` (nó không có nhịp; khai vào đó là bật một cảnh báo "quá hạn" sáng mỗi ngày, và cảnh báo lúc nào cũng sáng là cảnh báo đã chết); (c) mọi migration phải giữ hình dạng `begin;` … `commit;` — bộ chạy chèn câu ghi sổ vào ngay trước `commit;` của chính file và **từ chối file lạ**; file buộc phải chạy ngoài transaction thì khai tường minh bằng `-- migrate:khong-transaction`.

## 4c. RB-12 — chạy bộ kiểm thử cơ sở dữ liệu (từ 02/08/2026)

**Bộ kiểm thử có database riêng.** `hub_test`, dựng lại từ đúng bộ migration + đúng `seed.mjs`; `DATABASE_URL` của mọi lượt test tự đổi tên sang nó. `tools/run-db-tests.sh` **từ chối chạy** nếu tên database không dạng `_test`. Trước 02/08/2026 bộ test viết chung sổ `ops.job_runs` với vận hành, nên `ops.v_job_health` và dải "Quét đêm qua" trên buồng lái được nuôi bằng dấu chân của bài test — đo được: MỘT lượt `vitest run` đẩy `ops.job_runs` trên `hub_dev` từ 446 lên 451. Sau khi tách: 0 → 0 và sequence đứng yên, trong khi sequence của `hub_test` chạy 1 → 20.

```bash
# CI (đã cắm trong .github/workflows/ci.yml)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hub_test ./tools/run-db-tests.sh

# Máy dev Windows: không có psql trên PATH, Postgres nằm trong container
HUB_PSQL="docker exec -i pg_hub psql" \
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hub_pgtap_test \
bash tools/run-db-tests.sh
#   ↑ host trong DATABASE_URL là góc nhìn của CONTAINER (5432), không phải cổng 5434 đã publish

# Chốt mốc mới sau khi CỐ Ý bớt assertion (phải gõ tay, không tự động)
HUB_TAP_KET_QUA=/tmp/tap.tsv ... bash tools/run-db-tests.sh
node tools/pgtap-plan-check.mjs --ket-qua /tmp/tap.tsv --cap-nhat
```

`vitest` không cần lệnh chuẩn bị nào: `DATABASE_URL=…/hub_dev npx vitest run` vẫn gõ như cũ, database test tự dựng (nguội 3,5 s một lần; ấm 80–90 ms nhờ dấu vân băm nội dung migrations + seed).

**Mốc `tools/pgtap-moc.tsv` là bánh cóc:** ghi `plan` của **từng file** (hiện: **832 assertion / 49 file**). Viết thêm assertion thì mốc tự nâng và thành một diff trong PR; viết bớt thì cổng đỏ và hạ mốc phải gõ `--cap-nhat` ra tay. Câu "mọi nghiệm thu lịch job phải chạy trên database sạch" từ nay **có cổng máy cưỡng chế**, không còn là một dòng dặn dò.

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
8. Vận hành: runbook đầy đủ · M1–M3 nạp sẵn · kênh báo động bắn thử · **RB-11 đã chạy thật một lượt trên máy chủ đích** (`migrate.mjs status` mã thoát 0, sổ `ops.schema_migrations` khớp số file trong kho) — *SRE-role*

## 8. Kế hoạch rút lui

Chạm tiêu chí dừng giữa học kỳ: (1) hệ chuyển chỉ-đọc, lớp về quy trình giấy trong 1 ngày (đã tập); (2) xuất toàn bộ dữ liệu bàn giao hiệu trưởng; (3) dữ liệu cảm xúc xử lý theo Hiến chương; (4) postmortem toàn dự án trước khi bàn làm lại. Kịch bản rút lui được diễn tập trên giấy trong buổi tập huấn.
