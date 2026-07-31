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
| `0019` | `ops.embedded_app_events` — cổng nhận CHUNG cho sự kiện rổ Xanh từ app nhúng ngoài. Cố ý KHÔNG FK `core.students` (rổ Xanh = không gắn định danh học sinh) |
| `0020` | `attendance.help_requests.topic/urgency/note` + `core.v_my_homeroom_teacher` — V5 "Cần gặp thầy cô" ghi được nội dung, không chỉ "đã bấm nút" |
| `0021` | `core.v_my_guardians` — V8 Báo cáo Trưởng thành: em tự tra "gửi cho ai" (chỉ tên + quan hệ, KHÔNG có trạng thái đã đọc — chưa có bảng theo dõi đọc, không bịa) |
| `0022` | `core.v_my_homeroom_teacher` bỏ hậu tố `"(GVCN 6A1)"` khỏi tên hiển thị — sửa một chỗ ở view thay vì lặp regex ở từng màn hình |
| `0023` | Hàng rào chống lệch trên `core.user_role_scopes` vai `homeroom` — **nửa đầu** của việc chốt một nguồn sự thật "GVCN ↔ lớp" (nửa sau: `0030`) |
| `0024` | Bịt 3 lỗ RLS (`care_case_flags`, `ops.embedded_app_events`, `attendance.checkin_rules`) + `security_invoker` cho mọi view + `ops.rls_exemptions`/`ops.v_rls_gaps` — đổi từ danh sách viết tay sang hỏi chính database |
| `0025` | Thu GRANT `attendance.checkins` theo CỘT + trigger gác `status`/`confirmed_by` — bịt lỗ leo quyền: học sinh tự duyệt bản gửi muộn của chính mình |
| `0026` | Nền dữ liệu cho router `care` viết lại: `care.rules`, `thresholds` đổi khóa (ngưỡng theo từng cơ sở), `care.resolve_threshold()`, `client_mutation_id`, `v_signal_emotion` thêm `negative_streak` (E_MOOD = 5 ngày LIÊN TIẾP) |
| `0027` | **ADR-007 được cài đặt thật:** `attendance.resolve_checkin()` + `client_id` + một bộ luật hiệu lực mỗi cơ sở. Trước đó khung giờ và dải IP nằm trong bảng mà không chỗ nào đọc tới |
| `0028` | Siết Đường B: `promote()` không ném lỗi ra ngoài, nhánh lỗi idempotent, cửa vào chạy đúng vai `connector`, `core.issue_embed_alias_for_user()` |
| `0029` | Hiệu năng nền của lớp phân quyền: `core.begin_user_context()` có cache + 5 index đường nóng. Không đổi một dòng ngữ nghĩa phân quyền nào |
| `0030` | **Nửa sau nguồn sự thật GVCN:** 3 view suy từ `core.class_assignments`, trigger dọn rác bản sao, `ops.v_homeroom_drift` phơi phần lệch còn lại |
| `0031` | Thi hành lời hứa công khai §3: `rollup_mood_trends()` + `purge_old_emotion_details()`; `ops.mark_source_fresh()` (băng vàng "nguồn quá hạn" trước đó bật vĩnh viễn); `core.touch_updated_at()` |
| `0032` | Đường ghi cho 4 màn hình GVCN: policy điểm danh hộ + `report.growth_report_approvals` (sổ duyệt Báo cáo Trưởng thành) |
| `0033` | Vòng đời tài khoản: `core.anonymize_user()` + chính sách `ON DELETE` nhất quán + trigger chặn xóa cứng có thông điệp tiếng Việt (Luật 91/2025) |
| `0034` | `health.read_logs()` + thu GRANT cột `category`/`detail` — thi hành thật tuyên bố "mọi lượt đọc y tế đều ghi audit", rồi viết lại tuyên bố cho đúng phạm vi làm được |

## Đã kiểm chứng trên PostgreSQL thật

Ngày 31/07/2026, PostgreSQL 16 + pgTAP: **34 migration chạy sạch theo thứ tự · 32/32 file test xanh · 358 assertion** trên database dựng lại từ đầu (Docker, không phải mô phỏng). Đo bằng chính `tools/run-db-tests.sh`, không phải bằng cách cộng các con số ghi rải rác trong tài liệu.

Mốc trước đó: 29/07/2026 — 18 migration · 16 file test · ~150 assertion. `0013`–`0018` được viết và kiểm chứng trong cùng phiên xây `apps/hub` GĐ1; 2 trong số đó (`0016`, `0017`) là lỗ hổng thật do `0001`–`0012` chưa từng chạy cùng một ứng dụng thật gọi tới. `0023`–`0034` là đợt rà toàn hệ thống trước go-live: phần lớn không phải thêm tính năng mà là **cài đặt thật những kiểm soát đã được tuyên bố mà chưa tồn tại** — xem cột ghi chú ở bảng trên.

Yêu cầu phiên bản: **PostgreSQL 15 trở lên** (`UNIQUE NULLS NOT DISTINCT` ở `0003`).

## Đánh số: hai cái bẫy đã sập thật

1. **Số phải duy nhất, và "số trống" ghi trong một bản giao việc có thể đã bị lấp.** Ngày 31/07/2026 có lúc tồn tại đồng thời `0030_gvcn_screens.sql` và `0030_homeroom_source.sql` do hai luồng làm việc song song, mỗi bên đọc cùng một bảng số trống cũ. `tools/schema-lint.mjs` nay chặn trùng số. Trước khi đặt tên file: `ls` thư mục này một lần, đừng tin danh sách trong đầu bài.
2. **Không sửa migration đã chạy** (§2) — kể cả để "vá cho gọn". Lỗi của `0009` được vá bằng `0024`, không bằng cách mở lại `0009`. Chưa có bảng ghi nhận migration đã chạy nên hôm nay không có gì bắt được việc sửa lén một file cũ (`DEBT.md` #23).

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
