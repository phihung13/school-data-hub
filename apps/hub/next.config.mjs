/** @type {import('next').NextConfig} */

// Đuôi file tĩnh được coi là BẤT BIẾN theo URL. Không gồm .json/.txt/.xml vì
// những thứ đó (manifest, robots) thay đổi mà không đổi tên file.
const IMMUTABLE_ASSET_EXTS = "jpg|jpeg|png|webp|avif|gif|svg|ico|woff|woff2";

// Thư mục dựng TÁCH ĐÔI theo chế độ chạy (02/08/2026) — bản chạy thật `.next-prod`,
// bản lập trình viên `.next`.
//
// Vì sao: hai chế độ dùng chung một thư mục thì cái chạy sau ghi đè cái trước, và điều
// đó đã gây HAI sự cố khác nhau trong cùng một ngày:
//   · Chủ đầu tư mở điện thoại thấy trang hiện đủ chữ mà bấm không ăn — `next build`
//     ghi đè `.next` trong lúc máy chủ chế độ lập trình viên đang chạy, ba tệp JS lõi
//     404, React không bao giờ gắn vào.
//   · Bật bản chạy thật thì máy chủ chết câm — vì trước đó đã chạy lại chế độ lập trình
//     viên, `.next` không còn `BUILD_ID`. Lỗi thật là "Could not find a production
//     build", nhưng nó không lọt vào log nào (xem server.mjs).
// Tách thư mục là cách duy nhất làm hai chế độ thôi giẫm chân nhau; mọi cách khác đều
// là "nhớ đừng chạy cái kia cùng lúc", mà trí nhớ thì đã hỏng hai lần.
const distDir = process.env.NODE_ENV === "production" ? ".next-prod" : ".next";

const nextConfig = {
  distDir,
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

  experimental: {
    // Bộ nhớ đệm điều hướng phía trình duyệt (client router cache), tính bằng giây.
    //
    // Mặc định của Next 14 cho trang ĐỘNG là 0: nạp trước (`router.prefetch("/gvcn")`,
    // `<Link>` lọt vào tầm nhìn) xong thì vứt ngay, nên lần bấm thật vẫn đi một vòng
    // mạng đầy đủ. Mọi trang của Hub đều động (đọc phiên từ cookie), tức là tính năng
    // nạp trước của Next hiện KHÔNG giúp được gì.
    //
    // 30 giây là cửa sổ vừa đủ cho hành vi thật: GVCN mở /home rồi bấm tile Buồng lái
    // trong vài giây (home-view.tsx cũng hâm sẵn dữ liệu care.getDashboard đúng lúc đó),
    // học sinh nhảy qua lại /home ↔ /checkin ↔ /ho-so.
    //
    // AN TOÀN VỀ DỮ LIỆU, và đây là phần phải kiểm chứ không phải tin: cái được đệm là
    // payload RSC của trang, mà Server Component ở đây chỉ mang tên/email/vai/lưới mini
    // app từ phiên — KHÔNG mang số liệu học sinh (mọi số đi qua tRPC, có staleTime riêng
    // 60s ở REACT_QUERY_DEFAULTS). Đăng xuất gọi router.refresh() nên xoá sạch bộ đệm này.
    staleTimes: { dynamic: 30 },
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
