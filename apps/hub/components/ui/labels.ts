// apps/hub/components/ui/labels.ts — nhãn hiển thị dùng chung, thuần hàm (test được).
//
// Luật một dòng ở đây: KHÔNG BỊA. Trước 31/07/2026, attendance-view.tsx viết chết
// chuỗi "Lớp 6A1" ngay dưới tiêu đề, nên GVCN lớp 6A2 và mọi học sinh lớp khác đều
// đọc được một mã lớp KHÔNG PHẢI của mình — sai mà trông như thật, loại lỗi tệ nhất
// trong hệ dữ liệu học sinh (cùng gốc với lỗi số 2 đã vá ở hub-sidebar.tsx).
// Không biết lớp thì trả chuỗi rỗng để nơi gọi bỏ hẳn dòng đó, không đoán.

/**
 * Nhãn `lock` in NGAY TẠI CHỖ em nhập cảm xúc — bốn ô mặt cười ở /checkin, lưới
 * check-in trên trang chủ, và mọi ô nhập cảm xúc phát sinh sau này.
 *
 * Đây là một HẰNG SỐ dùng chung chứ không phải chuỗi viết tay ở từng màn, và lý do rất
 * cụ thể: câu này đã đổi BA LẦN trong ngày 01/08/2026 ("Chỉ thầy cô chủ nhiệm thấy" →
 * "…chủ nhiệm và thầy cô tâm lý thấy" → câu hiện tại), mỗi lần vì phạm vi
 * `core.can_read_mood()` ở tầng dữ liệu đổi. Ba lần chép tay ra ba màn là ba cơ hội để
 * một màn quên sửa — và màn quên sửa sẽ là màn ít người mở nhất, tức là lời hứa sai
 * sống lâu nhất ở chỗ khó bắt nhất. Nhãn nói ít hơn hoặc nhiều hơn sự thật đều là nói
 * dối, và đây là lời hứa với một đứa trẻ về chính câu nó vừa viết ra.
 *
 * Nguồn chốt: `danh-cho-may/DESIGN-GUIDELINES.md` §9 (ADR-035, migration 0059 —
 * `core.can_read_mood()` = `is_me ∨ in_my_cluster ∨ is_homeroom_of`). ĐỔI QUYỀN THÌ ĐỔI CÂU NÀY TRONG
 * CÙNG MỘT LẦN, không hẹn lại.
 *
 * §8 cấm từ vựng vận hành trước mặt học sinh, nên câu này không có chữ "GVCN", "cờ",
 * "ngưỡng", "quét".
 */
export const NHAN_AI_DOC_CAM_XUC = "Chỉ thầy cô tâm lý và thầy cô chủ nhiệm đọc";

/** "6A2" → "Lớp 6A2". null/rỗng → "" (nơi gọi phải bỏ hẳn dòng, không thay bằng gì). */
export function classLabel(classCode: string | null | undefined): string {
  const trimmed = classCode?.trim();
  return trimmed ? `Lớp ${trimmed}` : "";
}

/**
 * Bỏ hậu tố chức danh trong ngoặc của `core.users.full_name` ("Cô Lan (GVCN 6A1)"
 * → "Cô Lan"). Dùng khi cần GỌI TÊN người ta trong câu văn; chỗ hiển thị hồ sơ
 * vẫn giữ tên đầy đủ.
 */
export function personName(fullName: string | null | undefined): string {
  return (fullName ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}
