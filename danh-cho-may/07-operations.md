---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 4
---

# Operations — SLO, Runbook, Incident, On-call, RACI, Go-live (Rev C)

## 1. SLO theo khung giờ nghiệp vụ

| SLO | Chỉ tiêu | Đo |
|---|---|---|
| Cửa sổ check-in 06:45–07:30 ngày học | ≥99% lượt thành công (kể cả offline queue) | log mutation + queue |
| Buồng lái sẵn sàng trước 06:30 | ≥99% ngày học | uptime monitor + freshness |
| Quét đêm xong trước 06:00 | 100%; trễ = SEV2 tự động | `ops.job_runs` |
| Nguồn tín hiệu còn tươi | mọi nguồn trong hạn `max_age`; quá hạn = băng vàng trên buồng lái, không phải im lặng (ADR-016) | `ops.source_freshness` + `ops.job_runs.degraded_sources` |
| Ngoài giờ học | 99,0% | monitor |
| Bản tin Zalo | đúng lịch ±24h | outbox |

Luật bảo trì: việc có kế hoạch chỉ làm sau 19:00 hoặc cuối tuần. CẤM deploy 06:00–08:00 ngày học.

## 2. Incident Response

| Mức | Định nghĩa | Phản ứng | Thông báo |
|---|---|---|---|
| SEV1 | mất dịch vụ giờ học, nghi lộ dữ liệu, mất dữ liệu | on-call ≤15 phút, cập nhật mỗi 30 phút | Chủ tịch + hiệu trưởng + nhóm GVCN (mẫu M1) |
| SEV2 | suy giảm chức năng chính ngoài giờ vàng | ≤2 giờ | nhóm vận hành + data champion |
| SEV3 | lỗi cục bộ có đường vòng | ≤1 ngày làm việc | ticket |

Mẫu thông báo M1 (gián đoạn, ngôn ngữ không kỹ thuật), M2 (khôi phục), M3 (sự cố dữ liệu cá nhân — pháp lý duyệt trước, theo nghĩa vụ Luật 91/2025). Postmortem không đổ lỗi trong 72h cho mọi SEV1/SEV2 (dòng thời gian, nguyên nhân gốc, việc sửa có hạn chót).

## 3. On-call

Dev 1 / dev 2 luân phiên tuần (tên người: MD-04, khóa trong go-live checklist). Giờ nóng: ngày học 06:00–18:00; ngoài giờ chỉ SEV1. Đầu mối không kỹ thuật: data champion cơ sở nhận báo từ GVCN, phân loại SEV, gọi on-call.

**Kênh báo động — nói thật trạng thái hôm nay (sửa 02/08/2026).** Dòng cũ ở đây ghi *"uptime monitor + `/api/health` bắn vào nhóm Zalo vận hành"*. Cả ba vế đều chưa tồn tại, và vế giữa là một đường dẫn KHÔNG có thật: `GET http://localhost:3000/api/health` đo lúc 08:40 ngày 02/08/2026 trả **404**, và `find apps/hub/app/api -name route.ts` liệt kê đúng 8 route, không route nào tên `health`. Đây cùng loại sai với câu "PITR về trước thời điểm chạy" trong RB-08 cũ: một runbook chỉ người trực sang một cái nút không có trên màn hình. Sự thật hôm nay: **hệ không tự gọi ai** — mọi kịch bản dưới đây bắt đầu bằng việc MỘT NGƯỜI nhìn thấy hoặc được báo. Kênh đẩy đang là nợ `DEBT.md` #40.

## 4. Runbook — danh mục kịch bản

**Năm kịch bản đã VIẾT ĐỦ (02/08/2026): RB-01 · RB-02 · RB-09 · RB-13 · RB-14 — xem mục 4d.** Năm cái còn lại vẫn ở mức một dòng mô tả. Cách chọn năm cái này không phải "năm cái nghe hay nhất": **bốn cái đầu đã xảy ra thật trong hai ngày 31/07–02/08/2026** và có phép đo trong `DEBT.md`, cái thứ năm là việc bắt buộc phải làm trước ngày khai giảng.

Bản cho người trực (in A4, dán ở phòng trực): `danh-cho-nguoi/so-tay-su-co.html`. Mục 4d dưới đây là bản cho máy — cùng nội dung, thêm lý do và số đo.

| RB | Kịch bản | Mức |
|---|---|---|
| RB-01 | **Không nối được cơ sở dữ liệu** (Supabase down ở prod; Docker/container tắt ở máy dev) → mẫu M1, fallback bảng 4 màu, hệ tự bù qua queue — **viết đủ ở mục 4d** | SEV1 |
| RB-02 | **Bộ quét cờ không chạy đêm qua** → chạy lại tay; 30 phút không xong: công bố buồng lái không có cờ mới hôm nay — **viết đủ ở mục 4d** | SEV2 |
| RB-03 | IP WAN cơ sở đổi → điểm danh thành off-campus hàng loạt → data champion cập nhật `school_networks` qua màn hình admin | SEV3 |
| RB-04 | Connector chết (heartbeat đỏ) → restart, kiểm `import_errors`; nguồn còn giữ, chỉ trễ | SEV3 |
| RB-05 | Nghi lộ tài khoản CBGV → khóa, audit log phạm vi đọc, đổi mật khẩu, mẫu M3 nếu chạm dữ liệu HS | SEV1 |
| RB-06 | Restore khẩn theo kịch bản drill | SEV1 |
| RB-07 | Zalo OA lỗi/khóa → bản tin lùi (SLO ±24h), kênh dự phòng qua GVCN | SEV3 |
| RB-08 | Migration hỏng prod → **đọc `node tools/migrate/migrate.mjs status` TRƯỚC khi động vào backup** (từ 02/08/2026 một migration hỏng không để lại đối tượng nào và không để lại dòng sổ nào — nó chạy trong một transaction thật, xem RB-11); chỉ khi schema đã lệch thật mới restore từ backup hằng ngày Supabase. Rồi truy vì sao lọt staging | SEV1 |
| RB-09 | **Lô nạp danh sách học sinh có dòng bị từ chối** — đọc sổ lỗi, sửa file, nạp lại không sinh dòng đôi; `import_errors` > 500/nguồn thì dừng connector nguồn đó, sửa mapping, promote lại (idempotent, an toàn) — **viết đủ ở mục 4d** | SEV3 |
| RB-10 | Mất quyền tài khoản hạ tầng → khôi phục qua chủ sở hữu tổ chức (MD-06) | SEV1 |
| RB-11 | **Áp migration lên máy chủ thật** — xem mục 4b | SEV3 (kế hoạch) / SEV1 (nếu hỏng giữa chừng, về RB-08) |
| RB-12 | **Chạy bộ kiểm thử cơ sở dữ liệu** (pgTAP + vitest) — xem mục 4c | — |
| RB-13 | **Hub mở được nhưng KHÔNG BẤM ĐƯỢC** — trang trả 200, chữ hiện đủ, nút chết — **viết đủ ở mục 4d** | SEV1 |
| RB-14 | **Đường hầm ra Internet chết** — Hub vẫn chạy, tên miền công khai trả lỗi — **viết đủ ở mục 4d** | SEV1 |

*Ghi chú sửa 02/08/2026:* RB-08 trước đây viết "PITR về trước thời điểm chạy". **PITR đã bị bỏ từ 28/07/2026** (ADR-019, `06-resilience-security.md` mục 2), nên câu đó chỉ một đường không tồn tại — đúng loại runbook làm người trực lúc 2 giờ sáng đi tìm một cái nút không có trên màn hình.

## 4b. RB-11 — áp migration lên máy chủ thật (từ 02/08/2026)

Bộ chạy: `tools/migrate/migrate.mjs`; sổ: `ops.schema_migrations` (`0050`). Tài liệu đầy đủ `tools/migrate/README.md`, thiết kế và bẫy đã gặp ở `02-database.md` mục đợt F.

| Bước | Lệnh | Tiêu chí xong |
|---|---|---|
| 1. Hỏi trước, đừng áp trước | `node tools/migrate/migrate.mjs status --url=<prod>` | Mã thoát **0**. Mã thoát **1** = lệch băm hoặc mất file ⇒ **DỪNG**, không áp gì; đây là ca "file đã áp mà nội dung trên đĩa đã đổi", xử bằng cách truy commit chứ không bằng cách chạy tiếp |
| 2. Database đã sống mà sổ trống | `node tools/migrate/migrate.mjs baseline --to=NNNN --ghi-chu="..."` | Đúng N dòng `nhan_no = true`. `up` sẽ **tự từ chối** và chỉ sang đây, nên đừng ép; `baseline` cũng tự từ chối trên database rỗng |
| 3. Xem trước | `node tools/migrate/migrate.mjs up --dry-run` | Danh sách file sắp áp đọc bằng mắt, khớp với PR |
| 4. Áp | `node tools/migrate/migrate.mjs up` | Mỗi file + dòng sổ của nó nằm trong **cùng một transaction**; hỏng giữa chừng thì không đối tượng nào ở lại, không dòng sổ nào ở lại, và `ops.job_runs` ghi `failed` |
| 5. Hậu kiểm | `status` lần nữa | "N/N file đã ở trong sổ" |

Ba điều phải nhớ, vì cả ba đã cắn thật một lần: (a) **sổ trống không có nghĩa là chưa áp gì** — trên `hub_dev` có 49 file đã áp bằng tay trước khi có sổ; (b) migration **không** được khai vào `ops.job_schedule` (nó không có nhịp; khai vào đó là bật một cảnh báo "quá hạn" sáng mỗi ngày, và cảnh báo lúc nào cũng sáng là cảnh báo đã chết); (c) mọi migration phải giữ hình dạng `begin;` … `commit;` — bộ chạy chèn câu ghi sổ vào ngay trước `commit;` của chính file và **từ chối file lạ**; file buộc phải chạy ngoài transaction thì khai tường minh bằng `-- migrate:khong-transaction`.

## 4c. RB-12 — chạy bộ kiểm thử cơ sở dữ liệu (từ 02/08/2026)

**Bộ kiểm thử có database riêng.** `hub_test`, dựng lại từ đúng bộ migration + đúng `seed.mjs`; `DATABASE_URL` của mọi lượt test tự đổi tên sang nó. `tools/run-db-tests.sh` **từ chối chạy** nếu tên database không dạng `_test`. Trước 02/08/2026 bộ test viết chung sổ `ops.job_runs` với vận hành, nên `ops.v_job_health` và dải "Quét đêm qua" trên buồng lái được nuôi bằng dấu chân của bài test — đo được: MỘT lượt `vitest run` đẩy `ops.job_runs` trên `hub_dev` từ 446 lên 451. Sau khi tách: 0 → 0 và sequence đứng yên, trong khi sequence của `hub_test` chạy 1 → 20.

```bash
# CI (đã cắm trong .github/workflows/ci.yml)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hub_test ./tools/run-db-tests.sh

# Máy dev Windows: không có psql trên PATH, Postgres nằm trong container
HUB_PSQL="docker exec -i pg_hub psql" \
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hub_pgtap_test \
bash tools/run-db-tests.sh
#   ↑ host trong DATABASE_URL là góc nhìn của CONTAINER (5432), không phải cổng 5434 đã publish

# Chốt mốc mới sau khi CỐ Ý bớt assertion (phải gõ tay, không tự động)
HUB_TAP_KET_QUA=/tmp/tap.tsv ... bash tools/run-db-tests.sh
node tools/pgtap-plan-check.mjs --ket-qua /tmp/tap.tsv --cap-nhat
```

`vitest` không cần lệnh chuẩn bị nào: `DATABASE_URL=…/hub_dev npx vitest run` vẫn gõ như cũ, database test tự dựng (nguội 3,5 s một lần; ấm 80–90 ms nhờ dấu vân băm nội dung migrations + seed).

**Mốc `tools/pgtap-moc.tsv` là bánh cóc:** ghi `plan` của **từng file** (hiện: **832 assertion / 49 file**). Viết thêm assertion thì mốc tự nâng và thành một diff trong PR; viết bớt thì cổng đỏ và hạ mốc phải gõ `--cap-nhat` ra tay. Câu "mọi nghiệm thu lịch job phải chạy trên database sạch" từ nay **có cổng máy cưỡng chế**, không còn là một dòng dặn dò.

## 4d. NĂM KỊCH BẢN VIẾT ĐỦ (02/08/2026)

**Viết cho ai.** Trường không có đội IT. Người trực lúc 7 giờ sáng là một giáo viên hoặc một nhân viên văn phòng, cầm điện thoại, đang có chuyện. Nên mỗi kịch bản dưới đây có đúng năm phần và không phần nào được rẽ nhánh mơ hồ: **dấu hiệu · xác nhận đúng bệnh · chữa · kiểm đã chữa xong · khi nào gọi dev**.

**Luật chung cho cả năm.**

1. **Trang mở được KHÔNG phải là kiểm.** Phép kiểm này đã lừa hai lần rồi. Đo lại trong lúc viết mục này: giấu đi một tệp JS, `curl http://localhost:3000/login` vẫn trả **200**; tắt hẳn cơ sở dữ liệu, `curl http://localhost:3000/login` vẫn trả **200**. Mỗi kịch bản dưới đây có một phép kiểm nói được nhiều hơn chữ 200.
2. **Mọi lệnh trong mục này đã được gõ thật trên máy dev ngày 02/08/2026**, cả ở trạng thái khoẻ lẫn ở trạng thái bệnh dựng lại. Câu trả lời in kèm là câu trả lời máy đã in ra, không phải câu đoán.
3. **Không lệnh nào trong mục này chứa mật khẩu.** Chỗ để mã mở khoá tạm là `apps/hub/.env.local` dòng `DEV_LOGIN_SECRET`; đọc nó bằng `grep`, đừng chép nó vào tin nhắn, ảnh chụp màn hình hay tài liệu.
4. **Đường tắt duy nhất được phép:** `bash tools/start-local.sh`. Script này đi qua cả năm chỗ dễ hỏng theo đúng thứ tự phụ thuộc và tự bật lại thứ nào tắt. Không hiểu chuyện gì đang xảy ra thì chạy nó trước, đọc dòng đầu tiên có dấu `x`.
5. **CẤM chạy `next build`.** Máy dev đang chạy chế độ dev: xoá `.next` là đủ, máy chủ tự dựng lại phần nó cần khi có người mở trang.

**Bản in đã được ĐO, không phải ước lượng.** `so-tay-su-co.html` hứa "mỗi kịch bản một trang A4", và lời hứa in trên màn hình là một ràng buộc kỹ thuật. Cách đo: dựng một khung có bề rộng đúng vùng in A4 (210 mm trừ lề 12 mm mỗi bên = 186 mm = 703 px ở 96 dpi), áp đúng từng giá trị trong khối `@media print`, rồi đọc chiều cao thật của từng `section.page`. Vùng in cao 297 − 10 × 2 = 277 mm = **1047 px**. Kết quả lượt cuối: **723 · 927 · 887 · 947 · 966 · 999 px** — cả sáu trang đều vừa, chỗ trống ít nhất còn **48 px** (trang RB-09). Bản đo đầu tiên KHÔNG vừa (tràn 32–136 px ở ba trang), nên cỡ chữ in hạ từ 12pt xuống **10,5pt** và văn bản bị cắt bớt; đó là một đánh đổi có số đo đứng sau, không phải một con số chọn bừa. Ai sửa chữ trong file đó thì **đo lại**, vì thêm ba dòng là tràn sang mặt giấy thứ hai, và một kịch bản bị cắt đôi giữa hai tờ là đúng cách làm người trực đọc sót phần "kiểm đã chữa xong". Chưa có cổng máy nào canh việc này — ghi nợ `DEBT.md` #52.

---

### RB-13 — Hub mở được nhưng KHÔNG BẤM ĐƯỢC  (SEV1)

**DẤU HIỆU.** Người dùng nói: *bấm không ăn* · *nút chết* · *trang hiện chữ mà không làm gì* · *tôi không vào được*. Chữ hiện đủ, logo hiện đủ, ô nhập hiện đủ — chỉ là bấm vào không có gì xảy ra. Lần thứ hai chuyện này xảy ra (01/08/2026), người phát hiện là **chủ đầu tư, bằng điện thoại**, với đúng một câu như trên.

Hai nguyên nhân đã gặp: thư mục `apps/hub/.next` bị dọn **trong lúc** máy chủ đang chạy; hoặc nhiều tiến trình máy chủ cùng ghi vào một thư mục đó.

**XÁC NHẬN ĐÚNG BỆNH — một lệnh.**

```bash
bash tools/start-local.sh
```

Đọc khối `2b. Hub có bấm được không`:

| Máy in ra | Nghĩa là |
|---|---|
| `✓ 7 tệp JS đều tải được — trang bấm được thật` | **Không phải bệnh này.** Sang RB-01 (cơ sở dữ liệu) hoặc RB-14 (đường hầm). |
| `✗ trang mở được nhưng KHÔNG BẤM ĐƯỢC — thiếu tệp JS:` kèm một hoặc nhiều dòng `404 /_next/...` | **Đúng bệnh.** Script dừng ngay tại đây, mã thoát 1. |

Số đo dựng bệnh 02/08/2026: đổi tên đúng một tệp (`apps/hub/.next/static/chunks/polyfills.js`) rồi chạy lại — script in `404 /_next/static/chunks/polyfills.js` và thoát 1, **trong khi `curl -o /dev/null -w '%{http_code}' http://localhost:3000/login` vẫn trả 200**. Đổi tên trả lại: script in `✓ 7 tệp JS đều tải được` và thoát 0. Cổng này soi được đúng thứ nó nói.

**CHỮA — theo thứ tự, không đảo.**

1. Tìm tiến trình đang giữ cổng 3000:
   `netstat -ano | findstr :3000 | findstr LISTENING`
   Đo 02/08/2026: hai dòng, **cùng một số PID** (`20204`) — đó là bình thường (IPv4 và IPv6 của cùng một tiến trình).
   **Mệnh đề `| findstr LISTENING` không phải trang trí, đo lại 02/08/2026 lúc nghiệm thu:** bỏ nó đi thì cùng lệnh đó in ra **4 tới 24 dòng** tuỳ lúc, gồm cả dòng `ESTABLISHED` và `TIME_WAIT`, và cột cuối mang **nhiều số PID khác nhau** — đo được `1216` (một trình duyệt đang NỐI VÀO Hub) và `0` (dòng `TIME_WAIT`, không thuộc tiến trình nào). Người trực làm đúng theo bước 3 ("làm với từng PID nếu có nhiều") sẽ tắt nhầm một tiến trình vô can. Chỉ dòng `LISTENING` mới là tiến trình đang GIỮ cổng.
2. Đếm xem có mấy máy chủ đang chạy:
   `powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*server.mjs*' } | Select-Object ProcessId,CommandLine"`
   Phải ra **đúng một dòng** (đo 02/08/2026: một dòng, PID 20204). Ra từ hai dòng trở lên chính là nguyên nhân thứ hai của bệnh này — tắt hết, đừng chọn một cái. **Dấu `\$` không phải lỗi gõ:** chạy trong Git Bash mà bỏ dấu gạch chéo thì bash thay `$_` bằng tham số cuối của lệnh trước rồi mới đưa sang PowerShell. Đã thử ngược 02/08/2026: bản không escape gãy thành `CommandNotFoundException` kèm số cột — may là nó **gãy thành tiếng**, không phải trả về nhầm danh sách; nhưng người trực lúc 7 giờ sáng không cần thêm một lỗi để đọc.
3. Tắt: `taskkill /PID <số PID> /F` — dùng **số PID mà bước 2 in ra**, không phải một số bất kỳ nhặt từ bước 1. Bước 2 trả về đúng các tiến trình máy chủ Hub; bước 1 chỉ để thấy có bao nhiêu tiến trình đang giữ cổng.
4. Xoá thư mục dựng: `rm -rf apps/hub/.next`
5. Bật lại: `bash tools/start-local.sh`

**KIỂM ĐÃ CHỮA XONG.** Hai điều, phải đủ cả hai:

- `bash tools/start-local.sh` chạy tới hết và in `✓ N tệp JS đều tải được — trang bấm được thật`, mã thoát **0**. Đây là phép kiểm bằng máy: nó lấy đúng danh sách tệp mà trình duyệt sẽ tải rồi thử từng tệp một.
- Mở `https://hub.truongvietanh.com/login` trên **điện thoại**, gõ mã mở khoá, và **thấy màn hình đổi**. Bấm được thật, không phải nhìn thấy nút.

**KHÔNG chấp nhận** kết luận từ việc trang mở ra và chữ hiện đủ — đó đúng là phép kiểm đã lừa hai lần.

**KHI NÀO GỌI DEV.** Xoá `.next` và bật lại **hai lượt** mà vẫn còn dòng `404`; hoặc bước 2 ra nhiều hơn một máy chủ và tắt xong vẫn mọc lại; hoặc `.hub.log` ở gốc kho có dòng lỗi lạ. **Đừng sửa sâu hơn:** đừng chạm mã nguồn, đừng chạy `next build`, đừng cài lại thư viện.

---

### RB-01 — Không nối được cơ sở dữ liệu  (SEV1 trong giờ học)

**DẤU HIỆU.** *Đăng nhập quay mãi rồi báo lỗi* · *bấm vào lớp thì trắng trơn* · *lưu điểm danh xong nó kêu lỗi*. Trang đăng nhập vẫn mở ra bình thường — đó là cái bẫy.

Số đo 02/08/2026 với container cơ sở dữ liệu đã tắt: `GET /login` trả **200**, còn `POST /api/auth/dev-login` (cầm đúng mã) trả **500**. Nghĩa là phần chữ vẫn hiện, phần cần tới dữ liệu thì gãy.

**XÁC NHẬN ĐÚNG BỆNH — một lệnh.**

```bash
docker exec -i pg_hub psql -U postgres -d hub_dev -c "select 'CSDL TRA LOI DUOC' as ket_qua;"
```

Bốn câu trả lời, cả bốn đã đo thật:

| Máy in ra | Nghĩa là | Làm gì |
|---|---|---|
| `CSDL TRA LOI DUOC` | Cơ sở dữ liệu khoẻ. **Không phải bệnh này** | Sang RB-13 hoặc RB-14 |
| `Error response from daemon: container ... is not running` | Container bị dừng | Bước 1 phần CHỮA |
| `error during connect: ... dial tcp ...: No connection could be made ...` | Docker Desktop chưa chạy xong | Bước 2 phần CHỮA |
| `Error response from daemon: No such container: pg_hub` | Container đã bị **xoá**, không phải tắt | **Gọi dev ngay**, đừng tự tạo lại |

**CHỮA.**

1. Container bị dừng: `docker start pg_hub` rồi chờ. Đo 02/08/2026: sẵn sàng nhận kết nối sau **2 giây**.
2. Docker Desktop chưa chạy: mở Docker Desktop, đợi biểu tượng con cá voi **hết quay** (10–40 giây), rồi chạy `bash tools/start-local.sh`. Script tự chờ tới 60 giây và tự `docker start` — không phải bấm gì thêm.
3. Sai cổng (chỉ xảy ra khi ai đó vừa sửa cấu hình): số cổng đúng của máy dev là **5434** nhìn từ ngoài, **5432** nhìn từ bên trong container. Trên máy này cổng 5432 phía ngoài **đã bị một container khác chiếm** (`postiz-postgres`), nên gõ nhầm 5434 thành 5432 sẽ nối được vào một cơ sở dữ liệu HOÀN TOÀN KHÁC và báo lỗi kiểu *database hub_dev does not exist* thay vì báo *không nối được*. Sai cổng không bao giờ tự nhiên xảy ra — nếu gặp, ai đó vừa sửa cấu hình, hãy gọi dev.

**KIỂM ĐÃ CHỮA XONG.** Ba điều:

- Chạy lại đúng lệnh xác nhận ở trên, phải in `CSDL TRA LOI DUOC`.
- `bash tools/start-local.sh` chạy tới hết, mã thoát **0**.
- Thử một việc **có chạm dữ liệu**: đăng nhập vào Hub và mở một lớp, phải thấy danh sách học sinh. Chỉ mở được trang đăng nhập thì chưa chứng minh được gì — trang đó vẫn trả 200 lúc cơ sở dữ liệu đã tắt hẳn.

**Một điều đỡ lo, đo được:** sau khi container sống lại, **không cần khởi động lại Hub**. Đo 02/08/2026: `POST /api/auth/dev-login` trả **200** ngay ở lần gọi đầu tiên sau khi `docker start` xong.

**KHI NÀO GỌI DEV.** Câu trả lời là `No such container`; hoặc cơ sở dữ liệu đã in `CSDL TRA LOI DUOC` mà Hub vẫn báo lỗi; hoặc đang trong cửa sổ điểm danh 06:45–07:30 (lúc đó là SEV1: gọi ngay, đồng thời cho các lớp dùng **bảng 4 màu in sẵn**, hệ sẽ tự bù khi sống lại qua hàng đợi offline).

---

### RB-14 — Đường hầm ra Internet chết  (SEV1 nếu đang giờ học)

**DẤU HIỆU.** *Ở trường vào được, ở nhà không vào được* · *điện thoại báo trang lỗi* · một trang lỗi màu xám của Cloudflare thay vì màn hình đăng nhập. Hub vẫn chạy tốt; chỉ con đường từ Internet vào là đứt.

**XÁC NHẬN ĐÚNG BỆNH — một khối, dán cả hai dòng.**

```bash
curl -s -o /dev/null -w 'trong nha  = %{http_code}\n' -m 8  http://localhost:3000/login
curl -s -o /dev/null -w 'ngoai duong = %{http_code}\n' -m 12 https://hub.truongvietanh.com/login
```

| Máy in ra | Nghĩa là |
|---|---|
| `trong nha = 200` và `ngoai duong = 200` | Đường hầm khoẻ. **Không phải bệnh này** |
| `trong nha = 200` và `ngoai duong = 502` | **Đúng bệnh.** Hub sống, đường hầm chết |
| `trong nha` khác 200 | Bệnh khác — sang RB-13 hoặc RB-01 trước, đường hầm không phải thủ phạm |

**Đọc kỹ con số này, nó khác với thứ vẫn được kể lại.** Người ta hay bảo đường hầm chết thì Cloudflare trả **lỗi 1033**. Trên hệ này thì **không**. Đo 02/08/2026 bằng cách tắt hẳn `cloudflared` rồi gọi tên miền công khai 6 lần trong 40 giây: **cả 6 lần đều là HTTP 502**, thân trang đúng 16 byte, nội dung đúng một dòng `error code: 502`. Không lần nào ra 1033. Nên **đừng đi tìm số 1033** — đi tìm một con số không xuất hiện là cách chắc chắn để kết luận sai rằng đường hầm vẫn ổn.

**CHỮA.**

1. Xem tiến trình còn sống không: `tasklist | findstr cloudflared`
   Không dòng nào = đường hầm đã chết hẳn.
2. Bật lại: `bash tools/start-local.sh` — bước 3 của script tự bật `cloudflared` và tự chờ tới khi tên miền công khai trả 200.
3. Không muốn chạy cả script thì bật tay:
   `cd ~ && nohup cloudflared tunnel --config "$HOME/.cloudflared/config.yml" run > /c/Users/ASUS/school-data-hub/.cloudflared.log 2>&1 &`

Đo 02/08/2026: từ lúc gõ lệnh tới lúc tên miền công khai trả 200 là **khoảng 11 giây**.

**KIỂM ĐÃ CHỮA XONG.** Hai điều:

- Chạy lại đúng khối lệnh xác nhận, phải ra `ngoai duong = 200`.
- Mở `.cloudflared.log` và tìm dòng `Registered tunnel connection` **có dấu thời gian mới**. Đo lúc khoẻ: có **bốn** dòng như vậy, `connIndex` từ 0 đến 3 (đường hầm bắt tay bốn kết nối với biên Cloudflare). Đây là phép kiểm nói được nhiều hơn con số 200: nó chứng minh chính đường hầm này đã đăng ký lại, chứ không phải một trang nào đó tình cờ trả về 200.

**Một sự thật phải nói ra: không có ai canh tự động.** Sáng 02/08/2026 đường hầm chết và thứ bật nó lên là **một con người chạy đúng lệnh ở trên**, không phải một dịch vụ tự khởi động lại. `cloudflared` trên máy này chạy dưới dạng một tiến trình rời, không phải Windows Service, nên máy khởi động lại là đường hầm mất. Bản thật là chuyển lên máy chủ có tự khởi động lại (ADR-018/019).

**KHI NÀO GỌI DEV.** Bật lại rồi mà sau **2 phút** vẫn `ngoai duong = 502`; hoặc `.cloudflared.log` có dòng nói tới chứng chỉ / `credentials` / `Unauthorized`; hoặc `trong nha` cũng khác 200 (lúc đó đường hầm là nạn nhân, không phải thủ phạm). **Đừng sửa sâu hơn:** đừng đụng `~/.cloudflared/config.yml`, đừng tạo tunnel mới, đừng sửa DNS.

---

### RB-02 — Bộ quét cờ không chạy đêm qua  (SEV2)

**VÌ SAO KỊCH BẢN NÀY QUAN TRỌNG HƠN NÓ TRÔNG.** Từ ADR-026 (01/08/2026), giáo viên chủ nhiệm **không còn đọc được nhật ký cảm xúc từng ngày** của học sinh lớp mình. Nghĩa là bộ quét cờ đêm không còn là một tiện ích — nó là **con đường phát hiện sớm duy nhất** còn lại của cô. Bộ quét không chạy mà buồng lái vẫn in *hết việc rồi, lớp mình đang ổn* thì đó không phải một màn hình sai, đó là một lời trấn an không có gì đứng sau.

**DẤU HIỆU.** GVCN mở buồng lái và thấy một dải màu vàng ở đầu trang, không phải bảng cờ:

- *Bộ quét cờ quá hạn — lần chạy xong gần nhất là ...*
- *Bộ quét cờ chưa chạy lần nào*
- *Lần quét gần nhất đã HỎNG*
- *Bộ quét cờ đang treo*

Hoặc GVCN nói: *sáng nay bảng trống trơn* — và đúng lúc này thì **trống trơn không có nghĩa là không có chuyện**.

**XÁC NHẬN ĐÚNG BỆNH — một lệnh.**

```bash
docker exec -i pg_hub psql -U postgres -d hub_dev -c "select label as bo_quet, state as tinh_trang, to_char(last_finished_at at time zone 'Asia/Ho_Chi_Minh','DD/MM HH24:MI') as xong_luc, last_status as ket_qua, needs_attention as can_de_y from ops.v_job_health order by needs_attention desc, job_name;"
```

Đọc cột `tinh_trang` của dòng **Bộ quét cờ đêm**. Bảy giá trị, không giá trị nào được đọc thành một giá trị khác:

| `tinh_trang` | Nghĩa là | Làm gì |
|---|---|---|
| `ok` | Đã chạy xong đúng nhịp | **Không phải bệnh này.** Bảng trống là bảng trống thật |
| `qua_han` | Quá nhịp cộng dung sai (1 ngày + 6 giờ) mà chưa có lần nào xong | Chữa, bước 1 |
| `chua_chay` | **Chưa có phép đo nào** trong sổ | Chữa, bước 1 — và đọc lại cảnh báo dưới bảng |
| `that_bai` | Lần chạy gần nhất kết thúc bằng lỗi | Chữa bước 1; hỏng lần nữa thì gọi dev |
| `treo` | Có một lần chạy mở quá lâu chưa đóng sổ — gần như chắc chắn tiến trình đã chết giữa chừng | Gọi dev |
| `dang_chay` | Đang chạy | Chờ, đừng chạy chồng |
| `tat` | Ai đó đã tắt job này | Gọi dev |

Số đo 02/08/2026 lúc khoẻ: `Bộ quét cờ đêm | ok | 02/08 02:11 | success | f`. Dựng bệnh bằng cách lùi dấu thời gian của lần chạy về 3 ngày trước trong một giao dịch rồi hoàn tác: cùng lệnh đó in `qua_han | 30/07 02:11 | t`, và sau khi hoàn tác trở lại đúng `ok | 02/08 02:11 | f`. Cổng này soi được đúng thứ nó nói, và phép thử không để lại dấu vết nào.

**CHỮA.**

1. Xem trước, chưa ghi gì: `DATABASE_URL=postgres://postgres:postgres@localhost:5434/hub_dev node tools/jobs/run-flag-engine.mjs --dry-run`
   Đo 02/08/2026: in `DRY-RUN — đã hoàn tác, KHÔNG cờ nào và KHÔNG hồ sơ nào được ghi` và số dòng trong sổ chạy job **không nhúc nhích** (9 trước, 9 sau). **Chạy thử KHÔNG chữa được gì** — nó chỉ cho biết bộ quét có chạy nổi không.
2. Chạy thật: bỏ `--dry-run`.
   Đo 02/08/2026: `Luật đã chạy: A_ATTENDANCE, E_MOOD, E_URGENT` · `Cờ mới: 0` · mã thoát 0.
3. **Ba dòng cảnh báo dưới đây là BÌNH THƯỜNG hôm nay, không phải sự cố:** `bỏ qua B_BEHAVIOR — nguon_het_tuoi` · `bỏ qua C_CEFR — chua_cai_dat` · `bỏ qua C_MASTERY — chua_khai_nguon_tuoi`. Ba luật đó chưa có nguồn dữ liệu chảy vào (`DEBT.md` #35). Chấm một luật bằng dữ liệu không tồn tại còn tệ hơn không chấm.
4. **Nếu 30 phút chưa xong:** công bố với nhóm GVCN rằng **hôm nay buồng lái không có cờ mới**, bằng lời, không chờ hệ tự nói. Đây là SEV2.

**KIỂM ĐÃ CHỮA XONG.** Chạy lại **đúng lệnh xác nhận** ở trên và đòi hai điều cùng lúc:

- `tinh_trang` = `ok` và `can_de_y` = `f`;
- **`xong_luc` đã NHÍCH sang giờ vừa chạy.** Đo 02/08/2026: trước khi chữa `02/08 02:11`, sau khi chạy thật `02/08 08:54`.

**KHÔNG chấp nhận** kết luận *mở buồng lái thấy có cờ là xong*: cờ đang hiện có thể là cờ của lần quét trước, và chính màn hình cũng nói vậy (*Số đang hiện là của lần quét trước*). Cái phải nhích là đồng hồ, không phải cái bảng.

**KHI NÀO GỌI DEV.** `tinh_trang` là `treo` hoặc `tat`; hoặc chạy tay cũng hỏng; hoặc `that_bai` hai lần liên tiếp. **Đừng sửa sâu hơn:** đừng sửa ngưỡng cảnh báo, đừng xoá dòng nào trong sổ chạy job, đừng sửa cờ trong cơ sở dữ liệu bằng tay.

---

### RB-09 — Lô nạp danh sách học sinh có dòng bị từ chối  (SEV3)

**DẤU HIỆU.** Cuối màn hình của lệnh nạp có dòng `Vào sổ lỗi : 1` (hoặc lớn hơn) và câu **CÓ VIỆC CHỜ NGƯỜI**; lệnh thoát với mã **2**. Hoặc muộn hơn: GVCN nói *lớp em thiếu một bạn* / *bạn này có trong file mà không có trong Hub*.

Mã thoát có ba con số, cố ý không phải hai: **0** = nạp sạch · **1** = dừng hoặc hỏng · **2** = chạy hết file nhưng **có việc chờ người**. Gộp 2 vào 0 là biến một hàng đợi có người chờ thành một màn hình xanh.

**XÁC NHẬN ĐÚNG BỆNH — một lệnh.** Chính lệnh nạp đã in sẵn câu này kèm mã lô của lần chạy; chép nguyên nó:

```bash
docker exec -i pg_hub psql -U postgres -d hub_dev -c "select dong_trong_file, ma_hoc_sinh, ho_ten, ma_lop, ly_do from staging.v_loi_nap_danh_sach where resolved_at is null order by created_at desc, dong_trong_file;"
```

Đo thật 02/08/2026 sau một lượt nạp 13 dòng có một dòng gõ sai mã lớp (`6A11` thay vì `6A1`):

```
dong_trong_file | 14
ma_hoc_sinh     | VA-2026-11013
ho_ten          | Trần Diễn Thử
ma_lop          | 6A11
ly_do           | lớp chưa tồn tại trong năm học này — job KHÔNG tự tạo lớp,
                  chạy lại với --tao-lop-moi nếu đúng là lớp mới
```

`dong_trong_file` là **số dòng bạn thấy khi mở file trong Excel** (dòng 1 là tiêu đề). Mở file, nhảy tới đúng dòng đó.

Bốn lý do hay gặp và cách đọc chúng:

| `ly_do` bắt đầu bằng | Nghĩa là | Ai sửa |
|---|---|---|
| `lớp chưa tồn tại trong năm học này` | Gõ sai mã lớp, **hoặc** đúng là lớp mới chưa khai | Văn phòng sửa ô trong file; nếu là lớp mới thật thì nạp lại kèm `--tao-lop-moi` |
| `trùng mã học sinh trong cùng một file nhưng khác họ tên` | Hai dòng cùng mã, khác tên — hệ **bỏ qua cả hai** | **Nhà trường xác nhận em nào là em thật.** Hệ không có căn cứ để chọn hộ, và người trực cũng không |
| `vắng mặt trong file mới` | Em đang có kỳ học mở nhưng không có trong file vừa nạp | **Người xác nhận.** Hệ tuyệt đối KHÔNG tự cho em nghỉ học. Hai khả năng cho ra cùng một dấu hiệu: trường xuất nhầm bộ lọc, hoặc em chuyển trường thật |
| bất cứ câu nào bạn không hiểu | — | Gọi dev, đừng đoán |

**CHỮA.**

1. **Sửa ô trong file Excel, không sửa cơ sở dữ liệu.** File của nhà trường là bản gốc; sửa thẳng vào kho là để lại một bản gốc nói một đằng và một cái kho nói một nẻo.
2. Lưu file, chạy lại **đúng lệnh nạp cũ với đúng tham số cũ**:
   `DATABASE_URL=postgres://postgres:postgres@localhost:5434/hub_dev node tools/jobs/run-nap-danh-sach.mjs --file=<đường dẫn> --nam-hoc=2026-2027 --hieu-luc-tu=2026-09-05`
3. Nếu đúng là lớp mới thật thì thêm `--tao-lop-moi`. Lệnh sẽ **in danh sách lớp sắp tạo TRƯỚC khi tạo** — đọc bằng mắt rồi mới để nó chạy tiếp.
4. **Đóng dòng cũ trong sổ lỗi.** Đây là bước dễ quên nhất và đã đo được: sau khi nạp lại thành công hoàn toàn, `staging.v_loi_nap_danh_sach` **vẫn còn nguyên 1 dòng chờ**. Sổ lỗi không tự đóng, vì hệ không có cách nào biết dòng mới là bản sửa của dòng cũ.
   `docker exec -i pg_hub psql -U postgres -d hub_dev -c "update staging.import_errors set retry_state='resolved', resolved_at=now() where id = <số id>;"`

**KIỂM ĐÃ CHỮA XONG — bốn phép đo, không phép nào là mở màn hình xem.**

Chạy trước và sau, so hai con số:

```bash
docker exec -i pg_hub psql -U postgres -d hub_dev -c "select (select count(*) from core.students) as so_hoc_sinh, (select count(*) from core.enrollments) as so_ky_hoc, (select count(*) from (select student_code from core.students group by 1 having count(*)>1) t) as ma_bi_trung, (select count(*) from (select student_id from core.enrollments where valid_to is null group by 1 having count(*)>1) u) as em_co_hai_ky_hoc_mo, (select count(*) from staging.v_loi_nap_danh_sach where resolved_at is null) as con_cho_nguoi;"
```

1. **Dòng bị từ chối không để lại một nửa nào.** Đo 02/08/2026 ngay sau lượt nạp có 1 dòng lỗi: `so_hoc_sinh` vẫn **109** và em bị từ chối (`VA-2026-11013`) **không tồn tại** trong kho. Không có dòng nào vào một nửa — nghĩa là con số *Đã vào kho* mà lệnh in ra là con số đầy đủ, không phải một lời trấn an.
2. **Nạp lại không sinh dòng đôi.** Đo: nạp lại cả 13 dòng sau khi sửa, trong đó 12 dòng đã có sẵn từ lượt trước — `so_hoc_sinh` đi từ **109 lên 110** (đúng một em mới), `so_ky_hoc` từ **108 lên 109**. `ma_bi_trung` = 0, `em_co_hai_ky_hoc_mo` = 0.
3. **Chạy lần thứ ba cùng file cho ra không gì cả.** Đo: `Đã vào kho: 0` · `Đã có sẵn (bỏ qua): 13` · `so_hoc_sinh` và `so_ky_hoc` không đổi, mã thoát 0. Đây là §9 (idempotent) nhìn bằng mắt thường: gõ lại lệnh cũ vì lỡ tay là an toàn.
4. **`con_cho_nguoi` = 0.** Còn số khác 0 là còn người phải xử, dù màn hình nạp đã xanh.

**Một cái bẫy của chính công cụ, đo được:** đổi bất kỳ tham số nào (ví dụ nạp lại đúng file đó nhưng `--hieu-luc-tu` khác) sẽ sinh **mã lô mới**, nên hai lần chạy đó không nhận ra nhau. Đúng file, đúng tham số thì mã lô giống nhau và lần hai không làm gì. Ghi lại mã lô của mỗi lượt nạp vào sổ trực.

**KHI NÀO GỌI DEV.** Màn hình in `DỪNG GIỮA CHỪNG — ... vượt ngưỡng 500` (hỏng ở mức cả lô: sai cột, sai năm học, sai file); hoặc `ly_do` là một câu không có trong bảng trên; hoặc có dòng `trùng mã học sinh ... khác họ tên` (việc này phải hỏi nhà trường, không ai được chọn hộ); hoặc `em_co_hai_ky_hoc_mo` khác 0. **Đừng sửa sâu hơn:** đừng `update`/`delete` trong `core.students` hay `core.enrollments`, đừng xoá dòng trong `staging.raw_cor_imports`.

## 5. Drill

**Drill 0 (bắt buộc trước vườn ươm, tuần 6):** (a) xác nhận dump đêm trên R2 + ổ trường; báo động "thiếu dump >26h" hoạt động; (b) restore dump mới nhất vào Postgres trống, smoke test 10 điểm, đo thời gian so RTO 4h, ký biên bản. Sau đó mỗi quý trong "ngày bảo trì quý" (gộp cập nhật dependency; major upgrade chỉ trong hè).

## 6. RACI (mỗi quy trình đúng một A)

| Quy trình | R | A | C | I |
|---|---|---|---|---|
| Sự cố SEV1 | on-call dev | dev trưởng | SRE-role | Chủ tịch, hiệu trưởng |
| Đổi ngưỡng cờ | admin học vụ | hiệu trưởng cơ sở | tâm lý cụm | GVCN |
| Thêm trường dữ liệu | dev | Hội đồng dữ liệu | pháp lý (nếu nhạy cảm) | toàn hệ |
| Restore / drill | dev 1 | dev trưởng | — | Chủ tịch |
| Cấp/reset tài khoản HS | GVCN | hiệu trưởng cơ sở | dev khi lỗi hệ | phụ huynh |
| Đồng thuận & quyền xóa | văn phòng cơ sở | đầu mối pháp lý | dev | Hội đồng dữ liệu |
| Nới quyền xem dữ liệu nhạy cảm (y tế, tư vấn) | dev (thi hành) | Hội đồng dữ liệu (qua ADR) | pháp lý | tâm lý cụm |
| Tu chính Hiến chương / ADR | người đề xuất | Chủ tịch + Hội đồng | dev trưởng | toàn hệ |

## 7. Go-live checklist (vào vườn ươm — đủ 8 nhóm, có chữ ký từng dòng)

1. Kỹ thuật: pgTAP 2 chiều · contract test idempotency · secret scan · k6 3.000 check-in/30 phút p95<500ms · freshness/health chạy — *dev trưởng ký*
2. Chống gian lận: off-campus không tính chuyên cần · queued_late vào danh sách lệch — *QA-role*
3. An toàn dữ liệu: Drill 0 pass, biên bản có số đo RTO — *dev trưởng*
4. Bảo mật: pentest 0 finding cao chưa xử · MFA 100% CBGV/admin — *pháp lý + dev*
5. Pháp lý: DPIA (gồm MD-02 residency) · đồng thuận kép đủ · mẫu M3 duyệt — *đầu mối pháp lý*
6. Quản trị: MD-01 quy trình tài khoản + màn hình GVCN reset · MD-03 nội quy điện thoại · MD-04 tên người trực · MD-06 tài khoản hạ tầng tên tổ chức — *Chủ tịch*
7. Con người: GVCN tập huấn + tự check-in 1 tuần · data champion nắm RB-03/04 · bảng 4 màu in sẵn — *hiệu trưởng*
8. Vận hành: **năm kịch bản của mục 4d đã IN RA GIẤY và dán ở phòng trực** (`danh-cho-nguoi/so-tay-su-co.html`, Ctrl+P, mỗi kịch bản một trang A4) · **người trực đã tự diễn thử ít nhất RB-01 và RB-14 một lượt có người đứng xem** — đọc runbook không phải là biết dùng runbook · năm kịch bản còn lại của bảng mục 4 viết đủ · M1–M3 nạp sẵn · kênh báo động bắn thử · **RB-11 đã chạy thật một lượt trên máy chủ đích** (`migrate.mjs status` mã thoát 0, sổ `ops.schema_migrations` khớp số file trong kho) — *SRE-role*

## 8. Kế hoạch rút lui

Chạm tiêu chí dừng giữa học kỳ: (1) hệ chuyển chỉ-đọc, lớp về quy trình giấy trong 1 ngày (đã tập); (2) xuất toàn bộ dữ liệu bàn giao hiệu trưởng; (3) dữ liệu cảm xúc xử lý theo Hiến chương; (4) postmortem toàn dự án trước khi bàn làm lại. Kịch bản rút lui được diễn tập trên giấy trong buổi tập huấn.
