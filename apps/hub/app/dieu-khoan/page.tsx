import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { TermsGateView } from "@/components/dieu-khoan/terms-gate-view";

/**
 * /dieu-khoan — màn điều khoản kèm nút đồng ý (migration 0046, ADR-027).
 *
 * Đây là CỔNG THEO TRẠNG THÁI, không phải một bước trong luồng đổi mã mời. Khác biệt đó
 * là một cái bẫy đã đo được, không phải chuyện văn phong:
 *
 *   `core.redeem_parent_invite_code` (0036) là thứ TẠO ra tài khoản phụ huynh, nên trước
 *   bước đó không tồn tại `user_id` nào để gắn phiếu đồng ý vào — màn này BẮT BUỘC đứng
 *   sau khi đổi mã. Nhưng theo ADR-024 mã chết sau 15 phút, và hôm nay phụ huynh KHÔNG
 *   có đường đăng nhập nào khác (Zalo OAuth chưa nối; /api/auth/dev-login là DEV ONLY).
 *   Nếu màn này là một bước wizard hiện đúng một lần ngay sau đổi mã thì phụ huynh nào
 *   đóng app giữa chừng sẽ vĩnh viễn không quay lại bấm được, và tài khoản của con không
 *   bao giờ bật — phải xin mã mới chỉ để bấm một cái tick.
 *
 * Nên: vào lại bao nhiêu lần cũng thấy nó, và trang chủ tự đưa tới đây khi còn câu hỏi
 * chưa được trả lời (xem app/home/page.tsx + server/consent-gate.ts).
 *
 * Không chặn theo vai bằng redirect câm: người không phải phụ huynh vào đây thì
 * `consent.getGate` trả FORBIDDEN kèm câu tiếng Việt, và ErrorState hiện đúng câu đó.
 * Đá họ về /home không một lời là đúng kiểu hỏng mà repo này đã ghét một lần rồi.
 */
export default async function DieuKhoanPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?then=%2Fdieu-khoan");

  return <TermsGateView displayName={session.displayName} />;
}
