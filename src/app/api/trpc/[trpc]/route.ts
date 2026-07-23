import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { type ErrorCategory, logServerError } from "~/server/observability";

function errorCategory(code: string): ErrorCategory {
  switch (code) {
    case "BAD_REQUEST":
    case "PARSE_ERROR":
    case "UNPROCESSABLE_CONTENT":
      return "validation";
    case "UNAUTHORIZED":
      return "authentication";
    case "FORBIDDEN":
      return "authorization";
    case "NOT_FOUND":
      return "not_found";
    case "TOO_MANY_REQUESTS":
      return "rate_limit";
    default:
      return "unknown";
  }
}

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError: ({ path, error }) => {
      logServerError({
        request: req,
        route: `/api/trpc/${path ?? "unknown"}`,
        category: errorCategory(error.code),
        error: error.cause ?? error,
      });
    },
  });

export { handler as GET, handler as POST };
