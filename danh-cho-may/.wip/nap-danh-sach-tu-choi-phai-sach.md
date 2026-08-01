# Bản nháp cho lượt gộp — gói `nap-danh-sach-tu-choi-phai-sach` (`0048`)

> **Đây là bản nháp, không phải tài liệu chính thức.** Gói này không được chạm
> `danh-cho-may/02-database.md` và `danh-cho-nguoi/ho-so-he-thong.html` vì một gói khác
> (`gói đồng ý`) đang giữ hai file đó trong cùng đợt. Người gộp lấy nội dung dưới đây
> đưa vào đúng chỗ, tăng `sync-version` **cả hai phía** (xem mục 3 — ĐỌC số đang có
> rồi +1, đừng chép số cứng), chạy `node tools/check-sync.mjs`, rồi **xoá file này**.
>
> `0048` **không tạo thêm một tên schema mới nào** — nó `create or replace` đúng hai cái
> tên `02-database.md` đã gọi tên sẵn (`core.promote_cor_row`, `staging.v_loi_nap_danh_sach`).
> Đó là lý do cổng 2 của `check-sync` vẫn xanh trong lúc gói này còn bay. Phần dưới là
> **cập nhật mô tả**, không phải bổ sung đối tượng mới.

---

## 1. Cho `danh-cho-may/02-database.md`

### 1a. Sửa hai dòng đã có trong bảng của mục `0045_nap_danh_sach.sql`

**Dòng `core.promote_cor_row`** — thay ô mô tả bằng:

> Đưa MỘT dòng thô vào `core.students`/`core.classes`/`core.enrollments`, hoặc vào
> `staging.import_errors`. Hợp đồng chép từ `0028`: **không bao giờ ném lỗi vì dữ liệu
> xấu**; trả một trong `raw_not_found` | `already_promoted` | `already_failed` |
> `import_error` | `promoted`. Tham số thứ hai (`p_tao_lop_moi`) mặc định `false` có chủ
> ý — xem "bốn ca không tự động". **Viết lại ở `0048`** (hợp đồng trả về không đổi, thêm
> đúng một lời hứa): trả `import_error` thì ba bảng đích **không đổi một cột nào** — xem
> mục `0048` bên dưới.

**Dòng `staging.v_loi_nap_danh_sach`** — thêm vào cuối ô mô tả:

> `0048` thêm cột `ho_so_chua_ap_dung` (jsonb): với dòng bị từ chối, nó nói *file định đổi
> họ tên / ngày sinh thành gì mà hệ đã KHÔNG đổi* — bốn khoá `ho_ten_trong_so`,
> `ho_ten_trong_file`, `ngay_sinh_trong_so`, `ngay_sinh_trong_file`. Từ chối cả dòng mà
> im luôn là giấu mất việc file có mang theo một thay đổi hồ sơ.

### 1b. Mục mới, đặt ngay sau mục `0046`

#### `0048_nap_mot_dong_la_mot_don_vi.sql` — dòng bị từ chối phải sạch

**Cái hỏng thật, đo trên hub_dev 01/08/2026.** Em `VA-2026-97001` trước lô: họ tên
`Bùi Thị Lan, Jr`, ngày sinh `2015-02-02`, đang học `6A1`. Nạp một lô xếp em sang `6A2`
kèm họ tên khác và ngày sinh khác:

| | Trước `0048` | Từ `0048` |
|---|---|---|
| `promote_cor_row()` trả về | `import_error` — **đúng thiết kế**, chuyển lớp phải có người duyệt | `import_error` |
| Màn hình job in ra | `Đã vào kho: 0 · Vào sổ lỗi: 1` | như cũ |
| `core.students.full_name` sau lô | **`TÊN TRONG FILE`** — bị ghi đè | `Bùi Thị Lan, Jr` |
| `core.students.date_of_birth` sau lô | **`2016-12-31`** — bị ghi đè | `2015-02-02` |
| Lớp mới do một dòng bị từ chối tạo ra (`--tao-lop-moi`) | **ở lại** thành lớp ma | bị hoàn tác |

Người vận hành đọc *"0 vào kho"* rồi tin là không có gì đổi. Kho đã đổi. Đây là **ghi một
phần trong im lặng** — đúng loại hỏng cả hệ này dựng ra để chống, và lần này chính bộ nạp
làm.

**Vì sao xảy ra.** `0045` viết phần ánh xạ theo trình tự tự nhiên của câu chuyện (cơ sở →
lớp → học sinh → ghi danh) và mỗi lần từ chối là một `return core.record_cor_import_error(…)`.
Trong PL/pgSQL, **`return` không hoàn tác gì cả**: mọi `INSERT`/`UPDATE` chạy trước đó đã
nằm trong transaction và ở lại đó. Nên "từ chối" của `0045` thật ra có nghĩa là *"làm tới
đâu giữ tới đó rồi ghi một dòng sổ lỗi"*.

**Rà hết đường promote, không chỉ chỗ được báo.** Ba lệnh ghi, theo thứ tự chúng chạy
trong `0045`:

| Lệnh ghi | Còn cửa từ chối nào phía sau nó |
|---|---|
| `insert core.classes` (`0045:374`, chỉ khi `p_tao_lop_moi`) | 5 cửa: tra lại lớp không ra · em thuộc cơ sở khác · ghi sổ học sinh hỏng · em đang học lớp khác · ghi danh chồng lấn |
| `upsert core.students` (`0045:401`) | 2 cửa: em đang học lớp khác *(ca đo được ở trên)* · ghi danh chồng lấn *(em có kỳ ĐÃ ĐÓNG mà `daterange '[]'` vẫn phủ ngày hiệu lực ⇒ `23P01`)* |
| `insert core.enrollments` (`0045:425`) | không còn cửa nào — lệnh cuối, không hỏng |

`core.doi_soat_vang_mat()` chỉ ghi `staging.import_errors`, không chạm dữ liệu nghiệp vụ —
đã đúng từ đầu, không sửa.

**Cách sửa.** PL/pgSQL chỉ có **đúng một** cách hoàn tác phần đã ghi mà không giết cả
transaction: một khối `begin … exception when … end`, tức một subtransaction. `0048` bọc
toàn bộ phần ánh xạ vào một khối con và đổi mọi cửa từ chối thành
`raise exception using errcode = 'HB045', message = <lý do>, detail = <jsonb>`. Lý do và
ngữ cảnh đi ra ngoài qua `get stacked diagnostics`; **dòng sổ lỗi được ghi ở NGOÀI khối
nên nó sống**, còn mọi thứ ghi trong khối bị cuốn sạch. `'HB045'` là SQLSTATE tự đặt
(HB = Hub, 045 = migration sinh ra hợp đồng), không đụng lớp mã chuẩn nào.

`0048` cũng thêm nhánh **`when others`** mà `0045` không có: hợp đồng nói `promote()`
không bao giờ ném lỗi vì dữ liệu, nhưng `0045` chỉ đỡ được bốn chỗ nó đoán trước; một lỗi
ngoài dự kiến ở chỗ khác sẽ bay ra ngoài và giết cả lô đang chạy. Nay nó cũng thành một
dòng sổ lỗi có tên, và cũng được hoàn tác sạch.

Ngoài ra `0048` **đổi thứ tự**: tra học sinh và quyết chuyện ghi danh **trước** mọi lệnh
ghi. Khối con đã đủ để hoàn tác, nhưng hoàn tác một việc chưa làm là rẻ nhất, và người
đọc mã thấy ngay thứ tự đúng thay vì phải tin vào lưới.

**Vì sao gộp cứng chứ không tách thành hai kết quả** (*"đã cập nhật hồ sơ, chưa chuyển
lớp"*). Đã cân, ba lý do theo thứ tự sức nặng:

1. Ca *"sửa chính tả tên em, lớp chờ duyệt"* **đã có đường đi sẵn**: dòng không đổi lớp
   thì promote bình thường và tên vào kho (có assertion khoá). Đường duy nhất bị chặn là
   *vừa sửa tên vừa đổi lớp*, mà phần chuyển lớp vốn cần người duyệt. Tách chỉ mua được
   "tên vào sớm hơn vài ngày", trả bằng một trạng thái thứ sáu trong hợp đồng trả về.
2. **Từ chối một dòng nghĩa là không tin dòng đó.** Ca hỏng phổ biến nhất của file xuất từ
   Excel là **lệch cột**, và lệch cột làm sai mọi cột cùng lúc. Tin cột `ho_ten` của đúng
   dòng mình đang nghi ở cột `ma_lop` là chọn tin thứ mình không kiểm được.
3. Trạng thái "vào một nửa" **không có đường lùi**: `promoted_at` và `failed_at` loại trừ
   nhau, một dòng vừa-ghi-hồ-sơ-vừa-chờ-duyệt không thuộc cột nào, và câu hỏi §9 *"gọi lại
   promote thì sao"* mất câu trả lời đơn nghĩa.

**Nhưng không được im.** Mỗi dòng bị từ chối **sau khi đã tra ra em** đều kèm khối
`ho_so_chua_ap_dung` trong payload sổ lỗi (tên trong sổ / tên trong file / ngày sinh trong
sổ / ngày sinh trong file), và `staging.v_loi_nap_danh_sach` có một cột riêng cho nó.
Người xử đọc đủ hai vế rồi tự quyết, thay vì không biết có gì để tra.

**Lời hứa in ra màn hình là ràng buộc kỹ thuật.** `tools/jobs/run-nap-danh-sach.mjs` in
thêm hai dòng khi có dòng vào sổ lỗi: *"Dòng vào sổ lỗi KHÔNG đổi một cột nào trong kho"*
và *"Đã vào kho: N ở trên là con số đầy đủ của lần chạy này"*. Hai câu đó có
`core.promote_cor_row` và ba file test đứng sau.

### 1c. Bảng "nghĩa vụ test" — cập nhật hai dòng, thêm một

| File test | Kiểu | Kết quả phải ra |
|---|---|---|
| `packages/core/db/tests/0045_nap_danh_sach_test.sql` | pgTAP, DB dựng lại từ đầu | `plan(55)`, 55 `ok`, 0 `not ok` |
| `packages/core/db/tests/0048_nap_mot_dong_la_mot_don_vi_test.sql` | pgTAP, DB dựng lại từ đầu | `plan(32)`, 32 `ok`, 0 `not ok` |
| `tests/db/nap-danh-sach.test.ts` | vitest, chạy chính lệnh nạp trên Postgres thật | 9 ca |

**Đã thử ngược** (một bài test chưa từng đỏ là một bài test chưa biết mình kiểm cái gì):
lùi `core.promote_cor_row` về định nghĩa `0045` rồi chạy lại — `0045_…_test.sql` đỏ **5**
assertion, `0048_…_test.sql` đỏ **13**, vitest đỏ đúng câu
`expected 'TÊN TRONG FILE' to be 'Bùi Thị Lan, Jr'`. Khôi phục `0048` thì cả ba xanh lại.

Một assertion trong `0045_…_test.sql` đỏ theo cách đáng chú ý:
*"Danh sách chờ người gọi đúng tên em"* — vì `doi_soat_vang_mat()` đọc `core.students.full_name`,
nên khi họ tên bị dòng-đã-bị-từ-chối ghi đè thì **hàng đợi chờ người cũng gọi sai tên em**.
Một lần ghi lén lan sang cả màn hình của người đi xử lỗi.

---

## 2. Cho `danh-cho-nguoi/ho-so-he-thong.html`

Đưa vào mục **"Dữ liệu & ERD"** (`data-pair="danh-cho-may/02-database.md"`), viết bằng lời
thường, đặt cạnh phần nói về việc nhận danh sách từ nhà trường:

> ### Một dòng trong file là một đơn vị — hoặc nhận trọn, hoặc không đụng gì
>
> Khi nhà trường gửi danh sách cả khối, hệ đọc từng dòng một. Có dòng hệ **không dám
> nhận** — ví dụ dòng xếp một em sang lớp khác, vì chuyển lớp là việc phải có người duyệt
> chứ không phải hệ quả của một dòng trong bảng tính. Những dòng đó vào **sổ chờ người**,
> và cuối lượt máy in ra: *"Đã vào kho: 0 · Vào sổ lỗi: 1"*.
>
> Ngày 01/08/2026 chúng tôi phát hiện câu đó **nói không đúng**. Dòng bị từ chối đúng là
> không được chuyển lớp — nhưng nó đã kịp **sửa họ tên và ngày sinh** của em theo file.
> Người vận hành đọc con số 0 rồi yên tâm là chưa có gì đổi, trong khi hồ sơ của một đứa
> trẻ vừa bị thay mà không ai được báo.
>
> Hình dung cho dễ: giống một nhân viên nhận hồ sơ, đọc tới dòng "chuyển lớp" thì dừng
> lại nói *"cái này tôi không có thẩm quyền, để tôi ghi sổ"* — nhưng trước đó đã trót lấy
> bút sửa tên và ngày sinh trong sổ gốc rồi, và không nói với ai.
>
> Nay đã sửa: mỗi dòng được xử **trọn gói**. Nếu có bất kỳ chỗ nào trong dòng đó hệ không
> dám nhận, thì **mọi thứ nó vừa viết cho dòng đó đều được xoá lại như chưa từng viết**,
> và chỉ còn đúng một dòng trong sổ chờ người. Con số "đã vào kho" từ nay là con số thật.
>
> Sổ chờ người cũng nói thêm một câu mà trước đây nó im: *"file này còn định đổi họ tên
> của em từ A thành B, và ngày sinh từ ngày X sang ngày Y — hệ đã không đổi"*. Người xử
> đọc đủ hai vế rồi quyết, thay vì không biết là có gì để quyết.

**Sơ đồ cần sửa:** nếu mục này có hình vẽ luồng "file → kho chính / sổ lỗi", đổi mũi tên
sang sổ lỗi thành mũi tên **hai nét** (một nét ghi sổ, một nét *hoàn tác phần đã viết*),
để hình không còn gợi ý rằng dòng bị từ chối chỉ đơn giản là "rẽ nhánh".

---

## 3. Ghi chú cho người gộp

- `sync-version`: **đọc số đang có rồi +1 ở CẢ HAI phía** — `danh-cho-may/02-database.md`
  (frontmatter) và `<section data-pair="danh-cho-may/02-database.md" data-sync-version="N">`
  trong hồ sơ HTML.
  Nghiệm thu 01/08/2026 sửa lại chỗ này: bản nháp trước ghi cứng "24 → 25", nhưng một gói
  khác cùng đợt đã tiêu mất bước đó — hai phía HIỆN ĐANG ĐỀU LÀ 25. Gộp theo con số cứng
  thì nội dung `0048` vào tài liệu mà version không nhúc nhích, và `check-sync` VẪN XANH vì
  nó chỉ so hai phía với nhau chứ không so với nội dung. Tức luật đồng bộ bị vi phạm trong
  im lặng. Tại thời điểm viết dòng này thì đúng là **25 → 26**; người gộp vẫn phải tự đọc
  lại số trước khi sửa.
- Kiểm sau khi gộp: `node tools/check-sync.mjs` · `node tools/schema-lint.mjs` ·
  `node tools/check-html.mjs`.
- Sổ nợ: `danh-cho-may/DEBT.md` mục **#47** đã ghi phần nợ còn lại của gói này (không
  chặn merge) — người gộp không cần làm gì thêm với nó.
- Xoá file này sau khi gộp xong.
