// vitest.config.ts — kiểm thử TypeScript cho toàn monorepo.
//
// Vì sao đặt ở gốc thay vì mỗi package một config: cả apps/hub lẫn packages/core
// dùng chung alias `@hub/core/*`, và phần lớn test giá trị nhất là test CẮT NGANG
// (router gọi xuống contract, contract khớp schema DB). Một config chung thì
// `pnpm test` ở gốc chạy hết, không ai phải nhớ chạy từng nơi.
//
// Test chạm cơ sở dữ liệu thật nằm ở `tests/db/**` và cần DATABASE_URL. Test thuần
// (contract, thuật toán, hàm tiện ích) nằm ở `tests/unit/**`, không cần gì cả —
// tách hai loại để CI chạy được lớp nhanh trước, lớp cần Postgres sau.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Dựng/dùng lại database RIÊNG cho test (`hub_test`), một lần cho cả lượt chạy.
    // Trước 02/08/2026 bộ test dùng chung `hub_dev` với sổ vận hành và đã bịa ra lịch
    // sử chạy máy: một lượt `vitest run` để lại 5 dòng `ops.job_runs`, cộng dồn thành
    // 313 dòng khiến `ops.v_job_health` báo "quét ok lúc 13:05 hôm nay" mà không lịch
    // nào chạy — nợ #41. Xem tests/helpers/db-test-url.ts.
    globalSetup: ["tests/global-setup-db.ts"],
    // THỨ TỰ CÓ NGHĨA: đổi DATABASE_URL trước, rồi mới tới hook đóng pool.
    // · setup-db-url.ts — worker của vitest KHÔNG thừa hưởng env đặt ở globalSetup,
    //   nên việc đổi tên database phải làm lại bên trong worker, trước mọi import.
    // · teardown.ts — đóng pool Postgres sau mỗi file (xem lý do KHÔNG dùng
    //   globalTeardown viết trong chính file đó).
    setupFiles: ["tests/setup-db-url.ts", "tests/helpers/teardown.ts"],
    // Test chạm DB dùng chung một Postgres — chạy song song sẽ giẫm chân nhau ở
    // các bảng seed. File chạy tuần tự, trong file vẫn song song được.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@hub/core/contracts": `${root}packages/core/contracts/index.ts`,
      "@hub/core/auth-adapter": `${root}packages/core/auth-adapter/index.ts`,
      "@hub/core/db": `${root}packages/core/db/client.ts`,
      "@": `${root}apps/hub`,
    },
  },
});
