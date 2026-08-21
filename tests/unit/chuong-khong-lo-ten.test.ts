// tests/unit/chuong-khong-lo-ten.test.ts — cổng quét nguồn cho CHUÔNG THÔNG BÁO.
//
// ═══════════════════════════════════════════════════════════════════════════
// MỘT LUẬT: CHUÔNG KHÔNG CHỞ DANH TÍNH
// ═══════════════════════════════════════════════════════════════════════════
// `session.getPendingWork` trả về SỐ ĐẾM và ĐƯỜNG ĐI, không trả về ai. Chuông chỉ đưa
// người dùng tới đúng màn; danh tính hiện ở màn đó, nơi RLS đã gác từ trước.
//
// Vì sao phải là một cổng QUÉT NGUỒN chứ không chỉ tin vào hợp đồng: thêm `studentName`
// vào `PendingWorkItem` là một diff bốn dòng trông vô hại ("cho cô biết em nào cần gặp
// luôn cho tiện"), và nó hỏng CÂM — không lỗi, không cảnh báo, chỉ là một trường mới trong
// payload của TRANG CHỦ, tức màn có nhiều mắt nhìn nhất trong cả hệ. Điều 24 hiến pháp UI
// cấm rò nội tình, và ở đây nó trùng đúng chỗ với luật riêng tư của trường: lớp nổi của
// chuông là một bề mặt hiển thị MỚI, không policy nào canh riêng cho nó.
//
// Bài này quét mã nguồn ĐÃ BỎ CHÚ THÍCH. Bắt buộc, cùng lý do với `giong-noi.test.ts`:
// chính hai file đó kể lại lý do bằng tên của thứ bị cấm (`full_name`, `student_code`)
// trong chú thích, để lần sau không ai nối lại. Quét cả chú thích thì cách "sửa" test duy
// nhất là xoá lời giải thích — test tự phá thứ nó bảo vệ.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GetPendingWorkOutput, PendingWorkItem, PendingWorkTone } from "@hub/core/contracts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function boChuThich(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
const doc = (rel: string) => boChuThich(readFileSync(join(repoRoot, rel), "utf8"));

const ROUTER = "apps/hub/server/routers/session.ts";
const HOP_DONG = "packages/core/contracts/session.ts";

/**
 * Định danh nào mang được một cái TÊN hoặc một MÃ HỌC SINH ra ngoài.
 *
 * Cố ý KHÔNG cấm `student_id`: câu SQL của router dùng nó làm khoá JOIN
 * (`r.student_id = h.student_id`) và làm đối số của `count(distinct ...)` — đó là phép
 * đếm, không phải một trường đi ra. Cấm cả nó thì cổng này thành thứ phải tắt đi mới viết
 * được truy vấn, và một cổng bị tắt là một cổng đã chết. Thứ bị cấm là những định danh chỉ
 * có nghĩa khi ta đang MANG một con người ra khỏi máy chủ.
 */
const CAM: Array<[string, RegExp]> = [
  ["tên đầy đủ", /\bfull_?name\b|\bstudent_?name\b|\bdisplay_name\b|\bhọ tên\b/i],
  ["mã học sinh", /\bstudent_?code\b/i],
  ["nội dung tâm sự / cảm xúc", /\bmood\b|\bnote\b|\bcounselor_notes\b|\bdetail\b/i],
];

/**
 * Thân của riêng `getPendingWork` (kể cả các hàm đếm ở trên nó, vốn chỉ nó gọi).
 *
 * Cần lát cắt này vì cùng file còn có thủ tục `session.me` — thủ tục CÓ TỪ TRƯỚC và có
 * quyền trả `ctx.displayName`: đó là tên của CHÍNH người đang cầm phiên, đọc từ token của
 * họ, không phải tên một đứa trẻ. Cấm chữ `displayName` trên cả file thì cổng này bắt oan
 * một thứ đúng, và cổng bắt oan là cổng sẽ bị ai đó nới ra cho xong.
 */
const thanChuong = (): string => {
  const src = doc(ROUTER);
  const dau = src.indexOf("async function readMyScopes");
  const cuoi = src.indexOf("  me: publicProcedure");
  expect(dau, "không thấy readMyScopes — file router đã đổi hình dạng?").toBeGreaterThan(0);
  expect(cuoi, "không thấy thủ tục me — file router đã đổi hình dạng?").toBeGreaterThan(dau);
  return src.slice(dau, cuoi) + src.slice(src.indexOf("getPendingWork:"));
};

describe("chuông không mang danh tính ra khỏi máy chủ", () => {
  for (const file of [ROUTER, HOP_DONG]) {
    it.each(CAM)(`${file} — không nhắc %s`, (_ten, mau) => {
      const g = mau.flags.includes("g") ? mau.flags : mau.flags + "g";
      const hits = doc(file).match(new RegExp(mau.source, g)) ?? [];
      expect(hits, `${file} còn nhắc: ${hits.join(", ")}`).toEqual([]);
    });
  }

  it("getPendingWork không chạm cả tên của CHÍNH người đang gọi", () => {
    // `ctx.displayName` là hợp lệ ở thủ tục `me` (màn hình chào người dùng bằng tên họ),
    // nhưng chuông không có việc gì với nó: chuông đếm việc, không giới thiệu ai. Đưa nó
    // vào đây là mở một trường tên trong payload của trang chủ — và trường tên nào rồi
    // cũng có ngày được "tiện thể" điền bằng tên một em.
    expect(thanChuong()).not.toMatch(/displayName/);
  });

  it("PendingWorkItem có ĐÚNG năm trường, và không trường nào là một con người", () => {
    expect(Object.keys(PendingWorkItem.shape).sort()).toEqual([
      "count",
      "href",
      "key",
      "label",
      "tone",
    ]);
  });

  it("hợp đồng TỰ CẮT trường lạ — kể cả khi router lỡ nhét thêm", () => {
    // Đây là hàng rào thứ hai, chạy lúc THI HÀNH chứ không phải lúc biên dịch: `z.object`
    // mặc định BỎ khoá không khai báo, và router luôn đi qua `GetPendingWorkOutput.parse`.
    // Nên một trường `studentName` lọt vào object literal trong router vẫn không ra được
    // tới trình duyệt — nó bị cắt ở đúng biên hợp đồng.
    const ra = GetPendingWorkOutput.parse({
      asOfDate: "2026-08-06",
      items: [
        {
          key: "homeroom.help_requests",
          label: "Lời cần gặp chưa xử",
          count: 1,
          href: "/gvcn",
          tone: "urgent",
          studentName: "Lê Minh An",
          studentCode: "VA-2026-00417",
        },
      ],
    });
    expect(JSON.stringify(ra)).not.toContain("Lê Minh An");
    expect(JSON.stringify(ra)).not.toContain("VA-2026-");
    expect(Object.keys(ra.items[0]!).sort()).toEqual(["count", "href", "key", "label", "tone"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("hình dạng mà chuông không được phép có", () => {
  it("count = 0 bị hợp đồng từ chối — không có mục 'không có việc nào'", () => {
    // Một chuông luôn hiện bốn dòng, ba dòng là số 0, đọc thành bốn việc — đó chính là
    // cái chuông đã bị gỡ khỏi trang chủ ngày 31/07/2026. Luật nằm ở hợp đồng chứ không ở
    // một nhánh `if` trong màn hình, để mọi client đều chịu chung một luật.
    const ok = PendingWorkItem.safeParse({
      key: "x",
      label: "Một việc",
      count: 0,
      href: "/gvcn",
      tone: "normal",
    });
    expect(ok.success).toBe(false);
  });

  it("href phải là đường trong Hub, không phải một liên kết ra ngoài", () => {
    for (const xau of ["https://vi-du.example/gvcn", "gvcn", ""]) {
      expect(PendingWorkItem.safeParse({
        key: "x",
        label: "Một việc",
        count: 1,
        href: xau,
        tone: "normal",
      }).success, xau).toBe(false);
    }
  });

  it("chỉ hai mức, và `urgent` không được nhân bản dưới một tên khác", () => {
    expect(PendingWorkTone.options).toEqual(["urgent", "normal"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("không mục nào dẫn tới một màn chưa tồn tại", () => {
  /**
   * Mọi chuỗi `href: "/..."` trong router phải trỏ tới một route có thật.
   *
   * Đây là điều kiện brief thiết kế 06/08 mục 1 đặt ra cho chính cái chuông này: không
   * affordance giả — không ô tìm kiếm không tìm được gì, không nút dẫn tới màn chưa có.
   * Kiểm bằng hệ thống tệp chứ không bằng một danh sách chép tay: danh sách chép tay sẽ
   * đúng đúng một lần, vào ngày người ta viết nó.
   */
  it("mọi href trong router đều có `page.tsx` tương ứng trong apps/hub/app", () => {
    const hrefs = [...doc(ROUTER).matchAll(/href:\s*"(\/[^"]*)"/g)].map((m) => m[1] as string);
    expect(hrefs.length, "không tìm thấy href nào trong router — regex hỏng?").toBeGreaterThan(0);
    for (const h of hrefs) {
      const p = join(repoRoot, "apps/hub/app", h, "page.tsx");
      expect(existsSync(p), `href "${h}" không có màn tương ứng (${p})`).toBe(true);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("hai giọng, không trộn (§8 brief thiết kế)", () => {
  /**
   * Từ vựng vận hành CHỈ được xuất hiện ở buồng lái, tâm lý cụm, điều hành. Nhãn của học
   * sinh và phụ huynh mà lọt một chữ trong đám này là vi phạm một ràng buộc ĐẠO ĐỨC, không
   * phải một lỗi văn phong (brief mục 1).
   *
   * Cách kiểm: lấy nguyên khối `them(items, {...})` nằm sau mỗi `roles.has("student")` /
   * `roles.has("guardian")` trong router và soi chữ trong đó. Quét cả file thì vô nghĩa —
   * nhãn của GVCN được phép (và phải) dùng đúng những chữ này.
   */
  const VAN_HANH = /\bcờ\b|\bngưỡng\b|leo thang|định mức|\bGVCN\b|chủ nhiệm|\bca\b|hồ sơ chăm sóc/i;

  // NHÁNH `student` KHÔNG CÒN TỒN TẠI từ 21/08/2026 — và đó là một quyết định, không
  // phải một chỗ sót. Mục chuông duy nhất của học sinh là "Hôm nay chưa check-in", mà
  // từ ADR-036 bản popup thì em chưa khai tâm trạng đang bị popup khoá app chặn ngay
  // trước mặt: một dòng chuông nhắc lại việc em không thể tránh khỏi là tiếng ồn.
  //
  // Bài kiểm KHÔNG bỏ vai `student` khỏi danh sách: nó chạy phép soi CHỈ KHI nhánh có
  // mặt. Ngày ai đó thêm lại một mục chuông cho học sinh, luật giọng nói tự có hiệu lực
  // trở lại mà không cần ai nhớ sửa file này.
  it("nhánh `student` vắng mặt CÓ CHỦ Ý — chuông của em rỗng vì popup đã hỏi rồi", () => {
    expect(doc(ROUTER).indexOf('roles.has("student")')).toBe(-1);
  });

  for (const vai of ["student", "guardian"] as const) {
    it(`nhãn của vai \`${vai}\` không mang từ vựng vận hành`, () => {
      const src = doc(ROUTER);
      const moc = src.indexOf(`roles.has("${vai}")`);
      // Nhánh vắng mặt thì không có nhãn nào để soi — và ca đó đã có bài kiểm riêng ngay
      // trên, nên ở đây thoát ra chứ không đỏ. `guardian` vẫn phải có mặt.
      if (moc < 0) {
        expect(vai, `vai ${vai} phải có nhánh trong router`).toBe("student");
        return;
      }
      const khoi = src.slice(moc, src.indexOf("}", src.indexOf("href:", moc)));
      const nhan = /label:\s*"([^"]*)"/.exec(khoi)?.[1] ?? "";
      expect(nhan.length, `nhánh ${vai} không có nhãn nào`).toBeGreaterThan(0);
      expect(VAN_HANH.test(nhan), `nhãn "${nhan}" của vai ${vai} mang từ vựng vận hành`).toBe(false);
      // 2-5 từ (brief mục 5): nhãn dài là một câu, và câu trên chuông là chữ thừa.
      const soTu = nhan.trim().split(/\s+/).length;
      expect(soTu, `nhãn "${nhan}" dài ${soTu} từ`).toBeLessThanOrEqual(5);
      expect(soTu, `nhãn "${nhan}" ngắn quá`).toBeGreaterThanOrEqual(2);
    });
  }
});
