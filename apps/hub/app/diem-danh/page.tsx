import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { AttendanceView } from "@/components/attendance-view";

export default async function AttendancePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?then=%2Fdiem-danh");
  if (!session.roles.includes("student")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);

  return (
    <AttendanceView
      displayName={session.displayName}
      email={identity?.email ?? ""}
      roles={session.roles}
      // Mã lớp THẬT của em. Trước 31/07/2026 màn hình viết chết "Lớp 6A1" ngay dưới
      // tiêu đề nên mọi em lớp khác đọc được một mã lớp không phải của mình.
      classCode={identity?.className ?? null}
    />
  );
}
