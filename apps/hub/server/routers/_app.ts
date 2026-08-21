import { router } from "../trpc";
import { adminRouter } from "./admin";
import { checkinRouter } from "./checkin";
import { careRouter } from "./care";
import { consentRouter } from "./consent";
import { reportRouter } from "./report";
import { sessionRouter } from "./session";
import { profileRouter } from "./profile";
import { teachingRouter } from "./teaching";
import { thiDuaRouter, lichRouter } from "./thi-dua";

export const appRouter = router({
  admin: adminRouter,
  checkin: checkinRouter,
  care: careRouter,
  consent: consentRouter,
  report: reportRouter,
  session: sessionRouter,
  profile: profileRouter,
  // Vai `teacher` (giáo viên bộ môn) — CHỈ ĐỌC, xem đầu routers/teaching.ts.
  teaching: teachingRouter,
  // Bảng xếp hạng thi đua (ADR-037) — CHỈ ĐỌC, không mutation nào.
  thiDua: thiDuaRouter,
  // Lịch hôm nay (ADR-034) — CHỈ ĐỌC.
  lich: lichRouter,
});

export type AppRouter = typeof appRouter;
