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
// ── Vì sao KHÔNG có trường nào về secret ở đây ───────────────────────────────────
// Không nhận giá trị secret (không bao giờ vào database — xem đầu migration 0052), và từ
// `0058` cũng không nhận cả TÊN biến: mọi app dùng MỘT chuỗi chung của trường, cho cả
// webhook lẫn đăng nhập. Nên "app này đã cấp secret chưa" thôi là một câu hỏi — câu trả lời
// luôn là rồi, và một trường boolean luôn `true` chỉ làm màn hình bận thêm.
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

/**
 * `redirect_uri` / `backchannel_logout_uri`: https tuyệt đối, KHÔNG fragment.
 *
 * Khớp đúng `core.moi_uri_la_https()` của migration 0055 — hai lớp, không phải một lớp
 * thừa: lớp trong bảng là lớp không ai vòng qua được, lớp này để người khai app nhận một
 * câu tiếng Việt thay vì mã 23514. `#` bị cấm theo OIDC Core 3.1.2.1; `http://` bị cấm vì
 * authorization_code đi qua đường không mã hoá là code cho không người ngồi cùng wifi.
 */
export const MiniAppRedirectUri = z
  .string()
  .regex(
    /^https:\/\/[a-z0-9.-]+(:\d{1,5})?(\/[^#]*)?$/,
    "URI phải bắt đầu bằng https:// và không chứa dấu #",
  );

/**
 * Bốn scope `provider.ts` công bố, không hơn.
 *
 * Khai một scope provider không biết thì oidc-provider im lặng bỏ qua nó: RP xin
 * `hub_profil` (thiếu chữ e) vẫn đăng nhập được nhưng không bao giờ nhận được vai — đúng
 * kiểu hỏng lặng mà cả kho này tồn tại để chặn. `openid` là bắt buộc (kiểm ở ràng buộc của
 * bảng): thiếu nó thì đây không còn là OIDC, chỉ là OAuth2 trần, và không có `id_token`.
 */
export const MiniAppScope = z.enum(["openid", "profile", "hub_profile", "offline_access"]);
export type MiniAppScope = z.infer<typeof MiniAppScope>;

export const MiniAppRole = z.enum([
  "student",
  "guardian",
  "teacher",
  "homeroom",
  "counselor",
  "principal",
  "board",
  "admin",
  "staff", // nhân viên phòng ban — được gán mini-app phòng ban (Super App, 26/08/2026)
  "ceo", // người điều hành cao nhất — buồng lái điều hành toàn hệ thống (27/08/2026)
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
  // KHÔNG còn `webhookSecretEnv`/`daCapSecret` (0058, chủ đầu tư: *"thì bạn cứ yêu cầu app
  // theo khoá của bạn"*). Mọi app dùng MỘT chuỗi chung của trường cho cả webhook lẫn đăng
  // nhập, nên "app này đã cấp secret chưa" không còn là một câu hỏi — câu trả lời luôn là rồi.
  // Hai cột tương ứng cũng đã bị xoá khỏi `core.embedded_apps`: một trường còn tồn tại là một
  // trường còn khai được, và ngày có người khai mà quên đặt giá trị là ngày cổng đóng câm.

  // ── SSO (ADR-032, migration 0055) ────────────────────────────────────────────────
  // Trước 07/08/2026 những trường này nằm trong `apps/hub/server/oidc/clients.ts` — một
  // mảng TypeScript. Hệ quả không phải là bất tiện mà là một lỗ thu hồi: tắt app trong sổ
  // cắt được nhúng và webhook, nhưng client OIDC vẫn sống tới lần deploy sau.
  /** App này có phải Relying Party OIDC không. Tắt app ⇒ SSO tắt theo, không cần deploy. */
  ssoEnabled: z.boolean(),
  /** redirect_uri app tự khai. KHÔNG gồm `/embed/relay` — Hub tự thêm cái đó từ HUB_URL. */
  ssoRedirectUris: z.array(z.string()),
  ssoBackchannelLogoutUri: z.string().nullable(),
  ssoScopes: z.array(z.string()),

  /**
   * CÒN THIẾU GÌ ĐỂ APP NÀY CHẠY — theo đúng thứ tự phải làm, rỗng nghĩa là sẵn sàng.
   *
   * Sinh ra từ một phép thử trọn vòng ngày 08/08/2026 và một câu hỏi đi kèm: *"tôi tải file
   * md đưa app khác, nó trả về json mà tôi paste vào không chạy thì bạn chịu trách nhiệm"*.
   * Đo thật: dán phiếu xong, app vào sổ đúng — nhưng **cả ba đường đều chưa chạy**
   * (`/embed` 404 · `/oidc/auth` invalid_client · webhook 401). Phải làm thêm ba việc nữa.
   *
   * Ba việc đó ĐỀU đã hiện trên thẻ app từ trước — badge "ĐANG TẮT", chip "chưa cấp cho vai
   * nào", khối đỏ tên biến môi trường — nhưng **rải ba chỗ**, và người vừa dán phiếu không
   * có cách nào biết mình còn mấy việc hay đã xong. Trường này gom chúng lại thành một câu
   * trả lời duy nhất, do MÁY CHỦ tính: nó là bên duy nhất đọc được `process.env`.
   *
   * Thứ tự trong mảng là thứ tự nên làm: hai việc trên màn hình trước, việc chạm máy chủ
   * sau cùng — vì đó là việc phải nhờ người khác.
   */
  conThieu: z.array(z.string()),

  /**
   * App này ĐÃ GỬI VỀ những gì — một dòng cho mỗi loại sự kiện.
   *
   * Sinh ra từ một câu chủ đầu tư hỏi 08/08/2026: *"các app mini nhúng vào bây giờ đổ dữ
   * liệu của app về hết được chưa"*. Trước trường này, câu đó chỉ trả lời được bằng một lời
   * hứa — bảng nhận `ops.embedded_app_events` không vai nào đọc được, không màn hình nào
   * hiện, nên "dữ liệu có về không" là chuyện phải tin.
   *
   * Mảng RỖNG có nghĩa rõ ràng và cần nói ra trên màn: app chưa gửi về gì cả. Đó là trạng
   * thái bình thường của một app vừa khai, và là trạng thái ĐÁNG NGỜ của một app đã bật ba
   * tuần — hai ca đó chỉ phân biệt được khi có con số đứng cạnh.
   */
  daNhan: z.array(
    z.object({
      eventType: z.string(),
      soSuKien: z.number().int(),
      /** Bao nhiêu em khác nhau. `0` = sự kiện không gắn em nào (thực đơn tuần, lịch CLB). */
      soEm: z.number().int(),
      lanCuoi: z.string(),
    }),
  ),

  updatedAt: z.string(),
});
export type MiniAppRow = z.infer<typeof MiniAppRow>;

export const ListMiniAppsOutput = z.object({
  apps: z.array(MiniAppRow),
  /** Số app tới hạn rà trong 30 ngày tới hoặc đã quá hạn — để màn hình khỏi tự đếm. */
  soAppCanRaLai: z.number().int(),
  /**
   * Địa chỉ gốc của chính Hub này (`HUB_URL`), do MÁY CHỦ khai.
   *
   * Màn quản trị sinh hướng dẫn tích hợp cho từng app — issuer OIDC, endpoint webhook, URL
   * nhúng — và mọi thứ đó bắt đầu bằng địa chỉ Hub. Để trình duyệt tự lấy
   * `window.location.origin` thì bản hướng dẫn sẽ đúng theo cửa mà quản trị đang vào: mở
   * bằng `localhost:3000` là chép cho đối tác một issuer trỏ về máy của chính mình. Máy chủ
   * biết địa chỉ thật của nó; màn hình thì không.
   */
  hubUrl: z.string(),
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

  // ── SSO ──────────────────────────────────────────────────────────────────────────
  // Cùng nguyên tắc với `enabled`: KHÔNG suy `ssoEnabled` từ việc app có redirect_uri.
  // Có app nhúng mà không cần đăng nhập (trang tin của trường) và có app đăng nhập mà
  // không nhúng (Đường A). Suy ra thì mọi app nhúng tự nhiên thành một RP xin được token —
  // cấp quyền bằng cách quên không khai.
  ssoEnabled: z.boolean().default(false),
  ssoRedirectUris: z.array(MiniAppRedirectUri).default([]),
  ssoBackchannelLogoutUri: MiniAppRedirectUri.nullish(),
  ssoScopes: z.array(MiniAppScope).default(["openid", "profile"]),
});
export type CreateMiniAppInput = z.infer<typeof CreateMiniAppInput>;

/** Sửa app đã có. `appId` và `basket` KHÔNG sửa được — xem chú thích ở router. */
export const UpdateMiniAppInput = CreateMiniAppInput.omit({ appId: true, basket: true }).partial().extend({
  appId: MiniAppId,
});
export type UpdateMiniAppInput = z.infer<typeof UpdateMiniAppInput>;

// ---------------------------------------------------------------------------
// PHIẾU ĐẤU NỐI — thứ đội làm app gửi về, dán một phát ra app
// ---------------------------------------------------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════
// VÌ SAO CÓ MỘT KHUÔN THỨ HAI, KHÔNG DÙNG THẲNG `CreateMiniAppInput`
// ═══════════════════════════════════════════════════════════════════════════
// Chủ đầu tư yêu cầu 07/08/2026: một file .md tải xuống đưa cho đội làm app, họ trả về
// "đúng 1 đoạn json ko cần giải thích gì thêm", dán vào là ra app.
//
// `CreateMiniAppInput` KHÔNG dùng làm khuôn đó được, vì bốn trong số các trường của nó là
// quyết định của NHÀ TRƯỜNG chứ không của đội làm app:
//   · `allowedRoles`     — ai được mở app
//   · `reviewDueOn`      — nhịp rà lại của trường
//   · khoá bí mật — nay là MỘT chuỗi chung của trường (`0058`), không app nào tự khai
// Để đội ngoài điền bốn thứ đó là mời họ tự cấp quyền cho chính mình, và bằng một đường mà
// người dán không đọc kỹ sẽ không thấy. Nên phiếu **cố ý hẹp hơn**, và `.strict()` ở dưới
// biến "khai thừa" thành lỗi có tên chứ không thành một trường bị bỏ qua trong im lặng.
//
// Khoá tiếng Việt là có chủ ý: người đọc bản yêu cầu là đội làm app Việt Nam (hoặc một AI
// đọc bản tiếng Việt đó). Một khuôn tiếng Anh cạnh một tài liệu tiếng Việt là thêm một lớp
// dịch, và mỗi lớp dịch là một chỗ dịch sai.

/**
 * Phiếu đội làm app gửi về — PHẲNG, KHÔNG NHÁNH, KHÔNG `null`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐƠN GIẢN HOÁ 23/08/2026 — vì mọi app ở đây giống hệt nhau về hình dạng
 * ═══════════════════════════════════════════════════════════════════════════
 * Chủ đầu tư chốt: *"tất cả các app, đều là app nội bộ, tất cả dùng sso, ko ai được hệ
 * riêng, trang nào cũng bắn dữ liệu về hết, kể cả thực đơn"*.
 *
 * Bản trước có ba nhánh `nhung` / `webhook` / `sso`, mỗi nhánh `nullish()`, vì nó được
 * viết cho một thế giới có app chỉ-nhúng, app chỉ-webhook, app chỉ-SSO. Thế giới đó không
 * tồn tại ở đây. Ba nhánh tuỳ chọn nghĩa là **tám tổ hợp**, trong đó bảy tổ hợp không app
 * nào dùng — nhưng người đọc phiếu vẫn phải cân nhắc cả tám, và người viết phiếu vẫn có
 * bảy cách khai sai.
 *
 * Nay: một hình dạng duy nhất, mọi trường bắt buộc trừ hai trường trang trí. Không tổ hợp
 * nào để cân nhắc, không nhánh nào để bỏ quên.
 *
 * HAI TRƯỜNG ĐÃ BỎ HẲN, vì Hub tự suy ra được:
 *   · `origin`  — luôn là phần `scheme://host` của `urlIframe` (ràng buộc cũ đã bắt hai
 *     thứ đó phải khớp nhau). Bắt khai cả hai là bắt khai một thứ hai lần, và tạo ra một
 *     kiểu sai — khai lệch nhau — mà nay không tồn tại nữa.
 *   · `scopes`  — mọi app nội bộ dùng `openid profile hub_profile`. Không app nào chọn khác.
 *
 * `.strict()` giữ nguyên: khai thừa là lỗi có tên, không phải một trường bị bỏ qua im lặng.
 */
export const PhieuDauNoi = z
  .object({
    phienBan: z.literal(1, {
      errorMap: () => ({ message: 'Thiếu hoặc sai "phienBan" — bản yêu cầu hiện tại là phiên bản 1' }),
    }),
    maApp: MiniAppId,
    tenHienThi: z.string().trim().min(1).max(60),
    moTaMotCau: z.string().trim().max(200).nullish(),
    roDuLieu: MiniAppBasket,
    doiChiuTrachNhiem: z.string().trim().min(2).max(120),

    /** Trang Hub nhúng vào khung. `origin` suy ra từ đây, không khai riêng. */
    urlIframe: z
      .string()
      .regex(
        /^https:\/\/[a-z0-9.-]+(:\d{1,5})?(\/[^#?]*)?$/,
        "urlIframe phải dạng https://ten-mien/duong-dan — không dấu # và không tham số ?",
      ),

    /** Mọi app đều bắn dữ liệu về. Mảng rỗng = Hub từ chối mọi lời gọi, nên cấm rỗng. */
    cacLoaiSuKien: z
      .array(z.string().trim().min(1))
      .min(1, "Phải khai ít nhất một loại sự kiện — mọi app đều đổ dữ liệu về Hub"),

    /** Mọi app đều đăng nhập bằng tài khoản Hub. Không app nào có hệ tài khoản riêng. */
    redirectUris: z.array(MiniAppRedirectUri).min(1, "Phải có ít nhất một redirect_uri — mọi app đều dùng SSO"),

    /** Nơi Hub gọi vào khi người dùng thoát khỏi Hub. Chưa làm kịp thì bỏ trống. */
    urlDangXuat: MiniAppRedirectUri.nullish(),
  })
  .strict();
export type PhieuDauNoi = z.infer<typeof PhieuDauNoi>;

/** `https://a.b/c/d` → `https://a.b`. Dùng cho `origin`, thứ đã thôi bắt khai tay. */
export function originTuUrl(url: string): string {
  const m = /^(https:\/\/[a-z0-9.-]+(?::\d{1,5})?)/.exec(url);
  // Regex của `urlIframe` đã bảo đảm khớp; nhánh này chỉ để kiểu trả về không có `undefined`.
  return m?.[1] ?? url;
}

/** Bốn khoá bị từ chối có tên — dùng để dựng câu lỗi nói rõ VÌ SAO, không chỉ "khoá lạ". */
export const KHOA_NHA_TRUONG_QUYET: Record<string, string> = {
  allowedRoles: "vai nào được mở app — nhà trường cấp trên màn hình sau khi dán",
  vai: "vai nào được mở app — nhà trường cấp trên màn hình sau khi dán",
  enabled: "app bật hay tắt — app dán vào luôn TẮT cho tới khi có người có thẩm quyền bật",
  reviewDueOn: "ngày rà lại — nhà trường đặt, mặc định 6 tháng",
  ngayRaLai: "ngày rà lại — nhà trường đặt, mặc định 6 tháng",
  webhookSecretEnv: "khoá riêng cho từng app — KHÔNG còn khái niệm đó, mọi app dùng chuỗi chung của trường",
  ssoClientSecretEnv: "khoá riêng cho từng app — KHÔNG còn khái niệm đó, mọi app dùng chuỗi chung của trường",
  secret: "giá trị chuỗi bí mật — không bao giờ đi qua đường này",
};

/**
 * Phiếu → khai báo app. Hàm THUẦN, không đọc đồng hồ: `ngayRaLai` truyền vào.
 *
 * Vì sao ngày không tính ở đây: nó là ngày của NHÀ TRƯỜNG, và một hàm tự gọi `new Date()`
 * thì bài test phải chạy đúng vào một ngày cụ thể mới đo được. Người gọi truyền vào, test
 * truyền một hằng số.
 *
 * `allowedRoles` LUÔN rỗng — fail-closed. Dán một phiếu không bao giờ cấp quyền cho ai.
 */
export function phieuThanhKhaiBao(phieu: PhieuDauNoi, ngayRaLai: string): CreateMiniAppInput {
  return {
    appId: phieu.maApp,
    displayName: phieu.tenHienThi,
    basket: phieu.roDuLieu,
    owner: phieu.doiChiuTrachNhiem,
    reviewDueOn: ngayRaLai,
    allowedRoles: [],
    allowedEventTypes: phieu.cacLoaiSuKien,
    origin: originTuUrl(phieu.urlIframe),
    iframeUrl: phieu.urlIframe,
    iconImageUrl: null,
    intro: phieu.moTaMotCau ?? null,
    // Luôn bật: không app nội bộ nào có hệ tài khoản riêng (chốt 23/08/2026).
    ssoEnabled: true,
    ssoRedirectUris: phieu.redirectUris,
    ssoBackchannelLogoutUri: phieu.urlDangXuat ?? null,
    // `hub_profile` CÓ trong danh sách mặc định, và đó là một quyết định, không phải sót:
    // không có nó thì app chỉ nhận `sub` + `name`, tức KHÔNG BIẾT người đang xem là học
    // sinh hay giáo viên. Mọi app nội bộ đều cần biết điều đó ít nhất một lần. Để app tự
    // xin thêm scope là dựng lại đúng vòng hỏi-đáp mà đợt này đi xoá.
    ssoScopes: ["openid", "profile", "hub_profile"],
  };
}

export const SetMiniAppEnabledInput = z.object({
  appId: MiniAppId,
  enabled: z.boolean(),
});

export const MiniAppMutationOutput = z.object({
  app: MiniAppRow,
});
