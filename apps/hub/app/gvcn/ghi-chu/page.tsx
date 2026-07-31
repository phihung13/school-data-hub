// apps/hub/app/gvcn/ghi-chu/page.tsx — "Ghi chú can thiệp".
//
// Màn này chạm care.interventions — vùng chăm sóc (§3). Chặn vai ở server component,
// và mọi câu đọc/ghi bên dưới vẫn đi qua core.can_see_care() ở tầng DB.
import { redirect } from "next/navigation";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { getCurrentSession } from "@/lib/session";
import { InterventionNotesView } from "@/components/gvcn/intervention-notes-view";

export default async function GvcnNotesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.includes("homeroom")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);
  return <InterventionNotesView displayName={session.displayName} email={identity?.email ?? ""} />;
}
