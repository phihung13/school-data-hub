// tests/db/role-procedures.test.ts
//
// homeroomProcedure / roleProcedure là hàng rào chặn LEO QUYỀN ở tầng API. Trước khi
// có chúng, mọi procedure "dành cho GVCN" chỉ hỏi đúng một câu: "em đăng nhập chưa?" —
// nên một học sinh gọi thẳng care.acknowledgeLate là tự duyệt được check-in muộn của
// chính mình. Test này khoá hàng rào lại TRƯỚC khi các router chuyển sang dùng nó.
//
// Chạy trên Postgres thật với RLS thật: hàng rào đọc vai từ core.v_my_scopes, nên nếu
// view đó đổi hoặc RLS chặn mất, test này đỏ chứ không âm thầm mở cửa.
import { describe, it, expect, beforeAll } from "vitest";
import { databaseAvailable, seedPresent, DEV, FIXTURE } from "../helpers/db";
import { router, homeroomProcedure, roleProcedure, protectedProcedure } from "@/server/trpc";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

beforeAll(async () => {
  ready = (await databaseAvailable()) && (await seedPresent());
});

/** Router nháp chỉ để gọi thẳng ba loại procedure — không đăng ký vào appRouter thật. */
const probeRouter = router({
  anyLoggedIn: protectedProcedure.query(() => "ok" as const),
  homeroomOnly: homeroomProcedure.query(({ ctx }) => ctx.homeroomClassId),
  counselorOrPrincipal: roleProcedure("counselor", "principal").query(({ ctx }) => ctx.grantedRoles),
});

/** Bối cảnh như tRPC context thật dựng ra sau khi verify cookie. */
function ctxFor(authUid: string): TrpcContext {
  return { authUid, roles: [], displayName: null };
}

async function codeOfRejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "KHÔNG NÉM LỖI";
  } catch (err) {
    // Không import TRPCError ở đây: gói @trpc/server nằm trong apps/hub, không resolve
    // được từ thư mục tests ở gốc. Đọc thẳng thuộc tính `code` là đủ và không mượn thêm
    // phụ thuộc nào.
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : `LỖI KHÁC: ${String(err)}`;
  }
}

describe("homeroomProcedure", () => {
  it("GVCN đi qua được và nhận đúng lớp chủ nhiệm của mình", async ({ skip }) => {
    if (!ready) return skip();
    const caller = probeRouter.createCaller(ctxFor(DEV.gvcn));
    expect(await caller.homeroomOnly()).toBe(FIXTURE.classA);
  });

  it("GVCN lớp khác nhận lớp CỦA MÌNH, không phải lớp đầu tiên trong bảng", async ({ skip }) => {
    if (!ready) return skip();
    const caller = probeRouter.createCaller(ctxFor(DEV.gvcn2));
    expect(await caller.homeroomOnly()).toBe(FIXTURE.classB);
  });

  it("HỌC SINH bị chặn — đây chính là lỗ leo quyền ở care.acknowledgeLate", async ({ skip }) => {
    if (!ready) return skip();
    const caller = probeRouter.createCaller(ctxFor(DEV.student));
    expect(await codeOfRejection(() => caller.homeroomOnly())).toBe("FORBIDDEN");
    // Nhưng vẫn đăng nhập bình thường: chặn theo VAI, không phải chặn theo phiên.
    expect(await caller.anyLoggedIn()).toBe("ok");
  });

  it("tâm lý cụm KHÔNG phải GVCN nên cũng bị chặn", async ({ skip }) => {
    if (!ready) return skip();
    const caller = probeRouter.createCaller(ctxFor(DEV.counselor));
    expect(await codeOfRejection(() => caller.homeroomOnly())).toBe("FORBIDDEN");
  });

  it("chưa đăng nhập thì dừng ngay ở lớp UNAUTHORIZED, không chạm CSDL", async ({ skip }) => {
    if (!ready) return skip();
    const caller = probeRouter.createCaller({ authUid: null, roles: [], displayName: null });
    expect(await codeOfRejection(() => caller.homeroomOnly())).toBe("UNAUTHORIZED");
  });
});

describe("roleProcedure", () => {
  it("đúng vai thì qua", async ({ skip }) => {
    if (!ready) return skip();
    const caller = probeRouter.createCaller(ctxFor(DEV.counselor));
    expect(await caller.counselorOrPrincipal()).toContain("counselor");
  });

  it("sai vai thì FORBIDDEN dù đã đăng nhập", async ({ skip }) => {
    if (!ready) return skip();
    const caller = probeRouter.createCaller(ctxFor(DEV.gvcn));
    expect(await codeOfRejection(() => caller.counselorOrPrincipal())).toBe("FORBIDDEN");
  });

  it("VAI ĐỌC TỪ BẢNG, KHÔNG ĐỌC TỪ TOKEN: token khai 'counselor' vẫn bị chặn", async ({ skip }) => {
    if (!ready) return skip();
    // Đây là tình huống thật: tài khoản vừa bị thu vai nhưng token cũ (sống tới 15
    // phút) vẫn ghi vai cũ. Nếu hàng rào tin token, người đó còn quyền thêm 15 phút.
    const caller = probeRouter.createCaller({
      authUid: DEV.gvcn,
      roles: ["counselor", "principal"],
      displayName: "token nói dối",
    });
    expect(await codeOfRejection(() => caller.counselorOrPrincipal())).toBe("FORBIDDEN");
  });

  it("roleProcedure() rỗng là lỗi lập trình, phải nổ ngay lúc dựng router", () => {
    expect(() => roleProcedure()).toThrow(/ít nhất một vai/);
  });
});
