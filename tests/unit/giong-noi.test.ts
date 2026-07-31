// tests/unit/giong-noi.test.ts — gói "giong-noi-va-don-dep".
//
// Một luật, phát biểu bằng lời: **học sinh và phụ huynh chỉ được nghe giọng Glow & Grow.**
// Từ vựng vận hành — GVCN, cờ, ngưỡng, leo thang, định mức — và mã nội bộ của dự án
// (GĐ1, GĐ2) CHỈ sống ở buồng lái, tâm lý cụm, điều hành. DESIGN-GUIDELINES §8 và
// PRODUCT.md gọi đây là "ràng buộc đạo đức, không phải sở thích văn phong".
//
// Vì sao phải khoá bằng test chứ không phải sửa một lần cho xong: đây là lỗi ĐÃ TÁI PHÁT
// nhiều lần trong repo này, và không lần nào nó làm hỏng typecheck hay hỏng build. Nó chỉ
// hỏng ở chỗ không ai đo: một đứa trẻ 11 tuổi đọc "Chỉ GVCN của con nhìn thấy" và không
// biết đó là ai, một phụ huynh đọc "GĐ1: phụ huynh mở báo cáo từ link Zalo".
//
// Hình dạng tệ nhất của lỗi này — đã có thật trong profile-view.tsx — là lấy CHÍNH CHỮ
// VIẾT TẮT LÀM TÊN NGƯỜI khi chưa biết tên cô: `teacherName ?? "GVCN"`. Màn hình khi đó
// nói với em rằng người đọc được cảm xúc của em tên là "GVCN".
//
// Phần cuối file khoá phần "dọn dẹp" của cùng gói: dựng MỘT nhánh theo khổ màn thay vì
// dựng cả hai rồi ẩn bằng CSS, và hâm sẵn buồng lái cho GVCN.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatWeekLabel } from "@/lib/week-label";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const hubDir = join(repoRoot, "apps", "hub");
const componentsDir = join(hubDir, "components");

/**
 * Đọc mã nguồn ĐÃ BỎ chú thích — bắt buộc, cùng lý do với readScreen() của
 * tests/unit/frontend-trang-thai.test.ts: các file này kể lại nguyên văn câu chữ sai cũ
 * ("Chỉ GVCN của con nhìn thấy", `?? "GVCN"`) trong chú thích để lần sau không ai làm
 * ngược lại. Quét cả chú thích thì cách "sửa" test duy nhất là xoá lời giải thích — test
 * tự phá thứ nó bảo vệ.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
const read = (rel: string) => stripComments(readFileSync(join(repoRoot, rel), "utf8"));
const readComponent = (file: string) => stripComments(readFileSync(join(componentsDir, file), "utf8"));

/**
 * Các màn mà NGƯỜI ĐỌC là học sinh hoặc phụ huynh. Danh sách này cố tình liệt kê từng
 * file: thêm một màn cho hai vai đó thì phải thêm vào đây, không có nhánh "tự tìm".
 */
const CHILD_FACING_SCREENS = [
  "home-view.tsx",
  "profile-view.tsx",
  "this-week-view.tsx",
  "growth-report-view.tsx",
  "attendance-view.tsx",
  "checkin-view.tsx",
  "help-request-view.tsx",
];

// ---------------------------------------------------------------------------
// 1. Từ vựng vận hành không được lọt vào màn của trẻ và phụ huynh
// ---------------------------------------------------------------------------

describe("giọng nói: bề mặt học sinh/phụ huynh không nói tiếng vận hành", () => {
  it.each(CHILD_FACING_SCREENS)("%s không còn chữ «GVCN» nào hiện ra màn hình", (file) => {
    const src = readComponent(file);
    const hits = src.match(/.{0,60}GVCN.{0,40}/g) ?? [];
    expect(hits, `${file} còn ${hits.length} chỗ nói "GVCN" với người đọc là trẻ/phụ huynh`).toEqual([]);
  });

  it.each(CHILD_FACING_SCREENS)("%s không in mã giai đoạn dự án (GĐ1/GĐ2) ra màn hình", (file) => {
    // "GĐ1" là ngôn ngữ của người làm sản phẩm. Với phụ huynh nó không mang thông tin
    // nào, chỉ nói rằng màn hình này đang bận nói về công việc của chúng ta.
    const hits = readComponent(file).match(/GĐ\s*\d/g) ?? [];
    expect(hits, `${file} còn ${hits.length} mã giai đoạn`).toEqual([]);
  });

  it("KHÔNG file nào lấy chữ viết tắt hành chính làm tên người", () => {
    // `teacherName ?? "GVCN"` / `|| "GVCN"`: chưa biết tên cô thì nói "thầy cô chủ nhiệm",
    // không bao giờ dựng một cái tên từ chức danh (và không lấy chữ "G" làm avatar).
    const offenders: string[] = [];
    for (const file of CHILD_FACING_SCREENS) {
      if (/(\?\?|\|\|)\s*"GVCN"/.test(readComponent(file))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("profile-view.tsx đi qua MỘT hàm dựng tên thầy cô, không viết tay từng chỗ", () => {
    // Ba chỗ trong màn này gọi tên cô. Ba lần viết tay là ba cơ hội để một chỗ nói khác
    // hai chỗ kia — và chỗ nói sai sẽ là chỗ không ai mở ra xem.
    const src = readComponent("profile-view.tsx");
    expect(src).toMatch(/function teacherLabel\(/);
    expect(src).toMatch(/personName\(/);
    expect((src.match(/teacherLabel\(/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("👋 chỉ đi kèm lời chào HỌC SINH (§4: emoji tiết chế)", () => {
    // Trang chủ là trang chung của mọi vai — cùng một dòng chữ đó chào cả hiệu trưởng.
    const src = readComponent("home-view.tsx");
    const positions = [...src.matchAll(/👋/g)].map((m) => m.index!);
    expect(positions.length, "trang chủ phải còn lời chào có 👋 cho học sinh").toBeGreaterThan(0);
    for (const at of positions) {
      expect(src.slice(Math.max(0, at - 80), at), "👋 nằm ngoài điều kiện isStudent").toMatch(
        /isStudent/,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Nhãn tuần: ngày của máy phải đổi thành ngày của người
// ---------------------------------------------------------------------------

describe("formatWeekLabel — ISO là định dạng cho máy đọc", () => {
  it("đổi khoảng ngày ISO thành nhãn đọc được", () => {
    expect(formatWeekLabel("2026-07-27 – 2026-07-31")).toBe("Tuần 27/7 – 31/7");
    expect(formatWeekLabel("2026-07-27 - 2026-07-31")).toBe("Tuần 27/7 – 31/7");
    expect(formatWeekLabel("2026-12-28 – 2027-01-01")).toBe("Tuần 28/12 – 1/1");
  });

  it("KHÔNG bịa: dạng lạ thì trả nguyên văn, không đoán ngày", () => {
    expect(formatWeekLabel("tuần 42 (21–25/07)")).toBe("tuần 42 (21–25/07)");
    expect(formatWeekLabel("")).toBe("");
    expect(formatWeekLabel(null)).toBe("");
    expect(formatWeekLabel(undefined)).toBe("");
  });

  it("mọi chỗ hiện weekLabel cho trẻ/phụ huynh đều đi qua hàm này", () => {
    const offenders: string[] = [];
    for (const file of ["this-week-view.tsx", "growth-report-view.tsx"]) {
      const src = readComponent(file);
      // Mỗi biểu thức JSX có chứa weekLabel phải gọi formatWeekLabel bên trong.
      for (const expr of src.match(/\{[^{}]*\bweekLabel\b[^{}]*\}/g) ?? []) {
        if (!expr.includes("formatWeekLabel")) offenders.push(`${file}: ${expr.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Dọn dẹp: dựng MỘT nhánh, và hâm sẵn buồng lái
// ---------------------------------------------------------------------------

const TWO_LAYOUT_SCREENS = ["home-view.tsx", "growth-report-view.tsx"];

describe("hai bố cục — dựng một nhánh, không dựng hai rồi ẩn", () => {
  it("lib/viewport.ts hỏi khổ màn đúng cách và có câu trả lời cho server", () => {
    const src = read("apps/hub/lib/viewport.ts");
    expect(src).toMatch(/export function useIsDesktop\(/);
    expect(src).toMatch(/useSyncExternalStore\(/);
    expect(src).toMatch(/matchMedia\(/);
    // Thiếu getServerSnapshot thì React ném lỗi ngay khi dựng ở server — màn trắng,
    // không phải "chỉ hơi lệch bố cục".
    expect(src).toMatch(/getServerSnapshot/);
    // Phải khớp breakpoint md của Tailwind; lệch một pixel là có dải màn hình không
    // nhánh nào đúng.
    expect(src).toContain("(min-width: 768px)");
  });

  it.each(TWO_LAYOUT_SCREENS)("%s chọn nhánh bằng useIsDesktop, không bằng CSS", (file) => {
    const src = readComponent(file);
    expect(src).toMatch(/useIsDesktop\(\)/);
    // Cây bị ẩn bằng CSS vẫn nằm trong DOM, vẫn được React đối chiếu mỗi lần dữ liệu
    // đổi, và vẫn đi trong HTML gửi xuống điện thoại.
    expect(src, `${file} còn nhánh ẩn bằng CSS`).not.toMatch(/hidden md:flex md:h-screen/);
    expect(src, `${file} còn nhánh ẩn bằng CSS`).not.toMatch(/className="md:hidden"/);
  });

  it("nhánh mobile của trang chủ có thanh điều hướng cho MỌI vai", () => {
    // Nhánh này là nhánh chạy TRƯỚC hydrate ở mọi khổ màn (getServerSnapshot = false).
    // Nếu nó chỉ có tab bar cho học sinh thì người lớn nhìn thấy một trang chủ không có
    // đường nào tới /ho-so — nơi duy nhất có nút Đăng xuất.
    const src = readComponent("home-view.tsx");
    expect(src).toMatch(/<HubTabBar\b/);
    expect(src, "tab bar bị đặt sau điều kiện isStudent").not.toMatch(/isStudent && <(Hub|Student)TabBar/);
  });

  it("trang chủ hâm sẵn buồng lái cho GVCN, và chỉ cho GVCN", () => {
    const src = readComponent("home-view.tsx");
    expect(src).toMatch(/care\.getDashboard\.prefetch/);
    // Nạp trước cho vai KHÔNG phải chủ nhiệm là bắn một request chắc chắn 403.
    const at = src.indexOf("care.getDashboard.prefetch");
    expect(src.slice(Math.max(0, at - 400), at)).toMatch(/isHomeroom/);
  });

  it("next.config.mjs cho phép dùng lại bản nạp trước (staleTimes)", () => {
    // Mặc định của Next cho trang động là 0 giây: nạp trước xong vứt ngay, tức là
    // router.prefetch ở trên không giúp được gì.
    const src = stripComments(readFileSync(join(hubDir, "next.config.mjs"), "utf8"));
    expect(src).toMatch(/staleTimes:\s*\{[^}]*dynamic:\s*\d+/);
  });
});
