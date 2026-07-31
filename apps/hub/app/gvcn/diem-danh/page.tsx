// apps/hub/app/gvcn/diem-danh/page.tsx — "Điểm danh lớp" (GVCN ghi hộ).
//
// KHÁC /diem-danh của học sinh: đường đó là lịch điểm danh CỦA CHÍNH EM (chỉ đọc),
// đường này là bảng ghi cho CẢ LỚP. Hai màn khác vai, khác quyền, không dùng chung
// component — gộp lại là cách một cú sửa cho vai này làm hỏng vai kia.
import { redirect } from "next/navigation";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { getCurrentSession } from "@/lib/session";
import { ClassAttendanceView } from "@/components/gvcn/class-attendance-view";

export default async function GvcnAttendancePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.includes("homeroom")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);
  return <ClassAttendanceView displayName={session.displayName} email={identity?.email ?? ""} />;
}
