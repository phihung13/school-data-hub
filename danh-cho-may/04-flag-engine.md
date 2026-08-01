---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 10
---

# Flag Engine — spec thuật toán

Toàn bộ là SQL if-then — không ML (quyết định đã chốt, đổi phải qua ADR).

**Ai gọi nó, tính tới 31/07/2026** (sửa câu cũ "chạy `pg_cron` 01:00 mỗi đêm" — câu đó mô tả một
thứ chưa bao giờ tồn tại): thuật toán nằm trong hàm `care.run_flag_engine(as_of date, mode text)`
(`0039`), và người gọi là bộ lịch job chung — `tools/jobs/run-all.mjs` đọc bảng `ops.job_schedule`
(`0041`), thấy dòng `flag_engine` tới lượt thì sinh `tools/jobs/run-flag-engine.mjs`. Không dùng
`pg_cron`: extension đó phải bật ở tầng nhà cung cấp, và lúc sự cố thì một lịch nằm trong database
là thứ không ai gỡ ra đọc được bằng `git log`. Cắm Task Scheduler/cron **mỗi giờ**, không phải mỗi
đêm — `ops.job_due()` gác nên chạy 24 lượt/ngày vẫn chỉ ra một lần chạy thật (§9), đổi lại một đêm
máy tắt được bù ở lượt kế thay vì mất trọn một chu kỳ. Chi tiết vận hành: `tools/jobs/README.md`.

## Bảng ngưỡng (§6)

```
care.rules       (rule_code text PK, label, source_key → ops.source_freshness, …)
care.thresholds  (id uuid PK, rule_code → care.rules, school_id uuid NULL, params jsonb,
                  active bool, updated_by uuid, updated_at timestamptz)
                  UNIQUE NULLS NOT DISTINCT (rule_code, school_id)
──────────────────────────────────────────────────────────────
A_ATTENDANCE   {"window_days": 30, "min_rate": 0.90}
B_BEHAVIOR     {"window_days": 30, "max_incidents": 2}
C_MASTERY      {"strands": 2, "weeks": 2}
C_CEFR         {"periods_below_trajectory": 2}
E_MOOD         {"negative_days_streak": 5, "mode": "streak"}
E_URGENT       {"help_request": true, "tutor_minutes_drop_pct": 60}
```

Ba điểm đã đổi so với bản đầu, đều do migration thật, đừng đọc bảng trên như bản gốc bất biến:

1. **Ngưỡng khai được theo TỪNG CƠ SỞ** (`0026`). Khóa chính không còn là `rule_code`; `school_id`
   NULL nghĩa là dòng mặc định toàn hệ. Engine luôn đọc qua `care.resolve_threshold(rule_code,
   school_id)` — hàm tự lấy dòng riêng của cơ sở, không có thì rơi về dòng mặc định. Không truy
   vấn thẳng `care.thresholds` ở bất kỳ đâu.
2. **`E_MOOD.mode`** (`0026`, ADR-023): `"streak"` (mặc định) = 5 ngày mood xấu **liên tiếp**;
   `"window"` = 5 ngày bất kỳ trong cửa sổ. Tên tham số `negative_days_streak` từng ngụ ý liên
   tiếp trong khi view đếm ngày bất kỳ — hai cách đếm cho ra hai tập học sinh khác nhau và không
   ai từng chọn. Nay chọn rồi, và chọn bằng một câu UPDATE chứ không bằng một lần deploy.
   `care.v_signal_emotion` khai cả hai cột `negative_days` và `negative_streak` để đổi `mode`
   không phải sửa view.
3. **`care.rules.source_key`** (`0039`) khai mỗi luật sống nhờ nguồn nào, FK về
   `ops.source_freshness`. Đây là thứ làm hành vi cố định số 5 bên dưới thi hành được: không có
   cột này thì "nguồn hết tươi thì bỏ qua rule" chỉ là một mảng tên viết chết trong hàm, và ngày
   connector mới ra đời sẽ không ai đi tìm nó.

Sửa ngưỡng qua `admin.updateThreshold` (có audit log) — không deploy, không sửa code. **Chưa cài**:
router `admin` chưa tồn tại (`03-api.md`), nên hôm nay đổi ngưỡng vẫn là một câu UPDATE chạy tay.

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

## Đã cài đặt thật tới đâu (`0039`, 31/07/2026)

Mục này tồn tại vì một spec không nói rõ phần nào đã chạy thì đọc y như một spec đã chạy hết.

| Phần của spec | Trạng thái | Ghi chú |
|---|---|---|
| `care.run_flag_engine(as_of, mode)` | ✅ chạy | Toàn bộ thuật toán trong MỘT transaction: job chết giữa chừng không để lại nửa hồ sơ can thiệp |
| A_ATTENDANCE · B_BEHAVIOR · C_MASTERY · E_MOOD · E_URGENT | ✅ chạy | Đọc **chỉ** qua `care.v_signal_*` (ADR-010) |
| C_CEFR | ⛔ chưa, **và cố ý chưa** (rà lại 01/08/2026) | Chưa có signal view nào cho lộ trình CEFR. Engine bỏ qua với lý do `chua_cai_dat`, nay **đọc được bằng mắt** qua `ops.v_rule_health` (`0043`) chứ không chỉ nằm trong JSON metrics.<br>Đã cân lại chuyện "dựng cho đủ bộ" và **quyết định KHÔNG**, có phép đo: khai `ops.source_freshness('tutor_cefr')` lúc này không đổi được một chữ nào trong `rules_skipped` (nhánh `c_implemented` của `0039` chặn trước nhánh `source_key`), nó chỉ thêm `tutor_cefr` vào `degraded_sources` **mọi lượt chạy, vĩnh viễn** — đúng cái đèn vàng mà `0011` vừa gỡ ngày 31/07. Còn dựng `care.v_signal_cefr` trên hai bảng rỗng thì 0 dòng đọc y hệt "không em nào lệch lộ trình" (hỏng im lặng, ADR-016 cấm).<br>Thêm nữa **hôm nay chưa viết được view cho đúng**: `level`/`expected_level` là `text` trần (không CHECK, không hàm so bậc nào trong schema `tutor`) và `cefr_trajectories` không có cột ngày để sắp thứ tự kỳ, trong khi ngưỡng là `{"periods_below_trajectory": 2}`. Tên `cefr_gap` ở mục Rev B mới chỉ là một cái tên — spec chưa từng định nghĩa công thức, cột hay cửa sổ thời gian cho nó. Ba câu hỏi thiết kế còn treo đã ghi thành chữ ở `DEBT.md` #35 |
| `ops.v_rule_health` — luật nào đang ngủ và vì sao | ✅ chạy (`0043`) | Một dòng một luật, thuật lại metrics của lượt quét thành công gần nhất. `chua_chay` và `khong_ro` là hai trạng thái RIÊNG (im lặng không phải kết luận). `needs_attention` **cố ý không bật** cho `chua_cai_dat`/`chua_khai_nguon_tuoi` — nợ có tên trong `DEBT.md` không được phép thành đèn sáng vĩnh viễn; chỉ `nguon_het_tuoi`, `khong_co_nguong_dang_bat`, `chua_chay`, `khong_ro` mới gọi người trực |
| Gộp cờ · định mức 5 · leo thang 7 ngày | ✅ chạy | Định mức là hằng số `c_owner_quota` trong hàm, **cố ý không nằm trong `care.thresholds`** — nó là hành vi cố định (đổi phải qua ADR), không phải ngưỡng cảnh báo |
| Nguồn hết tươi ⇒ bỏ qua rule | ✅ chạy | Qua `care.rules.source_key` × `ops.source_freshness`; luật chưa khai nguồn cũng bị bỏ qua với lý do riêng `chua_khai_nguon_tuoi` |
| `mode='backfill'` không mở hồ sơ, không leo thang | ✅ chạy | Chỉ ghi `care.flags` + MỘT bản tóm tắt vào `ops.outbox_messages` |
| Ghi `ops.job_runs` mỗi lần chạy | ✅ chạy | Kèm `degraded_sources`; `ops.v_job_health` (`0041`) biến "chưa chạy lần nào" thành một trạng thái riêng, không phải `ok` |
| Buồng lái GVCN đọc `care.flags` | ⛔ chưa — **đã đo, hai đường KHÔNG cho cùng kết quả** (01/08/2026) | `care.getDashboard` vẫn tự tính tín hiệu thô mỗi lần mở màn. Phép đối chiếu mà mục này chờ đã chạy: `care.run_flag_engine(current_date,'live')` trên `hub_dev` rồi FULL OUTER JOIN hai tập (học sinh × mã luật) — đo **ba lượt** trong ngày (trước reseed · sau reseed · sau reseed lần hai): **7/10 · 7/11 · 6/11 dòng trùng**. Con số trùng **đổi theo seed và theo thời điểm chạy engine, đừng lấy làm mốc**; thứ KHÔNG đổi mới là kết luận: **0 dòng chỉ có ở buồng lái, cả ba lượt**, và **mọi dòng lệch đều nằm ở phía `care.flags`** — cờ `A_ATTENDANCE` của bốn em (Trần Thị Bình 6A2, Lê Gia Bảo 6A3, Phạm Gia Bảo 6A4, Hoàng Gia Bảo 6A5), cộng ở lượt thứ ba một cờ `E_URGENT` (Nguyễn Văn Minh 6A1) mà chính nó là **chốt chặn (b) hiện ra sống**: engine chạy trước, `help_requests` đổi sau, nên `care.flags` còn giữ cờ trong khi buồng lái đã thôi tính. Phần `E_MOOD`/`E_URGENT` khớp tuyệt đối; lệch nằm trọn ở chỗ buồng lái **chỉ sinh được hai mã đó** (`ruleCode: help_requested ? 'E_URGENT' : 'E_MOOD'`), không có nhánh nào đọc chuyên cần hay hành vi. Nên chuyển bên đọc = GVCN lần đầu thấy hai loại cờ mới: **mở rộng phạm vi, phải có người quyết**, không phải một lần đổi câu SQL. Ba chỗ chặn còn lại (nhịp đêm nuốt cờ khẩn · `detail` snake_case ↔ UI camelCase · `as_of_date` đổi nghĩa làm nút "Cô đã gặp em rồi" tắt nhầm) ghi đủ ở `DEBT.md` #32 |
| Buồng lái hiện trạng thái lần quét | ✅ chạy (01/08/2026) | `care.getDashboard` trả `scanHealth` đọc từ `ops.v_job_health`, và buồng lái có **một dải cố định ở đầu trang, hiện mọi lúc**. Trước hôm nay mốc quét chỉ vẽ ở nhánh bảng trống — có một cờ là nó biến mất, tức đúng lúc GVCN đang đọc số thì màn hình thôi nói số đó cũ hay mới. Chín trạng thái ra chín câu khác nhau; `chua_chay` và `khong_doc_duoc` **không bao giờ** được phép in câu "lớp mình đang ổn". Luật bị bỏ qua trong lượt quét (hôm nay: `C_CEFR`, `C_MASTERY`) nay cũng hiện thành chữ trên màn, không chỉ nằm trong `metrics`. Ngưỡng trễ đọc từ `ops.job_schedule`, không viết chết trong mã (mệnh lệnh 7) |

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
