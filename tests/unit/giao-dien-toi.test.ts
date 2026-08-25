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
/* 24/08/2026: /home nay là trang SÁNG theo lệnh trực tiếp ("cái theme tôi đã gửi" —
   skin .s-home/.hv-* trong globals.css, nền #FFFFFF). Guard này KHÔNG mâu thuẫn: nó chỉ
   cấm các hex của giao diện sáng CŨ quay lại, không cấm màu sáng mà chủ đầu tư đặt hàng.
   Xem tests/unit/home-khop-thiet-ke.test.ts. */
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

  it("nền trang và color-scheme về hệ SÁNG (25/08/2026 — 'nền sáng, ưu tiên trắng')", () => {
    // Lật ngược guard 24/08: theme tối chỉ sống đúng một ngày; hệ chốt là SÁNG "SCI-FI
    // HUD" đọc từ cascade cuối của bản vẽ. color-scheme: light để ô nhập/thanh cuộn/ô
    // chọn vẽ theo hệ sáng — cùng lý do dòng dark từng tồn tại, chiều ngược lại.
    expect(CSS, "color-scheme còn dark — ô nhập và thanh cuộn vẫn vẽ theo hệ tối").toContain(
      "color-scheme: light",
    );
    expect(CSS, "body phải nền trắng của bản vẽ").toMatch(/body\s*\{[^}]*background:\s*#ffffff/i);
    // Ba khối CỐ Ý đứng ngoài hệ sáng — cảnh đăng nhập, sidebar, đầu trang hv-thanh —
    // không dùng token; token lật thì chúng không được đổi theo.
    const SIDEBAR = readFileSync(join(goc, "apps/hub/components/hub-sidebar.tsx"), "utf8");
    expect(SIDEBAR).toContain('bg-[linear-gradient(168deg,#0E3C8C_0%,#0A2A5E_34%,#082049_62%,#051530_100%)]');
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
    expect(INTRO, "thiếu nút bỏ qua").toContain("Vào trang chủ");
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

// ---------------------------------------------------------------------------
// MÀN ĐEN CHẶN — không được lộ trang chủ trước khi intro phủ
// ---------------------------------------------------------------------------
// Chủ đầu tư 24/08/2026: *"khi ấn đăng nhập thì nó vào trang home ngay, sau đó nó mới
// load intro"*. Nguyên nhân: cờ intro đọc trong useEffect — SAU hydrate, mà hydrate chạy
// sau khi HTML trang chủ đã vẽ. Sửa bằng một <script> inline KHÔNG defer ở đầu <body>:
// parser gặp là chạy ngay, màn đen dựng TRƯỚC khung hình đầu tiên của trang.
describe("màn đen chặn cho intro", () => {
  const LAYOUT2 = readFileSync(join(goc, "apps/hub/app/layout.tsx"), "utf8");
  const INTRO2 = readFileSync(join(goc, "apps/hub/components/intro-cinematic.tsx"), "utf8");

  it("script chặn đứng TRƯỚC nội dung trang trong layout", () => {
    const iScript = LAYOUT2.indexOf("intro-man-den");
    const iChildren = LAYOUT2.indexOf("{cong ? (");
    expect(iScript, "mất script chặn — trang chủ lại lộ ra trước intro").toBeGreaterThan(-1);
    expect(iScript, "script phải đứng TRƯỚC nội dung, sau nó là vô nghĩa").toBeLessThan(iChildren);
  });

  it("script chặn giữ đủ ba chốt an toàn", () => {
    const i = LAYOUT2.indexOf("dangerouslySetInnerHTML");
    const script = LAYOUT2.slice(i, LAYOUT2.indexOf("/>", i));
    // 1. KHÔNG xoá cờ — IntroCinematic là chủ duy nhất của cờ; xoá hai nơi là hai nơi lệch.
    expect(script, "script tự xoá cờ — tranh quyền với IntroCinematic").not.toContain("removeItem");
    // 2. Tôn trọng giảm-chuyển-động ngay từ đây: không bắt ai nhìn màn đen chờ một đoạn
    //    phim sẽ không chiếu.
    expect(script).toContain("prefers-reduced-motion");
    // 3. Trần 6 giây tự gỡ: hydrate chết thì màn đen không được thành nhà tù.
    expect(script).toMatch(/setTimeout[\s\S]*6000/);
    // Và nó phải nằm DƯỚI lớp phủ của IntroCinematic (79 < 80) để lúc bàn giao không nháy.
    expect(script).toContain("z-index:79");
  });

  it("IntroCinematic gỡ màn đen ở CẢ ba nhánh — không cờ, giảm chuyển động, và bắt đầu chiếu", () => {
    // Sót nhánh nào thì ở nhánh đó người dùng nhìn màn đen tới trần 6 giây.
    const soLanGo = (INTRO2.match(/getElementById\("intro-man-den"\)/g) ?? []).length;
    expect(soLanGo, "phải có chỗ gỡ màn đen ở nhánh không-chiếu VÀ nhánh chiếu").toBeGreaterThanOrEqual(2);
    // Nhánh chiếu: gỡ trong effect của `dangChay` — SAU khi lớp phủ của chính component
    // đã vẽ đè lên, nên không có khung hình hở nào ở giữa.
    const iPlay = INTRO2.indexOf("if (!dangChay) return;");
    const sauPlay = INTRO2.slice(iPlay, iPlay + 300);
    expect(sauPlay, "nhánh chiếu phải gỡ màn đen sau khi lớp phủ của nó đã vẽ").toContain("intro-man-den");
  });
});

// ---------------------------------------------------------------------------
// INTRO KHÔNG ĐƯỢC BẮT NGƯỜI DÙNG ĐỢI — hai tầng, thiếu tầng nào hỏng kiểu đó
// ---------------------------------------------------------------------------
// Chủ đầu tư 24/08/2026, ba lần cùng một câu: *"ấn đăng nhập xong load video lâu cực kì"*.
// Nguyên nhân: intro (3,4 MB) chỉ bắt đầu tải SAU cú bấm + một lần nạp trang — màn đen
// chặn đứng đó trong lúc file chảy qua mạng.
describe("nền sao và hover không dịch chuyển — hai lệnh 24/08", () => {
  const LOGIN4 = readFileSync(join(goc, "apps/hub/components/login-form.tsx"), "utf8");
  // BÓC CHÚ THÍCH trước khi soát — lần THỨ SÁU trong đợt này một guard suýt đỏ vì chính
  // lời giải thích của nó: chú thích sao-nen.tsx kể vì sao KHÔNG dùng unpkg, và guard dò
  // chữ "unpkg" đọc trúng câu kể đó.
  const SAO = readFileSync(join(goc, "apps/hub/components/sao-nen.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ 	]*\/\/.*$/gm, "");

  it("nền đen có sao, tự vẽ — KHÔNG three.js, không CDN", () => {
    // "bôi đen nhiều mà nó không chứa gì thì cũng ko tốt" — nhưng mạng trường có lọc nội
    // dung: kéo three.js từ unpkg là canvas trắng trơn không báo lỗi (DOC-TRUOC đã ghi).
    // "chỉ dồn bên phần có loang đen thôi, không được tràn qua video" (chỉnh lần hai
    // 24/08): sao phải mang MẶT NẠ trùng hình vùng tối — bỏ mặt nạ là sao phủ lên video.
    expect(LOGIN4).toMatch(/<SaoNen className="\[mask-image:/);
    expect(LOGIN4, "mặt nạ phải có lớp xéo 292° trùng với lớp bóng").toMatch(/mask-image:[^"]*292deg/);
    expect(SAO, "cấm import thư viện ngoài cho hiệu ứng nền").not.toMatch(/from "three|unpkg|cdn/);
    expect(SAO, "phải tôn trọng giảm-chuyển-động").toContain("prefers-reduced-motion");
    expect(SAO, "tab nền không được ăn pin").toContain("visibilitychange");
    expect(SAO, "trang trí không được chặn cú bấm nào").toContain("pointer-events-none");
  });

  it("hover KHÔNG dịch chuyển phần tử — nguồn giật đã trị, không được rước lại", () => {
    // Nút nhích lên dưới con trỏ đứng ở mép = vòng hover bật-tắt vô hạn: nhích lên → trỏ
    // ra ngoài → tụt về → trỏ lại vào. Đó là cái "giật giật" chủ đầu tư báo 24/08.
    expect(LOGIN4, "hover-translate quay lại màn đăng nhập").not.toMatch(/hover:-translate-y/);
  });
});

describe("intro không bắt người dùng đợi", () => {
  const LOGIN3 = readFileSync(join(goc, "apps/hub/components/login-form.tsx"), "utf8");
  const INTRO3 = readFileSync(join(goc, "apps/hub/components/intro-cinematic.tsx"), "utf8");

  it("tầng 1 — màn đăng nhập TẢI TRƯỚC file intro, và chỉ bản đúng codec", () => {
    // Người dùng đứng ở màn đăng nhập vài giây là đủ cho 3,4 MB vào cache (đã đo:
    // Next trả max-age=0 + ETag → lần hai là 304; Cloudflare giữ 4 giờ).
    expect(LOGIN3, "mất tải-trước — màn đen sẽ lại chờ 3,4 MB").toContain("intro-av1.mp4");
    // Phải CHỌN codec như thẻ <video> sẽ chọn — tải cả hai là phí gấp đôi băng thông
    // cho một file không bao giờ phát.
    // 25/08: phép chọn codec đổi từ canPlayType ("có mở được không") sang av1Muot()
    // (decodingInfo — "mở có MƯỢT không"): đo thật trên máy chủ đầu tư, AV1 1080p trả
    // smooth:false trong khi H.264 smooth:true — "lag lag" là CPU gánh AV1 phần mềm.
    expect(LOGIN3).toContain("av1Muot");
    expect(LOGIN3, "thiếu bản dự phòng cho máy không đọc AV1").toContain("intro-software.mp4");
    expect(LOGIN3, "force-cache để lần hai lấy từ cache, không hỏi lại mạng").toContain('cache: "force-cache"');
  });

  it("tầng 2 — trần chờ 2,5s: mạng không kịp thì BỎ intro, vào thẳng app", () => {
    // `play()` trên video chưa đệm đủ treo lời hứa vô hạn — không trần là người dùng
    // nhìn nền đen 5–10 giây vì một đoạn TRANG TRÍ.
    expect(INTRO3, "mất trần chờ").toMatch(/setTimeout\(\(\) => setDangChay\(false\), 2500\)/);
    // Nghe `playing` (ảnh đã thật sự chạy), không phải `canplay` (mới đủ dữ liệu).
    expect(INTRO3, "trần phải được xoá khi video THẬT SỰ chạy").toMatch(
      /addEventListener\("playing"/,
    );
    // Và phải dọn cả hai khi unmount — không dọn là setState trên component đã chết.
    expect(INTRO3).toMatch(/removeEventListener\("playing"/);
  });
});

// ---------------------------------------------------------------------------
// VIDEO NỀN PHẢI LÀ BẢN VÒNG-LẶP-LIỀN-MẠCH 7 GIÂY
// ---------------------------------------------------------------------------
// Chủ đầu tư 24/08/2026: *"lúc hết video quay lại đang bị khựng"*. Đo ra: mối nối cũ
// (khung cuối → khung đầu) có PSNR 13,8 trong khi hai khung kề bình thường là 17,0 — cú
// nhảy lớn hơn hẳn nhịp thường, mắt bắt được. Sửa TRONG FILE bằng crossfade giây cuối
// vào giây đầu (thân = giây 1–8, đầu = giây 0–1, xfade 1s): bản ra dài 7s và mối nối đo
// được 18,1 — MƯỢT HƠN một bước hình bình thường. Không một dòng JS nào.
//
// Bài này canh THỜI LƯỢNG đọc từ mvhd: ai xuất lại video 8 giây từ nguồn (quên bước
// crossfade) là cú khựng quay lại, và không test giá trị nào khác thấy được.
describe("video nền — vòng lặp liền mạch", () => {
  function thoiLuong(p: string): number {
    const b = readFileSync(join(goc, p));
    const i = b.indexOf(Buffer.from("mvhd"));
    expect(i, `${p}: không thấy mvhd`).toBeGreaterThan(-1);
    const ver = b[i + 4];
    // mvhd v0: timescale ở +12 (4 byte), duration ở +16 (4 byte); v1: +20 (4), +24 (8).
    const ts = ver === 1 ? b.readUInt32BE(i + 24) : b.readUInt32BE(i + 16);
    const du = ver === 1 ? Number(b.readBigUInt64BE(i + 28)) : b.readUInt32BE(i + 20);
    return du / ts;
  }
  it("cả AV1 lẫn H.264 dự phòng đều ~7s — bản đã crossfade, không phải nguồn 8s", () => {
    for (const f of [
      "apps/hub/public/trinh-dien/uploads/su-tu-av1.mp4",
      "apps/hub/public/trinh-dien/uploads/su-tu-chay.mp4",
    ]) {
      const d = thoiLuong(f);
      expect(d, `${f}: ${d.toFixed(2)}s — nguồn 8s chưa qua crossfade?`).toBeGreaterThan(6.7);
      expect(d, `${f}: ${d.toFixed(2)}s`).toBeLessThan(7.3);
    }
  });
});
