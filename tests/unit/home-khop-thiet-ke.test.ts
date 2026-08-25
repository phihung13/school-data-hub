// Trang chủ khớp bản thiết kế #s-home — 24/08/2026, chủ đầu tư: "trang home bây giờ
// không phải theme đen, mà là cái theme tôi đã gửi".
//
// CÙNG BÀI HỌC với login-khop-thiet-ke.test.ts: file thiết kế khai một selector NHIỀU
// LẦN (TECH SKIN → SCI-FI HUD → SHOWTIME → LIGHT OVERRIDE → FIERCE → SQUARE-OFF →
// FINAL), giá trị thắng là giá trị ĐỨNG CUỐI. Bài đầu tiên dưới đây chứng minh mẫu số:
// nếu ai đó sửa file thiết kế mà chỉ đọc khối đầu, chính bài đó sẽ nhắc lại luật.
//
// Skin nằm ở globals.css (lớp .s-home/.hv-*), markup ở home-view.tsx (nhánh desktop).
// Ba QUYẾT ĐỊNH CỦA CHỦ ĐẦU TƯ đè lên bản vẽ được ghi ở nhóm test cuối — đồng bộ lại
// với bản vẽ mà "sửa" chúng ngược là làm trái lệnh trực tiếp, không phải sửa lỗi.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const goc = join(__dirname, "..", "..");
const THIET_KE = readFileSync(join(goc, "apps", "hub", "public", "trinh-dien", "index.html"), "utf8");
const CSS = readFileSync(join(goc, "apps", "hub", "app", "globals.css"), "utf8");
// Chú thích trong mã nguồn NÓI VỀ các lớp hv-* — bỏ chú thích trước khi soi markup,
// không thì guard khớp chính lời giải thích của nó (lỗi đã gặp 6 lần ở gói login).
const HOME = readFileSync(join(goc, "apps", "hub", "components", "home-view.tsx"), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/** Mọi khối khai báo của một selector trong file thiết kế, theo thứ tự nguồn. */
function cacKhoi(sel: string): string[] {
  const khoi: string[] = [];
  const re = new RegExp(`(?:^|[}\\s])${sel.replace(/[.#]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g");
  for (const m of THIET_KE.matchAll(re)) khoi.push(m[1]);
  return khoi;
}

describe("trang chủ khớp thiết kế #s-home — trạng thái cascade CUỐI", () => {
  it("MẪU SỐ: #s-home khai background nhiều lần và bản CUỐI là trắng !important — skin phải là trang TRẮNG, không phải nền tối của app", () => {
    const nen = cacKhoi("#s-home").filter((k) => /background\s*:/.test(k));
    // Nhiều đời skin — ai đọc khối đầu sẽ ra nền tối #0A1F44 và sai y hệt vụ login.
    expect(nen.length, "file thiết kế đã gọn lại một khối? cập nhật bài này").toBeGreaterThanOrEqual(3);
    expect(nen[nen.length - 1]).toMatch(/#FFFFFF\s*!important/);
    expect(CSS).toMatch(/\.s-home\s*\{[^}]*background:\s*#FFFFFF/);
  });

  it("::after của #s-home giữ MẠCH VI !important — khối 'lưới gắt hơn' đứng sau nhưng THUA vì không !important", () => {
    // Luật cascade: khai báo !important thắng khai báo thường đứng sau nó.
    expect(THIET_KE).toMatch(/#s-home::after\s*\{[^}]*url\("data:image\/svg\+xml[^}]*!important/);
    expect(CSS).toMatch(/\.s-home::after\s*\{[^}]*url\("data:image\/svg\+xml/);
    // Còn ::before là lưới chấm lam — không có đời sau nào đè.
    expect(CSS).toMatch(/\.s-home::before\s*\{[^}]*rgba\(53,224,255,\.14\)/);
  });

  it("thẻ trắng: viền drop-shadow #8FB6E4 4 hướng + bóng đáy đậm (khối FINAL), vát góc + rãnh notch 36%", () => {
    // 25/08: bóng mờ hạ 22px/18px -> 14px/10px theo lệnh hiệu năng ("web cứ giật giật")
    // — pass blur là phần đắt nhất của chuỗi filter; viền 4 hướng giữ nguyên bản vẽ.
    const KHOP =
      /\.hv-card\s*\{[^}]*drop-shadow\(1\.5px 0 0 #8FB6E4\)[^}]*drop-shadow\(0 9px 0 rgba\(10,42,94,\.28\)\) drop-shadow\(0 14px 10px rgba\(10,42,94,\.30\)\)/;
    expect(CSS).toMatch(KHOP);
    expect(CSS).toMatch(/\.hv-card\s*\{[^}]*clip-path:\s*polygon\(0 0, 36% 0, calc\(36% \+ 8px\) 7px/);
    // border-radius 0 (đời SQUARE-OFF) — không được lấy 12px của đời đầu.
    expect(CSS).toMatch(/\.hv-card\s*\{[^}]*border-radius:\s*0/);
  });

  it("thẻ check-in vàng kem + đầu trang command strip + chip số liệu tối — đúng chữ ký đời cuối", () => {
    expect(CSS).toMatch(/\.hv-check\s*\{[^}]*linear-gradient\(135deg, #FFF9E8 0%, #FFEFC2 58%, #FFE49A 100%\)/);
    expect(CSS).toMatch(/\.hv-head\s*\{[^}]*linear-gradient\(92deg, #0A1A3E 0%, #0E2A5E 74%, #123A7E 100%\)/);
    expect(CSS).toMatch(/\.hv-stat\s*\{[^}]*background:\s*#0B1E44/);
  });

  it("markup desktop dựng đủ bộ phận của bản vẽ, gắn vào dữ liệu THẬT", () => {
    for (const lop of ['className="s-home', 'className="hv-head"', 'className="hv-grid"', 'className="hv-card hv-check"', 'className="hv-bn"', 'className="radar"', 'className="fx-scan"']) {
      expect(HOME, `thiếu ${lop}`).toContain(lop);
    }
    // Số liệu chip là query thật, không phải số dán cứng của bản vẽ ("4/5", "11").
    expect(HOME).toMatch(/HvStat[\s\S]*?data\.todayState[\s\S]*?data\.checkedInAt/);
    expect(HOME).toMatch(/data\.checkinDaysThisWeek \?\? 0/);
  });

  it("bốn ô cảm xúc lấy bảng màu từ MOOD_STYLE của mood-tile — không mọc bản chép hex thứ hai, và chỉ MỞ popup cổng", () => {
    expect(HOME).toContain('import { MOOD_STYLE } from "./mood-tile"');
    expect(HOME).toMatch(/hv-m bg-gradient-to-br \$\{MOOD_STYLE\[m\]\.gradient\}/);
    // Ô cảm xúc và CTA cùng gọi moCheckin (popup ADR-036) — không có đường gửi riêng.
    expect(HOME).toMatch(/className=\{`hv-m[^`]*`\}[\s\S]{0,400}onClick=\{moCheckin\}|onClick=\{moCheckin\}[\s\S]{0,400}className=\{`hv-m/);
  });

  it("GIẢM CHUYỂN ĐỘNG: scan + UFO biến mất, mọi animation hv-* tắt", () => {
    const giam = CSS.slice(CSS.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(giam).toMatch(/\.fx-scan, \.ufo-track \{ display: none; \}/);
    expect(giam).toMatch(/animation: none/);
  });

  // ── QUYẾT ĐỊNH CỦA CHỦ ĐẦU TƯ ĐÈ LÊN BẢN VẼ — sửa ngược là làm trái lệnh ──
  it("KHÔNG có tile Mini App bịa: bản vẽ vẽ 'Học tập · GĐ2' và 'Y tế · GĐ2', app thật dùng sổ đăng ký", () => {
    expect(HOME).not.toContain("GĐ2");
    expect(HOME).toMatch(/<LuoiMiniApp[\s\S]*?sang/);
  });

  it("cột phải người lớn ở lại; thẻ 'Lịch hôm nay' đã GỠ theo lệnh trực tiếp 24/08 ('bỏ thẻ khung Lịch hôm nay')", () => {
    expect(HOME).toMatch(/hv-r[\s\S]*?<CotPhaiNguoiLon/);
    // Gỡ CẢ ống dẫn: không render, không import, không đọc lịch server-side cho thứ
    // không vẽ. Muốn đưa lịch trở lại phải có lệnh mới — không phải "sửa lỗi thiếu thẻ".
    expect(HOME).not.toContain("LichHomNay");
  });

  it("UFO có não như bản vẽ (24/08: 'ufo phải thông minh hơn và tương tác chuột tốt hơn'): đúng hằng số vật lý + đủ kỷ luật nền", () => {
    // Hằng số chép nguyên từ script #ufo-fly của bản trình diễn — lệch là ai đó đã
    // "tinh chỉnh" cảm giác bay mà không so lại với bản gốc.
    for (const hs of ["dm < 180", "* 3200 * f * dt", "so > 0 ? 680 : 75", "so > 0 ? 0.9 : 0.93", "* 130 * dt", 'classList.add("scared")']) {
      expect(HOME, `UFO thiếu hằng số/hành vi: ${hs}`).toContain(hs);
    }
    // Kỷ luật của kho, cùng khuôn sao-nen.tsx: giảm-chuyển-động thì không chạy vòng
    // nào; giấu tab thì dừng rAF. HOME đã bỏ chú thích nên đây là mã thật, không phải lời kể.
    const ufo = HOME.slice(HOME.indexOf("function UfoBay"));
    expect(ufo).toContain('matchMedia?.("(prefers-reduced-motion: reduce)")');
    expect(ufo).toContain('addEventListener("visibilitychange"');
    expect(ufo).toContain("cancelAnimationFrame(raf)");
    // Vỏ "sợ" trong CSS: dấu chấm than bung, thân run, đèn chiếu tắt.
    expect(CSS).toMatch(/\.ufo-fly\.scared \.ufo-alert \{ animation: ufoPop/);
    expect(CSS).toMatch(/\.ufo-fly\.scared \.ufo-bob \{ animation: ufoShiver/);
    expect(CSS).toMatch(/\.ufo-fly\.scared \.ufo-beam \{ opacity: 0/);
  });

  it("luật 'không suy số 0 từ im lặng' sống sót qua lượt thay da: nút check-in chỉ hiện khi BIẾT CHẮC chưa check-in", () => {
    expect(HOME).toMatch(/todayState === "ready" && data\.checkedInToday === false/);
  });
});
