import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { GrowthReportView } from "@/components/growth-report-view";

export default async function BaoCaoPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const isStudent = session.roles.includes("student");
  const identity = isStudent ? await resolveIdentity(session.authUid) : null;

  return (
    <GrowthReportView
      isStudent={isStudent}
      displayName={session.displayName}
      email={identity?.email ?? ""}
    />
  );
}
