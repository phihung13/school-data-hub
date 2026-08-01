// tests/unit/offline-queue.test.ts — gói "hang-doi-offline-khong-tac" (nợ #31).
//
// Ba mệnh đề được khoá ở đây. Cả ba đều là chuyện đã CHẠY THẬT trong bản dev, và cả ba
// đều thuộc cùng một họ lỗi: máy im lặng, còn im lặng thì bị đọc thành "em ổn".
//
//   1. MỘT BẢN GHI HỎNG KHÔNG ĐƯỢC CHẶN BẢN GHI SAU. Vòng lặp cũ `break` ngay lỗi đầu
//      tiên, nên một lượt check-in hỏng vĩnh viễn (401 vì phiên đã hết, 400 vì ngày quá
//      cũ) khoá luôn mọi lượt xếp sau — mãi mãi. Buồng lái của thầy cô không thấy tín
//      hiệu nào và đọc khoảng trống đó thành "em vẫn ổn".
//   2. LỖI TỰ KHỎI THÌ PHẢI Ở LẠI. Đối cực của mệnh đề 1: sửa quá tay thành "hỏng là
//      bỏ" thì mất đúng thứ hàng đợi sinh ra để giữ — lượt bấm của em lúc không có mạng.
//   3. 2xx KHÔNG BẰNG "ĐÃ GHI". Sau 0047 máy chủ có thể nhận lượt điểm danh mà KHÔNG
//      nhận mức tâm trạng (nhà em chưa có phiếu đồng ý). Hàng đợi cũ gọi `submit()` xong
//      là xoá ngay, không đọc `moodSaved` — đánh dấu "đã gửi" cho một giá trị không nằm
//      trong kho.
//
// Cộng thêm §9: flush hai lần (hai tab, hoặc sự kiện `online` bắn liên tiếp khi wifi
// chập chờn) không được gửi đôi.
//
// idb-keyval được thay bằng một Map trong bộ nhớ — vitest chạy môi trường "node"
// (vitest.config.ts) nên không có IndexedDB thật, và thứ đang kiểm là LUẬT của hàng đợi
// chứ không phải trình duyệt.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const memory = new Map<string, unknown>();

/**
 * Vì sao KHÔNG viết thẳng `vi.mock("idb-keyval", …)`:
 *
 * `idb-keyval` là phụ thuộc của apps/hub, mà pnpm không dựng liên kết cho nó ở gốc kho.
 * `vi.mock` phân giải tên gói theo VỊ TRÍ FILE TEST (tests/unit/…), nên tên trần ở đây
 * không phân giải ra gì cả — vitest bỏ qua trong im lặng và test chạy trên idb-keyval
 * THẬT, ngã ngay ở "indexedDB is not defined". Đã đo đúng như vậy lần chạy đầu tiên.
 *
 * Nên: phân giải từ apps/hub (đúng nơi mã sản phẩm import), lấy đường dẫn bản ESM mà
 * vite nạp, rồi `vi.doMock` theo đường dẫn tuyệt đối. `doMock` không bị nâng lên đầu file
 * nên phải đi kèm `await import(...)` ở dưới — đó là lý do module được nạp động.
 */
const requireFromHub = createRequire(new URL("../../apps/hub/package.json", import.meta.url));
const idbPkgPath = requireFromHub.resolve("idb-keyval/package.json");
const idbPkg = JSON.parse(readFileSync(idbPkgPath, "utf8")) as {
  exports?: { ["."]?: { import?: string; module?: string } };
  module?: string;
  main?: string;
};
// Đọc nhánh `exports["."].import` TRƯỚC `module`: idb-keyval trỏ `module` sang bản
// compat (dist/compat.js) trong khi vite nạp dist/index.js. Lấy nhầm nhánh là mock đăng
// ký cho một file KHÔNG ai import — và test lại chạy trên thư viện thật mà không báo gì.
const idbEntry =
  idbPkg.exports?.["."]?.import ?? idbPkg.exports?.["."]?.module ?? idbPkg.module ?? idbPkg.main ?? "./dist/index.js";
const idbEsmPath = join(dirname(idbPkgPath), idbEntry).replace(/\\/g, "/");

vi.doMock(idbEsmPath, () => ({
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => {
    memory.set(key, value);
  },
  del: async (key: string) => {
    memory.delete(key);
  },
  keys: async () => [...memory.keys()],
}));

const {
  clearFailedCheckin,
  enqueueCheckin,
  flushQueuedCheckins,
  listFailedCheckins,
  listQueuedCheckins,
} = await import("@/lib/offline-queue");

/** Lỗi tRPC thật ở client: mã + httpStatus nằm trong `data`. */
function trpcError(code: string, httpStatus: number, message = "Lỗi từ máy chủ"): unknown {
  return { message, data: { code, httpStatus } };
}
/** Lỗi mạng: fetch ném ra TRƯỚC khi có phản hồi nào — không có `data`. */
const networkError = { message: "Failed to fetch" };

/** Kết quả 2xx bình thường của `checkin.submitMood` (0047 có thêm hai cờ mood). */
const okResult = { moodSaved: true, moodBlockedReason: null };

/**
 * Xếp hai lượt check-in của HAI ngày khác nhau vào hàng đợi.
 *
 * Phải là hai ngày: `enqueueCheckin` cố ý giữ đúng một bản ghi cho mỗi ngày địa phương
 * (gói "checkin-trang-thai"), nên hai lần bấm cùng ngày cho ra MỘT bản ghi — không dựng
 * được cảnh "bản ghi sau bị bản ghi trước chặn".
 */
async function queueTwoDays() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 30, 7, 30)); // hôm kia: bản ghi sẽ hỏng vĩnh viễn
  await enqueueCheckin({ mood: 1, wantsHelp: false });
  vi.setSystemTime(new Date(2026, 6, 31, 7, 30)); // hôm sau: bản ghi phải đi được
  await enqueueCheckin({ mood: 4, wantsHelp: true });
  vi.useRealTimers();
}

beforeEach(() => {
  memory.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hàng đợi offline không tắc ở bản ghi hỏng đầu tiên (nợ #31)", () => {
  it("một bản ghi hỏng VĨNH VIỄN không chặn bản ghi xếp sau", async () => {
    await queueTwoDays();
    const sentMoods: number[] = [];
    const result = await flushQueuedCheckins(async (input) => {
      sentMoods.push(input.mood);
      // 401: phiên đã hết từ hôm kia. Gửi lại bao nhiêu lần cũng ra đúng lỗi này.
      if (input.mood === 1) throw trpcError("UNAUTHORIZED", 401, "Phiên đăng nhập đã hết hạn.");
      return okResult;
    });

    // Mệnh đề trung tâm: bản ghi thứ hai VẪN được gửi.
    expect(sentMoods).toEqual([1, 4]);
    expect(result.sent).toBe(1);
    // Và hàng đợi sạch hẳn — không còn gì nằm lại để tắc lần sau.
    expect(await listQueuedCheckins()).toEqual([]);
  });

  it("bản ghi hỏng vĩnh viễn RỜI hàng đợi nhưng để lại dấu vết em đọc được", async () => {
    // Hai đường sai đối xứng nhau, và test này chặn cả hai: giữ mãi (tắc hàng đợi) và
    // xoá im lặng (mất thao tác của em, không ai biết). Đường đúng là đường thứ ba.
    await queueTwoDays();
    await flushQueuedCheckins(async (input) => {
      if (input.mood === 1) throw trpcError("UNAUTHORIZED", 401, "Phiên đăng nhập đã hết hạn.");
      return okResult;
    });

    const failed = await listFailedCheckins();
    expect(failed).toHaveLength(1);
    expect(failed[0]?.mood).toBe(1);
    expect(failed[0]?.reason).toBe("loi-vinh-vien");
    // Màn hình cần cả hai thứ này để nói đúng câu: 401 thì mời đăng nhập lại, không mời
    // bấm lại vô ích; và câu tiếng Việt của máy chủ không bị nuốt.
    expect(failed[0]?.httpStatus).toBe(401);
    expect(failed[0]?.message).toBe("Phiên đăng nhập đã hết hạn.");
    // Mốc thời gian phải còn nguyên: không có nó thì màn hình chỉ nói được "một lần bấm
    // nào đó của con" — một lời xin lỗi mà em không biết là về lần nào.
    expect(failed[0]?.clientOccurredAt).toContain("2026-07-30");
  });

  it("400 (ngày quá cũ, resolve_checkin từ chối) cũng là hỏng vĩnh viễn", async () => {
    await queueTwoDays();
    const result = await flushQueuedCheckins(async (input) => {
      if (input.mood === 1) throw trpcError("BAD_REQUEST", 400, "Chưa ghi được lượt check-in này.");
      return okResult;
    });
    expect(result.sent).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(await listQueuedCheckins()).toEqual([]);
  });

  it("em đọc rồi mới được xoá dấu vết — không có đường nào khác dọn nó", async () => {
    await queueTwoDays();
    await flushQueuedCheckins(async (input) => {
      if (input.mood === 1) throw trpcError("FORBIDDEN", 403);
      return okResult;
    });
    const [failed] = await listFailedCheckins();
    expect(failed).toBeDefined();

    // Flush lần nữa: dấu vết KHÔNG được tự bốc hơi chỉ vì hàng đợi đã sạch.
    await flushQueuedCheckins(async () => okResult);
    expect(await listFailedCheckins()).toHaveLength(1);

    await clearFailedCheckin(failed!.clientId);
    expect(await listFailedCheckins()).toEqual([]);
  });
});

describe("lỗi tự khỏi thì bản ghi PHẢI ở lại chờ", () => {
  it("mất mạng: bản ghi còn nguyên trong hàng đợi, không có dấu vết hỏng nào", async () => {
    await queueTwoDays();
    const result = await flushQueuedCheckins(async () => {
      throw networkError;
    });

    expect(result.sent).toBe(0);
    expect(result.kept).toBe(2);
    expect(result.failed).toEqual([]);
    expect(await listQueuedCheckins()).toHaveLength(2);
    // Quan trọng không kém: KHÔNG báo cho em một lỗi chưa xảy ra. Mạng sẽ có lại.
    expect(await listFailedCheckins()).toEqual([]);
  });

  it("5xx / 429 cũng ở lại, và lần flush sau gửi được là xong", async () => {
    await queueTwoDays();
    await flushQueuedCheckins(async (input) => {
      if (input.mood === 1) throw trpcError("INTERNAL_SERVER_ERROR", 500);
      throw trpcError("TOO_MANY_REQUESTS", 429, "Em chờ 12 giây rồi thử lại nhé.");
    });
    expect(await listQueuedCheckins()).toHaveLength(2);

    const second = await flushQueuedCheckins(async () => okResult);
    expect(second.sent).toBe(2);
    expect(await listQueuedCheckins()).toEqual([]);
    expect(await listFailedCheckins()).toEqual([]);
  });
});

describe("2xx kèm moodSaved=false KHÔNG phải là đã ghi xong (0047)", () => {
  it("mức tâm trạng không vào kho thì không được đếm là đã gửi", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 31, 7, 30));
    await enqueueCheckin({ mood: 2, wantsHelp: false });
    vi.useRealTimers();

    const result = await flushQueuedCheckins(async () => ({
      moodSaved: false,
      moodBlockedReason: "chua_co_phieu_dong_y" as const,
    }));

    expect(result.sent).toBe(0);
    const failed = await listFailedCheckins();
    expect(failed).toHaveLength(1);
    expect(failed[0]?.reason).toBe("tam-trang-chua-duoc-ghi");
    // Rời hàng đợi (gửi lại cũng ra kết quả y hệt — thứ thiếu nằm ở phía người lớn),
    // nhưng KHÔNG im: em phải biết phần tâm trạng của mình không nằm trong kho.
    expect(await listQueuedCheckins()).toEqual([]);
  });

  it("moodSaved=true thì mới là gửi trọn vẹn, và không để lại dấu vết nào", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 31, 7, 30));
    await enqueueCheckin({ mood: 3, wantsHelp: false });
    vi.useRealTimers();

    const result = await flushQueuedCheckins(async () => okResult);
    expect(result.sent).toBe(1);
    expect(result.failed).toEqual([]);
    expect(await listFailedCheckins()).toEqual([]);
  });
});

describe("§9 — flush hai lần không được gửi đôi", () => {
  it("hai lượt flush chồng nhau (hai tab, 'online' bắn liên tiếp) chỉ gửi một lần", async () => {
    await queueTwoDays();
    let calls = 0;
    const submit = async () => {
      calls++;
      // Nhường một nhịp vòng lặp sự kiện: không có nó thì lượt đầu chạy trọn vẹn trước
      // khi lượt hai bắt đầu, và test đi qua ngay cả khi khoá §9 bị gỡ.
      await Promise.resolve();
      return okResult;
    };

    const [a, b] = await Promise.all([flushQueuedCheckins(submit), flushQueuedCheckins(submit)]);
    expect(calls).toBe(2); // hai bản ghi, mỗi bản một lần — KHÔNG phải bốn
    expect(a).toBe(b); // lượt thứ hai dùng chung kết quả lượt đầu
    expect(await listQueuedCheckins()).toEqual([]);
  });

  it("flush lần thứ hai SAU khi hàng đợi sạch thì không gửi gì nữa", async () => {
    await queueTwoDays();
    let calls = 0;
    const submit = async () => {
      calls++;
      return okResult;
    };
    await flushQueuedCheckins(submit);
    await flushQueuedCheckins(submit);
    expect(calls).toBe(2);
  });
});
