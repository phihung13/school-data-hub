// tests/unit/man-hinh.test.ts — cổng canh BẢN KHAI màn hình (apps/hub/lib/man-hinh.ts).
//
// ═══════════════════════════════════════════════════════════════════════════════
// CÂU HỎI DUY NHẤT ĐÁNG HỎI Ở ĐÂY
// ═══════════════════════════════════════════════════════════════════════════════
// Bản khai nói "vai này vào được màn kia". Trang đích thì tự cưỡng chế bằng một câu
// `redirect("/home")`. HAI CHỖ, và chúng có thể lệch nhau.
//
// Lệch theo chiều nào cũng hỏng, và cả hai đều IM LẶNG:
//
//   · Khai RỘNG hơn hàng rào thật → mục hiện ra, người dùng bấm, trang đá ngược về
//     /home không một lời giải thích. Đây là "menu 404" — kho này đã sửa ba lần
//     (counselor thấy tile buồng lái · phụ huynh thấy tile /checkin · GVCN được hứa màn
//     ghi chú tư vấn) và mỗi lần đều phải có người ngồi bấm thử mới thấy.
//   · Khai HẸP hơn hàng rào thật → màn có thật, quyền có thật, mà không đường nào tới.
//     Đúng cảnh màn Điều hành chạy hai ngày trong vô hình.
//
// Bài này đọc câu redirect THẬT trong từng `page.tsx` rồi so với `vai` trong bản khai.
// Từ nay khai sai là CI đỏ, không phải người dùng bị đá ngược.
//
// GIỚI HẠN PHẢI NÓI RA: bộ đọc dưới đây hiểu ĐÚNG hai khuôn hàng rào đang dùng thật
//   (a) `if (!session.roles.includes("x")) redirect("/home")`
//   (b) `if (!a && !b) redirect("/home")` với `const a = session.roles.includes("x")`
// Trang nào viết hàng rào theo khuôn thứ ba sẽ bị chính bài tự-kiểm bên dưới bắt, chứ
// không âm thầm được coi là "không chặn ai".

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAN_HINH, manChoLuoi, manChoMenu, manChoTab } from "@/lib/man-hinh";
import type { HubRole } from "@hub/core/contracts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const appDir = join(repoRoot, "apps", "hub", "app");

const MOI_VAI: HubRole[] = [
  "student",
  "guardian",
  "teacher",
  "homeroom",
  "counselor",
  "principal",
  "board",
  "admin",
];

function boChuThich(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Đường dẫn tới `page.tsx` của một href, hoặc null nếu không có trang. */
function fileTrang(href: string): string | null {
  const p = join(appDir, href.replace(/^\//, ""), "page.tsx");
  return existsSync(p) ? p : null;
}

/**
 * Vai mà trang THẬT SỰ cho vào, đọc từ câu redirect.
 * `null` = trang không chặn vai nào (ai đăng nhập cũng vào).
 */
function vaiTheoTrang(href: string): HubRole[] | null {
  const f = fileTrang(href);
  if (!f) return [];
  const src = boChuThich(readFileSync(f, "utf8"));
  if (!/redirect\("\/home"\)/.test(src)) return null;

  const vai = new Set<string>();
  for (const m of src.matchAll(/if\s*\(\s*!\s*session\.roles\.includes\("([a-z]+)"\)\s*\)\s*redirect/g)) {
    vai.add(m[1]!);
  }
  // `(.*?)` KHÔNG-THAM chứ không phải `[^)]*`: điều kiện của `if` CHỨA chính dấu ngoặc
  // đóng của `includes("principal")`, nên một lớp `[^)]*` dừng ngay tại đó và bỏ sót cả
  // câu. Đã đỏ đúng như vậy ở lượt chạy đầu — và nó đỏ theo hướng NGUY HIỂM: bộ đọc trả
  // về mảng rỗng, tức "không ai vào được", trong khi trang cho hai vai vào. Nếu bài này
  // chỉ so một chiều thì mảng rỗng đó sẽ trông như một hàng rào rất chặt.
  for (const m of src.matchAll(/if\s*\((.*?)\)\s*redirect\("\/home"\)/gs)) {
    const dk = m[1]!;
    // Khuôn nối trực tiếp: `!session.roles.includes("a") && !session.roles.includes("b")`
    for (const m2 of dk.matchAll(/!session\.roles\.includes\("([a-z]+)"\)/g)) vai.add(m2[1]!);
    // Khuôn biến trung gian: `const isStudent = session.roles.includes("student")` rồi
    // `if (!isStudent && !isGuardian) redirect("/home")`.
    for (const bien of dk.matchAll(/!(\w+)\b(?!\s*[.(])/g)) {
      const d = src.match(new RegExp(`const ${bien[1]}\\s*=\\s*session\\.roles\\.includes\\("([a-z]+)"\\)`));
      if (d) vai.add(d[1]!);
    }
  }
  return [...vai] as HubRole[];
}

describe("bộ đọc hàng rào (tự kiểm chính nó)", () => {
  it("đọc đúng ba khuôn hàng rào đang dùng thật trong kho", () => {
    // Khuôn (a): một vai.
    expect(vaiTheoTrang("/checkin")).toEqual(["student"]);
    expect(vaiTheoTrang("/tam-ly")).toEqual(["counselor"]);
    // Khuôn (b): biến trung gian, hai vai.
    expect(vaiTheoTrang("/bao-cao")?.slice().sort()).toEqual(["guardian", "student"]);
    // Khuôn (c): hai lời gọi nối bằng &&.
    expect(vaiTheoTrang("/dieu-hanh")?.slice().sort()).toEqual(["board", "principal"]);
    // Trang không chặn vai nào phải ra `null`, KHÁC HẲN mảng rỗng (rỗng = không ai vào được).
    expect(vaiTheoTrang("/home")).toBeNull();
    // Trang không tồn tại: mảng rỗng, không phải "tự do vào".
    expect(vaiTheoTrang("/khong-he-co")).toEqual([]);
  });
});

describe("bản khai KHỚP hàng rào thật của từng trang", () => {
  for (const m of MAN_HINH) {
    if (m.href === "#") continue; // màn chưa dựng — không có trang để mà đối chiếu

    it(`${m.href} — khai "${m.vai === "moi-nguoi" ? "mọi người" : (m.vai as HubRole[]).join("+")}"`, () => {
      const that = vaiTheoTrang(m.href);
      expect(fileTrang(m.href), `${m.href} không có page.tsx — mục dẫn tới trang chết`).toBeTruthy();

      if (m.vai === "moi-nguoi") {
        expect(that, `bản khai nói mọi người vào được, nhưng ${m.href} có chặn vai`).toBeNull();
        return;
      }
      expect(that, `bản khai chặn vai nhưng ${m.href} KHÔNG chặn ai — khai hẹp hơn thật`).not.toBeNull();
      expect((m.vai as HubRole[]).slice().sort()).toEqual(that!.slice().sort());
    });
  }
});

describe("KHÔNG vai nào thấy một mục mà mình không mở được", () => {
  // Phép kiểm ĐẢO CHIỀU của khối trên: ở đó ta so từng dòng khai với trang của nó; ở đây
  // ta đi từ phía NGƯỜI DÙNG — dựng đúng ba bề mặt cho từng vai rồi hỏi từng mục một.
  // Hai chiều bắt hai lớp lỗi khác nhau: khối trên bắt khai sai, khối này bắt lọc sai.
  for (const vai of MOI_VAI) {
    it(`${vai} — mọi mục ở lưới, menu và thanh tab đều mở được`, () => {
      const hong: string[] = [];
      for (const [beMat, muc] of [
        ["lưới", manChoLuoi([vai])],
        ["menu", manChoMenu([vai])],
        ["tab", manChoTab([vai])],
      ] as const) {
        for (const m of muc) {
          if (m.href === "#") continue; // mục mờ, không bấm được
          const that = vaiTheoTrang(m.href);
          if (that === null) continue; // trang mở cho mọi người
          if (!that.includes(vai)) hong.push(`${beMat}: ${m.nhan} → ${m.href} (chỉ ${that.join("/")} vào được)`);
        }
      }
      expect(hong).toEqual([]);
    });
  }
});

describe("bản khai sạch", () => {
  it("mã khoá duy nhất — một màn một mã", () => {
    // Trước 02/08/2026 mã `attendance` được dùng cho BA màn khác nhau tuỳ vai, và màn
    // Tâm lý cụm mang hai mã khác nhau ở hai bề mặt. Mã cũng là `key` của React.
    const ma = MAN_HINH.map((m) => m.key);
    expect(ma.filter((k, i) => ma.indexOf(k) !== i)).toEqual([]);
  });

  it("đường dẫn duy nhất, trừ các mục chưa dựng", () => {
    const hrefs = MAN_HINH.map((m) => m.href).filter((h) => h !== "#");
    expect(hrefs.filter((h, i) => hrefs.indexOf(h) !== i)).toEqual([]);
  });

  it("mục chưa dựng thì href phải là '#', và có href '#' thì phải khai sapCo", () => {
    // Hai chiều, vì lệch chiều nào cũng ra một lời hứa suông: một mục bấm được dẫn tới
    // hư không, hoặc một mục mờ dẫn tới trang có thật.
    expect(MAN_HINH.filter((m) => m.sapCo && m.href !== "#").map((m) => m.key)).toEqual([]);
    expect(MAN_HINH.filter((m) => m.href === "#" && !m.sapCo).map((m) => m.key)).toEqual([]);
  });

  it("KHÔNG màn nào khai xong rồi không hiện ở đâu cả", () => {
    // Một màn không có mặt ở lưới, menu lẫn thanh tab thì với người dùng nó không tồn
    // tại — và đó phải là một quyết định được viết ra, không phải một dòng bị quên.
    const vang = MAN_HINH.filter((m) => !m.luoi && !m.menu && !m.tab).map((m) => m.key);
    expect(vang).toEqual([]);
  });

  it("mọi tên icon đều có trong font đã cắt gọn", () => {
    // Tên ngoài danh sách vẽ ra một Ô TRỐNG — không lỗi, không log, không ai biết.
    const co = readFileSync(join(repoRoot, "apps", "hub", "public", "fonts", "icon-names.txt"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim());
    expect(MAN_HINH.filter((m) => !co.includes(m.icon)).map((m) => `${m.key} → ${m.icon}`)).toEqual([]);
  });

  it("mỗi vai đều có ít nhất một đường đi, không ai vào Hub rồi đứng im", () => {
    for (const vai of MOI_VAI) {
      const tong = manChoLuoi([vai]).length + manChoMenu([vai]).length + manChoTab([vai]).length;
      expect(tong, `vai ${vai} không có mục nào`).toBeGreaterThan(0);
    }
  });
});
