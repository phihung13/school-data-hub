import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEV_ACCOUNTS, DEV_GATE_COOKIE_NAME, DEV_GATE_HEADER, evaluateDevGate } from "@hub/core/auth-adapter";
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

  // GIẤU TRÊN MÀN KHÔNG PHẢI LÀ KHÔNG GỬI (vá 02/08/2026, sau khi đo).
  //
  // Bản trước truyền thẳng `DEV_ACCOUNTS` xuống LoginForm, và LoginForm chỉ VẼ khối tài
  // khoản khi `gate === "open"`. Nhìn mã thì tưởng kín. Nhưng LoginForm là client
  // component, nên Next tuần tự hoá MỌI prop của nó vào payload của trang — dữ liệu đã
  // nằm trong HTML trước khi có ai hỏi cửa. Đo thật qua tên miền công khai, phiên vô
  // danh chưa mở khoá: đếm được 9 authUid và 9 địa chỉ email nội bộ.
  //
  // Cửa khoá đúng chiều (không mã thì 401), nên đây không phải lỗ vào. Nhưng nó đưa
  // trước cho người lạ đúng thứ cần có nếu mã rò: danh sách authUid để bắn thẳng, cộng
  // 9 email thật của giáo viên. Hai thứ đó không việc gì phải phát công khai.
  //
  // Nên phán quyết chuyển về ĐÂY, phía máy chủ, dùng chung `evaluateDevGate` với hai
  // route — không dựng phép kiểm thứ ba. Chưa mở khoá thì trang không mang theo gì cả.
  const gate = evaluateDevGate({
    cookie: cookies().get(DEV_GATE_COOKIE_NAME)?.value ?? null,
    header: headers().get(DEV_GATE_HEADER),
  });

  return <LoginForm devAccounts={gate === "open" ? DEV_ACCOUNTS : []} then={then} />;
}
