// tests/unit/nhay-nhon.test.ts
//
// MỘT luật: kho mã không được chứa dấu nháy nhọn (U+00AB / U+00BB), kể cả dưới dạng
// thực thể HTML `&laquo;` / `&raquo;`.
//
// Vì sao là một bài test chứ không phải một lần thay thế hàng loạt: ngày 01/08/2026 chủ
// đầu tư yêu cầu bỏ hẳn kiểu nháy đó khỏi sản phẩm, và một lượt thay thế đã dọn 496 ký tự
// trong 46 file. Nhưng một lượt thay thế chỉ đúng ĐÚNG MỘT LẦN: file viết ngày mai, hoặc
// một khối chép từ tài liệu cũ, sẽ mang nó trở lại mà không ai thấy. Cổng canh mới là thứ
// giữ được quyết định; lượt thay thế chỉ là lần dọn đầu tiên.
//
// Bài học đắt hơn, ghi lại vì nó là lý do bài test này quét cả mã lẫn tài liệu: lượt thay
// thế hôm đó đi qua cả những chỗ ký tự KHÔNG phải là văn bản, và làm hỏng hai thứ:
//   1. `tools/contracts-lint.mjs` dùng nháy nhọn làm DẤU MỐC dữ liệu trong bản chụp bề
//      mặt hợp đồng. Thay thành nháy thẳng là vừa sai cú pháp vừa mất nghĩa. Nay dấu mốc
//      là `#function#` / `#type#` / `#enum#` / `#extends#` / `#expr#` (ASCII).
//   2. `tools/check-html.mjs` có một biểu thức chính quy CẤM chính ký tự đó. Bị thay
//      thành `[""]` nên nó khớp mọi dấu nháy thẳng — cổng báo 8730 lỗi.
// Cả hai đều gãy thành tiếng nên không có gì lọt âm thầm. Nhưng cái giá phải trả là:
// biểu thức nào cần nhắc tới ký tự này thì viết bằng mã thoát Unicode, đừng viết ký tự
// thẳng vào mã nguồn — chính bài test này cũng viết như vậy.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "coverage", ".impeccable", "uploads"]);
const TEXT_FILE = /\.(ts|tsx|js|mjs|cjs|json|md|html|css|sql|sh|txt|yml|yaml)$/;

/**
 * Mã thoát, KHÔNG phải ký tự thẳng — nếu viết thẳng thì lượt dọn tiếp theo sẽ ăn luôn
 * biểu thức này và bài test thành ra không kiểm gì (đúng lỗi đã xảy ra ở check-html.mjs).
 */
const NHAY_NHON = /[«»]|&laquo;|&raquo;/g;

/**
 * ĐÚNG HAI ngoại lệ, và cả hai vì cùng một lý do: cổng canh phải gọi tên thứ nó cấm.
 * `tools/check-html.mjs` cấm ký tự này trong hồ sơ trình sếp; chính file test này cấm nó
 * trong toàn kho. Không file nào khác được vào danh sách — khai tường minh từng tên thay
 * vì bỏ qua cả thư mục, để người sau đọc được LÝ DO chứ không chỉ thấy một vùng tối.
 */
const NGOAI_LE = new Set(["tools/check-html.mjs", "tests/unit/nhay-nhon.test.ts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (TEXT_FILE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

describe("dấu nháy nhọn đã bị loại khỏi sản phẩm (quyết định 01/08/2026)", () => {
  it("không file nào trong kho còn dấu nháy nhọn", () => {
    const guilty: string[] = [];
    for (const abs of walk(ROOT)) {
      const rel = relative(ROOT, abs).replace(/\\/g, "/");
      if (NGOAI_LE.has(rel)) continue;
      const hits = readFileSync(abs, "utf8").match(NHAY_NHON);
      if (hits) guilty.push(`${rel} (${hits.length})`);
    }
    expect(
      guilty,
      "Các file này còn dấu nháy nhọn. Thay bằng dấu nháy thẳng hoặc nháy cong đôi.\n" +
        "Nếu ký tự đó đang được dùng làm DẤU MỐC dữ liệu chứ không phải văn bản, đổi sang\n" +
        "dấu mốc ASCII (xem #enum# trong tools/contracts-lint.mjs) — đừng thêm vào NGOAI_LE.",
    ).toEqual([]);
  });

  it("bài test này soi được thứ nó nói — kiểm ngược trên chuỗi giả", () => {
    // Không có ca âm thì một biểu thức viết sai vẫn xanh vĩnh viễn.
    const co = `nhãn ${String.fromCharCode(0xab)}cần gặp thầy cô${String.fromCharCode(0xbb)}`;
    const coThucThe = "nhãn &laquo;cần gặp thầy cô&raquo;";
    const khong = 'nhãn "cần gặp thầy cô" và “cần gặp thầy cô”';
    expect(co.match(NHAY_NHON)).toHaveLength(2);
    expect(coThucThe.match(NHAY_NHON)).toHaveLength(2);
    expect(khong.match(NHAY_NHON)).toBeNull();
  });

  it("danh sách miễn trừ chỉ gồm cổng canh, và cổng đó phải thật sự canh", () => {
    // Khoá cứng độ dài: thêm một file thứ ba vào NGOAI_LE là bài này đỏ, buộc người thêm
    // phải giải thích. Không có câu này thì danh sách miễn trừ tự lớn dần cho tới ngày
    // nó phủ hết những chỗ đáng soi nhất.
    expect([...NGOAI_LE].sort()).toEqual(["tests/unit/nhay-nhon.test.ts", "tools/check-html.mjs"]);
    const src = readFileSync(join(ROOT, "tools", "check-html.mjs"), "utf8");
    // Nó được miễn trừ VÌ nó cấm — không phải vì nó dùng.
    expect(src).toContain("GUILLEMET");
    expect(src).toContain("Ký tự cấm");
  });
});
