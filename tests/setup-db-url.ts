// tests/setup-db-url.ts — đổi DATABASE_URL sang database test, TRONG worker, trước mọi import.
//
// Vì sao phải làm lại ở đây dù globalSetup đã dựng database: biến môi trường đặt ở tiến
// trình chính KHÔNG chảy sang worker của vitest. Worker đọc `process.env.DATABASE_URL`
// nguyên bản của người gõ lệnh — tức `hub_dev`. File này là chỗ duy nhất chặn được.
//
// Vì sao đặt TRƯỚC teardown.ts trong `setupFiles`: `packages/core/db/client.ts` đọc
// DATABASE_URL trong `getPool()` (lazy), nhưng chỉ cần một file test lỡ mở pool sớm là
// cả file đó chạy nhầm database. Thứ tự trong mảng setupFiles là thứ tự nạp; giữ file
// này ở vị trí đầu tiên.
//
// KHÔNG có nhánh "bỏ qua khi thấy có vẻ ổn": nếu vì lý do nào đó không đổi được tên,
// ta ném lỗi. Chạy test lên database vận hành một lần là đủ để bịa ra lịch sử chạy máy
// (nợ #41) — im lặng ở đây đắt hơn nhiều so với một lượt test đỏ.
import { urlDbTest, tenDatabase } from "./helpers/db-test-url.ts";

const goc = process.env.DATABASE_URL;
if (goc) {
  const dich = urlDbTest(process.env);
  if (!dich) throw new Error("Không suy ra được database test từ DATABASE_URL.");
  const ten = tenDatabase(dich);
  // Điều kiện viết bằng HẰNG SỐ ngay tại đây, KHÔNG gọi laTenDbTest(). Lý do đo được
  // 00:40 ngày 02/08/2026: khi thử ngược, tôi phá `laTenDbTest()` cho nó trả `true` với
  // mọi tên — và cả hai lớp kiểm đều gọi đúng hàm đó, nên cả hai cùng gật đầu. Một hàng
  // rào gọi lại hàm mình đang canh thì không phải hàng rào. Câu này còn đứng thì phải
  // sửa ĐÚNG dòng này mới đưa được bộ test vào hub_dev.
  if (!(ten === "test" || ten.endsWith("_test") || ten.startsWith("test_"))) {
    throw new Error(
      `Bộ test suýt chạy trên database "${ten}" — chỉ tên dạng _test/test_ mới được phép (nợ #41).`,
    );
  }
  process.env.DATABASE_URL = dich;
}
