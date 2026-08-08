// apps/hub/server/routers/admin.ts — màn quản trị Mini App (migration 0052, nợ #8).
//
// ═══════════════════════════════════════════════════════════════════════════════
// ĐIỀU QUAN TRỌNG NHẤT TRONG FILE NÀY: RLS TRÊN UPDATE KHÔNG NÉM LỖI
// ═══════════════════════════════════════════════════════════════════════════════
// Bài pgTAP 0052 đo được và ghi lại: chính sách chỉ-quản-trị áp cho UPDATE bằng cách LỌC
// HÀNG, không bằng cách từ chối câu lệnh. Cô giáo chạy `update core.embedded_apps set
// enabled = true` thì câu lệnh HỢP LỆ, chạy xong, không đổi gì, và Postgres trả về
// "UPDATE 0" — im lặng tuyệt đối, không một mã lỗi nào.
//
// Nghĩa là mọi handler ở đây phải tự đọc `rowCount`. Một handler viết
//     await client.query("update ... where app_id = $1", [id]);
//     return { ok: true };
// sẽ báo "đã lưu" cho một thao tác chưa từng xảy ra — và người bấm là người vừa tưởng
// mình thu hồi xong một app đang lộ dữ liệu.
//
// (INSERT thì khác: `with check` không có hàng nào để lọc nên nó ném 42501 thật. Hai lệnh
// hai kiểu từ chối — biết rõ kiểu nào ở đâu là điều kiện để xử đúng.)
//
// ═══════════════════════════════════════════════════════════════════════════════
// HAI TRƯỜNG KHÔNG SỬA ĐƯỢC, VÀ VÌ SAO
// ═══════════════════════════════════════════════════════════════════════════════
//   · `appId` — nó nằm trong URL `/embed/<app_id>`, trong `x-embed-app` của mọi webhook
//     app đang gửi, và trong mã alias đã sinh cho từng em (`sha256(app-id + alias + …)`,
//     08-embedded-apps.md mục 5). Đổi mã app là làm đứt cả ba thứ cùng lúc, trong đó thứ
//     ba KHÔNG dựng lại được: alias cũ không còn ánh xạ về đâu.
//   · `basket` — rổ dữ liệu quyết định app được chạm vào gì, và nó là thứ Hội đồng dữ
//     liệu duyệt (mục 0). Đổi rổ trên một màn hình là đi vòng qua chính cái hội đồng đó.
//     Đường đúng là tắt app cũ, khai app mới, để lịch sử còn lại hai dòng.
// Cả hai muốn đổi thì xoá đi khai lại — chậm hơn, và chậm ở đây là tính năng.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  CreateMiniAppInput,
  ListMiniAppsOutput,
  MiniAppMutationOutput,
  SetMiniAppEnabledInput,
  UpdateMiniAppInput,
} from "@hub/core/contracts";
import { router, roleProcedure } from "../trpc";
import { xoaDem } from "../embed/registry-db";

const adminProcedure = roleProcedure("admin");

interface Dong {
  app_id: string;
  display_name: string;
  basket: string;
  enabled: boolean;
  allowed_roles: string[];
  allowed_event_types: string[];
  origin: string | null;
  iframe_url: string | null;
  icon_image_url: string | null;
  intro: string | null;
  owner: string;
  review_due_on: string;
  overdue_days: number;
  webhook_secret_env: string | null;
  sso_enabled: boolean;
  sso_redirect_uris: string[];
  sso_backchannel_logout_uri: string | null;
  sso_scopes: string[];
  sso_client_secret_env: string | null;
  updated_at: string;
}

/**
 * `daCapSecret` tính Ở ĐÂY, trên máy chủ, và chỉ đi ra dưới dạng boolean.
 *
 * Bảng chỉ biết TÊN biến môi trường. Không có phép tính này thì quản trị khai
 * `EMBED_WEBHOOK_SECRET_X`, thấy nó hiện lên đẹp đẽ trên màn, và tin rằng webhook đã sẵn
 * sàng — trong khi biến chưa từng được đặt trên máy chủ và mọi lời gọi từ app sẽ nhận
 * 401. Màn hình không tự trả lời được câu này; nó không đọc được `process.env`.
 */
const CAU_TRUY_VAN = `
  select a.app_id, a.display_name, a.basket, a.enabled, a.allowed_roles, a.allowed_event_types,
         a.origin, a.iframe_url, a.icon_image_url, a.intro, a.owner,
         to_char(a.review_due_on, 'YYYY-MM-DD') as review_due_on,
         (current_date - a.review_due_on)::int  as overdue_days,
         a.webhook_secret_env,
         a.sso_enabled, a.sso_redirect_uris, a.sso_backchannel_logout_uri,
         a.sso_scopes, a.sso_client_secret_env,
         to_char(a.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as updated_at
    from core.embedded_apps a`;

function doiHang(r: Dong) {
  const env = r.webhook_secret_env ? process.env[r.webhook_secret_env] : undefined;
  const ssoEnv = r.sso_client_secret_env ? process.env[r.sso_client_secret_env] : undefined;
  return {
    appId: r.app_id,
    displayName: r.display_name,
    basket: r.basket as "xanh" | "vang",
    enabled: r.enabled,
    allowedRoles: r.allowed_roles as never,
    allowedEventTypes: r.allowed_event_types,
    origin: r.origin,
    iframeUrl: r.iframe_url,
    iconImageUrl: r.icon_image_url,
    intro: r.intro,
    owner: r.owner,
    reviewDueOn: r.review_due_on,
    overdueDays: r.overdue_days,
    webhookSecretEnv: r.webhook_secret_env,
    daCapSecret: !!env && env.length > 0,
    ssoEnabled: r.sso_enabled,
    ssoRedirectUris: r.sso_redirect_uris,
    ssoBackchannelLogoutUri: r.sso_backchannel_logout_uri,
    ssoScopes: r.sso_scopes,
    ssoClientSecretEnv: r.sso_client_secret_env,
    // Cùng phép tính, cùng lý do với `daCapSecret` ngay trên — bảng chỉ biết TÊN biến.
    daCapSsoSecret: !!ssoEnv && ssoEnv.length > 0,
    updatedAt: r.updated_at,
  };
}

/** Đọc lại một dòng sau khi ghi. Không có dòng = RLS vừa lọc mất — xem đầu file. */
async function docLai(
  runWithDb: <T>(fn: (c: { query: (q: string, p?: unknown[]) => Promise<{ rows: Dong[] }> }) => Promise<T>) => Promise<T>,
  appId: string,
) {
  const rows = await runWithDb(async (client) => {
    const { rows } = await client.query(`${CAU_TRUY_VAN} where a.app_id = $1`, [appId]);
    return rows;
  });
  const r = rows[0];
  if (!r) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Không đọc lại được app vừa ghi — tài khoản này có quyền quản trị không?",
    });
  }
  return doiHang(r);
}

export const adminRouter = router({
  miniApp: router({
    list: adminProcedure.query(async ({ ctx }) => {
      return ctx.runWithDb(async (client) => {
        const { rows } = await client.query<Dong>(`${CAU_TRUY_VAN} order by a.enabled desc, a.display_name`);
        const apps = rows.map(doiHang);
        return ListMiniAppsOutput.parse({
          apps,
          // Đếm ở máy chủ, không để màn hình tự trừ ngày: "tới hạn rà" là luật nghiệp vụ
          // (mục 5), và luật nghiệp vụ tính ở tầng hiển thị thì mỗi màn tính một kiểu.
          soAppCanRaLai: apps.filter((a) => a.overdueDays >= -30).length,
          // Địa chỉ THẬT của Hub, không phải cửa mà quản trị đang vào. Xem chú thích ở
          // `ListMiniAppsOutput`: bản hướng dẫn chép cho đối tác phải mang issuer thật.
          hubUrl: process.env.HUB_URL ?? "http://localhost:3000",
        });
      });
    }),

    create: adminProcedure.input(CreateMiniAppInput).mutation(async ({ ctx, input }) => {
      await ctx.runWithDb(async (client) => {
        // §9 — idempotent: gọi lại cùng payload KHÔNG sinh dòng thứ hai và KHÔNG nổ. Mã
        // app là khoá chính nên `on conflict do nothing` là đủ; handler đọc lại dòng ở
        // dưới nên người gọi vẫn nhận đúng trạng thái hiện tại dù đây là lần một hay lần
        // hai. KHÔNG dùng `do update`: lần gọi thứ hai với payload khác sẽ âm thầm ghi đè
        // cấu hình của một app đang chạy, và đó là một sửa đổi giả trang thành một lần tạo.
        await client.query(
          `insert into core.embedded_apps
             (app_id, display_name, basket, owner, review_due_on, allowed_roles,
              allowed_event_types, origin, iframe_url, icon_image_url, intro,
              webhook_secret_env, sso_enabled, sso_redirect_uris,
              sso_backchannel_logout_uri, sso_scopes, sso_client_secret_env, updated_by)
           -- core.current_user_id() chứ không phải một tham số: đây là CSDL tự nói ai
           -- đang ghi, dựa trên chính bối cảnh RLS của phiên. Truyền id từ tầng ứng dụng
           -- là để tầng ứng dụng tự khai — và cột nhật ký khai được thì nó không còn là
           -- nhật ký nữa.
           values ($1,$2,$3,$4,$5::date,$6::text[],$7::text[],$8,$9,$10,$11,$12,
                   $13,$14::text[],$15,$16::text[],$17, core.current_user_id())
           on conflict (app_id) do nothing`,
          [
            input.appId,
            input.displayName,
            input.basket,
            input.owner,
            input.reviewDueOn,
            input.allowedRoles,
            input.allowedEventTypes,
            input.origin ?? null,
            input.iframeUrl ?? null,
            input.iconImageUrl ?? null,
            input.intro ?? null,
            input.webhookSecretEnv ?? null,
            input.ssoEnabled,
            input.ssoRedirectUris,
            input.ssoBackchannelLogoutUri ?? null,
            input.ssoScopes,
            input.ssoClientSecretEnv ?? null,
          ],
        );
      });
      xoaDem();
      return MiniAppMutationOutput.parse({ app: await docLai(ctx.runWithDb as never, input.appId) });
    }),

    update: adminProcedure.input(UpdateMiniAppInput).mutation(async ({ ctx, input }) => {
      const { appId, ...doi } = input;
      const coDoi = Object.keys(doi).filter((k) => doi[k as keyof typeof doi] !== undefined);
      if (coDoi.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Không có trường nào để sửa." });
      }

      const soDong = await ctx.runWithDb(async (client) => {
        const cot: Record<string, string> = {
          displayName: "display_name",
          owner: "owner",
          reviewDueOn: "review_due_on",
          allowedRoles: "allowed_roles",
          allowedEventTypes: "allowed_event_types",
          origin: "origin",
          iframeUrl: "iframe_url",
          iconImageUrl: "icon_image_url",
          intro: "intro",
          webhookSecretEnv: "webhook_secret_env",
          ssoEnabled: "sso_enabled",
          ssoRedirectUris: "sso_redirect_uris",
          ssoBackchannelLogoutUri: "sso_backchannel_logout_uri",
          ssoScopes: "sso_scopes",
          ssoClientSecretEnv: "sso_client_secret_env",
        };
        const dat: string[] = [];
        const tham: unknown[] = [appId];
        for (const k of coDoi) {
          const c = cot[k];
          if (!c) continue; // trường lạ: bỏ, không dựng SQL từ chuỗi người dùng gửi lên
          tham.push(doi[k as keyof typeof doi]);
          dat.push(`${c} = $${tham.length}`);
        }
        dat.push("updated_by = core.current_user_id()");
        const res = await client.query(
          `update core.embedded_apps set ${dat.join(", ")} where app_id = $1`,
          tham,
        );
        return res.rowCount ?? 0;
      });

      // Xem khối chú thích đầu file: 0 dòng ở đây KHÔNG có nghĩa là "không có gì đổi".
      // Nó có nghĩa là app không tồn tại, HOẶC RLS vừa lọc mất vì người gọi không phải
      // quản trị. Trả về thành công là nói dối.
      if (soDong === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không sửa được app này — app không tồn tại, hoặc tài khoản không có quyền quản trị.",
        });
      }
      xoaDem();
      return MiniAppMutationOutput.parse({ app: await docLai(ctx.runWithDb as never, appId) });
    }),

    /**
     * Công tắc bật/tắt. Đây là đường THU HỒI, nên nó tách khỏi `update`: một nút riêng,
     * một procedure riêng, một dòng nhật ký riêng. Gộp vào `update` thì thao tác nguy hiểm
     * nhất của cả màn hình lẫn vào giữa mười trường vô hại.
     */
    setEnabled: adminProcedure.input(SetMiniAppEnabledInput).mutation(async ({ ctx, input }) => {
      const soDong = await ctx.runWithDb(async (client) => {
        const res = await client.query(
          `update core.embedded_apps set enabled = $2, updated_by = core.current_user_id() where app_id = $1`,
          [input.appId, input.enabled],
        );
        return res.rowCount ?? 0;
      });
      if (soDong === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không đổi được trạng thái app — app không tồn tại, hoặc tài khoản không có quyền quản trị.",
        });
      }
      // Xoá đệm NGAY, không đợi 10 giây: đây là đường thu hồi, và lời hứa ở migration 0052
      // là "ngay lượt request kế tiếp".
      xoaDem();
      return MiniAppMutationOutput.parse({ app: await docLai(ctx.runWithDb as never, input.appId) });
    }),

    remove: adminProcedure.input(z.object({ appId: z.string() })).mutation(async ({ ctx, input }) => {
      const soDong = await ctx.runWithDb(async (client) => {
        const res = await client.query(`delete from core.embedded_apps where app_id = $1`, [input.appId]);
        return res.rowCount ?? 0;
      });
      if (soDong === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không xoá được app này — app không tồn tại, hoặc tài khoản không có quyền quản trị.",
        });
      }
      xoaDem();
      return { appId: input.appId };
    }),
  }),
});
