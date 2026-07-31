import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { CheckinView } from "@/components/checkin-view";

export default async function CheckinPage() {
  const session = await getCurrentSession();
  // Giữ `?then=` như /tuan-nay, /diem-danh, /can-gap-thay-co: em bấm nút Check-in lúc
  // phiên vừa hết hạn thì đăng nhập xong quay lại đúng màn check-in, không rơi về /home.
  if (!session) redirect("/login?then=%2Fcheckin");
  if (!session.roles.includes("student")) redirect("/home");

  return <CheckinView />;
}
