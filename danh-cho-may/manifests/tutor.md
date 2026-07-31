---
ban-doi-ung: none
sync-version: 1
---

# App Manifest — Tutor (theo `08-embedded-apps.md` mục 4)

**Trạng thái: Đề xuất — chờ Hội đồng dữ liệu duyệt. Không code phần session-exchange/handshake thật cho tới khi duyệt.**

| Trường | Giá trị |
|---|---|
| Tên app | Tutor |
| Nền tảng xây | Code tay, tự host (Supabase riêng + edge functions) |
| Domain nguồn | **[cần điền — domain thật để đo `curl -sI`]** |
| Kết quả đo `curl -I` | **[chưa đo — bắt buộc đo trước khi duyệt, không đoán]** |
| Tier | Tier 2 (giả định — Tutor xác nhận sẽ set `frame-ancestors` cho phép nhúng; cần đo lại để chốt) |
| Owner | **[tên dev Tutor]** + 1 dev bảo trợ phía Hub |
| Đăng ký OIDC RP | Có — RP thứ hai sau Moodle, `sub = core.users.id`, khớp tài khoản qua `core.id_mappings(system='tutor', ...)` |
| Quyền Embed API | **[cần xác nhận]** — nếu Tutor chỉ cần đăng nhập + đọc/ghi qua connector sẵn có (`staging.raw_tutor_events` → `promote()`), có thể chưa cần Embed API mới; chỉ xin thêm nếu có thao tác ghi trực tiếp trong phiên (vd cập nhật tiến độ real-time) |
| Dữ liệu chạm tới | `tutor` (mastery_snapshots, cefr_results...) qua connector hiện có; không `care`/`health` |

## Việc cần làm trước khi trình duyệt

1. Đo Tier thật trên domain Tutor (`curl -sI <domain> | grep -i "x-frame-options\|content-security-policy"`).
2. Xác nhận Tutor cần Embed API mới hay dùng nguyên connector `staging.raw_tutor_events` đã có.
3. 2 dev chính đăng ký Tutor làm RP thứ hai trong config OIDC (PR chạm `packages/core/**`, cần 2 chữ ký — §10).
4. Nộp bản này cho Hội đồng dữ liệu — chỉ sau khi duyệt mới bắt tay viết code exchange thật phía Tutor.

## Cam kết

| Vai trò | Tên | Ngày | Kết luận |
|---|---|---|---|
| Owner app (Tutor) | | | |
| Dev bảo trợ (Hub) | | | |
| Hội đồng dữ liệu | | | |
