/** @type {import('next').NextConfig} */

// Đuôi file tĩnh được coi là BẤT BIẾN theo URL. Không gồm .json/.txt/.xml vì
// những thứ đó (manifest, robots) thay đổi mà không đổi tên file.
const IMMUTABLE_ASSET_EXTS = "jpg|jpeg|png|webp|avif|gif|svg|ico|woff|woff2";

const nextConfig = {
  reactStrictMode: true,
  // GĐ1 chưa cần Realtime/edge — App Router mặc định là đủ (ADR-010).
  // typedRoutes tắt: MiniAppTile.href tới từ dữ liệu server (session.miniApps),
  // không phải literal cố định, nên typedRoutes chỉ gây phiền mà không thêm an toàn thật.

  // Không quảng cáo framework đang chạy — bớt một manh mối miễn phí cho người dò lỗ hổng.
  poweredByHeader: false,

  images: {
    // Mặc định Next chỉ sinh WebP. 6 lớp ảnh parallax của trang đăng nhập là PNG
    // nguồn tổng ~6,1 MB; AVIF nhỏ hơn WebP thêm ~30% cho ảnh minh hoạ nhiều mảng
    // màu phẳng như thế này. Thứ tự trong mảng là thứ tự ưu tiên theo Accept header.
    formats: ["image/avif", "image/webp"],
    // Bản đã tối ưu nằm trong cache của server 30 ngày thay vì 60 giây mặc định —
    // ảnh nguồn nằm trong repo, chỉ đổi khi deploy, nên re-encode mỗi phút là phí CPU.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  compiler: {
    // Bỏ console.log/debug/info khỏi bundle production. GIỮ error và warn: đó là
    // đường duy nhất để lỗi phía client hiện ra khi hỗ trợ thầy cô qua điện thoại.
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },

  async headers() {
    return [
      {
        // Mặc định Next phục vụ file trong public/ với Cache-Control: max-age=0 →
        // trình duyệt revalidate sprite mascot và logo trên MỌI lần điều hướng.
        // Với phụ huynh dùng 3G, mỗi vòng revalidate là một lần chờ trắng màn hình.
        //
        // LUẬT ĐI KÈM (bắt buộc, vì immutable nghĩa là trình duyệt sẽ KHÔNG hỏi lại
        // trong 1 năm): mọi ảnh trong public/ phải được tham chiếu kèm chuỗi băm nội
        // dung ở query — xem SPRITE_VERSION trong components/mascot.tsx. Đổi ảnh mà
        // giữ nguyên URL = máy học sinh giữ bản cũ tới hết năm, không có cách gỡ.
        source: `/:all*(${IMMUTABLE_ASSET_EXTS})`,
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
