// apps/hub/server/consent-gate.ts — cổng "phụ huynh chưa bấm điều khoản" cho Server
// Component. Dùng ở app/home/page.tsx (chỗ phụ huynh luôn đi qua sau khi đăng nhập) và
// ở app/dieu-khoan/page.tsx.
//
// ĐỌC KỸ TRƯỚC KHI SỬA — file này KHÔNG PHẢI chốt chặn.
//
// Chốt chặn thật nằm ở RLS của `attendance.checkins`: hai policy `checkins_insert_self` và
// `checkins_update_self` (bản 0047) chỉ nhận giá trị `mood` khi
// `core.has_student_consent(student_id)` đúng. Đó là thứ có răng — nó đúng cả khi người ta
// gọi thẳng POST /api/trpc, không đi qua trang nào.
//
// TRƯỚC 0047 chốt chặn nằm ở tầng danh tính (`core.users.status='pending'` +
// `resolveIdentity`) và nó SAI, không phải sai về kỹ thuật mà sai về chỗ đứng: tắt danh
// tính của một đứa trẻ là tắt luôn `core.is_me()`, tức tắt luôn `help_requests_insert_self`
// — đường DUY NHẤT để chính em bấm "Mình cần gặp thầy cô". Đo đầu-cuối 01/08/2026: phụ
// huynh rút lại đồng ý lúc 10 giờ là em mất nút kêu cứu từ 10 giờ. Đừng khôi phục cách đó.
//
// Cái file này làm là LỚP LỊCH SỰ: đưa phụ huynh tới đúng chỗ có nút bấm, thay vì để họ
// tự hỏi vì sao con mình không chọn được tâm trạng.
import { withUserContext } from "@hub/core/db";
import type { ConsentChildStatus } from "@hub/core/contracts";
import { StudentAccountStatus } from "@hub/core/contracts";

/**
 * Con này CHƯA TRẢ LỜI bản điều khoản đang bắt buộc.
 *
 * Khác hẳn `needsAction`. `needsAction` đúng cho cả ca phụ huynh đã trả lời rõ ràng là
 * KHÔNG (`decision = 'declined'`/`'withdrawn'`) — lúc đó phần ghi tâm trạng của con đang
 * tắt (tài khoản của em thì VẪN BẬT, từ 0047 phiếu đồng ý không còn chạm tới danh tính:
 * câu cũ ở dòng này viết "tài khoản của con vẫn chờ", đúng với 0046 và sai từ 0047 — sửa
 * ở phiên nghiệm thu 01/08/2026), và đó là kết quả
 * người ta CHỌN. Ép người đã chọn quay lại đúng màn hình đó ở mọi lần mở trang chủ là
 * biến một quyết định thành một cái bẫy: họ không có đường nào khác để đi, vì
 * /dieu-khoan là nơi duy nhất họ bị đẩy tới.
 *
 * Nên cổng chỉ đẩy khi câu hỏi CHƯA ĐƯỢC HỎI: chưa bấm gì bao giờ (`decision === null`),
 * hoặc đã bấm nhưng cho một bản điều khoản CŨ HƠN bản đang bắt buộc — bản mới đánh dấu
 * `bat_dong_y_lai` là một câu hỏi mới, không phải câu hỏi cũ hỏi lại (ADR-027).
 */
export function chuaTraLoiBanBatBuoc(child: ConsentChildStatus): boolean {
  if (child.decision === null) return true;
  if (child.termsVersion === null) return true;
  return child.termsVersion < child.requiredVersion;
}

/** Có đứa con nào chưa được hỏi bản đang bắt buộc không. */
export function canHoiDieuKhoan(children: ConsentChildStatus[]): boolean {
  return children.some(chuaTraLoiBanBatBuoc);
}

/**
 * Trạng thái đồng ý của người đang đăng nhập, đọc thẳng bằng RLS context của họ.
 *
 * `core.my_consent_status()` tự lọc theo `core.current_user_id()` nên người không phải
 * phụ huynh nhận 0 dòng — và 0 dòng ở đây có nghĩa "không có gì để hỏi", đúng.
 *
 * LỖI CSDL KHÔNG ĐƯỢC BIẾN THÀNH CỔNG: nếu Postgres trục trặc thì hàm này ném, và nơi
 * gọi phải chọn cho im lặng (xem app/home/page.tsx). Chặn phụ huynh khỏi trang chủ vì
 * một lỗi kết nối là phạt sai người.
 */
export async function readConsentChildren(authUid: string): Promise<ConsentChildStatus[]> {
  return withUserContext(authUid, async (client) => {
    const { rows } = await client.query<{
      student_id: string;
      student_code: string;
      student_name: string;
      decision: "granted" | "withdrawn" | null;
      decided_at: string | null;
      terms_version: number | null;
      required_version: number;
      needs_action: boolean;
      account_status: string;
      mood_enabled: boolean;
    }>("select * from core.my_consent_status()");

    return rows.map((r) => ({
      studentId: r.student_id,
      studentCode: r.student_code,
      studentName: r.student_name,
      decision: r.decision,
      decidedAt: r.decided_at,
      termsVersion: r.terms_version,
      requiredVersion: r.required_version,
      needsAction: r.needs_action,
      accountStatus: StudentAccountStatus.parse(r.account_status),
      moodEnabled: r.mood_enabled,
    }));
  });
}
