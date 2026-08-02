// Khai kiểu cho tools/canh-build.mjs.
//
// Vì sao có file này: kho viết công cụ bằng .mjs (chạy thẳng bằng `node`, không qua bước
// biên dịch), còn bài test viết bằng TypeScript ở chế độ strict. Không có khai kiểu thì
// `import { quyetDinh }` trong bài test là `any` ngầm và `tsc` từ chối.
//
// Chỉ khai ĐÚNG phần công khai. Phần thực thi của công cụ không có mặt ở đây, có chủ ý:
// nó không phải là thứ bài test gọi, và khai ra là mời người ta gọi.

export type CanhBuildKetQua =
  | "cho-qua-nguoi-dung-tu-tat"
  | "cho-qua-chua-tung-dung"
  | "cho-qua-khong-ai-nghe"
  | "cho-qua-khac-ban-dung"
  | "dung";

export function quyetDinh(d: {
  boQua?: boolean;
  /** Nội dung apps/hub/.next-prod/BUILD_ID, hoặc null khi chưa từng dựng bản thật. */
  buildIdTrenDia?: string | null;
  /** HTML lấy từ máy chủ đang nghe cổng, hoặc null khi không ai nghe / không hỏi được. */
  html?: string | null;
}): CanhBuildKetQua;
