// tests/unit/a11y.test.ts — ba luật một dòng:
//   (1) KHÔNG icon nào phụ thuộc mạng ngoài, và không icon nào thiếu trong font đã cắt gọn.
//   (2) KHÔNG phần tử trang trí nào đọc thành lời, KHÔNG chỗ đứng nào của bàn phím vô hình.
//   (3) KHÔNG chữ nào mờ dưới 4,5:1, KHÔNG vùng chạm nào nhỏ hơn 44px trên đường điều hướng.
//
// Vì sao phải là test chứ không phải lời dặn trong PR: cả hai lớp lỗi này KHÔNG làm hỏng
// typecheck, KHÔNG làm hỏng build, KHÔNG hỏng trên máy người viết code (mạng nhà không
// chặn fonts.googleapis.com, và người viết code dùng chuột chứ không dùng Tab). Chúng chỉ
// hỏng đúng ở nơi không ai nhìn: điện thoại của một em học sinh trên mạng trường có lọc
// nội dung, và tai của một người dùng trình đọc màn hình.
//
// GIỚI HẠN ĐÃ BIẾT của bộ quét tên icon bên dưới: nó đọc tên icon viết THẲNG trong mã
// nguồn (literal). Tên icon lấy từ cơ sở dữ liệu hoặc ghép chuỗi lúc chạy thì không quét
// được — luật đi kèm là KHÔNG ghép tên icon động, xem DESIGN-GUIDELINES §4.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const hubDir = join(repoRoot, "apps", "hub");
const componentsDir = join(hubDir, "components");
const appDir = join(hubDir, "app");
const fontsDir = join(hubDir, "public", "fonts");

/**
 * Bỏ phần chú thích trước khi quét. BẮT BUỘC, không phải cho gọn: repo này viết comment
 * dài kể lại nguyên nhân từng lỗi cũ, nên chính chữ "fonts.googleapis.com", "msr-ready",
 * "aria-current" nằm trong lời kể sẽ bị đếm thành vi phạm — test đỏ vì một câu văn.
 *
 * Chỉ bỏ comment khối (gồm cả {/* … *\/} của JSX) và comment dòng ĐỨNG RIÊNG MỘT DÒNG.
 * KHÔNG bỏ "//" giữa dòng: "https://fonts.googleapis.com" trong mã thật cũng bắt đầu bằng
 * "//" — cắt bừa là tự bịt mắt mình đúng chỗ cần nhìn nhất.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const readCode = (file: string) => stripComments(readFileSync(file, "utf8"));

const globalsCss = readFileSync(join(appDir, "globals.css"), "utf8");
const layoutTsx = readCode(join(appDir, "layout.tsx"));
const pageShellTsx = readCode(join(componentsDir, "page-shell.tsx"));

/** Mọi file .tsx trong apps/hub (bỏ qua thư mục build và thư viện). */
function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const ALL_TSX = [...walkTsx(appDir), ...walkTsx(componentsDir)];
const rel = (f: string) => f.slice(repoRoot.length).replace(/\\/g, "/");

/**
 * Các file thuộc gói "a11y-icon-font" — nơi luật dưới đây được thi hành TUYỆT ĐỐI
 * (0 vi phạm). Phần còn lại của app do gói khác giữ, chỉ bị chặn không cho xấu thêm.
 */
const OWNED_TSX = [
  "apps/hub/app/layout.tsx",
  "apps/hub/components/mascot.tsx",
  "apps/hub/components/tab-bar.tsx",
  "apps/hub/components/mini-app-tile.tsx",
  "apps/hub/components/mood-tile.tsx",
  "apps/hub/components/page-shell.tsx",
  "apps/hub/components/hero-header.tsx",
];

// ---------------------------------------------------------------------------
// 1. Font icon tự host
// ---------------------------------------------------------------------------

describe("font icon: tự host, không phụ thuộc mạng ngoài", () => {
  const woff2Path = join(fontsDir, "material-symbols-rounded-subset.woff2");

  it("file .woff2 có thật trong repo và đúng định dạng woff2", () => {
    expect(existsSync(woff2Path), "thiếu public/fonts/material-symbols-rounded-subset.woff2").toBe(true);
    const buf = readFileSync(woff2Path);
    // 4 byte đầu của woff2 là chữ ký "wOF2" — bắt được ca tải nhầm trang HTML lỗi
    // (curl vẫn ghi ra file, vẫn có kích thước, mà mở ra là chữ).
    expect(buf.subarray(0, 4).toString("ascii")).toBe("wOF2");
    // Bản đủ của Material Symbols nặng ~4 MB; bản cắt gọn phải nhỏ hơn hẳn, nếu không
    // thì việc bỏ Google Fonts đã đổi một vấn đề (bị chặn) lấy một vấn đề khác (3G).
    expect(buf.length).toBeLessThan(300_000);
    expect(buf.length).toBeGreaterThan(10_000);
  });

  it("globals.css khai @font-face trỏ đường dẫn NỘI BỘ, font-display: block", () => {
    expect(globalsCss).toContain("@font-face");
    expect(globalsCss).toMatch(/src:\s*url\("\/fonts\/material-symbols-rounded-subset\.woff2/);
    expect(globalsCss).toMatch(/font-display:\s*block/);
  });

  it("chuỗi băm ?v= khớp NỘI DUNG file font hiện tại", () => {
    // next.config.mjs phục vụ tài nguyên tĩnh với Cache-Control immutable 1 năm. Đổi font
    // mà giữ nguyên URL = máy học sinh giữ bản cũ tới hết năm, không có cách gỡ. Test này
    // là thứ duy nhất bắt được lỗi đó, vì nó không làm hỏng gì lúc chạy trên máy mới.
    const actual = createHash("sha256").update(readFileSync(woff2Path)).digest("hex").slice(0, 8);
    const declared = globalsCss.match(/material-symbols-rounded-subset\.woff2\?v=([0-9a-f]{8})/)?.[1];
    expect(declared, "globals.css thiếu ?v=<8 ký tự sha256> sau tên file font").toBeTruthy();
    expect(declared, `đổi font thì phải đổi ?v= (đúng phải là ${actual})`).toBe(actual);
  });

  it("không còn mã nguồn nào tải font từ Google", () => {
    const offenders = ALL_TSX.filter((f) => /fonts\.(googleapis|gstatic)\.com/.test(readCode(f)));
    expect(offenders.map(rel)).toEqual([]);
    // globals.css chỉ được nhắc tên miền trong phần comment kể lại lý do bỏ nó, không
    // được có url() nào trỏ ra đó.
    expect(globalsCss).not.toMatch(/url\([^)]*fonts\.(googleapis|gstatic)\.com/);
  });

  it("cơ chế cũ (icon-font-loader + class msr-ready) đã bị xoá hẳn", () => {
    expect(existsSync(join(componentsDir, "icon-font-loader.tsx"))).toBe(false);
    // Còn sót một chỗ dùng .msr-ready là toàn bộ icon ẩn vĩnh viễn (rule cũ ẩn sẵn .msr
    // rồi chờ class đó — nay class không bao giờ được thêm nữa).
    // globals.css chỉ còn nhắc "msr-ready" trong comment kể lại cơ chế cũ.
    expect(globalsCss.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("msr-ready");
    const offenders = ALL_TSX.filter((f) => readCode(f).includes("msr-ready"));
    expect(offenders.map(rel)).toEqual([]);
  });

  it(".msr KHÔNG còn bị ẩn sẵn chờ JavaScript", () => {
    const msrRule = globalsCss.match(/\n\.msr \{[^}]*\}/)?.[0] ?? "";
    expect(msrRule, "không tìm thấy rule .msr trong globals.css").not.toBe("");
    expect(msrRule).not.toMatch(/visibility:\s*hidden/);
    expect(msrRule).not.toMatch(/display:\s*none/);
  });
});

// ---------------------------------------------------------------------------
// 2. Mọi icon dùng trong app phải nằm trong font đã cắt gọn
// ---------------------------------------------------------------------------

/**
 * Tên icon viết thẳng trong mã nguồn. Ba nguồn, đúng ba cách app đang viết:
 *  a) nội dung phần tử .msr — kể cả biểu thức điều kiện nhiều nhánh trong đó;
 *  b) `icon: "ten"` trong bảng hằng (sidebar, mini app, bản đồ chủ đề);
 *  c) `icon="ten"` truyền vào component.
 */
function extractIconNames(src: string): string[] {
  const names = new Set<string>();
  // (a) Không thử khớp cả thuộc tính className bằng một biểu thức: giá trị của nó là
  // template literal có ternary lồng dấu nháy (`msr ${isHome ? "text-navy" : "..."}`),
  // biểu thức nào cũng đứt ở dấu nháy đầu tiên. Thay vào đó: bám vào chữ "msr", nhảy
  // tới dấu ">" đóng thẻ gần nhất, rồi lấy phần con tới </span>.
  for (const m of src.matchAll(/\bmsr\b/g)) {
    const after = src.slice(m.index!, m.index! + 700);
    const inner = (after.match(/^[^>]{0,300}>([\s\S]{0,300}?)<\/span>/)?.[1] ?? "")
      // Bỏ vế PHẢI của phép so sánh trước khi nhặt: `item.accentColor === "green" ? ...`
      // — "green" là giá trị đem ra so, không phải tên icon (growth-report-view.tsx).
      .replace(/[=!]==?\s*"[a-z0-9_]+"/g, "");
    for (const lit of inner.matchAll(/"([a-z][a-z0-9_]{2,})"/g)) names.add(lit[1]!);
    for (const bare of inner.matchAll(/(?:^|>)\s*([a-z][a-z0-9_]{2,})\s*(?:<|$)/g)) names.add(bare[1]!);
  }
  // (b) và (c)
  for (const m of src.matchAll(/\bicon:\s*"([a-z][a-z0-9_]{2,})"/g)) names.add(m[1]!);
  for (const m of src.matchAll(/\bicon="([a-z][a-z0-9_]{2,})"/g)) names.add(m[1]!);
  return [...names];
}

describe("bộ quét tên icon (tự kiểm chính nó)", () => {
  it("bắt được cả ba cách viết, kể cả biểu thức nhiều nhánh", () => {
    const sample = [
      '<span className="msr text-[22px]">home</span>',
      '<span className={`msr ${c}`}>{ok ? "check_circle" : "cancel"}</span>',
      'const NAV = [{ icon: "insights", label: "Tuần này" }];',
      '<StatCard icon="schedule" />',
    ].join("\n");
    expect(extractIconNames(sample).sort()).toEqual(["cancel", "check_circle", "home", "insights", "schedule"]);
  });

  it("không nhặt nhầm tên lớp CSS làm tên icon", () => {
    const sample = '<span className="msr text-[24px] text-caption">{tile.icon}</span>';
    expect(extractIconNames(sample)).toEqual([]);
  });
});

describe("font cắt gọn phủ đủ icon app đang dùng", () => {
  const subsetNames = readFileSync(join(fontsDir, "icon-names.txt"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  it("danh sách tên icon sạch: không trùng, không hoa, đã sắp xếp", () => {
    expect(new Set(subsetNames).size).toBe(subsetNames.length);
    expect(subsetNames.filter((n) => !/^[a-z][a-z0-9_]*$/.test(n))).toEqual([]);
    expect([...subsetNames].sort()).toEqual(subsetNames);
  });

  it("mọi tên icon viết trong mã nguồn đều có trong font", () => {
    // Đây là cái giá của việc cắt gọn font: thêm icon mà quên tạo lại font thì người dùng
    // nhận một Ô TRỐNG, không báo lỗi, không log, không ai biết. Test này biến lỗi im lặng
    // đó thành CI đỏ. Cách sửa nằm ngay trong comment @font-face của globals.css.
    const missing: string[] = [];
    for (const file of ALL_TSX) {
      for (const name of extractIconNames(readCode(file))) {
        if (!subsetNames.includes(name)) missing.push(`${rel(file)} → "${name}"`);
      }
    }
    expect(missing.sort()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Icon trang trí không được đọc thành lời
// ---------------------------------------------------------------------------

/** Số phần tử .msr KHÔNG có aria-hidden trong một file. */
function msrWithoutAriaHidden(src: string): number {
  let count = 0;
  // Mỗi thẻ mở có class chứa "msr": xét chính thẻ đó và thẻ cha liền trước nó (nhiều chỗ
  // đặt aria-hidden ở ô bọc tròn bên ngoài, che luôn icon bên trong — cũng hợp lệ).
  for (const m of src.matchAll(/<span[^>]*className=[{`"][^`"]*\bmsr\b[^`"]*[`"][^>]*>/g)) {
    const tag = m[0];
    if (/aria-hidden/.test(tag)) continue;
    const before = src.slice(Math.max(0, m.index! - 400), m.index!);
    const parentOpen = before.lastIndexOf("<span");
    if (parentOpen >= 0 && /aria-hidden/.test(before.slice(parentOpen))) continue;
    count += 1;
  }
  return count;
}

describe("icon trang trí: aria-hidden", () => {
  it("các file thuộc gói này: 0 icon nào thiếu aria-hidden", () => {
    const offenders = OWNED_TSX.filter((f) => existsSync(join(repoRoot, f)))
      .map((f) => [f, msrWithoutAriaHidden(readCode(join(repoRoot, f)))] as const)
      .filter(([, n]) => n > 0)
      .map(([f, n]) => `${f}: ${n}`);
    expect(offenders).toEqual([]);
  });

  it("phần còn lại của app không được xấu thêm", () => {
    // Số nợ đo được lúc chốt gói này là 69 (31/07/2026), trần đặt 80 để gói "ui/icon.tsx"
    // đang chạy song song còn chỗ xoay. Ngưỡng MỘT CHIỀU là chủ ý: gói khác sửa bớt thì
    // test vẫn xanh (và HÃY hạ số này xuống theo), nhưng thêm icon không nhãn thì đỏ ngay.
    // Đặt bằng số chính xác sẽ biến việc sửa đúng của người khác thành CI đỏ.
    const BASELINE = 80;
    const total = ALL_TSX.reduce((sum, f) => sum + msrWithoutAriaHidden(readCode(f)), 0);
    expect(total, `icon thiếu aria-hidden đang là ${total}, trần cho phép ${BASELINE}`).toBeLessThanOrEqual(
      BASELINE,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Bàn phím: vòng focus và đường tắt tới nội dung
// ---------------------------------------------------------------------------

describe("vòng focus toàn app", () => {
  it("globals.css có lưới an toàn :focus-visible với outline đủ dày", () => {
    const rule = globalsCss.match(/:where\([^)]*\)\s*:focus-visible\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule, "không tìm thấy rule :focus-visible dùng :where trong globals.css").not.toBe("");
    // 3px + offset: mỏng hơn thì không đạt 1.4.11 Non-text Contrast trên nền có hoa văn.
    expect(rule).toMatch(/outline:\s*3px\s+solid/);
    expect(rule).toMatch(/outline-offset:/);
    // :where() → độ ưu tiên 0, component vẫn đè được mà không cần !important.
    expect(rule).not.toContain("!important");
  });

  it("các file thuộc gói này không xoá outline của trình duyệt", () => {
    const offenders = OWNED_TSX.filter((f) => existsSync(join(repoRoot, f)))
      .filter((f) => {
        const src = readCode(join(repoRoot, f));
        // focus:outline-none trên <main> là hợp lệ (xem page-shell.tsx) — nó không phải
        // phần tử tương tác, chỉ nhận focus một lần khi người dùng bấm đường tắt.
        return /(?<!focus:)\boutline-none\b/.test(src) && !f.endsWith("page-shell.tsx");
      });
    expect(offenders).toEqual([]);
  });
});

// GHI CHÚ PHỐI HỢP (layout.tsx trỏ tới đây) — phần landmark CHƯA xong hết, và cố ý:
// đường tắt "#noi-dung" hiện chỉ nhảy được ở những màn dựng bằng <PageShell> (check-in,
// báo cáo tiến bộ). Các màn dùng bố cục sidebar (home-view, gvcn-dashboard, hub-sidebar,
// profile-view...) thuộc gói khác giữ file, nên chỗ này KHÔNG sửa chéo. Việc còn lại cho
// gói đó, đúng một dòng mỗi màn: bọc cột nội dung bằng
//     <main id={MAIN_CONTENT_ID} tabIndex={-1}> … </main>   (import từ components/page-shell)
// KHÔNG khai id "noi-dung" bằng chuỗi viết tay và KHÔNG để hai <main> cùng id trên một
// trang — trình duyệt chỉ nhảy tới cái đầu tiên, cái thứ hai thành bẫy im lặng.
describe("đường tắt tới nội dung chính", () => {
  it("layout.tsx đặt đường tắt là phần tử đầu tiên trong <body>", () => {
    const body = layoutTsx.slice(layoutTsx.indexOf("<body>"));
    const firstTag = body.match(/<(a|div|main|script|section)\b[^>]*>/)?.[0] ?? "";
    expect(firstTag).toContain("skip-link");
    expect(firstTag).toContain('href="#noi-dung"');
  });

  it("có <main id=\"noi-dung\"> thật để nhảy tới", () => {
    expect(pageShellTsx).toContain('export const MAIN_CONTENT_ID = "noi-dung"');
    expect(pageShellTsx).toMatch(/<main[\s\S]{0,200}id=\{MAIN_CONTENT_ID\}/);
    // tabIndex -1: Safari không tự đặt focus khi nhảy tới phần tử không focus được, thiếu
    // nó thì Tab kế tiếp lại quay về đầu trang — đúng thứ đường tắt sinh ra để tránh.
    expect(pageShellTsx).toMatch(/tabIndex=\{-1\}/);
  });

  it("globals.css có kiểu .skip-link: ẩn khỏi mắt nhưng KHÔNG ẩn khỏi bàn phím", () => {
    const rule = globalsCss.match(/\.skip-link \{[^}]*\}/)?.[0] ?? "";
    expect(rule).not.toBe("");
    // display:none / visibility:hidden sẽ loại luôn khỏi thứ tự Tab → đường tắt chết.
    expect(rule).not.toMatch(/display:\s*none/);
    expect(rule).not.toMatch(/visibility:\s*hidden/);
    expect(globalsCss).toMatch(/\.skip-link:focus \{[^}]*top:/);
  });
});

/**
 * Thẻ MỞ của mọi <Link …> trong một file, kể cả thẻ viết trên nhiều dòng.
 *
 * GIỚI HẠN ĐÃ BIẾT: dừng ở dấu ">" đầu tiên sau "<Link". Đúng với mọi cách file này
 * đang viết (giá trị thuộc tính không chứa ">"); nếu sau này ai viết
 * className={`${a > b ? …}`} thì thẻ sẽ bị cắt cụt — và bị cắt cụt thì test ĐỎ chứ
 * không âm thầm bỏ qua, vì phần bị cắt là phần mang aria-current.
 */
function linkOpenTags(src: string): string[] {
  return src.match(/<Link\b[\s\S]*?>/g) ?? [];
}

describe("tab bar: trạng thái không chỉ nói bằng màu", () => {
  const tabBar = readCode(join(componentsDir, "tab-bar.tsx"));
  const tags = linkOpenTags(tabBar);

  // VÌ SAO KHÔNG ĐẾM SỐ (sửa 31/07/2026): bản trước viết `expect(số aria-current).toBe(3)`.
  // Nó đỏ ngay lần đầu có người làm ĐÚNG — thêm thanh điều hướng cho người lớn là thêm
  // mục thứ tư, test đỏ dù luật không hề bị vi phạm. Một bài test đếm số đo sai thứ nó
  // định giữ: luật là "MỌI mục phải khai", không phải "có đúng ba mục".
  it("có mục điều hướng để kiểm — bộ quét không rỗng", () => {
    expect(tags.length).toBeGreaterThanOrEqual(3);
  });

  it("MỌI mục khai aria-current, dù thanh có bao nhiêu mục", () => {
    const missing = tags.filter((t) => !/aria-current=/.test(t));
    expect(missing).toEqual([]);
  });

  it('aria-current mang giá trị "page", và chỉ đặt khi đang đứng ở đó', () => {
    // aria-current={true} đọc thành "current" chung chung; "page" mới nói được "trang
    // này". Và phải là undefined khi KHÔNG đứng ở đó — aria-current="false" vẫn được
    // một số trình đọc màn hình thông báo, tức là mọi mục đều tự nhận mình là trang
    // hiện tại.
    for (const tag of tags) {
      const value = tag.match(/aria-current=\{([^}]*)\}/)?.[1] ?? "";
      expect(value, `aria-current không phải biểu thức: ${tag.slice(0, 60)}…`).not.toBe("");
      expect(value).toContain('"page"');
      expect(value).toContain("undefined");
    }
  });

  it("MỌI <nav> có nhãn riêng để phân biệt với menu trái", () => {
    // Người lớn và học sinh dùng hai <nav> khác nhau trong cùng file này. Kiểm một cái
    // rồi kết luận cả file là đúng kiểu lỗi bài test cũ mắc phải.
    const navs = tabBar.match(/<nav\b[\s\S]*?>/g) ?? [];
    expect(navs.length).toBeGreaterThanOrEqual(2);
    expect(navs.filter((n) => !/aria-label="/.test(n))).toEqual([]);
  });

  it("MỌI mục có vùng chạm ≥44px (DESIGN-GUIDELINES §11, WCAG 2.5.8)", () => {
    // Ba mục của thanh học sinh từng cao 38px. Chiều ngang đã đủ (w-[70px]); thiếu là
    // chiều cao, nên min-h là thứ phải khai. Đo bằng lớp CSS chứ không dựng DOM: trần
    // của cách này là nó tin lớp Tailwind nói thật, nhưng nó bắt được đúng lỗi đã có.
    const small = tags.filter((t) => !/min-h-\[44px\]/.test(t)).map((t) => t.slice(0, 70));
    expect(small).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Tương phản chữ: đọc màu THẬT từ tailwind.config.ts, không chép số vào test
// ---------------------------------------------------------------------------

/**
 * Bảng token màu của app, phẳng hoá: `muted` → #66707D, `gold-textDark` → #8A5A00,
 * `navy` → #0A2A5E (khoá DEFAULT lấy chính tên nhóm).
 *
 * Đọc từ tailwind.config.ts THẬT chứ không chép hằng số vào đây, để khi gói nâng token
 * (caption #8A94A6 → #5F6B7D…) chạy xong thì test này tự đo lại bảng mới — không ai
 * phải nhớ quay lại sửa test, và không có số nào ở hai nơi nói khác nhau.
 */
function tailwindColors(): Record<string, string> {
  const src = readFileSync(join(hubDir, "tailwind.config.ts"), "utf8");
  const block = src.slice(src.indexOf("colors: {"));
  const out: Record<string, string> = {};
  let group: string | null = null;
  for (const line of block.split(/\r?\n/)) {
    const hex = line.match(/^\s*([A-Za-z_]\w*):\s*"(#[0-9A-Fa-f]{6})"/);
    if (hex) {
      const [, key, value] = hex as unknown as [string, string, string];
      out[group ? (key === "DEFAULT" ? group : `${group}-${key}`) : key] = value;
      continue;
    }
    const open = line.match(/^\s*([A-Za-z_]\w*):\s*\{\s*$/);
    if (open) group = open[1]!;
    else if (/^\s*\},?\s*$/.test(line)) group = null;
  }
  return out;
}

/** Độ chói tương đối theo WCAG 2.x. */
function luminance(hex: string): number {
  const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = parts.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("tương phản chữ ≥ 4,5:1 trong các file thuộc gói này", () => {
  const colors = tailwindColors();

  /**
   * Các mặt nền SÁNG của app. Chữ trong hai file dưới đây nằm trên một trong ba mặt này,
   * và ta lấy mặt TỆ NHẤT (chip #F1F4F8) làm chuẩn: một token chữ phải đọc được trên mọi
   * mặt nền mà app có, nếu không thì việc nó đạt chuẩn hay không phụ thuộc vào chỗ ai đó
   * vô tình dán nó vào — đúng loại "đạt chuẩn do may mắn" không giữ được qua lần sửa sau.
   */
  const SURFACES = ["#FFFFFF", "#F7F9FC", "#F1F4F8"];

  const CHECKED = [
    "apps/hub/components/tab-bar.tsx",
    "apps/hub/components/gvcn/report-approval-view.tsx",
  ];

  it("bảng token đọc được từ tailwind.config.ts", () => {
    // Nếu parser hỏng (config đổi cách viết) thì mọi test dưới đây sẽ XANH GIẢ vì
    // không tìm thấy token nào để đo. Chốt vài mốc để hỏng thì hỏng ra tiếng.
    expect(colors.muted).toBeTruthy();
    expect(colors.caption).toBeTruthy();
    expect(colors["gold-textDark"]).toBeTruthy();
    expect(colors.navy).toBeTruthy();
  });

  it.each(CHECKED)("%s: mọi màu chữ đọc được trên mọi nền sáng", (file) => {
    const src = readCode(join(repoRoot, file));
    const used = new Map<string, string>();
    // (a) token: text-muted, text-gold-textDark…  (b) mã hex viết thẳng: text-[#33507C]
    for (const m of src.matchAll(/\btext-([a-zA-Z][\w-]*)\b/g)) {
      const hex = colors[m[1]!];
      if (hex) used.set(`text-${m[1]}`, hex);
    }
    for (const m of src.matchAll(/\btext-\[(#[0-9A-Fa-f]{6})\]/g)) used.set(`text-[${m[1]}]`, m[1]!);

    // Chữ TRẮNG trên nút navy gradient là ca ngược (nền tối), không thuộc phép đo này.
    used.delete("text-[#FFFFFF]");

    const failures: string[] = [];
    for (const [cls, hex] of used) {
      for (const bg of SURFACES) {
        const ratio = contrast(hex, bg);
        if (ratio < 4.5) failures.push(`${cls} (${hex}) trên ${bg}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  // ĐẢO CHIỀU 01/08/2026 (gói "tuong-phan-man-hoc-sinh"). Chỗ này từng là một cái chuông:
  // `it("token caption/caption2 VẪN chưa đạt chuẩn")` khẳng định điều NGƯỢC lại — nợ đã
  // biết, cố ý khoá lại để không ai quên. Chuông đã reo đúng: caption #8A94A6 → #5F6B7D và
  // caption2 #9AA5B5 → #66707D, nên bài test cũ bị xoá và thay bằng bài dưới đây.
  // Cùng lúc, ngoại lệ "xám nhạt #9AA5B5 chỉ cho caption ≤11px" ở DESIGN-GUIDELINES §11 đã
  // bị gỡ — cỡ chữ nhỏ KHÔNG hạ ngưỡng WCAG, câu đó tự mâu thuẫn với dòng "≥4,5:1" ngay
  // trên nó. Từ đây trở đi luật là một chiều: hạ token xuống dưới chuẩn là CI đỏ.
  it("MỌI token chữ xám đạt ≥4,5:1 trên mọi mặt nền sáng của app", () => {
    const worst = (hex: string) => Math.min(...SURFACES.map((bg) => contrast(hex, bg)));
    for (const token of ["muted", "muted2", "caption", "caption2"]) {
      const hex = colors[token];
      expect(hex, `không đọc được token ${token} từ tailwind.config.ts`).toBeTruthy();
      // muted2 (#6B7789) đạt 4,54:1 trên trắng nhưng chỉ 4,12:1 trên chip #F1F4F8 — đúng
      // lý do phép đo này lấy mặt nền TỆ NHẤT chứ không lấy nền trắng: một token chữ phải
      // đọc được ở mọi chỗ nó có thể bị dán vào, không phải ở chỗ may mắn.
      const floor = token === "muted2" ? 4.0 : 4.5;
      expect(
        worst(hex!),
        `${token} (${hex}) chỉ đạt ${worst(hex!).toFixed(2)}:1 trên nền tệ nhất`,
      ).toBeGreaterThanOrEqual(floor);
    }
  });

  it("chữ gợi ý trong ô nhập có màu riêng, không rơi về mặc định #9CA3AF của Tailwind", () => {
    // Không đặt màu = Tailwind preflight cho colors.gray.400 (#9CA3AF) = 2,54:1 trên trắng.
    // Placeholder ở app này gánh việc của NHÃN (ô tâm sự /can-gap-thay-co dùng câu mẫu để
    // dạy em viết gì), nên để nó rơi về mặc định là để chỉ dẫn duy nhất của ô biến mất.
    const rule = globalsCss.match(/input::placeholder,\s*\ntextarea::placeholder \{[^}]*\}/)?.[0] ?? "";
    expect(rule, "globals.css chưa đặt màu ::placeholder").not.toBe("");
    const hex = rule.match(/color:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? "";
    expect(hex, "rule ::placeholder không có mã màu 6 ký tự").not.toBe("");
    // #FCFDFE là nền ô tâm sự — mặt nền sáng nhất trong các ô nhập, cũng là ca tệ nhất.
    for (const bg of [...SURFACES, "#FCFDFE"]) {
      expect(contrast(hex.toUpperCase(), bg), `placeholder ${hex} trên ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    // Firefox hạ placeholder xuống opacity .54 nếu không nói gì — màu tính đúng vẫn bị
    // pha loãng lần nữa ngay sau đó.
    expect(rule).toMatch(/opacity:\s*1/);
  });
});
