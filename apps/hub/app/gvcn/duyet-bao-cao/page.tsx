// apps/hub/app/gvcn/duyet-bao-cao/page.tsx — "Duyệt báo cáo".
//
// Cửa duy nhất tới sổ duyệt report.growth_report_approvals (0032). Quyết định duyệt
// ký tên người đang đăng nhập, nên chặn vai ở đây rồi chặn lại ở RLS: chữ ký duyệt mà
// giả được thì cả sổ vô nghĩa.
import { redirect } from "next/navigation";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { getCurrentSession } from "@/lib/session";
import { ReportApprovalView } from "@/components/gvcn/report-approval-view";

export default async function GvcnReportApprovalPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.includes("homeroom")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);
  return <ReportApprovalView displayName={session.displayName} email={identity?.email ?? ""} />;
}
