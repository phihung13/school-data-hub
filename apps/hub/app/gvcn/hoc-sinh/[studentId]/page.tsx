// apps/hub/app/gvcn/hoc-sinh/[studentId]/page.tsx — "Hồ sơ một học sinh" cho GVCN.
//
// Chặn quyền ở ĐÂY (server component) chứ không chỉ ở tRPC, đúng khuôn bốn màn GVCN đã
// có: vào thẳng URL mà không phải GVCN thì bị đá về /home trước khi tải bất kỳ dữ liệu
// nào — người dùng không phải nhìn một khung màn hình rồi mới nhận thông báo cấm.
//
// Trang KHÔNG tự kiểm "em này có thuộc lớp mình không": việc đó thuộc về
// `care.getStudentDetail` (homeroomProcedure + requireMyClass + đối chiếu ghi danh) và
// về RLS. Kiểm hai nơi bằng hai câu truy vấn khác nhau là cách hai câu trả lời bắt đầu
// lệch nhau; ở đây chỉ chặn theo VAI, phần còn lại để đúng một chỗ trả lời.
import { redirect } from "next/navigation";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { getCurrentSession } from "@/lib/session";
import { StudentDetailView } from "@/components/gvcn/student-detail-view";

export default async function GvcnStudentDetailPage({
  params,
}: {
  params: { studentId: string };
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.includes("homeroom")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);
  return (
    <StudentDetailView
      studentId={params.studentId}
      displayName={session.displayName}
      email={identity?.email ?? ""}
    />
  );
}
