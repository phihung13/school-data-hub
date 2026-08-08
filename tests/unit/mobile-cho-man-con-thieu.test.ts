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

// ---------------------------------------------------------------------------
// VIẾT LẠI 06/08/2026 — cùng một luật, chứng minh bằng một tính chất MẠNH HƠN.
//
// Bản trước cắt lấy "cột mobile" của profile-view.tsx (từ chuỗi `text-center md:hidden`
// tới `hidden flex-none items-center`) rồi soi xem cột đó có đủ hai khối bắt buộc không.
// Phép đo ấy đúng với hình dạng CŨ của màn: hai cây rời nhau, một cây `md:hidden` cho
// điện thoại và một cây `hidden md:flex` cho máy tính. Nó đo được "cột mobile có thiếu
// không" vì lúc đó THẬT SỰ CÓ một cột mobile riêng để mà thiếu.
//
// Bản dựng lại theo ảnh mẫu (06/08/2026) bỏ hẳn hai cây đó: nay là MỘT cây, xếp một cột
// dưới `md` và hai cột từ `md` bằng `flex-col md:flex-row`. Khi không còn "cột kia" thì
// cũng không còn chỗ để quên — tính chất mà bài test này canh trở thành tính chất cấu
// trúc, không còn là thứ phải đi đếm từng khối.
//
// Nên phép đo đổi theo, và đổi theo hướng SIẾT chứ không nới. Luật cũ: "cột mobile phải
// chứa đủ hai khối". Luật mới: "trong vùng nội dung KHÔNG được có bất kỳ thứ gì bị ẩn
// theo khổ màn" — mạnh hơn, vì nó chặn luôn cả những khối chưa tồn tại hôm nay. Nếu mai
// kia ai đó quay lại lối cũ (thêm `md:hidden` hay `hidden md:flex` vào giữa nội dung) thì
// đỏ ngay, kể cả khi hai khối §9 vẫn còn nguyên.
//
// Hai khối bắt buộc vẫn được kiểm đích danh: chúng phải có mặt, và phải nằm TRONG vùng
// <MainContent> của nhánh học sinh chứ không phải ở đâu đó trong file.
// ---------------------------------------------------------------------------
describe("hồ sơ trên điện thoại không phải bản rút gọn", () => {
  const src = read("profile-view.tsx");

  /**
   * Vùng nội dung của nhánh HỌC SINH: từ `function StudentProfile` tới `function
   * StaffProfile`. Cắt theo tên hàm chứ không theo một chuỗi class: tên hàm là thứ đổi
   * thì typecheck đổi theo, còn một chuỗi class đổi âm thầm — và khi mốc cắt trượt thì
   * bản trước trả về chuỗi rỗng, tức là mọi phép kiểm bên dưới xanh vì không có gì để đo.
   * Vì thế bài đầu tiên kiểm chính cái mốc.
   */
  const start = src.indexOf("function StudentProfile");
  const end = src.indexOf("function StaffProfile");
  const studentBranch = start >= 0 && end > start ? src.slice(start, end) : "";

  it("cắt được đúng nhánh học sinh để soi (mốc trong file chưa đổi)", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(studentBranch).toMatch(/<MainContent\b/);
  });

  it("có khối “Ai thấy gì của mình?” — §9 bắt người nhập cảm xúc phải biết ai đọc", () => {
    expect(studentBranch).toMatch(/<WhoSeesWhatCard\b/);
  });

  it("có đường tới “Cần gặp thầy cô” ngay trong nhánh học sinh", () => {
    expect(studentBranch).toMatch(/<HelpLink\b/);
  });

  it("hai khối dựng ĐÚNG MỘT LẦN — không có bản mobile và bản desktop nói khác nhau", () => {
    // Chép làm hai bản là mở đường cho hai bản nói khác nhau về cùng một luật riêng
    // tư — và bản sai sẽ là bản không ai mở ra xem. Bản trước buộc phải đếm 2 (hai cây,
    // mỗi cây một lần dùng); nay một cây nên con số đúng là 1, và 1 là con số chặt hơn.
    expect(count(src, /<WhoSeesWhatCard\b/g), "một cây thì chỉ được dùng một lần").toBe(1);
    expect(count(src, /<HelpLink\b/g)).toBe(1);
    expect(count(src, /Ai thấy gì của mình\?/g), "câu này chỉ được viết một lần").toBe(1);
    expect(count(src, /href="\/can-gap-thay-co"/g), "địa chỉ này chỉ được viết một lần").toBe(1);
  });

  it("KHÔNG khối nội dung nào của học sinh bị ẩn theo khổ màn", () => {
    // `md:hidden` / `hidden md:flex` trong vùng nội dung = có một thứ chỉ một khổ màn
    // nhìn thấy, tức là bản kia đang rút gọn. Ngoài vùng nội dung thì hợp lệ và cần
    // thiết: menu trái (`hidden md:flex`) và thanh tab (`md:hidden`) vốn là hai bề mặt
    // điều hướng của hai khổ màn, và cả hai đứng NGOÀI <MainContent>.
    const at = studentBranch.indexOf("<MainContent");
    const den = studentBranch.indexOf("</MainContent>");
    const noiDung = studentBranch.slice(at, den);
    // Lookbehind `(?<![\w-])` là bắt buộc, không phải cho đẹp: `\b` coi dấu gạch nối là
    // biên từ, nên `md:overflow-hidden md:bg-pagebgDesktop` — một khai báo cuộn hoàn toàn
    // vô hại trên chính thẻ <MainContent> — khớp `\bhidden\s+md:` và bài test đỏ oan.
    expect(noiDung, "còn khối bị ẩn dưới md").not.toMatch(/(?<![\w-])md:hidden(?![\w-])/);
    expect(noiDung, "còn khối chỉ hiện từ md").not.toMatch(/(?<![\w-])hidden\s+md:/);
  });

  it("mọi phần tử bấm được của nhánh học sinh khai vùng chạm ≥44px (§11)", () => {
    // Không đo được pixel ở môi trường node, nên khoá thứ đo được: mọi phần tử bấm được
    // phải khai min-h. Thiếu khai là thiếu bảo đảm. Quét cả file (không chỉ nhánh học
    // sinh) vì các thẻ dùng chung — HelpLink, LogoutBox — định nghĩa ở ngoài nhánh.
    const clickable = count(src, /<(button|a)\b/g);
    expect(clickable, "không tìm thấy phần tử bấm được nào để đo").toBeGreaterThan(0);
    const declared = count(src, /min-h-\[(4[4-9]|[5-9]\d|\d{3,})px\]/g);
    expect(declared, `${declared}/${clickable} phần tử bấm được có khai min-h ≥44px`).toBe(clickable);
  });
});
