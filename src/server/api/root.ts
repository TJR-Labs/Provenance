import { briefRouter } from "~/server/api/routers/brief";
import { healthRouter } from "~/server/api/routers/health";
import { usersRouter } from "~/server/api/routers/users";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  brief: briefRouter,
  health: healthRouter,
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
