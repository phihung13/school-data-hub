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

import { createContext, useContext, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Giọng của màn hình đang gọi — §8 của DESIGN-GUIDELINES có HAI giọng, không phải một.
//
// Vì sao thêm (01/08/2026, gói "tiep-can-man-nguoi-lon"): file này dùng chung cho cả màn
// học sinh lẫn buồng lái người lớn, mà ba câu lỗi mặc định của nó viết bằng giọng dỗ trẻ
// — "Thử lại giúp nhé", "Thử lại sau ít phút nhé". Hệ quả đo được: cả năm màn GVCN, hai
// màn tâm lý cụm và màn Điều hành đều xưng "nhé" với người lớn đang làm nghiệp vụ. §8 ghi
// thẳng: "Học sinh xưng con/mình, thân thiện; người lớn gọn, nghiệp vụ."
//
// Vì sao là context chứ không phải một prop `tone` truyền tay: có hơn hai chục chỗ gọi
// ErrorState/MutationError trong các màn người lớn. Prop nào cũng có thể quên, và người
// quên sẽ là người dựng màn NGƯỜI LỚN THỨ MƯỜI — lúc đó không ai còn nhớ luật này. Khung
// màn (GvcnShell · TamLyShell · OperationsShell · GvcnDashboard) bọc <StaffVoice> đúng
// một lần, và mọi thứ bên trong tự nói đúng giọng.
//
// Mặc định là "student" chứ không phải "staff": quên bọc ở màn người lớn chỉ làm câu chữ
// mềm hơn mức cần; quên theo chiều ngược lại là nói giọng vận hành với một đứa trẻ.
// ---------------------------------------------------------------------------
export type HubVoice = "student" | "staff";

const VoiceContext = createContext<HubVoice>("student");

export function StaffVoice({ children }: { children: ReactNode }) {
  return <VoiceContext.Provider value="staff">{children}</VoiceContext.Provider>;
}

export function useHubVoice(): HubVoice {
  return useContext(VoiceContext);
}

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

/**
 * Ba câu chung, viết hai lần cho hai giọng của §8. Bản `staff` KHÔNG phải bản `student`
 * bỏ chữ "nhé": nó bỏ luôn cả "giúp" — người lớn đang làm việc không cần được nhờ vả,
 * họ cần biết hỏng ở đâu và làm gì tiếp.
 */
const MESSAGES: Record<HubVoice, { network: string; generic: string; server: string }> = {
  student: {
    network: "Máy chưa nối được với trường. Kiểm tra mạng rồi thử lại nhé.",
    generic: "Chưa tải được dữ liệu. Thử lại giúp nhé.",
    server: "Máy chủ của trường đang trục trặc. Thử lại sau ít phút nhé.",
  },
  // RÚT NGẮN bản `staff` 06/08/2026 (§8: người lớn gọn, nghiệp vụ). Ba câu này vẫn là
  // CÂU BÁO LỖI của một hành động vừa hỏng nên không được bỏ — chỉ bỏ phần chủ ngữ dài
  // ("Máy chưa nối được với trường" → "Mất kết nối"), giữ nguyên: hỏng ở đâu, làm gì tiếp.
  // Bản `student` không đụng tới: nó thuộc nhóm màn học sinh, phạm vi của gói khác.
  staff: {
    network: "Mất kết nối. Kiểm tra mạng rồi thử lại.",
    generic: "Chưa tải được dữ liệu. Thử lại.",
    server: "Máy chủ trục trặc. Thử lại sau ít phút.",
  },
};

/**
 * Câu tiếng Việt để hiện cho người dùng.
 *
 * Ưu tiên `error.message` của máy chủ vì `errorFormatter` (server/trpc.ts) đã
 * viết sẵn tiếng Việt cho mọi mã lỗi VÀ đã che lỗi nội bộ bằng mã sự cố — tự
 * dịch lại ở client sẽ mất chi tiết đúng (vd "em chờ 12 giây"). Chỉ khi không có
 * câu nào từ máy chủ mới rơi về câu chung.
 *
 * `voice` mặc định "student" để mọi lời gọi cũ giữ nguyên hành vi.
 */
export function friendlyErrorMessage(error: unknown, voice: HubVoice = "student"): string {
  const say = MESSAGES[voice];
  if (isNetworkError(error)) return say.network;
  const message = (error as { message?: unknown }).message;
  if (typeof message === "string" && message.trim().length > 0) return message.trim();
  const status = httpStatusOf(error);
  if (status !== null && status >= 500) return say.server;
  return say.generic;
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
// Hình thức của một lỗi — icon + tiêu đề nói ĐÚNG loại lỗi.
//
// Sửa 31/07/2026 (gói "trung-thuc-trang-thai"): trước đây MỌI lỗi không phải 401
// đều vẽ `cloud_off` và viết "Không tải được …" — tức là báo "mất mạng" cho một
// lỗi PHÂN QUYỀN. Người dùng đi kiểm tra wifi, đổi mạng, bấm "Thử lại" mãi, trong
// khi sự thật là tài khoản của họ không được mở phần đó. Icon là câu đầu tiên màn
// hình nói ra; nói sai ở đó thì câu tiếng Việt bên dưới đã đến quá muộn.
// ---------------------------------------------------------------------------
export interface ErrorPresentation {
  /** Mã loại lỗi — dùng cho test, không hiển thị. */
  kind: "network" | "expired" | "forbidden" | "notfound" | "server" | "unknown";
  icon: string;
  /** Tiêu đề đã ghép sẵn tên màn hình (nếu nơi gọi có truyền). */
  title: string;
  iconClass: string;
}

export function errorPresentation(error: unknown, label?: string): ErrorPresentation {
  const of = (name: string) => `${name} ${label ?? "dữ liệu"}`;

  if (isSessionExpired(error)) {
    return {
      kind: "expired",
      icon: "lock_clock",
      title: "Phiên đăng nhập đã hết hạn",
      iconClass: "text-gold-textDark",
    };
  }
  // Kiểm lỗi mạng TRƯỚC mọi mã số: không có phản hồi thì không có mã số nào để đọc.
  if (isNetworkError(error)) {
    return {
      kind: "network",
      icon: "wifi_off",
      title: of("Chưa tải được"),
      iconClass: "text-subtle",
    };
  }

  const status = httpStatusOf(error);
  if (status === 403) {
    return {
      kind: "forbidden",
      icon: "block",
      // KHÔNG nói "không tải được": dữ liệu vẫn ở đó và vẫn khoẻ, chỉ là tài khoản
      // này không được mở. Nói sai chỗ này đẩy người dùng đi sửa mạng.
      title: label ? `Tài khoản này không mở được ${label}` : "Tài khoản này không có quyền xem phần đó",
      iconClass: "text-subtle",
    };
  }
  if (status === 404) {
    return {
      kind: "notfound",
      icon: "search",
      title: of("Không tìm thấy"),
      iconClass: "text-subtle",
    };
  }
  if (status !== null && status >= 500) {
    return {
      kind: "server",
      icon: "cloud_off",
      title: of("Máy chủ chưa trả được"),
      iconClass: "text-dangerText",
    };
  }
  return {
    kind: "unknown",
    icon: "error",
    title: of("Không tải được"),
    iconClass: "text-dangerText",
  };
}

// ---------------------------------------------------------------------------

export function LoadingState({ label = "Đang tải…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center"
    >
      <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-navy" aria-hidden />
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
  const voice = useHubVoice();
  const look = errorPresentation(error, label);
  const expired = look.kind === "expired";
  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <span className={`msr text-[36px] ${look.iconClass}`} aria-hidden>
        {look.icon}
      </span>
      <p className="text-[14px] font-black text-ink">{look.title}</p>
      {/* `muted` chứ không phải `caption`: câu này là chỗ DUY NHẤT phân biệt "hỏng rồi"
          với "chưa có gì" — nó mờ hơn phần còn lại thì hai trạng thái đọc thành một. */}
      <p className="max-w-[380px] text-[12.5px] leading-relaxed text-muted">
        {friendlyErrorMessage(error, voice)}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
        {expired ? (
          <a
            href="/login"
            className="flex min-h-[44px] items-center rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[12.5px] font-black text-white"
          >
            Đăng nhập lại
          </a>
        ) : (
          onRetry &&
          isRetryableError(error) && (
            <button
              type="button"
              onClick={onRetry}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-br from-navy to-navy-light px-5 py-3 text-[12.5px] font-black text-white"
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
          className="flex min-h-[44px] items-center rounded-xl border-[1.5px] border-line bg-card px-5 py-3 text-[12.5px] font-extrabold text-subtle"
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
    // role="status" aria-live="polite" — giống hệt LoadingState, và vì đúng một lý do.
    //
    // Trước 01/08/2026 chỉ LoadingState (role=status) và ErrorState (role=alert) có vùng
    // thông báo; nhánh RỖNG thì không. Nên khi query chuyển từ đang-tải sang rỗng, DOM đổi
    // từ vùng aria-live sang vùng KHÔNG aria-live: người dùng trình đọc màn hình nghe "Đang
    // tìm việc đang chờ trong cụm…" rồi hết. Không có gì báo là đã tải xong và kết quả là
    // rỗng — đúng chỗ mà repo này đặt câu quan trọng nhất của mình ("Trống ở đây nghĩa là
    // chưa có tín hiệu nào được ghi — không phải đã quét xong và kết luận mọi em đều ổn").
    // Im lặng bị nghe thành im lặng, theo nghĩa đen.
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center"
    >
      <span className="msr text-[34px] text-line2" aria-hidden>
        {icon}
      </span>
      <p className="text-[13.5px] font-black text-ink">{title}</p>
      {/* `muted`: câu hint là chỗ tách "chưa có gì" khỏi "không đọc được". */}
      {hint && <p className="max-w-[380px] text-[12px] leading-relaxed text-muted">{hint}</p>}
      {children}
    </div>
  );
}

/**
 * Lỗi của một MUTATION, hiện ngay cạnh nút vừa bấm. Khác `ErrorState` ở chỗ nó
 * không chiếm cả màn: người dùng vẫn thấy form mình vừa điền để bấm lại.
 */
export function MutationError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const voice = useHubVoice();
  if (!error) return null;
  return (
    <span role="alert" className="flex flex-wrap items-center gap-2 text-[12px] font-bold text-dangerText">
      {/* Cùng bảng icon với ErrorState: 403 không được vẽ thành sự cố máy chủ. */}
      <span className="msr text-[16px]" aria-hidden>
        {errorPresentation(error).icon}
      </span>
      {friendlyErrorMessage(error, voice)}
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
    <span role="status" className="flex items-center gap-1.5 text-[12px] font-bold text-successText">
      <span className="msr text-[16px]" aria-hidden>
        check_circle
      </span>
      {children}
    </span>
  );
}
