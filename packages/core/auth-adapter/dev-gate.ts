// packages/core/auth-adapter/dev-gate.ts — khoá cửa đăng nhập tạm (nợ #19).
//
// CÁI HỎNG THẬT, đo được 30/07/2026 và vẫn còn nguyên tới 01/08/2026: route
// `/api/auth/dev-login` nhận một `authUid` trong danh sách tài khoản mẫu rồi cấp
// thẳng cookie phiên đúng vai đó — không mật khẩu, không kiểm môi trường, không gì
// cả. Route đó nằm sau tên miền công khai `hub.truongvietanh.com`, và dãy UUID mẫu
// (`90000000-…-0000000000NN`) đoán được bằng mắt. Một lượt POST từ ngoài Internet là
// một phiên hiệu trưởng, nhìn được toàn bộ học sinh cơ sở. Hôm nay sau cửa đó chỉ có
// dữ liệu seed, nên đây không phải đám cháy — nhưng nó là điều kiện chặn tuyệt đối
// trước ngày nạp danh sách học sinh thật.
//
// VÌ SAO KHÔNG PHẢI "CHỈ CHO LOCALHOST" — đây là phần quan trọng nhất của file này.
// Hai lý do, lý do thứ hai mới là lý do giết chết phương án đó:
//
//   1. Chủ đầu tư demo BẰNG ĐIỆN THOẠI qua chính tên miền công khai. Chặn theo
//      localhost là đóng cửa bằng cách cắt đúng người đang cần đi qua.
//   2. NÓ KHÔNG CHẶN ĐƯỢC AI CẢ. `~/.cloudflared/config.yml` trỏ
//      `hub.truongvietanh.com -> http://localhost:3000`, nghĩa là MỌI request từ
//      Internet đi qua đường hầm đều tới Node với địa chỉ nguồn 127.0.0.1. Một phép
//      kiểm "chỉ nhận loopback" ở đây sẽ XANH cho cả thế giới, đồng thời làm ta tin
//      rằng cửa đã khoá. Đó là loại cổng tệ hơn không có cổng.
//
// NÊN: một bí mật dùng chung, đặt trong biến môi trường (KHÔNG nằm trong kho), nhập
// đúng MỘT lần trên màn đăng nhập, rồi nhớ bằng một cookie RIÊNG (`hub_dev_gate`) —
// không phải cookie phiên. Tách hai cookie là cố ý: cookie phiên sống 15 phút và gắn
// với một con người cụ thể (ADR-016); cookie cửa sống 30 ngày và chỉ trả lời đúng
// một câu "cái máy này đã được cho phép thử bản dev chưa". Trộn hai việc vào một
// cookie thì hoặc phiên sống 30 ngày, hoặc chủ đầu tư nhập lại mã mỗi 15 phút.
//
// BỐN LỜI HỨA, và mỗi lời hứa có một test đi kèm (tests/unit/dev-login-gate.test.ts):
//   (a) không có bí mật thì không vào được — kể cả từ localhost;
//   (b) nhập đúng MỘT lần rồi thôi (cookie 30 ngày);
//   (c) biến môi trường KHÔNG đặt (hoặc đặt một chuỗi ngắn cho có) thì route TỪ CHỐI
//       HẲN, không mở toang. Mặc định là ĐÓNG;
//   (d) NODE_ENV=production thì route không tồn tại, bất kể bí mật đúng hay sai.
//
// File này KHÔNG import `next/*` và KHÔNG chạm cơ sở dữ liệu — để test chạy được
// thẳng, không cần dựng máy chủ, không cần Postgres.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Tên cookie nhớ "máy này đã qua cửa". KHÔNG phải `hub_session`. */
export const DEV_GATE_COOKIE_NAME = "hub_dev_gate";

/**
 * Cookie cửa sống 30 ngày. Con số này KHÔNG liên quan gì tới tuổi thọ phiên (15 phút):
 * người dùng của nó là một chiếc điện thoại, và mỗi lần hết hạn là một lần chủ đầu tư
 * phải gõ lại một chuỗi ký tự ngoài quán cà phê. Ghi ra cho đúng sự thật: Safari trên
 * iOS có thể cắt ngắn hạn cookie xuống 7 ngày trong vài cấu hình — trường hợp xấu nhất
 * là nhập lại một lần nữa, không phải mất quyền vào.
 */
export const DEV_GATE_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Đường tắt cho script và curl: gửi thẳng bí mật ở header thay vì phải xin cookie
 * trước. Vẫn là "phải có bí mật mới vào được" — không phải một cửa sau.
 */
export const DEV_GATE_HEADER = "x-hub-dev-secret";

/**
 * Bí mật ngắn hơn ngần này bị coi như KHÔNG ĐẶT. Vì sao chặn thay vì cảnh báo: một
 * chuỗi 4 ký tự đứng sau tên miền công khai không làm chậm ai được một giây nào, mà
 * lại làm cả nhóm tin rằng cửa đã khoá. Thà đóng hẳn (route trả 503, không ai vào
 * được kể cả dev) còn hơn khoá bằng một cái chốt giấy.
 */
export const DEV_SECRET_MIN_LENGTH = 12;

/**
 * Số lần được thử mã mỗi phút, tính theo IP. Cùng bài toán với mã mời phụ huynh
 * (`invite-guard.ts`): không có bộ đếm thì bí mật dài bao nhiêu cũng chỉ là bài toán
 * thời gian cho một vòng lặp. 5 lượt/phút đủ rộng cho người gõ nhầm trên điện thoại.
 */
export const DEV_GATE_ATTEMPTS_PER_MINUTE = 5;

/**
 * Bốn trạng thái của cửa. Route và màn đăng nhập nói CÙNG một thứ tiếng này.
 *
 *   `absent`        — NODE_ENV=production: cửa không tồn tại. Màn đăng nhập phải bỏ
 *                     hẳn khối "chọn tài khoản thử", không phải làm mờ nó đi.
 *   `misconfigured` — chưa đặt DEV_LOGIN_SECRET (hoặc đặt quá ngắn): cửa đóng với
 *                     TẤT CẢ, kể cả dev. Đây là nhánh "mặc định phải là đóng".
 *   `locked`        — có bí mật, máy này chưa nhập.
 *   `open`          — máy này đã qua cửa (cookie còn hạn, hoặc header đúng).
 */
export type DevGateState = "absent" | "misconfigured" | "locked" | "open";

/**
 * Route đăng nhập tạm có tồn tại không. Lời hứa (d).
 *
 * SỬA 02/08/2026 — vì `NODE_ENV=production` đã ĐỔI NGHĨA giữa chừng.
 *
 * Lúc viết luật này, "production" chỉ có một nghĩa: bản chạy thật cho trường, có dữ liệu
 * trẻ em thật. Hôm nay nó mang thêm nghĩa thứ hai: bản dựng ĐÃ RÚT GỌN mà chính máy dev
 * phải chạy để không bắt điện thoại tải 2,3 MB mỗi lần mở trang. Hai nghĩa đó cần hai
 * câu trả lời khác nhau, mà một biến thì chỉ trả lời được một câu.
 *
 * Đo được ngay sau khi bật bản chạy thật: cửa trả 404, và chủ đầu tư mất đường vào trên
 * điện thoại — trong khi Google/Zalo chưa nối nên KHÔNG có cửa nào khác.
 *
 * Nên tách: mặc định vẫn là ĐÓNG ở production (không đổi lời hứa), và chỉ mở lại khi có
 * một biến khai TƯỜNG MINH `DEV_LOGIN_CHO_PHEP_O_BAN_THAT=1`. Ba tính chất giữ nguyên:
 *   · vẫn phải có `DEV_LOGIN_SECRET` hợp lệ mới qua được cửa (biến này KHÔNG thay bí mật);
 *   · máy chủ thật của trường sẽ không có biến này trong môi trường, nên cửa vẫn không
 *     tồn tại ở đó — `.env.local` không đi theo lên máy chủ;
 *   · quên khai thì cửa ĐÓNG, không phải mở. Mặc định luôn nghiêng về phía an toàn.
 *
 * Ngày gỡ hẳn `dev-login` (khi có Google/Zalo thật, nợ #19) thì xoá cả hàm này.
 */
export function devLoginRouteExists(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV !== "production") return true;
  return (env.DEV_LOGIN_CHO_PHEP_O_BAN_THAT ?? "").trim() === "1";
}

/**
 * Đọc bí mật từ môi trường. Trả `null` khi thiếu HOẶC quá ngắn — hai chuyện đó phải
 * cho ra cùng một kết quả, vì hậu quả của chúng giống hệt nhau.
 */
export function readDevLoginSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = (env.DEV_LOGIN_SECRET ?? "").trim();
  return raw.length >= DEV_SECRET_MIN_LENGTH ? raw : null;
}

/**
 * So sánh không rò thời gian. Băm cả hai vế trước khi so để `timingSafeEqual` luôn
 * nhận hai buffer CÙNG độ dài — nó ném lỗi khi lệch độ dài, và chính việc ném lỗi đó
 * đã là một kênh rò "mã bạn nhập dài bao nhiêu ký tự".
 */
function equalsConstantTime(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Người dùng vừa gõ có đúng bí mật không.
 *
 * `.trim()` là nhân nhượng có chủ ý cho bàn phím điện thoại: iOS chèn một dấu cách
 * sau khi tự động sửa chữ, và một dấu cách vô hình ở cuối là kiểu lỗi mà người dùng
 * không bao giờ tự nhìn ra. Không làm yếu gì cả — khoảng trắng đầu/cuối không nằm
 * trong không gian mã.
 */
export function verifyDevSecret(input: unknown, secret: string): boolean {
  if (typeof input !== "string") return false;
  const value = input.trim();
  if (value.length === 0) return false;
  return equalsConstantTime(value, secret);
}

function signGateToken(secret: string, expiresAt: number): string {
  return createHmac("sha256", secret).update(`hub-dev-gate:v1:${expiresAt}`).digest("hex");
}

/**
 * Vé để trong cookie: `<hạn epoch giây>.<HMAC>`.
 *
 * Khoá ký LÀ chính bí mật, không phải AUTH_SESSION_SECRET. Nhờ vậy đổi
 * DEV_LOGIN_SECRET là mọi vé đã phát chết ngay lập tức — đó là cách thu hồi quyền
 * truy cập khi một cái điện thoại thất lạc, và nó không cần thêm bảng nào trong
 * database. Cookie không mang bí mật trần: lộ cookie chỉ lộ đúng một cái vé hết hạn
 * được, không lộ mã để đi mở cửa khác.
 */
export function issueDevGateToken(secret: string, now: number = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + DEV_GATE_TTL_SECONDS;
  return `${expiresAt}.${signGateToken(secret, expiresAt)}`;
}

export function verifyDevGateToken(
  token: unknown,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const expiresAt = Number(token.slice(0, dot));
  const mac = token.slice(dot + 1);
  if (!Number.isInteger(expiresAt) || expiresAt * 1000 <= now) return false;

  const expected = signGateToken(secret, expiresAt);
  // Độ dài lệch = chắc chắn sai, và `timingSafeEqual` sẽ ném lỗi nếu cứ gọi.
  if (mac.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(mac, "utf8"), Buffer.from(expected, "utf8"));
}

export interface DevGateCredentials {
  /** Giá trị cookie `hub_dev_gate` của request (nếu có). */
  cookie?: string | null;
  /** Giá trị header `x-hub-dev-secret` của request (nếu có). */
  header?: string | null;
}

/**
 * MỘT hàm trả lời "request này được vào cửa dev chưa" — cả `/api/auth/dev-login` lẫn
 * `/api/auth/dev-gate` đều hỏi qua đây. Hai nơi tự phán quyết riêng là hai cơ hội để
 * một nơi quên mất một nhánh.
 *
 * Thứ tự các phép kiểm là thứ tự của bốn lời hứa: production trước (không bí mật nào
 * mở được cửa đã bị gỡ), rồi cấu hình, rồi mới tới người gọi.
 */
export function evaluateDevGate(
  credentials: DevGateCredentials,
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
): DevGateState {
  if (!devLoginRouteExists(env)) return "absent";

  const secret = readDevLoginSecret(env);

  // KHÔNG KHAI BÍ MẬT = CỬA MỞ (đổi 02/08/2026, quyết định của chủ đầu tư).
  //
  // Bản trước trả `misconfigured` ở đây — mặc định đóng, phải khai bí mật mới dùng được.
  // Chủ đầu tư bỏ yêu cầu đó: "không cần dev login secret đâu". Lý do thực tế đứng sau,
  // và nó chính đáng: mật khẩu dùng chung này đã rò HAI LẦN trong một ngày, cả hai lần
  // đều do công cụ tự in nó ra chứ không do ai làm lộ. Một bí mật mà quy trình bình
  // thường tự phát tán thì nó không bảo vệ ai, chỉ làm phiền đúng người có quyền.
  //
  // ĐIỀU GÌ VẪN GIỮ, và vì sao nó đủ: hàng rào thật KHÔNG PHẢI mật khẩu mà là
  // `devLoginRouteExists` ở trên. Ở `NODE_ENV=production` cửa chỉ tồn tại khi có
  // `DEV_LOGIN_CHO_PHEP_O_BAN_THAT=1`, mà biến đó nằm trong `apps/hub/.env.local` —
  // file KHÔNG lên GitHub và KHÔNG đi theo lên máy chủ. Nên trên máy chủ thật của
  // trường, cửa này không tồn tại dù có ai muốn hay không, và không ai phải nhớ gì.
  //
  // RỦI RO CÒN LẠI, nói thẳng: trong lúc máy dev còn mở ra Internet qua đường hầm, ai
  // biết địa chỉ đều vào được bằng một vai bất kỳ. Hôm nay sau cửa đó chỉ có 109 học
  // sinh bịa tên. Ngày nạp danh sách thật mà cửa còn mở là ngày lỗ hổng thành thật —
  // vì vậy màn đăng nhập in một dòng cảnh báo khi cửa mở, và `DEBT.md` #19 vẫn đứng.
  // Muốn khoá lại: thêm một dòng `DEV_LOGIN_SECRET=...` vào `.env.local`, cửa tự đòi mã
  // trở lại mà không phải sửa một dòng mã nào.
  if (!secret) return "open";

  if (credentials.header && verifyDevSecret(credentials.header, secret)) return "open";
  if (credentials.cookie && verifyDevGateToken(credentials.cookie, secret, now)) return "open";
  return "locked";
}
