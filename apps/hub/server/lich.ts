// apps/hub/server/lich.ts — lịch hôm nay, đọc phía MÁY CHỦ cho trang chủ (ADR-034).
//
// Vì sao dựng sẵn phía máy chủ thay vì để client tự hỏi: trang chủ đã có tiền lệ và có
// lý do — `buildMiniAppsWithEmbedded` được gọi trong `page.tsx` để lưới app có sẵn ngay
// trong HTML lần đầu, sau khi bắt gặp cảnh "Giai đoạn 1 · 0 app" nhấp nháy rồi mới nhảy
// thành 2 app (30/07/2026). Một thẻ lịch nhấp nháy từ "…" sang nội dung là đúng cảnh đó,
// chỉ khác chỗ đứng.
//
// Query tRPC vẫn còn và vẫn là nguồn sự thật — nó chỉ xác nhận lại thứ đã hiện.
import { withUserContext } from "@hub/core/db";
import { GetLichHomNayOutput, type GetLichHomNayOutput as TLich, type SuKienHomNay } from "@hub/core/contracts";

export async function docLichHomNay(authUid: string): Promise<TLich> {
  const rows = await withUserContext(authUid, async (client) => {
    const { rows } = await client.query<{
      id: string;
      tieu_de: string;
      loai: string;
      gio: string;
      gio_ket_thuc: string | null;
      dia_diem: string | null;
      ca_truong: boolean;
      lop: string | null;
    }>(
      `select id, tieu_de, loai,
              to_char(bat_dau, 'HH24:MI') as gio,
              to_char(ket_thuc, 'HH24:MI') as gio_ket_thuc,
              dia_diem, ca_truong, lop
         from core.v_lich_hom_nay
        order by bat_dau`,
    );
    return rows;
  });

  return GetLichHomNayOutput.parse({
    suKien: rows.map((r) => ({
      id: r.id,
      tieuDe: r.tieu_de,
      loai: r.loai as SuKienHomNay["loai"],
      gio: r.gio,
      gioKetThuc: r.gio_ket_thuc,
      diaDiem: r.dia_diem,
      caTruong: r.ca_truong,
      lop: r.lop,
    })),
    daNoiGoogle: false,
  });
}
