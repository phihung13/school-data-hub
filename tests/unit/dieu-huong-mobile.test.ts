// tests/unit/dieu-huong-mobile.test.ts — luật một dòng: TRÊN ĐIỆN THOẠI, KHÔNG VAI
// NÀO BỊ KHOÁ TRONG PHIÊN ĐĂNG NHẬP CỦA CHÍNH MÌNH.
//
// Ba ngõ cụt có thật, đo được ngày 31/07/2026 ở khung 390px:
//   1. /gvcn — mọi liên kết nội bộ nằm trong khối `hidden md:flex` của sidebar, nên
//      dưới md trang không về được /home, không sang được bốn màn con, và không
//      đăng xuất được. Trớ trêu: gvcn-shell.tsx tự viết luật "không được khoá họ
//      trong một trang không lối ra" cho bốn màn CON, còn trang gốc thì bị sót.
//   2. tab-bar.tsx chỉ export StudentTabBar → phụ huynh, GVCN, tâm lý cụm, quản trị
//      dùng điện thoại không có đường nào tới /ho-so, trang DUY NHẤT có nút Đăng xuất.
//   3. Sidebar GVCN mục "Trang chủ" trỏ /gvcn → /home thành trang một chiều, trái
//      DESIGN-GUIDELINES §1.1 "một cửa vào chung".
//
// Vì sao phải là test chứ không phải một lần sửa: cả ba lỗi KHÔNG làm hỏng typecheck,
// KHÔNG làm hỏng build, và KHÔNG hỏng trên máy người viết code — người viết code mở
// trang ở 1440px, nơi sidebar luôn hiện. Chúng chỉ hỏng đúng ở nơi không ai nhìn:
// điện thoại của cô giáo đứng trong lớp lúc 7 giờ sáng.
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GUARDIAN_TABBAR_ITEMS,
  STAFF_TABBAR_ITEMS,
  STUDENT_TABBAR_ITEMS,
  STUDENT_TABBAR_HREFS,
  TEACHER_TABBAR_ITEMS,
  resolveTabs,
  type TabItem,
} from "@/components/tab-bar";
import { TEACHER_ITEMS, resolveNav } from "@/components/hub-sidebar";
import type { HubRole } from "@hub/core/contracts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const appDir = join(repoRoot, "apps", "hub", "app");
const componentsDir = join(repoRoot, "apps", "hub", "components");

/** Trang duy nhất có nút Đăng xuất trên điện thoại (profile-view.tsx). */
const LOGOUT_HREF = "/ho-so";
/** Trang chủ chung của mọi vai (DESIGN-GUIDELINES §1.1). */
const HOME_HREF = "/home";

/**
 * Có page.tsx thật cho đường dẫn này không? Cùng cách phân giải với
 * tests/unit/nav-links.test.ts — cố tình chép lại chứ không xuất khẩu dùng chung:
 * đây là cái CÂN, hai cái cân độc lập thì hỏng một cái không kéo theo cái kia.
 */
function routeExists(href: string): boolean {
  const path = href.split("?")[0]?.split("#")[0] ?? href;
  let dir = appDir;
  for (const segment of path.split("/").filter(Boolean)) {
    const direct = join(dir, segment);
    if (existsSync(direct) && statSync(direct).isDirectory()) {
      dir = direct;
      continue;
    }
    const dynamic = readdirSync(dir, { withFileTypes: true }).find(
      (e) => e.isDirectory() && e.name.startsWith("[") && e.name.endsWith("]"),
    );
    if (!dynamic) return false;
    dir = join(dir, dynamic.name);
  }
  return ["page.tsx", "page.ts", "route.ts", "route.tsx"].some((f) => existsSync(join(dir, f)));
}

const readSrc = (file: string) => readFileSync(join(componentsDir, file), "utf8");
/** Bỏ chú thích trước khi quét: file trong repo này kể lại nguyên nhân từng lỗi cũ
 *  bằng chính những chuỗi đang bị cấm — test đỏ vì một câu văn là test sai. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const TAB_GROUPS: Array<[string, TabItem[]]> = [
  ["STUDENT_TABBAR_ITEMS", STUDENT_TABBAR_ITEMS],
  ["TEACHER_TABBAR_ITEMS", TEACHER_TABBAR_ITEMS],
  ["GUARDIAN_TABBAR_ITEMS", GUARDIAN_TABBAR_ITEMS],
  ["STAFF_TABBAR_ITEMS", STAFF_TABBAR_ITEMS],
];

/** Mọi tổ hợp vai thật gặp được trong trường, kể cả tài khoản chưa gán vai nào. */
const ROLE_SETS: HubRole[][] = [
  [],
  ["student"],
  ["guardian"],
  ["homeroom"],
  ["homeroom", "teacher"],
  ["guardian", "homeroom"],
  ["teacher"],
  ["counselor"],
  ["principal"],
  ["board"],
  ["admin"],
  ["admin", "principal"],
];

describe("tab bar: mọi đích đều là trang có thật", () => {
  for (const [name, items] of TAB_GROUPS) {
    it(`${name} — không mục nào trỏ vào trang chết`, () => {
      const broken = items.filter((i) => !i.href.startsWith("/") || !routeExists(i.href));
      expect(broken.map((i) => `${i.key} → ${i.href}`)).toEqual([]);
    });
  }

  it("mỗi bộ có key duy nhất và href duy nhất", () => {
    for (const [name, items] of TAB_GROUPS) {
      expect(new Set(items.map((i) => i.key)).size, `trùng key trong ${name}`).toBe(items.length);
      expect(new Set(items.map((i) => i.href)).size, `trùng href trong ${name}`).toBe(items.length);
    }
  });

  it("bộ học sinh vẫn khớp STUDENT_TABBAR_HREFS (nav-links.test.ts dựa vào hằng đó)", () => {
    expect(STUDENT_TABBAR_ITEMS.map((i) => i.href)).toEqual([...STUDENT_TABBAR_HREFS]);
  });
});

describe("KHÔNG vai nào bị khoá trong phiên của chính mình", () => {
  for (const roles of ROLE_SETS) {
    const who = roles.length ? roles.join("+") : "(chưa gán vai)";

    it(`${who} — có đường tới ${LOGOUT_HREF} để tự đăng xuất`, () => {
      expect(resolveTabs(roles).map((i) => i.href)).toContain(LOGOUT_HREF);
    });

    it(`${who} — có đường về trang chủ chung ${HOME_HREF}`, () => {
      expect(resolveTabs(roles).map((i) => i.href)).toContain(HOME_HREF);
    });
  }

  it("không tổ hợp vai nào nhận thanh điều hướng rỗng", () => {
    for (const roles of ROLE_SETS) {
      expect(resolveTabs(roles).length, `vai ${roles.join("+") || "(rỗng)"}`).toBeGreaterThan(0);
    }
  });
});

describe("tab bar khớp DESIGN-GUIDELINES §6", () => {
  it("người lớn: tối đa 4 mục", () => {
    for (const [name, items] of TAB_GROUPS) {
      if (name === "STUDENT_TABBAR_ITEMS") continue;
      expect(items.length, `${name} có ${items.length} mục`).toBeLessThanOrEqual(4);
    }
  });

  it("người lớn KHÔNG có nút Check-in nổi giữa (đó là hành động của học sinh)", () => {
    for (const [name, items] of TAB_GROUPS) {
      if (name === "STUDENT_TABBAR_ITEMS") continue;
      expect(items.map((i) => i.href), name).not.toContain("/checkin");
    }
  });

  it("mọi icon là tên Material Symbols, không emoji", () => {
    for (const [, items] of TAB_GROUPS) {
      for (const item of items) expect(item.icon).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe("hai giọng không trộn (§8 · mệnh lệnh 4 CLAUDE.md)", () => {
  const VAN_HANH = ["buồng lái", "cờ", "ngưỡng", "leo thang", "định mức", "gvcn", "can thiệp"];

  it("bộ tab của học sinh và phụ huynh không có từ vựng vận hành", () => {
    for (const items of [STUDENT_TABBAR_ITEMS, GUARDIAN_TABBAR_ITEMS]) {
      for (const item of items) {
        const label = item.label.toLowerCase();
        expect(VAN_HANH.filter((w) => label.split(/\s+/).includes(w)), `nhãn "${item.label}"`).toEqual([]);
      }
    }
  });

  it("chỉ GVCN mới thấy mục Buồng lái", () => {
    const hasCockpit = (roles: HubRole[]) => resolveTabs(roles).some((i) => i.href === "/gvcn");
    expect(hasCockpit(["homeroom"])).toBe(true);
    for (const roles of ROLE_SETS.filter((r) => !r.includes("homeroom"))) {
      expect(hasCockpit(roles), `vai ${roles.join("+") || "(rỗng)"}`).toBe(false);
    }
  });
});

describe("tab bar và sidebar nói cùng một điều", () => {
  it("thứ tự ưu tiên vai giống resolveNav: học sinh → GVCN → phụ huynh → nhân viên", () => {
    expect(resolveTabs(["guardian", "homeroom"])).toBe(TEACHER_TABBAR_ITEMS);
    expect(resolveNav(["guardian", "homeroom"]).roleLabel).toBe("GVCN");
    expect(resolveTabs(["student", "guardian"])).toBe(STUDENT_TABBAR_ITEMS);
    // Sửa 01/08/2026: tâm lý cụm và BGH KHÔNG còn rơi vào bộ nhân viên tối thiểu.
    // Câu cũ ở đây khẳng định `counselor → STAFF_TABBAR_ITEMS` và nó ĐÚNG với mã lúc đó,
    // nhưng cái đúng ấy là một lỗi: sidebar đã có /tam-ly còn tab bar thì chưa, nên cô
    // Mai mở Hub trên máy tính thấy hộp việc của mình, mở trên điện thoại thì không —
    // trong khi §3 nói điện thoại mới là thiết bị chính. Bài test đang ghim đúng chỗ lệch.
    expect(resolveTabs(["counselor"]).map((i) => i.href)).toContain("/tam-ly");
    expect(resolveTabs(["principal"]).map((i) => i.href)).toContain("/dieu-hanh");
    expect(resolveTabs(["board"]).map((i) => i.href)).toContain("/dieu-hanh");
    expect(resolveTabs(["teacher"])).toBe(STAFF_TABBAR_ITEMS);
  });

  it("mọi đích trong tab bar người lớn cũng có trong sidebar cùng vai", () => {
    // Học sinh là ngoại lệ CÓ CHỦ Ý: /checkin là nút tròn nổi giữa, cố tình không
    // chiếm một dòng sidebar. Người lớn thì hai thanh phải trỏ cùng một nơi.
    for (const roles of ROLE_SETS.filter((r) => !r.includes("student"))) {
      const sidebarHrefs = resolveNav(roles).items.map((i) => i.href);
      const missing = resolveTabs(roles).map((i) => i.href).filter((h) => !sidebarHrefs.includes(h));
      expect(missing, `vai ${roles.join("+") || "(rỗng)"}`).toEqual([]);
    }
  });

  it("sidebar GVCN: “Trang chủ” trỏ /home, buồng lái là mục riêng", () => {
    // Trước 31/07/2026 mục "Trang chủ" trỏ /gvcn — GVCN vào buồng lái là không còn
    // đường nào quay về trang chủ chung, kể cả trên máy tính.
    expect(TEACHER_ITEMS.find((i) => i.key === "home")?.href).toBe(HOME_HREF);
    expect(TEACHER_ITEMS.find((i) => i.href === "/gvcn")?.label).toBe("Buồng lái");
    expect(TEACHER_ITEMS.map((i) => i.href)).toContain(LOGOUT_HREF);
  });
});

describe("màn hình người lớn bản mobile: có thanh điều hướng thật", () => {
  const MOBILE_SCREENS = ["gvcn-dashboard.tsx", join("gvcn", "gvcn-shell.tsx")];

  for (const file of MOBILE_SCREENS) {
    it(`${file.replace(/\\/g, "/")} — render HubTabBar và chỉ ở nhánh dưới md`, () => {
      const src = stripComments(readSrc(file));
      expect(src).toContain("<HubTabBar");
      // Tab bar Hub KHÔNG được xuất hiện ở khung máy tính: ở đó sidebar mới là
      // thanh điều hướng, hai thanh cùng lúc là hai landmark trùng nhau.
      expect(src).toMatch(/md:hidden[^]{0,200}<HubTabBar/);
    });
  }

  it("/gvcn có lối tới đủ bốn màn con ngay trên điện thoại", () => {
    const src = stripComments(readSrc("gvcn-dashboard.tsx"));
    for (const href of ["/gvcn/lop", "/gvcn/diem-danh", "/gvcn/duyet-bao-cao", "/gvcn/ghi-chu"]) {
      expect(src, `thiếu đường tới ${href}`).toContain(`"${href}"`);
      expect(routeExists(href), `${href} chưa có page.tsx`).toBe(true);
    }
  });

  it("/gvcn không còn giấu TOÀN BỘ điều hướng sau “hidden md:flex”", () => {
    // Đây là hình dạng chính xác của ngõ cụt số 1: cả trang chỉ có một khối chứa
    // liên kết, và khối đó bị ẩn dưới md.
    const src = stripComments(readSrc("gvcn-dashboard.tsx"));
    const mobileVisible = src
      .split("\n")
      .filter((l) => l.includes("href=") && !l.includes("hidden md:"));
    expect(mobileVisible.length).toBeGreaterThan(0);
  });
});
