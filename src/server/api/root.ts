import { discoveryRouter } from "~/server/api/routers/discovery";
import { devlogRouter } from "~/server/api/routers/devlog";
import { gridRouter } from "~/server/api/routers/grid";
import { moderationRouter } from "~/server/api/routers/moderation";
import { profileRouter } from "~/server/api/routers/profile";
import { projectRouter } from "~/server/api/routers/project";
import { siteRouter } from "~/server/api/routers/site";
import { usersRouter } from "~/server/api/routers/users";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  discovery: discoveryRouter,
  devlog: devlogRouter,
  grid: gridRouter,
  moderation: moderationRouter,
  profile: profileRouter,
  project: projectRouter,
  site: siteRouter,
  users: usersRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const response = await fetch("/api/health/ready");
 * const result = await response.json();
 *       ^? { status: "ok" } | { status: "unavailable" }
 */
export const createCaller = createCallerFactory(appRouter);
