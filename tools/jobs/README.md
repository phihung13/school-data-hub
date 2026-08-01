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
| *(không theo lịch)* | `run-nap-danh-sach.mjs` | khi nhà trường gửi file | Nạp danh sách cả khối từ CSV vào `core.students`/`classes`/`enrollments` qua `staging` (`0045`, `0048`) |

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

## Cắm lịch lên máy thật — nợ #33

Cho tới 01/08/2026, `ops.job_schedule` có 4 dòng và `run-all.mjs` chạy được **bằng tay**,
nhưng **chưa máy nào gọi nó theo giờ**. Đo thật: `schtasks /Query /FO CSV /NH` trên máy
dev trả 421 tác vụ, lọc theo `hub|node|run-all` ra **0 dòng**; 6 dòng `job_scheduler`
trong `ops.job_runs` nằm gọn trong 27 phút của một phiên người tối 31/07. Đó là nợ #33.

### Bí mật KHÔNG được nằm trong định nghĩa tác vụ

Bản trước của mục này viết thẳng `DATABASE_URL` vào tham số `/TR` của `schtasks`. Chuỗi
đó nằm **trong định nghĩa tác vụ**: đọc được bằng `schtasks /Query /XML` và được lưu
thành một file XML dưới `%WINDIR%\System32\Tasks`. Tức là mật khẩu cơ sở dữ liệu của trẻ
em nằm trong một file không ai canh, trên một máy đã có 421 tác vụ đăng ký sẵn. Vi phạm
§8 và mệnh lệnh 8. Bản Linux cũng vậy: `/etc/cron.d/*` **bắt buộc** mode 644 để cron
chấp nhận, nên mọi tiến trình trên máy đọc được dòng đó, và `ps` hiện nguyên dòng lệnh.

Nên định nghĩa tác vụ **chỉ chứa đường dẫn tới một file bọc**:

| File | Việc |
|---|---|
| `run-all.cmd` / `run-all.sh` | Đọc `DATABASE_URL` từ file env **ngoài kho**, gọi node bằng **đường dẫn tuyệt đối**, ghi log |
| `dang-ky-lich.ps1` / `dang-ky-lich.sh` | Soát điều kiện rồi **IN RA** câu lệnh đăng ký. Mặc định **không đăng ký gì cả** |
| `kiem-tra-lich.ps1` / `kiem-tra-lich.sh` | Lịch đã cắm chưa · chạy lần cuối lúc nào · job đang ở trạng thái nào |

Vì sao script đăng ký không tự chạy: đăng ký một tác vụ hệ thống chạy bằng tài khoản
SYSTEM là **đổi cấu hình máy của người khác**. Việc đó phải do người vận hành tự bấm,
sau khi đọc câu lệnh bằng mắt mình.

### Bước 0 — file env, đặt NGOÀI kho mã nguồn

```powershell
# Windows. Mặc định C:\hub-secrets\hub.env (đổi bằng biến HUB_ENV_FILE).
mkdir C:\hub-secrets
# Nội dung, mỗi dòng một biến; dòng bắt đầu bằng # là ghi chú:
#   DATABASE_URL=postgres://nguoi:matkhau@may:5432/hub
#   HUB_NODE=C:\Program Files\nodejs\node.exe
icacls C:\hub-secrets\hub.env /inheritance:r /grant "SYSTEM:(R)" /grant "Administrators:(R)"
```

```sh
# Linux. Mặc định /etc/hub/hub.env (đổi bằng HUB_ENV_FILE).
sudo install -d -m 700 /etc/hub
sudo install -m 600 -o hub -g hub /dev/null /etc/hub/hub.env
# rồi ghi: DATABASE_URL=postgres://...
```

Log mặc định cũng nằm **ngoài kho**: `C:\ProgramData\hub\jobs.log` và
`/var/log/hub/jobs.log`. Ghi nhật ký vận hành vào trong kho là một ngày nào đó có người
commit nhầm nó lên GitHub.

### Bước 1 — xem sẽ làm gì (không đổi gì trên máy)

```powershell
powershell -ExecutionPolicy Bypass -File tools\jobs\dang-ky-lich.ps1
```
```sh
sh tools/jobs/dang-ky-lich.sh
```

### Bước 2 — đăng ký thật, do NGƯỜI VẬN HÀNH tự chạy

```powershell
# PowerShell mở bằng QUYỀN QUẢN TRỊ
powershell -ExecutionPolicy Bypass -File tools\jobs\dang-ky-lich.ps1 -XacNhan
```
```sh
sudo sh tools/jobs/dang-ky-lich.sh --xac-nhan
```

Hai tác vụ được tạo: một chạy **mỗi giờ** (gọi bộ lịch), một chạy **07:30 mỗi sáng** với
`--check` (chỉ đọc, thoát `1` nếu có job cần chú ý). Câu lệnh Windows đầy đủ, để đọc
bằng mắt trước khi bấm:

```
schtasks /Create /TN "HubJobs" /SC HOURLY /RU SYSTEM /RL HIGHEST /F /TR "\"C:\hub\tools\jobs\run-all.cmd\""
```

### Bước 3 — soi lại, và soi ĐÚNG CHỖ

```powershell
schtasks /Run /TN "HubJobs"                                    # chạy thử một lượt ngay
powershell -ExecutionPolicy Bypass -File tools\jobs\kiem-tra-lich.ps1
```
```sh
sudo -u hub sh tools/jobs/run-all.sh
sh tools/jobs/kiem-tra-lich.sh
```

`kiem-tra-lich` hỏi **ba** câu, và câu thứ ba không được đọc thay hai câu đầu:

1. máy có tác vụ nào gọi Hub không (chưa có ⇒ mọi thứ dưới đây vô nghĩa);
2. tác vụ đó chạy lần cuối lúc nào, mã kết quả bao nhiêu;
3. `ops.v_job_health` nói gì.

> **Đừng nghiệm thu bằng `ops.v_job_health` trên một database có test chạy.**
> Đo được 01/08/2026 trên `hub_dev`: view báo `flag_engine` `state='ok'`,
> `last_success_at` 13:05 "hôm nay" — trong khi 313 dòng `job_runs` của hai ngày đó do
> **bộ test** sinh ra (vitest và pgTAP chạy trên chính `hub_dev`), không do một cái lịch
> nào. Buồng lái nói đúng theo sổ và sai theo vận hành. Quy trình đo đúng: database sạch
> (hoặc `delete from ops.job_runs` có chủ ý và **ghi lại việc đã xoá**), xác nhận cả 4
> job ở `chua_chay`, đăng ký tác vụ, **không chạy test**, rồi đo lại sau 2 chu kỳ.

### Kênh báo động — thứ CHƯA có, nói ra để không ai tưởng đã có

Tác vụ `--check` mỗi sáng chỉ đổi cột **Last Run Result** của Task Scheduler thành `1`
(và trên Linux thì sinh một thư cron cho tài khoản chạy job). **Không ai ngồi nhìn Task
Scheduler.** Kênh thật — gửi thư hoặc tin nhắn cho người trực — chưa tồn tại:
`ops.outbox_messages` có bộ **ghi** (`0039`) mà **chưa có bộ gửi**
(`grep -rn "outbox" apps/ tools/ packages/core/src` = 0 hit tính tới 01/08/2026). Ghi
trong sổ nợ, xem `danh-cho-may/DEBT.md` nợ #40.

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
# /etc/cron.d/hub-jobs — một dòng cho TẤT CẢ job, chạy mỗi giờ.
# KHÔNG đặt DATABASE_URL ở đây: file này mode 644, mọi tiến trình đọc được (§8).
# run-all.sh đọc bí mật từ /etc/hub/hub.env. Xem mục "Cắm lịch lên máy thật".
0 * * * * hub  /opt/hub/tools/jobs/run-all.sh
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

## `run-nap-danh-sach.mjs` — nạp danh sách cả khối từ file của nhà trường

Trước `0045`, **không tồn tại đường nào** đưa một học sinh có thật vào hệ. Đo trên
`hub_dev` ngày 01/08/2026: `grep -rn "insert into core.students"` toàn kho ra đúng **3
hit**, cả 3 đều là công cụ dev (`seed.mjs` hai chỗ, `tools/load/checkin-storm.mjs` một
chỗ); trong 6 router tRPC là **0 hit**; `staging.raw_cor_imports` **0 dòng**. Ngày nhà
trường đưa file danh sách khối 6 thì không có cửa nào nhận nó.

**Không phải job theo lịch** (cùng hình dạng với `run-anonymize-user.mjs`): nó cần một
file, hai tham số người vận hành gõ, và một người đọc sổ lỗi sau đó. Nó **cố ý không có
dòng nào trong `ops.job_schedule`** — khai vào đó là bật một dòng `qua_han` sáng vĩnh
viễn giữa hai đợt tuyển sinh, đúng cái bẫy `0011`/ADR-016 mà `0041` dựng đèn để chống.
Nhưng nó **vẫn ghi sổ** qua `ops.start_job_run`/`finish_job_run`, nên câu *"lần nạp gần
nhất lúc nào, bao nhiêu lỗi"* luôn trả lời được.

### File CSV — sáu cột, hai tham số

Sáu cột đọc thẳng từ ràng buộc `NOT NULL` của schema, không từ phỏng đoán. Xem
`tools/jobs/mau-danh-sach.csv`.

| Cột | Đi đâu | Bắt buộc có giá trị? |
|---|---|---|
| `ma_hoc_sinh` | `core.students.student_code` — CHECK `^VA-\d{4}-\d{5}$` | có |
| `ho_ten` | `core.students.full_name` | có |
| `ngay_sinh` | `core.students.date_of_birth`, dạng `YYYY-MM-DD` | **cột phải có, giá trị được trống** |
| `ma_co_so` | tra `core.schools.code` lấy `school_id` | có |
| `ma_lop` | tra `core.classes (school_id, code, academic_year)` | có |
| `khoi` | `core.classes.grade` (0–12) — **chỉ dùng khi `--tao-lop-moi`** | **cột phải có, giá trị được trống** |

Hai tham số dòng lệnh vì **cả file dùng chung một giá trị**; đưa vào từng dòng là mời gõ
sai 900 lần: `--nam-hoc=2026-2027` → `classes.academic_year`, `--hieu-luc-tu=2026-09-05`
→ `enrollments.valid_from`.

Suy được, không hỏi trường: `students.id`, `students.status='active'`,
`enrollments.valid_to = null`. **KHÔNG suy dù rất muốn:** khối từ mã lớp (`6A1` → 6) —
đúng gần hết và **sai im lặng** ở lớp đặt tên khác quy ước.

```bash
# Thử trước — chạy thật rồi hoàn tác, in đúng con số của lần chạy thật
DATABASE_URL=postgres://... node tools/jobs/run-nap-danh-sach.mjs \
  --file=./danh-sach-khoi-6.csv --nam-hoc=2026-2027 --hieu-luc-tu=2026-09-05 --dry-run

# Chạy thật
DATABASE_URL=postgres://... node tools/jobs/run-nap-danh-sach.mjs \
  --file=./danh-sach-khoi-6.csv --nam-hoc=2026-2027 --hieu-luc-tu=2026-09-05

# Cho phép tạo lớp chưa có (job in danh sách lớp sẽ tạo TRƯỚC khi tạo)
DATABASE_URL=postgres://... node tools/jobs/run-nap-danh-sach.mjs ... --tao-lop-moi
```

### Ba mã thoát, cố ý không phải hai

| Mã | Nghĩa |
|---|---|
| `0` | Nạp sạch, không dòng nào vào hàng đợi người xử |
| `1` | **DỪNG** hoặc hỏng: file không đọc được, thiếu cột, tham số sai, hoặc số lỗi vượt ngưỡng |
| `2` | Chạy tới dòng cuối **nhưng có việc chờ người**. Không phải lỗi kỹ thuật, cũng không phải "xong" |

Gộp `2` vào `0` là biến một hàng đợi có người chờ thành một màn hình xanh.

### MỘT DÒNG NẠP LÀ MỘT ĐƠN VỊ — và bản in ra màn hình là ràng buộc kỹ thuật

Dòng nào job báo *"vào sổ lỗi"* thì `core.students`, `core.classes`, `core.enrollments`
**không đổi một cột nào**. Hoặc vào trọn, hoặc không đổi gì. Không có "vào một nửa".

Nghĩa là con số **`Đã vào kho`** in ở cuối là con số **đầy đủ** của những gì kho đã nhận
trong lần chạy đó. Khi nó là `0` thì kho thật sự không đổi.

Trước `0048` thì không phải vậy, và đây là phép đo (hub_dev, 01/08/2026):

| | Trước `0048` | Từ `0048` |
|---|---|---|
| Em `VA-2026-97001` trước lô | `Bùi Thị Lan, Jr` · `2015-02-02` · lớp `6A1` | — |
| Lô mới xếp em sang `6A2`, kèm tên khác + ngày sinh khác | `import_error` (đúng) | `import_error` (đúng) |
| Màn hình in | `Đã vào kho: 0 · Vào sổ lỗi: 1` | như cũ |
| `core.students.full_name` sau lô | **`TÊN TRONG FILE`** — bị ghi đè | `Bùi Thị Lan, Jr` |
| `core.students.date_of_birth` sau lô | **`2016-12-31`** — bị ghi đè | `2015-02-02` |
| Lớp mới tạo bởi một dòng bị từ chối (`--tao-lop-moi`) | **ở lại** thành lớp ma | bị hoàn tác |

Người vận hành đọc *"0 vào kho"* rồi tin là không có gì đổi — trong khi hồ sơ của em đã
bị thay. Đó là **ghi một phần trong im lặng**, đúng loại hỏng cả hệ này dựng ra để chống.
Nguyên nhân: trong PL/pgSQL, `return` **không hoàn tác gì cả**, nên "từ chối" của `0045`
thật ra có nghĩa là *"làm tới đâu giữ tới đó rồi ghi một dòng sổ lỗi"*.

`0048` bọc toàn bộ phần ánh xạ của `core.promote_cor_row()` vào **một khối con** (một
subtransaction) và đổi mọi cửa từ chối thành `raise exception … 'HB045'`; dòng sổ lỗi
được ghi **ngoài** khối nên nó sống, còn mọi thứ đã ghi trong khối bị cuốn sạch. `0048`
thêm cả nhánh `when others` — một lỗi ngoài dự kiến nay cũng thành một dòng sổ lỗi có
tên thay vì bay ra ngoài và giết cả lô.

**Vì sao gộp cứng chứ không tách thành "đã cập nhật hồ sơ, chưa chuyển lớp":** ca *"trường
sửa chính tả tên em, lớp thì chờ duyệt"* đã có đường đi sẵn — dòng nào **không đổi lớp**
thì promote bình thường và tên vào kho như thường (có test khoá). Đường duy nhất bị chặn
là *vừa sửa tên vừa đổi lớp*, và nó bị chặn vì phần chuyển lớp cần người duyệt. Thêm vào
đó: lý do hệ từ chối phần ghi danh là **không tin cách file này xếp em**, mà ca hỏng phổ
biến nhất của file Excel là **lệch cột** — lệch cột làm sai mọi cột cùng lúc, nên tin cột
`ho_ten` của đúng dòng mình đang nghi là chọn tin thứ mình không kiểm được.

**Nhưng không được im.** Mỗi dòng bị từ chối sau khi đã tra ra em đều kèm
`ho_so_chua_ap_dung` trong sổ lỗi: *tên trong sổ · tên trong file · ngày sinh trong sổ ·
ngày sinh trong file*. Người xử đọc đủ hai vế rồi tự quyết.

### Hai tầng chống trùng, khác nhau, không được lẫn (§9)

- **staging chống trùng FILE.** `raw_cor_imports` UNIQUE `(source, external_id)` với
  `external_id = '<ma_lo>:<student_code>'`; `ma_lo` là băm của *nội dung file + năm học +
  ngày hiệu lực*. Nạp **lại cùng một file** ⇒ cùng `ma_lo` ⇒ staging chặn ở cửa.
- **Bảng đích chống trùng DỮ LIỆU.** Nạp **file mới** (tháng 12, lớp đã đổi) ⇒ `ma_lo`
  mới ⇒ `promote()` chạy lại, và lúc đó `core.students.student_code` UNIQUE +
  `core.classes` UNIQUE `(school_id, code, academic_year)` gánh phần idempotent.

Lấy thẳng `student_code` làm `external_id` là **mất tầng thứ hai**: file tháng 12 bị chặn
ngay ở cửa staging, `promote()` không bao giờ thấy em đã đổi lớp, và báo cáo nói *"đã
nạp, 0 lỗi"*.

### Năm ca KHÔNG được tự động — mặc định là ghi sổ rồi đi tiếp

Nguyên tắc có sẵn ở hai chỗ, không phải chọn bừa: comment `staging.import_errors`
(`0008:68`) — *"không map được thì nằm ở đây chờ NGƯỜI xử, tuyệt đối không tự đoán. Một
dòng lỗi không chặn dòng sạch"*; và RB-09 (`07-operations.md:47`) — quá ngưỡng thì dừng
cả nguồn.

| Ca | Job làm gì |
|---|---|
| Mã học sinh sai khuôn | Ghi sổ, đi tiếp. **Tuyệt đối không nắn** (thêm số 0, đổi `VA-26` thành `VA-2026`) — nắn là bịa ra một em có thật |
| Trùng **tên**, khác mã | **Không phải lỗi.** Mã mới là khoá; trường có hai em cùng tên là chuyện thường |
| Trùng **mã**, khác tên | Ghi sổ **cả hai dòng**, bỏ qua cả hai. Giữ lại một dòng là tự chọn hộ nhà trường |
| Lớp chưa tồn tại | Ghi sổ, đi tiếp, **không tự tạo**. Một lỗi gõ `6A11` thay `6A1` phải kêu lên, không được đẻ ra lớp ma. Muốn tạo thì phải có cờ `--tao-lop-moi` |
| **Em biến mất khỏi file mới** | **KHÔNG chạm dữ liệu.** Chỉ ghi một dòng chờ người xác nhận |

Ca cuối là quan trọng nhất. *"Trường xuất nhầm bộ lọc"* và *"em chuyển trường thật"* cho
ra **cùng một dấu hiệu**: thiếu tên trong file. Hệ không có phép đo nào phân biệt hai
chuyện đó. Tự đặt `status='left'` hay tự đóng `enrollments` là kết luận không có căn cứ,
và nó cắt em khỏi tầm nhìn của cô đúng lúc không ai đang nhìn.

**Dừng cả job chỉ ở ba ca**, đều là hỏng ở mức cả lô: file không đọc được / thiếu cột
bắt buộc · `--nam-hoc` hoặc `--hieu-luc-tu` không hợp lệ · số dòng lỗi vượt ngưỡng. Ngưỡng
đó **đọc từ bảng `staging.import_limits`**, không viết chết trong code (mệnh lệnh 7):

```sql
update staging.import_limits set max_errors = 200, updated_at = now() where source = 'cor';
```

### Bẫy đã đo được: `on conflict` trên `core.enrollments` NUỐT IM LẶNG

`core.enrollments` không có ràng buộc duy nhất thường mà có **EXCLUDE**
`enrollments_no_overlap` (gist trên `student_id` + `daterange`). Bốn dạng đã dựng lại và
đo trên một database riêng ngày 01/08/2026:

| Viết thế nào | Kết quả thật |
|---|---|
| `on conflict do nothing`, trùng đúng kỳ cũ | `INSERT 0 0`, **im** |
| `on conflict do nothing`, **lớp khác** nhưng kỳ chồng lấn | **`INSERT 0 0`, im** — dòng chuyển lớp biến mất không dấu vết |
| `on conflict (student_id, class_id, valid_from) do nothing` | `ERROR: there is no unique or exclusion constraint matching…` |
| không có `on conflict` | `ERROR 23P01 conflicting key value violates exclusion constraint` |

Dạng **nguy hiểm nhất là dạng im**. `core.enrollments` chính là bảng quyết định *"cô có
được xem em này không"* (`0002:76`), nên nuốt một dòng chuyển lớp nghĩa là cô mới không
thấy em, cô cũ vẫn thấy, và job báo `success` 0 lỗi. Vì thế `core.promote_cor_row()`
**cấm `ON CONFLICT` ở bảng này**, dù có target hay không: nó đọc kỳ đang mở rồi quyết —
trùng lớp thì bỏ qua, khác lớp thì ghi sổ chờ người, chưa có kỳ nào thì insert trần.

> Lưu ý biên cho người xử dòng chuyển lớp: `daterange` dùng `'[]'` **hai đầu đóng**, nên
> đóng kỳ cũ phải đặt `valid_to` = ngày mở mới **trừ 1 ngày**. Đặt bằng chính ngày mở mới
> là vẫn chồng và vẫn bị chặn.

### Đọc hàng đợi và xử

```sql
-- Việc chờ người của một lần nạp
-- Cột ho_so_chua_ap_dung (0048) nói file định đổi họ tên / ngày sinh thành gì mà hệ
-- đã KHÔNG đổi — dòng bị từ chối thì cả dòng bị từ chối, kể cả phần hồ sơ.
select dong_trong_file, ma_hoc_sinh, ho_ten, ma_lop, ly_do, ho_so_chua_ap_dung
  from staging.v_loi_nap_danh_sach
 where ma_lo = '<mã lô job in ra>' and resolved_at is null
 order by dong_trong_file;

-- Xử xong một dòng
update staging.import_errors
   set retry_state = 'resolved', resolved_at = now()
 where id = ...;

-- Nạp lại một dòng đã hỏng (sau khi nhà trường sửa dữ liệu)
update staging.raw_cor_imports set failed_at = null where id = ...;
select core.promote_cor_row(...);

-- Lần nạp gần nhất
select started_at, status, metrics from ops.job_runs
 where job_name = 'nap_danh_sach' order by id desc limit 5;
```

Chạy lại **cùng một file** là an toàn (§9): phần đã vào kho trả `already_promoted`, phần
đã hỏng trả `already_failed` và không đẻ thêm dòng nào vào hàng đợi. Test khoá điều này
ở cả ba tầng: `packages/core/db/tests/0045_nap_danh_sach_test.sql` (55 assertion),
`packages/core/db/tests/0048_nap_mot_dong_la_mot_don_vi_test.sql` (32 assertion — riêng
lời hứa *"từ chối thì không đổi cột nào"*, gồm cả ca lớp ma và ca kỳ học chồng lấn) và
`tests/db/nap-danh-sach.test.ts` (9 ca, chạy chính lệnh này hai lần).

Cả ba đã **thử ngược**: lùi `core.promote_cor_row` về định nghĩa `0045` rồi chạy lại thì
`0045_…_test.sql` đỏ 5 assertion, `0048_…_test.sql` đỏ 13, và bài vitest đỏ đúng câu
`expected 'TÊN TRONG FILE' to be 'Bùi Thị Lan, Jr'`. Một bài test chưa từng đỏ là một
bài test chưa biết mình kiểm cái gì.

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
