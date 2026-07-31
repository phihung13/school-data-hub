---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 7
---

# Flag Engine — spec thuật toán

Chạy `pg_cron` 01:00 mỗi đêm. Toàn bộ là SQL if-then — không ML (quyết định đã chốt, đổi phải qua ADR).

## Bảng ngưỡng (§6)

```
care.thresholds (rule_code text PK, params jsonb, active bool, updated_by uuid, updated_at timestamptz)
──────────────────────────────────────────────────────────────
A_ATTENDANCE   {"window_days": 30, "min_rate": 0.90}
B_BEHAVIOR     {"window_days": 30, "max_incidents": 2}
C_MASTERY      {"strands": 2, "weeks": 2}
C_CEFR         {"periods_below_trajectory": 2}
E_MOOD         {"negative_days_streak": 5}
E_URGENT       {"help_request": true, "tutor_minutes_drop_pct": 60}
```

Sửa ngưỡng qua `admin.updateThreshold` (có audit log) — không deploy, không sửa code.

## Thuật toán (pseudocode — bản lưu đồ cho người duyệt ở file đối ứng)

```
run(as_of_date, mode = live | backfill):
  stale = sources_past_max_age()           -- đọc ops.source_freshness
  job.degraded_sources = stale             -- buồng lái đọc cột này để hiện băng vàng

for each active_student:
  signals = evaluate(A, B, C, E)           -- E đọc mood như dữ liệu thường; cờ chỉ ghi loại tín hiệu
             .excluding_rules_depending_on(stale)   -- im lặng KHÔNG phải tin tốt
  if signals.empty: continue
  upsert_flags(student, signals, as_of_date, origin = mode)
  if mode == backfill: continue            -- chỉ vào lịch sử: không mở ca, không leo thang
  case = find_open_care_case(student, within 30d)
  if case:  merge_flags(case, signals)     -- một em một đầu mối
  else:
    case = create_care_case(signals)
    owner = homeroom_teacher(student)
    if open_cases(owner) >= 5: owner = cluster_counselor(student)  -- định mức
    assign(case, owner)

if mode == live:
  for each open_flag where age > 7d and no_action:
    escalate_to_care_team(flag)            -- chốt chặn "đo rồi để đó"
else:
  notify_care_team_summary(job)            -- MỘT bản tóm tắt đợt nạp bù, không phải N ca
```

## Sáu hành vi cố định (logic, không phải ngưỡng — đổi phải qua ADR)

1. **Gộp cờ:** nhiều cờ/30 ngày = một `care_case`, một điều phối. **Không re-assign owner khi merge:** owner chỉ gán một lần lúc `create_care_case`; case đã có chủ (kể cả đã chuyển tâm lý cụm) giữ nguyên chủ ở mọi lần chạy sau, chỉ `merge_flags` gắn thêm cờ.
2. **Định mức GVCN:** tối đa 5 hồ sơ Tầng 2 đồng thời; tràn → tâm lý cụm.
3. **Leo thang 7 ngày:** cờ không hành động tự đẩy lên care team.
4. **Cờ E gọn:** chỉ ghi loại tín hiệu, không sao chép nội dung tâm sự vào cờ.
5. **Nguồn hết tươi thì bỏ qua rule, không kết luận "ổn"** (ADR-016, 27/07/2026). Mỗi signal view khai `max_age` trong `ops.source_freshness`; quá hạn → rule phụ thuộc nguồn đó bị loại khỏi lần chạy, ghi vào `ops.job_runs.degraded_sources`, buồng lái hiện băng vàng *"Hôm nay thiếu dữ liệu &lt;nguồn&gt;, bảng này chưa đầy đủ"*. Đây là mở rộng của luật "không suy tin tốt từ im lặng" từ mức job xuống mức từng nguồn tín hiệu — connector Tutor chết 3 ngày mà buồng lái vẫn xanh là hỏng im lặng đúng nghĩa.
6. **Nạp bù không được gây báo động hàng loạt** (ADR-016). Cờ mang `origin` = `live` | `backfill`. Nhánh `backfill` chỉ ghi `care.flags` để tra cứu lịch sử: KHÔNG tạo `care_cases`, KHÔNG vào hàng đợi leo thang 7 ngày, chỉ gửi care team một bản tóm tắt đợt nạp. Không có luật này thì một lần promote 3 tháng dữ liệu cũ sẽ mở vài trăm hồ sơ can thiệp giả trong một đêm.

## Đầu ra

`care.flags` → buồng lái GVCN fetch khi mở (không Realtime — ADR-010), kèm dòng freshness "Quét đêm qua: HH:mm". Ngôn ngữ hướng HS/PH luôn Glow & Grow — từ vựng "cờ/ngưỡng/nguy cơ" chỉ trong buồng lái nội bộ.

## Test bắt buộc

- Fixture 20 học sinh mẫu phủ cả 6 rule + ca gộp + ca leo thang + ca định mức.
- Test khẳng định engine đọc ngưỡng từ bảng (đổi param trong test → kết quả đổi theo).
- Test: output cờ không chứa cột nội dung tâm sự.
- **Test nguồn hết tươi:** đẩy `ops.source_freshness` của một nguồn quá hạn → rule phụ thuộc nguồn đó không sinh cờ, `degraded_sources` chứa tên nguồn, và job vẫn `complete` (không fail cả lần chạy).
- **Test nạp bù:** promote 90 ngày dữ liệu lịch sử → sinh cờ `origin='backfill'` nhưng **0 `care_cases` mới** và **0 lượt leo thang**.

## Rev B — chống coupling ngầm và hỏng im lặng

- **Signal views:** engine CHỈ đọc qua `care.v_signal_*` (attendance_rate, behavior_count, mastery_drop, cefr_gap, mood_streak, help_request). Views là hợp đồng giữa các domain và engine; migration đổi bảng gốc phải sửa view cùng PR; fixture 20 HS trong CI bắt gãy ngay.
- **Idempotent:** cờ UNIQUE `(student_id, rule_code, as_of_date)` — chạy lại trong đêm là no-op.
- **Không suy tin tốt từ im lặng:** mỗi lần chạy ghi `ops.job_runs` (tên chuẩn duy nhất — trước 27/07/2026 ba tài liệu gọi ba tên khác nhau: `ops.job_runs`, `ops.ops_job_runs`, `care.ops_job_runs`; đã thống nhất về `ops.job_runs`). Buồng lái luôn hiển thị "Quét đêm qua: HH:mm ✓"; trễ >26h = SEV2 tự động (xem 07-operations RB-02). Buồng lái trống + không có dòng trạng thái = hệ hỏng, không phải "lớp ổn".
- Race định mức 5 hồ sơ giữa engine đêm và tạo case tay: `SELECT ... FOR UPDATE` trên quota người điều phối.
