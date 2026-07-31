import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { GrowthReportView } from "@/components/growth-report-view";

/**
 * Báo cáo Trưởng thành — màn DUY NHẤT mà phụ huynh mở từ link Zalo.
 *
 * Sửa 31/07/2026 (gói "bao-cao-guard-va-khung"):
 *  - Trước đó trang chỉ chặn "chưa đăng nhập". Mọi nhân viên (kế toán, y tế, tư vấn cụm…)
 *    mở /bao-cao đều vào được, rồi rơi vào một màn cụt: `report.getReportForWeek` không
 *    có báo cáo cho họ, và `isStudent=false` khiến GrowthReportView suy họ là "guardian".
 *    Nay chặn ngay ở server đúng như 4 trang anh em (/checkin, /tuan-nay, /diem-danh,
 *    /can-gap-thay-co): chỉ học sinh và phụ huynh được vào.
 *  - Truyền `roles` thật xuống thay vì để component đoán vai từ `isStudent`.
 *  - Redirect giữ `?then=` để người bấm link Zalo đăng nhập xong quay lại ĐÚNG báo cáo,
 *    không rơi về /home rồi phải tự mò lại.
 */
export default async function BaoCaoPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?then=%2Fbao-cao");

  const isStudent = session.roles.includes("student");
  const isGuardian = session.roles.includes("guardian");
  if (!isStudent && !isGuardian) redirect("/home");

  // Gọi cho cả phụ huynh (trước đây chỉ gọi khi là học sinh): sidebar desktop hiển thị
  // email và mã lớp — thiếu thì bỏ trống chứ không đoán.
  const identity = await resolveIdentity(session.authUid);

  return (
    <GrowthReportView
      isStudent={isStudent}
      displayName={session.displayName}
      email={identity?.email ?? ""}
      roles={session.roles}
      classCode={identity?.className ?? null}
    />
  );
}
