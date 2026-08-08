import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { CheckinView } from "@/components/checkin-view";

export default async function CheckinPage() {
  const session = await getCurrentSession();
  // Giữ `?then=` như /tuan-nay, /diem-danh, /can-gap-thay-co: em bấm nút Check-in lúc
  // phiên vừa hết hạn thì đăng nhập xong quay lại đúng màn check-in, không rơi về /home.
  if (!session) redirect("/login?then=%2Fcheckin");
  if (!session.roles.includes("student")) redirect("/home");

  // Danh tính chỉ để DỰNG KHUNG (menu trái + thanh tab + nhãn lớp) — không màn nào của
  // /checkin đọc dữ liệu từ đây. Cùng đường mà /can-gap-thay-co và /diem-danh đang đi.
  const identity = await resolveIdentity(session.authUid);

  return (
    <CheckinView
      displayName={session.displayName}
      email={identity?.email ?? ""}
      roles={session.roles}
      classCode={identity?.className ?? null}
    />
  );
}
