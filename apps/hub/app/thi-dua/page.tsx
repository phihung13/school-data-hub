import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { vaoDuocMan } from "@/lib/man-hinh";
import { ThiDuaView } from "@/components/thi-dua-view";

export default async function ThiDuaPage() {
  const session = await getCurrentSession();
  // Giữ `?then=` như mọi màn khác: bấm vào lúc phiên vừa hết hạn thì đăng nhập xong
  // quay lại đúng đây, không rơi về /home.
  if (!session) redirect("/login?then=%2Fthi-dua");
  // Hàng rào THẬT, đọc thẳng bản khai màn hình — không chép tay danh sách vai sang đây.
  // Bảng thi đua công khai TRONG TRƯỜNG (ADR-037), nhưng "trong trường" không gồm phụ
  // huynh (ADR-034 đưa họ ra khỏi phạm vi đợt này) và không gồm tài khoản chưa được gán
  // vai nào. `tests/unit/man-hinh.test.ts` đối chiếu bản khai với hàng rào này và đỏ
  // nếu hai bên lệch — theo CẢ HAI chiều.
  if (!vaoDuocMan("/thi-dua", session.roles)) redirect("/home");

  const identity = await resolveIdentity(session.authUid);

  return (
    <ThiDuaView
      displayName={session.displayName}
      email={identity?.email ?? ""}
      roles={session.roles}
      classCode={identity?.className ?? null}
    />
  );
}
