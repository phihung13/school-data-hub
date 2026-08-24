"use client";
// apps/hub/components/intro-cinematic.tsx — đoạn intro chạy MỘT LẦN sau khi đăng nhập.
//
// Chủ đầu tư 24/08/2026: *"trang login chưa đổi, intro các thứ nữa"* — luồng đăng nhập →
// intro → trang chủ của bản trình diễn nay là luồng THẬT.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO CỜ NẰM Ở `sessionStorage`, KHÔNG PHẢI MỘT THAM SỐ URL
// ═══════════════════════════════════════════════════════════════════════════════
// `goAfterLogin()` cố ý dùng `window.location.assign` chứ không `router.push` — cookie
// phiên vừa được Set-Cookie, và hard navigation là cách chắc chắn nhất để mọi Server
// Component đọc được nó thay vì dùng lại cache RSC dựng lúc CHƯA đăng nhập. Lý lẽ đó
// không được đụng tới.
//
// Nên trạng thái "vừa đăng nhập xong" phải sống sót qua một lần nạp trang. `sessionStorage`
// làm đúng việc đó, và nó chết theo tab — mở tab mới không tự phát lại intro.
// Một tham số `?intro=1` thì hỏng theo hai đường: nó nằm lại trên thanh địa chỉ để người
// ta bookmark, và F5 sẽ phát lại intro mỗi lần.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO CHẠY CÂM
// ═══════════════════════════════════════════════════════════════════════════════
// Bản trình diễn mở tiếng, và nó làm được vì mọi thứ ở CÙNG MỘT TRANG — cú bấm đăng nhập
// vẫn còn hiệu lực làm "cử chỉ người dùng". Ở đây có một lần nạp trang xen vào, nên trang
// mới KHÔNG có cử chỉ nào; `play()` có tiếng sẽ bị trình duyệt chặn và rơi vào nhánh lỗi.
//
// Chạy câm là chọn có chủ ý, không phải hạn chế kỹ thuật: đây là app dùng trong lớp học.
// Một đoạn nhạc tự bật khi cô giáo đăng nhập giữa giờ là thứ không ai muốn.
import { useEffect, useRef, useState } from "react";

/** Cờ do `login-form.tsx` đặt ngay trước khi nạp trang đích. */
export const CO_INTRO = "hub:intro";

export function IntroCinematic() {
  const [dangChay, setDangChay] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let bat = false;
    try {
      bat = sessionStorage.getItem(CO_INTRO) === "1";
      // XOÁ NGAY, trước cả khi phát. Nếu xoá ở lúc kết thúc thì một lần F5 giữa chừng để
      // lại cờ còn nguyên, và intro phát lại — mỗi lần tải trang một lần, không dứt.
      if (bat) sessionStorage.removeItem(CO_INTRO);
    } catch {
      // Chế độ riêng tư của một số trình duyệt ném ở đây. Không có intro thì thôi, đây là
      // phần trang trí — không được để nó chặn đường vào app.
      return;
    }
    // Màn đen chặn (script inline ở layout dựng TRƯỚC khi trang vẽ) từ đây do component
    // này quản. Nhánh KHÔNG chiếu phải gỡ ngay; nhánh chiếu gỡ ở effect dưới — sau khi
    // lớp phủ của chính component đã vẽ đè lên, nên không có khung hình hở nào ở giữa.
    const goManDen = () => document.getElementById("intro-man-den")?.remove();

    if (!bat) {
      goManDen();
      return;
    }

    // TÔN TRỌNG "GIẢM CHUYỂN ĐỘNG". Một đoạn phim toàn màn tự chạy là đúng thứ người đặt
    // tuỳ chọn này muốn tránh; với người say chuyển động nó gây khó chịu thật sự.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      goManDen();
      return;
    }

    setDangChay(true);
  }, []);

  useEffect(() => {
    if (!dangChay) return;
    // Lớp phủ của component đã vẽ (effect chạy SAU paint) — màn đen chặn hết việc.
    document.getElementById("intro-man-den")?.remove();
    const v = videoRef.current;
    if (!v) return;
    // Câm — xem khối lý lẽ đầu file. Hỏng thì đóng luôn, không để màn đen treo.
    v.muted = true;
    v.play().catch(() => setDangChay(false));
  }, [dangChay]);

  if (!dangChay) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-[#04102A]">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        preload="auto"
        playsInline
        onEnded={() => setDangChay(false)}
        // Video hỏng (mạng rớt, file thiếu) KHÔNG được để lại một màn đen phủ cả app.
        onError={() => setDangChay(false)}
      >
        <source src="/trinh-dien/uploads/intro-av1.mp4" type='video/mp4; codecs="av01.0.08M.08"' />
        <source src="/trinh-dien/uploads/intro-software.mp4" type="video/mp4" />
      </video>

      {/* ĐƯỜNG RA LUÔN CÓ MẶT, ngay từ khung hình đầu. Một đoạn phim 10 giây không bỏ qua
          được là 10 giây người ta không vào được app — và cô giáo mở máy giữa tiết thì đó
          là 10 giây trước mặt cả lớp. */}
      <button
        type="button"
        onClick={() => setDangChay(false)}
        className="absolute bottom-10 left-1/2 flex min-h-[44px] -translate-x-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/45 px-6 text-[13.5px] font-extrabold text-white backdrop-blur-sm"
      >
        Vào Hub
        <span aria-hidden className="msr text-[18px]">
          arrow_forward
        </span>
      </button>
    </div>
  );
}
