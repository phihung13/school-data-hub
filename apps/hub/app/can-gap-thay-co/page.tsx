import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { HelpRequestView } from "@/components/help-request-view";

export default async function HelpRequestPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?then=%2Fcan-gap-thay-co");
  if (!session.roles.includes("student")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);

  return (
    <HelpRequestView
      displayName={session.displayName}
      email={identity?.email ?? ""}
      roles={session.roles}
      classCode={identity?.className ?? null}
    />
  );
}
