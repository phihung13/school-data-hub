// apps/hub/server/ai/nha-cung-cap.ts — CHỖ DUY NHẤT trong toàn kho được import SDK model.
//
// `tools/ai-import-gate.mjs` cưỡng chế điều đó: tên file này được ghim cứng trong cổng,
// nên mở rộng phạm vi là một dòng phải sửa TRONG CỔNG — tức một quyết định có dấu vết,
// không phải một cú `touch` thêm file vào thư mục.
//
// ═══════════════════════════════════════════════════════════════════════════
// HÔM NAY CHƯA CÓ SDK NÀO ĐƯỢC CÀI, VÀ ĐÓ LÀ TRẠNG THÁI ĐÚNG
// ═══════════════════════════════════════════════════════════════════════════
// Trường chưa mua khoá model nào. File này vì thế chưa import gì thật — nó dựng sẵn
// HÌNH DẠNG (giao diện `NhaCungCap`) và một bộ nối HTTP thuần không cần SDK.
//
// Vì sao HTTP thuần chứ không cài SDK sẵn cho tiện: cài một gói AI vào kho hôm nay là
// đưa vào một phụ thuộc chưa ai dùng, chưa ai rà, và nó sẽ nằm đó qua nhiều lần cập
// nhật. Ngày trường chốt nhà cung cấp, người làm việc đó cài đúng một gói và sửa đúng
// file này — cổng §7 sẽ cho phép, vì đây là chỗ được phép.
//
// ═══════════════════════════════════════════════════════════════════════════
// KHOÁ Ở ĐÂU
// ═══════════════════════════════════════════════════════════════════════════
// `AI_API_KEY` trong `apps/hub/.env.local` — file gitignore, không lên GitHub, không đi
// theo lên máy chủ trường (§8, cùng khuôn `DEV_LOGIN_SECRET`). **Thiếu biến ⇒ trạm
// đóng với tất cả**, không có nhánh nào chạy không khoá. Cùng luật `dev-gate.ts`: một
// cửa "tạm mở khi chưa cấu hình" là cửa sẽ ở lại mở.
import type { NhaCungCap } from "./tram";

const URL_MAC_DINH = "https://api.anthropic.com/v1/messages";
const MODEL_MAC_DINH = "claude-haiku-4-5-20251001";

/** Trạm đã cắm khoá chưa — màn hình dùng để nói "chưa bật" thay vì "đang lỗi". */
export function daCoKhoaAi(): boolean {
  return (process.env.AI_API_KEY ?? "").trim().length > 0;
}

/**
 * Bộ nối HTTP thuần. Không SDK, không phụ thuộc mới.
 *
 * Ném khi thiếu khoá thay vì trả một câu trả lời giả: một trạm AI "chạy" mà không gọi
 * ai là thứ nguy hiểm hơn một trạm báo lỗi — người dùng tin câu trả lời, và không ai
 * biết nó từ đâu ra.
 */
export function nhaCungCapMacDinh(): NhaCungCap {
  const khoa = (process.env.AI_API_KEY ?? "").trim();
  const model = (process.env.AI_MODEL ?? MODEL_MAC_DINH).trim();

  return {
    ten: "anthropic",
    model,
    async hoi(chuSach: string) {
      if (!khoa) {
        throw new Error("AI_API_KEY chưa đặt — trạm AI đóng. Xem apps/hub/server/ai/nha-cung-cap.ts.");
      }
      const res = await fetch(process.env.AI_API_URL ?? URL_MAC_DINH, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": khoa,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: "user", content: chuSach }],
        }),
      });
      if (!res.ok) {
        // KHÔNG in thân phản hồi vào lỗi: nó có thể chứa lại chính chuỗi vừa gửi, và
        // chuỗi lỗi thì đi vào log, mà log đi vào bản sao lưu.
        throw new Error(`nhà cung cấp trả ${res.status}`);
      }
      const data = (await res.json()) as {
        content?: Array<{ text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      return {
        traLoi: data.content?.map((c) => c.text ?? "").join("") ?? "",
        tokenVao: data.usage?.input_tokens,
        tokenRa: data.usage?.output_tokens,
      };
    },
  };
}
