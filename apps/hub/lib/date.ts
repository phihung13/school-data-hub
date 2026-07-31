// lib/date.ts — ngày-tháng-năm theo GIỜ ĐỊA PHƯƠNG, không qua UTC.
// `d.toISOString().slice(0, 10)` SAI ở múi giờ ICT (UTC+7): mọi giờ địa phương
// trước 07:00 nằm ở ngày UTC hôm trước, nên slice ra lùi mất một ngày — lệch
// "hôm nay"/ranh giới tuần đúng vào khung giờ đó. Phát hiện khi chạy thật lúc
// 00:47 ICT (30/07/2026): V8 tính sai tuần vì bug này, dùng chung với V6/V7 nên
// sửa một chỗ áp dụng cho cả server (checkin.ts, report.ts) lẫn client.
export function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Thứ Hai của tuần chứa `date`, theo giờ địa phương. */
export function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Chủ nhật
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}
