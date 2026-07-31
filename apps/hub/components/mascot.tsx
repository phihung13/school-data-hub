// Sư tử Việt Anh — sprite mascot-sheet.webp, lưới 4x2, ô tỉ lệ 2:3 (DESIGN-GUIDELINES §5).
// Tối đa 1 mascot/màn (trừ login). Kích thước PHẢI giữ tỉ lệ 2:3.
//
// ĐƯỜNG DẪN ẢNH KHÔNG NẰM Ở FILE NÀY — nó nằm ở rule `.mascot` trong app/globals.css.
//
// Trước 31/07/2026 file này đặt background-image bằng inline style, với lý do ghi trong
// comment là "không phải sửa globals.css vì file đang do gói khác giữ". Cái giá của lối
// đi vòng đó: globals.css vẫn trỏ "/mascot-sheet.png" — một file đã bị xoá — suốt thời
// gian đó mà không ai thấy, vì inline style đè lên. Hai nguồn sự thật cho cùng một
// đường dẫn ảnh, một cái đúng và một cái chết, là đúng thứ sinh ra lỗi 404 im lặng.
// Nay chỉ còn một nguồn: globals.css giữ URL + chuỗi băm, file này chỉ chọn TƯ THẾ.
// KHI ĐỔI ẢNH: chạy lại sharp rồi sửa URL và ?v=<sha256 8 ký tự> trong globals.css.
const POSE_CLASS = {
  wave: "mascot-wave",
  thumbsup: "mascot-thumbsup",
  point: "mascot-point",
  read: "mascot-read",
  celebrate: "mascot-celebrate",
  run: "mascot-run",
  think: "mascot-think",
  laptop: "mascot-laptop",
} as const;

export type MascotPose = keyof typeof POSE_CLASS;

export function Mascot({
  pose,
  width = 42,
  className = "",
}: {
  pose: MascotPose;
  width?: number;
  className?: string;
}) {
  const height = Math.round((width * 3) / 2); // tỉ lệ 2:3 bắt buộc
  return (
    <div
      aria-hidden="true"
      className={`mascot ${POSE_CLASS[pose]} ${className}`}
      style={{ width, height }}
    />
  );
}
