// apps/hub/app/quan-tri/mini-app/page.tsx — sổ đăng ký Mini App, màn của quản trị.
//
// Chặn quyền ở ĐÂY (server component) chứ không chỉ ở tRPC, đúng khuôn /tam-ly và các màn
// GVCN: vào thẳng URL mà không mang vai quản trị thì bị đá về /home TRƯỚC khi tải bất kỳ
// dữ liệu nào. Người dùng không phải nhìn một khung màn hình rồi mới nhận thông báo cấm,
// và quan trọng hơn: danh sách app đang tắt không kịp đi qua dây.
//
// Hai lớp, không phải một lớp thừa: `adminProcedure` trong routers/admin.ts vẫn kiểm lại
// bằng `core.v_my_scopes`, và RLS của bảng vẫn kiểm lần thứ ba. Ai gõ URL cũng chỉ chạm
// được tới lớp mỏng nhất.
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { MiniAppAdminView } from "@/components/quan-tri/mini-app-admin-view";

export default async function QuanTriMiniAppPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?then=%2Fquan-tri%2Fmini-app");
  if (!session.roles.includes("admin")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);

  return (
    <MiniAppAdminView
      roles={session.roles}
      displayName={session.displayName}
      email={identity?.email ?? ""}
    />
  );
}
