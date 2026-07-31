# tools/jobs — job nền chạy theo lịch

Thư mục này chứa các job **không phải request của người dùng**: chạy theo lịch, không có UI, và mỗi lần chạy phải để lại một dòng trong `ops.job_runs`.

| Job | File | Nhịp | Việc |
|---|---|---|---|
| `emotion_retention` | `run-retention.mjs` | 1 lần/tháng, 03:00 ngày mùng 1 | Tổng hợp `attendance.mood_trends` rồi xoá chi tiết cảm xúc quá 12 tháng (§3, mệnh lệnh 4 CLAUDE.md, Luật 91/2025) |

## `emotion_retention` — xoá chi tiết cảm xúc sau 12 tháng

Lời hứa công khai với phụ huynh: **chi tiết cảm xúc quá 12 tháng bị xoá, chỉ giữ xu hướng.** Trước migration `0031_emotion_retention.sql`, lời hứa này chỉ tồn tại trong comment (`0004:74`, `0020:25`) — không có hàm, không có lịch, không có test nào thi hành nó.

Job xoá hai thứ và **chỉ hai thứ**:

- `attendance.checkins.mood` → `NULL` (dòng check-in vẫn còn: chuyên cần là dữ kiện vận hành, tâm trạng mới là thứ phải quên);
- `attendance.help_requests.note` / `.topic` / `.urgency` → `NULL` (dòng yêu cầu vẫn còn, để còn đếm được tín hiệu E).

Trước khi xoá, `attendance.rollup_mood_trends()` chạy cho từng tháng bị chạm và ghi trung bình + số mẫu vào `attendance.mood_trends`. **Thứ tự này không được đảo**: xoá trước là mất luôn xu hướng, không có đường khôi phục.

### Mốc thời gian được làm tròn LÊN

Mốc mặc định là `current_date - 12 months`, sau đó **làm tròn lên đầu tháng kế tiếp**. Hai lý do, đều nằm trong comment của `0031`:

1. Chỉ xoá **trọn tháng** thì bản tổng hợp luôn tính trên dữ liệu đầy đủ của tháng đó và không bao giờ phải tính lại. Cắt giữa tháng thì lần chạy sau sẽ tính lại trung bình trên phần còn sót và làm hỏng chính con số đã tổng hợp.
2. Làm tròn **lên** (không phải xuống) nên chi tiết giữ lại luôn ≤ 12 tháng. Xoá sớm vài ngày là giữ lời hứa; xoá muộn là vi phạm.

### Chạy

```bash
# Thử trước — chạy thật rồi rollback, in đúng con số của lần chạy thật
DATABASE_URL=postgres://... node tools/jobs/run-retention.mjs --dry-run

# Chạy thật
DATABASE_URL=postgres://... node tools/jobs/run-retention.mjs

# Nạp bù một mốc cũ (chỉ khi đã --dry-run trước)
DATABASE_URL=postgres://... node tools/jobs/run-retention.mjs --cutoff=2025-01-01
```

Chạy lại là **no-op** (§9): tháng đã xoá chi tiết không còn `mood` khác `NULL` nên không có gì để tổng hợp lại, không có gì để xoá thêm. Có test khoá điều này: `packages/core/db/tests/0031_emotion_retention_test.sql`.

### Cắm lịch ở đâu — chọn cron hệ điều hành, không dùng pg_cron

Chọn: **cron của hệ điều hành gọi `node tools/jobs/run-retention.mjs`**.

```cron
# /etc/cron.d/hub-retention — 03:00 ngày mùng 1 hằng tháng
0 3 1 * * hub  cd /opt/hub && DATABASE_URL=... node tools/jobs/run-retention.mjs >> /var/log/hub/retention.log 2>&1
```

Vì sao không phải `pg_cron`:

- `pg_cron` là extension phải cài ở tầng máy chủ database. Hub chạy trên Postgres do nhà cung cấp quản lý (ADR-011/012 giữ quyền đổi nhà cung cấp) — đưa lịch vào extension là buộc một thứ vận hành vào hạ tầng mà ta cố tình giữ khả năng thay.
- Lịch nằm trong repo thì review được như code, và chạy lại bằng tay lúc sự cố là **cùng một lệnh** người ta vừa đọc — không phải nhớ cú pháp `cron.schedule()`.
- Job này chạy 12 lần/năm. Cái giá của việc phụ thuộc thêm một extension không đổi lại được gì.

Đổi lại, phải chấp nhận: **nếu máy chạy cron chết thì job không chạy và không ai biết** — nên nó không được suy ra là "đang ổn". Cách phát hiện nằm ngay bên dưới.

### Kiểm tra sau mỗi lần chạy

```sql
-- 1. Lần chạy gần nhất và kết quả
select started_at, finished_at, status, metrics
  from ops.job_runs
 where job_name = 'emotion_retention'
 order by started_at desc
 limit 3;

-- 2. Câu hỏi nghiệm thu: còn chi tiết nào quá 12 tháng không? Phải bằng 0.
select count(*)
  from attendance.checkins
 where mood is not null
   and occurred_on < date_trunc('month', current_date - interval '12 months');

-- 3. Xoá rồi thì phải còn xu hướng — số này không được về 0 sau khi job chạy
select count(*) from attendance.mood_trends;
```

Một lần chạy hỏng **vẫn để lại dòng `status = 'failed'`** trong `ops.job_runs` kèm thông điệp lỗi: hàm SQL ghi `running` → `success` trong cùng một câu lệnh nên lỗi cuốn theo cả dòng đó, vì vậy `run-retention.mjs` tự ghi lại dòng `failed` ngoài transaction đã hỏng. Không có nhánh này thì một job chết trông y hệt một job chưa tới lịch.

## Ai ghi `ops.source_freshness.last_success_at`

Không phải job — **trigger**, cũng đặt ở `0031`:

| Nguồn | Ghi bởi |
|---|---|
| `attendance` | trigger `AFTER INSERT` trên `attendance.checkins` |
| `evidence` | trigger `AFTER INSERT` trên `evidence.dear_logs` |

Chỉ gắn vào `INSERT`, **cố ý không gắn vào `UPDATE`**: GVCN xác nhận gửi muộn hay chính job retention xoá `mood` đều là `UPDATE` nhưng không phải dữ liệu mới từ nguồn — tính chúng là "tươi" thì băng vàng sẽ tắt nhờ chính việc dọn dẹp, đúng kiểu hỏng im lặng mà ADR-016 nhắm tới.

Bảng chỉ khai **hai** nguồn, đúng bằng số nguồn có người ghi. Ba nguồn `tutor`, `moodle`, `cor` từng được seed ở `0011` đã **gỡ ngày 31/07/2026**: chưa có connector nào ghi chúng, mà `last_success_at IS NULL` được tính là hết tươi một cách có chủ ý, nên `ops.v_stale_sources` báo chúng quá hạn vĩnh viễn và băng vàng trên buồng lái sáng ngay từ ngày đầu. Cảnh báo lúc nào cũng sáng là cảnh báo đã chết — tới hôm connector điểm danh hỏng thật thì không còn ai nhìn băng vàng nữa.

**Luật đi kèm:** nguồn mới chỉ được thêm vào `ops.source_freshness` **trong cùng migration với connector ghi nó**, không sớm hơn. `packages/core/db/tests/0011_source_freshness_test.sql` có một assertion khoá điều này (`tutor`/`moodle`/`cor` không được có mặt trong bảng).
