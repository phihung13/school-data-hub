# Migrations — quy ước đánh số và phụ thuộc

Đặt tên `NNNN_mo_ta.sql` (§2). Chạy theo thứ tự số, một chiều, qua CI — **cấm sửa tay trên dashboard staging/prod**.

## Dải số

| File | Nội dung |
|---|---|
| `0001` | Schema theo domain · vai trò database (`connector`, `reporting`, `backup_reader`) · hàm ngữ cảnh — **chỗ duy nhất trong toàn hệ chạm tới định danh của nhà cung cấp auth** (ADR-012) |
| `0002` | Core identity: mạng trường → cơ sở → lớp · người dùng · học sinh · ghi danh (chống chồng lấn thời gian) |
| `0003` | Giáo viên · phụ huynh · phân công lớp (một lớp một GVCN) · vai trò có phạm vi · sổ đối chiếu mã ngoài · sinh alias cho app ngoài |
| `0004` | `attendance` — check-in cảm xúc + điểm danh + `queued_late` (ADR-007) |
| `0005` | `care` — ngưỡng, cờ, hồ sơ can thiệp, leo thang, ghi chú tư vấn |
| `0006` | `evidence` — 25 hành vi, PDR, DEAR, rubric, fitness, CLB, khảo sát |
| `0007` | `tutor` (ảnh chụp chỉ-đọc) + `health` (ADR-009) |
| `0008` | `staging` (§8, connector chỉ INSERT) + `ops` (job_runs, heartbeats, outbox, audit) |
| `0009` | **Ma trận RLS** + hàm phạm vi + signal views (ADR-010) + tường lửa §5 |
| `0010` | `core.identity_links` — sổ đăng nhập tách khỏi sổ dữ liệu (ADR-016) |
| `0011` | `ops.source_freshness` + `degraded_sources` — không suy tin tốt từ im lặng (ADR-016) |
| `0012` | `care.flags.origin` — nạp bù không gây báo động hàng loạt (ADR-016) |
| `0013` | `core.parent_invite_codes` + `redeem_parent_invite_code()` — mã mời đăng nhập phụ huynh cho `apps/hub` GĐ1 (28/07/2026) |
| `0014` | Đường ghi GĐ1: RLS + GRANT insert/update cho `attendance.checkins` (tự check-in, GVCN xác nhận gửi muộn), `attendance.help_requests`, `care.care_cases`, `care.interventions` — 0001-0012 chỉ có chiều đọc |
| `0015` | `core.v_my_scopes` — view tự tra "tôi có vai trò gì, lớp nào" (an toàn: WHERE tự khóa theo `current_user_id()`), cần cho buồng lái GVCN biết đúng lớp mình |
| `0016` | RLS + GRANT cho `core.parents`/`core.parent_students` (trước đó KHÔNG có gì cả — chặn hoàn toàn) — phụ huynh tự tra "con mình là ai". Phát hiện khi chạy thật báo cáo Trưởng thành cho phụ huynh |
| `0017` | Policy UPDATE cho `attendance.checkins` để tự sửa mood trong ngày (0014 chỉ có policy GVCN xác nhận gửi muộn) — phát hiện khi chạy thật `submitMood` lần 2 trong ngày (ON CONFLICT DO UPDATE) |
| `0018` | `core.promote_embedded_event(raw_id)` — promote() cho `staging.raw_embedded_events`, chạy ngay theo sự kiện (ADR-017 mục 1.2/4.3). Demo Đường B đầu tiên chạy thật đầu-cuối: DEAR log → `evidence.dear_logs`, qua `apps/hub/app/api/embed/webhook` + `apps/test-external-app` (29/07/2026). Không map được alias → `staging.import_errors` |

## Đã kiểm chứng trên PostgreSQL thật

Ngày 29/07/2026, PostgreSQL 16 + pgTAP: **18 migration chạy sạch theo thứ tự · 16 file test, ~150 assertion xanh** (chạy qua Docker, không phải mô phỏng). `0013`–`0018` được viết và kiểm chứng trong cùng phiên xây `apps/hub` GĐ1 — 2 trong số đó (`0016`, `0017`) là lỗ hổng/thiếu sót thật do 0001–0012 chưa từng chạy cùng một ứng dụng thật gọi tới; `0018` được kiểm chứng đầu-cuối qua webhook thật (idempotent: bắn lại cùng payload trả `already_promoted`, không tạo dòng đôi).

Yêu cầu phiên bản: **PostgreSQL 15 trở lên** (`UNIQUE NULLS NOT DISTINCT` ở `0003`).

## Chạy cục bộ

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=hub_test -p 5432:5432 postgres:16
docker exec pg bash -c "apt-get update -qq && apt-get install -y -qq postgresql-16-pgtap"
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hub_test ./tools/run-db-tests.sh
```

## Kiểm tra bắt buộc trước khi merge (§2, `02-database.md`)

- Mỗi bảng mới có RLS policy **và** pgTAP test cả chiều cho phép lẫn chiều từ chối → `packages/core/db/tests/`. `tools/schema-lint.mjs` chặn migration tạo bảng mà không có test cùng số.
- Thay đổi phá tương thích đi theo expand–contract (thêm mới → chuyển dần → gỡ cũ).
- Migration kèm cập nhật `danh-cho-may/02-database.md`; nếu đổi cấu trúc có ý nghĩa nghiệp vụ thì cập nhật cả `danh-cho-nguoi/ho-so-he-thong.html` và tăng `sync-version` hai phía (luật đồng bộ).
