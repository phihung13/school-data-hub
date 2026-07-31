// apps/hub/lib/trpc-client.ts
// Hook tRPC cho React + LUẬT ĐIỀU HƯỚNG PHIÊN phía trình duyệt.
//
// Vì sao ba việc dưới đây nằm chung một file thuần (không JSX, không React):
// `trpc-provider.tsx`, `app/login/page.tsx` (Server Component) và `components/login-form.tsx`
// đều cần CÙNG một bộ luật "đi đâu sau khi đăng nhập / khi hết phiên". Trước 31/07/2026 mỗi
// nơi tự quyết một kiểu nên tham số `?then=` sinh ra ở 5 chỗ mà KHÔNG chỗ nào đọc. Gom vào
// đây thì chỉ có một định nghĩa để kiểm bằng test (tests/unit/client-auth.test.ts), và vì file
// không kéo theo React nên test chạy được ở môi trường node thuần.
import { createTRPCReact } from "@trpc/react-query";
import type { DefaultOptions } from "@tanstack/react-query";
import type { AppRouter } from "@/server/routers/_app";

export const trpc = createTRPCReact<AppRouter>();

/** Nơi hạ cánh khi không có `?then=` hợp lệ. */
export const DEFAULT_LANDING_PATH = "/home";

/** Chặn URL dài bất thường (nhồi payload vào thanh địa chỉ rồi gửi cho phụ huynh qua Zalo). */
const MAX_THEN_LENGTH = 512;

/**
 * Ký tự KHÔNG được phép xuất hiện thô trong `?then=`: mọi ký tự điều khiển, khoảng trắng và
 * DEL. Trình duyệt tự cắt bỏ `\n`, `\r`, `\t` khi phân giải URL, nên `"/\n/evil.com"` lọt qua
 * phép kiểm chuỗi ngây thơ rồi lại thành `"//evil.com"` lúc điều hướng thật.
 */
const FORBIDDEN_CHARS = /[\u0000-\u0020\u007f]/;

/**
 * Lọc `?then=` thành đường dẫn nội bộ AN TOÀN, hoặc `null` nếu không tin được.
 *
 * Đây là hàng rào chống open redirect: giá trị này đi thẳng vào `window.location.assign` sau
 * khi người dùng vừa đăng nhập — đúng khoảnh khắc họ tin tưởng nhất và sẵn sàng gõ lại mật
 * khẩu trên một trang giả mạo trông y hệt. Với hệ này người bị nhắm là phụ huynh nhận link
 * qua Zalo, nên chỉ nhận danh sách trắng, không cố "sửa" giá trị xấu thành tốt.
 *
 * Nhận: `"/embed/factory"`, `"/oidc/interaction/abc"`, `"/tuan-nay?tab=2"`.
 * Từ chối: URL tuyệt đối, `"//evil.com"` (protocol-relative), `"/\evil.com"` (trình duyệt
 * quy đổi `\` thành `/`), chuỗi có ký tự điều khiển, `?then=` lặp lại nhiều lần (mảng — mơ hồ,
 * không đoán), và chính `/login` (đăng nhập xong lại về trang đăng nhập = vòng lặp vô hạn với
 * nhánh "đã có phiên thì redirect(then)" ở app/login/page.tsx).
 */
export function safeThenPath(raw: string | string[] | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > MAX_THEN_LENGTH) return null;
  if (FORBIDDEN_CHARS.test(raw)) return null;
  if (raw.includes("\\")) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  // `/login`, `/login?then=...` — nhưng KHÔNG chặn `/login-huong-dan` nếu sau này có trang đó.
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/login/")) return null;
  return raw;
}

/** `safeThenPath` nhưng luôn trả một đích đi được — dùng ở nơi bắt buộc phải điều hướng. */
export function resolveThenPath(raw: string | string[] | null | undefined): string {
  return safeThenPath(raw) ?? DEFAULT_LANDING_PATH;
}

/**
 * Dựng URL đăng nhập giữ lại trang đang đứng: `/login?then=<trang cũ>`.
 * Trả `null` khi ĐANG ở /login — để nơi gọi biết mà đứng yên thay vì tự đá mình vòng tròn
 * (một query lỗi UNAUTHORIZED chạy trên chính trang login sẽ nạp lại trang mãi mãi).
 */
export function loginRedirectHref(pathname: string, search = ""): string | null {
  if (pathname === "/login" || pathname.startsWith("/login/") || pathname.startsWith("/login?")) {
    return null;
  }
  const then = safeThenPath(`${pathname}${search}`);
  return then ? `/login?then=${encodeURIComponent(then)}` : "/login";
}

/**
 * Lỗi này có phải "phiên hết hạn / chưa đăng nhập" không?
 *
 * tRPC 11 trả mã ở `error.data.code` cho client, còn `errorFormatter` của Hub
 * (server/trpc.ts) giữ nguyên `code` và chỉ thay `message` — nên đọc `code` là chắc chắn,
 * đọc `message` thì không. Kiểm cả `shape.data` vì một số đường lỗi (batch link) bọc thêm
 * một lớp, và cả `httpStatus === 401` để không phụ thuộc vào đúng một cách viết.
 */
export function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const shape = (error as { shape?: unknown }).shape;
  const carriers: unknown[] = [
    (error as { data?: unknown }).data,
    shape && typeof shape === "object" ? (shape as { data?: unknown }).data : null,
  ];

  return carriers.some((carrier) => {
    if (!carrier || typeof carrier !== "object") return false;
    const { code, httpStatus } = carrier as { code?: unknown; httpStatus?: unknown };
    return code === "UNAUTHORIZED" || httpStatus === 401;
  });
}

/**
 * Có nên thử lại query hỏng không?
 *
 * Mặc định của react-query là 3 lần: một lỗi 500 hoá thành 4 round-trip DB, và một lỗi
 * UNAUTHORIZED (rất dễ gặp — phiên chỉ sống 15 phút) cũng bị thử lại 3 lần dù chắc chắn
 * không bao giờ tự khỏi. Ở đây: lỗi phía người gọi (4xx — hết phiên, không đủ quyền, sai
 * input, vượt hạn mức) KHÔNG thử lại; lỗi phía máy chủ/mạng thử đúng một lần.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  const status = httpStatusOf(error);
  if (status !== null && status >= 400 && status < 500) return false;
  return true;
}

function httpStatusOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const status = (data as { httpStatus?: unknown }).httpStatus;
  return typeof status === "number" ? status : null;
}

/**
 * Mặc định react-query cho toàn Hub.
 *
 * `new QueryClient()` trần khiến: staleTime=0 → mỗi lần điều hướng client-side quay lại là
 * gọi lại toàn bộ API; refetchOnWindowFocus=true → mỗi cú alt-tab bắn lại MỌI query đang
 * active (buồng lái GVCN là 13 round-trip DB cho một lần chuyển cửa sổ). Ở quy mô 5.000 user
 * đây là nguồn tải thừa lớn nhất phía client (05-capacity-ops.md).
 *
 * 60 giây là mức chấp nhận được cho dữ liệu của Hub: buồng lái và báo cáo do job đêm sinh ra,
 * còn những chỗ cần tươi NGAY (vừa ghi can thiệp, vừa check-in) đã gọi `invalidateQueries`
 * tường minh nên không mất tính đúng. Vẫn giữ `refetchOnReconnect` vì máy học sinh rớt mạng
 * là chuyện thường ngày.
 */
export const REACT_QUERY_DEFAULTS: DefaultOptions = {
  queries: {
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: shouldRetryQuery,
  },
  mutations: {
    // Mutation KHÔNG tự thử lại: §9 bảo đảm gọi 2 lần cho cùng kết quả, nhưng đó là lưới an
    // toàn cho retry của NGƯỜI dùng, không phải giấy phép để client tự nhân đôi lời ghi.
    retry: false,
  },
};
