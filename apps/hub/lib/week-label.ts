// apps/hub/lib/week-label.ts — đổi nhãn tuần của máy thành nhãn tuần của người.
//
// server/routers/report.ts trả `weekLabel = "2026-07-27 – 2026-07-31"` (hai ngày ISO).
// Chuỗi đó đi thẳng ra bốn chỗ trẻ em và phụ huynh đọc: đầu trang "Tuần này của mình",
// banner Báo cáo Trưởng thành, và hai đầu trang của chính báo cáo. Ngày ISO là định dạng
// cho máy đọc — DESIGN-GUIDELINES §8 đòi giọng Glow & Grow ở bề mặt học sinh/phụ huynh,
// và PRODUCT.md ghi rõ phụ huynh "phần lớn không rành công nghệ".
//
// Định dạng ở TẦNG HIỂN THỊ chứ không sửa contract: cùng một trường còn được buồng lái
// và job xuất dữ liệu dùng, nơi ISO mới là đúng. Ai đọc thì người đó định dạng.
//
// KHÔNG bịa: chuỗi không đúng khuôn "ISO – ISO" thì trả nguyên văn, không đoán ngày.

/** "2026-07-27 – 2026-07-31" (– hoặc — hoặc -) → "Tuần 27/7 – 31/7". */
const ISO_RANGE = /^(\d{4})-(\d{2})-(\d{2})\s*[–—-]\s*(\d{4})-(\d{2})-(\d{2})$/;

export function formatWeekLabel(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  const m = ISO_RANGE.exec(text);
  if (!m) return text;
  const [, , fromMonth, fromDay, , toMonth, toDay] = m;
  return `Tuần ${Number(fromDay)}/${Number(fromMonth)} – ${Number(toDay)}/${Number(toMonth)}`;
}
