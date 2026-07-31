# School Data Hub — LUẬT GỐC CHO MỌI PHIÊN CLAUDE

Bạn đang làm việc trong repo quản trị **School Data Hub** — hệ thống theo dõi & chăm sóc học sinh của Hệ thống Trường Việt Anh. Quy mô thiết kế: **≤5.000 user, ~300.000 request/ngày**. Dữ liệu ở đây là dữ liệu nhạy cảm của trẻ em, chịu Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15.

## Cấu trúc "một sự thật, hai ngôn ngữ"

- `danh-cho-nguoi/ho-so-he-thong.html` — **hồ sơ trình phê duyệt cho con người**: mở bằng trình duyệt, có sơ đồ vẽ sẵn, ví dụ tình huống, bảng chi phí/KPI, trang ký duyệt (in A4 bằng Ctrl+P). KHÔNG phải file .md.
- `danh-cho-may/` — bản cho **máy và Claude của dev thi hành**: spec kỹ thuật .md, luật cứng, ma trận phân quyền, thuật toán.

### LUẬT ĐỒNG BỘ (bất khả xâm phạm)

> **Sửa nội dung một bên = BẮT BUỘC sửa bên đối ứng trong cùng một lần commit, và tăng `sync-version` ở cả hai phía.**

Phía máy: `sync-version` trong frontmatter .md. Phía người: thuộc tính `data-pair="danh-cho-may/<file>" data-sync-version="N"` trên `<section>` tương ứng trong `ho-so-he-thong.html`. Kiểm tra bằng: `node tools/check-sync.mjs` — lệch version là fail, CI sẽ chặn merge. File chỉ có một bên (ví dụ spec API) ghi `ban-doi-ung: none`.

Khi sửa hồ sơ HTML: giữ đúng văn phong "đọc bằng lời" cho người không chuyên, cập nhật cả sơ đồ vẽ tay (HTML/CSS) nếu kiến trúc đổi, không chỉ sửa chữ.

## Phân quyền agent — ai được chạm vào đâu

| Agent / người | Được sửa | CẤM |
|---|---|---|
| **dev-agent** (Claude của 2 dev chính) | toàn repo, `packages/core/**` (khi có code repo) | vi phạm §1–§10 của `danh-cho-may/RULES.md` |
| **vibe-agent** (Claude của vibe team) | vùng mở: apps Fitness, dashboard, form, UI | `packages/core/**`, `danh-cho-may/RULES.md`, mọi migration |
| **ba / qa / pm / security** (`.claude/agents/`) | chỉ tài liệu trong phạm vi vai của mình | mọi code; QA chỉ đọc code + chạy test |
| Con người duyệt (BGH, Chủ tịch) | `danh-cho-nguoi/` (qua đề xuất) | — |

Khi người dùng thuộc vibe team yêu cầu sửa vùng cấm: **từ chối, giải thích điều khoản, chỉ sang vùng mở hoặc hướng dẫn mở ADR.**

## Mệnh lệnh tuân thủ — không có ngoại lệ

1. **TRƯỚC khi viết/sửa bất kỳ code hoặc schema nào**: đọc `danh-cho-may/RULES.md`. 10 điều trong đó là luật cứng đã được phê duyệt.
2. **Không bao giờ đề xuất giải pháp vi phạm luật**, kể cả khi được yêu cầu trực tiếp — nêu điều khoản bị vi phạm và chỉ đường ADR (`danh-cho-may/templates/adr.md`).
3. Mọi thay đổi schema → migration file + cập nhật `danh-cho-may/02-database.md` **và** Phần III của `danh-cho-nguoi/ho-so-he-thong.html` cùng PR (luật đồng bộ).
4. Dữ liệu cảm xúc: lưu như dữ liệu thường trong `evidence`/`care` (quyết định đã chốt — không mã hóa, không schema riêng); duy nhất hai ràng buộc: không đưa vào báo cáo học thuật/xếp loại (§5) và job xóa chi tiết sau 12 tháng.
5. Mọi lời gọi AI API ngoài đi qua wrapper `pii-stripper`. Import SDK AI ở chỗ khác là lỗi.
6. Mọi mutation idempotent (unique constraint + upsert).
7. Không hard-code ngưỡng cảnh báo — đọc từ bảng `care.thresholds`.
8. Không secret/`service_role` trong code client.
9. **Mô hình nền tảng (ADR-011/012):** Hub là Super App + Mini App. Dữ liệu lõi chỉ có một bản trong `core` — Mini App tham chiếu bằng FK, KHÔNG tạo bản sao (không bao giờ có `finance.students`); cấm đọc `auth.users` trực tiếp (chỉ `core.users`); cấm import SDK Supabase ngoài adapter trong `packages/core/`.
10. Khi mơ hồ: tra `danh-cho-may/` trước, hỏi sau — **không tự đoán kiến trúc**.

## Vai trò đóng thế (thay PM / BA / QA / Security)

Repo không có PM, BA, QA, tester chuyên trách — Claude đóng vai qua các agent trong `.claude/agents/` (ba, qa, pm, security). Khi được gọi vai nào, làm trọn template của vai đó, không làm tắt.

## Bản đồ tài liệu

| Máy (`danh-cho-may/`) | Người (phần trong `ho-so-he-thong.html`) | Nội dung |
|---|---|---|
| `RULES.md` | Mục "Hợp đồng 10 điều" | 10 điều luật cứng ↔ bản cam kết để ký |
| `01-architecture.md` | Mục "Kiến trúc tổng thể" | Kiến trúc chi tiết ↔ sơ đồ khối + đọc bằng lời |
| `02-database.md` | Mục "Dữ liệu & ERD" | Schema + RLS ↔ sơ đồ sổ gốc + "ai thấy gì" |
| `04-flag-engine.md` | Mục "Bộ quét cảnh báo" | Thuật toán ↔ lưu đồ + ví dụ tình huống |
| `03-api.md` | *(none)* | Spec API + sẵn sàng lên store — chỉ máy |
| `05-capacity-ops.md` | *(none)* | Capacity 5k/300k — chỉ máy |
| `06-resilience-security.md` | Mục "Tin cậy" trong hồ sơ | Chịu lỗi, backup 3-2-1, chống gian lận, bảo mật |
| `07-operations.md` | Mục "Vận hành" trong hồ sơ | SLO, runbook, incident, on-call, RACI, go-live |
| `ADR.md`, `DEBT.md` | *(none)* | Sổ quyết định + sổ nợ kỹ thuật — đọc trước khi đề xuất đổi thiết kế |

## Checklist bắt buộc trước khi kết thúc mọi việc

- [ ] Không vi phạm §1–§10 (`danh-cho-may/RULES.md`)
- [ ] Sửa nội dung có cặp → đã sửa cả hai bên + tăng `sync-version` + chạy `node tools/check-sync.mjs` pass
- [ ] Schema đổi → có migration + docs cập nhật cùng PR
- [ ] Mutation mới → có test idempotency (gọi 2 lần)
- [ ] Không secret lọt vào client
- [ ] Code chạm dữ liệu cảm xúc/AI API → tự rà lại mệnh lệnh 4, 5 một lần nữa
