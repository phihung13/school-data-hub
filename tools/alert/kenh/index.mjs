// tools/alert/kenh/index.mjs — SỔ ĐĂNG KÝ ADAPTER GỬI.
//
// Đây là "giao diện gửi" mà cả gói kênh báo động xoay quanh. Ngày trường mua được
// Zalo OA, việc phải làm đúng bằng hai bước và KHÔNG có bước nào là viết lại:
//
//   1. Thêm `tools/alert/kenh/zalo-oa.mjs` xuất ra một hàm `gui({ tin, kenh })`.
//   2. Thêm một dòng vào bảng `ops.alert_channels` (kind = 'zalo_oa') bằng migration.
//
// Không đổi bảng, không đổi hàm SQL, không đổi bộ gửi. Đó là toàn bộ lý do tách
// adapter ra chứ không viết thẳng lệnh ghi tệp vào bộ gửi.
//
// ── Vì sao KHÔNG có adapter giả cho zalo_oa/smtp ở đây ──────────────────────────
// Một adapter "sẽ làm sau" trả về thành công là thứ nguy hiểm nhất gói này có thể
// đẻ ra: từ hôm đó mọi tin đều `da_gui`, sổ trực xanh, và không ai được báo gì cả.
// Kênh chưa có adapter thì bộ gửi phải HỎNG TO — xem `khongBietGui` bên dưới.
import * as tepNhatKy from "./tep-nhat-ky.mjs";

/** kind (ops.alert_channels.kind) → adapter. Chỉ những loại đã chạy được THẬT. */
export const BO_GUI = Object.freeze({
  [tepNhatKy.KIND]: tepNhatKy,
});

/** Danh sách loại kênh đang có bộ gửi, để in ra cho người vận hành đọc. */
export function cacLoaiCoBoGui() {
  return Object.keys(BO_GUI).sort();
}

/**
 * Lấy adapter cho một dòng kênh. Không tìm thấy thì ném lỗi có TÊN LOẠI trong câu —
 * cùng hình dạng với nhánh "THIẾU BỘ CHẠY" của run-all.mjs: một dòng cấu hình trỏ
 * vào hư không phải kêu to, không được im lặng thành công.
 */
export function boGuiCho(kenh) {
  const adapter = BO_GUI[kenh?.kind];
  if (!adapter) throw new Error(khongBietGui(kenh?.kind));
  return adapter;
}

export function khongBietGui(kind) {
  return (
    `Chưa có bộ gửi cho loại kênh "${kind}". ` +
    `Đang có: ${cacLoaiCoBoGui().join(", ")}. ` +
    `Thêm một file trong tools/alert/kenh/ rồi khai vào BO_GUI — ` +
    `đừng tắt dòng kênh này để cho qua, tắt kênh là tắt báo động.`
  );
}
