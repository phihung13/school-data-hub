// apps/hub/app/tam-ly/ho-so/[studentId]/page.tsx — hồ sơ MỘT em, cho tâm lý cụm.
//
// Chặn theo VAI ở đây; phần "em này có thuộc cụm của mình không" để đúng một chỗ trả
// lời (`care.getClusterCaseDetail` + RLS `core.can_see_care`). Cùng lý lẽ đã ghi ở
// app/gvcn/hoc-sinh/[studentId]/page.tsx.
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { ClusterCaseDetailView } from "@/components/tam-ly/cluster-case-detail-view";

export default async function TamLyCaseDetailPage({
  params,
}: {
  params: { studentId: string };
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.includes("counselor")) redirect("/home");

  return <ClusterCaseDetailView studentId={params.studentId} />;
}
