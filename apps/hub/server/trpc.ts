// apps/hub/server/trpc.ts
// Router setup + context. Đường ghi duy nhất #1 trong 03-api.md — mọi mutation
// người dùng đi qua đây, không có route API tự chế nào khác chạm DB nghiệp vụ.
import { initTRPC, TRPCError } from "@trpc/server";
import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE } from "@hub/core/auth-adapter";
import { withUserContext } from "@hub/core/db";
import type { HubRole } from "@hub/core/contracts";
import { describeError, log, newRequestId } from "@/lib/logger";
import { checkRateLimit, limitForTrpcCall } from "@/lib/rate-limit";

export interface TrpcContext {
  authUid: string | null;
  roles: HubRole[];
  displayName: string | null;
}

export async function createContext(): Promise<TrpcContext> {
  const token = cookies().get(SESSION_COOKIE.name)?.value;
  if (!token) return { authUid: null, roles: [], displayName: null };

  const claims = await verifySessionToken(token);
  if (!claims) return { authUid: null, roles: [], displayName: null };

  return { authUid: claims.sub, roles: claims.roles, displayName: claims.displayName };
}

/** Thông điệp duy nhất người dùng thấy khi máy chủ hỏng — không lộ gì về bên trong. */
const INTERNAL_ERROR_MESSAGE = (requestId: string) =>
  `Có lỗi kỹ thuật, thầy cô thử lại giúp em nhé (mã sự cố: ${requestId})`;

const t = initTRPC.context<TrpcContext>().create({
  /**
   * @trpc/server 11 trả NGUYÊN `error.message` về trình duyệt, kể cả với
   * INTERNAL_SERVER_ERROR. Lỗi `pg` mang theo tên bảng, tên ràng buộc, đôi khi cả
   * giá trị gây trùng khoá — và `gvcn-dashboard.tsx` in thẳng chuỗi đó lên màn hình
   * giáo viên. Ca chạm được trong một cú bấm: hai request song song cùng mở ca chăm
   * sóc → `care_cases_one_open_idx` bắn 23505.
   *
   * Ở đây tách làm đôi:
   *  · Máy chủ nhận ĐỦ (SQLSTATE, constraint, stack, authUid, path) qua lib/logger.
   *  · Trình duyệt nhận: nguyên văn tiếng Việt nếu đó là TRPCError ta CHỦ ĐỘNG ném
   *    (UNAUTHORIZED/FORBIDDEN/BAD_REQUEST/TOO_MANY_REQUESTS — những câu viết cho
   *    người đọc), và chỉ một câu chung + mã sự cố nếu là lỗi ngoài dự kiến.
   *
   * KHÔNG log `input`: input của Hub chứa mood, ghi chú can thiệp, nội dung "cần gặp
   * thầy cô" — §3/§5 không cho những thứ đó rơi vào file log vận hành.
   */
  errorFormatter({ shape, error, ctx, path, type }) {
    const requestId = newRequestId();
    const isInternal = shape.data.code === "INTERNAL_SERVER_ERROR";

    log(isInternal ? "error" : "warn", "trpc.error", {
      requestId,
      path: path ?? null,
      type,
      code: shape.data.code,
      httpStatus: shape.data.httpStatus,
      authUid: ctx?.authUid ?? null,
      ...describeError(error.cause ?? error),
    });

    // `stack` chỉ có mặt ngoài production, nhưng "ngoài production" bao gồm cả bản
    // demo chạy qua tunnel cho BGH xem — bỏ hẳn cho mọi môi trường.
    const { stack: _stack, ...data } = shape.data as typeof shape.data & { stack?: string };

    return {
      ...shape,
      message: isInternal ? INTERNAL_ERROR_MESSAGE(requestId) : shape.message,
      data: { ...data, requestId },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Giới hạn tốc độ theo (authUid, path) — hạn mức lấy từ lib/rate-limit.ts, không viết
 * số ở đây. Đặt SAU bước kiểm đăng nhập vì khoá đếm cần authUid; endpoint chưa đăng
 * nhập (mã mời phụ huynh) tự siết theo IP bằng helper `rateLimit` ở route handler.
 */
const rateLimitMiddleware = t.middleware(async ({ ctx, path, type, next }) => {
  const verdict = checkRateLimit(`trpc:${ctx.authUid}:${path}`, limitForTrpcCall(path, type));
  if (!verdict.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Thao tác hơi nhanh, em chờ ${verdict.retryAfterSeconds} giây rồi thử lại nhé.`,
    });
  }
  return next();
});

/**
 * Bọc sẵn `withUserContext` — handler nhận thẳng `client` đã có RLS context
 * đúng người dùng, không tự ý SET ROLE hay set_config ở nơi khác (§4).
 */
export const protectedProcedure = t.procedure
  .use(async ({ ctx, next }) => {
    if (!ctx.authUid) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Vui lòng đăng nhập lại." });
    }
    const authUid = ctx.authUid;
    return next({
      ctx: {
        ...ctx,
        authUid,
        runWithDb: <T>(fn: Parameters<typeof withUserContext<T>>[1]) => withUserContext<T>(authUid, fn),
      },
    });
  })
  .use(rateLimitMiddleware);

/**
 * Vai trò THẬT của người đang gọi, đọc từ `core.v_my_scopes` (0015) chứ không đọc từ
 * JWT. Vì sao không tin JWT: token sống tới 15 phút, nên một tài khoản vừa bị thu vai
 * (hoặc bị khoá) vẫn cầm token ghi đúng vai cũ. Với thứ quyết định "được sửa dữ liệu
 * của lớp nào" thì 15 phút là quá dài — hỏi thẳng bảng phân quyền, một truy vấn nhẹ
 * chạy trong cùng transaction RLS của request.
 */
async function loadMyScopes(
  runWithDb: <T>(fn: Parameters<typeof withUserContext<T>>[1]) => Promise<T>,
): Promise<{ roleCode: HubRole; classId: string | null }[]> {
  return runWithDb(async (client) => {
    const { rows } = await client.query<{ role_code: HubRole; class_id: string | null }>(
      "select role_code, class_id from core.v_my_scopes",
    );
    return rows.map((r) => ({ roleCode: r.role_code, classId: r.class_id }));
  });
}

/**
 * Procedure cho GVCN. Dùng cho mọi thứ chạm dữ liệu CỦA LỚP (xác nhận check-in muộn,
 * ghi can thiệp, buồng lái): `protectedProcedure` chỉ kiểm "đã đăng nhập", và chính
 * chỗ hụt đó là đường leo quyền ở `care.acknowledgeLate` — học sinh gọi được procedure
 * dành cho GVCN vì nó chỉ hỏi "em đăng nhập chưa".
 *
 * Handler nhận thêm `ctx.homeroomClassIds` (mọi lớp mình chủ nhiệm) và
 * `ctx.homeroomClassId` (lớp đầu tiên — tiện cho màn hình một lớp), nên router không
 * phải tự query lại `core.v_my_scopes` nữa.
 */
export const homeroomProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const scopes = await loadMyScopes(ctx.runWithDb);
  const homeroomClassIds = scopes
    .filter((s) => s.roleCode === "homeroom")
    .map((s) => s.classId)
    .filter((id): id is string => id !== null);

  if (homeroomClassIds.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Mục này dành cho giáo viên chủ nhiệm.",
    });
  }

  return next({
    ctx: { ...ctx, homeroomClassIds, homeroomClassId: homeroomClassIds[0] as string },
  });
});

/**
 * Procedure theo vai tổng quát: `roleProcedure("counselor", "principal")`.
 * Cũng đối chiếu với `core.v_my_scopes`, không tin JWT (xem `loadMyScopes`).
 * Handler nhận `ctx.grantedRoles` = danh sách vai thật, đã lọc trùng.
 */
export function roleProcedure(...roles: HubRole[]) {
  if (roles.length === 0) {
    // Gọi roleProcedure() rỗng nghĩa là "vai nào cũng được" — gần như luôn là lỗi gõ
    // nhầm, và nó âm thầm biến một procedure nhạy cảm thành protectedProcedure.
    throw new Error("roleProcedure() cần ít nhất một vai.");
  }
  return protectedProcedure.use(async ({ ctx, next }) => {
    const scopes = await loadMyScopes(ctx.runWithDb);
    const grantedRoles = Array.from(new Set(scopes.map((s) => s.roleCode)));
    if (!grantedRoles.some((r) => roles.includes(r))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Tài khoản của bạn không có quyền dùng mục này.",
      });
    }
    return next({ ctx: { ...ctx, grantedRoles, myScopes: scopes } });
  });
}
