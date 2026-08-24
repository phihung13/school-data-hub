// apps/hub/app/not-found.tsx — trang "không tìm thấy" dùng chung cho toàn Hub.
//
// Trước 31/07/2026 mọi URL sai và mọi lời gọi notFound() (vd app/embed/[appId]/page.tsx)
// rơi vào trang mặc định của Next: nền trắng, chữ tiếng Anh "This page could not be
// found", không sidebar, không đường quay lại. Với phụ huynh và học sinh thì đó là
// "hệ thống hỏng", không phải "gõ nhầm địa chỉ".
//
// Cố tình KHÔNG vẽ sidebar ở đây: trang này chạy cho cả người CHƯA đăng nhập, mà
// sidebar cần vai + tên + email. Thay vào đó là một lối ra duy nhất, rõ ràng.
import Link from "next/link";
import { Mascot } from "@/components/mascot";

export default function NotFound() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[#081730] px-6 py-12 text-center">
      <Mascot pose="think" width={78} />
      <div className="text-[13px] font-black tracking-wide text-caption2">KHÔNG TÌM THẤY TRANG</div>
      <h1 className="max-w-md text-[20px] font-black leading-snug text-cardtitle">
        Trang em vừa mở không có ở đây.
      </h1>
      <p className="max-w-md text-[13.5px] leading-relaxed text-caption">
        Có thể địa chỉ bị gõ nhầm, hoặc trang này chưa được xây xong. Thầy cô và các em
        bấm nút bên dưới để quay lại trang chủ nhé.
      </p>
      <Link
        href="/home"
        className="mt-2 flex items-center gap-2 rounded-2xl bg-gradient-to-br from-navy to-navy-light px-6 py-3 text-[13.5px] font-black text-white shadow-[0_8px_18px_rgba(10,42,94,.24)]"
      >
        <span className="msr text-[19px] text-gold">home</span>
        Về trang chủ
      </Link>
    </main>
  );
}
