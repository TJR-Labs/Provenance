import { canvasRouter } from "~/server/api/routers/canvas";
import { discoveryRouter } from "~/server/api/routers/discovery";
import { healthRouter } from "~/server/api/routers/health";
import { moderationRouter } from "~/server/api/routers/moderation";
import { profileRouter } from "~/server/api/routers/profile";
import { projectRouter } from "~/server/api/routers/project";
import { usersRouter } from "~/server/api/routers/users";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  canvas: canvasRouter,
  discovery: discoveryRouter,
  health: healthRouter,
  moderation: moderationRouter,
  profile: profileRouter,
  project: projectRouter,
  users: usersRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.health.check();
 *       ^? { status: "ok" }
 */
export const createCaller = createCallerFactory(appRouter);
