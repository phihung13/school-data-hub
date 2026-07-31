# tools/jobs — job nền chạy theo lịch

Thư mục này chứa các job **không phải request của người dùng**: chạy theo lịch, không có UI, và mỗi lần chạy phải để lại một dòng trong `ops.job_runs`.

**Đầu vào duy nhất: `run-all.mjs`.** Task Scheduler của Windows hoặc cron chỉ cần biết một lệnh đó. Job nào chạy, bao lâu một lần — đọc từ bảng `ops.job_schedule` (`0041`), không viết chết trong bất kỳ file lịch nào.

| Job | Bộ chạy | Nhịp | Việc |
|---|---|---|---|
| `job_scheduler` | *chính `run-all.mjs`* | mỗi lượt quét | Ghi dòng cho **chính bộ lịch**. Dòng này quá hạn = máy chạy cron đã chết |
| `flag_engine` | `run-flag-engine.mjs` | mỗi ngày | Quét tín hiệu ABC+E rồi ghi `care.flags`, gộp thành `care.care_cases`, leo thang cờ quá 7 ngày (`04-flag-engine.md`) — gọi `care.run_flag_engine()` ở `0039` |
| `emotion_retention` | `run-retention.mjs` | 1 lần/tháng | Tổng hợp `attendance.mood_trends` rồi xoá chi tiết cảm xúc quá 12 tháng (§3, mệnh lệnh 4 CLAUDE.md, Luật 91/2025) |
| `homeroom_drift` | SQL — `ops.check_homeroom_drift()` | mỗi ngày | Đếm lệch giữa `core.class_assignments` và `core.user_role_scopes` qua `ops.v_homeroom_drift` (`0030`) |
| *(không theo lịch)* | `run-anonymize-user.mjs` | khi có yêu cầu, mỗi lần một người | Ẩn danh hoá một tài khoản theo yêu cầu xoá dữ liệu cá nhân (Luật 91/2025) — gọi `core.anonymize_user()` ở `0033` |

## `run-all.mjs` — một lệnh cho tất cả

Trước file này, `run-retention.mjs` — thứ thi hành lời hứa công khai với phụ huynh — **không được ai gọi**. Đo trên hub_dev ngày 31/07/2026: `select count(*) from ops.job_runs` trả về `0`. Một job viết xong mà không có đường chạy thì không khác gì chưa viết, chỉ tệ hơn ở chỗ nhìn vào repo tưởng đã xong.

```bash
DATABASE_URL=postgres://... node tools/jobs/run-all.mjs            # chạy job tới lượt
DATABASE_URL=postgres://... node tools/jobs/run-all.mjs --list     # xem lịch + sức khoẻ, không chạm gì
DATABASE_URL=postgres://... node tools/jobs/run-all.mjs --check    # chỉ soi; thoát 1 nếu có việc
DATABASE_URL=postgres://... node tools/jobs/run-all.mjs --dry-run  # nói sẽ chạy gì rồi thôi
DATABASE_URL=postgres://... node tools/jobs/run-all.mjs --only=flag_engine --force
```

| Mã thoát | Nghĩa |
|---|---|
| `0` | Mọi job tới lượt đã chạy xong tử tế (kể cả khi không job nào tới lượt, hoặc lượt khác đang chạy) |
| `1` | Có job hỏng, thiếu bộ chạy, hoặc — với `--check` — có dòng cần chú ý |

**Cắm lịch dày, không thưa.** `run-all.mjs` hỏi `ops.job_due()` trước mỗi job nên chạy mỗi giờ vẫn không làm job tháng chạy 720 lần. Đổi lại, một lần lỡ nhịp (máy tắt, mất mạng, DB bận) được bù ở lượt kế tiếp thay vì phải đợi trọn một chu kỳ nữa. Đề xuất: **mỗi giờ**.

### Windows Task Scheduler

```powershell
# PowerShell quyền quản trị. Đổi đường dẫn cho đúng máy; đừng để DATABASE_URL lọt vào repo.
schtasks /Create /TN "HubJobs" /SC HOURLY /RU SYSTEM /F `
  /TR "cmd /c cd /d C:\hub && set DATABASE_URL=postgres://... && node tools\jobs\run-all.mjs >> C:\hub\logs\jobs.log 2>&1"
```

### cron (Linux)

```cron
# /etc/cron.d/hub-jobs — mỗi giờ
0 * * * * hub  cd /opt/hub && DATABASE_URL=... node tools/jobs/run-all.mjs >> /var/log/hub/jobs.log 2>&1
```

### Ba luật của bộ lịch

1. **Job hỏng phải THẤY ĐƯỢC.** Job con chết trước khi kịp ghi sổ thì bộ lịch ghi hộ một dòng `failed` vào `ops.job_runs` kèm mã thoát và phần cuối output. Không có nhánh này, một job chết trông y hệt một job chưa tới lịch — và buồng lái đọc im lặng thành tin tốt. `run-all.mjs` so số dòng **trước và sau** khi gọi con, nên job tự ghi sổ (`run-flag-engine.mjs`, `run-retention.mjs`) không bị đếm thành hai lần chạy.
2. **Chạy lại không hỏng gì (§9).** Khoá tư vấn Postgres chặn hai lượt chồng nhau — lượt thứ hai in "Một lượt quét khác đang chạy" rồi thoát `0`, vì cắm lịch dày là chuyện bình thường, không phải lỗi. Khoá cấp phiên nên tiến trình chết là tự nhả, không kẹt vĩnh viễn như một cột `is_running` trong bảng.
3. **Không nhận lệnh từ database.** `ops.job_schedule.runner` chỉ chứa **tên file**, bị ràng buộc `^run-[a-z0-9-]+\.mjs$` ngay ở tầng DB, được soi lại bằng chính biểu thức đó trong JS, ghép vào đúng `tools/jobs/`, rồi truyền vào `spawn` dưới dạng mảng đối số — không qua shell. Job kiểu `sql` đi qua `ops.run_sql_job()` với `CASE` viết cứng: cố ý không nối tên hàm lấy từ bảng vào câu lệnh.

### Máy chạy cron chết thì sao — chỗ này từng là lỗ hổng

Bản trước của README này tự nêu ra rồi bỏ ngỏ: *"nếu máy chạy cron chết thì job không chạy và không ai biết"*. `0041` đóng nó bằng cách cho **chính bộ lịch** một dòng trong `ops.job_schedule` (`job_scheduler`, nhịp 1 ngày). Máy chạy lịch chết ⇒ không ai ghi dòng mới ⇒ `ops.v_job_health` chuyển dòng đó sang `qua_han` và `needs_attention = true`. Một truy vấn, một cột, trả lời được câu *"đêm qua máy quét có chạy không"*.

### Bảy trạng thái của `ops.v_job_health`

| `state` | Nghĩa | Kêu? |
|---|---|---|
| `ok` | Chạy thành công trong hạn, không phát hiện gì | không |
| `dang_chay` | Đang chạy, chưa quá dung sai | không |
| `chua_chay` | **Chưa có dòng nào.** Không phải ổn — chỉ là chưa biết gì | **có** |
| `that_bai` | Lần gần nhất hỏng | **có** |
| `treo` | Dòng `running` quá dung sai — tiến trình chết giữa chừng | **có** |
| `qua_han` | Thành công lần cuối đã quá `expected_every + grace` | **có** |
| `tat` | `enabled = false` | **có** |

Hai chỗ dễ bị "dọn cho gọn" mà không được đụng:

- **`chua_chay` không phải `ok`.** Đây là lỗi đã lặp lại 4 lần trong dự án này: chưa có dữ liệu thì phải nói là chưa có.
- **`tat` vẫn kêu.** Tắt job xoá cảm xúc là thất hứa với phụ huynh, không được nằm im như một lựa chọn bình thường. Muốn bỏ hẳn một job thì **xoá dòng** khỏi `ops.job_schedule` — một hành động có dấu vết trong migration, không phải một ô tick lặng lẽ.

Ngoài ra `needs_attention` còn bật khi `metrics->>'findings' > 0`: một job giám sát **chạy trót lọt** mà đếm ra 3 chỗ lệch thì `status = 'success'` là đúng, nhưng im lặng thì vô nghĩa.

### Ai nhìn thấy — buồng lái và điều hành

`ops.v_job_health` và `ops.job_schedule` được `grant select` cho `authenticated` với RLS `using (true)`: đây là dữ liệu vận hành, không có một cột nào chạm tới học sinh, nên màn hình trực đọc được mà không vi phạm §9 DESIGN-GUIDELINES (BGH/điều hành chỉ xem dữ liệu tổng hợp theo lô).

```sql
-- Câu hỏi duy nhất người trực cần hỏi mỗi sáng
select job_name, label, state, last_success_at, last_findings
  from ops.v_job_health
 where needs_attention
 order by job_name;
```

Chiều **ghi** thì không mở cho `authenticated`: bịa được lịch sử chạy máy là bịa được cả bằng chứng đã giữ lời hứa với phụ huynh. `ops.start_job_run()`, `ops.finish_job_run()`, `ops.record_job_run()`, `ops.reap_stale_runs()`, `ops.run_sql_job()` đều `revoke execute from public`; chỉ `ops.job_due()` (chỉ đọc) được cấp cho `authenticated`.

### Thêm một job mới — hai việc, một migration

1. Viết bộ chạy: `tools/jobs/run-<ten>.mjs`, **hoặc** một hàm SQL + thêm nhánh trong `ops.run_sql_job()`.
2. Trong **cùng migration** với bộ chạy đó, thêm một dòng vào `ops.job_schedule`.

Thứ tự này là luật, không phải gợi ý — cùng một luật với `ops.source_freshness` ở `0011`/ADR-016. Khai lịch trước khi có bộ chạy thì `run-all.mjs` báo `THIẾU BỘ CHẠY`, ghi dòng `failed` và thoát `1` **mỗi giờ** cho tới khi có người sửa; sau tuần thứ hai thì không còn ai đọc bảng sức khoẻ nữa, và đó mới là thiệt hại thật. `0041` viết luật ấy thành SQL: dòng `flag_engine` chỉ được chèn khi `to_regprocedure('care.run_flag_engine(date,text)')` khác `null`.

## `flag_engine` — bộ quét cờ đêm

Trước `0039`, buồng lái GVCN **tính trực tiếp** tín hiệu thô mỗi lần một người mở màn hình. Một lớp thì chịu được; cả khối thì mỗi sáng có vài chục GVCN cùng mở, mỗi lần là một lần quét lại toàn bộ check-in và lời nhắn của lớp — cùng một phép tính lặp lại vài chục lần, và **không để lại dấu vết nào** để trả lời câu hỏi *"hệ có quét không, quét lúc mấy giờ"*. Chính câu hỏi đó là thứ ADR-016 gọi là chống hỏng im lặng: buồng lái trống mà không có dòng "Quét đêm qua HH:mm" thì đó là hệ hỏng, không phải "lớp ổn".

Toàn bộ thuật toán nằm trong `care.run_flag_engine(as_of, mode)` (SQL). File `.mjs` chỉ là cái đồng hồ bấm giờ — cùng lý do với `emotion_retention`: hàm chạy được cả từ cron lẫn từ `psql` lúc sự cố, pgTAP kiểm được nó mà không cần dựng Node, và trọn một lần quét nằm trong **một** transaction nên job chết giữa chừng không để lại nửa cái hồ sơ can thiệp.

```bash
# Thử trước — chạy thật rồi rollback, in đúng con số của lần chạy thật
DATABASE_URL=postgres://... node tools/jobs/run-flag-engine.mjs --dry-run

# Chạy thật
DATABASE_URL=postgres://... node tools/jobs/run-flag-engine.mjs

# Sau khi promote một đợt dữ liệu cũ — xem mục "Nạp bù" bên dưới
DATABASE_URL=postgres://... node tools/jobs/run-flag-engine.mjs --mode=backfill
```

**Không cắm cron riêng cho job này.** Kể từ `0041`, nhịp của nó là một dòng trong `ops.job_schedule` và `run-all.mjs` là thứ gọi nó — cắm thêm một mục cron riêng là hai đường gọi cho một job, tức là hai lượt quét có thể chồng nhau ngoài tầm với của khoá chống chạy chồng. Đổi nhịp thì `update ops.job_schedule set expected_every = ... where job_name = 'flag_engine'`, không sửa file lịch. Ba lệnh trên chỉ dùng khi chạy tay lúc sự cố hoặc nạp bù.

Vì sao cron hệ điều hành chứ không `pg_cron`: y hệt lý do đã ghi ở mục `emotion_retention` bên dưới. Đổi lại, **máy chạy cron chết thì job không chạy** — nên buồng lái không được suy ra "im lặng = đang ổn"; `07-operations.md` RB-02 đặt mốc trễ > 26h là SEV2. Dòng `job_scheduler` trong `ops.v_job_health` là chỗ điều đó hiện ra thành chữ.

### Ba luật mà job này thi hành, không chỉ tính toán

1. **Không số ngưỡng nào nằm trong code** (§6, mệnh lệnh 7). Mọi con số đọc qua `care.resolve_threshold(rule, school_id)` — kể cả cửa sổ nhìn lại của signal view, từ `0039`. Đổi ngưỡng cho riêng một cơ sở là **một câu UPDATE**, không phải một lần deploy.
2. **Nguồn hết tươi thì bỏ qua rule, không kết luận "ổn"** (ADR-016). Mỗi luật khai nguồn nó phụ thuộc ở `care.rules.source_key`; nguồn nào quá hạn trong `ops.source_freshness` thì luật đó **bị loại khỏi lần chạy**, tên nguồn ghi vào `ops.job_runs.degraded_sources` (buồng lái đọc cột này để hiện băng vàng) và lý do ghi vào `metrics.rules_skipped`. Job vẫn `success`: bỏ một rule không được làm hỏng cả đêm quét.
3. **Nạp bù không gây báo động hàng loạt** (ADR-016). `--mode=backfill` chỉ ghi `care.flags` với `origin='backfill'`: **không** mở `care_cases`, **không** vào hàng đợi leo thang 7 ngày, và care team nhận đúng **một** bản tóm tắt qua `ops.outbox_messages`. Không có luật này thì một lần promote 3 tháng dữ liệu cũ mở vài trăm hồ sơ can thiệp giả trong một đêm.

Chạy lại là **no-op** (§9): `care.flags` có khoá duy nhất `(student_id, rule_code, as_of_date)`, `care.escalations` có `(case_id, escalated_on)`, và bản tin nạp bù dedup theo ngày. Test khoá điều này ở cả hai tầng: `packages/core/db/tests/0039_flag_engine_test.sql` và `tests/db/flag-engine.test.ts`.

### Hai điều job này CỐ Ý chưa làm

- **Không quét được ngày quá khứ.** Gọi với `as_of` khác hôm nay sẽ bị từ chối kèm thông điệp. Lý do: các `care.v_signal_*` neo cửa sổ vào `current_date` (hợp đồng ADR-010), nên quét cho ngày 01/05 sẽ lấy tín hiệu của **hôm nay** rồi dán nhãn 01/05 — bịa ra một lịch sử chưa từng xảy ra, nguy hiểm hơn hẳn việc không có lịch sử. Mở được khi (và chỉ khi) signal view nhận tham số ngày.
- **Chưa quét cờ C.** `C_MASTERY` và `C_CEFR` bị bỏ qua kèm lý do (`chua_khai_nguon_tuoi` / `chua_cai_dat`): chưa connector Tutor/COR nào ghi `ops.source_freshness`, và chưa có signal view cho lộ trình CEFR. Bỏ qua **và nói ra** thay vì quét bảng rỗng rồi báo "không có gì bất thường".

### Kiểm tra sau mỗi lần chạy

```sql
-- 1. Lần quét gần nhất — đúng câu buồng lái dùng để in "Quét đêm qua: HH:mm"
select started_at, finished_at, status, degraded_sources, metrics
  from ops.job_runs
 where job_name = 'flag_engine'
 order by started_at desc
 limit 3;

-- 2. Đêm qua đã BỎ QUA luật nào, vì sao? (câu hỏi quan trọng hơn câu "có bao nhiêu cờ")
select metrics -> 'rules_skipped'
  from ops.job_runs
 where job_name = 'flag_engine' and status = 'success'
 order by id desc limit 1;

-- 3. Cờ nào đang chờ xử lý mà chưa gắn vào hồ sơ nào — phải bằng 0
select count(*) from care.flags f
 where f.origin = 'live'
   and not exists (select 1 from care.care_case_flags cf where cf.flag_id = f.id);
```

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

Chọn: **cron/Task Scheduler của hệ điều hành gọi `node tools/jobs/run-all.mjs`**, và `run-all.mjs` gọi job này khi tới lượt.

Từ `0041`, nhịp không còn nằm trong file cron nữa mà nằm ở `ops.job_schedule.expected_every` (1 tháng). Cắm cron riêng cho `run-retention.mjs` là **hai đường gọi cho một job** — bỏ qua cả khoá chống chạy chồng lẫn `ops.job_due()`. Ba lệnh ở mục "Chạy" bên trên chỉ dùng khi chạy tay lúc sự cố.

```cron
# /etc/cron.d/hub-jobs — một dòng cho TẤT CẢ job, chạy mỗi giờ
0 * * * * hub  cd /opt/hub && DATABASE_URL=... node tools/jobs/run-all.mjs >> /var/log/hub/jobs.log 2>&1
```

Vì sao không phải `pg_cron`:

- `pg_cron` là extension phải cài ở tầng máy chủ database. Hub chạy trên Postgres do nhà cung cấp quản lý (ADR-011/012 giữ quyền đổi nhà cung cấp) — đưa lịch vào extension là buộc một thứ vận hành vào hạ tầng mà ta cố tình giữ khả năng thay.
- Lịch nằm trong repo thì review được như code, và chạy lại bằng tay lúc sự cố là **cùng một lệnh** người ta vừa đọc — không phải nhớ cú pháp `cron.schedule()`.
- Job này chạy 12 lần/năm. Cái giá của việc phụ thuộc thêm một extension không đổi lại được gì.

Đổi lại, phải chấp nhận: **nếu máy chạy cron chết thì job không chạy** — nhưng từ `0041` thì **có người biết**: dòng `job_scheduler` trong `ops.v_job_health` chuyển sang `qua_han`. Xem mục "Máy chạy cron chết thì sao" ở đầu file.

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

## `run-anonymize-user.mjs` — thi hành một yêu cầu xoá dữ liệu cá nhân

Không phải job theo lịch: chạy khi **có người yêu cầu**, mỗi lần đúng một tài khoản.

Chính sách đã chốt ở `0033_anonymize_user.sql`: **không xoá cứng `core.users`.** Xoá phần **định danh** (tên, email, `auth_uid`, sổ đăng nhập `core.identity_links`), giữ nguyên mọi khoá ngoại **lịch sử**. Lý do không phải là tiếc dữ liệu: cái luật bảo vệ là thông tin cá nhân, còn *"ai đã ghi can thiệp cho con tôi, ngày nào"* là bằng chứng vận hành về một đứa trẻ — mất nó là mất khả năng trả lời chính câu hỏi mà luật đó cũng bảo hộ.

```bash
# 1. LUÔN chạy dry-run trước — nó in ra TÊN THẬT để xác nhận đúng người, rồi hoàn tác
DATABASE_URL=postgres://... node tools/jobs/run-anonymize-user.mjs \
  --user=40000000-0000-0000-0000-000000000001 \
  --reason="PH Nguyễn Văn A yêu cầu xoá, phiếu 2026-014" --dry-run

# 2. Chạy thật (lần chạy thật KHÔNG in tên — log không được thành nơi cái tên sống tiếp)
DATABASE_URL=postgres://... node tools/jobs/run-anonymize-user.mjs \
  --user=40000000-0000-0000-0000-000000000001 \
  --reason="PH Nguyễn Văn A yêu cầu xoá, phiếu 2026-014"
```

`--reason` **bắt buộc**, tối thiểu 10 ký tự: dòng này đi thẳng vào `ops.audit_log.scope`, và một năm sau nó là thứ duy nhất trả lời được *"vì sao tài khoản này bị ẩn danh"*.

Gọi lại là **no-op** (§9): `anonymized_at` không bị dời — mốc pháp lý phải là lần đầu. Test khoá: `packages/core/db/tests/0033_anonymize_user_test.sql`.

### Nếu ai đó thật sự muốn `delete from core.users`

Bị trigger `users_block_hard_delete` chặn, kèm câu tiếng Việt chỉ đúng đường thay thế. Hội đồng dữ liệu quyết định xoá cứng thì mở phanh tay **trong đúng phiên đó**:

```sql
begin;
set local hub.allow_user_hard_delete = 'on';
delete from core.users where id = '...';
commit;
```

Mở phanh vẫn **không** xoá được người còn bằng chứng (`ops.audit_log`, `care.interventions`, `care.counselor_notes`, `health.logs`) — và báo rõ còn bao nhiêu dòng ở đâu, thay vì ném một mã `23503` trần rồi bỏ mặc người vận hành đoán.

## Hậu kiểm sổ audit — hai câu hỏi hỏi hằng tháng

```sql
-- 1. Ai đã đọc nội dung y tế của trẻ, và có lượt nào bị từ chối không?
--    (0034 — health.read_logs() là đường DUY NHẤT thấy được category/detail)
select occurred_at, actor_id, object_id, result, scope ->> 'row_count' as so_dong
  from ops.audit_log
 where action = 'health.read'
   and occurred_at >= now() - interval '30 days'
 order by occurred_at desc;

-- Dòng result='denied' là thứ đáng xem nhất: dấu vết của một người
-- đang thử mở cánh cửa không phải của mình.

-- 2. Tháng này đã thi hành bao nhiêu yêu cầu xoá dữ liệu cá nhân?
select occurred_at, object_id, result, scope ->> 'reason' as ly_do
  from ops.audit_log
 where action = 'core.anonymize_user'
 order by occurred_at desc;
```

## Ai ghi `ops.source_freshness.last_success_at`

Không phải job — **trigger**, cũng đặt ở `0031`:

| Nguồn | Ghi bởi |
|---|---|
| `attendance` | trigger `AFTER INSERT` trên `attendance.checkins` |
| `evidence` | trigger `AFTER INSERT` trên `evidence.dear_logs` |

Chỉ gắn vào `INSERT`, **cố ý không gắn vào `UPDATE`**: GVCN xác nhận gửi muộn hay chính job retention xoá `mood` đều là `UPDATE` nhưng không phải dữ liệu mới từ nguồn — tính chúng là "tươi" thì băng vàng sẽ tắt nhờ chính việc dọn dẹp, đúng kiểu hỏng im lặng mà ADR-016 nhắm tới.

Bảng chỉ khai **hai** nguồn, đúng bằng số nguồn có người ghi. Ba nguồn `tutor`, `moodle`, `cor` từng được seed ở `0011` đã **gỡ ngày 31/07/2026**: chưa có connector nào ghi chúng, mà `last_success_at IS NULL` được tính là hết tươi một cách có chủ ý, nên `ops.v_stale_sources` báo chúng quá hạn vĩnh viễn và băng vàng trên buồng lái sáng ngay từ ngày đầu. Cảnh báo lúc nào cũng sáng là cảnh báo đã chết — tới hôm connector điểm danh hỏng thật thì không còn ai nhìn băng vàng nữa.

**Luật đi kèm:** nguồn mới chỉ được thêm vào `ops.source_freshness` **trong cùng migration với connector ghi nó**, không sớm hơn. `packages/core/db/tests/0011_source_freshness_test.sql` có một assertion khoá điều này (`tutor`/`moodle`/`cor` không được có mặt trong bảng).
