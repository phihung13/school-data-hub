// apps/hub/components/gvcn/mutation-id.ts — sinh mã chống trùng cho mutation (§9).
//
// Vì sao KHÔNG gọi thẳng `crypto.randomUUID()`: hàm đó chỉ tồn tại trong "secure
// context". Hub chạy qua HTTPS ở ngoài, nhưng bản demo/LAN của trường và máy tính
// phòng giám thị vẫn có thể mở bằng `http://<ip nội bộ>` — ở đó `crypto.randomUUID`
// là `undefined`, và một `TypeError` lúc render sẽ làm trắng cả màn hình chứ không
// chỉ hỏng cái nút.
//
// Bản sao của `newMutationId()` trong `components/gvcn-dashboard.tsx` (file đó thuộc
// gói việc khác nên không đưa hàm ra dùng chung trong cùng lần sửa này). Khi hai gói
// gặp nhau: gộp về một chỗ, giữ nguyên hành vi.
"use client";

/** UUID v4 hợp lệ — contract ép `.uuid()`, trả chuỗi bất kỳ là BAD_REQUEST. */
export function newMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.floor(Math.random() * 256) & (15 >> (Number(c) / 4)))).toString(16),
  );
}
