import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { CheckinView } from "@/components/checkin-view";

export default async function CheckinPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.includes("student")) redirect("/home");

  return <CheckinView />;
}
