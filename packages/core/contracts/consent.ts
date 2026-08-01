// packages/core/contracts/consent.ts
// Router `consent` — màn điều khoản kèm nút đồng ý (migration 0046, ADR-027).
//
// Bề mặt này cố ý HẸP: đúng một câu hỏi ("người đang đăng nhập còn phải bấm gì không")
// và đúng một hành động ("ghi lại quyết định"). Mọi thứ quyết định hiệu lực pháp lý —
// bản nào đang bắt buộc, phiếu cũ còn giá trị không, tài khoản của con bật hay chờ —
// nằm trong SQL (`core.record_consent`, `core.required_terms_version`), không nằm ở đây.
// Lý do: client là thứ người ta sửa được; hàng rào phải ở nơi người ta không sửa được.
import { z } from "zod";

/**
 * BA giá trị, không phải hai — khớp CHECK `consent_records_decision_chk` (0046):
 *   · `granted`   — đồng ý.
 *   · `declined`  — đã được hỏi và trả lời KHÔNG (chưa bao giờ đồng ý).
 *   · `withdrawn` — đã đồng ý rồi rút lại.
 * Gộp hai giá trị sau làm một thì về sau không phân biệt được người chưa bao giờ đồng ý
 * với người đã đổi ý — hai câu chuyện pháp lý khác nhau, và hai câu chuyện khác nhau với
 * đứa trẻ.
 */
export const ConsentDecision = z.enum(["granted", "declined", "withdrawn"]);
export type ConsentDecision = z.infer<typeof ConsentDecision>;

/**
 * Trạng thái DANH TÍNH của tài khoản đứa con — từ `0047`/ADR-027 bản 2, nó KHÔNG còn dính
 * gì tới phiếu đồng ý. Bốn giá trị có thể xảy ra:
 *   · `no_account` — em chưa có tài khoản đăng nhập (63/64 em trên hub_dev hôm nay).
 *     Đây là trạng thái HỢP LỆ, không phải lỗi, và màn hình phải nói khác `pending`.
 *   · `pending`    — tài khoản vừa lập, chưa bàn giao cho ai. Sau `0047` không đường nào
 *     HẠ một tài khoản đang dùng xuống giá trị này (trigger `users_no_pending_downgrade`):
 *     danh tính là thứ đường kêu cứu của em bám vào, nên nó không được tắt theo một thao
 *     tác hành chính của người lớn.
 *   · `active`     — đang dùng được.
 *   · `disabled`   — bị khoá/đã ẩn danh hoá (Luật 91/2025, `0033`).
 *
 * Thứ phiếu đồng ý thật sự điều khiển nằm ở `moodEnabled` bên dưới, không ở đây.
 */
export const StudentAccountStatus = z.enum(["no_account", "pending", "active", "disabled"]);
export type StudentAccountStatus = z.infer<typeof StudentAccountStatus>;

/** Bản điều khoản đang trình cho phụ huynh đọc. Nội dung là Markdown, nguồn duy nhất là DB. */
export const TermsVersionOutput = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  title: z.string(),
  bodyMd: z.string(),
  /** SHA-256 của nội dung. Hiện trên màn để phụ huynh đối chiếu về sau nếu cần. */
  contentHash: z.string(),
  /** Bản này có buộc mọi phụ huynh bấm lại không (ADR-027 phương án B). */
  requiresReconsent: z.boolean(),
  publishedAt: z.string(),
});
export type TermsVersionOutput = z.infer<typeof TermsVersionOutput>;

export const ConsentChildStatus = z.object({
  studentId: z.string().uuid(),
  studentCode: z.string(),
  studentName: z.string(),
  /** `null` = chưa từng bấm gì cho em này. Khác hẳn `"withdrawn"` (đã bấm rồi rút lại). */
  decision: ConsentDecision.nullable(),
  decidedAt: z.string().nullable(),
  /** Số phiên bản phụ huynh đã ký. `null` khi chưa ký bản nào. */
  termsVersion: z.number().int().nullable(),
  /** Bản thấp nhất còn được chấp nhận hôm nay (`core.required_terms_version`). */
  requiredVersion: z.number().int(),
  needsAction: z.boolean(),
  accountStatus: StudentAccountStatus,
  /**
   * Phần mềm CÓ đang ghi tâm trạng hằng ngày của em này không — tức thứ cú bấm của bố mẹ
   * thật sự bật/tắt (0047, ADR-027 bản 2).
   *
   * KHÔNG suy được từ `needsAction`: nhà có hai người đại diện mà người kia đã bấm thì
   * phần này ĐANG BẬT, dù người đang đăng nhập vẫn còn việc phải làm. Nguồn là
   * `core.has_student_consent()`, hỏi theo ĐỨA TRẺ chứ không theo người bấm.
   */
  moodEnabled: z.boolean(),
});
export type ConsentChildStatus = z.infer<typeof ConsentChildStatus>;

/**
 * Output của `consent.getGate`. `terms` là `null` khi trường chưa công bố bản nào —
 * lúc đó KHÔNG ai bị chặn, và màn hình phải nói đúng chừng đó thay vì hiện một ô trống.
 */
export const ConsentGateOutput = z.object({
  terms: TermsVersionOutput.nullable(),
  children: z.array(ConsentChildStatus),
  /** Còn ít nhất một đứa con chưa có phiếu còn hiệu lực. */
  needsAction: z.boolean(),
});
export type ConsentGateOutput = z.infer<typeof ConsentGateOutput>;

export const RecordConsentInput = z.object({
  /** Bấm cho từng con — một phụ huynh có thể có nhiều con, và có quyền quyết định khác nhau. */
  studentIds: z.array(z.string().uuid()).min(1).max(20),
  termsVersionId: z.string().uuid(),
  decision: ConsentDecision,
  /**
   * Dấu vết thiết bị, do trình duyệt tự khai. Đây là GỢI Ý cho hậu kiểm, KHÔNG phải
   * bằng chứng: client sửa được chuỗi này. Bằng chứng thật là `user_id` + `decided_at`
   * + băm nội dung, cả ba do máy chủ ghi. Máy chủ cắt còn 300 ký tự.
   */
  userAgent: z.string().max(500).optional(),
});
export type RecordConsentInput = z.infer<typeof RecordConsentInput>;

export const RecordConsentResult = z.object({
  studentId: z.string().uuid(),
  consentId: z.string().uuid(),
  /** `false` = quyết định đó đã được ghi từ trước (§9 — bấm hai lần không sinh hai phiếu). */
  created: z.boolean(),
  /** Trạng thái DANH TÍNH sau lần bấm — và nó KHÔNG đổi vì lần bấm này (0047). */
  accountStatus: StudentAccountStatus,
  /** Hậu quả THẬT của lần bấm: phần mềm còn ghi tâm trạng của em này nữa không. */
  moodEnabled: z.boolean(),
});
export type RecordConsentResult = z.infer<typeof RecordConsentResult>;

export const RecordConsentOutput = z.object({
  results: z.array(RecordConsentResult),
  /** Tính lại SAU khi ghi — màn hình không được tự suy ra từ thao tác vừa bấm. */
  needsAction: z.boolean(),
});
export type RecordConsentOutput = z.infer<typeof RecordConsentOutput>;
