// apps/hub/server/routers/session.ts — thông tin phiên + lưới mini app trang chủ.
// Danh sách tile nằm ở ../mini-apps.ts (dùng chung với server component trang chủ, để lưới
// có sẵn trong HTML lần đầu thay vì đợi query xong mới hiện).
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { buildMiniAppsWithEmbedded } from "../mini-apps";

export const sessionRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.authUid) return null;
    return { displayName: ctx.displayName, roles: ctx.roles };
  }),

  miniApps: protectedProcedure.query(({ ctx }) => buildMiniAppsWithEmbedded(ctx.roles)),
});
