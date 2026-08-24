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
  den: number; // độ đen tại chỗ sao đứng — nhân vào độ sáng: sao vùng tối rực hơn
}

export function SaoNen({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    /**
     * ĐỘ ĐEN tại (x,y) — bản soi của ba lớp loang trong login-form (dải đứng phải + lớp
     * xéo 292° + vầng góc phải-dưới). Chủ đầu tư 24/08, chỉnh lần ba: *"tỉ lệ sao trăng
     * phải tỉ lệ với độ đen"* — mật độ VÀ độ sáng của sao đều nhân theo hàm này, nên chỗ
     * đen đặc thì trời sao dày, thưa dần đúng theo đường loang xéo, không phải một đám
     * rải đều bị mặt nạ cắt cụt. ĐỔI LỚP LOANG Ở LOGIN THÌ ĐỔI HÀM NÀY THEO.
     */
    const doDen = (x: number, y: number): number => {
      const dai = x > 0.86 ? 1 : Math.max(0, (x - 0.5) / 0.36) * 0.55; // dải đứng phải
      const truc = (x * 0.93 + y * 0.37) / 1.3; // chiếu lên trục của lớp xéo 292°
      const xeo = Math.max(0, (truc - 0.45) / 0.55) * 0.9;
      const gx = x - 1.03, gy = y - 1.04; // vầng góc phải-dưới (tâm 103%,104% như CSS)
      const vang = Math.max(0, 1 - Math.sqrt(gx * gx * 1.2 + gy * gy * 2.2) / 0.75);
      return Math.min(1, Math.max(dai, xeo, vang));
    };

    // Sinh sao MỘT lần, LẤY MẪU THEO ĐỘ ĐEN: bốc ứng viên đều khắp khung rồi giữ lại với
    // xác suất theo doDen — vùng đen đặc giữ gần hết, vùng sáng gần như loại hết. Trần
    // 420 sao / 2600 lượt bốc để không phụ thuộc may rủi. Seed cố định-trong-phiên: mỗi
    // lượt vào trang một bầu trời hơi khác là đẹp, nhưng resize thì sao không nhảy chỗ.
    const SAO: Sao[] = [];
    for (let i = 0; i < 2600 && SAO.length < 420; i++) {
      const x = Math.random(), y = Math.random();
      const den = doDen(x, y);
      if (Math.random() > 0.06 + 0.94 * den) continue;
      const z = Math.random();
      SAO.push({
        x, y, z,
        r: 0.4 + z * 1.4,
        // Trắng là chủ đạo; lam nhạt và vàng thương hiệu điểm xuyết thưa.
        mau: Math.random() < 0.72 ? "255,255,255" : Math.random() < 0.6 ? "199,216,240" : "255,198,41",
        pha: Math.random() * Math.PI * 2,
        den,
      });
    }

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
        // Độ sáng cũng tỉ lệ với độ đen: cùng một ngôi sao, đứng chỗ đen đặc thì rực,
        // trượt về phía sáng thì lịm — trời sao "tan" cùng nhịp với lớp loang.
        ctx.fillStyle = `rgba(${s.mau},${(0.22 + 0.58 * s.z) * nhay * (0.3 + 0.7 * s.den)})`;
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
