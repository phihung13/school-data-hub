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
import { docCauHinhAi, type CauHinhAi } from "./cau-hinh";

/** Trạm đã cắm khoá chưa — màn hình dùng để nói "chưa bật" thay vì "đang lỗi". */
export async function daCoKhoaAi(): Promise<boolean> {
  return (await docCauHinhAi()).khoa.length > 0;
}

/**
 * Bộ nối HTTP thuần tới OpenRouter (chuẩn OpenAI: Bearer + choices[].message.content).
 * Không SDK, không phụ thuộc mới — đúng tinh thần file này. Khoá/model lấy từ `cau-hinh`
 * (env của trường thắng; nếu không có thì lấy key nhập ở UI Cài đặt).
 *
 * Ném khi thiếu khoá thay vì trả câu giả: một trạm AI "chạy" mà không gọi ai còn nguy
 * hiểm hơn một trạm báo lỗi — người dùng tin câu trả lời mà không biết nó từ đâu ra.
 */
export async function nhaCungCapMacDinh(): Promise<NhaCungCap> {
  const cfg: CauHinhAi = await docCauHinhAi();
  return {
    ten: "openrouter",
    model: cfg.model,
    async hoi(chuSach: string) {
      if (!cfg.khoa) {
        throw new Error("AI chưa cấu hình khoá — vào Cài đặt để nhập OpenRouter API key.");
      }
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.khoa}`,
          // OpenRouter khuyến nghị hai header này để nhận diện ứng dụng.
          "HTTP-Referer": "https://os.truongvietanh.com",
          "X-Title": "Major OS",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 800,
          messages: [{ role: "user", content: chuSach }],
        }),
      });
      if (!res.ok) {
        // KHÔNG in thân phản hồi vào lỗi: nó có thể chứa lại chính chuỗi vừa gửi, và
        // chuỗi lỗi thì đi vào log, mà log đi vào bản sao lưu.
        throw new Error(`nhà cung cấp trả ${res.status}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        traLoi: data.choices?.[0]?.message?.content ?? "",
        tokenVao: data.usage?.prompt_tokens,
        tokenRa: data.usage?.completion_tokens,
      };
    },
  };
}
