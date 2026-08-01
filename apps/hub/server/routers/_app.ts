import { router } from "../trpc";
import { checkinRouter } from "./checkin";
import { careRouter } from "./care";
import { consentRouter } from "./consent";
import { reportRouter } from "./report";
import { sessionRouter } from "./session";
import { profileRouter } from "./profile";

export const appRouter = router({
  checkin: checkinRouter,
  care: careRouter,
  consent: consentRouter,
  report: reportRouter,
  session: sessionRouter,
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
