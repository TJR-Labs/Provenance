import { timingSafeEqual } from "node:crypto";

import { env } from "~/env";

// Vercel's documented cron-auth convention: the platform sends
// `Authorization: Bearer <CRON_SECRET>` on scheduled invocations.
export function isAuthorizedCronRequest(request: Pick<Request, "headers">) {
  const secret = env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headerBuffer = Buffer.from(header);
  const expectedBuffer = Buffer.from(expected);
  if (headerBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(headerBuffer, expectedBuffer);
}
