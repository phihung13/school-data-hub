// apps/hub/app/gvcn/lop/page.tsx — "Lớp chủ nhiệm".
//
// Chặn quyền ở ĐÂY (server component) chứ không chỉ ở tRPC: vào thẳng URL mà không
// phải GVCN thì bị đá về /home trước khi tải bất kỳ dữ liệu nào — người dùng không
// phải nhìn một khung màn hình rồi mới nhận thông báo cấm.
import { redirect } from "next/navigation";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { getCurrentSession } from "@/lib/session";
import { ClassRosterView } from "@/components/gvcn/class-roster-view";

export default async function GvcnClassPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.includes("homeroom")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);
  return <ClassRosterView displayName={session.displayName} email={identity?.email ?? ""} />;
}
