"use client";
// apps/hub/components/sao-nen.tsx — nền sao có chiều sâu cho vùng đen màn đăng nhập.
//
// Chủ đầu tư 24/08/2026: *"cho thêm thiên hà hay ngôi sao hoặc gì đó three js tương tác
// 3d ở nền đen cho nó có chiều sâu, chứ bôi đen nhiều mà nó không chứa gì thì cũng ko
// tốt"*.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO TỰ VẼ BẰNG CANVAS 2D, KHÔNG DÙNG THREE.JS
// ═══════════════════════════════════════════════════════════════════════════════
// Bản trình diễn kéo three.js từ unpkg — và chính DOC-TRUOC.md của nó đã ghi cái giá:
// mạng trường có lọc nội dung, unpkg bị chặn thì canvas TRẮNG TRƠN không báo lỗi gì.
// Luật của kho (ban-yeu-cau §6.7 cũ, DESIGN-GUIDELINES): tự host, không phụ thuộc mạng
// ngoài. Ba tầng sao + thị sai theo chuột là ~140 chấm mỗi khung hình — canvas 2D vẽ
// nhàn, không cần một thư viện WebGL 700KB cho việc đó. "Chiều sâu 3D" ở đây là THỊ SAI:
// tầng gần trôi nhanh và lệch theo chuột nhiều hơn tầng xa — đúng cách mắt đọc chiều sâu.
import { useEffect, useRef } from "react";

interface Sao {
  x: number; // 0..1 theo bề ngang
  y: number; // 0..1 theo bề dọc
  z: number; // 0..1 — độ sâu: 0 xa (nhỏ, mờ, ít lệch), 1 gần (to, rõ, lệch nhiều)
  r: number; // bán kính gốc (px CSS)
  mau: string;
  pha: number; // pha nhấp nháy riêng — không có thì cả trời sao thở cùng nhịp, giả ngay
}

export function SaoNen({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    // Sinh sao MỘT lần theo seed cố định-trong-phiên (Math.random lúc mount): mỗi lượt
    // vào trang một bầu trời hơi khác nhau là đẹp, nhưng trong một phiên thì sao không
    // được nhảy chỗ khi resize.
    const SAO: Sao[] = Array.from({ length: 140 }, () => {
      const z = Math.random();
      return {
        x: Math.random(),
        y: Math.random(),
        z,
        r: 0.4 + z * 1.3,
        // Trắng là chủ đạo; lam nhạt và vàng thương hiệu điểm xuyết thưa.
        mau: Math.random() < 0.72 ? "255,255,255" : Math.random() < 0.6 ? "199,216,240" : "255,198,41",
        pha: Math.random() * Math.PI * 2,
      };
    });

    let w = 0, h = 0;
    const doKhung = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    doKhung();

    // Chuột: lưu ĐÍCH rồi cho vị trí thật đuổi theo có quán tính (lerp 0.06) — thị sai
    // bám cứng con trỏ thì nhìn như giao diện rung, không phải không gian sâu.
    let dichX = 0, dichY = 0, chuotX = 0, chuotY = 0;
    const onMouse = (e: MouseEvent) => {
      dichX = (e.clientX / window.innerWidth - 0.5) * 2;
      dichY = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const giamChuyenDong = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const ve = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of SAO) {
        // Tầng gần (z lớn) lệch theo chuột tới 22px, tầng xa gần như đứng — đó là chiều sâu.
        const lech = 6 + s.z * 16;
        const x = s.x * w + chuotX * lech;
        const y = s.y * h + chuotY * lech * 0.6 + (giamChuyenDong ? 0 : ((t * 0.0016 * (0.2 + s.z)) % (h + 40)) - 20);
        const yQuan = ((y % (h + 40)) + h + 40) % (h + 40) - 20; // trôi dọc, quấn vòng
        const nhay = giamChuyenDong ? 0.75 : 0.55 + 0.45 * Math.sin(t * 0.001 * (0.5 + s.z) + s.pha);
        ctx.beginPath();
        ctx.arc(x, yQuan, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.mau},${(0.25 + 0.6 * s.z) * nhay})`;
        ctx.fill();
      }
    };

    let raf = 0;
    const vong = (t: number) => {
      chuotX += (dichX - chuotX) * 0.06;
      chuotY += (dichY - chuotY) * 0.06;
      ve(t);
      raf = requestAnimationFrame(vong);
    };

    // GIẢM CHUYỂN ĐỘNG: vẽ đúng MỘT khung tĩnh — vẫn có sao (chiều sâu tĩnh), không trôi,
    // không nhấp nháy, không thị sai, không vòng rAF nào chạy nền.
    if (giamChuyenDong) {
      ve(0);
    } else {
      window.addEventListener("mousemove", onMouse, { passive: true });
      raf = requestAnimationFrame(vong);
    }

    // Tab bị giấu thì dừng vòng vẽ — một hiệu ứng nền không được phép ăn pin ở tab nền.
    const onHidden = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (!giamChuyenDong) {
        raf = requestAnimationFrame(vong);
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("resize", doKhung);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("resize", doKhung);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  // pointer-events-none + aria-hidden: đây là trang trí — chuột theo dõi qua window,
  // canvas không được chặn một cú bấm nào của panel phía trên.
  return (
    <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />
  );
}
