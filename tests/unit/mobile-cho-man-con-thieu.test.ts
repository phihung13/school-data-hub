// tests/unit/mobile-cho-man-con-thieu.test.ts — gói "mobile-cho-man-con-thieu".
//
// Một luật duy nhất, phát biểu bằng lời: **màn của học sinh trên điện thoại không
// được là bản rút gọn của bản máy tính.** PRODUCT.md ghi bối cảnh dùng thật của học
// sinh THCS là điện thoại, 5–10 giây trước giờ vào lớp. Cái gì "để dành cho bản
// desktop" thì trên thực tế là cái bị giấu khỏi gần như toàn bộ người dùng thật.
//
// Ba lỗi đã đo được trên bản chạy 31/07/2026, cả ba đều typecheck sạch và build sạch:
//   1. /diem-danh và /tuan-nay dựng màn chặn "mở trên máy tính" — chặn đúng 100%
//      người dùng của chính nó (page.tsx của hai trang chỉ cho vai student vào).
//   2. /ho-so trên điện thoại kết bằng câu "Bản đầy đủ (ai thấy gì của mình, liên hệ
//      GVCN) mở trên máy tính". Hai thứ bị cắt đúng là hai thứ không được cắt: khối
//      "Ai thấy gì của mình?" (DESIGN-GUIDELINES §9 — người nhập dữ liệu cảm xúc phải
//      biết ai đọc được) và đường tới /can-gap-thay-co (cách duy nhất từ tab Hồ sơ để
//      em nhờ cô giúp, thứ em cần lúc 9 giờ tối cầm điện thoại).
//   3. Lịch tuần: nếu ai đó gắn tiền tố khổ màn vào `grid-cols-5` thì trên điện thoại
//      một tuần vỡ thành cột dọc 5 dòng — mất đúng hình dạng "một tuần", thứ duy nhất
//      khối đó kể.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const componentsDir = join(repoRoot, "apps", "hub", "components");

/**
 * Đọc mã nguồn ĐÃ BỎ chú thích — bắt buộc, cùng lý do với readScreen() của
 * tests/unit/frontend-trang-thai.test.ts: các file này kể lại nguyên văn lỗi cũ
 * ("mở trên máy tính", "DesktopOnlyNotice") trong chú thích đầu file để lần sau không
 * ai làm ngược lại. Quét cả chú thích thì cách "sửa" test duy nhất là xoá lời giải
 * thích — test tự phá thứ nó bảo vệ.
 */
function read(file: string): string {
  return readFileSync(join(componentsDir, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:@\w])\/\/.*$/gm, "$1");
}
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

const PHONE_SCREENS = ["attendance-view.tsx", "this-week-view.tsx", "profile-view.tsx"];

describe("ba màn học sinh mở được bằng điện thoại", () => {
  it.each(PHONE_SCREENS)("%s không dựng màn chặn theo khổ màn", (file) => {
    const src = read(file);
    expect(src, `${file} còn màn chặn DesktopOnlyNotice`).not.toMatch(/DesktopOnlyNotice/);
    // Câu chữ cũng bị cấm, không chỉ component: tự viết lại câu đó bằng tay là cùng
    // một hành vi, chỉ khác chỗ nó qua mặt được test kiểm component.
    expect(src, `${file} còn câu đẩy người dùng sang máy tính`).not.toMatch(
      /(mở|tối ưu)\s+(cho\s+)?(trên\s+)?máy tính/,
    );
  });

  it.each(["attendance-view.tsx", "this-week-view.tsx"])(
    "%s giữ lịch tuần 5 cột ở MỌI khổ màn",
    (file) => {
      const src = read(file);
      expect(src).toMatch(/className="[^"]*\bgrid-cols-5\b/);
      // sm:/md:/lg:grid-cols-5 nghĩa là dưới ngưỡng đó không còn là một tuần.
      expect(src, `${file} gắn tiền tố khổ màn vào grid-cols-5`).not.toMatch(
        /\b(sm|md|lg|xl):grid-cols-5\b/,
      );
    },
  );
});

describe("hồ sơ trên điện thoại không phải bản rút gọn", () => {
  const src = read("profile-view.tsx");

  /**
   * Cắt lấy đúng cột mobile của StudentProfile: từ chỗ mở thẻ có `md:hidden` tới chỗ
   * mở khối chỉ-desktop kế tiếp (`hidden … md:flex`). Cắt chứ không quét cả file, vì
   * "có trong file" không chứng minh được "có trên điện thoại" — cả hai khối đều nằm
   * trong cùng một file dù chỉ một khổ màn nhìn thấy.
   */
  const mobileStart = src.indexOf("text-center md:hidden");
  const mobileEnd = src.indexOf("hidden flex-none items-center");
  const mobileColumn = src.slice(mobileStart, mobileEnd);

  it("cắt được đúng cột mobile để soi (mốc trong file chưa đổi)", () => {
    expect(mobileStart).toBeGreaterThan(-1);
    expect(mobileEnd).toBeGreaterThan(mobileStart);
  });

  it("có khối «Ai thấy gì của mình?» — §9 bắt người nhập cảm xúc phải biết ai đọc", () => {
    expect(mobileColumn).toMatch(/<WhoSeesWhatCard\b/);
  });

  it("có đường tới «Cần gặp thầy cô» ngay trên điện thoại", () => {
    expect(mobileColumn).toMatch(/<HelpLink\b/);
  });

  it("hai khối dùng chung một bản dựng, không chép tay hai lần", () => {
    // Chép làm hai bản là mở đường cho hai bản nói khác nhau về cùng một luật riêng
    // tư — và bản sai sẽ là bản không ai mở ra xem.
    expect(count(src, /<WhoSeesWhatCard\b/g), "phải dùng ở cả mobile lẫn desktop").toBe(2);
    expect(count(src, /<HelpLink\b/g)).toBe(2);
    expect(count(src, /Ai thấy gì của mình\?/g), "câu này chỉ được viết một lần").toBe(1);
    expect(count(src, /href="\/can-gap-thay-co"/g), "địa chỉ này chỉ được viết một lần").toBe(1);
  });

  it("nút/link trong cột mobile khai vùng chạm ≥44px (§11)", () => {
    // Không đo được pixel ở môi trường node, nên khoá thứ đo được: mọi phần tử bấm
    // được trong cột này phải khai min-h. Thiếu khai là thiếu bảo đảm.
    const clickable = count(mobileColumn, /<(button|a|LogoutButton|HelpLink)\b/g);
    const declared = count(mobileColumn, /min-h-\[(4[4-9]|[5-9]\d|\d{3,})px\]/g);
    expect(declared, `${declared}/${clickable} phần tử bấm được có khai min-h ≥44px`).toBe(clickable);
  });
});
