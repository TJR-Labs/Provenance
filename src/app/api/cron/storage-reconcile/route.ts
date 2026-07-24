import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "~/server/cron-auth";
import {
  runStorageReconciliation,
  STORAGE_RECONCILIATION_BATCH_SIZE,
} from "~/server/jobs/storage-reconciliation-job";
import { logServerError } from "~/server/observability";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runStorageReconciliation(
      STORAGE_RECONCILIATION_BATCH_SIZE,
    );
    const processed =
      result.pendingDeletions.deleted + result.abandonedStaging.deleted;
    const failed =
      result.pendingDeletions.failed + result.abandonedStaging.failed;
    console.log(
      JSON.stringify({
        event: "cron_job_completed",
        route: "/api/cron/storage-reconcile",
        processed,
        remaining: result.remaining,
        failed,
      }),
    );
    if (failed > 0) {
      logServerError({
        request,
        route: "/api/cron/storage-reconcile",
        category: "upload",
        error: new Error(`${failed} row(s) failed to reconcile`),
      });
      return NextResponse.json(
        { processed, remaining: result.remaining },
        { status: 502 },
      );
    }
    return NextResponse.json({ processed, remaining: result.remaining });
  } catch (error) {
    logServerError({
      request,
      route: "/api/cron/storage-reconcile",
      category: "upload",
      error,
    });
    return NextResponse.json(
      { error: "Storage reconciliation failed." },
      { status: 500 },
    );
  }
}
