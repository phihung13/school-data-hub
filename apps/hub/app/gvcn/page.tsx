import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { GvcnDashboard } from "@/components/gvcn-dashboard";

export default async function GvcnPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.includes("homeroom")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);

  return <GvcnDashboard displayName={session.displayName} email={identity?.email ?? ""} />;
}
