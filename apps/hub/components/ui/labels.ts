// apps/hub/components/ui/labels.ts — nhãn hiển thị dùng chung, thuần hàm (test được).
//
// Luật một dòng ở đây: KHÔNG BỊA. Trước 31/07/2026, attendance-view.tsx viết chết
// chuỗi "Lớp 6A1" ngay dưới tiêu đề, nên GVCN lớp 6A2 và mọi học sinh lớp khác đều
// đọc được một mã lớp KHÔNG PHẢI của mình — sai mà trông như thật, loại lỗi tệ nhất
// trong hệ dữ liệu học sinh (cùng gốc với lỗi số 2 đã vá ở hub-sidebar.tsx).
// Không biết lớp thì trả chuỗi rỗng để nơi gọi bỏ hẳn dòng đó, không đoán.

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
