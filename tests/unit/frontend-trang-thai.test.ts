// tests/unit/frontend-trang-thai.test.ts — gói "frontend-trang-thai".
//
// Bốn nhóm luật được khoá ở đây, tất cả đều là lỗi ĐÃ XẢY RA trên bản chạy được:
//
//  1. Trạng thái tải/lỗi/rỗng: phân loại lỗi phải đúng, vì nó quyết định câu nói
//     với người dùng VÀ quyết định có nên mời "Thử lại" hay không.
//  2. Check-in offline: chỉ được cất vào hàng đợi những lỗi CÓ THỂ tự khỏi. Cất
//     nhầm một lỗi 401 vào đó là báo thành công giả rồi kẹt hàng đợi vĩnh viễn —
//     mất check-in thật của học sinh.
//  3. Thẻ cờ ở buồng lái GVCN: màu KHÔNG được là tín hiệu duy nhất.
//  4. Quét mã nguồn: không màn hình nào được viết chết mã lớp, và không màn hình
//     nào được truyền vai giả cho sidebar. Hai lỗi này không làm hỏng typecheck,
//     không làm hỏng build — chỉ hỏng khi một GVCN lớp khác đăng nhập thật.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  friendlyErrorMessage,
  httpStatusOf,
  isNetworkError,
  isRetryableError,
  isSessionExpired,
} from "@/components/ui/query-state";
import { classLabel, personName } from "@/components/ui/labels";
import { shouldQueueOffline } from "@/components/checkin-view";
import { describeFlag, readNumber, urgencyPresentation } from "@/components/gvcn-dashboard";
import { statState } from "@/components/home-view";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const componentsDir = join(repoRoot, "apps", "hub", "components");

/** Dựng một lỗi giống hệt lỗi tRPC thật ở client: mã + httpStatus nằm trong `data`. */
function trpcError(code: string, httpStatus: number, message = "Lỗi từ máy chủ"): unknown {
  return { message, data: { code, httpStatus } };
}
/** Lỗi mạng: fetch ném ra TRƯỚC khi có phản hồi nào — không có `data`. */
const networkError = { message: "Failed to fetch" };

describe("phân loại lỗi cho trạng thái màn hình", () => {
  it("đọc được httpStatus của lỗi tRPC, và null khi không có", () => {
    expect(httpStatusOf(trpcError("UNAUTHORIZED", 401))).toBe(401);
    expect(httpStatusOf(networkError)).toBeNull();
    expect(httpStatusOf(null)).toBeNull();
    expect(httpStatusOf("chuỗi bất kỳ")).toBeNull();
  });

  it("lỗi không có phản hồi từ máy chủ được coi là lỗi mạng", () => {
    expect(isNetworkError(networkError)).toBe(true);
    expect(isNetworkError(trpcError("INTERNAL_SERVER_ERROR", 500))).toBe(false);
  });

  it("mất mạng thì nói về mạng, không lặp lại câu tiếng Anh của trình duyệt", () => {
    const message = friendlyErrorMessage(networkError);
    expect(message).toContain("mạng");
    expect(message).not.toContain("Failed to fetch");
  });

  it("có câu tiếng Việt từ máy chủ thì dùng đúng câu đó", () => {
    // errorFormatter (server/trpc.ts) đã viết sẵn tiếng Việt và đã che lỗi nội bộ
    // bằng mã sự cố — client dịch lại sẽ làm mất chi tiết đúng ("chờ 12 giây").
    expect(friendlyErrorMessage(trpcError("TOO_MANY_REQUESTS", 429, "Em chờ 12 giây rồi thử lại nhé."))).toBe(
      "Em chờ 12 giây rồi thử lại nhé.",
    );
  });

  it('chỉ mời "Thử lại" với lỗi có thể tự khỏi', () => {
    expect(isRetryableError(networkError)).toBe(true);
    expect(isRetryableError(trpcError("INTERNAL_SERVER_ERROR", 500))).toBe(true);
    expect(isRetryableError(trpcError("TOO_MANY_REQUESTS", 429))).toBe(true);
    // Bấm "Thử lại" với 401/403 chỉ làm người dùng bấm mãi vào một cánh cửa khoá.
    expect(isRetryableError(trpcError("UNAUTHORIZED", 401))).toBe(false);
    expect(isRetryableError(trpcError("FORBIDDEN", 403))).toBe(false);
    expect(isRetryableError(trpcError("BAD_REQUEST", 400))).toBe(false);
  });

  it("nhận ra hết phiên qua cả httpStatus lẫn code", () => {
    expect(isSessionExpired(trpcError("UNAUTHORIZED", 401))).toBe(true);
    expect(isSessionExpired({ data: { code: "UNAUTHORIZED" } })).toBe(true);
    expect(isSessionExpired(trpcError("FORBIDDEN", 403))).toBe(false);
    expect(isSessionExpired(networkError)).toBe(false);
  });
});

describe("statState — ba trạng thái của một con số trên trang chủ", () => {
  it("không gộp 'đang tải' và 'hỏng' thành cùng một kết quả", () => {
    expect(statState({ isPending: true, isError: false })).toBe("loading");
    expect(statState({ isPending: false, isError: true })).toBe("error");
    expect(statState({ isPending: false, isError: false })).toBe("ready");
  });
});

describe("check-in: lỗi nào được cất vào hàng đợi offline", () => {
  it("cất lỗi có thể tự khỏi khi có mạng lại", () => {
    expect(shouldQueueOffline(networkError)).toBe(true);
    expect(shouldQueueOffline(trpcError("INTERNAL_SERVER_ERROR", 500))).toBe(true);
    expect(shouldQueueOffline(trpcError("TIMEOUT", 408))).toBe(true);
    expect(shouldQueueOffline(trpcError("TOO_MANY_REQUESTS", 429))).toBe(true);
  });

  it("KHÔNG cất lỗi vĩnh viễn — đó là báo thành công giả rồi kẹt hàng đợi", () => {
    // flushQueuedCheckins() `break` ngay khi gặp lỗi, nên một item hỏng vĩnh viễn
    // chặn luôn MỌI check-in xếp sau nó. Với em đang cần giúp, im lặng bị buồng lái
    // GVCN đọc thành "em ổn" — đúng điều Rev F điều 8 (RULES.md) cấm.
    expect(shouldQueueOffline(trpcError("UNAUTHORIZED", 401))).toBe(false);
    expect(shouldQueueOffline(trpcError("FORBIDDEN", 403))).toBe(false);
    expect(shouldQueueOffline(trpcError("BAD_REQUEST", 400))).toBe(false);
  });
});

describe("thẻ cờ buồng lái GVCN — màu không được là tín hiệu duy nhất", () => {
  it("hai mức khẩn khác nhau ở CẢ chữ lẫn icon, không chỉ ở màu viền", () => {
    const urgent = urgencyPresentation({ ruleCode: "E_URGENT" });
    const watch = urgencyPresentation({ ruleCode: "E_MOOD" });

    expect(urgent.level).toBe("urgent");
    expect(watch.level).toBe("watch");
    // Quyết định chủ đầu tư: GIỮ viền màu làm tín hiệu lớn nhất…
    expect(urgent.borderClass).not.toBe(watch.borderClass);
    // …nhưng người không phân biệt được màu vẫn phải đọc ra mức độ.
    expect(urgent.label).not.toBe(watch.label);
    expect(urgent.icon).not.toBe(watch.icon);
    expect(urgent.label.length).toBeGreaterThan(0);
    expect(watch.label.length).toBeGreaterThan(0);
  });

  it("mã rule lạ rơi về mức 'cần để ý', không rơi vào khoảng trống", () => {
    expect(urgencyPresentation({ ruleCode: "B_HOC_TAP" }).level).toBe("watch");
  });

  it("đọc số trong detail an toàn (contract khai là unknown)", () => {
    expect(readNumber({ negativeDays: 3 }, "negativeDays")).toBe(3);
    expect(readNumber({ negativeDays: "5" }, "negativeDays")).toBe(5);
    expect(readNumber({ negativeDays: null }, "negativeDays")).toBeNull();
    expect(readNumber({}, "negativeDays")).toBeNull();
  });

  it("mô tả cờ ghép đúng hai tín hiệu, không in 'undefined ngày'", () => {
    expect(describeFlag({ helpRequested: true, negativeDays: 3 })).toContain("cần gặp thầy cô");
    expect(describeFlag({ helpRequested: true, negativeDays: 3 })).toContain("3 ngày");
    // Bấm nút nhưng chưa có chuỗi mood xấu: không được đẻ ra "+ mood ... undefined ngày".
    expect(describeFlag({ helpRequested: true })).toBe("Đã bấm “cần gặp thầy cô”");
    expect(describeFlag({ helpRequested: false, negativeDays: 5 })).toContain("5 ngày");
    expect(describeFlag({})).not.toContain("undefined");
  });
});

describe("ui/labels — không bịa mã lớp", () => {
  it("có lớp thì thêm tiền tố, không có thì trả rỗng để nơi gọi bỏ hẳn dòng", () => {
    expect(classLabel("6A2")).toBe("Lớp 6A2");
    expect(classLabel("  6A2  ")).toBe("Lớp 6A2");
    expect(classLabel(null)).toBe("");
    expect(classLabel(undefined)).toBe("");
    expect(classLabel("   ")).toBe("");
  });

  it("bỏ hậu tố chức danh khi cần gọi tên người", () => {
    expect(personName("Cô Lan (GVCN 6A1)")).toBe("Cô Lan");
    expect(personName("Cô Lan")).toBe("Cô Lan");
    expect(personName(null)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Quét mã nguồn. Hai lỗi dưới đây không làm hỏng typecheck và không làm hỏng
// build — chúng chỉ hỏng khi một người thật đăng nhập, nên phải chặn bằng test.
// ---------------------------------------------------------------------------
const SCREEN_FILES = [
  "home-view.tsx",
  "gvcn-dashboard.tsx",
  "attendance-view.tsx",
  "profile-view.tsx",
  "this-week-view.tsx",
  "help-request-view.tsx",
  "growth-report-view.tsx",
];

/**
 * Đọc mã nguồn màn hình, ĐÃ BỎ chú thích.
 *
 * Bắt buộc phải bỏ: các file này ghi lại chính lỗi cũ trong chú thích đầu file
 * (`role="student"` viết cứng, chuỗi "Lớp 6A1", khối "tối ưu cho máy tính") để lần
 * sau không ai sửa ngược lại. Quét cả chú thích thì test sẽ chặn đúng phần tài liệu
 * giải thích vì sao không được làm thế — và cách "sửa" duy nhất là xoá lời giải
 * thích đi, tức là test tự phá thứ nó bảo vệ.
 */
function readScreen(file: string): string {
  return readFileSync(join(componentsDir, file), "utf8")
    // Khối /* … */ (gồm cả chú thích JSX {/* … */}).
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Dòng // …, nhưng KHÔNG cắt "https://" hay "@/components/…".
    .replace(/(^|[^:@\w])\/\/.*$/gm, "$1");
}

describe("quét mã nguồn màn hình chính", () => {
  it.each(SCREEN_FILES)("%s không viết chết mã lớp", (file) => {
    const source = readScreen(file);
    // Bắt mọi dạng "Lớp 6A1", "lớp 7B3"… nằm trong chuỗi hiển thị. Mã lớp phải đến
    // từ dữ liệu (classCode / d.className / profile.classCode), không bao giờ từ code.
    const hardCoded = source.match(/[Ll]ớp\s+\d+[A-Za-z]\d*/g) ?? [];
    expect(hardCoded).toEqual([]);
  });

  it.each(SCREEN_FILES)("%s truyền vai thật cho HubSidebar, không phải role= cứng", (file) => {
    const source = readScreen(file);
    // `role="student"` / `role="teacher"` là nhánh tương thích cũ của HubSidebar:
    // nó gộp 8 vai thành 2, nên admin/hiệu trưởng/phụ huynh đều thấy menu GVCN.
    expect(source).not.toMatch(/role=["'](student|teacher)["']/);
  });

  it.each(SCREEN_FILES)("%s có nhánh trạng thái cho mọi truy vấn", (file) => {
    const source = readScreen(file);
    if (!source.includes(".useQuery(")) return;
    // Không cần đúng một cách viết, nhưng PHẢI có đọc trạng thái chờ và trạng thái
    // lỗi ở đâu đó — `{query.data && …}` trần là công thức của màn trắng vĩnh viễn.
    expect(source, `${file} thiếu nhánh đang tải`).toMatch(/isPending/);
    expect(source, `${file} thiếu nhánh lỗi`).toMatch(/\.error|isError/);
  });

  it("không màn hình nào còn khối 'tối ưu cho máy tính' mà không có đường ra", () => {
    for (const file of SCREEN_FILES) {
      const source = readScreen(file);
      if (!source.includes("tối ưu cho máy tính")) continue;
      // Câu đó chỉ được phép xuất hiện qua DesktopOnlyNotice — nơi duy nhất bảo đảm
      // có <Link href="/home"> và (với học sinh) tab bar.
      expect(source, `${file} tự vẽ khối chặn mobile thay vì dùng DesktopOnlyNotice`).toMatch(
        /DesktopOnlyNotice/,
      );
    }
  });
});
