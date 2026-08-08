// apps/hub/app/lop-toi-day/page.tsx — "Lớp tôi dạy" (giáo viên bộ môn).
//
// Chặn quyền ở ĐÂY (server component) chứ không chỉ ở tRPC: vào thẳng URL mà không có vai
// thì bị đá về /home trước khi tải bất kỳ dữ liệu nào — người dùng không phải nhìn một
// khung màn hình rồi mới nhận thông báo cấm.
//
// Hai vai, và câu redirect này PHẢI khớp `vai: ["teacher", "homeroom"]` trong
// `lib/man-hinh.ts`: `tests/unit/man-hinh.test.ts` đọc chính câu dưới đây rồi so với bản
// khai. Khai rộng hơn hàng rào thật là "menu 404"; khai hẹp hơn là một màn có thật mà
// không đường nào tới.
//
// KHÁC /gvcn/lop ("Lớp chủ nhiệm"): đường đó chỉ mở cho GVCN và hiện thêm tín hiệu chăm
// sóc. Đường này mở cho cả giáo viên bộ môn và CHỈ có điểm danh — hai màn khác vai, khác
// phạm vi dữ liệu, không dùng chung component.
import { redirect } from "next/navigation";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { getCurrentSession } from "@/lib/session";
import { TeachingView } from "@/components/gv-bo-mon/teaching-view";

export default async function LopToiDayPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const isTeacher = session.roles.includes("teacher");
  const isHomeroom = session.roles.includes("homeroom");
  if (!isTeacher && !isHomeroom) redirect("/home");

  const identity = await resolveIdentity(session.authUid);
  return (
    <TeachingView
      displayName={session.displayName}
      email={identity?.email ?? ""}
      roles={session.roles}
    />
  );
}
