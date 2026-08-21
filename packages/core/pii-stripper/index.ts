// packages/core/pii-stripper/index.ts — §7: wrapper DUY NHẤT đứng giữa Hub và mọi model AI ngoài.
//
// ═══════════════════════════════════════════════════════════════════════════
// FILE NÀY LÀM GÌ, VÀ QUAN TRỌNG HƠN: NÓ KHÔNG LÀM GÌ
// ═══════════════════════════════════════════════════════════════════════════
// LÀM: bóc những mẩu định danh RA KHỎI đoạn chữ trước khi nó rời khỏi máy chủ trường,
// và ghi lại đường về để phục hồi khi câu trả lời quay lại người đọc hợp lệ.
//
// KHÔNG LÀM: đoán tên người bằng heuristic. Không có "danh sách họ Việt Nam" nào ở đây.
// Lý do là một đánh đổi phải hiểu trước khi sửa file này:
//
//   · Bỏ SÓT một tên  ⇒ tên một đứa trẻ rời khỏi trường. Nặng.
//   · Bóc NHẦM một từ ⇒ câu hỏi mất nghĩa, model trả lời sai, và không ai biết vì sao.
//     "Long", "An", "Tân", "Nam" vừa là tên vừa là từ thường dùng — một bộ đoán tên
//     tiếng Việt sẽ bóc "em ở Long An" thành "em ở HS-01 HS-02".
//
// Nên tên đi vào đây bằng đường KHAI BÁO: nơi gọi biết mình đang nói về ai (nó vừa
// truy vấn ra danh sách đó từ cơ sở dữ liệu) và truyền tên kèm mã. Cái file này tự làm
// là những khuôn CHẮC CHẮN là định danh: số điện thoại, email, mã học sinh, số căn cước.
//
// Giới hạn còn lại, nói thẳng chứ không giấu: một người gõ tay tên bạn cùng lớp vào ô
// tự do thì tên đó KHÔNG được khai và sẽ đi ra ngoài. Đó là lỗ thật, và nó đóng bằng
// một tầng khác (nhắc trên màn hình, và bộ lọc phía sau), không phải bằng heuristic ở
// đây. Ghi thành nợ có tên chứ không vờ như đã kín.

/** Một cái tên và mã thay thế cho nó. Nơi gọi dựng, vì nơi gọi biết mình nói về ai. */
export interface TenCanBoc {
  /** Tên thật, đúng như nó xuất hiện trong đoạn chữ. */
  ten: string;
  /** Mã thay thế, ví dụ "HS-01". KHÔNG được là student_code thật — đó cũng là định danh. */
  ma: string;
}

export interface KetQuaBoc {
  /** Đoạn chữ đã bóc — thứ DUY NHẤT được phép rời khỏi máy chủ trường. */
  sach: string;
  /** Bản đồ mã → tên thật, để phục hồi câu trả lời. KHÔNG BAO GIỜ gửi ra ngoài. */
  duongVe: Record<string, string>;
  /** Đếm theo loại, để ghi nhật ký và để đo — không chứa giá trị nào. */
  daBoc: { ten: number; dienThoai: number; email: number; maHocSinh: number; canCuoc: number };
}

// ---------------------------------------------------------------------------
// Khuôn CHẮC CHẮN là định danh
// ---------------------------------------------------------------------------
// Bốn khuôn, và mỗi khuôn được chọn vì nó KHÔNG khớp nhầm vào văn xuôi bình thường.
//
// `student_code` phải đứng TRƯỚC số điện thoại trong thứ tự thay: `VA-2026-00417` chứa
// một dãy số dài, và một bộ bắt điện thoại tham lam sẽ ăn mất phần đuôi rồi để lại
// "VA-2026-" — vừa lộ một nửa, vừa hỏng cả hai khuôn.
const KHUON_MA_HOC_SINH = /\bVA-\d{4}-\d{5}\b/g;
// Số điện thoại VN: 0 hoặc +84, 9–10 chữ số, cho phép dấu cách/chấm/gạch giữa các cụm.
const KHUON_DIEN_THOAI = /(?:\+84|0)(?:[\s.-]?\d){8,10}\b/g;
const KHUON_EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
// Căn cước công dân: 12 chữ số liền. Đặt TRƯỚC điện thoại — lý do đo được, xem chú
// thích tại chỗ thay ở dưới. Hệ quả chấp nhận: một số điện thoại 12 chữ số sẽ bị gọi
// tên là căn cước. Cả hai đều bị bóc, nên nhãn sai không mở cửa nào.
const KHUON_CAN_CUOC = /\b\d{12}\b/g;

/** Thoát ký tự đặc biệt để ghép một chuỗi bất kỳ vào regex an toàn. */
function thoat(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Bóc định danh khỏi một đoạn chữ.
 *
 * Thứ tự thay CÓ NGHĨA và không được đảo — xem chú thích ở từng khuôn.
 *
 * Tên được thay theo thứ tự DÀI TRƯỚC: "Nguyễn Văn Minh" phải thay trước "Minh", nếu
 * không thì "Minh" ăn phần đuôi và để lại "Nguyễn Văn HS-01" — lộ họ và tên đệm.
 */
export function bocPii(chu: string, ten: readonly TenCanBoc[] = []): KetQuaBoc {
  const duongVe: Record<string, string> = {};
  const daBoc = { ten: 0, dienThoai: 0, email: 0, maHocSinh: 0, canCuoc: 0 };
  let sach = chu;

  sach = sach.replace(KHUON_MA_HOC_SINH, () => {
    daBoc.maHocSinh += 1;
    return "[MÃ-HS]";
  });
  sach = sach.replace(KHUON_EMAIL, () => {
    daBoc.email += 1;
    return "[EMAIL]";
  });
  // CĂN CƯỚC TRƯỚC ĐIỆN THOẠI — thứ tự này đo ra chứ không suy ra.
  //
  // Bản đầu để điện thoại trước, và bộ eval bắt ngay: "001234567890" (12 số) khớp khuôn
  // điện thoại BẮT ĐẦU TỪ KÝ TỰ THỨ HAI, ăn 11 ký tự và để lại một chữ số lạc: kết quả
  // là `CCCD 0[SĐT]`. Một chữ số lọt ra thì vô hại; nhưng một khuôn ăn LỆCH một ký tự
  // là thứ sẽ ăn lệch ở chỗ khác đau hơn, và nó chứng minh thứ tự đang sai.
  sach = sach.replace(KHUON_CAN_CUOC, () => {
    daBoc.canCuoc += 1;
    return "[CCCD]";
  });
  sach = sach.replace(KHUON_DIEN_THOAI, () => {
    daBoc.dienThoai += 1;
    return "[SĐT]";
  });

  for (const t of [...ten].sort((a, b) => b.ten.length - a.ten.length)) {
    if (!t.ten.trim()) continue;
    const truoc = sach;
    sach = sach.replace(new RegExp(thoat(t.ten), "g"), t.ma);
    if (sach !== truoc) {
      duongVe[t.ma] = t.ten;
      daBoc.ten += 1;
    }
  }

  return { sach, duongVe, daBoc };
}

/**
 * Phục hồi tên thật trong câu trả lời của model, để người đọc hợp lệ đọc được tên.
 *
 * Chỉ dùng ở tầng TRẢ VỀ NGƯỜI DÙNG, không bao giờ trước khi gửi đi. Và nó chỉ phục hồi
 * TÊN — `[SĐT]`, `[EMAIL]`, `[MÃ-HS]`, `[CCCD]` cố ý KHÔNG có đường về: chúng bị XOÁ,
 * không phải mã hoá. Một câu trả lời của model mà chứa lại số điện thoại thì hoặc model
 * bịa ra, hoặc nó có sẵn từ đâu đó — cả hai đều không phải thứ nên in ra.
 */
export function hoanPii(traLoi: string, duongVe: Record<string, string>): string {
  let ra = traLoi;
  for (const [ma, ten] of Object.entries(duongVe)) {
    ra = ra.replace(new RegExp(thoat(ma), "g"), ten);
  }
  return ra;
}

/**
 * Đoạn chữ này CÒN sót định danh nào không — cổng cuối cùng trước khi gửi đi.
 *
 * Vì sao có hàm này khi đã có `bocPii`: chúng kiểm HAI thứ khác nhau. `bocPii` là hành
 * động; hàm này là lời khai. Nơi gọi phải chạy nó trên đúng chuỗi sắp gửi — kể cả chuỗi
 * đã được ghép thêm sau khi bóc (prompt hệ thống, ngữ cảnh, ví dụ). Ghép sau khi bóc là
 * cách một mẩu định danh lọt ra mà không ai sửa `bocPii` cả.
 */
export function conSotPii(chu: string): boolean {
  for (const k of [KHUON_MA_HOC_SINH, KHUON_EMAIL, KHUON_DIEN_THOAI, KHUON_CAN_CUOC]) {
    k.lastIndex = 0;
    if (k.test(chu)) return true;
  }
  return false;
}
