import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "~/server/cron-auth";
import {
  RATE_LIMIT_CLEANUP_BATCH_SIZE,
  runRateLimitCleanup,
} from "~/server/jobs/rate-limit-cleanup";
import { logServerError } from "~/server/observability";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runRateLimitCleanup(RATE_LIMIT_CLEANUP_BATCH_SIZE);
    const processed =
      result.rateLimitAttemptsDeleted +
      result.loginAttemptsDeleted +
      result.pendingOAuthSignupsDeleted +
      result.oAuthLinkIntentsDeleted +
      result.passwordResetTokensDeleted +
      result.emailVerificationTokensDeleted +
      result.anonymizedReportsDeleted;
    console.log(
      JSON.stringify({
        event: "cron_job_completed",
        route: "/api/cron/cleanup-rate-limits",
        processed,
        remaining: result.remaining,
      }),
    );
    return NextResponse.json({ processed, remaining: result.remaining });
  } catch (error) {
    logServerError({
      request,
      route: "/api/cron/cleanup-rate-limits",
      category: "database",
      error,
    });
    return NextResponse.json(
      { error: "Rate-limit cleanup failed." },
      { status: 500 },
    );
  }
}
