// packages/core/contracts/teaching.ts — hợp đồng cho màn ĐẦU TIÊN của giáo viên BỘ MÔN.
//
// ── Vì sao có file này (06/08/2026) ─────────────────────────────────────────
// Vai `teacher` đăng nhập vào Hub và cho tới hôm nay chỉ có `/home`, không màn nào khác.
// Chủ đầu tư hỏi thẳng: "họ không có gì ngoài trang chủ?".
//
// ── Vì sao KHÔNG nối vào `care.ts` ──────────────────────────────────────────
// `contracts/care.ts` mở đầu bằng một dòng lý lẽ: bốn màn ở đó là buồng lái của CÙNG một
// người (GVCN) trên CÙNG một lớp, chung `homeroomProcedure` và chung khái niệm "lớp chủ
// nhiệm". Màn này không thuộc tập đó — người đọc khác (giáo viên bộ môn), phạm vi khác
// (`core.class_assignments` mọi vai trò phân công, không riêng `homeroom`), và quan trọng
// nhất: TẬP TRƯỜNG ĐƯỢC PHÉP TRẢ VỀ hẹp hơn hẳn. Để chung file là mỗi lần ai đó thêm một
// field vào `ClassRosterEntry` thì phải nhớ rằng có một vai thứ hai đang đọc cùng chỗ.
//
// ── ĐO ĐƯỢC, không phải suy đoán: vai này thấy gì ───────────────────────────
// Đo 06/08/2026 trên hub_dev, trong transaction + `set local role authenticated` +
// `core.begin_user_context`, dưới danh tính Thầy Nam (bộ môn Toán, dạy 6A1/6A2/6A3):
//
//   core.students          36 dòng   (đúng 3 lớp thầy dạy — nhánh `core.teaches` của
//                                     `core.can_see_student`, migration 0009)
//   attendance.checkins    181 dòng  đọc được
//   cột `mood`             permission denied (42501) — grant theo CỘT, migration 0044
//   care.flags             0 dòng    (`core.can_see_care` = homeroom ∨ cụm, KHÔNG có teaches)
//   attendance.help_requests 0 dòng  (`help_requests_scope`, 0037)
//
// Nên hợp đồng này CỐ Ý không có, và không được phép có: `mood`, cờ chăm sóc, `helpPending`,
// `hasOpenCase`, ghi chú tư vấn. PRODUCT.md ghi rõ với lời "cần gặp thầy cô": "Bạn cùng lớp,
// thầy cô dạy môn, thầy cô lớp khác, bố mẹ, BGH: không."
//
// Đây không phải "quên chưa làm" mà là hình dạng đúng của hợp đồng: một field trả `null`
// vì không được phép đọc sẽ lẫn với `null` vì chưa ai ghi — cùng cái bẫy mà `ClassRosterEntry`
// đã tránh khi GỠ HẲN `mood` thay vì để nó thành nullable (ADR-026).
//
// ── MỘT THỨ THIẾU, nói ra thay vì bịa: TÊN MÔN ─────────────────────────────
// `TeachingClass` KHÔNG có field `subject`, dù đó là thứ tự nhiên phải có trên màn "Lớp tôi
// dạy". Lý do nằm ở tầng dữ liệu, đo được: `core.class_assignments.subject` là cột DUY NHẤT
// chứa tên môn, và bảng đó KHÔNG được GRANT cho `authenticated` (migration 0024 có hẳn một
// assertion khoá điều này). Đo dưới phiên Thầy Nam: `select subject from
// core.class_assignments` → `42501 permission denied for table class_assignments`.
// Không hàm/view nào đang mở cột đó ra.
//
// Mở nó cần một view `security definer` mới + `grant select` — tức là MỘT MIGRATION, và mở
// quyền là việc phải có người quyết, không phải việc gói dựng màn tự làm. Cho tới lúc đó,
// hợp đồng thiếu một field còn hơn màn hình in ra một tên môn đoán mò.
import { z } from "zod";
import { AttendanceStatus } from "./care.ts";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải ở dạng YYYY-MM-DD");

/**
 * Một lớp trong danh sách "Lớp tôi dạy", kèm tình hình điểm danh của ĐÚNG ngày đang xem.
 *
 * Bốn con số, và ràng buộc giữa chúng là thứ giữ cho màn hình khỏi nói dối:
 *   `studentCount` = `recordedCount` + `noRecordCount`, và `absentCount ⊆ recordedCount`.
 *
 * Vì sao KHÔNG dùng khuôn `SuppressibleCount` (`z.number().nullable()`) của
 * `server/routers/report.ts`: ở đó `null` nghĩa là "nhóm nhỏ hơn `report.min_cohort()` nên
 * che đi" — một phép ẩn danh cho màn TỔNG HỢP của BGH. Màn này ngược hẳn: thầy cô đang nhìn
 * đúng những em mình dạy, RLS đã cho đọc từng dòng, nên che số ở đây không bảo vệ ai mà chỉ
 * làm màn hình có một trạng thái `null` không bao giờ xảy ra. Số ở đây luôn là số thật.
 */
export const TeachingClass = z.object({
  classId: z.string().uuid(),
  classCode: z.string(),
  studentCount: z.number().int().nonnegative(),
  /**
   * Số em ĐÃ CÓ một dòng điểm danh hôm đó (bất kể trạng thái nào trong năm trạng thái).
   * KHÔNG phải "số em có mặt" — tên cũ đó là cách "gửi muộn" bị đếm thành "đã tới lớp".
   */
  recordedCount: z.number().int().nonnegative(),
  /** CHỈ `status = 'absent'`. `excused` là có phép, `queued_late` là chờ xác nhận — không gộp. */
  absentCount: z.number().int().nonnegative(),
  /**
   * Chưa ai ghi gì. QĐ-3 (01/08/2026): **chưa điểm danh ≠ vắng**. Đây là con số riêng chứ
   * không phải phần bù tự tính ở màn hình, để không ai "tiện tay" cộng nó vào `absentCount`.
   */
  noRecordCount: z.number().int().nonnegative(),
});
export type TeachingClass = z.infer<typeof TeachingClass>;

/**
 * `asOfDate` bắt buộc đi kèm: bốn con số trên chỉ đúng cho MỘT ngày, và màn hình mở lúc
 * 00:05 giờ Việt Nam với màn hình mở lúc 23:55 đang nói về hai ngày khác nhau.
 */
export const GetMyTeachingClassesOutput = z.object({
  asOfDate: IsoDate,
  classes: z.array(TeachingClass),
});
export type GetMyTeachingClassesOutput = z.infer<typeof GetMyTeachingClassesOutput>;

/**
 * `classId` để trống = lớp đầu tiên THEO MÃ LỚP, đúng thứ tự `GetMyTeachingClassesOutput`
 * trả về — nên bộ chọn lớp và máy chủ luôn mở cùng một lớp.
 *
 * Truyền lớp mình KHÔNG dạy → FORBIDDEN. Máy chủ đối chiếu với `core.class_assignments` của
 * chính người gọi, không tin tham số (xem `requireMyTeachingClass` trong router).
 */
export const GetTeachingRosterInput = z.object({
  classId: z.string().uuid().optional(),
  onDate: IsoDate.optional(),
});
export type GetTeachingRosterInput = z.infer<typeof GetTeachingRosterInput>;

/**
 * Một em trong danh sách lớp mình dạy. BỐN field, và danh sách này là một hàng rào:
 * thêm bất kỳ field nào chạm cảm xúc / chăm sóc / lời "cần gặp thầy cô" là vi phạm
 * ADR-026 và PRODUCT.md — `tests/db/gv-bo-mon.test.ts` khẳng định lại bằng hình dạng
 * object trả về thật, không chỉ bằng kiểu TypeScript.
 */
export const TeachingRosterEntry = z.object({
  studentId: z.string().uuid(),
  /** §1 — mã hiển thị bất biến, không phải id nội bộ. */
  studentCode: z.string(),
  fullName: z.string(),
  /** `null` = chưa có dòng điểm danh nào hôm đó. KHÔNG được vẽ thành "Vắng" (QĐ-3). */
  status: AttendanceStatus.nullable(),
});
export type TeachingRosterEntry = z.infer<typeof TeachingRosterEntry>;

export const GetTeachingRosterOutput = z.object({
  classId: z.string().uuid(),
  className: z.string(),
  asOfDate: IsoDate,
  students: z.array(TeachingRosterEntry),
});
export type GetTeachingRosterOutput = z.infer<typeof GetTeachingRosterOutput>;
