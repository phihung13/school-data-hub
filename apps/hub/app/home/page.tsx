import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { HomeView } from "@/components/home-view";
import { buildMiniAppsWithEmbedded } from "@/server/mini-apps";
import { canHoiDieuKhoan, readConsentChildren } from "@/server/consent-gate";
import { phaiDungOCheckin } from "@/server/checkin-gate";
import { log, describeError } from "@/lib/logger";

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  // CỔNG ĐIỀU KHOẢN (0046, ADR-027) — đặt ở trang chủ vì đây là nơi phụ huynh LUÔN đi
  // qua sau khi đăng nhập (`login-form.tsx` nạp lại cả trang về /home, /api/auth/invite
  // cũng vậy). Chỉ đẩy khi câu hỏi CHƯA ĐƯỢC HỎI — phụ huynh đã trả lời "chưa đồng ý"
  // thì không bị đưa về đây nữa, nếu không thì một quyết định biến thành cái bẫy không
  // có đường ra (xem `chuaTraLoiBanBatBuoc`).
  //
  // Đây KHÔNG phải chốt chặn. Chốt chặn (từ 0047, ADR-027 bản 2) là RLS trên
  // `attendance.checkins`: không có phiếu đồng ý thì cột `mood` không nhận giá trị, kể cả
  // khi ai đó gọi thẳng /api/trpc mà không đi qua trang nào. Nó CỐ Ý không còn khoá tài
  // khoản của em nữa — khoá tài khoản là cắt luôn nút "Mình cần gặp thầy cô" của chính em.
  if (session.roles.includes("guardian")) {
    try {
      if (canHoiDieuKhoan(await readConsentChildren(session.authUid))) redirect("/dieu-khoan");
    } catch (err) {
      // `redirect()` của Next hoạt động bằng cách NÉM một lỗi đặc biệt — bắt nó ở đây
      // rồi nuốt là biến chuyển hướng thành im lặng. Ném tiếp cho Next xử.
      if (typeof (err as { digest?: unknown })?.digest === "string") throw err;
      // CSDL trục trặc thì KHÔNG được biến thành cổng: chặn phụ huynh khỏi trang chủ vì
      // một lỗi kết nối là phạt sai người. Ghi log rồi đi tiếp.
      log("error", "consent.gate_read_failed", { authUid: session.authUid, ...describeError(err) });
    }
  }

  // CỔNG CHECK-IN CẢM XÚC (ADR-036, 21/08/2026) — học sinh đăng nhập lần đầu trong
  // ngày dừng ở màn check-in trước khi vào trang chủ. Cùng khuôn với cổng điều khoản
  // ngay trên: chỉ là LỚP NHỊP, không phải chốt chặn dữ liệu; ba điều cố ý (em chưa có
  // phiếu đồng ý thì KHÔNG chặn · lỗi CSDL thì cho qua · chỉ gác cửa chính) ghi đủ ở
  // đầu server/checkin-gate.ts — sửa cổng thì đọc đó trước.
  if (session.roles.includes("student")) {
    try {
      if (await phaiDungOCheckin(session.authUid)) redirect("/checkin");
    } catch (err) {
      if (typeof (err as { digest?: unknown })?.digest === "string") throw err;
      log("error", "checkin.gate_read_failed", { authUid: session.authUid, ...describeError(err) });
    }
  }

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
      initialMiniApps={await buildMiniAppsWithEmbedded(session.roles)}
    />
  );
}
