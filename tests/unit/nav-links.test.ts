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
import { resolveNav, type NavItem } from "@/components/hub-sidebar";

// Bảy mảng menu đã rời khỏi hub-sidebar.tsx ngày 02/08/2026 — nguồn duy nhất nay là
// `apps/hub/lib/man-hinh.ts`. Bài test đi qua ĐÚNG hàm mà sidebar gọi thay vì nhập thẳng
// hằng số: nhập hằng số là kiểm cái kho chứa, gọi hàm là kiểm cái người dùng thật sự
// nhận được. Không phép kiểm nào bị bỏ.
const STUDENT_ITEMS = resolveNav(["student"]).items;
const STUDENT_SOON = resolveNav(["student"]).soon;
const TEACHER_ITEMS = resolveNav(["homeroom"]).items;
const TEACHER_SOON = resolveNav(["homeroom"]).soon;
const GUARDIAN_ITEMS = resolveNav(["guardian"]).items;
const GUARDIAN_SOON = resolveNav(["guardian"]).soon;
const STAFF_ITEMS = resolveNav(["teacher"]).items;
const STAFF_SOON = resolveNav(["teacher"]).soon;
const COUNSELOR_SOON = resolveNav(["counselor"]).soon;
const ADMIN_SOON = resolveNav(["admin"]).soon;
import { STUDENT_TABBAR_HREFS, resolveTabs } from "@/components/tab-bar";
import { buildMiniApps } from "@/server/mini-apps";

import type { HubRole } from "@hub/core/contracts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const appDir = join(repoRoot, "apps", "hub", "app");

/**
 * Tệp page.tsx phục vụ đường dẫn này (null nếu không có trang). Đi theo đúng cách Next
 * App Router phân giải: mỗi đoạn là một thư mục, thư mục động `[x]` khớp mọi giá trị
 * (nhờ vậy /embed/factory khớp app/embed/[appId]/page.tsx). Đích cuối phải có page.tsx
 * (trang) hoặc route.ts (route handler) — thư mục rỗng không tính là trang.
 */
function pageFileFor(href: string): string | null {
  // `noUncheckedIndexedAccess` (tsconfig.base.json) coi phần tử mảng là `string | undefined`,
  // kể cả [0] của split() vốn luôn có. Dùng ?. + ?? thay vì `!` để không tắt cảnh báo bằng
  // lời hứa suông — nếu href rỗng thì rơi về chính href, hàm trả null, đúng ý.
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
    if (!dynamic) return null;
    dir = join(dir, dynamic.name);
  }
  return ["page.tsx", "page.ts", "route.ts", "route.tsx"].map((f) => join(dir, f)).find((f) => existsSync(f)) ?? null;
}

function routeExists(href: string): boolean {
  return pageFileFor(href) !== null;
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
  ["COUNSELOR_SOON", COUNSELOR_SOON],
  ["ADMIN_SOON", ADMIN_SOON],
];

/** Mọi vai có thật, để quét "ai vào được đâu" mà không bỏ sót vai nào. */
const ALL_ROLES: HubRole[] = [
  "student",
  "guardian",
  "teacher",
  "homeroom",
  "counselor",
  "principal",
  "board",
  "admin",
];

/** Bỏ chú thích trước khi đọc mã: chú thích trong repo này nhắc tên vai rất nhiều. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Hàng rào vai của một trang: danh sách vai vào được, hoặc `null` khi trang không chặn
 * vai nào (ai đăng nhập cũng vào, vd /home, /ho-so).
 *
 * Đọc thẳng từ mã trang thay vì gọi HTTP: test đơn vị chạy trong CI không có Postgres
 * cũng không có server. Đổi lại nó chỉ hiểu ĐÚNG hai khuôn hàng rào đang dùng thật —
 *   (a) `if (!session.roles.includes("x")) redirect("/home")` (11 trang),
 *   (b) `canOpenEmbedApp(app, identity.roles)` của /embed/* (registry.ts là hàng rào thật).
 * Trang nào viết hàng rào theo kiểu thứ ba mà quên cập nhật hàm này sẽ bị bắt bởi chính
 * bài tự kiểm ngay dưới, chứ không âm thầm trả "không có hàng rào".
 */
function rolesAllowedBy(href: string): HubRole[] | null {
  if (href.startsWith("/embed/")) {
    // NÉM, KHÔNG TRẢ VỀ MỘT CÂU TRẢ LỜI ĐOÁN (02/08/2026, migration 0052).
    //
    // Hàng rào của /embed/* trước đây đọc được tĩnh vì danh sách app là một mảng
    // TypeScript. Nay nó nằm trong bảng `core.embedded_apps`, mà bài test đơn vị chạy
    // KHÔNG có Postgres. Hai cách xử sai và một cách đúng:
    //   · trả `[]`  ⇒ "không vai nào vào được" — sai, và nó làm mọi phép kiểm bên dưới
    //     xanh một cách vô nghĩa (không tile nào lọt qua vì tile nào cũng "bị cấm").
    //   · trả `null` ⇒ "trang không chặn ai" — sai theo hướng nguy hiểm hơn: nó khiến
    //     các phép kiểm BỎ QUA route nhúng và không ai thấy là chúng bị bỏ qua.
    //   · ném ⇒ người viết phép kiểm mới buộc phải quyết định, ngay tại chỗ.
    // Tính chất "vai nào mở được app nhúng nào" nay kiểm ở tests/db/mini-app-so-dang-ky.test.ts,
    // nơi có database thật.
    throw new Error(
      `rolesAllowedBy("${href}"): hàng rào của route nhúng nằm trong CSDL (0052), không đọc tĩnh được. ` +
        "Kiểm nó ở tests/db/mini-app-so-dang-ky.test.ts.",
    );
  }
  const file = pageFileFor(href);
  if (!file) return [];
  const src = stripComments(readFileSync(file, "utf8"));
  if (!src.includes('redirect("/home")')) return null;
  const found = [...src.matchAll(/roles\.includes\("([a-z]+)"\)/g)].map((m) => m[1]);
  return ALL_ROLES.filter((r) => found.includes(r));
}

/**
 * Nhãn "gốc" của một mục điều hướng: bỏ hậu tố trạng thái ("· GĐ2", "· sắp") và hoa/thường.
 * Dùng để so hai mục xem chúng có đang NÓI CÙNG MỘT ĐIỀU với người dùng hay không.
 */
function baseLabel(label: string): string {
  return (label.split("·")[0] ?? label).trim().toLowerCase();
}

/** Mọi bề mặt điều hướng mà MỘT người mang bộ vai này nhìn thấy trong cùng một phiên. */
function navSurfaces(roles: HubRole[]): Array<{ where: string; label: string; href: string }> {
  const nav = resolveNav(roles);
  return [
    ...nav.items.map((i) => ({ where: "sidebar", label: i.label, href: i.href })),
    ...nav.soon.map((i) => ({ where: "sidebar (mờ)", label: i.label, href: i.href })),
    ...resolveTabs(roles).map((i) => ({ where: "tab bar", label: i.label, href: i.href })),
    ...buildMiniApps(roles).map((t) => ({ where: "tile", label: t.label, href: t.href })),
  ];
}

describe("bộ phân giải đường dẫn (tự kiểm chính nó)", () => {
  it("nhận ra trang có thật và trang không có", () => {
    expect(routeExists("/home")).toBe(true);
    expect(routeExists("/gvcn")).toBe(true);
    expect(routeExists("/embed/factory")).toBe(true); // qua thư mục động [appId]
    expect(routeExists("/gvcn/lop")).toBe(true); // gói "gvcn-man-hinh" đã dựng trang thật
    expect(routeExists("/gvcn/khong-co")).toBe(false); // thư mục con không tồn tại
    expect(routeExists("/khong-he-co-trang-nay")).toBe(false);
  });
});

describe("bộ đọc hàng rào vai (tự kiểm chính nó)", () => {
  it("đọc đúng hàng rào của những trang đã biết", () => {
    expect(rolesAllowedBy("/checkin")).toEqual(["student"]);
    expect(rolesAllowedBy("/gvcn")).toEqual(["homeroom"]);
    // /bao-cao chặn hai vai bằng biến trung gian (isStudent/isGuardian) — cả hai đều
    // phải đọc ra, nếu không bài kiểm tile dưới đây sẽ báo oan phụ huynh.
    expect(rolesAllowedBy("/bao-cao")?.sort()).toEqual(["guardian", "student"]);
    // Trang không chặn vai nào: null, KHÁC hẳn "mảng rỗng" (rỗng = không ai vào được).
    expect(rolesAllowedBy("/ho-so")).toBeNull();
    expect(rolesAllowedBy("/home")).toBeNull();
    // Hàng rào của /embed/* nay nằm trong CSDL — bộ đọc tĩnh này phải NÉM chứ không
    // được đoán. Xem lý lẽ đầy đủ trong chính hàm đó.
    expect(() => rolesAllowedBy("/embed/factory")).toThrow(/nằm trong CSDL/);
    // Trang không tồn tại: không ai vào được, không phải "tự do vào".
    expect(rolesAllowedBy("/khong-he-co-trang-nay")).toEqual([]);
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
    expect(resolveNav(["student"]).items).toEqual(STUDENT_ITEMS);
    expect(resolveNav(["student"]).roleLabel).toBe("HỌC SINH");
  });

  it("GVCN thấy menu GVCN", () => {
    expect(resolveNav(["homeroom", "teacher"]).items).toEqual(TEACHER_ITEMS);
    expect(resolveNav(["homeroom"]).roleLabel).toBe("GVCN");
  });

  it("phụ huynh KHÔNG thấy menu GVCN", () => {
    const nav = resolveNav(["guardian"]);
    expect(nav.items).toEqual(GUARDIAN_ITEMS);
    expect(nav.roleLabel).toBe("PHỤ HUYNH");
    expect(nav.roleLabel).not.toContain("GVCN");
  });

  it("giáo viên bộ môn có màn của mình, và KHÔNG phải menu GVCN", () => {
    // Danh sách "nhân viên tối thiểu" rụng dần theo đúng nhịp các vai có màn hình thật,
    // và đó là chủ ý:
    //   · 31/07/2026 — `counselor` rời đi (có /tam-ly), ca riêng nằm ngay dưới;
    //   · 01/08/2026 — `principal`/`board` rời đi (có /dieu-hanh), ca riêng nằm dưới nữa.
    //   · 02/08/2026 — `admin` rời đi (có /quan-tri/mini-app), ca riêng nằm ngay dưới.
    //   · 06/08/2026 — `teacher` rời đi (có /lop-toi-day). Danh sách nay RỖNG: không còn
    //     vai nào của trường chỉ có mỗi "Trang chủ".
    const nav = resolveNav(["teacher"]);
    expect(nav.items.map((i) => i.href)).toContain("/lop-toi-day");
    expect(nav.roleLabel).not.toBe("GVCN");
    // Và không được vớ luôn menu GVCN: bốn màn /gvcn/* chặn `homeroom` ở page.tsx, nên
    // một mục hiện ra cho vai này là một mục bấm vào bị đá ngược về /home.
    for (const href of ["/gvcn", "/gvcn/lop", "/gvcn/diem-danh", "/gvcn/duyet-bao-cao", "/gvcn/ghi-chu"]) {
      expect(nav.items.map((i) => i.href), `giáo viên bộ môn không được thấy ${href}`).not.toContain(href);
    }
  });

  it("quản trị NỐI THÊM mục Mini App, không thay cả bộ của vai kia", () => {
    // Nối chứ không thay — và đây không phải chuyện gu thiết kế. Tài khoản quản trị duy
    // nhất của hệ là admin.hung@va.edu.vn, mang `admin+principal`, mà `principal` đứng
    // TRƯỚC `admin` trong ROLE_PRIORITY. Nếu chọn menu loại trừ như các vai khác thì anh
    // ấy nhận BOARD_ITEMS và KHÔNG bao giờ thấy màn Mini App; đảo thứ tự thì mất màn
    // Điều hành. Một người mang hai vai cần cả hai màn.
    const chiQuanTri = resolveNav(["admin"]).items.map((i) => i.href);
    expect(chiQuanTri).toContain("/home");
    expect(chiQuanTri).toContain("/quan-tri/mini-app");

    const caHai = resolveNav(["admin", "principal"]).items.map((i) => i.href);
    expect(caHai, "mất màn Điều hành").toContain("/dieu-hanh");
    expect(caHai, "mất màn Mini App").toContain("/quan-tri/mini-app");

    // Và không nối cho người không phải quản trị.
    for (const roles of [["principal"], ["teacher"], ["homeroom"], ["counselor"]] as HubRole[][]) {
      expect(resolveNav(roles).items.map((i) => i.href), `vai ${roles.join("+")}`).not.toContain(
        "/quan-tri/mini-app",
      );
    }
  });

  it("hiệu trưởng và ban điều hành có menu riêng dẫn tới màn Điều hành", () => {
    // Màn /dieu-hanh dựng xong 31/07 nhưng tới 01/08 vẫn KHÔNG đường nào dẫn tới — vào
    // được chỉ bằng cách gõ URL. Bài này ghim lại chuyện đó: một màn hình không có lối
    // vào thì với người dùng nó không tồn tại, và cái hỏng đó không kêu một tiếng nào.
    for (const roles of [["principal"], ["board"], ["admin", "principal"]] as HubRole[][]) {
      const nav = resolveNav(roles);
      expect(nav.items.map((i) => i.href), `vai ${roles.join("+")}`).toContain("/dieu-hanh");
      // Không được là ngõ cụt: vẫn phải có đường về trang chủ và tới hồ sơ (nơi đăng xuất).
      // "/ho-so" đã rời khỏi mọi danh sách điều hướng ngày 02/08/2026 và về dưới avatar.
    // Tính chất "vai này không bị nhốt" KHÔNG bị bỏ — nó chuyển sang ba phép kiểm trong
    // tests/unit/dieu-huong-mobile.test.ts ("KHÔNG vai nào bị khoá…"), đọc thẳng mã nguồn
    // của thanh tab, menu trái và lớp nổi tài khoản.
    expect(nav.items.map((i) => i.href)).toEqual(expect.arrayContaining(["/home"]));
      expect(nav.roleLabel).not.toBe("GVCN");
    }
  });

  it("tâm lý cụm có menu riêng dẫn tới màn hình thật của mình", () => {
    const nav = resolveNav(["counselor"]);
    expect(nav.roleLabel).toBe("TÂM LÝ CỤM");
    expect(nav.items.map((i) => i.href)).toContain("/tam-ly");
    // Và không được là ngõ cụt: phải có đường về trang chủ và tới hồ sơ (nơi đăng xuất).
    // "/ho-so" đã rời khỏi mọi danh sách điều hướng ngày 02/08/2026 và về dưới avatar.
    // Tính chất "vai này không bị nhốt" KHÔNG bị bỏ — nó chuyển sang ba phép kiểm trong
    // tests/unit/dieu-huong-mobile.test.ts ("KHÔNG vai nào bị khoá…"), đọc thẳng mã nguồn
    // của thanh tab, menu trái và lớp nổi tài khoản.
    expect(nav.items.map((i) => i.href)).toEqual(expect.arrayContaining(["/home"]));
  });

  it("tài khoản chưa được gán vai nào không rơi vào menu của ai cả", () => {
    // ĐỔI CÁCH CHỨNG MINH, KHÔNG HẠ CHUẨN (06/08/2026).
    //
    // Câu cũ ở đây là `expect(nav.items).toEqual(STAFF_ITEMS)` — và nó xanh chỉ vì một sự
    // TRÙNG HỢP: chừng nào vai `teacher` chưa có màn nghiệp vụ nào thì menu của nó đúng
    // bằng phần chung cho mọi người. Ngày `teacher` có màn thật (/lop-toi-day), phép so
    // ấy đỏ — mà tính chất nó định canh thì không hề đổi.
    //
    // Tính chất thật: người chưa có vai chỉ thấy những màn khai `vai: "moi-nguoi"`, không
    // dính một mục nào của một vai cụ thể. Nay khẳng định thẳng điều đó.
    const nav = resolveNav([]);
    expect(nav.roleLabel).toBe("TÀI KHOẢN TRƯỜNG");
    expect(nav.items.map((i) => i.href)).toEqual(["/home"]);
    for (const roles of [["student"], ["guardian"], ["teacher"], ["homeroom"], ["counselor"], ["principal"], ["admin"]] as HubRole[][]) {
      const rieng = resolveNav(roles).items.map((i) => i.href).filter((h) => h !== "/home");
      const lot = nav.items.map((i) => i.href).filter((h) => rieng.includes(h));
      expect(lot, `tài khoản chưa có vai lại thấy mục của ${roles.join("+")}`).toEqual([]);
    }
  });

  it("người vừa là GVCN vừa là phụ huynh nhận CẢ HAI, không phải một bộ ưu tiên", () => {
    // ĐỔI HÀNH VI CÓ CHỦ Ý 02/08/2026, và đây là một lần SỬA LỖI chứ không phải một lần
    // đổi ý. Luật cũ ghi "ưu tiên menu GVCN (nhiều việc hơn)" — nghĩa là một cô giáo
    // đồng thời là phụ huynh của một em trong trường nhận menu GVCN và KHÔNG có đường
    // nào tới báo cáo của chính con mình. Một ngõ cụt, im lặng, đúng loại mà kho này
    // vẫn đi bắt.
    //
    // Cùng lý lẽ đã áp cho `admin+principal` ở phần thanh tab: một người mang hai vai
    // cần cả hai màn, không phải màn của vai xếp trên. Bản khai (`lib/man-hinh.ts`) lọc
    // theo GIAO của vai với từng màn, nên chuyện gộp là hệ quả tự nhiên — không còn ai
    // phải nhớ viết thêm nhánh.
    const hrefs = resolveNav(["guardian", "homeroom"]).items.map((i) => i.href);
    for (const cua of resolveNav(["homeroom"]).items.map((i) => i.href)) {
      expect(hrefs, `mất mục GVCN: ${cua}`).toContain(cua);
    }
    expect(hrefs, "cô là phụ huynh mà không có đường tới báo cáo của con mình").toContain("/bao-cao");
    // Nhãn vai vẫn theo ROLE_PRIORITY — một người một nhãn, không đổi.
    expect(resolveNav(["guardian", "homeroom"]).roleLabel).toBe("GVCN");
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

  it("phụ huynh không nhận tile nào trỏ /checkin (trang chỉ dành cho học sinh)", () => {
    // Lỗi thật đến 31/07/2026: phụ huynh dùng chung lưới của học sinh, tile ĐẦU TIÊN
    // trên trang chủ trỏ /checkin — bấm là bị đá ngược về /home, không lời giải thích.
    expect(buildMiniApps(["guardian"]).map((t) => t.href)).not.toContain("/checkin");
    expect(buildMiniApps(["student"]).map((t) => t.href)).toContain("/checkin");
  });

  it("tile của phụ huynh: đúng một việc làm được, phần chưa có thì mờ chứ không biến mất", () => {
    const tiles = buildMiniApps(["guardian"]);
    expect(tiles.filter((t) => t.available).map((t) => t.href)).toEqual(["/bao-cao"]);
    // Điểm danh của con: quyền đọc đã có ở tầng RLS nhưng chưa có màn hình. Mờ = nói
    // thật "chưa có"; xoá hẳn thì phụ huynh tưởng hệ thống không theo dõi việc đó.
    // Mã khoá đổi 02/08/2026: `attendance` từng được dùng cho BA màn khác nhau tuỳ vai
    // (/diem-danh của em · /gvcn/diem-danh của cô · ô mờ này của phụ huynh). Một mã ba
    // đích thì `key` không còn nghĩa gì, và nó cũng là `key` của React. Nay mỗi màn một
    // mã: `attendance` · `attendance-lop` · `attendance-con`.
    expect(tiles.find((t) => t.key === "attendance-con")?.available).toBe(false);
  });
});

describe("mọi tile bật được đều MỞ ĐƯỢC với chính vai đó", () => {
  // Khác với bài "có trang thật" ở trên: trang có tồn tại vẫn có thể chặn đúng vai đang
  // nhìn thấy tile rồi redirect("/home"). Với người dùng, hai lỗi đó giống hệt nhau.
  const ROLE_SETS: HubRole[][] = [
    ["student"],
    ["guardian"],
    ["homeroom"],
    ["counselor"],
    ["admin", "principal"],
    ["board"],
    ["teacher"],
    ["student", "guardian"],
    ["guardian", "homeroom"],
  ];

  it("không vai nào bấm tile rồi bị đá ngược về /home", () => {
    const bounced: string[] = [];
    for (const roles of ROLE_SETS) {
      for (const tile of buildMiniApps(roles)) {
        if (!tile.available) continue;
        const allowed = rolesAllowedBy(tile.href);
        if (allowed === null) continue; // trang không chặn vai nào
        if (!roles.some((r) => allowed.includes(r))) {
          bounced.push(`${roles.join("+")}: ${tile.label} → ${tile.href} (chỉ ${allowed.join("/") || "không ai"} vào được)`);
        }
      }
    }
    expect(bounced).toEqual([]);
  });

  it("mọi mục sidebar bấm được cũng vậy", () => {
    const bounced: string[] = [];
    for (const roles of ROLE_SETS) {
      for (const item of resolveNav(roles).items) {
        const allowed = rolesAllowedBy(item.href);
        if (allowed === null) continue;
        if (!roles.some((r) => allowed.includes(r))) {
          bounced.push(`${roles.join("+")}: ${item.label} → ${item.href}`);
        }
      }
    }
    expect(bounced).toEqual([]);
  });
});

describe("một nhãn chỉ được có một đích", () => {
  const ROLE_SETS: HubRole[][] = [["student"], ["guardian"], ["homeroom"], ["counselor"], ["admin"], ["board"], []];

  it("trong cùng một phiên, hai mục cùng nhãn không được dẫn đi hai nơi", () => {
    // Lỗi thật: nhãn "Điểm danh" xuất hiện hai lần cho học sinh trên máy tính — tile
    // trang chủ dẫn tới /checkin (nơi GHI tâm trạng), mục sidebar dẫn tới /diem-danh
    // (nơi XEM LẠI). Người dùng không có cách nào biết mình sắp đi đâu; nhãn trùng mà
    // đích khác thì nhãn thôi không còn là thông tin.
    const clashes: string[] = [];
    for (const roles of ROLE_SETS) {
      const byLabel = new Map<string, Map<string, string[]>>();
      for (const entry of navSurfaces(roles)) {
        const key = baseLabel(entry.label);
        const dests = byLabel.get(key) ?? new Map<string, string[]>();
        dests.set(entry.href, [...(dests.get(entry.href) ?? []), `${entry.where} "${entry.label}"`]);
        byLabel.set(key, dests);
      }
      for (const [label, dests] of byLabel) {
        if (dests.size > 1) {
          const detail = [...dests].map(([href, wheres]) => `${wheres.join(", ")} → ${href}`).join(" | ");
          clashes.push(`vai ${roles.join("+") || "(rỗng)"}: "${label}": ${detail}`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe("mục mờ nói về màn hình của CHÍNH vai đang đọc", () => {
  const soonLabels = (roles: HubRole[]) => resolveNav(roles).soon.map((i) => i.label);

  it("tâm lý cụm không còn mục mờ nào — màn hình của cô đã có thật", () => {
    // Trước 31/07/2026 mục "Tâm lý cụm" nằm ở nhóm mờ "sắp có". Khi trang /tam-ly được
    // dựng thật mà mục mờ vẫn còn, cùng một nhãn dẫn đi hai nơi: sidebar bảo chưa có,
    // tile trên trang chủ lại mở được. Nhóm mờ của vai này nay rỗng.
    expect(soonLabels(["counselor"])).toEqual([]);
    expect(soonLabels(["counselor"])).not.toContain("Quản trị hệ thống");
  });

  it("KHÔNG còn mục mờ “Quản trị hệ thống” — nó đã thành màn thật", () => {
    // Mục mờ này trỏ href="#" và đứng suốt từ ngày dựng sidebar: một lời hứa suông với
    // đúng một người. Ngày 02/08/2026 màn Mini App (/quan-tri/mini-app) dựng thật, nên
    // lời hứa trở thành một mục BẤM ĐƯỢC — kiểm ở "quản trị NỐI THÊM mục Mini App" bên
    // trên. Giữ lại mục mờ song song với màn thật thì cùng một ý ("quản trị hệ thống")
    // hiện hai lần, một chỗ bấm được và một chỗ không.
    for (const roles of [["admin"], ["principal"], ["board"], ["teacher"], ["homeroom"], ["guardian"], ["student"]] as HubRole[][]) {
      expect(soonLabels(roles), `vai ${roles.join("+")}`).not.toContain("Quản trị hệ thống");
    }
  });

  it("GVCN không được hứa màn ghi chú tư vấn (DESIGN-GUIDELINES §9)", () => {
    // GVCN và phụ huynh không xem được ghi chú tư vấn. Mục mờ cũng là một lời hứa.
    expect(soonLabels(["homeroom"])).not.toContain("Tâm lý cụm");
  });

  it("hiệu trưởng/BGH: không mục mờ nào — chưa thiết kế thì không vẽ sẵn", () => {
    expect(soonLabels(["principal"])).toEqual([]);
    expect(soonLabels(["board"])).toEqual([]);
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
    // Danh sách đã về rỗng ngày 31/07/2026 (gói "bao-cao-guard-va-khung"): hai link
    // "Quyền riêng tư"/"Hỗ trợ" trên màn đăng nhập đã bị bỏ — xem ghi chú tại
    // apps/hub/components/login-form.tsx. Thêm link chết mới → test này đỏ ngay.
    const KNOWN_DEAD_LINKS: string[] = [];
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
