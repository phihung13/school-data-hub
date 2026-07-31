// tests/unit/logger.test.ts
//
// Hai nửa của cùng một lời hứa, và cả hai đều phải kiểm được:
//   · Người vận hành phải thấy ĐỦ để dò lỗi (SQLSTATE, tên ràng buộc, nguyên nhân gốc).
//   · File log KHÔNG được chứa nội dung người dùng — mood, ghi chú can thiệp, lời nhắn
//     "cần gặp thầy cô" là dữ liệu §3/§5, không phải dữ liệu vận hành.
import { describe, it, expect, vi, afterEach } from "vitest";
import { describeError, log, newRequestId } from "@/lib/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log()", () => {
  it("ghi ĐÚNG MỘT dòng JSON, có mốc thời gian và mức độ", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log("error", "trpc.error", { requestId: "abcd1234", path: "care.logIntervention" });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]![0] as string;
    expect(line.split("\n")).toHaveLength(1);

    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("trpc.error");
    expect(parsed.requestId).toBe("abcd1234");
    expect(parsed.path).toBe("care.logIntervention");
    expect(Date.parse(parsed.ts)).not.toBeNaN();
  });

  it("mức warn/info không đi ra console.error", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    log("warn", "trpc.error", {});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(err).not.toHaveBeenCalled();
  });

  it("cắt chuỗi quá dài để một dòng log không nuốt cả màn hình", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log("error", "x", { stack: "y".repeat(5000) });
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed.stack.length).toBeLessThan(2100);
    expect(parsed.stack).toContain("cắt");
  });
});

describe("describeError()", () => {
  it("giữ lại SQLSTATE và tên ràng buộc — hai thứ quý nhất khi dò lỗi Postgres", () => {
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint "care_cases_one_open_idx"'), {
      code: "23505",
      constraint: "care_cases_one_open_idx",
      table: "care_cases",
    });

    const fields = describeError(pgError);
    expect(fields.sqlstate).toBe("23505");
    expect(fields.constraint).toBe("care_cases_one_open_idx");
    expect(fields.table).toBe("care_cases");
    expect(fields.stack).toBeTruthy();
  });

  it("không đánh mất nguyên nhân gốc khi lỗi bị bọc một lớp (TRPCError bọc lỗi pg)", () => {
    const root = new Error("lỗi gốc từ pg");
    const wrapper = new Error("wrapper", { cause: root });

    const fields = describeError(wrapper) as { cause?: { message?: string } };
    expect(fields.cause?.message).toBe("lỗi gốc từ pg");
  });

  it("thứ không phải Error cũng không làm sập bộ ghi log", () => {
    expect(describeError("chuỗi trần")).toEqual({ errorRaw: "chuỗi trần" });
    expect(describeError(undefined)).toEqual({ errorRaw: "undefined" });
  });
});

describe("newRequestId()", () => {
  it("ngắn, đọc được qua điện thoại, và không trùng nhau", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newRequestId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}$/);
  });
});
