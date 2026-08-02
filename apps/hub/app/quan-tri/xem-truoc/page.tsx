// apps/hub/app/quan-tri/xem-truoc/page.tsx — trang chủ của mọi vai, cạnh nhau.
//
// Chặn quyền ở ĐÂY (server component) chứ không chỉ ở tRPC, đúng khuôn mọi màn quản trị.
// Màn này liệt kê ĐẦY ĐỦ những gì từng vai nhìn thấy, kể cả những vai không phải người
// đang xem — đó là bản đồ phân quyền của cả hệ, không phải một trang tiện ích.
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { XemTruocVaiView } from "@/components/quan-tri/xem-truoc-vai-view";

export default async function XemTruocPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?then=%2Fquan-tri%2Fxem-truoc");
  if (!session.roles.includes("admin")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);

  return (
    <XemTruocVaiView
      roles={session.roles}
      displayName={session.displayName}
      email={identity?.email ?? ""}
    />
  );
}
