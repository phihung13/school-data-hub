import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { ThisWeekView } from "@/components/this-week-view";

export default async function ThisWeekPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?then=%2Ftuan-nay");
  if (!session.roles.includes("student")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);

  return (
    <ThisWeekView
      displayName={session.displayName}
      email={identity?.email ?? ""}
      roles={session.roles}
      classCode={identity?.className ?? null}
    />
  );
}
