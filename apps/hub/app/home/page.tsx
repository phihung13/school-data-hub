import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { HomeView } from "@/components/home-view";
import { buildMiniApps } from "@/server/mini-apps";

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  // Sidebar (Hub Desktop V2) hiện email — chỉ có qua resolveIdentity, không có
  // trong JWT phiên (session.ts chỉ mang sub/roles/displayName, cố tình gọn).
  const identity = await resolveIdentity(session.authUid);

  return (
    <HomeView
      displayName={session.displayName}
      email={identity?.email ?? ""}
      isStudent={session.roles.includes("student")}
      isHomeroom={session.roles.includes("homeroom")}
      // Vai THẬT của phiên, không phải "student hay là teacher". Trước 31/07/2026
      // sidebar chỉ nhận hai giá trị nên tài khoản quản trị (admin.hung), hiệu
      // trưởng và phụ huynh đều rơi vào nhánh "teacher" và thấy nguyên menu GVCN.
      roles={session.roles}
      classCode={identity?.className ?? null}
      // Lưới mini app chỉ phụ thuộc vai trò, mà vai trò đã nằm sẵn trong phiên ở đây —
      // tính luôn phía server để HTML lần đầu đã có đủ tile. Query tRPC bên trong vẫn
      // chạy (nguồn sự thật duy nhất là router), nhưng nó chỉ xác nhận lại thứ đã hiện.
      initialMiniApps={buildMiniApps(session.roles)}
    />
  );
}
