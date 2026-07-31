# Test Plan — [Tên module]

- **Ngày:** YYYY-MM-DD · **Người viết:** qa-agent · **SRS gốc:** danh-cho-may/srs/[file]

## 1. Phạm vi test

## 2. Ca bắt buộc theo hợp đồng (không được bỏ)

| # | Ca | Điều khoản | Cách kiểm |
|---|---|---|---|
| 1 | Mutation gọi 2 lần → 1 bản ghi | §9 | contract test |
| 2 | RLS chiều cho phép (từng role liên quan) | §4 | pgTAP |
| 3 | RLS chiều TỪ CHỐI (role không có quyền bị chặn) | §4 | pgTAP |
| 4 | (nếu chạm dữ liệu cảm xúc) không rò vào báo cáo xếp loại | §5 | pgTAP + grep output |
| 5 | (nếu gọi AI) payload sạch PII | §7 | eval set |

## 3. Ca nghiệp vụ từ SRS

| # | User story | Ca test | Kết quả mong đợi |
|---|---|---|---|

## 4. Ca tải (nếu module có đường nóng)

[k6 script + mục tiêu p95, tham chiếu 05-capacity-ops.md]

## 5. Kết quả chạy

| Ngày | Môi trường | Pass/Fail | Ghi chú |
|---|---|---|---|
