// apps/hub/server/kho-man-request.ts — đọc gợi ý khổ màn từ header của request.
//
// Một file cho MỘT lời gọi `headers()`, và đó là chủ ý:
//
// `headers()` của Next chỉ sống trong ngữ cảnh một request. `tests/db/cong-checkin.test.ts`
// gọi thẳng `HomePage()` để đo cổng check-in, tức NGOÀI ngữ cảnh đó — và trang ném
// "`headers` was called outside a request scope", làm bài đỏ vì một lý do không liên quan
// gì tới thứ nó đo.
//
// Ba đường xử, chọn đường thứ ba:
//   · `vi.mock("next/headers")` — KHÔNG ăn: vitest coi `next` là gói ngoài nên mock không
//     chạm tới. Thử rồi, vẫn ném y nguyên.
//   · `try/catch` nuốt lỗi trong trang — nuốt một lỗi thật để test xanh, đúng thứ kho này
//     cấm ở mọi chỗ khác.
//   · tách ra một module của MÌNH (`@/server/...`), thứ bộ test mock được như đã mock
//     `@/server/lich` và `@/server/mini-apps`. Không nuốt lỗi nào, không đường tắt nào.
import { headers } from "next/headers";
import { khoManTuHeader } from "@/lib/kho-man";

/** `true` = máy tính · `false` = điện thoại · `null` = trình duyệt không khai. */
export function docKhoManTuRequest(): boolean | null {
  return khoManTuHeader(headers().get("sec-ch-ua-mobile"));
}
