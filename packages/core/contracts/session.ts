// packages/core/contracts/session.ts — hợp đồng của CHUÔNG THÔNG BÁO và CỘT PHẢI trang chủ.
//
// ═══════════════════════════════════════════════════════════════════════════
// VÌ SAO CÓ FILE NÀY (06/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Chủ đầu tư mở `/home` bằng tài khoản quản trị rồi tài khoản giáo viên và nói "thiếu
// thiếu gì á". Đúng: trang chủ vai người lớn hôm nay là một thẻ "Mini App" hai ô, rồi hết.
//
// Brief thiết kế 06/08 mục 5.1 ra đúng một điều kiện cho cái chuông: *"chỉ vẽ nếu nêu được
// nguồn dữ liệu"* — một cái chuông rỗng đã bị gỡ khỏi trang chủ ngày 31/07/2026 vì là
// affordance giả. File này LÀ lời khai nguồn đó, viết thành hợp đồng để không ai vẽ chuông
// bằng số bịa: mỗi mục trong `items` đếm được từ một bảng đang có thật, dưới RLS của chính
// người đang đăng nhập.
//
// ═══════════════════════════════════════════════════════════════════════════
// BA THỨ HỢP ĐỒNG NÀY CỐ Ý KHÔNG CÓ
// ═══════════════════════════════════════════════════════════════════════════
//  1. KHÔNG có tên/mã học sinh, và không có `studentId`. Chuông chỉ đưa người dùng TỚI
//     đúng màn; danh tính hiện ở màn đó, nơi RLS đã gác từ trước. Điều 24 hiến pháp UI
//     (không rò nội tình) trùng đúng chỗ này với luật riêng tư của trường — một danh sách
//     tên nằm trong lớp nổi của chuông là một bề mặt lộ dữ liệu MỚI, không có policy nào
//     canh riêng cho nó. `tests/unit/chuong-khong-lo-ten.test.ts` quét mã nguồn để giữ
//     điều này, vì đây là loại field "tiện tay thêm cho đẹp".
//  2. KHÔNG có mục nào cho vai `principal`/`board`. Hai vai đó không có việc phải làm
//     trong hệ hôm nay — họ xem số tổng hợp ở `/dieu-hanh`. Trả một con số cho có là dựng
//     lại đúng cái chuông rỗng vừa bị gỡ.
//  3. KHÔNG có `count = 0`. Mục đếm được 0 thì máy chủ không trả nó ra. "Hết việc" là một
//     mảng rỗng, và màn hình nói điều đó bằng thể rỗng của chuông — không phải bằng một
//     danh sách bốn dòng số 0 trông như bốn việc.
import { z } from "zod";

/** Ngày ISO `YYYY-MM-DD`. Định nghĩa cục bộ, không xuất: tên `IsoDateString` đã có chủ ở report.ts. */
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải ở dạng YYYY-MM-DD");

/**
 * Mức của một việc đang chờ. HAI giá trị, và ranh giới không phải chuyện thẩm mỹ.
 *
 * `urgent` chỉ dành cho tín hiệu mà CHÍNH ĐỨA TRẺ vừa phát ra và chưa ai chạm tới (lời
 * "Mình cần gặp thầy cô" chưa có `handled_at`). Nó là tín hiệu duy nhất trong hệ đi NGAY,
 * không chờ lượt quét đêm ([QĐ-2] 01/08/2026). Mọi thứ còn lại là `normal`.
 *
 * Vì sao không thêm mức thứ ba: ba mức thì người dùng phải học bảng màu trước khi đọc
 * được cái chuông, và mức giữa sẽ hút hết những thứ người viết code phân vân — rồi mức
 * `urgent` mất nghĩa vì cái gì cũng gần-gần-khẩn.
 */
export const PendingWorkTone = z.enum(["urgent", "normal"]);
export type PendingWorkTone = z.infer<typeof PendingWorkTone>;

/**
 * Một dòng trong chuông / cột phải: "còn ngần này việc, bấm vào đây".
 *
 * `label` là chữ NGẮN 2-5 từ, và giọng do máy chủ chọn theo vai (§8 brief thiết kế — hai
 * giọng, không trộn): học sinh và phụ huynh nhận giọng Glow & Grow, người lớn nhận giọng
 * nghiệp vụ. Chữ sinh ở máy chủ chứ không ở client vì client không biết người đang đọc
 * mang vai nào cho tới khi query xong — và một màn hình tự chọn giọng là một màn hình sẽ
 * có ngày in chữ "cờ", "leo thang", "định mức" cho một đứa lớp 6 đọc.
 *
 * `href` LUÔN là một màn ĐANG CÓ THẬT trong hệ. Không mục nào trỏ tới màn chưa xây — đó
 * là điều kiện để cái chuông này không thành affordance giả lần thứ hai.
 */
export const PendingWorkItem = z.object({
  /**
   * Mã bền của mục, để client đặt `key` React, nhớ thứ tự, hoặc ẩn tạm một mục — KHÔNG
   * phải để hiển thị. Đây là mã nội bộ (điều 24 cấm in mã nội bộ ra màn); thứ in ra là
   * `label`.
   */
  key: z.string().min(1),
  /** Chữ trên màn. 2-5 từ, đúng giọng của vai. Máy chủ sinh, client không viết lại. */
  label: z.string().min(1),
  /**
   * Số việc còn lại. LUÔN `>= 1` — mục bằng 0 không được trả về (xem đầu file). Đây là số
   * đếm, không phải một điểm số hay một xếp hạng nào.
   */
  count: z.number().int().positive(),
  /**
   * Đường tới màn xử việc đó. Bắt đầu bằng "/", và màn đó **phải tồn tại**.
   *
   * `null` = việc này có thật nhưng CHƯA CÓ MÀN nào xử nó — hiện ra để biết, không bấm được.
   * Thêm 06/08/2026 sau khi đo trên bản đang chạy: mục "Job nền cần xem" của quản trị trỏ
   * `/quan-tri/mini-app` chỉ vì cần một đường dẫn hợp lệ, mà đó là sổ đăng ký Mini App —
   * không liên quan gì tới job nền. Một mục bấm vào ra nhầm màn còn tệ hơn một mục không bấm
   * được: nó dạy người dùng rằng chuông này không đáng tin. Điều 20 của hiến pháp UI cấm
   * liên kết chết, và một liên kết dẫn sai chỗ chính là dạng khó thấy của nó.
   */
  href: z.string().startsWith("/").nullable(),
  tone: PendingWorkTone,
});
export type PendingWorkItem = z.infer<typeof PendingWorkItem>;

/**
 * `asOfDate` là ngày của CHÍNH cơ sở dữ liệu (`current_date` trong cùng transaction đã
 * đếm), không phải ngày trên máy người dùng. Ba con số ở đây đều dính vào "hôm nay" —
 * check-in hôm nay, tuần này, ca đang mở — nên một cái điện thoại lệch múi giờ hoặc một
 * tab mở qua nửa đêm sẽ đọc ra một sự thật khác nếu ngày do client tự tính.
 *
 * `items` rỗng có ĐÚNG một nghĩa: người này không còn việc nào đang chờ. Nó KHÔNG bao giờ
 * mang nghĩa "không đọc được" — vai không có quyền đọc một bảng thì mục đó không tồn tại
 * với vai đó ngay từ đầu (hàng rào, không phải thiếu sót), và lỗi kỹ thuật thì ném lên
 * tRPC chứ không trả về một mảng rỗng trông giống "hết việc rồi".
 */
export const GetPendingWorkOutput = z.object({
  asOfDate: IsoDate,
  items: z.array(PendingWorkItem),
});
export type GetPendingWorkOutput = z.infer<typeof GetPendingWorkOutput>;
