"use client";
// apps/hub/components/embed-floating-menu.tsx — capsule ⋯│✕ NỔI đè lên app con, không
// chiếm hàng riêng nữa (app con đã có logo/tên thương hiệu riêng trong chính nó — hiển thị
// lại một lần nữa ở thanh ngoài là thừa). Nút ⋯ có chức năng thật, giống menu "..." của
// Zalo Mini App (tải lại / mở tab riêng), không phải trang trí.
import { useEffect, useRef, useState } from "react";

export function EmbedFloatingMenu({ appOrigin, onReload }: { appOrigin: string; onReload: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} className="absolute right-3 top-3 z-20">
      <div className="flex items-center rounded-full border border-line bg-white/95 shadow-[0_2px_10px_rgba(10,42,94,.12)] backdrop-blur">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Tùy chọn"
          className="flex items-center justify-center px-2.5 py-2"
        >
          <span className="msr text-[18px] text-muted">more_horiz</span>
        </button>
        <span className="h-4 w-px bg-line" />
        <a href="/home" aria-label="Thoát về Hub" className="flex items-center justify-center px-2.5 py-2">
          <span className="msr text-[17px] text-muted">close</span>
        </a>
      </div>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-52 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_24px_rgba(10,42,94,.16)]">
          <button
            type="button"
            onClick={() => {
              onReload();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13px] font-bold text-navy hover:bg-[#F2F5FA]"
          >
            <span className="msr text-[18px] text-caption">refresh</span>
            Tải lại
          </button>
          <a
            href={appOrigin}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13px] font-bold text-navy hover:bg-[#F2F5FA]"
          >
            <span className="msr text-[18px] text-caption">open_in_new</span>
            Mở trong tab mới
          </a>
        </div>
      )}
    </div>
  );
}
