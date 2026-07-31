import { redirect } from "next/navigation";
import { DEV_ACCOUNTS } from "@hub/core/auth-adapter";
import { getCurrentSession } from "@/lib/session";
import { safeThenPath, DEFAULT_LANDING_PATH } from "@/lib/trpc-client";
import { LoginForm } from "@/components/login-form";

/**
 * Màn đăng nhập — điểm hạ cánh của MỌI lần vào Hub khi chưa có phiên.
 *
 * `?then=` được 5 nơi sinh ra (oidc/interaction-handler, /embed/[appId], /tuan-nay, /diem-danh,
 * /can-gap-thay-co) nhưng tới 31/07/2026 KHÔNG nơi nào đọc: đăng nhập xong ai cũng rơi về
 * /home. Nặng nhất là đường SSO vào Mini App — Hub tạo interaction OIDC, đá về /login, người
 * dùng đăng nhập, rồi đứng ở /home trong khi app ngoài treo màn chờ tới lúc interaction hết
 * hạn (600s). Trang này là chỗ duy nhất đọc `?then=`, và lọc qua `safeThenPath` để tham số
 * không biến thành open redirect (phụ huynh nhận link qua Zalo là đối tượng bị nhắm).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { then?: string | string[] };
}) {
  const then = safeThenPath(searchParams?.then);

  // Đã có phiên mà vẫn mở /login (bấm nút Back, hoặc link cũ trong Zalo): đi thẳng tới đích
  // đã hẹn thay vì luôn về /home — nhờ vậy link SSO gửi lại vẫn dùng được.
  const session = await getCurrentSession();
  if (session) redirect(then ?? DEFAULT_LANDING_PATH);

  return <LoginForm devAccounts={DEV_ACCOUNTS} then={then} />;
}
