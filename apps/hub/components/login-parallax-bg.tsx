// Nền parallax cho trang đăng nhập — chuyển thể từ Login Parallax.dc.html
// (Tiếp tục trang đăng nhập.zip, 30/07/2026). Chỉ hiện ở ≥md — trên điện thoại
// rẻ tiền, việc chạy rAF + 6 lớp ảnh nặng mỗi khung hình đi ngược lại cam kết
// "check-in xong trong 20 giây trên Android rẻ nhất" của dự án, nên mobile vẫn
// dùng dải hero navy tĩnh như cũ (xem MobileHeroBand trong login-form.tsx).
//
// CẢNH BÁO ĐÃ SỬA (31/07/2026): trước đây login-form.tsx bọc component này trong
// <div className="hidden md:block">, tức nó VẪN nằm trong cây React trên điện thoại
// và chỉ bị display:none. Hai lớp khai priority nên Next phát <link rel="preload"
// as="image"> vào <head> KHÔNG phụ thuộc bề rộng màn hình → điện thoại tải
// 01-far-background (2,18 MB) và 03-learning-group (1,46 MB) cho một khối không bao
// giờ hiển thị. Nay component tự kiểm bề rộng và trả null trên mobile, đồng thời bỏ
// hẳn priority (xem PARALLAX_MEDIA_QUERY bên dưới). Sửa TRONG file này để không phải
// chạm login-form.tsx.
"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore } from "react";

// Phải khớp breakpoint `md` của Tailwind mà login-form.tsx dùng để ẩn/hiện khối này.
const PARALLAX_MEDIA_QUERY = "(min-width: 768px)";

function subscribeIsDesktop(onChange: () => void) {
  const mql = window.matchMedia(PARALLAX_MEDIA_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getIsDesktop() {
  return window.matchMedia(PARALLAX_MEDIA_QUERY).matches;
}

// Server không biết bề rộng màn hình. Mặc định "không phải desktop" là lựa chọn an
// toàn: HTML gửi đi không chứa thẻ ảnh nào, nên máy yếu không tốn byte; máy desktop
// dựng nền ngay sau hydrate (nền là trang trí, dưới nó đã có màu #F4E9D8 sẵn).
function getIsDesktopOnServer() {
  return false;
}

interface Layer {
  src: string;
  alt: string;
  top: string;
  depth: readonly [number, number];
  /** Ảnh xa/khuất ít bị soi kỹ hơn ảnh tiêu điểm — hạ nhẹ để giảm dung lượng tải mà mắt không thấy khác biệt. */
  quality: number;
  wrapperTransform?: string;
  wrapperOrigin?: string;
  rotate?: boolean;
}

const LAYERS: Layer[] = [
  {
    src: "/images/login-parallax/01-far-background.png",
    alt: "",
    top: "-2%",
    depth: [2, 1],
    quality: 82,
    wrapperTransform: "scale(.8)",
    wrapperOrigin: "0% 100%",
  },
  {
    src: "/images/login-parallax/02b-tv-shelf.png",
    alt: "",
    top: "-7.9%",
    depth: [5, 3],
    quality: 78,
    wrapperTransform: "scale(.8)",
    wrapperOrigin: "0% 100%",
  },
  {
    src: "/images/login-parallax/03-learning-group.png",
    alt: "Nhóm học sinh Việt Anh cùng học",
    top: "2.08%",
    depth: [16, 9],
    quality: 92,
    wrapperTransform: "scale(.8)",
    wrapperOrigin: "10% 100%",
  },
  {
    src: "/images/login-parallax/04-mascot.png",
    alt: "Linh vật sư tử Việt Anh",
    top: "-6.7%",
    depth: [11, 6],
    quality: 92,
    wrapperTransform: "scale(.8)",
    wrapperOrigin: "0% 100%",
  },
  {
    src: "/images/login-parallax/05-foreground-desk-books.png",
    alt: "",
    top: "-2%",
    depth: [24, 13],
    quality: 85,
    wrapperTransform: "translateX(40px) scale(.82)",
    wrapperOrigin: "0% 100%",
  },
  {
    src: "/images/login-parallax/06-foreground-leaves.png",
    alt: "",
    top: "-2%",
    depth: [32, 17],
    quality: 85,
    wrapperTransform: "scale(.8)",
    wrapperOrigin: "0% 100%",
    rotate: true,
  },
];

// Toạ độ đốm sáng quy về % của khung 1440×900 gốc trong file thiết kế — để co giãn theo mọi kích thước màn hình.
const DUST = [
  { left: 8.19, top: 47.78, size: 5, color: "#FFF3CF", blur: 1, dur: 13, delay: 0 },
  { left: 14.86, top: 39.11, size: 4, color: "#FFF7DE", blur: 1, dur: 16, delay: 2.4 },
  { left: 22.36, top: 54.0, size: 6, color: "#FFEFC2", blur: 1.4, dur: 18, delay: 5.1 },
  { left: 31.39, top: 33.33, size: 4, color: "#FFF7DE", blur: 1, dur: 15, delay: 1.2 },
  { left: 38.61, top: 50.22, size: 5, color: "#FFF3CF", blur: 1.2, dur: 20, delay: 7.6 },
  { left: 45.0, top: 41.33, size: 4, color: "#FFF7DE", blur: 1, dur: 17, delay: 3.8 },
  { left: 18.47, top: 26.22, size: 3, color: "#FFFBEC", blur: 0.8, dur: 14, delay: 6.3 },
  { left: 28.61, top: 22.0, size: 4, color: "#FFF3CF", blur: 1, dur: 19, delay: 9.2 },
];

export function LoginParallaxBg() {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cur = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const raf = useRef<number>();
  const isDesktop = useSyncExternalStore(subscribeIsDesktop, getIsDesktop, getIsDesktopOnServer);

  useEffect(() => {
    if (!isDesktop) return; // khối chưa được dựng — không có gì để chạy parallax
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (reduced || !canHover) return; // chuột giả lập/màn cảm ứng — không chạy vòng lặp animation

    function onMove(e: PointerEvent) {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      target.current.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      target.current.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    }
    function onLeave() {
      target.current.x = 0;
      target.current.y = 0;
    }

    function tick() {
      raf.current = requestAnimationFrame(tick);
      cur.current.x += (target.current.x - cur.current.x) * 0.08;
      cur.current.y += (target.current.y - cur.current.y) * 0.08;
      layerRefs.current.forEach((el, i) => {
        const layer = LAYERS[i];
        if (!el || !layer) return;
        const [mx, my] = layer.depth;
        let t = `translate3d(${(-cur.current.x * mx).toFixed(2)}px,${(-cur.current.y * my).toFixed(2)}px,0)`;
        if (layer.rotate) t += ` rotate(${(-cur.current.x * 0.7).toFixed(3)}deg)`;
        el.style.transform = t;
      });
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    tick();
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [isDesktop]);

  // Trả null (chứ không phải display:none) là điểm mấu chốt: thẻ <Image> không tồn
  // tại thì Next không phát preload và trình duyệt không tải 6 lớp ảnh nặng.
  if (!isDesktop) return null;

  return (
    <div ref={containerRef} aria-hidden className="absolute inset-0 overflow-hidden bg-[#F4E9D8]">
      {LAYERS.map((layer, i) => (
        <div
          key={layer.src}
          ref={(el) => {
            layerRefs.current[i] = el;
          }}
          className="absolute inset-0 [transform:translate3d(0,0,0)]"
          style={layer.wrapperTransform ? { transform: layer.wrapperTransform, transformOrigin: layer.wrapperOrigin } : undefined}
        >
          {/* Div định kích thước 104% riêng — Image "fill" chỉ được lấp đầy đúng khung
              chứa nó, không cho override width/height qua style cùng lúc với fill. */}
          <div className="pointer-events-none absolute" style={{ top: layer.top, left: "-2%", width: "104%", height: "104%" }}>
            <Image
              src={layer.src}
              alt={layer.alt}
              fill
              quality={layer.quality}
              // Nền phủ TOÀN chiều rộng viewport (không phải panel 60% như hiểu nhầm ban
              // đầu) — khai sai "sizes" khiến Next phục vụ bản ảnh phân giải thấp rồi bị
              // kéo giãn to ra, gây mờ. 110vw vì khung chứa rộng 104% + bù dư an toàn.
              sizes="110vw"
              style={{ objectFit: "cover", objectPosition: "left center" }}
              className="pointer-events-none [will-change:transform]"
            />
          </div>
        </div>
      ))}

      <div className="absolute inset-0">
        {DUST.map((d, i) => (
          <span
            key={i}
            className="absolute animate-dust rounded-full"
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size,
              background: d.color,
              filter: `blur(${d.blur}px)`,
              animationDuration: `${d.dur}s`,
              animationDelay: `${d.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
