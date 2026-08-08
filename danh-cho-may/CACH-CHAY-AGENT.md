---
ban-doi-ung: none
sync-version: 1
---

# Cách chạy agent trên repo này

Viết ngày 02/08/2026, sau bảy đợt (A→G) làm bằng nhiều agent song song. Tài liệu này
là thứ một phiên Claude MỚI đọc để làm tiếp mà không phải học lại bằng cách vấp.

Nó không phải hướng dẫn dùng công cụ. Nó là **bản ghi những cách hỏng đã gặp thật**,
và cách bố trí agent để chúng không lặp lại.

---

## 0. Đọc trước, không có ngoại lệ

1. `CLAUDE.md` ở gốc repo — 10 mệnh lệnh, luật đồng bộ, phân quyền agent.
2. `danh-cho-may/RULES.md` — 10 điều luật cứng đã được phê duyệt.
3. `danh-cho-may/DEBT.md` — 40+ món nợ có tên. **Đọc trước khi đề xuất bất cứ gì**:
   phần lớn ý tưởng "hay" đã nằm trong đó kèm lý do vì sao chưa làm.
4. `danh-cho-may/ADR.md` — 28 quyết định kiến trúc. Đi ngược một ADR thì phải mở ADR
   mới, không sửa lặng lẽ.

**Luật nền của cả repo, và là thứ mọi agent phải mang theo:**

> **Im lặng không phải kết luận.**
> Không có dữ liệu ≠ mọi thứ ổn. Lỗi ≠ 0. Chưa chạy ≠ đạt. Bảng trống ≠ lớp ổn.
> Mọi chỗ trả về rỗng phải phân biệt được ba thứ: *không có gì* · *không được phép
> đọc* · *chưa ai tính*.

Đây là hệ dữ liệu trẻ em. Một lỗi im lặng ở đây nghĩa là một đứa trẻ cần giúp mà
không ai biết.

---

## 1. Gọi bao nhiêu agent, và chia thế nào

### Con số đã dùng thật

| Đợt | Việc | Số agent | Kết quả |
|---|---|---|---|
| B | Mở cho cả khối | 13 | 4 gói tự khai "xong" nhưng nghiệm thu bác 3 |
| E | Nạp danh sách, điều khoản, khối 7-8 | 8 | bắt được **2 lỗi chặn** |
| F | Khoá cửa đăng nhập, ba cổng canh | 8 | bắt được **4 lỗi**, 3 do chính công cụ |
| G | Kênh báo động, sổ tay sự cố | 5 | bắt được 3 lỗi |

**Khuyến nghị: 5–8 agent một đợt.** Dưới 5 thì không đủ góc nhìn độc lập. Trên 8 thì
xung đột file tăng nhanh hơn giá trị thu được, và người gộp không đọc xuể.

### Chia theo QUYỀN SỞ HỮU FILE, không chia theo tính năng

Đây là bài học đắt nhất. Đợt B chia theo tính năng, hai agent cùng sửa
`apps/hub/server/routers/care.ts`, và một gói để lại **39 bài test đỏ** cho gói kia
dọn.

Cách chia đúng:

```
Agent A: apps/hub/server/routers/care.ts + components/gvcn/**
Agent B: apps/hub/components/{home,checkin,this-week,profile}-view.tsx
Agent C: packages/core/db/migrations/00NN_*.sql + tests tương ứng
Agent D: tools/** 
```

Mỗi giao việc phải ghi **cả hai vế**:

```
BẠN SỞ HỮU: <danh sách file cụ thể>
KHÔNG chạm: <danh sách file của agent khác>
```

### Cấp SỐ MIGRATION trước, trong giao việc

Đã trùng số thật một lần (hai file cùng mang `0030`). Ghi thẳng vào prompt:

> SỐ MIGRATION CỦA BẠN LÀ 0052. Không lấy số khác.

### Hai file dùng chung: dùng khuôn `.wip`

`danh-cho-may/02-database.md` và `danh-cho-nguoi/ho-so-he-thong.html` chỉ có MỘT bản
mà mọi gói đổi schema đều phải sửa. Cách đã dùng và chạy tốt:

1. Mỗi gói viết bản nháp vào `danh-cho-may/.wip/<key-gói>.md`
2. Một agent pha sau gộp tất cả vào hai file thật, tăng `sync-version` **đúng một lần**
3. Xoá `.wip` — bản nháp còn nằm đó là một nguồn sự thật thứ hai
4. Tên đối tượng schema chưa kịp vào tài liệu thì ghi vào `NO_TAI_LIEU` trong
   `tools/check-sync.mjs` **có tên**, không ghi ẩn danh. Bánh cóc `SO NO THUA` sẽ đỏ
   nếu quên xoá sau khi đã trả nợ.

---

## 2. Bố cục một đợt

```
Pha 1 · Khảo sát   (2–3 agent, ĐỌC KHÔNG SỬA)
Pha 2 · Thi công   (2–4 agent, chia theo file)
Pha 3 · Gộp tài liệu (1 agent, nếu nhiều gói đổi schema)
Pha 4 · Nghiệm thu (2 agent, mặc định KHÔNG TIN)
```

**Pha khảo sát không được bỏ.** Hai lần nó cứu cả đợt:

- Đợt D: khảo sát phát hiện việc cắt quyền đọc cảm xúc sẽ làm **bảng điểm danh của cô
  trắng toàn NULL** — vì bốn màn GVCN lấy đường-đọc-cảm-xúc làm nguồn cho cả cột điểm
  danh. Cắt trước rồi mới biết thì đã hỏng trên máy thật.
- Đợt C: khảo sát đo ra hai đường tính cờ **không cho cùng kết quả**, nên việc chuyển
  đổi bị dừng lại đúng lúc thay vì âm thầm đổi sang một sự thật khác.

Pha khảo sát phải bị cấm sửa file, bằng chữ in hoa trong prompt.

**Việc phụ thuộc nhau thì phải TUẦN TỰ.** Đợt D làm tầng dữ liệu xong mới tới tầng màn
hình, vì tầng trên code dựa trên hợp đồng SQL tầng dưới vừa tạo.

---

## 3. Cách viết giao việc cho agent

### Bắt buộc có trong mọi prompt

```
· Mốc sạch: commit <sha>. Cây làm việc SẠCH.
· Số nền: <N> vitest / <M> file · <K> assertion pgTAP · tsc 3/3 · 5 cổng quét PASS.
  ĐỪNG LÀM ĐỎ CÁI ĐANG XANH.
· DATABASE_URL=postgres://postgres:postgres@localhost:5434/hub_dev
· KHÔNG chạy `next build` khi máy chủ đang chạy (xem mục 6).
· pgTAP phải so số assertion chạy được với `select plan(N)` TỪNG FILE.
· vitest phải đặt DATABASE_URL, nếu không 245 bài bỏ qua trong im lặng.
· Chạy vitest xong PHẢI seed lại: node packages/core/db/seed/seed.mjs
· Dấu nháy nhọn (U+00AB/U+00BB) bị cấm toàn kho, có cổng canh.
· MỌI CỔNG MỚI PHẢI THỬ NGƯỢC: phá thứ nó canh, xác nhận nó đỏ, rồi hoàn nguyên.
```

### Viết RÀNG BUỘC, không viết mục tiêu

Sai:

> Làm cho cổng đồng ý hoạt động tốt.

Đúng (và đây là prompt thật đã cứu một đứa trẻ khỏi bị khoá đường kêu cứu):

> 1. Đường "Mình cần gặp thầy cô" của học sinh KHÔNG BAO GIỜ bị khoá bởi phiếu đồng ý.
>    Không bởi bất kỳ trạng thái hành chính nào của người lớn. Đây là mệnh lệnh, không
>    phải mục tiêu để cân đối.
> 2. Nhưng ĐỪNG mở toang bằng cách bỏ luôn cổng đồng ý — lời hứa với phụ huynh cũng thật.
>    Bạn phải chọn ranh giới và CHỌN CÓ LÝ DO.

Ghi rõ **cái gì tuyệt đối không được**, và **cái giá của việc làm quá tay**. Agent giỏi
ở chỗ tìm đường; nó cần biết vách đá ở đâu chứ không cần biết đi hướng nào.

### Cho phép agent NÓI KHÔNG

Prompt phải mở đường cho câu trả lời "không nên làm":

> Nếu sau khi đo bạn kết luận CHƯA nên chuyển, thì việc đúng đắn là làm xong phần
> (2) — phần đúng dù chuyển hay không — rồi ghi rõ trong `conNo` vì sao chưa chuyển
> được. **Nói thật quan trọng hơn báo cáo đẹp.**

Hai lần agent dùng đúng cửa này và cả hai lần đều đúng: từ chối chuyển buồng lái sang
bảng cờ (hai đường lệch nhau), và từ chối dựng signal view cho C_CEFR (schema chưa đủ
để viết cho đúng, viết bây giờ là khoá ba quyết định bịa vào migration).

### Ghi sẵn những cái bẫy đã biết

Tiết kiệm được hàng giờ. Ví dụ thật:

> · `core.enrollments` KHÔNG có ràng buộc duy nhất thường mà có ràng buộc EXCLUDE.
>   `on conflict do nothing` ở đây **im lặng nuốt luôn dòng**, kể cả dòng chuyển lớp.
> · `core.students.student_code` có CHECK `^VA-\d{4}-\d{5}$`.
> · `pg` không resolve từ `tools/` bằng import thường — dùng `createRequire` neo vào
>   `packages/core/package.json`.

---

## 4. Nghiệm thu — phần quan trọng nhất

**Mặc định của agent nghiệm thu là KHÔNG TIN.** Trong 7 đợt, nghiệm thu bác bỏ tự khai
ở **hơn một nửa** số gói, và bắt được 4 lỗi mức chặn.

### Khung prompt nghiệm thu

```
1. Chạy lại MỌI con số trong doDuoc. Lệch là một sai sót, kể cả lệch nhỏ.
2. Đọc git diff thật: file nào sửa mà không khai, file nào khai mà không sửa.
3. DỰNG LẠI ĐÚNG KỊCH BẢN HỎNG BAN ĐẦU, đầu-cuối, và chứng minh nó đã hết.
4. Có làm ĐỎ cái đang xanh? Chạy đủ: tsc 3/3 · toàn bộ vitest · toàn bộ pgTAP trên
   DB dựng lại từ đầu (so ok với plan(N) TỪNG FILE) · check-sync · check-html ·
   schema-lint · secret-scan · contracts-lint · bash tools/start-local.sh
5. THỬ NGƯỢC bài test mới: phá tạm mã, xác nhận test đỏ, rồi HOÀN NGUYÊN.
   Test vẫn xanh khi mã đã hỏng thì test đó vô giá trị — báo cáo.
6. Sai sót nhỏ sửa được an toàn thì sửa, ghi vào daTuSua. Lớn thì báo cáo.
7. tuKhaiDung: true CHỈ KHI mọi số khớp VÀ không còn sai sót chặn/nặng.
```

### Ba câu hỏi nghiệm thu đã bắt được lỗi thật

**"Nó có làm đỏ cái gì đang xanh không?"** — bắt được migration của gói này làm đỏ
test của gói kia.

**"Test có bắt được lỗi không?"** — thử ngược bắt được một bài test xanh giả: nó cắt
cửa sổ tìm kiếm bằng `src.slice(src.indexOf(...))` nên luôn tìm thấy thứ nó tìm.

**"Con số này tái hiện được không?"** — bắt được nhiều số tự khai sai, và một lần
nghiêm trọng: bài test đòi `count(ops.job_runs) > 0`, xanh suốt vì máy dev đã tích
hàng trăm lượt chạy, **đỏ ngay** khi bộ test chuyển sang cơ sở dữ liệu sạch. Bài đó
vốn sai từ đầu, chỉ được dữ liệu bẩn che cho.

---

## 5. Bộ cổng phải xanh trước khi commit

```bash
# 1. Kiểu — ba project, không được bỏ project nào
npx tsc --noEmit -p apps/hub/tsconfig.json
npx tsc --noEmit -p packages/core/tsconfig.json
npx tsc --noEmit -p tsconfig.tests.json

# 2. Test — PHẢI có DATABASE_URL, nếu không 245 bài bỏ qua
DATABASE_URL=postgres://postgres:postgres@localhost:5434/hub_dev npx vitest run

# 3. pgTAP trên CSDL DỰNG LẠI TỪ ĐẦU
docker exec -i pg_hub psql -U postgres -c "drop database if exists hub_x" -c "create database hub_x"
docker exec -i pg_hub psql -U postgres -d hub_x -c "create extension if not exists pgtap;"
for f in packages/core/db/migrations/*.sql; do docker exec -i pg_hub psql -U postgres -d hub_x -q -v ON_ERROR_STOP=1 -f - < "$f"; done
for f in packages/core/db/fixtures/*.sql; do docker exec -i pg_hub psql -U postgres -d hub_x -q -v ON_ERROR_STOP=1 -f - < "$f"; done
# rồi từng file test, VÀ SO số assertion với plan(N)

# 4. Năm cổng quét
node tools/check-sync.mjs      # luật đồng bộ + 168 đối tượng schema có tên trong tài liệu
node tools/check-html.mjs      # hồ sơ người: thẻ cân bằng, id duy nhất, ký tự cấm
node tools/schema-lint.mjs     # migration trùng số, bảng thiếu FK, đối tượng thiếu test
node tools/secret-scan.mjs     # chìa khoá bí mật lọt vào mã
node tools/contracts-lint.mjs  # bề mặt hợp đồng khớp bản chụp

# 5. Hub có BẤM ĐƯỢC không (không chỉ trả 200)
bash tools/start-local.sh
```

**Mốc tính tới 02/08/2026:** 908 vitest / 51 file · 871 assertion pgTAP / 50 file ·
168 đối tượng schema · 98 tên hợp đồng.

---

## 6. Bảy cái bẫy đã sập thật — đừng sập lại

> **Cập nhật 02/08/2026 — hai bẫy nay có CỔNG, không còn chỉ có lời dặn.**
> Bẫy 6.1 và 6.2 đều sập THÊM một lần nữa sau khi mục này được viết, bởi chính người viết
> ra nó. Một lời dặn mà tác giả của nó còn đi vào thì nó không phải hàng rào — nó là một
> mẩu giấy dán trên tường. Nay:
>
> · **6.1** → `tools/canh-build.mjs`, chạy tự động ở `prebuild` của `apps/hub`. Nó KHÔNG
>   hỏi "có ai nghe cổng không" (chặn cả ca vô hại) mà hỏi "cái đang nghe có phải đang
>   phục vụ CHÍNH bản dựng tôi sắp ghi đè không" — so `BUILD_ID` trên đĩa với `BUILD_ID`
>   trong HTML máy chủ trả về. Bốn ca cho qua, mỗi ca một phép kiểm riêng trong
>   `tests/unit/canh-build.test.ts`.
> · **6.2** → `tests/unit/test-khong-duoc-xanh-rong.test.ts`, một bài test canh chính bộ
>   test: cấm `if (!ready) return;` trong `it()` (bài sẽ được đếm là ĐẠT dù không chạy gì)
>   và cấm `describe.skipIf` trên cờ chỉ biết được sau `beforeAll`.
>
> Ba cái bẫy còn lại vẫn chỉ có lời dặn. Đọc kỹ chúng.
>
> **Bẫy thứ tám, thêm 02/08/2026 — ĐẾM CẢ CHÚ THÍCH.** Tôi mắc HAI LẦN trong một ngày:
> báo "60 nhánh phân quyền" (thật ra 54 — sáu dòng kia nằm trong chú thích), rồi viết một
> phép kiểm đòi "emoji 👋 chỉ một lần" và nó đỏ với số 4, ba trong đó là những dòng KỂ LẠI
> luật. Kho này viết chú thích rất dài và rất nhiều tên biến; mọi phép đếm bằng `grep` đều
> phồng lên. **Bỏ chú thích trước khi đếm**, và nói rõ con số nào là "mã thật".
>
> Nguy hiểm hơn con số sai là **kết luận sai theo sau nó**: từ "60 nhánh rải bốn file" tôi
> suýt đi gộp hai cây mobile/desktop của trang chủ làm một — trong khi hai cây riêng là
> quyết định ĐÚNG, có lý do đo được (dựng cả hai rồi ẩn bằng CSS khiến máy yếu trả tiền
> cho cây nó không bao giờ thấy). Đếm sai dẫn tới chẩn sai.

### 6.1 `next build` giết máy chủ đang chạy

Đã sập **hai lần**, lần thứ hai chủ đầu tư phát hiện bằng điện thoại. Triệu chứng:
trang trả 200, chữ hiện đủ, **mọi nút chết** — vì `main-app.js` 404 nên React không
bao giờ gắn vào. Console không một dòng lỗi.

Đã vá bằng cách tách thư mục (`.next-prod` cho bản chạy thật, `.next` cho chế độ lập
trình viên, xem `next.config.mjs`). Nhưng agent vẫn phải **KHÔNG chạy build khi máy
chủ đang phục vụ**.

Kiểm bằng `bash tools/start-local.sh` — bước 2b thử từng tệp JS trong HTML trả về.
**"200" là xanh giả.**

### 6.2 `vitest run` không có DATABASE_URL

In ra `Test Files 50 passed (50)` trong khi **245 bài bỏ qua**. Số skipped nằm ở dòng
thứ hai, chỗ mắt lướt qua. Nay có dải cảnh báo, nhưng vẫn phải đọc.

### 6.3 pgTAP dừng dở KHÔNG in `not ok`

Một file khai `plan(40)` mà chết ở assertion 3 trông **y hệt** file sạch nếu chỉ đếm
`not ok`. Phải so số assertion chạy được với `plan(N)` từng file. Có cổng ở
`tools/pgtap-plan-check.mjs` + mốc `tools/pgtap-moc.tsv`.

### 6.4 Bộ test dùng chung `hub_dev` với sổ vận hành

Nó **bịa được lịch sử chạy máy**, và đã bịa: 313 dòng `flag_engine` trong 2 ngày với
nhịp khai 1 lần/ngày. Buồng lái báo "quét lúc 13:05 hôm nay" nhờ vitest chứ không nhờ
lịch nào. Đã tách sang `hub_test`, nhưng **công cụ chạy tay vẫn ghi vào hub_dev**.

### 6.5 Giấu trên màn không phải là không gửi

`login/page.tsx` truyền danh sách tài khoản xuống một client component; Next đóng gói
**mọi prop** vào HTML. Giao diện không vẽ ra, nhưng khách vô danh vẫn nhận đủ 9 mã
định danh và 9 email. Kiểm bằng `curl` + `grep`, đừng kiểm bằng mắt.

### 6.6 Nhiều tiến trình `node server.mjs` cùng ghi một thư mục

Sinh ra đúng triệu chứng 6.1. Kiểm:

```bash
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*server.mjs*' }"
```

### 6.7 Agent chạy song song làm số đo trôi

Hai gói cùng đợt gieo dữ liệu, và con số một gói đo lúc 14:00 đã sai lúc 16:00. Mọi
con số trong tự khai phải kèm **thời điểm đo**, và nghiệm thu phải đo lại chứ không
đối chiếu.

### 6.8 Hai agent cùng dùng `hub_test` — một bên xoá database dưới chân bên kia

Đo thật 06/08/2026, đợt ADR-031: gói viết migration `0054` chạy pgTAP thì **`hub_test` bị
drop giữa chừng hai lần** — lượt một chết ở `0007`, lượt hai ở `0011` với
`FATAL: database "hub_test" does not exist`. Nguyên nhân: `tests/helpers/chuan-bi-db-test.ts`
**dựng lại `hub_test` từ số không** mỗi khi "dấu vân" (bộ migration + seed) lệch, mà lúc đó có
gói khác đang chạy `vitest run tests/db` trên chính database ấy.

Cùng ngày, cùng cơ chế, một triệu chứng khác đã ghi ở `DEBT.md` #54: lượt chạy **đầu tiên**
sau khi thêm migration làm đỏ vài file test không liên quan, với thông báo trỏ sai hoàn toàn
(`function care.resolve_threshold does not exist` — một hàm đang tồn tại).

**Luật cho agent, cho tới khi nợ #54 được trả:**

- Gói nào **thêm migration** thì đừng chạy `vitest run tests/db` song song với gói khác. Chạy
  pgTAP trên **database riêng tự dựng tự xoá** (`hub_<tên-gói>_test`), rồi dựng lại `hub_test`
  đầy đủ ở cuối phiên — đúng cách gói `0054` đã làm sau khi vấp.
- Người điều phối: đừng giao hai gói chạm CSDL cùng lúc nếu một trong hai thêm migration.
- Thấy `database "hub_test" does not exist` giữa một lượt test thì **đừng đi tìm lỗi trong mã
  của mình** — đọc mục này trước.

### 6.9 HAI bộ chạy test dùng chung `hub_test`, và một bài xanh nhờ rác của bài khác

Đo và **tái hiện được** 07/08/2026, đợt ADR-032. Bắt đầu từ một triệu chứng dễ gạt đi: `vitest run`
đỏ 2 bài, chạy lại xanh, chạy lại nữa xanh. Ba nguyên nhân KHÁC NHAU chồng lên nhau, và gạt đi
ở bất kỳ tầng nào cũng bỏ lọt hai tầng còn lại.

**(a) `tools/run-db-tests.sh` giả định `hub_test` RỖNG.** Nó replay từng migration từ `0001`.
Nhưng `tests/helpers/chuan-bi-db-test.ts` để lại một `hub_test` đã migrate đầy đủ. Chạy pgTAP
ngay sau vitest ⇒ chết ở `0002` với `relation "school_networks" already exists`, **thoát mã 3**,
trước khi chạy một assertion nào. Một màu đỏ không nói gì về mã nguồn.

**(b) Chiều ngược lại tệ hơn vì nó KHÔNG đỏ ngay.** `run-db-tests.sh` nạp fixture và các bài pgTAP
ghi vào `hub_test`. Lượt `vitest` kế tiếp thấy "dấu vân" (bộ migration + seed) **vẫn khớp** nên
dùng lại database — rồi đếm ra những con số không phải của nó. Đo được: `tests/db/perf.test.ts`
đòi **0** lượt tra `core.users` và nhận **3.547**. Một phép đo bộ đệm trở thành vô nghĩa vì bảng
đã bị người khác cày qua.

> **Đã sửa:** `run-db-tests.sh` nay **drop + create `hub_test`** ở bước 0 (sau cổng #41 chặn mọi
> tên không kết thúc bằng `_test`). Một việc chữa cả hai chiều: database biến mất kéo theo
> `test_meta.dau_van`, nên lượt vitest kế tiếp thấy "dấu vân lệch" và tự dựng lại phần của nó.
> Hai bộ không cần biết về nhau. Giá: ~30 giây replay mỗi lượt — rẻ hơn nửa giờ người đi tìm một
> lỗi không tồn tại.

**(c) Và bên dưới cả hai: một bài test XANH VÌ RÁC CỦA BÀI KHÁC.** Sau khi sửa (a)+(b), mỗi lượt
pgTAP lại buộc vitest dựng lại `hub_test` — và thế là hai bài trong `tests/db/chuong-viec-cho.test.ts`
đỏ **đều đặn**. Đo thẳng vào seed: `select status, count(*) from care.care_cases` trên một
database vừa dựng trả về **0 dòng**. Hai bài đó khẳng định `counselor.open_cases` phải có mặt,
mà chúng **không tự tạo ca nào** — chúng chỉ xanh khi một FILE TEST KHÁC chạy trước và để lại
một ca đang mở.

Nghĩa là hai phép kiểm đã xanh suốt nhiều ngày **vì một lý do không liên quan gì tới thứ chúng
tưởng mình đo**, và chúng sẽ đỏ ở đúng chỗ đắt nhất: lượt CI đầu tiên trên một database trắng,
hoặc ngày ai đó đổi thứ tự file. Cùng họ với nợ #41 ("bộ test bịa được lịch sử chạy máy") — chỉ
khác là ở đây bộ test **mượn dữ liệu của người khác** thay vì tự bịa. Đã sửa: hai bài tự dựng ca
của mình và dọn trong `finally`.

**Luật rút ra, áp cho mọi bài test chạm CSDL:**

- **Không bài nào được khẳng định trên dữ liệu nó không tự dựng ra.** Seed chỉ bảo đảm những gì
  `seed.mjs` viết ra; mọi thứ khác là rác của người khác.
- **Nghiệm thu một bài test = chạy nó MỘT MÌNH trên một database vừa dựng từ số không.** Xanh
  trong bộ đầy đủ không chứng minh gì:
  ```
  docker exec -i pg_hub psql .../postgres -c "drop database if exists hub_test with (force);"
  DATABASE_URL=... npx vitest run tests/db/<file>.test.ts
  ```
- Thấy "chạy lại là xanh" thì **đó là một phát hiện, không phải một lời bào chữa**. Ba lần chạy
  lại ở đây đã giấu ba lỗi thật.

---

## 7. Còn phải làm gì

Bốn việc chủ đầu tư đã nêu, chưa làm, kèm đặc tả đủ để giao thẳng cho agent:

### 7.1 Báo cho người dùng biết đang tải

Mọi chuyển trang phải có tín hiệu. Hôm nay bấm xong màn hình đứng yên vài giây, người
dùng không biết máy có nhận không.

- Thanh tiến trình mảnh ở đỉnh trang khi điều hướng (Next App Router: dùng
  `useLinkStatus` hoặc một provider nghe `usePathname`).
- Mỗi màn có khung xương riêng, **không dùng chung một spinner** — khung xương phải
  có hình dạng của nội dung sắp tới.
- File có sẵn để bắt chước: `apps/hub/components/ui/query-state.tsx` (đã có
  `LoadingState`, `ErrorState`, `EmptyState`).

### 7.2 Mini app: màn giới thiệu thay cho màn trắng

Mục tiêu chủ đầu tư đặt: **mở mini app trong 3 giây**. Hôm nay là màn trắng chờ mãi.

- Trong lúc iframe nạp: hiện logo app, tên app, một dòng nói app này làm gì, và một
  thanh tiến trình **thật** (không phải vòng xoay giả).
- Quá 3 giây: nói rõ "đang chờ ứng dụng bên ngoài".
- Quá 10 giây: nút "Thử lại" + nút "Quay về Hub". **Không quay mãi.**
- Nội dung giới thiệu lấy từ `apps/hub/server/embed/registry.ts` — thêm trường `intro`
  và `logoUrl` vào manifest, đừng viết chết trong component.
- Đo lại bằng `performance.now()` trong trình duyệt thật, không đoán.

### 7.3 Phích cắm mini app — ĐÃ XONG 02/08/2026

Migration `0052` + màn `/quan-tri/mini-app` + `danh-cho-may/09-cam-mini-app.md` +
`tools/mini-app-mau/index.html`. Nợ #8 đã trả.

Cắm một app mới nay **không sửa một dòng mã lõi nào**: khai trên màn quản trị, cấp vai,
bấm bật. Tắt là một nút, có hiệu lực ở trang ngay lượt request kế tiếp (CSP theo kịp
trong ≤10 giây — đo được, xem nợ #54).

**Ba điều đo được trong lúc làm, đáng nhớ hơn cả kết quả:**

1. **RLS trên UPDATE không ném lỗi.** Chính sách chỉ-quản-trị lọc HÀNG, không từ chối
   câu lệnh: câu `update` của cô giáo chạy xong, đổi 0 dòng, im lặng tuyệt đối. `insert`
   thì ném `42501` thật. Mọi handler ghi phải tự đọc `rowCount` — không thì màn hình báo
   "đã lưu" cho một thao tác chưa từng xảy ra.
2. **Bộ chạy migration đòi `begin;`…`commit;` bọc cả file.** Thiếu thì nó từ chối và nói
   rõ vì sao — nhưng file vẫn chạy ngon qua `psql`, nên chỉ `tests/db/migrate.test.ts`
   (dựng lại cả kho từ database rỗng) mới bắt được.
3. **`describe.skipIf(!ready)` đọc `ready` lúc THU THẬP, trước `beforeAll`.** Cả 15 bài
   "xanh" mà không chạy bài nào. Khuôn đúng của kho là `it("…", async ({ skip }) => { if
   (!ready) return skip(); … })`.

### 7.4 Hoàn thiện bản điện thoại — ĐÃ RÀ MỘT LƯỢT 02/08/2026

Bộ đo: `tools/ra-mobile.js` — dán vào Console của trình duyệt, gõ `await raMobile()`. Nó
nạp từng trang vào một `<iframe>` 360/375px NGAY TRONG trang đang mở, nên cùng engine,
cùng CSS, cùng JavaScript với bản thật.

**Lượt rà 02/08/2026: 6 vai × 2 khổ, không trang nào tràn ngang.** Ba lỗi vùng chạm đã
sửa (đường tắt "Bỏ qua menu" 257×41 · "Về trang chủ" 81×19 ở /checkin và /ho-so · nút
"Xem Báo cáo Trưởng thành" 290×41 ở 1280px).

Hai điều phải đọc trước khi rà lại:

1. **Bộ đo từng báo động giả ba lần** — ba ô nhập "cao 21px" trên `/gvcn/diem-danh`,
   `/dieu-hanh`, `/dieu-khoan`. Cả ba đều nằm trong `<label>` cao 44px, tức vùng chạm
   thật là cái label. Luật `closest('label')` sinh ra từ đó. Thêm luật mới thì kiểm cả
   chiều ngược lại: nó có báo cái đang đúng không.
2. **Cổng CI chỉ giữ được ẢNH CHỤP của hai chỗ đã sửa** (`a11y.test.ts` mục 2b). Đo chiều
   cao thật cần một trình duyệt, mà repo chưa có Playwright — nói thẳng đây là việc của
   người rà, đừng đọc bộ test thành "mobile đã an toàn".

### 7.4b Điều hướng: MỘT bản khai, đừng viết `if` theo vai nữa (02/08/2026)

Trước khi thêm bất kỳ màn nào: **`apps/hub/lib/man-hinh.ts` là nguồn duy nhất** cho câu
"vai này thấy gì". Thêm màn = thêm MỘT dòng ở đó, và nó tự có mặt ở lưới trang chủ, menu
trái và thanh tab điện thoại đúng như dòng đó khai.

Trước 02/08/2026 ba file tự trả lời riêng (`server/mini-apps.ts` · `components/hub-sidebar.tsx`
· `components/tab-bar.tsx`) và đã lệch **ba lần**, mỗi lần đều im lặng — màn Điều hành
chạy hai ngày mà không đường nào dẫn tới; cô tâm lý thấy hộp việc trên máy tính nhưng
không thấy trên điện thoại; mục "Hồ sơ" đứng ba nơi cùng lúc.

- Khai `vai` ở đó **phải khớp câu `redirect()` thật** trong `page.tsx`. Cổng
  `tests/unit/man-hinh.test.ts` (28 phép) đối chiếu hai chiều — khai sai là CI đỏ.
- Muốn xem cả sáu vai cùng lúc: `/quan-tri/xem-truoc` (vai `admin`). Nó GỌI đúng ba hàm
  sản phẩm gọi, không dựng bảng mô tả riêng.
- Mini App NGOÀI **không** khai ở đây — chúng ở bảng `core.embedded_apps` (`0052`), sửa
  bằng màn `/quan-tri/mini-app`. Xem `danh-cho-may/09-cam-mini-app.md`.

### 7.5 Tính năng mới — CHỜ CHỦ ĐẦU TƯ

`Học tập` và `Y tế` đang đứng ở thể mờ "giai đoạn 2" trên trang chủ. **Đừng tự chọn.**
Hỏi trước khi xây; đoán sai ở đây là mất nhiều ngày.

---

## 8. Ba việc chỉ chủ đầu tư làm được

Agent không đi qua được, đừng cố:

1. **Máy chủ thuê + tên miền + xác thực hai lớp** (ADR-019).
2. **Google Workspace + Zalo OA** → đăng nhập thật → gỡ cửa đăng nhập tạm (nợ #19).
3. **Cắm lịch job vào máy chạy 24/7** — script đã viết
   (`tools/jobs/dang-ky-lich.ps1`), nhưng đăng ký tác vụ hệ thống là đổi cấu hình máy
   người dùng. Agent **không được tự chạy**. Nợ #33.

Ngoài ra: bản chạy thật cần hai biến môi trường mà máy mới nào cũng phải cấp lại —
`OIDC_JWKS` và `OIDC_COOKIE_KEYS`. Máy chủ sẽ từ chối khởi động nếu thiếu, và in đúng
lệnh sinh khoá. Đó là hàng rào cố ý, không phải lỗi.

---

## 9. Một câu để kết

Trong bảy đợt, **mọi lỗi nghiêm trọng đều là lỗi im lặng** — không phải lỗi ném
exception, mà là một con số 0 trông như một câu trả lời, một bảng trống trông như tin
tốt, một cổng canh chưa từng bắt được gì.

Nên nếu chỉ giữ được một câu trong tài liệu này, giữ câu này:

> **Đừng hỏi "nó có chạy không". Hỏi "nếu nó hỏng thì tôi biết bằng cách nào".**
