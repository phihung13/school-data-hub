#!/usr/bin/env node
// tools/canh-build.mjs — CHẶN `next build` khi máy chủ đang PHỤC VỤ chính thư mục sắp bị ghi đè.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO CÓ FILE NÀY
// ═══════════════════════════════════════════════════════════════════════════════
// `next build` xoá và dựng lại toàn bộ tệp chunk trong thư mục dựng. Máy chủ đang chạy
// vẫn trả về HTML trỏ tới tên chunk CŨ — những tên vừa biến mất. Trình duyệt tải chunk
// → 400/404 → `ChunkLoadError` → trang trắng kèm "Application error: a client-side
// exception has occurred".
//
// Cái tệ nhất của lỗi này: **nó không giống lỗi build**. Build in ra "✓ Compiled
// successfully", máy chủ không chết, log máy chủ sạch. Chỉ có trình duyệt của người đang
// mở trang là hỏng, và người đó sẽ đi tìm lỗi trong mã nguồn.
//
// `CACH-CHAY-AGENT.md` ghi đây là bẫy số 1, và bẫy số 1 vẫn sập thêm một lần nữa ngày
// 02/08/2026 — bởi chính người viết ra dòng cảnh báo đó. Một lời dặn mà tác giả của nó
// còn đi vào thì nó không phải hàng rào; nó là một mẩu giấy dán trên tường.
//
// ═══════════════════════════════════════════════════════════════════════════════
// CÁCH NHẬN BIẾT — HỎI ĐÚNG CÂU, KHÔNG ĐOÁN
// ═══════════════════════════════════════════════════════════════════════════════
// Câu hỏi SAI: "có ai nghe cổng 3000 không?" — chặn cả trường hợp vô hại. Máy chủ ở chế
// độ lập trình viên phục vụ `.next`, còn bản dựng thật ghi vào `.next-prod` (xem
// `next.config.mjs`): hai thư mục khác nhau, dựng đồng thời không đụng nhau. Chặn nhầm
// ca đó thì người ta sẽ tắt cổng đi, và tắt rồi thì không bao giờ bật lại.
//
// Câu hỏi ĐÚNG: "cái đang nghe cổng có phải đang phục vụ CHÍNH thư mục tôi sắp ghi đè
// không?" Trả lời được vì Next nhúng `BUILD_ID` vào mọi trang: `.next-prod/BUILD_ID` là
// mã của bản dựng đang nằm trên đĩa, và HTML của máy chủ chứa mã của bản nó đang phục vụ.
// Trùng nhau ⇒ đúng nó ⇒ dừng.
//
// ═══════════════════════════════════════════════════════════════════════════════
// BA CA CỔNG NÀY CỐ Ý CHO QUA
// ═══════════════════════════════════════════════════════════════════════════════
//   1. Không ai nghe cổng — không có gì để hỏng.
//   2. Có người nghe nhưng BUILD_ID khác (máy chủ chế độ lập trình viên, hoặc một bản
//      dựng cũ đã bị thay từ trước) — thư mục sắp ghi không phải thư mục nó đang đọc.
//   3. Chưa có `.next-prod/BUILD_ID` (lần dựng đầu tiên) — chưa có gì để mà đụng.
//
// Hỏng mạng, hỏng đọc tệp, hết giờ chờ: CHO QUA, không chặn. Cổng này bảo vệ một thao
// tác thường ngày; biến nó thành chỗ chặn người ta vì một lý do không liên quan là cách
// nhanh nhất để nó bị gỡ.
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Phần QUYẾT ĐỊNH, tách thành hàm thuần để kiểm được cả ba ca cho qua mà không cần dựng
 * một máy chủ thật.
 *
 * Vì sao đáng tách: cái nguy hiểm ở một cái cổng không phải là nó chặn sai — chặn sai thì
 * có người kêu ngay. Nguy hiểm là nó CHO QUA sai và không ai biết, vì lúc đó nó trông y
 * hệt một cổng đang làm việc. Ba ca cho qua dưới đây vì thế phải kiểm được từng ca một.
 *
 * @param {{ boQua?: boolean, buildIdTrenDia?: string|null, html?: string|null }} d
 * @returns {"cho-qua-nguoi-dung-tu-tat" | "cho-qua-chua-tung-dung" | "cho-qua-khong-ai-nghe" | "cho-qua-khac-ban-dung" | "dung"}
 */
export function quyetDinh(d) {
  if (d.boQua) return "cho-qua-nguoi-dung-tu-tat";
  // Chưa có BUILD_ID trên đĩa = chưa từng dựng bản thật, không có gì để mà đụng.
  if (!d.buildIdTrenDia) return "cho-qua-chua-tung-dung";
  // Không lấy được HTML = không ai nghe cổng, hoặc mạng hỏng. Cả hai đều KHÔNG chặn:
  // cổng này bảo vệ một thao tác thường ngày, biến nó thành chỗ chặn người ta vì một lý
  // do không liên quan là cách nhanh nhất để nó bị gỡ.
  if (d.html == null) return "cho-qua-khong-ai-nghe";
  // Có người nghe nhưng đang phục vụ bản dựng KHÁC (máy chủ chế độ lập trình viên đọc
  // `.next`, hoặc một bản cũ đã bị thay từ trước) — thư mục sắp ghi không phải thư mục
  // nó đang đọc.
  if (!d.html.includes(d.buildIdTrenDia)) return "cho-qua-khac-ban-dung";
  return "dung";
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHẦN THỰC THI — chỉ chạy khi file này LÀ điểm vào
// ═══════════════════════════════════════════════════════════════════════════════
// Không có hàng rào này thì `import { quyetDinh }` từ bài test cũng kéo theo một lượt
// gọi mạng và một `process.exit(1)` — bài test chết trước khi chạy được phép kiểm nào,
// và thông báo lỗi ("process.exit unexpectedly called") không nói gì về nguyên nhân.
// Đã sập đúng như vậy một lần lúc viết bài test này.
const laDiemVao =
  !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (laDiemVao) {
  const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const CONG = process.env.PORT ?? "3000";
  const THU_MUC = ".next-prod"; // khớp `distDir` khi NODE_ENV=production (apps/hub/next.config.mjs)

  let buildIdTrenDia = null;
  try {
    buildIdTrenDia = (await readFile(resolve(GOC, "apps/hub", THU_MUC, "BUILD_ID"), "utf8")).trim();
  } catch {
    buildIdTrenDia = null;
  }

  let html = null;
  if (buildIdTrenDia) {
    try {
      const res = await fetch(`http://127.0.0.1:${CONG}/login`, {
        signal: AbortSignal.timeout(2500),
        headers: { "user-agent": "canh-build" },
      });
      html = await res.text();
    } catch {
      html = null;
    }
  }

  const ket = quyetDinh({
    boQua: process.env.BO_QUA_CANH_BUILD === "1",
    buildIdTrenDia,
    html,
  });
  if (ket !== "dung") {
    if (ket === "cho-qua-nguoi-dung-tu-tat") {
      console.log("canh-build: bỏ qua theo BO_QUA_CANH_BUILD=1 — tự chịu trách nhiệm.");
    }
    process.exit(0);
  }

  console.error("");
  console.error("  ✗ DỪNG: máy chủ đang chạy VÀ đang phục vụ chính bản dựng sắp bị ghi đè.");
  console.error("");
  console.error(`     Cổng            : ${CONG}`);
  console.error(`     Thư mục sắp ghi : apps/hub/${THU_MUC}`);
  console.error(`     BUILD_ID trùng  : ${buildIdTrenDia}`);
  console.error("");
  console.error("  Dựng tiếp thì mọi tệp chunk bị thay dưới chân tiến trình đang phục vụ.");
  console.error("  Trình duyệt của người đang mở trang sẽ nhận ChunkLoadError và một trang");
  console.error("  trắng — trong khi build vẫn in \"Compiled successfully\" và log máy chủ vẫn sạch.");
  console.error("");
  console.error("  CHỮA — dừng máy chủ rồi dựng lại:");
  console.error("");
  console.error("     # Windows / PowerShell");
  console.error(`     Get-NetTCPConnection -LocalPort ${CONG} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`);
  console.error("");
  console.error("     # Linux / macOS");
  console.error(`     kill $(lsof -t -i:${CONG})`);
  console.error("");
  console.error("  Rồi:  pnpm --filter @hub/app build  &&  bash tools/start-local.sh");
  console.error("");
  console.error("  (Biết mình đang làm gì và vẫn muốn dựng: BO_QUA_CANH_BUILD=1)");
  console.error("");
  process.exit(1);
}
