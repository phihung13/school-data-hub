// apps/hub/components/ui/query-state.tsx — ba trạng thái mà MỌI màn hình đọc dữ
// liệu phải có: đang tải · lỗi · rỗng.
//
// Vì sao tách ra một chỗ (31/07/2026): trước file này, /diem-danh, /tuan-nay và
// /ho-so đều viết `{query.data && (…)}` — không nhánh nào cho `isLoading`, không
// nhánh nào cho `error`. Khi query hỏng (mất mạng, hết phiên 15 phút, 500),
// react-query thử lại rồi bỏ cuộc, `data` mãi mãi là `undefined`, và học sinh
// nhìn một màn hình TRẮNG không chữ nào. Trắng vĩnh viễn là trạng thái tệ nhất
// trong ba trạng thái xấu: người dùng không phân biệt được "đang tải" với "chưa
// có gì" với "hỏng rồi", nên không biết nên đợi, nên bỏ qua, hay nên thử lại.
//
// Cùng tinh thần Rev F điều 8 của RULES.md ("không suy tin tốt từ im lặng"): im
// lặng phải được NÓI RA, không được trình bày như một kết quả bình thường.
"use client";

import type { ReactNode } from "react";

/** HTTP status do server tRPC gắn vào `error.data.httpStatus`, nếu có. */
export function httpStatusOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const status = (data as { httpStatus?: unknown }).httpStatus;
  return typeof status === "number" ? status : null;
}

/** Máy chủ có trả lời không? Không có `data` = request chưa bao giờ tới nơi (mạng/DNS/CORS). */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const data = (error as { data?: unknown }).data;
  return data === null || data === undefined;
}

const NETWORK_MESSAGE = "Máy chưa nối được với trường. Kiểm tra mạng rồi thử lại nhé.";
const GENERIC_MESSAGE = "Chưa tải được dữ liệu. Thử lại giúp nhé.";

/**
 * Câu tiếng Việt để hiện cho người dùng.
 *
 * Ưu tiên `error.message` của máy chủ vì `errorFormatter` (server/trpc.ts) đã
 * viết sẵn tiếng Việt cho mọi mã lỗi VÀ đã che lỗi nội bộ bằng mã sự cố — tự
 * dịch lại ở client sẽ mất chi tiết đúng (vd "em chờ 12 giây"). Chỉ khi không có
 * câu nào từ máy chủ mới rơi về câu chung.
 */
export function friendlyErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  const message = (error as { message?: unknown }).message;
  if (typeof message === "string" && message.trim().length > 0) return message.trim();
  const status = httpStatusOf(error);
  if (status !== null && status >= 500) return "Máy chủ của trường đang trục trặc. Thử lại sau ít phút nhé.";
  return GENERIC_MESSAGE;
}

/** Lỗi này có tự khỏi khi bấm "Thử lại" không? 4xx (trừ 408/429) thì không. */
export function isRetryableError(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  const status = httpStatusOf(error);
  if (status === null) return true;
  if (status === 408 || status === 429) return true;
  return status < 400 || status >= 500;
}

/** Hết phiên → chỗ gọi nên mời đăng nhập lại thay vì mời "thử lại". */
export function isSessionExpired(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (httpStatusOf(error) === 401) return true;
  const data = (error as { data?: unknown }).data;
  return Boolean(data && typeof data === "object" && (data as { code?: unknown }).code === "UNAUTHORIZED");
}

// ---------------------------------------------------------------------------

export function LoadingState({ label = "Đang tải…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center"
    >
      <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#E4E9F0] border-t-navy" aria-hidden />
      <p className="text-[13px] font-semibold text-muted">{label}</p>
    </div>
  );
}

/**
 * Ô xám đúng bằng chỗ con số sắp hiện. Dùng thay cho `?? 0`: số 0 là một con số
 * THẬT, và "0/5 ngày tuần này" khi API hỏng là nói dối học sinh về chính em.
 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block animate-pulse rounded-md bg-black/10 align-middle ${className}`} />;
}

export function ErrorState({
  error,
  onRetry,
  label,
}: {
  error: unknown;
  onRetry?: () => void;
  /** Tên màn hình, để câu lỗi nói rõ hỏng ở đâu ("Không tải được Điểm danh"). */
  label?: string;
}) {
  const expired = isSessionExpired(error);
  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <span className="msr text-[36px] text-[#D2383E]" aria-hidden>
        {expired ? "lock_clock" : "cloud_off"}
      </span>
      <p className="text-[14px] font-black text-ink">
        {label ? `Không tải được ${label}` : "Không tải được dữ liệu"}
      </p>
      <p className="max-w-[380px] text-[12.5px] leading-relaxed text-caption">{friendlyErrorMessage(error)}</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
        {expired ? (
          <a
            href="/login"
            className="rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[12.5px] font-black text-white"
          >
            Đăng nhập lại
          </a>
        ) : (
          onRetry &&
          isRetryableError(error) && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[12.5px] font-black text-white"
            >
              <span className="msr text-[17px]" aria-hidden>
                refresh
              </span>
              Thử lại
            </button>
          )
        )}
        <a
          href="/home"
          className="rounded-xl border-[1.5px] border-[#E4E9F0] bg-white px-5 py-3 text-[12.5px] font-extrabold text-[#5B6B80]"
        >
          Về trang chủ
        </a>
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  hint,
  children,
}: {
  icon?: string;
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="msr text-[34px] text-[#C9D2DE]" aria-hidden>
        {icon}
      </span>
      <p className="text-[13.5px] font-black text-ink">{title}</p>
      {hint && <p className="max-w-[380px] text-[12px] leading-relaxed text-caption">{hint}</p>}
      {children}
    </div>
  );
}

/**
 * Lỗi của một MUTATION, hiện ngay cạnh nút vừa bấm. Khác `ErrorState` ở chỗ nó
 * không chiếm cả màn: người dùng vẫn thấy form mình vừa điền để bấm lại.
 */
export function MutationError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <span role="alert" className="flex flex-wrap items-center gap-2 text-[12px] font-bold text-[#D2383E]">
      <span className="msr text-[16px]" aria-hidden>
        error
      </span>
      {friendlyErrorMessage(error)}
      {onRetry && isRetryableError(error) && (
        <button type="button" onClick={onRetry} className="underline underline-offset-2">
          Thử lại
        </button>
      )}
    </span>
  );
}

/** Xác nhận ngắn sau khi ghi thành công — không có nó thì nút chỉ hết mờ, không ai biết đã lưu. */
export function MutationSuccess({ children }: { children: ReactNode }) {
  return (
    <span role="status" className="flex items-center gap-1.5 text-[12px] font-bold text-[#00693F]">
      <span className="msr text-[16px]" aria-hidden>
        check_circle
      </span>
      {children}
    </span>
  );
}
