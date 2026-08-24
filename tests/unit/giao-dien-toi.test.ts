// tests/unit/giao-dien-toi.test.ts — giao diện tối "Major OS" (24/08/2026).
//
// Chủ đầu tư: *"trang home phải là thay trang home cũ đi chứ, có tương tác thật luôn mà,
// thay cho tất cả các vai, không phải đồ giả nữa đâu"*. Nên đây KHÔNG còn là bản trình
// diễn — app thật đổi tông, giữ nguyên nội dung theo vai.
//
// Cách làm: đổi ĐỊNH NGHĨA token trong `tailwind.config.ts`, không đổi 520 chỗ dùng. App
// vốn dùng token ngữ nghĩa (`text-ink`, `bg-surface-alt`, `border-line`…) ở phần lớn chỗ,
// nên một chỗ đổi là mọi màn đổi theo — kể cả màn chưa ai mở ra xem.
//
// Bài này canh hai thứ mà một lần "sửa nhanh" rất dễ phá:
//
//   1. NỀN SÁNG QUAY LẠI. Dán `bg-white` hay một mã hex sáng vào một màn là chỗ đó chói
//      trắng giữa các thẻ tối. Nó không làm hỏng test nào khác, không làm hỏng build, và
//      chỉ lộ ra khi có người mở đúng màn đó.
//   2. `card`/`cardline` BỊ GỘP VÀO `white`. Cám dỗ là ghi đè thẳng token `white` cho gọn.
//      Làm thế thì `text-white` (70 chỗ — chữ trắng trên nút navy, trên ô cảm xúc) cũng
//      tối theo và chữ biến mất. Hai vai trò khác nhau phải là hai token khác nhau.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const goc = fileURLToPath(new URL("../../", import.meta.url));
const TW = readFileSync(join(goc, "apps/hub/tailwind.config.ts"), "utf8");
const CSS = readFileSync(join(goc, "apps/hub/app/globals.css"), "utf8");

function moiTsx(thuMuc: string, ra: string[] = []): string[] {
  for (const e of readdirSync(thuMuc)) {
    const p = join(thuMuc, e);
    if (statSync(p).isDirectory()) moiTsx(p, ra);
    else if (e.endsWith(".tsx")) ra.push(p);
  }
  return ra;
}
const FILES = [
  ...moiTsx(join(goc, "apps/hub/components")),
  ...moiTsx(join(goc, "apps/hub/app")),
].filter((p) => !p.includes(".next"));

/** Mã hex của nền sáng cũ — không được quay lại bất kỳ đâu trong mã nguồn. */
const NEN_SANG_CU = ["#F1F4F8", "#F5F8FC", "#E4E9F0", "#EAEFF6", "#F7F9FC", "#F5F7FA", "#FCFDFE"];

describe("giao diện tối — không nền sáng nào sót lại", () => {
  it("`bg-white` ĐẶC chỉ còn ở màn đăng nhập, đúng hai chỗ, cả hai là chi tiết sáng", () => {
    // BA THỨ KHÔNG BỊ CẤM, và cả ba đều đúng ở tông tối:
    //   · `text-white`   — chữ trắng trên nền màu
    //   · `bg-white/10`  — kính mờ trên nền tối, thứ dựng nên nút và ô ở màn đăng nhập
    //   · `border-white/25` — viền kính, cùng lý do
    // Regex dùng `(?![/\w-])` để CHỈ bắt nền ĐẶC. Bản đầu bắt cả `bg-white/10` và đếm ra
    // 6 thay vì 2 — một guard bắt nhầm thứ nó không định bắt.
    const DAC = /bg-white(?![/\w-])/;

    const co = FILES.filter((f) => DAC.test(readFileSync(f, "utf8"))).map((f) =>
      f.slice(goc.length).replace(/\\/g, "/"),
    );
    expect(co, "nền trắng đặc quay lại — sẽ chói giữa các thẻ tối").toEqual([
      "apps/hub/components/login-form.tsx",
    ]);

    // ĐẾM CHÍNH XÁC, không phải "bỏ qua login-form.tsx". Một ngoại lệ được ĐẾM là một
    // ngoại lệ; một ngoại lệ theo TÊN FILE là một cánh cửa mở sẵn cho lần sau.
    //
    // Đúng hai chỗ, cả hai là CHI TIẾT SÁNG TRÊN NỀN TỐI, không phải mặt thẻ:
    //   1. ô vuông trắng ôm logo ở dấu thương hiệu — bản thiết kế cũng vẽ trắng
    //   2. nút "Đăng nhập với Google" — trắng theo yêu cầu nhận diện của Google
    const src = readFileSync(join(goc, "apps/hub/components/login-form.tsx"), "utf8");
    const dac = src.match(new RegExp(DAC.source, "g")) ?? [];
    expect(dac.length, "số nền trắng đặc ở màn đăng nhập đã đổi").toBe(2);

    // Nút Google phải giữ CHỮ TỐI — nếu không nó là nền trắng chữ trắng, và đó đúng là
    // thứ luật này sinh ra để chặn.
    expect(src, "nút Google mất chữ tối").toMatch(/bg-white[^"]*text-\[#1B1C3A\]/);
  });

  it("không mã hex nền sáng cũ nào còn trong mã nguồn", () => {
    const pham: string[] = [];
    for (const p of FILES) {
      const src = readFileSync(p, "utf8").toUpperCase();
      for (const hex of NEN_SANG_CU) if (src.includes(hex)) pham.push(`${p.slice(goc.length)}: ${hex}`);
    }
    expect(pham).toEqual([]);
  });

  it("MẪU SỐ: các file thật sự được quét, regex không hỏng", () => {
    // Không có vế này thì hai bài trên xanh cả khi `FILES` rỗng vì đường dẫn sai.
    expect(FILES.length).toBeGreaterThanOrEqual(40);
    expect(FILES.some((p) => p.endsWith("home-view.tsx"))).toBe(true);
  });
});

describe("giao diện tối — token nền và token chữ KHÔNG được gộp", () => {
  it("`card` và `cardline` tồn tại, và `white` KHÔNG bị ghi đè", () => {
    expect(TW, "thiếu token nền thẻ").toMatch(/\bcard:\s*"#[0-9A-Fa-f]{6}"/);
    expect(TW, "thiếu token viền thẻ").toMatch(/\bcardline:\s*"#[0-9A-Fa-f]{6}"/);
    // Ghi đè `white` là làm `text-white` tối theo — 70 chỗ chữ biến mất cùng lúc.
    expect(TW, "ghi đè `white` sẽ nuốt luôn text-white").not.toMatch(/^\s*white:\s*"/m);
  });

  it("nền trang và color-scheme đều đã là tối", () => {
    expect(CSS, "color-scheme còn light — ô nhập và thanh cuộn vẫn vẽ theo hệ sáng").toContain(
      "color-scheme: dark",
    );
    expect(CSS, "body chưa đổi nền").not.toMatch(/body\s*\{[^}]*background:\s*#f7f9fc/i);
  });
});

// ---------------------------------------------------------------------------
// ĐĂNG NHẬP → INTRO → TRANG CHỦ, và ba đường làm nó kẹt
// ---------------------------------------------------------------------------
// Chủ đầu tư 24/08/2026: *"trang login chưa đổi, intro các thứ nữa"*. Luồng của bản trình
// diễn nay là luồng THẬT.
//
// Bài này canh những chỗ mà một lần "dọn cho gọn" sẽ NHỐT người dùng, chứ không canh phần
// nhìn — phần nhìn hỏng thì thấy ngay, còn ba ca dưới đây hỏng lặng lẽ:
describe("đăng nhập → intro → trang chủ", () => {
  const INTRO = readFileSync(join(goc, "apps/hub/components/intro-cinematic.tsx"), "utf8");
  const LOGIN = readFileSync(join(goc, "apps/hub/components/login-form.tsx"), "utf8");
  const LAYOUT = readFileSync(join(goc, "apps/hub/app/layout.tsx"), "utf8");

  it("cờ intro XOÁ TRƯỚC khi phát, không phải lúc phim kết thúc", () => {
    // Xoá ở lúc kết thúc thì một lần F5 giữa chừng để lại cờ còn nguyên → intro phát lại
    // mỗi lần tải trang, không dứt. Người dùng không có cách nào thoát ngoài xoá cookie.
    const i = INTRO.indexOf("removeItem");
    const j = INTRO.indexOf("setDangChay(true)");
    expect(i, "không thấy removeItem").toBeGreaterThan(-1);
    expect(i, "xoá cờ phải đứng TRƯỚC lệnh phát").toBeLessThan(j);
  });

  it("intro CHỈ đặt cờ khi đích là /home", () => {
    // `?then=` hợp lệ có thể là `/oidc/interaction/<uid>` — người dùng đang giữa luồng
    // đăng nhập của một app khác. Chen một đoạn phim toàn màn vào đó là chặn đúng việc
    // họ đang làm.
    expect(LOGIN).toMatch(/target === "\/home"[\s\S]{0,80}setItem\(CO_INTRO/);
  });

  it("LUÔN có đường ra: nút bỏ qua, và tự đóng khi video hỏng", () => {
    // Phim 10 giây không bỏ qua được là 10 giây không vào được app — cô giáo mở máy giữa
    // tiết thì đó là 10 giây trước mặt cả lớp.
    expect(INTRO, "thiếu nút bỏ qua").toContain("Vào Hub");
    // Mạng rớt hoặc thiếu file mà không bắt `onError` thì còn lại một màn đen phủ cả app.
    expect(INTRO, "thiếu onError — video hỏng sẽ để lại màn đen").toMatch(/onError=\{\(\) => setDangChay\(false\)\}/);
    expect(INTRO, "thiếu onEnded").toMatch(/onEnded=\{\(\) => setDangChay\(false\)\}/);
  });

  it("tôn trọng 'giảm chuyển động', và chạy CÂM", () => {
    expect(INTRO, "không kiểm prefers-reduced-motion").toContain("prefers-reduced-motion");
    // Có một lần nạp trang xen giữa cú bấm đăng nhập và trang đích, nên trang mới KHÔNG
    // còn cử chỉ người dùng — `play()` có tiếng sẽ bị chặn. Câm là chọn có chủ ý.
    expect(INTRO).toMatch(/v\.muted = true/);
  });

  it("intro đứng NGOÀI cổng check-in trong layout", () => {
    // Đặt trong nhánh `cong ? (…)` thì nó chỉ chạy cho người có cổng, và JSX vỡ vì nhánh
    // đó nhận một biểu thức chứ không nhận hai phần tử — đã vỡ thật một lần khi dựng.
    const i = LAYOUT.indexOf("<IntroCinematic />");
    const j = LAYOUT.indexOf("{cong ? (");
    expect(i, "layout chưa gắn IntroCinematic").toBeGreaterThan(-1);
    expect(i, "IntroCinematic phải đứng TRƯỚC nhánh cổng check-in").toBeLessThan(j);
  });

  it("trang đăng nhập dùng LẠI video đã tối ưu, không thêm file mới", () => {
    expect(LOGIN, "login phải dùng chung video với bản trình diễn").toContain(
      "/trinh-dien/uploads/su-tu-av1.mp4",
    );
    expect(LOGIN, "thiếu poster — 1,7 giây đầu sẽ là màn trống").toContain("su-tu-poster.webp");
    expect(LOGIN, "nền parallax cũ đã gỡ").not.toMatch(/<LoginParallaxBg/);
  });
});
