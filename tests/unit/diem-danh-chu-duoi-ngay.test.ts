// tests/unit/diem-danh-chu-duoi-ngay.test.ts — nghiệm thu gói "tuong-phan-man-hoc-sinh".
//
// Lỗi được khoá ở đây là lỗi do CHÍNH gói đó tạo ra khi tách `DayNote` khỏi lưới tuần
// của /diem-danh, và nó sống sót qua tsc + toàn bộ vitest + grep chuỗi trong chunk:
//
//     const note = style?.note ?? "chưa rõ";
//
// `present` cố ý mang `note: null` để ngày có mặt KHÔNG có chữ (giờ check-in đã nói đủ).
// Nhưng `??` nhận cả `null`, nên nhánh "cố ý im" rơi thẳng vào nhánh "không đọc được":
// mọi ngày có mặt in ra chữ "chưa rõ" ngay dưới giờ check-in. Dữ liệu demo của Minh là
// 5/5 ngày `present` — tức lưới tuần của màn chính sẽ nói "chưa rõ" trọn tuần, đúng cái
// màn mà gói này nhận việc làm cho rõ nghĩa hơn.
//
// Vì sao không ai thấy: hôm đó `.next/static/chunks/app-pages-internals.js` mất trên đĩa
// nên React không hydrate, mọi trang đứng ở "Đang tải…". Cả gói chỉ nghiệm thu được bằng
// mã nguồn và bằng chuỗi trong chunk đã biên dịch — mà chuỗi "chưa rõ" thì CÓ thật trong
// chunk và trông hoàn toàn đúng. Đây là lý do bài test dưới đây tồn tại: nó hỏi hàm chứ
// không hỏi sự có mặt của một chuỗi.
//
// Mệnh đề phải giữ vĩnh viễn: "không có chữ" và "chưa rõ" là HAI câu trả lời khác nhau,
// và không bao giờ được phép hoán đổi cho nhau.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ATTENDANCE_STATUS_LABEL } from "@hub/core/contracts";
import { dayNoteText } from "@/components/attendance-view";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const viewSource = readFileSync(
  join(repoRoot, "apps", "hub", "components", "attendance-view.tsx"),
  "utf8",
);

/** Bỏ chú thích trước khi quét — chính file trên kể lại lỗi cũ bằng chú thích. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:@\w])\/\/.*$/gm, "$1");
}

describe("dayNoteText — chữ ngắn dưới mỗi ngày trong lưới tuần", () => {
  it("ngày CÓ MẶT không có chữ, và tuyệt đối không bị gọi là 'chưa rõ'", () => {
    // Đây là bài bắt đúng lỗi `??`. Nếu ai viết lại thành `style?.note ?? "chưa rõ"`,
    // dòng này đỏ ngay.
    expect(dayNoteText("present")).toBeNull();
  });

  it("ngày chưa có dữ liệu thì không vẽ gì — im lặng ở đây là đúng", () => {
    // Vòng tròn nét đứt của lưới tuần đã nói việc này rồi; thêm chữ là nói hai lần.
    expect(dayNoteText(null)).toBeNull();
  });

  it("bốn trạng thái không-phải-có-mặt đều có chữ riêng, không trùng nhau", () => {
    // Lỗi gốc mà gói này đi sửa: 'late'/'queued_late' từng được vẽ y hệt 'present'.
    // Ràng buộc mạnh nhất là các câu này phải PHÂN BIỆT ĐƯỢC với nhau.
    const notes = ["late", "queued_late", "absent", "excused"].map((s) => dayNoteText(s));
    expect(notes).toEqual(["đi muộn", "chờ xác nhận", "vắng", "có phép"]);
    expect(new Set(notes).size).toBe(4);
  });

  it("trạng thái LẠ nói thẳng là chưa rõ — không im, cũng không đoán thành có mặt", () => {
    // Schema đi trước giao diện là chuyện bình thường. Cái không bình thường là để một
    // trạng thái chưa ai vẽ rơi vào nhánh đẹp nhất.
    expect(dayNoteText("tam_nghi_hoc")).toBe("chưa rõ");
    expect(dayNoteText("")).toBeNull(); // chuỗi rỗng = không có dữ liệu, không phải trạng thái lạ
  });

  it("mọi trạng thái trong contract đều được bảng DAY_MARK vẽ — không sót nhánh nào", () => {
    // Nếu contract thêm trạng thái thứ sáu mà giao diện quên, bài này đỏ trước khi trẻ
    // nhìn thấy dấu "chưa rõ" trên màn.
    for (const status of Object.keys(ATTENDANCE_STATUS_LABEL)) {
      expect(
        dayNoteText(status),
        `trạng thái '${status}' có trong contract nhưng DAY_MARK chưa vẽ`,
      ).not.toBe("chưa rõ");
    }
  });

  it("không còn chỗ nào trong file trộn note với `??`", () => {
    // Bài quét nguồn: `??` trên một giá trị mà `null` MANG NGHĨA thì luôn là bẫy, kể cả
    // khi hôm nay nó chưa gây hại.
    const source = withoutComments(viewSource);
    expect(source).not.toMatch(/\.note\s*\?\?/);
    expect(source).not.toMatch(/note\s*\?\?\s*["']chưa rõ["']/);
  });
});
