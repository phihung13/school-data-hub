// tests/helpers/teardown.ts — đóng pool Postgres sau mỗi file test.
//
// Vì sao cần: packages/core/db/client.ts giữ một `pg.Pool` module-level với
// max: 10. Pool còn socket mở thì tiến trình còn việc trong event loop; vitest
// chờ tới hết timeout rồi mới cưỡng chế thoát — chạy `vitest run` trên máy dev
// treo lại vài chục giây mỗi lần, và trong CI thì đó là thời gian runner trả tiền.
//
// Vì sao là `setupFiles` chứ KHÔNG phải `globalTeardown` (dù đó là chỗ trực giác
// hay nghĩ tới đầu tiên): globalSetup/globalTeardown chạy trong TIẾN TRÌNH CHÍNH
// của vitest, còn test chạy trong worker riêng. Pool được tạo lazy bên trong
// worker, nên `closePool()` gọi ở globalTeardown sẽ đóng một pool khác — thường
// là pool chưa từng tồn tại — và pool thật vẫn treo nguyên. Đặt ở setupFiles thì
// hook chạy đúng trong worker đang giữ kết nối.
//
// Mỗi file test có registry module riêng nên pool cũng là của riêng file đó;
// đóng sau mỗi file không làm file sau mất kết nối (getPool() tự dựng lại).
import { afterAll } from "vitest";
import { closePool } from "@hub/core/db";

afterAll(async () => {
  await closePool();
});
