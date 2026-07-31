// apps/hub/lib/logger.ts — log có cấu trúc cho phía máy chủ.
//
// Vì sao cần: trước 31/07/2026 toàn bộ apps/hub + packages/core KHÔNG có một dòng
// console.error nào. Một lỗi Postgres (vd trùng khoá `care_cases_one_open_idx`) đi
// thẳng ra màn hình giáo viên dưới dạng chuỗi tiếng Anh có tên bảng, còn phía máy
// chủ thì không để lại dấu vết nào để dò lại. Hai nửa của cùng một vấn đề: người
// dùng thấy quá nhiều, người vận hành thấy quá ít.
//
// Nguyên tắc của file này:
//  1. MỘT dòng JSON cho mỗi sự kiện — grep được, đổ vào công cụ log sau này không
//     phải viết parser.
//  2. KHÔNG BAO GIỜ log `input` của procedure. Input của Hub chứa mood, ghi chú can
//     thiệp, nội dung "cần gặp thầy cô" — đúng thứ §3/§5 bảo vệ. Log chỉ mang định
//     danh kỹ thuật (authUid, path, mã lỗi), không mang nội dung.
//  3. Mỗi lỗi có `requestId` ngắn, được trả cho người dùng làm "mã sự cố" để họ đọc
//     cho thầy cô/IT mà không cần chụp màn hình lỗi kỹ thuật.

export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

/**
 * Mã sự cố ngắn, đủ để tra trong log nhưng vẫn đọc được qua điện thoại.
 * 8 ký tự hex ≈ 4 tỉ khả năng — trùng nhau trong cùng một ngày là không đáng kể,
 * và log luôn kèm mốc thời gian nên vẫn tra ra đúng dòng.
 */
export function newRequestId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

/** Cắt chuỗi dài (stack, message của Postgres) để một dòng log không nuốt cả màn hình. */
function truncate(value: string, max = 2000): string {
  return value.length > max ? `${value.slice(0, max)}…[cắt ${value.length - max} ký tự]` : value;
}

export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify(
    { ts: new Date().toISOString(), level, event, ...fields },
    (_key, value) => (typeof value === "string" ? truncate(value) : value),
  );
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Bóc phần đáng log của một Error mà KHÔNG kéo theo dữ liệu người dùng.
 * Với lỗi `pg` thì `code` là SQLSTATE và `constraint` là tên ràng buộc — hai thứ
 * quý nhất khi dò lỗi, và cũng chính là hai thứ tuyệt đối không được ra trình duyệt.
 */
export function describeError(err: unknown): LogFields {
  if (!(err instanceof Error)) return { errorRaw: String(err) };
  const pg = err as Error & { code?: string; constraint?: string; table?: string; detail?: string };
  return {
    errorName: err.name,
    errorMessage: err.message,
    sqlstate: pg.code,
    constraint: pg.constraint,
    table: pg.table,
    detail: pg.detail,
    stack: err.stack,
    // Lỗi thật thường bị TRPCError bọc lại một lớp — mất `cause` là mất nguyên nhân gốc.
    cause: err.cause instanceof Error ? { name: err.cause.name, message: err.cause.message } : undefined,
  };
}
