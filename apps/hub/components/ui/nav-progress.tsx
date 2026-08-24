"use client";
// apps/hub/components/ui/nav-progress.tsx — thanh báo "đang chuyển trang" ở đỉnh màn hình.
//
// VÌ SAO CÓ FILE NÀY. Chủ đầu tư 02/08/2026: "khi nhấn qua trang gì cũng nên thể hiện
// cho người ta biết là đang load."
//
// Cái hỏng thật: mọi trang của Hub đều ĐỘNG (đọc phiên từ cookie), nên Next dựng chúng
// ở máy chủ rồi mới trả về. Giữa lúc bấm và lúc trang mới hiện ra có một khoảng trống —
// trên máy tính là vài trăm mili-giây, trên điện thoại qua mạng trường là vài giây. Trong
// khoảng đó màn hình ĐỨNG YÊN NGUYÊN VẸN: không nhấp nháy, không đổi gì. Người dùng
// không phân biệt được "máy đang làm" với "máy không nhận cú bấm", nên họ bấm lại.
//
// VÌ SAO KHÔNG DÙNG loading.tsx CỦA NEXT: file đó chỉ hiện khi Next quyết định stream
// một Suspense boundary, và với trang động đọc cookie thì phần lớn thời gian chờ nằm
// TRƯỚC lúc đó — HTML đầu tiên còn chưa về. Thanh này chạy ở phía trình duyệt, bắt đúng
// khoảnh khắc ngón tay rời màn hình.
//
// CÁCH BẮT: nghe sự kiện click ở pha CAPTURE trên document. Không vá `history.pushState`,
// không bọc lại `<Link>` — hai cách đó đều đòi mọi chỗ trong app phải nhớ dùng đúng bản
// đã bọc, mà "phải nhớ" là thứ đã hỏng nhiều lần trong repo này.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Cú bấm này có phải là một lần chuyển trang TRONG Hub không?
 *
 * Hàm thuần, tách ra để test được (tests/unit/nav-progress.test.ts) — phần lớn cái sai
 * của một thanh tiến trình không nằm ở hoạt ảnh mà nằm ở chỗ nó bật nhầm: bật khi mở tab
 * mới, bật khi tải file, bật khi bấm vào chính trang đang đứng. Mỗi lần bật nhầm là một
 * lần nó chạy rồi không bao giờ tắt, và người dùng học được rằng thanh đó vô nghĩa.
 */
export function laChuyenTrangNoiBo(
  a: { href: string; target: string; download: string; origin: string; pathname: string },
  duongDangDung: string,
  coPhimBoTro: boolean,
): boolean {
  if (coPhimBoTro) return false; // Ctrl/Cmd/Shift-click mở tab mới, trang này không đổi
  if (a.target && a.target !== "_self") return false;
  if (a.download) return false;
  if (a.origin !== window.location.origin) return false; // ra ngoài Hub
  if (a.pathname === duongDangDung) return false; // bấm vào chính chỗ đang đứng
  if (a.href.startsWith("#") || a.pathname === "") return false;
  return true;
}

export function NavProgress() {
  const duongDangDung = usePathname();
  const [dangChay, setDangChay] = useState(false);

  // Tắt khi đường dẫn đã đổi — tức là trang mới đã lên thật.
  useEffect(() => {
    setDangChay(false);
  }, [duongDangDung]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const coPhimBoTro = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
      if (
        !laChuyenTrangNoiBo(
          { href: a.getAttribute("href") ?? "", target: a.target, download: a.getAttribute("download") ?? "", origin: a.origin, pathname: a.pathname },
          duongDangDung,
          coPhimBoTro,
        )
      ) {
        return;
      }
      setDangChay(true);
    }
    // Pha capture: bắt trước khi router của Next nuốt sự kiện.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [duongDangDung]);

  // Người dùng bấm nút Back của trình duyệt cũng là một lần chờ.
  useEffect(() => {
    const onPop = () => setDangChay(true);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (!dangChay) return null;

  return (
    // aria-hidden: đây là tín hiệu THỊ GIÁC cho việc trang sắp đổi. Trình đọc màn hình
    // đã tự thông báo khi trang mới lên (tiêu đề đổi), nên thêm một vùng aria-live nữa ở
    // đây chỉ tạo tiếng ồn kép.
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] bg-[#16294B]">
      <div className="h-full w-1/3 animate-embedSlide rounded-r-full bg-gold" />
    </div>
  );
}
