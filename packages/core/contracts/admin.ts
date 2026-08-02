// packages/core/contracts/admin.ts
// Router `admin` — màn quản trị Mini App (migration 0052, ADR-015 mục 5).
//
// Bề mặt này CỐ Ý không có gì ngoài sổ đăng ký Mini App. Cám dỗ khi dựng một router tên
// `admin` là gom vào đó mọi thứ "chỉ quản trị mới làm được" — khoá tài khoản, đổi ngưỡng
// cảnh báo, xoá dữ liệu. Không làm, vì mỗi việc trong số đó có ràng buộc riêng của nó
// (§5 cấm đưa cảm xúc vào báo cáo, mệnh lệnh 7 cấm viết chết ngưỡng, Luật ẩn danh hoá có
// quy trình riêng ở 0033) và một router gom sẵn là chỗ để người sau thả vào những thứ
// chưa ai duyệt.
//
// ── Vì sao secret KHÔNG có mặt ở đây, kể cả để ghi ────────────────────────────────
// Contract này không nhận `webhookSecret`, chỉ nhận `webhookSecretEnv` (TÊN biến môi
// trường). Đó không phải là quên: giá trị secret không bao giờ vào database (xem khối
// chú thích đầu migration 0052), nên cũng không có gì cho màn hình gửi lên. Màn quản trị
// trả lời được "app này đã cấp secret chưa" nhờ trường `daCapSecret` do MÁY CHỦ tính —
// và câu trả lời đó là một boolean, không phải một chuỗi.
import { z } from "zod";

/**
 * Rổ dữ liệu (08-embedded-apps.md mục 0). CHỈ hai giá trị.
 *
 * Rổ Đỏ không có mặt ở đây với đúng lý do nó không có mặt trong CHECK của bảng: nó là
 * "cấm tuyệt đối, không có đường xin". Một enum ba giá trị rồi chặn giá trị thứ ba ở tầng
 * dưới là để lộ ra một trạng thái hợp lệ trên giấy — và mọi thứ hợp lệ trên giấy rồi sẽ
 * có người thử.
 */
export const MiniAppBasket = z.enum(["xanh", "vang"]);
export type MiniAppBasket = z.infer<typeof MiniAppBasket>;

/** Mã app đi thẳng vào URL `/embed/<app_id>` — khớp CHECK của bảng, không lỏng hơn. */
export const MiniAppId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/, "Mã app chỉ gồm chữ thường, số và dấu gạch ngang");

/**
 * Origin CHÍNH XÁC: có https://, không đường dẫn, không dấu / cuối.
 *
 * Kiểm ở đây VÀ ở CHECK của bảng — hai lớp, không phải một lớp thừa. Lớp trong bảng là
 * lớp không ai vòng qua được (kể cả psql); lớp này tồn tại để người dùng nhận một câu
 * tiếng Việt nói rõ sai ở đâu, thay vì một mã lỗi 23514 của Postgres.
 */
export const MiniAppOrigin = z
  .string()
  .regex(/^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/, "Origin phải dạng https://ten-mien — không kèm đường dẫn, không dấu / cuối");

export const MiniAppRole = z.enum([
  "student",
  "guardian",
  "teacher",
  "homeroom",
  "counselor",
  "principal",
  "board",
  "admin",
]);

/** Một dòng trong sổ, như màn quản trị nhìn thấy. */
export const MiniAppRow = z.object({
  appId: z.string(),
  displayName: z.string(),
  basket: MiniAppBasket,
  enabled: z.boolean(),
  allowedRoles: z.array(MiniAppRole),
  allowedEventTypes: z.array(z.string()),
  origin: z.string().nullable(),
  iframeUrl: z.string().nullable(),
  iconImageUrl: z.string().nullable(),
  intro: z.string().nullable(),
  owner: z.string(),
  /** ISO date. Quá hạn thì màn hình bật đèn — mục 5 đòi rà lại mỗi 6 tháng. */
  reviewDueOn: z.string(),
  /** Số ngày quá hạn rà (âm = còn hạn). Máy chủ tính, màn hình không tự trừ ngày. */
  overdueDays: z.number().int(),
  webhookSecretEnv: z.string().nullable(),
  /**
   * Biến môi trường đó CÓ giá trị trên máy chủ này chưa. Máy chủ tính, không gửi giá trị.
   *
   * Đây là câu hỏi mà không màn hình nào tự trả lời được: bảng chỉ biết TÊN biến. Không
   * có trường này thì quản trị khai `EMBED_WEBHOOK_SECRET_X`, thấy nó hiện lên đẹp đẽ, và
   * tin rằng webhook đã sẵn sàng — trong khi biến chưa từng được đặt và mọi lời gọi từ
   * app sẽ nhận 401. Đúng loại hỏng im lặng mà cả kho này tồn tại để chặn.
   */
  daCapSecret: z.boolean(),
  updatedAt: z.string(),
});
export type MiniAppRow = z.infer<typeof MiniAppRow>;

export const ListMiniAppsOutput = z.object({
  apps: z.array(MiniAppRow),
  /** Số app tới hạn rà trong 30 ngày tới hoặc đã quá hạn — để màn hình khỏi tự đếm. */
  soAppCanRaLai: z.number().int(),
});

/**
 * Khai một app mới. KHÔNG có trường `enabled`.
 *
 * Cố ý: app mới luôn TẮT (mặc định của bảng). Cho phép khai-và-bật trong một lần bấm là
 * gộp hai quyết định khác nhau — "app này tồn tại" và "app này được chạm vào dữ liệu học
 * sinh" — vào một cú click, và cú click đó sẽ được bấm lúc đang vội.
 */
export const CreateMiniAppInput = z.object({
  appId: MiniAppId,
  displayName: z.string().trim().min(1).max(60),
  basket: MiniAppBasket,
  owner: z.string().trim().min(2).max(120),
  reviewDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày rà lại phải dạng YYYY-MM-DD"),
  allowedRoles: z.array(MiniAppRole).default([]),
  allowedEventTypes: z.array(z.string().trim().min(1)).default([]),
  origin: MiniAppOrigin.nullish(),
  iframeUrl: z.string().url().startsWith("https://").nullish(),
  iconImageUrl: z.string().nullish(),
  intro: z.string().max(200).nullish(),
  webhookSecretEnv: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, "Tên biến môi trường viết HOA, gạch dưới")
    .nullish(),
});
export type CreateMiniAppInput = z.infer<typeof CreateMiniAppInput>;

/** Sửa app đã có. `appId` và `basket` KHÔNG sửa được — xem chú thích ở router. */
export const UpdateMiniAppInput = CreateMiniAppInput.omit({ appId: true, basket: true }).partial().extend({
  appId: MiniAppId,
});
export type UpdateMiniAppInput = z.infer<typeof UpdateMiniAppInput>;

export const SetMiniAppEnabledInput = z.object({
  appId: MiniAppId,
  enabled: z.boolean(),
});

export const MiniAppMutationOutput = z.object({
  app: MiniAppRow,
});
