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
import { NHAN_AI_DOC_CAM_XUC } from "@/components/ui/labels";

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
 *
 * LỖ ĐÃ BIẾT, ghi ra để không ai đọc nhầm bộ test này là "đã phủ hết" (01/08/2026):
 * danh sách liệt kê tay nên nó chỉ canh được `components/*.tsx`. Đo sống hôm 01/08 trên
 * `document.body.innerText` của /home phiên học sinh Minh, chuỗi "menu_book Học tập · GĐ2"
 * và "favorite Y tế · GĐ2" VẪN hiện ra màn hình — nguồn là `apps/hub/server/mini-apps.ts`
 * (nhãn app chưa build), và `apps/hub/components/hub-sidebar.tsx` cũng còn `soonBadge ??
 * "GĐ2"`. Cả hai nằm ngoài tầm quét, nên bộ test này ĐANG XANH trong khi mã giai đoạn dự
 * án vẫn đến mắt học sinh — loại lỗi tệ hơn không có test.
 * Luật đúng phải là ĐẢO LẠI: quét cả apps/hub trừ vùng vận hành đã khai (components/gvcn,
 * components/tam-ly, components/dieu-hanh, gvcn-dashboard.tsx). Chưa làm được ngay vì hai
 * file trên thuộc phạm vi gói khác đang chạy song song; đảo bây giờ là CI đỏ vì một lỗi
 * mình không có quyền sửa. Việc còn nợ: xem `conNo` của gói "tuong-phan-man-hoc-sinh".
 * Trong lúc chờ, danh sách được nới sang những file bề mặt học sinh/phụ huynh khác thuộc
 * cùng phạm vi — mỗi file thêm vào là một chỗ nữa lỗi không lọt qua được.
 */
const CHILD_FACING_SCREENS = [
  "home-view.tsx",
  "profile-view.tsx",
  "this-week-view.tsx",
  "growth-report-view.tsx",
  "attendance-view.tsx",
  "checkin-view.tsx",
  "help-request-view.tsx",
  // Thêm 01/08/2026. login-form.tsx là chỗ lọt thật: bảng "Dành cho phụ huynh · Zalo" từng
  // viết "nhập mã mời GVCN đã gửi" và "Thất lạc mã? Nhắn GVCN" — đúng bảng dành riêng cho
  // phụ huynh, tức đúng chỗ từ vựng vận hành không được phép có.
  "login-form.tsx",
  "mini-app-tile.tsx",
  "tab-bar.tsx",
];

// ---------------------------------------------------------------------------
// 1. Từ vựng vận hành không được lọt vào màn của trẻ và phụ huynh
// ---------------------------------------------------------------------------

describe("giọng nói: bề mặt học sinh/phụ huynh không nói tiếng vận hành", () => {
  it.each(CHILD_FACING_SCREENS)("%s không còn chữ “GVCN” nào hiện ra màn hình", (file) => {
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
// 1b. Nhãn "ai đọc được cảm xúc của con" — một câu, một nguồn
//
// Câu này đã đổi BA LẦN trong ngày 01/08/2026, mỗi lần vì phạm vi `core.can_read_mood()`
// ở tầng dữ liệu đổi:
//   "Chỉ thầy cô chủ nhiệm thấy"                        (trước 0038)
//   "Chỉ thầy cô chủ nhiệm và thầy cô tâm lý thấy"      (0038 — hai vai đọc được)
//   "Chỉ thầy cô tâm lý đọc"                            (0044/ADR-026 — cắt vai chủ nhiệm)
//
// Ba lần đổi trong một ngày là dấu hiệu xấu, nhưng nhãn SAI còn tệ hơn nhãn sửa nhiều
// lần: đây là lời hứa với một đứa trẻ về chính câu nó vừa viết ra, in ngay tại chỗ nó
// viết. Bộ test này khoá ba mệnh đề, và cả ba đều là thứ typecheck không bao giờ bắt được:
//   · hai câu cũ không còn hiện ra màn hình ở bất kỳ màn nào của trẻ/phụ huynh;
//   · mọi chỗ in nhãn đi qua HẰNG SỐ dùng chung, không chép tay — chép tay là mở đường
//     cho lần đổi thứ tư sót một màn, và màn sót sẽ là màn ít người mở nhất;
//   · hằng số khớp ĐÚNG câu chốt trong DESIGN-GUIDELINES §9, để tài liệu và màn hình
//     không thể trôi khỏi nhau mà CI vẫn xanh.
// ---------------------------------------------------------------------------

/** Hai câu nhãn đã HẾT ĐÚNG. Không được xuất hiện ngoài chú thích/tài liệu lịch sử. */
const NHAN_DA_CHET = [
  "Chỉ thầy cô chủ nhiệm thấy",
  "Chỉ thầy cô chủ nhiệm và thầy cô tâm lý thấy",
];

/** Các màn thực sự IN nhãn này (ô nhập cảm xúc hoặc khối hiện lại cảm xúc của em). */
const MAN_IN_NHAN = ["checkin-view.tsx", "home-view.tsx", "this-week-view.tsx"];

describe("nhãn riêng tư của ô cảm xúc: một câu, một nguồn", () => {
  it.each(CHILD_FACING_SCREENS)("%s không còn câu nhãn nào đã hết đúng", (file) => {
    const src = readComponent(file);
    for (const chet of NHAN_DA_CHET) {
      expect(src, `${file} còn in "${chet}" — câu này sai từ 01/08/2026`).not.toContain(chet);
    }
  });

  it.each(MAN_IN_NHAN)("%s in nhãn từ hằng số dùng chung, không chép tay chuỗi", (file) => {
    const src = readComponent(file);
    expect(src, `${file} không dùng NHAN_AI_DOC_CAM_XUC`).toContain("NHAN_AI_DOC_CAM_XUC");
    // Chép tay đúng câu hiện tại cũng không được: lần đổi sau nó sẽ là chỗ bị bỏ quên.
    expect(src, `${file} chép tay chuỗi nhãn thay vì dùng hằng số`).not.toContain(
      `"${NHAN_AI_DOC_CAM_XUC}"`,
    );
  });

  it("hằng số khớp ĐÚNG câu chốt ở DESIGN-GUIDELINES §9", () => {
    // Tài liệu là nơi hai agent màn hình cùng đọc để in một câu giống nhau. Nếu mã và
    // tài liệu trôi khỏi nhau thì mỗi bên đúng theo bên mình, và không ai đỏ.
    const guideline = readFileSync(join(repoRoot, "danh-cho-may", "DESIGN-GUIDELINES.md"), "utf8");
    expect(guideline).toContain(`**${NHAN_AI_DOC_CAM_XUC}**`);
  });

  it("nhãn không chứa từ vựng vận hành (§8) — nó in trước mặt trẻ 11 tuổi", () => {
    for (const word of ["GVCN", "cờ", "ngưỡng", "leo thang", "quét", "định mức"]) {
      expect(NHAN_AI_DOC_CAM_XUC.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it("thẻ “Ai đọc được lời con?” kể ĐỦ người đọc được, gồm cả tâm lý cụm", () => {
    // `help_requests_scope` (0037) là `core.can_see_care` = chính em ∨ chủ nhiệm ∨ TÂM LÝ
    // CỤM. Thẻ này từng kể đúng một người, và tests/db/help-request-rieng-tu.test.ts vẫn
    // xanh y hệt trước và sau — vì nó đo QUYỀN, không đo NHÃN. Đây là chỗ đo nhãn.
    const src = readComponent("help-request-view.tsx");
    expect(src, "thẻ không kể thầy cô tâm lý").toMatch(/Thầy cô tâm lý của trường/);
    // Và không hứa một thao tác chưa tồn tại: chưa có đường chuyển tuyến hỏi ý em.
    expect(src, "còn hứa 'sẽ hỏi ý con trước khi chuyển tới phòng tâm lý'").not.toMatch(
      /hỏi ý con trước khi chuyển/,
    );
  });

  it("thẻ “Ai thấy gì của mình?” tách dòng cô chủ nhiệm làm HAI ý, không gộp", () => {
    // §9 chốt: gộp thành "cô không thấy gì" là nói QUÁ (em sẽ tưởng bấm nút cần gặp cũng
    // vô ích — đường an toàn duy nhất em có), gộp thành "cô thấy cảm xúc" là nói THIẾU
    // sự thật mới. Phải có cả vế MẤT lẫn vế CÒN trong cùng một dòng.
    const src = readComponent("profile-view.tsx");
    expect(src, "thiếu vế 'cô KHÔNG đọc được cảm xúc'").toMatch(/không đọc/);
    expect(src, "thiếu vế 'cô vẫn biết con cần được để ý'").toContain("cần được để ý");
    expect(src, "thiếu vế 'cô vẫn thấy điểm danh và lời nhắn'").toMatch(/xem điểm danh và đọc lời nhắn/);
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
