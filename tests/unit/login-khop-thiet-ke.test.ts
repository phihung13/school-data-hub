// tests/unit/login-khop-thiet-ke.test.ts — màn đăng nhập phải KHỚP bản thiết kế.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO CÓ FILE NÀY
// ═══════════════════════════════════════════════════════════════════════════════
// Chủ đầu tư, 24/08/2026: *"bạn đã bao giờ tự so sánh với file tôi đưa chưa"*. Chưa.
// Tôi đọc từng mảnh của bản thiết kế — grep tên lớp, lôi từng luật CSS — rồi dựng theo
// trí nhớ về những mảnh đó. Hai lượt liên tiếp trả lời "chưa giống", và cả hai lần tôi
// đều đoán tiếp thay vì đặt hai bên cạnh nhau mà soát.
//
// Lượt thứ ba mới lấy trọn `#s-login` cùng 23 luật CSS của nó. Ra BẢY chỗ lệch, trong đó
// bốn chỗ tôi không thể đoán ra bằng cách nhìn ảnh: bộ lọc `brightness/saturate` trên
// video, năm lớp gradient của lớp phủ, viền vàng vẽ bằng `box-shadow` trên nút Google, và
// hướng `row-reverse` của hàng nút.
//
// Bài này đọc THẲNG file thiết kế `apps/hub/public/trinh-dien/index.html` và đòi bản thi
// hành mang đúng những con số đó. Nó không đo cái đẹp — nó đo SỰ KHỚP, và nó biến "chưa
// giống" từ một câu người dùng phải nói thành một dòng CI đỏ.
//
// Khi bản thiết kế được đồng bộ lại từ Claude Design và đổi số, bài này đỏ — đúng như
// mong muốn: đó là lúc phải sửa bản thi hành theo, không phải lúc sửa bài test.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const goc = fileURLToPath(new URL("../../", import.meta.url));
const THIET_KE = readFileSync(join(goc, "apps/hub/public/trinh-dien/index.html"), "utf8");
/**
 * Mã của màn đăng nhập, ĐÃ BÓC CHÚ THÍCH — bắt buộc, cùng lý do đã ghi ở a11y.test.ts và
 * giong-noi.test.ts, và lần này tôi mắc lại nó ngay trong chính file này.
 *
 * Chú thích trong `login-form.tsx` LIỆT KÊ ba lớp bóng của nút Google bằng chữ, để lần sau
 * ai đọc còn biết vì sao có chúng. Phép so ở dưới bỏ khoảng trắng trước khi đối chiếu, nên
 * dòng chú thích ấy KHỚP với chính luật đang dò — gỡ viền vàng thật khỏi nút mà bài test
 * vẫn xanh, vì nó đọc được viền vàng trong lời giải thích.
 *
 * Đo ra bằng thử ngược: bẫy "bỏ viền vàng nút Google" không đỏ. Không thử ngược thì bài
 * test này đã đứng đó canh một thứ nó không canh được.
 */
const LOGIN = readFileSync(join(goc, "apps/hub/components/login-form.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ 	]*\/\/.*$/gm, "");

/** Lấy thân một luật CSS trong bản thiết kế. Hỏng thì phải hỏng RA TIẾNG, không trả rỗng. */
function luat(sel: string): string {
  const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(THIET_KE);
  expect(m, `không đọc được luật CSS "${sel}" trong bản thiết kế`).not.toBeNull();
  return m![1];
}

/** Bỏ khoảng trắng — Tailwind viết `620px_470px`, CSS viết `620px 470px`. */
const gon = (s: string) => s.replace(/[\s_]+/g, "");

describe("màn đăng nhập khớp bản thiết kế — những con số KHÔNG đoán được bằng mắt", () => {
  it("MẪU SỐ: đọc được bản thiết kế, không xanh giả vì file rỗng", () => {
    expect(THIET_KE.length).toBeGreaterThan(50_000);
    expect(THIET_KE).toContain('<section id="s-login"');
    expect(LOGIN.length).toBeGreaterThan(10_000);
  });

  it("video nền mang ĐÚNG bộ lọc của `.cin-bg`", () => {
    // Thiếu nó thì sư tử tối và bệt hơn hẳn — đây là lý do lớn nhất khiến hai bên "trông
    // khác" dù đang chiếu cùng một file video.
    const f = /filter:\s*([^;}]+)/.exec(luat(".cin-bg"));
    expect(f, "`.cin-bg` không còn khai filter").not.toBeNull();
    expect(gon(LOGIN), `login thiếu filter: ${f![1]}`).toContain(gon(f![1]));
  });

  it("lớp phủ mang ĐỦ năm lớp gradient của `.cin-shade`", () => {
    // Năm lớp này được vẽ để tối đúng bốn góc và chừa sáng ở giữa. Bản đầu tôi tự bịa ba
    // lớp "trông na ná" — và đó chính là thứ làm nó không giống.
    const bg = /background:\s*([\s\S]*?)(?:;|$)/.exec(luat(".cin-shade"))![1];
    const lop = bg.split(/\),\s*(?=radial-gradient|linear-gradient)/).map((x) => x + (x.endsWith(")") ? "" : ")"));
    expect(lop.length, "bản thiết kế đổi số lớp gradient").toBe(5);
    const thi = gon(LOGIN);
    for (const l of lop) {
      // So mốc định vị của từng lớp (`at 104% 106%`, `270deg`…) — đủ đặc trưng để bắt
      // được lớp bị thiếu, mà không vỡ vì một dấu cách.
      // Sau toạ độ là DẤU PHẨY, không phải ngoặc đóng — bản đầu của regex này dò `)` nên
      // không rút được gì và bài test đỏ vì chính phép rút, không vì bản thi hành sai.
      const moc = /at\s+([-\d%.\s]+?)\s*,/.exec(l)?.[1] ?? /(\d+deg)/.exec(l)?.[1];
      expect(moc, `không rút được mốc định vị từ: ${l.slice(0, 60)}`).toBeTruthy();
      expect(thi, `lớp phủ thiếu một lớp: ${l.slice(0, 70)}`).toContain(gon(moc!));
    }
  });

  it("nút Google mang ĐỦ ba lớp bóng của `.sso` — viền vàng, quầng sáng, bóng sâu", () => {
    // Viền vẽ bằng `box-shadow` chứ không bằng `border`, để không cộng 3px vào kích thước
    // nút. Thiếu viền vàng thì nút chỉ là một hình chữ nhật trắng.
    const sh = /box-shadow:\s*([^;}]+)/.exec(luat(".sso"))![1];
    const thi = gon(LOGIN);
    for (const lop of sh.split(/,(?![^(]*\))/)) {
      expect(thi, `nút Google thiếu lớp bóng: ${lop.trim()}`).toContain(gon(lop.trim()));
    }
    // Kích thước cũng phải khớp — 400×58.
    expect(luat(".sso")).toContain("width:400px");
    expect(LOGIN, "nút Google sai bề rộng").toContain("md:w-[400px]");
    expect(LOGIN, "nút Google sai chiều cao").toContain("h-[58px]");
  });

  it("hàng nút đi NGƯỢC chiều (`row-reverse`) — Google phải, Zalo trái", () => {
    expect(luat(".cin-cta")).toContain("row-reverse");
    expect(LOGIN, "hàng nút không đảo chiều").toContain("md:flex-row-reverse");
    // Dải "hoặc" là thứ tôi tự thêm; bản thiết kế không có, và nó sai nghĩa — hai nút này
    // là hai cửa cho hai nhóm người, không phải hai lựa chọn loại trừ nhau.
    expect(LOGIN, 'dải "hoặc" quay lại — bản thiết kế không có').not.toMatch(/>\s*hoặc\s*</);
  });

  it("cột chữ và khối chữ khớp `.cin-main` + `.cin-h1`", () => {
    expect(luat(".cin-main")).toContain("max-width:560px");
    expect(LOGIN, "cột chữ sai bề rộng").toContain("md:max-w-[560px]");
    // `.cin-h1 em` là VÀNG và KHÔNG nghiêng — dễ mất khi ai đó "dọn" thẻ <em>.
    expect(luat(".cin-h1 em")).toContain("#FFC629");
    expect(LOGIN, "chữ nhấn trong tiêu đề phải vàng và không nghiêng").toMatch(
      /<em className="not-italic text-gold">/,
    );
  });

  it("tài khoản thử là HÀNG CHIP, không phải ô xổ xuống", () => {
    // `.devchip` — viền lam nhạt, nền navy đục, chấm avatar vàng. Ô `<select>` ở bản trước
    // giải đúng một vấn đề thật (15 tài khoản), nhưng nó không phải hình bản thiết kế vẽ;
    // chip CUỐN DÒNG giải cùng vấn đề đó mà vẫn đúng hình.
    const chip = luat(".devchip");
    expect(gon(LOGIN), "chip thiếu màu viền của bản thiết kế").toContain(
      gon(/border:\s*1px solid ([^;}]+)/.exec(chip)![1]),
    );
    expect(LOGIN, "còn ô <select> chọn tài khoản").not.toContain('id="tk-thu"');
    expect(LOGIN, "chip phải khai trạng thái đang chọn cho trình đọc màn hình").toContain(
      "aria-pressed",
    );
  });
});
