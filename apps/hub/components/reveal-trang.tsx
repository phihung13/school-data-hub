// apps/hub/components/reveal-trang.tsx — MỞ MÀN TỪ TRẮNG (27/08/2026).
//
// Sau intro, trang login phủ trắng rồi chuyển sang /home và đặt cờ sessionStorage
// "hub:reveal". Component này ở /home đọc cờ đó: hiện một lớp TRẮNG kín ngay khi trang
// vừa lên, rồi MỜ DẦN đi — vừa nối liền cú "fade qua trắng" của intro (không giật khi
// đổi trang), vừa che lúc /home còn đang dựng (dữ liệu buồng lái, lưới mini app), nên app
// "hiện lên dần" thay vì bụp một cái. Không có cờ (vào /home bình thường) thì không làm gì.
"use client";

import { useEffect, useState } from "react";

export function RevealTrang() {
  const [hien, setHien] = useState(false);
  const [mo, setMo] = useState(1); // opacity của lớp trắng

  useEffect(() => {
    let hetGio = 0;
    try {
      if (sessionStorage.getItem("hub:reveal") !== "1") return;
      sessionStorage.removeItem("hub:reveal");
    } catch {
      return;
    }
    setHien(true);
    // GIỮ trắng đầy ~150ms rồi mới hạ opacity → đọc ra "màn trắng BÓC ra" chứ không mờ
    // tức thì; trong lúc đó menu trượt vào + thẻ chào/KPI/thẻ dưới nổi lên dần phía sau,
    // nên trắng bóc đi là thấy màn đang tự dựng — smooth (chủ đầu tư 27/08).
    const t0 = window.setTimeout(() => setMo(0), 150);
    hetGio = window.setTimeout(() => setHien(false), 850);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(hetGio);
    };
  }, []);

  if (!hien) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] bg-white transition-opacity duration-[600ms] ease-out"
      style={{ opacity: mo }}
    />
  );
}
