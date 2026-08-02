// packages/core/contracts/index.ts — cửa duy nhất ra ngoài của hợp đồng lõi.
// Mọi file .ts trong thư mục này phải có mặt ở đây, nếu không thì vibe team import
// `@hub/core/contracts` sẽ không thấy nó tồn tại — `tools/contracts-lint.mjs` kiểm điều đó.
export * from "./auth.ts";
export * from "./checkin.ts";
export * from "./consent.ts";
export * from "./care.ts";
export * from "./report.ts";
export * from "./admin.ts";

// Xuất TƯỜNG MINH, đặt sau các `export *` là có chủ đích: `contracts/checkin.ts` còn giữ
// một `CONTRACTS_VERSION` cũ từ thời hằng số này nằm lạc trong contract của một router
// (DEBT #13). Trong ES module, export tường minh THẮNG export sao, nên chỉ đúng một giá trị
// lọt ra ngoài — giá trị trong `version.ts`. Bản trong `checkin.ts` sẽ được gỡ ở lần chạm
// file đó gần nhất (contracts-lint cảnh báo cho tới lúc ấy); gỡ ngay bây giờ sẽ giẫm chân
// gói việc khác đang sửa cùng file.
export {
  CONTRACTS_VERSION,
  MIN_SUPPORTED_CONTRACTS_VERSION,
  CONTRACTS_VERSION_HEADER,
  ContractsMetaOutput,
  parseSemver,
  compareContractsVersions,
  isContractsVersionSupported,
} from "./version.ts";
export type { Semver } from "./version.ts";
