// tests/global-setup-db.ts — chạy MỘT LẦN cho cả lượt `vitest run`, trong tiến trình chính.
//
// Việc duy nhất: bảo đảm database test đã sẵn sàng trước khi worker đầu tiên mở pool.
// Đặt ở globalSetup chứ không ở setupFiles vì setupFiles chạy lại cho TỪNG file test
// (45 lần) — dựng database 45 lần là cách chắc chắn để không ai chạy bộ test nữa.
//
// Không có DATABASE_URL thì im lặng thoát: `vitest run tests/unit` trên máy chưa dựng
// Postgres, và job `unit` trong CI, đều rơi vào nhánh này. Lớp test chạm CSDL vẫn có
// cổng riêng của nó (tests/helpers/db.ts: requireDb + inCi) nên không có đường nào để
// một lượt CI thiếu database mà vẫn báo xanh.
//
// NHƯNG "im lặng thoát" KHÔNG được im lặng với NGƯỜI ĐANG NGỒI ĐÓ (thêm 02/08/2026).
// Bắt gặp thật ngay trong ngày: chạy `npx vitest run` quên đặt DATABASE_URL, vitest in
//     Test Files  50 passed (50)
//     Tests  656 passed | 245 skipped (901)
// Dòng đầu đọc là XANH HẾT, và 245 bài chạm cơ sở dữ liệu — toàn bộ phần kiểm phân
// quyền, riêng tư, RLS — đã không chạy một bài nào. Con số 245 nằm ở dòng thứ hai, chỗ
// mắt lướt qua. Cổng `requireDb + inCi` chặn được CI, nhưng người chạy tay thì không.
// Nên ở đây in một dải cảnh báo không thể bỏ sót. Vẫn KHÔNG ném lỗi: `vitest run
// tests/unit` trên máy chưa dựng Postgres là việc hợp lệ, chặn nó là phá một luồng đúng.
import { chuanBiDbTest } from "./helpers/chuan-bi-db-test.ts";

export async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    const vach = "─".repeat(74);
    console.warn(
      `\n${vach}\n` +
        `  KHÔNG CÓ DATABASE_URL — MỌI BÀI CHẠM CƠ SỞ DỮ LIỆU SẼ BỊ BỎ QUA.\n` +
        `  Lượt chạy này KHÔNG kiểm phân quyền, riêng tư, RLS hay bất kỳ luật nào\n` +
        `  sống dưới cơ sở dữ liệu. Dòng "Test Files ... passed" bên dưới CHỈ nói về\n` +
        `  phần đã chạy — đọc thêm số "skipped" ngay cạnh nó.\n\n` +
        `  Muốn chạy đủ:\n` +
        `    DATABASE_URL=postgres://postgres:postgres@localhost:5434/hub_dev npx vitest run\n` +
        `${vach}\n`,
    );
    return;
  }
  await chuanBiDbTest();
}
