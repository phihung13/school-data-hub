// tests/unit/duong-ghi-gui-muon.test.ts
//
// MỘT câu hỏi: trong router `care`, còn đường nào đổi trạng thái một check-in gửi muộn
// mà KHÔNG đi qua `attendance.decide_late_checkins` không?
//
// Vì sao câu hỏi đó đáng một cổng quét nguồn, chứ không nằm gọn trong bài chạy thật:
// ADR-029 đổi quyền ghi `absent` lấy đúng một thứ — VẾT. Sổ `attendance.late_decisions`
// chỉ có nghĩa khi nó ghi được MỌI lượt ghi; một câu `update attendance.checkins set
// status = ...` mới thêm vào file ngày mai sẽ chạy đúng, trả về đúng, và không bài test
// hành vi nào đỏ — nó chỉ lặng lẽ ghi một quyết định về chuyên cần của một đứa trẻ mà
// không ai soát được. Đường ghi thứ hai là thứ phải chặn ở mức TỒN TẠI, không phải ở mức
// hành vi. (Đúng khuôn `tests/unit/mui-gio.test.ts`: quy ước không tự đọc chính nó.)
//
// Bài này cũng là chỗ duy nhất nhìn thấy TẦNG CHẶN THỨ HAI của lý do bắt buộc. Ba tầng
// chồng nhau (hợp đồng Zod · router · ràng buộc 0053) nên gọi qua tRPC caller thì hợp
// đồng bao giờ cũng chặn trước — tức là gỡ lớp kiểm ở router KHÔNG làm bài chạy thật đỏ.
// Chỉ cổng này thấy nó biến mất, và ADR-029 đòi đủ ba tầng chứ không đòi ba tầng trong đó
// hai tầng là trang trí.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const CARE = join(ROOT, "apps", "hub", "server", "routers", "care.ts");

/**
 * Bỏ chú thích trước khi soi — file này chú thích rất dài và có nhắc TÊN thứ nó cấm
 * (đúng nghĩa đen: "router này không còn câu `update attendance.checkins ... set status`
 * nào"). Soi cả chú thích là biến một lời giải thích đúng thành một lỗi giả.
 *
 * Chỉ bỏ khối `/* … *\/` và dòng bắt đầu bằng `//`: không đụng tới chuỗi, nên câu SQL
 * trong backtick (kể cả chú thích SQL `--` bên trong) vẫn còn nguyên để soi.
 */
function boChuThich(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const MA = boChuThich(readFileSync(CARE, "utf8"));

describe("ADR-029 · mọi lượt đổi trạng thái check-in gửi muộn đều để lại vết", () => {
  it("router care KHÔNG còn câu UPDATE trần nào lên attendance.checkins", () => {
    // Đây chính là câu lệnh mà `acknowledgeLate` chạy trước ADR-029 — đường ghi duy nhất
    // không có lý do, không có sổ, không có người ký ngoài `confirmed_by`.
    const viPham = MA.match(/update\s+attendance\.checkins/gi) ?? [];
    expect(
      viPham,
      "Đổi trạng thái check-in phải gọi attendance.decide_late_checkins (0053) — " +
        "một câu UPDATE trần là một quyết định không vào sổ (ADR-029).",
    ).toEqual([]);
  });

  it("cả hai thủ tục ghi (mới và lối tắt cũ) đều gọi attendance.decide_late_checkins", () => {
    const goi = MA.match(/attendance\.decide_late_checkins/g) ?? [];
    expect(goi.length).toBeGreaterThanOrEqual(2);

    // `acknowledgeLate` là thủ tục client CŨ còn gọi, và client cũ sống lâu nhất — nên nó
    // là đường dễ bị bỏ quên nhất khi ai đó siết đường mới.
    const sauLoiTat = MA.slice(MA.indexOf("acknowledgeLate: homeroomProcedure"));
    expect(sauLoiTat).toContain("attendance.decide_late_checkins");
  });

  it("thủ tục ghi không phải protectedProcedure — lỗ leo quyền 0025 không mở lại", () => {
    for (const ten of ["decideLateCheckins", "acknowledgeLate"]) {
      const dong = MA.split("\n").find((l) => l.includes(`${ten}:`));
      expect(dong, `không tìm thấy khai báo ${ten}`).toBeDefined();
      expect(dong, `${ten} phải gác theo VAI, không chỉ hỏi đã đăng nhập chưa`).toContain(
        "homeroomProcedure",
      );
    }
  });

  it("router tự kiểm lý do khi kết luận khác 'present' (tầng chặn thứ hai của ADR-029)", () => {
    const co = /decision\s*!==\s*"present"/.test(MA) && /BAD_REQUEST/.test(MA);
    expect(
      co,
      "Gỡ lớp kiểm này thì hợp đồng Zod vẫn chặn — nên không bài chạy thật nào đỏ, và " +
        "tầng chặn thứ hai mà ADR-029 yêu cầu biến mất trong im lặng.",
    ).toBe(true);
  });
});
