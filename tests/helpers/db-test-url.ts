// tests/helpers/db-test-url.ts — luật DUY NHẤT quyết định bộ test nói chuyện với database nào.
//
// VÌ SAO FILE NÀY TỒN TẠI (nợ #41, đo được 01/08/2026 và tái đo 02/08/2026)
// ────────────────────────────────────────────────────────────────────────────
// Bộ test TypeScript chạy qua pool thật, mỗi truy vấn một transaction riêng, nên nó
// KHÔNG rollback được như pgTAP: mọi dòng nó ghi đều nằm lại. Trước file này, nó ghi
// thẳng vào `hub_dev` — cùng database mà buồng lái đọc để trả lời câu "quét đêm qua
// có chạy không".
//
// Hậu quả không phải là bẩn dữ liệu cho vui. Đo thật:
//   · `ops.job_runs` trên `hub_dev` có 446 dòng lúc 00:05 ngày 02/08, chạy MỘT lượt
//     `vitest run` xong thành 451 — năm dòng lịch sử chạy máy do bộ test bịa ra.
//   · Cộng dồn, `ops.v_job_health` từng báo `flag_engine` "ok lúc 13:05 hôm nay"
//     trong khi không có lịch nào gọi nó; 313 dòng của hai ngày đều là rác test.
//   · Dải "Quét đêm qua" trên buồng lái (thiết bị an toàn số một sau ADR-026) vì thế
//     được phép in "Hết việc rồi — lớp mình đang ổn!" dựa trên một lần quét chưa từng
//     xảy ra.
// Và chiều ngược lại cũng cắn: cùng lượt chạy đó có 3 bài đỏ
// (`tests/db/man-hinh-moi.test.ts` đòi danh sách kêu cứu rỗng nhưng thấy phiếu người
// khác để lại từ hôm trước) — đỏ vì database dùng chung bẩn, không vì code sai. Đỏ
// kiểu đó là loại đỏ dạy người ta xoá assertion.
//
// Luật: bộ test KHÔNG BAO GIỜ được chạm database vận hành. Nếu `DATABASE_URL` trỏ vào
// một database không phải database test, ta ĐỔI TÊN nó sang bản `_test` tương ứng thay
// vì chạy liều. Không có cờ nào tắt được luật này — muốn chạy trên database khác thì
// đặt thẳng `TEST_DATABASE_URL`, và tên trong đó vẫn phải là tên database test.

/** Tên database đọc từ chuỗi kết nối; trả chuỗi rỗng nếu chuỗi không có tên nào. */
export function tenDatabase(url: string): string {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname.replace(/^\//, ""));
  } catch {
    // Chuỗi kết nối kiểu key=value (`host=... dbname=...`) không phải URL hợp lệ.
    const m = /(?:^|\s)dbname=([^\s]+)/.exec(url);
    return m?.[1] ?? "";
  }
}

/**
 * Tên này có phải tên một database dành riêng cho test không.
 *
 * Cố ý HẸP: chỉ chấp nhận hậu tố `_test`, tiền tố `test_`, hoặc đúng chữ `test`.
 * `hub_tap`, `hub_ci`, `hub_flagchk` — những database rác còn sót trên máy dev — đều
 * KHÔNG lọt, vì "trông giống database tạm" không phải một lời hứa kiểm được.
 */
export function laTenDbTest(ten: string): boolean {
  return ten === "test" || ten.endsWith("_test") || ten.startsWith("test_");
}

/** Đổi tên database trong chuỗi kết nối, giữ nguyên mọi thứ còn lại. */
export function doiTenDatabase(url: string, tenMoi: string): string {
  try {
    const u = new URL(url);
    u.pathname = `/${encodeURIComponent(tenMoi)}`;
    return u.toString();
  } catch {
    return url.replace(/(?:^|\s)dbname=[^\s]+/, ` dbname=${tenMoi}`).trim();
  }
}

/**
 * Tên database test tương ứng với một tên database thường.
 *
 * `hub_dev` → `hub_test` (không phải `hub_dev_test`): đó là tên đã ghi trong nợ #41 và
 * trong `.github/workflows/ci.yml`, nên hai môi trường gọi cùng một cái tên.
 */
export function tenDbTestTuongUng(ten: string): string {
  if (laTenDbTest(ten)) return ten;
  if (ten === "" || ten === "postgres") return "hub_test";
  if (ten.endsWith("_dev")) return `${ten.slice(0, -"_dev".length)}_test`;
  return `${ten}_test`;
}

/**
 * Chuỗi kết nối mà MỌI file test chạm CSDL phải dùng.
 *
 * `TEST_DATABASE_URL` thắng — nhưng vẫn bị soát tên: đặt biến đó trỏ vào `hub_dev` là
 * lỗi cấu hình phải nổ ra ngay, không phải một cách hợp thức hoá việc ghi vào sổ vận hành.
 */
export function urlDbTest(env: Record<string, string | undefined>): string | undefined {
  const chiDinh = env.TEST_DATABASE_URL;
  if (chiDinh) {
    const ten = tenDatabase(chiDinh);
    if (!laTenDbTest(ten)) {
      throw new Error(
        `TEST_DATABASE_URL trỏ vào database "${ten}" — không phải database test. ` +
          `Tên phải kết thúc bằng "_test" (xem tests/helpers/db-test-url.ts, nợ #41).`,
      );
    }
    return chiDinh;
  }
  const goc = env.DATABASE_URL;
  if (!goc) return undefined;
  return doiTenDatabase(goc, tenDbTestTuongUng(tenDatabase(goc)));
}
