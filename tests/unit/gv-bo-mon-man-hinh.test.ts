// tests/unit/gv-bo-mon-man-hinh.test.ts — cổng canh màn "Lớp tôi dạy" (vai `teacher`).
//
// ═══════════════════════════════════════════════════════════════════════════
// MỘT LUẬT, VÀ NÓ LÀ LUẬT VỀ THỨ KHÔNG ĐƯỢC CÓ
// ═══════════════════════════════════════════════════════════════════════════
// Màn của giáo viên bộ môn KHÔNG được nhắc tới tâm trạng, cờ chăm sóc, hay lời "cần gặp
// thầy cô". Đây không phải một sở thích trình bày:
//
//   · `mood` — `core.can_read_mood()` = `is_me ∨ in_my_cluster` (0044, ADR-026). Đo dưới
//     phiên Thầy Nam 06/08/2026: `select mood from attendance.checkins` → 42501.
//   · `care.flags` — `core.can_see_care()` = homeroom ∨ cụm. Không có nhánh `teaches`.
//     Đo: 0 dòng.
//   · `attendance.help_requests` — `help_requests_scope` (0037). Đo: 0 dòng.
//     PRODUCT.md: "Bạn cùng lớp, **thầy cô dạy môn**, thầy cô lớp khác, bố mẹ, BGH: không."
//
// VÌ SAO PHẢI LÀ MỘT CỔNG QUÉT NGUỒN chứ không phải tin vào hợp đồng: hai trong ba thứ
// trên hỏng CÂM. Nối `mood` vào câu SQL thì Postgres ném 42501 và cả màn chết — ai cũng
// thấy. Nhưng nối một LEFT JOIN sang `care.flags` hoặc `attendance.help_requests` thì
// không có lỗi nào cả: RLS trả 0 dòng, màn hình vẽ một ô trống, và ô trống ấy đọc thành
// "em này không có gì". Đúng hình dạng "im lặng bị đọc thành kết luận" mà RULES Rev F
// điều 8 cấm — và nó sẽ sống rất lâu vì không có gì kêu lên.
//
// Bài này quét mã nguồn ĐÃ BỎ CHÚ THÍCH. Bắt buộc, cùng lý do với giong-noi.test.ts:
// chính các file đó kể lại lý do bằng tên của thứ bị cấm (`mood`, `care.flags`,
// `help_requests`) trong chú thích, để lần sau không ai nối lại. Quét cả chú thích thì
// cách "sửa" test duy nhất là xoá lời giải thích — test tự phá thứ nó bảo vệ.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAN_HINH, manChoMenu, manChoTab, timMan } from "@/lib/man-hinh";
import {
  GetTeachingRosterOutput,
  TeachingClass,
  TeachingRosterEntry,
} from "@hub/core/contracts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function boChuThich(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
const doc = (rel: string) => boChuThich(readFileSync(join(repoRoot, rel), "utf8"));

const MAN = "apps/hub/components/gv-bo-mon/teaching-view.tsx";
const TRANG = "apps/hub/app/lop-toi-day/page.tsx";
const ROUTER = "apps/hub/server/routers/teaching.ts";
const HOP_DONG = "packages/core/contracts/teaching.ts";

/**
 * Ba nhóm từ khoá, viết bằng biểu thức thay vì chuỗi trần để không bắt nhầm những từ
 * tiếng Anh vô hại (`moody`, `careful`, `healthcare`).
 */
const CAM: Array<[string, RegExp]> = [
  ["mood / tâm trạng", /\bmood\b|\bmoods\b|tâm trạng|cảm xúc/i],
  ["care / cờ chăm sóc", /\bcare\b|care\.|\bflags?\b|\bhasOpenCase\b|hồ sơ chăm sóc|cờ chăm sóc/i],
  ["help request / cần gặp thầy cô", /help_?requests?\b|\bhelpPending\b|cần gặp thầy cô/i],
];

describe("màn của giáo viên bộ môn không nhắc tới ba vùng bị chặn", () => {
  for (const file of [MAN, TRANG]) {
    it.each(CAM)(`${file} — không có %s`, (_ten, mau) => {
      const hits = doc(file).match(new RegExp(mau.source, mau.flags.includes("g") ? mau.flags : mau.flags + "g")) ?? [];
      expect(hits, `${file} còn nhắc: ${hits.join(", ")}`).toEqual([]);
    });
  }

  it("router cũng không chọn cột/bảng nào trong ba vùng đó", () => {
    // Router được quét RIÊNG và chỉ ở phần MÃ, vì chú thích của nó cố ý kể tên cả ba
    // bảng (đó là nơi ghi lại phép đo). `boChuThich` đã cắt chú thích, nên phần còn lại
    // là câu SQL thật.
    const src = doc(ROUTER);
    expect(src, "router chọn cột mood").not.toMatch(/\bmood\b/i);
    expect(src, "router đọc care.*").not.toMatch(/\bcare\.[a-z_]+/i);
    expect(src, "router đọc help_requests").not.toMatch(/help_requests/i);
  });

  it("hợp đồng KHÔNG mang một trường nào của ba vùng đó", () => {
    // Kiểm bằng chính schema zod chứ không bằng kiểu TypeScript: kiểu biến mất lúc chạy,
    // schema thì không. Đây cũng là hình dạng mà tests/db khẳng định lại trên dữ liệu thật.
    const truong = Object.keys(TeachingRosterEntry.shape);
    expect(truong.sort()).toEqual(["fullName", "status", "studentCode", "studentId"]);
    for (const xau of ["mood", "helpPending", "hasOpenCase", "flag", "care"]) {
      expect(truong.filter((t) => t.toLowerCase().includes(xau.toLowerCase())), `còn trường ${xau}`).toEqual([]);
    }
  });

  it("hợp đồng đếm 'vắng' và 'chưa điểm danh' bằng HAI trường riêng (QĐ-3)", () => {
    // Gộp hai con số này — hoặc để màn hình tự trừ ra con số thứ hai — là cách một lớp
    // chưa ai điểm danh hiện ra như một lớp vắng cả lớp.
    const truong = Object.keys(TeachingClass.shape);
    expect(truong).toContain("absentCount");
    expect(truong).toContain("noRecordCount");
    expect(truong).toContain("recordedCount");
  });
});

describe("bản khai màn khớp hàng rào thật của trang", () => {
  // tests/unit/man-hinh.test.ts đã đối chiếu bản khai với câu redirect cho MỌI màn. Ở đây
  // chỉ ghim thêm những gì riêng của màn này, để đổi một trong hai chỗ là đỏ ngay.
  const man = timMan("/lop-toi-day");

  it("khai đúng hai vai teacher + homeroom", () => {
    expect(man, "chưa khai màn /lop-toi-day trong lib/man-hinh.ts").toBeTruthy();
    expect((man!.vai as string[]).slice().sort()).toEqual(["homeroom", "teacher"]);
  });

  it("trang chặn đúng hai vai đó, không rộng hơn", () => {
    const src = doc(TRANG);
    expect(src).toMatch(/session\.roles\.includes\("teacher"\)/);
    expect(src).toMatch(/session\.roles\.includes\("homeroom"\)/);
    expect(src).toMatch(/redirect\("\/home"\)/);
  });

  it("giáo viên bộ môn có đường tới màn này ở CẢ menu trái lẫn thanh tab điện thoại", () => {
    // Vế thứ hai là vế dễ mất nhất, và đã mất thật một lần: cô Mai mở Hub trên máy tính
    // thấy hộp việc tâm lý, mở trên ĐIỆN THOẠI — thiết bị chính theo §3 — thì không thấy
    // đâu cả. Giáo viên bộ môn không có buồng lái nào để đi vòng, nên mất tab là màn này
    // chỉ sống trên máy tính.
    expect(manChoMenu(["teacher"]).map((m) => m.href)).toContain("/lop-toi-day");
    expect(manChoTab(["teacher"]).map((m) => m.href)).toContain("/lop-toi-day");
  });

  it("thanh tab của GVCN KHÔNG mọc thêm mục này (trần 4 ô, §6)", () => {
    // Bề mặt tab khai `vai: ["teacher"]` có chủ ý: GVCN vẫn tới được lớp mình qua buồng
    // lái, và thanh tab của họ đang có 3 ô — thêm ô thứ tư là chạm trần, không còn chỗ
    // cho màn GVCN tiếp theo.
    expect(manChoTab(["homeroom"]).map((m) => m.href)).not.toContain("/lop-toi-day");
    expect(manChoTab(["homeroom"]).length).toBeLessThanOrEqual(4);
    // Menu trái thì VẪN phải có: GVCN kiêm dạy môn ở lớp khác cần đường tới đó.
    expect(manChoMenu(["homeroom"]).map((m) => m.href)).toContain("/lop-toi-day");
  });

  it("không vai nào ngoài hai vai đó thấy mục này", () => {
    for (const vai of ["student", "guardian", "counselor", "principal", "board", "admin"] as const) {
      expect(manChoMenu([vai]).map((m) => m.href), `vai ${vai}`).not.toContain("/lop-toi-day");
      expect(manChoTab([vai]).map((m) => m.href), `vai ${vai}`).not.toContain("/lop-toi-day");
    }
  });

  it("mã màn duy nhất trong bản khai", () => {
    expect(MAN_HINH.filter((m) => m.key === "teaching")).toHaveLength(1);
  });
});

describe("màn không hứa một hành động mà máy chủ sẽ từ chối", () => {
  const src = doc(MAN);

  it("KHÔNG có mutation nào — giáo viên bộ môn chưa có quyền ghi điểm danh", () => {
    // `checkins_insert_by_homeroom` / `checkins_update_by_homeroom` (0030/0032) chỉ nhận
    // GVCN. Một nút ghi ở đây là hứa suông, hoặc là một lần mở quyền lén qua cửa dựng màn.
    expect(src, "màn có useMutation").not.toMatch(/useMutation/);
    expect(doc(ROUTER), "router có .mutation(").not.toMatch(/\.mutation\(/);
  });

  it("chỉ gọi đúng hai thủ tục của router teaching", () => {
    const goi = [...src.matchAll(/trpc\.([a-zA-Z.]+)\.useQuery/g)].map((m) => m[1]);
    expect(goi.sort()).toEqual(["teaching.getMyClasses", "teaching.getRoster"]);
  });
});

describe("QĐ-3 và §11 trên chính màn này", () => {
  const src = doc(MAN);

  it("icon và nhãn trạng thái lấy từ contract, không chế lại", () => {
    // Hai màn của cùng một người vẽ cùng một dữ liệu bằng hai bảng icon là lỗi đã xảy ra
    // thật (01/08/2026 — lịch trong hồ sơ em gộp `late` với `queued_late`).
    expect(src).toMatch(/ATTENDANCE_STATUS_ICON/);
    expect(src).toMatch(/ATTENDANCE_STATUS_LABEL/);
    expect(src).toMatch(/ATTENDANCE_UNKNOWN_ICON/);
    expect(src).toMatch(/ATTENDANCE_UNKNOWN_LABEL/);
  });

  it("dùng AttendanceBadge — nơi status=null được vẽ thành 'Chưa điểm danh', không phải 'Vắng'", () => {
    expect(src).toMatch(/<AttendanceBadge\b/);
  });

  it("dựng MỘT nhánh theo khổ màn, không dựng hai rồi ẩn bằng CSS", () => {
    expect(src).toContain("useIsDesktop()");
    expect(src).toContain("{!isDesktop && (");
    expect(src).toContain("{isDesktop && (");
    expect(src, "còn nhánh ẩn bằng CSS").not.toMatch(/md:hidden/);
  });

  it("bảng chỉ dựng ở khổ máy tính — điện thoại không phải kéo ngang", () => {
    // Cửa sổ 300 ký tự ngược lên: đủ trùm khối chú thích + dòng `{isDesktop && (` ngay
    // trên thẻ <table>. Đo thô, nhưng sai theo chiều AN TOÀN — nếu ai đó đẩy bảng ra
    // ngoài nhánh desktop thì cửa sổ không còn chứa `isDesktop` và bài này đỏ.
    const i = src.indexOf("min-w-[420px]");
    expect(i, "không tìm thấy bảng desktop").toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, i - 300), i)).toContain("{isDesktop && (");
  });

  it("không mã hex mới trong màn — chỉ token (DESIGN.md, luật một dòng cho màu chữ)", () => {
    // Ngoại lệ DUY NHẤT là viền giữa hai dòng bảng, chép nguyên từ class-roster-view.tsx
    // để hai bảng của hai vai không kẻ hai kiểu. Nó là giá trị của token `chip`; ghi tên
    // ra đây thay vì bỏ qua cả luật.
    // ĐỔI 24/08/2026 cùng lượt chuyển giao diện tối: token `chip` #F1F4F8 -> #12244A.
    const hex = [...src.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0].toUpperCase());
    expect([...new Set(hex)]).toEqual(["#12244A"]);
  });
});

describe("hợp đồng nói ra được cả ngày mà bốn con số thuộc về", () => {
  it("getRoster trả asOfDate, không để màn hình đoán", () => {
    expect(Object.keys(GetTeachingRosterOutput.shape)).toContain("asOfDate");
  });
});
