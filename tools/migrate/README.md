# Bộ chạy migration và sổ ghi

Thi hành nợ `DEBT.md` #23. Hai mảnh:

| Mảnh | Ở đâu | Việc |
|---|---|---|
| Sổ ghi | `packages/core/db/migrations/0050_so_ghi_migration.sql` → bảng `ops.schema_migrations` | Một dòng = một file đã có mặt trong database này |
| Bộ chạy | `tools/migrate/migrate.mjs` | Đọc thư mục migration, đối chiếu với sổ, áp phần còn thiếu |

## Vì sao có

Trước đây cách duy nhất để áp migration là vòng lặp trong `tools/run-db-tests.sh`:

```bash
for f in migrations/*.sql; do psql -f "$f"; done
```

Vòng lặp đó đúng cho một database **dựng lại từ đầu** và chỉ cho ca đó. Với 48 file đã
áp bằng tay lên `hub_dev` và một máy chủ thật sắp dựng, ba câu hỏi không ai trả lời được:

1. Máy chủ đang ở migration số mấy?
2. File `0031` trên đĩa hôm nay có còn đúng cái đã áp lên máy chủ tháng trước?
3. Ai áp, lúc nào, mất bao lâu?

Câu 2 là câu **im lặng nhất**: sửa một dòng trong migration đã áp không gây lỗi nào cả —
file không được chạy lại (đã có trong sổ) nên database giữ hành vi cũ trong khi kho mô tả
hành vi mới. Cột `checksum` sinh ra chỉ để bắt đúng ca đó.

## Ba lệnh

```bash
# Chỉ xem, không ghi gì. Trả mã thoát 1 nếu phát hiện lệch băm / mất file ⇒ dùng được như cổng CI.
DATABASE_URL=postgres://… node tools/migrate/migrate.mjs status

# Áp phần còn thiếu. --dry-run in ra đúng danh sách sẽ chạy mà không gửi câu lệnh nào.
DATABASE_URL=postgres://… node tools/migrate/migrate.mjs up --dry-run
DATABASE_URL=postgres://… node tools/migrate/migrate.mjs up

# NHẬN NỢ BAN ĐẦU: ghi nhận các file ĐÃ có sẵn trong database mà không chạy lại chúng.
DATABASE_URL=postgres://… node tools/migrate/migrate.mjs baseline --to=0049 --ghi-chu="…"
```

Thêm `--dir=<đường dẫn>` để đổi thư mục migration, `--url=<chuỗi>` để đổi kết nối.

## Bước phải làm đúng: nhận nợ ban đầu

**Sổ trống KHÔNG có nghĩa "chưa áp gì".** Trên `hub_dev`, 49 migration đã áp bằng tay
trước khi có sổ. Nếu bộ chạy mở sổ ra thấy trống rồi kết luận "chưa áp gì", lần chạy đầu
tiên sẽ áp lại toàn bộ lên một database đã có sẵn mọi thứ.

Hai cổng chặn đối xứng, và cả hai đều được thử ngược trong `tests/db/migrate.test.ts`:

- `up` **từ chối chạy** khi sổ chưa tồn tại mà database đã có `core.users` → chỉ sang `baseline`.
- `baseline` **từ chối chạy** trên database rỗng → nhận một món nợ mình không có nghĩa là
  lần `up` kế tiếp bỏ qua đúng những file chưa bao giờ chạy, và chỉ lộ ra khi ứng dụng gọi
  một bảng không tồn tại.

Dòng nhận nợ mang `nhan_no = true` và **không có** `duration_ms` (ràng buộc
`schema_migrations_nhan_no_chk` cưỡng chế): "tôi tin file này đã có sẵn" phải phân biệt
được với "tôi đã chạy file này".

Thứ tự đã chạy thật trên `hub_dev` ngày 02/08/2026:

```
baseline --to=0049   → 49 dòng nhan_no = true (không chạy file nào)
                     + 0050 chạy thật để dựng chính cái sổ (45 ms)
up                   → "Không có gì để áp — 50/50 file đã ở trong sổ."
```

## Hình dạng file migration mà bộ chạy đòi

Mỗi file phải là `begin;` … `commit;` với `commit;` là **câu SQL cuối cùng** (sau đó chỉ
được còn chú thích). Cả 50 file của kho đều vậy.

Lý do không phải thẩm mỹ. Bộ chạy **chèn câu ghi sổ vào ngay trước `commit;` của chính
file** rồi gửi cả khối đi một lượt, để migration và dòng sổ nằm trong **cùng một
transaction** — hỏng ở bất kỳ đâu thì cả hai cùng biến mất.

Cách ngây thơ (mở transaction ở phía Node rồi gửi thân file vào) hỏng thầm lặng: `begin;`
bên trong chỉ sinh WARNING, còn `commit;` bên trong **commit luôn transaction của bộ
chạy**, nên dòng sổ rơi ra ngoài.

File buộc phải chạy ngoài transaction (ví dụ `create index concurrently`) thì khai tường
minh bằng dòng đánh dấu `-- migrate:khong-transaction` ở đầu file. Lúc đó bộ chạy ghi sổ
bằng câu lệnh rời và **in rõ** rằng tính nguyên tử là trách nhiệm của người viết file đó.

## File mồi

`0050_so_ghi_migration.sql` mang dòng đánh dấu `-- migrate:so-ghi`. Khi sổ chưa tồn tại
trên một database **rỗng**, bộ chạy chạy file này **trước tiên** (trước cả `0001`) để có
chỗ ghi dòng đầu, rồi áp 0001…0049 theo thứ tự.

Hệ quả phải nhớ: `0001` mới là chỗ tạo vai `backup_reader`, nên câu GRANT trong file mồi
bị bỏ qua ở lần chạy đầu. Bộ chạy vì thế **chạy lại file mồi** ở cuối lượt `up` (file này
idempotent theo thiết kế). Không có bước đó thì database dựng bằng `up` thiếu đúng một
quyền so với database dựng bằng `tools/run-db-tests.sh` — hai đường dựng ra hai kết quả
khác nhau là loại lệch tệ nhất, vì bài test chạy trên đường này còn máy chủ chạy trên
đường kia. `tests/db/migrate.test.ts` ghim lại điều đó.

## Sổ nhật ký chạy máy

Mỗi lượt `up` / `baseline` ghi một dòng `ops.job_runs` với `job_name = 'migrate'` — cùng
sổ với mọi job nền khác, vì "ai áp migration lên máy chủ lúc mấy giờ, kết quả gì" đúng là
câu hỏi bảng đó sinh ra để trả lời.

**Cố ý không** khai `migrate` vào `ops.job_schedule`: migration không có nhịp, nên khai
vào đó là để `ops.v_job_health` (`0041`) báo "quá hạn" mỗi ngày không ai áp gì — một báo
động giả mỗi ngày là cách nhanh nhất giết một bảng cảnh báo. pgTAP `0050` ghim lại.

## Quan hệ với `tools/run-db-tests.sh`

Hai công cụ, hai việc khác nhau, **không** thay thế nhau:

- `run-db-tests.sh` dựng một database **test** từ số không rồi chạy pgTAP. Nó cố ý dùng
  vòng lặp thô: một bộ test mà phụ thuộc vào bộ chạy migration thì không kiểm được bộ chạy.
- `migrate.mjs` là đường lên **database đã sống** (hub_dev, staging, máy chủ thật).

Hệ quả: database do `run-db-tests.sh` dựng có sổ ghi **rỗng** (bảng có, không dòng nào).
Đó là đúng — không ai chạy `up` lên một database test dùng một lần. Chĩa `up` vào nó thì
cổng "sổ trống + database đã sống" sẽ từ chối, đúng như thiết kế.
