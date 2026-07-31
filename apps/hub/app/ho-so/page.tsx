import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { ProfileView } from "@/components/profile-view";

export default async function ProfilePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const identity = await resolveIdentity(session.authUid);
  const isStudent = session.roles.includes("student");

  return <ProfileView isStudent={isStudent} displayName={session.displayName} email={identity?.email ?? ""} />;
}
