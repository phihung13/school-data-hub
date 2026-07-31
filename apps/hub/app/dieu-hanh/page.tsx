// apps/hub/app/dieu-hanh/page.tsx — màn "Điều hành" (BGH cơ sở + ban điều hành).
//
// Chặn quyền ở ĐÂY (server component) chứ không chỉ ở tRPC, giống bốn màn GVCN: gõ
// thẳng URL mà không mang vai principal/board thì bị đá về /home TRƯỚC khi tải bất kỳ
// dữ liệu nào. Ba lớp cổng, cả ba fail closed và không lớp nào thay được lớp kia:
//   · ở đây      — không đúng vai thì không render màn;
//   · roleProcedure — đối chiếu core.v_my_scopes, không tin JWT (token sống 15 phút);
//   · 0040       — hàm SQL tự kiểm vai lần nữa vì nó chạy SECURITY DEFINER.
import { redirect } from "next/navigation";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { getCurrentSession } from "@/lib/session";
import { OperationsView } from "@/components/dieu-hanh/operations-view";

export default async function DieuHanhPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.includes("principal") && !session.roles.includes("board")) redirect("/home");

  const identity = await resolveIdentity(session.authUid);
  return (
    <OperationsView
      displayName={session.displayName}
      email={identity?.email ?? ""}
      roles={session.roles}
    />
  );
}
