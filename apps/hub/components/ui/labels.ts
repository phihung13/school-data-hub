// apps/hub/components/ui/labels.ts — nhãn hiển thị dùng chung, thuần hàm (test được).
//
// Luật một dòng ở đây: KHÔNG BỊA. Trước 31/07/2026, attendance-view.tsx viết chết
// chuỗi "Lớp 6A1" ngay dưới tiêu đề, nên GVCN lớp 6A2 và mọi học sinh lớp khác đều
// đọc được một mã lớp KHÔNG PHẢI của mình — sai mà trông như thật, loại lỗi tệ nhất
// trong hệ dữ liệu học sinh (cùng gốc với lỗi số 2 đã vá ở hub-sidebar.tsx).
// Không biết lớp thì trả chuỗi rỗng để nơi gọi bỏ hẳn dòng đó, không đoán.

// NHÃN "AI ĐỌC ĐƯỢC CẢM XÚC" ĐÃ GỠ 22/08/2026 — chủ đầu tư bỏ câu, ba màn cùng lượt.
//
// Câu cũ: "Chỉ thầy cô tâm lý và thầy cô chủ nhiệm đọc", in kèm icon `lock` ngay dưới bốn
// ô mặt cười ở popup check-in, ở trang chủ và ở /tuan-nay. Nó là DESIGN-GUIDELINES §9 và
// ADR-035 hiện hình trên màn: lời hứa về phạm vi `core.can_read_mood()`, nói tại đúng chỗ
// em vừa viết ra một câu về mình.
//
// GỠ CÂU KHÔNG GỠ LỜI HỨA. `core.can_read_mood()` không đổi một dòng — chính em, thầy cô
// tâm lý cụm, và GVCN của chính em; không ai khác. Cái mất là chỗ em ĐỌC ĐƯỢC điều đó
// trước khi bấm. Nợ #69 giữ việc này, vì Luật 91/2025 đòi báo trước tại điểm thu thập.
//
// Đừng chép tay câu này vào một màn lẻ. Muốn nói lại thì dựng lại HẰNG SỐ ở đây trước —
// câu đã đổi ba lần trong ngày 01/08/2026 theo phạm vi quyền, và ba bản chép tay là ba
// chỗ sẽ lệch.

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
