import "server-only";

import { headers } from "next/headers";

import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

export async function getServerCaller() {
  return appRouter.createCaller(
    await createTRPCContext({ headers: new Headers(await headers()) }),
  );
}
