// tests/unit/a11y-nen.test.ts — gói "a11y-nen": NỀN tiếp cận của các màn học sinh/
// phụ huynh. Bốn luật, tất cả đều là lỗi ĐÃ ĐO ĐƯỢC trên bản chạy ngày 31/07/2026:
//
//   1. Đường tắt bàn phím "Bỏ qua menu" ở layout.tsx trỏ #noi-dung, mà 11/12 trang
//      không có phần tử nào mang id đó → bấm xong không đi tới đâu. Không lỗi, không
//      log, không ai biết: người dùng chuột không bao giờ chạm tới nó.
//   2. Không một màn học sinh/phụ huynh nào có <h1>. Trình đọc màn hình mở trang ra
//      không có cách nào biết "đây là trang gì" ngoài đọc tuần tự từ đầu.
//   3. Ô tâm sự (trang "Cần gặp thầy cô") tự xoá vòng focus của trình duyệt rồi bù
//      bằng đổi màu viền 1,5px — vô hình với người mù màu, và đúng ở ô riêng tư nhất.
//   4. Hai màn (Điểm danh, Tuần này) chặn hẳn điện thoại bằng "mở trên máy tính",
//      trong khi PRODUCT.md ghi bối cảnh dùng thật của học sinh THCS LÀ điện thoại và
//      page.tsx của hai trang đó chỉ cho học sinh vào. Màn chặn chặn đúng 100% người
//      dùng thật của nó.
//
// Vì sao phải là test chứ không phải lời dặn: không lỗi nào trong bốn lỗi trên làm
// hỏng typecheck, hỏng build, hay hỏng trên máy người viết code. Chúng chỉ hỏng ở nơi
// không ai nhìn — bàn phím, trình đọc màn hình, và màn hình 390px của một đứa trẻ.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const hubDir = join(repoRoot, "apps", "hub");
const componentsDir = join(hubDir, "components");

/**
 * Bỏ chú thích trước khi quét — BẮT BUỘC, không phải cho gọn: repo này viết comment dài
 * kể lại nguyên nhân từng lỗi cũ, nên chính chữ `<main id="noi-dung">`, `<h1>`,
 * `focus:outline-none` nằm trong lời kể sẽ bị đếm thành mã thật (hoặc thành vi phạm).
 * Cùng một hàm với tests/unit/a11y.test.ts, cùng một lý do.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const read = (rel: string) => stripComments(readFileSync(join(repoRoot, rel), "utf8"));
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

/** Các màn thuộc gói này: đủ landmark, đủ tiêu đề, mở được bằng điện thoại. */
const OWNED_VIEWS = [
  "apps/hub/components/attendance-view.tsx",
  "apps/hub/components/this-week-view.tsx",
  "apps/hub/components/profile-view.tsx",
  "apps/hub/components/help-request-view.tsx",
];

/**
 * Cắt ra phần JSX nằm GIỮA <MainContent …> và </MainContent>. Một file có thể có nhiều
 * vùng (profile-view có hai nhánh: học sinh và nhân viên) nên trả về mảng.
 * Cách cắt thô (tìm thẻ đóng gần nhất) là đủ và cố ý: <MainContent> không lồng nhau —
 * chính điều đó là thứ test này canh.
 */
function mainRegions(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/<MainContent\b/g)) {
    const rest = src.slice(m.index!);
    const end = rest.indexOf("</MainContent>");
    out.push(end === -1 ? rest : rest.slice(0, end));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Landmark <main id="noi-dung"> — đích thật của đường tắt bàn phím
// ---------------------------------------------------------------------------

describe("landmark: đường tắt 'Bỏ qua menu' phải nhảy tới được", () => {
  const pageShell = read("apps/hub/components/page-shell.tsx");
  const layout = read("apps/hub/app/layout.tsx");

  it("layout.tsx và page-shell.tsx nói CÙNG một id", () => {
    const declared = pageShell.match(/MAIN_CONTENT_ID = "([a-z-]+)"/)?.[1];
    expect(declared, "page-shell.tsx không còn khai MAIN_CONTENT_ID").toBeTruthy();
    expect(layout).toContain(`href="#${declared}"`);
  });

  it("page-shell.tsx xuất <MainContent> dùng chung, có tabIndex -1", () => {
    expect(pageShell).toMatch(/export function MainContent\(/);
    const main = pageShell.match(/<main[\s\S]{0,400}?>/g) ?? [];
    expect(main.length, "page-shell.tsx phải có đúng 2 <main>: MainContent và PageShell").toBe(2);
    for (const tag of main) {
      expect(tag).toContain("id={MAIN_CONTENT_ID}");
      // Safari không tự đặt focus khi nhảy tới phần tử không focus được: thiếu dòng
      // này thì Tab kế tiếp lại quay về đầu trang, đúng thứ đường tắt sinh ra để tránh.
      expect(tag).toContain("tabIndex={-1}");
    }
  });

  it.each(OWNED_VIEWS)("%s bọc nội dung bằng <MainContent>", (file) => {
    const src = read(file);
    expect(mainRegions(src).length, `${file} không có vùng <MainContent> nào`).toBeGreaterThan(0);
    expect(src).toMatch(/import \{ MainContent \} from "\.\/page-shell"/);
  });

  it("KHÔNG file nào tự viết tay id 'noi-dung' hay <main> riêng", () => {
    // Gõ sai một ký tự trong id viết tay là đường tắt chết mà vẫn "bấm được" — không
    // báo lỗi, không log. Chỉ page-shell.tsx được phép đụng tới cả hai thứ này.
    const offenders: string[] = [];
    for (const file of OWNED_VIEWS) {
      const src = read(file);
      if (/id="noi-dung"/.test(src)) offenders.push(`${file}: id viết tay`);
      if (/<main\b/.test(src)) offenders.push(`${file}: <main> riêng thay vì <MainContent>`);
    }
    expect(offenders).toEqual([]);
  });

  it("menu trái và tab bar nằm NGOÀI <MainContent>", () => {
    // Nếu menu nằm trong vùng nội dung thì "bỏ qua menu" chẳng bỏ qua được gì: người
    // dùng bàn phím vẫn phải Tab qua trọn bộ menu sau khi đã bấm đường tắt.
    const offenders: string[] = [];
    for (const file of OWNED_VIEWS) {
      for (const region of mainRegions(read(file))) {
        if (/<HubSidebar\b/.test(region)) offenders.push(`${file}: HubSidebar trong <main>`);
        if (/<StudentTabBar\b/.test(region)) offenders.push(`${file}: StudentTabBar trong <main>`);
        if (/<MiniAppHeader\b/.test(region)) offenders.push(`${file}: MiniAppHeader trong <main>`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Tiêu đề trang
// ---------------------------------------------------------------------------

describe("mỗi màn có đúng một <h1>", () => {
  it.each(OWNED_VIEWS)("%s: số <h1> khớp số vùng nội dung", (file) => {
    const src = read(file);
    const regions = mainRegions(src);
    const h1 = count(src, /<h1[\s>]/g);
    // Một trang render đúng MỘT vùng nội dung, nên cũng phải có đúng MỘT <h1>.
    // profile-view có hai nhánh loại trừ nhau (học sinh / nhân viên) → 2 vùng, 2 <h1>.
    // Hai <h1> cùng lúc trong một DOM (một cho mobile, một cho desktop) là cái bẫy
    // luật này chặn: cả hai đều nằm trong DOM, đọc lại phải đoán cái nào là thật.
    expect(h1, `${file} có ${h1} <h1> cho ${regions.length} vùng nội dung`).toBe(regions.length);
  });

  it.each(OWNED_VIEWS)("%s: <h1> nằm TRONG vùng nội dung", (file) => {
    for (const region of mainRegions(read(file))) {
      expect(region, `${file}: một vùng <MainContent> không chứa <h1> nào`).toMatch(/<h1[\s>]/);
    }
  });

  it("<h1> không bị ẩn khỏi trình đọc màn hình", () => {
    // sr-only = ẩn khỏi MẮT, vẫn đọc được. `hidden`/`display:none` thì mất cả hai —
    // đúng kiểu hỏng im lặng: nhìn bằng mắt vẫn thấy tiêu đề (do một <div> khác vẽ).
    for (const file of OWNED_VIEWS) {
      for (const tag of read(file).match(/<h1[^>]*>/g) ?? []) {
        expect(tag, `${file}: ${tag}`).not.toMatch(/\bhidden\b/);
        expect(tag).not.toMatch(/aria-hidden/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Vòng focus và nhãn ô nhập
// ---------------------------------------------------------------------------

describe("ô nhập: vòng focus và nhãn thật", () => {
  const globalsCss = readFileSync(join(hubDir, "app", "globals.css"), "utf8");

  it("globals.css vẫn còn lưới an toàn :focus-visible", () => {
    const rule = globalsCss.match(/:where\([^)]*\)\s*:focus-visible\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule, "mất rule :focus-visible dùng :where trong globals.css").not.toBe("");
    expect(rule).toMatch(/outline:\s*3px\s+solid/);
  });

  it.each(OWNED_VIEWS)("%s không xoá vòng focus của trình duyệt", (file) => {
    // focus:outline-none chỉ hợp lệ trên <main> (page-shell.tsx) — phần tử không tương
    // tác, nhận focus đúng một lần khi người dùng bấm đường tắt. Ở ô nhập/nút thì nó
    // để lại đúng một tín hiệu: màu viền — thứ người mù màu không thấy.
    expect(read(file)).not.toMatch(/outline-none/);
  });

  it("mọi ô nhập của các màn này đều có nhãn nối bằng id", () => {
    const offenders: string[] = [];
    for (const file of OWNED_VIEWS) {
      const src = read(file);
      for (const tag of src.match(/<(?:textarea|input)[^>]*>/g) ?? []) {
        if (/aria-label=/.test(tag)) continue;
        const id = tag.match(/\bid="([^"]+)"/)?.[1];
        if (!id) {
          offenders.push(`${file}: ô nhập không có id lẫn aria-label`);
          continue;
        }
        // <label htmlFor> thật, không phải <span> đứng cạnh: chạm vào chữ là con trỏ
        // nhảy vào ô (vùng chạm rộng hơn hẳn trên điện thoại) và trình đọc màn hình
        // nói được ô này để làm gì.
        if (!new RegExp(`htmlFor="${id}"`).test(src)) {
          offenders.push(`${file}: không có <label htmlFor="${id}">`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("nhóm nút chọn ở 'Cần gặp thầy cô' nói trạng thái bằng aria-pressed", () => {
    // Trước đó "đã chọn" chỉ được nói bằng MÀU VIỀN — DESIGN-GUIDELINES §11 cấm màu là
    // tín hiệu duy nhất. Hai nhóm: chuyện gì (1) và khi nào (2).
    const src = read("apps/hub/components/help-request-view.tsx");
    expect(count(src, /aria-pressed=/g)).toBe(2);
    expect(count(src, /<fieldset\b/g), "mỗi bước là một <fieldset> có <legend>").toBe(2);
    expect(count(src, /<legend\b/g)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. Không màn nào của học sinh bị khoá hẳn trên điện thoại
// ---------------------------------------------------------------------------

describe("điện thoại là bối cảnh dùng thật, không phải trường hợp phụ", () => {
  const PHONE_FIRST = [
    "apps/hub/components/attendance-view.tsx",
    "apps/hub/components/this-week-view.tsx",
    "apps/hub/components/help-request-view.tsx",
    "apps/hub/components/profile-view.tsx",
  ];

  it.each(PHONE_FIRST)("%s không dựng màn chặn 'mở trên máy tính'", (file) => {
    const src = read(file);
    expect(src, `${file} vẫn còn DesktopOnlyNotice`).not.toMatch(/DesktopOnlyNotice/);
    // Cây "hidden md:flex" bọc TOÀN BỘ nội dung là cùng một thứ chặn, viết bằng CSS:
    // dưới 768px trang trắng trơn.
    expect(src).not.toMatch(/"hidden md:flex md:h-screen/);
  });

  it.each(PHONE_FIRST)("%s có đường ra khỏi trang trên điện thoại", (file) => {
    const src = read(file);
    const hasWayOut =
      /<StudentTabBar\b/.test(src) || /<MiniAppHeader\b/.test(src) || /href="\/home"/.test(src);
    expect(hasWayOut, `${file}: không tab bar, không header thoát, không link về Hub`).toBe(true);
  });

  it("component màn chặn chỉ còn phục vụ những màn thật sự chưa có bản điện thoại", () => {
    // Không xoá file: buồng lái GVCN (gói khác giữ) vẫn đang dùng nó một cách chính
    // đáng. Nhưng nếu nó không còn ai dùng nữa thì hãy xoá hẳn, đừng để làm mẫu.
    const notice = join(componentsDir, "ui", "desktop-only-notice.tsx");
    if (!existsSync(notice)) return;
    expect(readFileSync(notice, "utf8")).toMatch(/href="\/home"/);
  });
});
