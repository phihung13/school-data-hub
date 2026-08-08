// apps/hub/components/tim-mini-app.tsx — ô tìm mini app, và luật "khi nào thì có ô tìm".
//
// ═══════════════════════════════════════════════════════════════════════════════
// NGƯỠNG, KHÔNG PHẢI SỞ THÍCH
// ═══════════════════════════════════════════════════════════════════════════════
// Ô tìm kiếm cũ ở hero trang chủ bị gỡ ngày 31/07/2026 vì nó là `<div>` + `<span>`: không
// focus được, gõ không được, bấm không có gì xảy ra. Dựng lại thì phải trả lời được câu
// hỏi đã làm nó bị gỡ — ô này TÌM ĐƯỢC GÌ.
//
// Hôm nay hệ có 2 mini app thật. Một ô tìm đặt trên hai ô tile là đồ trang trí: mắt đọc
// hết lưới nhanh hơn tay gõ. Nên ô chỉ hiện khi lưới đủ dài để mắt KHÔNG đọc hết trong một
// lần liếc — ngưỡng đó khai thành hằng số có tên ở ngay dưới, để lần sau ai đó muốn đổi thì
// đổi một con số chứ không đi sửa một điều kiện nằm giữa JSX.
"use client";

import { useMemo, useState } from "react";
import type { MiniAppTile } from "@hub/core/contracts";

/**
 * Số app tối thiểu để ô tìm có việc để làm.
 *
 * 5 = một hàng lưới (4 cột) cộng một ô nữa, tức là lúc lưới bắt đầu xuống dòng thứ hai và
 * mắt không còn đọc hết trong một lần liếc. Dưới ngưỡng, ô tìm là affordance giả — thứ đã
 * bị gỡ khỏi chính màn này một lần rồi.
 */
export const NGUONG_HIEN_O_TIM = 5;

/**
 * Dải dấu kết hợp của Unicode (U+0300–U+036F) — thứ `normalize("NFD")` tách ra khỏi chữ
 * cái. Dựng bằng `new RegExp` với MÃ THOÁT ASCII chứ không viết ký tự thẳng vào biểu thức
 * chính quy: dấu kết hợp là ký tự vô hình trong trình soạn thảo, và một lượt tìm-thay
 * hàng loạt (kho này đã có một lượt như thế ngày 01/08/2026, dọn 496 ký tự trong 46 file)
 * sẽ ăn mất nó mà không ai nhìn ra — hàm bỏ dấu khi đó lặng lẽ thôi bỏ dấu.
 */
const DAU_KET_HOP = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Bỏ dấu tiếng Việt trước khi so. Không có bước này thì gõ "diem danh" không ra "Điểm
 * danh" — mà bàn phím mặc định của điện thoại không bỏ dấu, và người đang vội thì không
 * bật bộ gõ.
 */
export function boDau(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(DAU_KET_HOP, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .trim()
  );
}

/** Lọc theo TÊN app. Từ khoá rỗng = trả nguyên lưới, không phải trả rỗng. */
export function locMiniApp(tiles: MiniAppTile[], tuKhoa: string): MiniAppTile[] {
  const q = boDau(tuKhoa);
  if (q === "") return tiles;
  return tiles.filter((t) => boDau(t.label).includes(q));
}

export interface LuoiDaLoc {
  tuKhoa: string;
  datTuKhoa: (v: string) => void;
  /** Lưới đã lọc — dùng để VẼ. */
  luoi: MiniAppTile[];
  /** Có đủ app để ô tìm có nghĩa không. */
  hienOTim: boolean;
  /** Đang lọc và không ra gì — thể rỗng của LƯỚI khác thể rỗng của TÀI KHOẢN. */
  locKhongRa: boolean;
}

/**
 * MỘT bản cài đặt cho hai cây bố cục.
 *
 * Trang chủ cố ý dựng hai cây riêng cho điện thoại và máy tính (xem đầu `home-view.tsx`).
 * Cái giá của quyết định đó là mọi luật bị viết hai lần; hook này trả lại một chỗ duy nhất
 * cho luật "lọc thế nào" và "khi nào hiện ô tìm", nên hai cây chỉ còn khác nhau ở chỗ ĐẶT
 * cái ô — thứ vốn dĩ phải khác.
 */
export function useLocMiniApp(tiles: MiniAppTile[]): LuoiDaLoc {
  const [tuKhoa, datTuKhoa] = useState("");
  const hienOTim = tiles.length >= NGUONG_HIEN_O_TIM;
  const luoi = useMemo(() => (hienOTim ? locMiniApp(tiles, tuKhoa) : tiles), [tiles, tuKhoa, hienOTim]);
  return {
    tuKhoa,
    datTuKhoa,
    luoi,
    hienOTim,
    locKhongRa: hienOTim && tuKhoa.trim() !== "" && luoi.length === 0,
  };
}

/**
 * `nen`: ô đứng trên nền navy của hero (máy tính) hay trên thẻ trắng (điện thoại). Hai nền
 * khác nhau chỉ đổi VIỀN — ruột ô luôn trắng, vì màu chữ gợi ý của app (#5B6B80, đặt một
 * lần ở globals.css) được đo trên nền trắng: 5,44:1. Đặt ô lên nền navy trong suốt là để
 * chữ gợi ý rơi xuống 1,x:1 ngay tại chỗ nói cho người ta biết ô này làm gì.
 */
export function OTimMiniApp({ tuKhoa, datTuKhoa, nen }: { tuKhoa: string; datTuKhoa: (v: string) => void; nen: "hero" | "the" }) {
  return (
    <div
      className={`flex min-h-[44px] items-center gap-2 rounded-full bg-white px-3.5 ${
        nen === "hero" ? "shadow-[0_6px_18px_rgba(6,20,45,.22)]" : "border border-line"
      }`}
    >
      <span aria-hidden="true" className="msr text-[19px] text-caption">
        search
      </span>
      {/* Nhãn thật, không chỉ placeholder: chữ gợi ý biến mất ngay khi gõ ký tự đầu
          (WCAG 3.3.2), nên nó không được là nhãn duy nhất. */}
      <label htmlFor="tim-mini-app" className="sr-only">
        Tìm mini app theo tên
      </label>
      <input
        id="tim-mini-app"
        type="search"
        value={tuKhoa}
        onChange={(e) => datTuKhoa(e.target.value)}
        // Escape xoá nhanh mà không phải đi tìm nút ✕ — cùng phím người dùng đã quen ở mọi
        // ô tìm khác. Nút ✕ vẫn còn cho chuột và cho ngón tay.
        onKeyDown={(e) => {
          if (e.key === "Escape" && tuKhoa !== "") {
            e.preventDefault();
            e.stopPropagation();
            datTuKhoa("");
          }
        }}
        placeholder="Tìm mini app"
        // `[&::-webkit-search-cancel-button]:hidden`: WebKit tự vẽ thêm một nút ✕ cho
        // `type="search"`. Nút đó đo ~13px (dưới mốc 44px của §11) và bàn phím không tới
        // được — để nguyên là màn hình có HAI nút xoá, và nút to hơn lại là nút thừa.
        className="min-w-0 flex-1 bg-transparent py-2.5 text-[13px] font-semibold text-ink [&::-webkit-search-cancel-button]:hidden"
      />
      {tuKhoa !== "" && (
        <button
          type="button"
          onClick={() => datTuKhoa("")}
          aria-label="Xoá từ khoá tìm"
          className="-mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-full text-caption hover:bg-chip"
        >
          <span aria-hidden="true" className="msr text-[19px]">
            close
          </span>
        </button>
      )}
    </div>
  );
}
