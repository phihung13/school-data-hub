// tools/alert/kenh/tep-nhat-ky.mjs — ADAPTER: ghi báo động ra một tệp nhật ký.
//
// Đây là kênh gửi THẬT DUY NHẤT có hôm nay (02/08/2026). Nói thẳng nó là gì và
// không phải là gì, vì cả gói này sinh ra để chống chuyện nói quá:
//
//   NÓ LÀ    : một bản ghi nằm NGOÀI database, có mốc thời gian từng tin, đọc được
//              bằng Notepad, và đọc được cả khi Postgres đang chết — tức là đọc được
//              đúng lúc người ta cần nhất.
//   NÓ KHÔNG : một kênh ĐẨY. Nó không rung điện thoại ai lúc 2 giờ sáng. Người trực
//              vẫn phải mở tệp ra xem. Nợ "kênh đẩy thật" (Zalo OA / SMS) còn nguyên
//              trong DEBT.md #40 và chỉ trả được bằng tiền mua hạ tầng.
//
// Vì sao ghi tệp chứ không gửi email qua một SMTP công cộng nào đó: một tài khoản
// SMTP là một bí mật phải cất, phải xoay vòng, phải có người chịu trách nhiệm. Chưa
// có ai trong trường nhận việc đó (`10-mua-sam-ha-tang.md`). Dựng tạm bằng tài khoản
// cá nhân của một dev là tạo một điểm hỏng không ai biết ngày nó hỏng.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Thư mục mặc định. Đổi được bằng cột `target` của ops.alert_channels hoặc HUB_ALERT_DIR. */
export const THU_MUC_MAC_DINH = join(REPO_ROOT, "var", "bao-dong");

/**
 * Chọn thư mục ghi. Thứ tự: `target` của dòng kênh → biến môi trường → mặc định.
 *
 * Đường dẫn tương đối được neo vào GỐC REPO chứ không vào thư mục hiện hành: bộ lịch
 * gọi job con với cwd = gốc repo, nhưng người vận hành chạy tay thì cwd là bất kỳ đâu.
 * Không neo thì cùng một dòng cấu hình ghi ra hai chỗ khác nhau tuỳ ai bấm.
 */
export function thuMucGhi(kenh = {}) {
  const raw = kenh.target || process.env.HUB_ALERT_DIR || THU_MUC_MAC_DINH;
  return isAbsolute(raw) ? raw : resolve(REPO_ROOT, raw);
}

/** Một tệp cho mỗi ngày: người trực mở đúng tệp của hôm nay, không cuộn qua cả năm. */
export function tenTep(luc = new Date()) {
  const d = new Date(luc.getTime());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const n = String(d.getDate()).padStart(2, "0");
  return `bao-dong-${y}-${m}-${n}.log`;
}

/**
 * Dựng khối chữ cho MỘT tin. Viết cho một giáo viên cầm điện thoại lúc 7 giờ sáng:
 * chuyện gì · nặng tới đâu · phải làm gì. Không có mã lỗi trần trụi, không có JSON.
 *
 * `dedup_key` vẫn được in: nó là chỗ duy nhất nối dòng chữ này với dòng trong
 * database khi cần đối chiếu — và nó cũng là cách một người thấy ngay hai dòng trùng
 * nhau là cùng MỘT tin bị ghi hai lần, chứ không phải hai sự cố.
 */
export function dungKhoiChu(tin, luc = new Date()) {
  const p = tin.payload && typeof tin.payload === "object" ? tin.payload : {};
  const khan = String(p.muc_do || "thuong") === "khan";
  const dong = [
    "".padEnd(78, "─"),
    `[${luc.toISOString()}] ${khan ? "*** KHẨN ***  " : ""}${p.tieu_de || tin.dedup_key}`,
  ];
  if (p.noi_dung) dong.push(`  Chuyện gì : ${String(p.noi_dung).trim()}`);
  if (p.viec_can_lam) dong.push(`  Phải làm  : ${String(p.viec_can_lam).trim()}`);
  dong.push(`  Mã tin    : ${tin.dedup_key}  (tin #${tin.id}, gửi cho: ${tin.channel})`);
  return `${dong.join("\n")}\n`;
}

/**
 * Gửi thật. Ném lỗi khi không ghi được — bộ gửi bắt và ghi 'gui_hong' kèm lý do.
 * TUYỆT ĐỐI không nuốt lỗi rồi trả về thành công: đó chính là cách một hàng đợi báo
 * "đã gửi" cho những tin chưa từng rời khỏi máy.
 */
export async function gui({ tin, kenh, luc = new Date() }) {
  const thuMuc = thuMucGhi(kenh);
  mkdirSync(thuMuc, { recursive: true });
  const duongDan = join(thuMuc, tenTep(luc));
  appendFileSync(duongDan, dungKhoiChu(tin, luc), "utf8");
  return { chiTiet: `Đã ghi vào ${duongDan}` };
}

export const KIND = "tep_nhat_ky";
