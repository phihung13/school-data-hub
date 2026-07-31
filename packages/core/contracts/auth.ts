// packages/core/contracts/auth.ts
import { z } from "zod";

export const HubRole = z.enum([
  "student",
  "guardian",
  "teacher",
  "homeroom",
  "counselor",
  "principal",
  "board",
  "admin",
]);
export type HubRole = z.infer<typeof HubRole>;

/** Vỏ ngoài của mini app trong lưới trang chủ — quyền quyết định app nào hiện/mờ. */
export const MiniAppTile = z.object({
  key: z.string(),
  label: z.string(),
  icon: z.string(), // tên icon Material Symbols Rounded — dùng khi không có iconImageUrl
  /** Logo thật của app ngoài (Tier 2) — ưu tiên hơn "icon" nếu có. Ảnh tự host trong /public. */
  iconImageUrl: z.string().optional(),
  href: z.string(),
  available: z.boolean(), // false = "· sắp" (GĐ2), vẫn hiện mờ theo DESIGN-GUIDELINES §3
});
export type MiniAppTile = z.infer<typeof MiniAppTile>;

/**
 * Output của `session.miniApps`. Lưới trang chủ là thứ đầu tiên người dùng thấy sau khi
 * đăng nhập, nên hình dạng của nó phải nằm trong hợp đồng chứ không chỉ suy ra từ kiểu
 * trả về của `buildMiniApps` — vibe team đọc `packages/core/contracts` mới thấy nó tồn tại
 * (`03-api.md` luật 3, DEBT #13).
 */
export const MiniAppsOutput = z.array(MiniAppTile);
export type MiniAppsOutput = z.infer<typeof MiniAppsOutput>;

/**
 * Output của `session.me` — `null` khi chưa đăng nhập (đây là publicProcedure, chưa đăng
 * nhập KHÔNG phải lỗi). `displayName` nullable vì tài khoản tạo từ connector có thể chưa
 * có tên hiển thị; UI phải tự lo ca đó thay vì tin là luôn có chuỗi.
 */
export const SessionMeOutput = z
  .object({
    displayName: z.string().nullable(),
    roles: z.array(HubRole),
  })
  .nullable();
export type SessionMeOutput = z.infer<typeof SessionMeOutput>;

export const SessionUser = z.object({
  userId: z.string().uuid(),
  authUid: z.string().uuid(),
  displayName: z.string(),
  email: z.string().nullable(),
  roles: z.array(HubRole),
  studentId: z.string().uuid().nullable(), // set nếu roles chứa "student"
  homeroomClassId: z.string().uuid().nullable(), // set nếu là GVCN — buồng lái cần
});
export type SessionUser = z.infer<typeof SessionUser>;
