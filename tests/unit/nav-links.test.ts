// tests/unit/nav-links.test.ts — luật một dòng: KHÔNG mục điều hướng nào được trỏ
// vào trang chưa tồn tại.
//
// Vì sao cần test này: 31/07/2026 sidebar GVCN có 6 mục thì 4 mục (/gvcn/lop,
// /gvcn/diem-danh, /gvcn/duyet-bao-cao, /gvcn/ghi-chu) chưa hề có page.tsx — GVCN
// đăng nhập bấm vào là trang 404 tiếng Anh. Lỗi kiểu này không có gì bắt được: nó
// không làm hỏng typecheck, không làm hỏng build, chỉ hỏng khi người dùng thật bấm
// vào. Test dưới đây đối chiếu mọi đích điều hướng với cây thư mục app/ thật, nên
// lần sau ai thêm mục trước khi có trang sẽ bị chặn ngay ở CI.
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STUDENT_ITEMS,
  STUDENT_SOON,
  TEACHER_ITEMS,
  TEACHER_SOON,
  GUARDIAN_ITEMS,
  GUARDIAN_SOON,
  STAFF_ITEMS,
  STAFF_SOON,
  resolveNav,
  type NavItem,
} from "@/components/hub-sidebar";
import { STUDENT_TABBAR_HREFS } from "@/components/tab-bar";
import { buildMiniApps } from "@/server/mini-apps";
import type { HubRole } from "@hub/core/contracts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const appDir = join(repoRoot, "apps", "hub", "app");

/**
 * Có trang thật cho đường dẫn này không? Đi theo đúng cách Next App Router phân giải:
 * mỗi đoạn là một thư mục, thư mục động `[x]` khớp mọi giá trị (nhờ vậy /embed/factory
 * khớp app/embed/[appId]/page.tsx). Đích cuối phải có page.tsx (trang) hoặc route.ts
 * (route handler) — thư mục rỗng không tính là trang.
 */
function routeExists(href: string): boolean {
  // `noUncheckedIndexedAccess` (tsconfig.base.json) coi phần tử mảng là `string | undefined`,
  // kể cả [0] của split() vốn luôn có. Dùng ?. + ?? thay vì `!` để không tắt cảnh báo bằng
  // lời hứa suông — nếu href rỗng thì rơi về chính href, routeExists trả false, đúng ý.
  const path = href.split("?")[0]?.split("#")[0] ?? href;
  const segments = path.split("/").filter(Boolean);
  let dir = appDir;
  for (const segment of segments) {
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

const NAV_GROUPS: Array<[string, NavItem[]]> = [
  ["STUDENT_ITEMS", STUDENT_ITEMS],
  ["TEACHER_ITEMS", TEACHER_ITEMS],
  ["GUARDIAN_ITEMS", GUARDIAN_ITEMS],
  ["STAFF_ITEMS", STAFF_ITEMS],
];
const SOON_GROUPS: Array<[string, NavItem[]]> = [
  ["STUDENT_SOON", STUDENT_SOON],
  ["TEACHER_SOON", TEACHER_SOON],
  ["GUARDIAN_SOON", GUARDIAN_SOON],
  ["STAFF_SOON", STAFF_SOON],
];

describe("bộ phân giải đường dẫn (tự kiểm chính nó)", () => {
  it("nhận ra trang có thật và trang không có", () => {
    expect(routeExists("/home")).toBe(true);
    expect(routeExists("/gvcn")).toBe(true);
    expect(routeExists("/embed/factory")).toBe(true); // qua thư mục động [appId]
    expect(routeExists("/gvcn/lop")).toBe(false); // chưa xây — gói "gvcn-man-hinh"
    expect(routeExists("/khong-he-co-trang-nay")).toBe(false);
  });
});

describe("sidebar: mục bấm được phải có trang thật", () => {
  for (const [name, items] of NAV_GROUPS) {
    it(`${name} — mọi href tồn tại`, () => {
      const broken = items.filter((i) => !i.href.startsWith("/") || !routeExists(i.href));
      expect(broken.map((i) => `${i.key} → ${i.href}`)).toEqual([]);
    });
  }

  for (const [name, items] of SOON_GROUPS) {
    it(`${name} — mục "sắp có" phải là href "#", không được bấm đi đâu`, () => {
      expect(items.filter((i) => i.href !== "#").map((i) => i.key)).toEqual([]);
    });
  }

  it("mỗi mục có key duy nhất trong nhóm của mình", () => {
    for (const [name, items] of [...NAV_GROUPS, ...SOON_GROUPS]) {
      const keys = items.map((i) => i.key);
      expect(new Set(keys).size, `trùng key trong ${name}`).toBe(keys.length);
    }
  });
});

describe("sidebar: menu chọn theo vai thật", () => {
  it("học sinh thấy menu học sinh", () => {
    expect(resolveNav(["student"]).items).toBe(STUDENT_ITEMS);
    expect(resolveNav(["student"]).roleLabel).toBe("HỌC SINH");
  });

  it("GVCN thấy menu GVCN", () => {
    expect(resolveNav(["homeroom", "teacher"]).items).toBe(TEACHER_ITEMS);
    expect(resolveNav(["homeroom"]).roleLabel).toBe("GVCN");
  });

  it("phụ huynh KHÔNG thấy menu GVCN", () => {
    const nav = resolveNav(["guardian"]);
    expect(nav.items).toBe(GUARDIAN_ITEMS);
    expect(nav.roleLabel).toBe("PHỤ HUYNH");
    expect(nav.roleLabel).not.toContain("GVCN");
  });

  it("quản trị/hiệu trưởng nhận menu nhân viên tối thiểu, không phải menu GVCN", () => {
    for (const roles of [["admin", "principal"], ["principal"], ["board"], ["counselor"], ["teacher"]] as HubRole[][]) {
      const nav = resolveNav(roles);
      expect(nav.items, `vai ${roles.join("+")}`).toBe(STAFF_ITEMS);
      expect(nav.roleLabel).not.toBe("GVCN");
    }
  });

  it("tài khoản chưa được gán vai nào không rơi vào menu của ai cả", () => {
    const nav = resolveNav([]);
    expect(nav.items).toBe(STAFF_ITEMS);
    expect(nav.roleLabel).toBe("TÀI KHOẢN TRƯỜNG");
  });

  it("người vừa là GVCN vừa là phụ huynh: ưu tiên menu GVCN (nhiều việc hơn)", () => {
    expect(resolveNav(["guardian", "homeroom"]).items).toBe(TEACHER_ITEMS);
  });
});

describe("sidebar: không còn tên lớp viết chết", () => {
  it("không nhãn menu nào chứa mã lớp kiểu 6A1", () => {
    const all = [...NAV_GROUPS, ...SOON_GROUPS].flatMap(([, items]) => items.map((i) => i.label));
    expect(all.filter((l) => /\b\d{1,2}[A-Z]\d?\b/.test(l))).toEqual([]);
  });

  it("mã nguồn hub-sidebar.tsx không còn chuỗi 6A1", () => {
    const src = readFileSync(join(repoRoot, "apps", "hub", "components", "hub-sidebar.tsx"), "utf8");
    expect(src).not.toContain("6A1");
  });

  it("nhãn vai không gắn lớp khi không biết lớp", () => {
    // resolveNav chỉ trả vai; hậu tố lớp do component ghép và CHỈ khi có classCode.
    expect(resolveNav(["homeroom"]).roleLabel).toBe("GVCN");
  });
});

describe("lưới mini app trang chủ", () => {
  it("mọi tile bật được đều có trang thật", () => {
    const roleSets: HubRole[][] = [
      ["student"],
      ["guardian"],
      ["homeroom"],
      ["counselor"],
      ["admin", "principal"],
      ["board"],
      ["teacher"],
    ];
    const broken: string[] = [];
    for (const roles of roleSets) {
      for (const tile of buildMiniApps(roles)) {
        if (!tile.available) continue;
        if (!routeExists(tile.href)) broken.push(`${roles.join("+")}: ${tile.key} → ${tile.href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("tile mờ (available=false) không dẫn đi đâu", () => {
    const soon = buildMiniApps(["student"]).filter((t) => !t.available);
    expect(soon.length).toBeGreaterThan(0);
    expect(soon.every((t) => t.href === "#")).toBe(true);
  });

  it("tài khoản chưa có vai nào không nhận tile nào", () => {
    // Trước 31/07/2026 `isStaff = !isStudentOrGuardian` khiến roles=[] nhận tile Factory.
    expect(buildMiniApps([])).toEqual([]);
  });

  it("phụ huynh không nhận tile app nhân viên (Factory)", () => {
    expect(buildMiniApps(["guardian"]).map((t) => t.key)).not.toContain("factory");
  });

  it("tư vấn cụm không nhận buồng lái GVCN (vào /gvcn sẽ bị đá về /home)", () => {
    expect(buildMiniApps(["counselor"]).map((t) => t.key)).not.toContain("cockpit");
    expect(buildMiniApps(["homeroom"]).map((t) => t.key)).toContain("cockpit");
  });
});

describe("tab bar mobile của học sinh", () => {
  it("cả 3 đích đều có trang thật", () => {
    expect(STUDENT_TABBAR_HREFS.filter((h) => !routeExists(h))).toEqual([]);
  });
});

describe("quét toàn bộ apps/hub: không href tĩnh nào trỏ vào trang chết", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("mọi href=\"/...\" viết thẳng trong JSX đều có trang", () => {
    const files = [...walk(appDir), ...walk(join(repoRoot, "apps", "hub", "components"))];
    const broken: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/href="(\/[^"]*)"/g)) {
        const href = m[1];
        if (!href) continue;
        // Bỏ qua liên kết ra ngoài Hub (đường OIDC do server.mjs phục vụ, không phải app/).
        if (href.startsWith("/oidc/")) continue;
        if (!routeExists(href)) broken.push(`${file.slice(repoRoot.length)} → ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("không còn href=\"#\" trong thẻ <a>/<Link> (nút bấm không dẫn đi đâu)", () => {
    // Mục "sắp có" phải render bằng <div> mờ + badge, KHÔNG phải link vô hiệu:
    // link bấm được mà không đi đâu là hứa suông với người dùng.
    //
    // Danh sách nợ dưới đây so khớp CHÍNH XÁC, không phải "bỏ qua": thêm link chết mới
    // → đỏ; sửa xong link cũ mà quên xoá dòng ở đây → cũng đỏ, buộc phải dọn.
    // Hai link "Quyền riêng tư"/"Hỗ trợ" trên màn đăng nhập thuộc gói "client-auth-query"
    // (file login-form.tsx không nằm trong phạm vi gói "sidebar-dieu-huong").
    const KNOWN_DEAD_LINKS = [
      'apps/hub/components/login-form.tsx → <a href="#">',
      'apps/hub/components/login-form.tsx → <a href="#">',
    ];
    const files = [...walk(appDir), ...walk(join(repoRoot, "apps", "hub", "components"))];
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/<(a|Link)\b[^>]*href="#"/g)) {
        offenders.push(`${file.slice(repoRoot.length).replace(/\\/g, "/")} → <${m[1]} href="#">`);
      }
    }
    expect(offenders.sort()).toEqual(KNOWN_DEAD_LINKS);
  });
});
