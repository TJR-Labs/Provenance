import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "~/server/cron-auth";
import {
  runUploadCleanup,
  UPLOAD_CLEANUP_BATCH_SIZE,
} from "~/server/jobs/upload-cleanup";
import { logServerError } from "~/server/observability";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runUploadCleanup(UPLOAD_CLEANUP_BATCH_SIZE);
    console.log(
      JSON.stringify({
        event: "cron_job_completed",
        route: "/api/cron/cleanup-uploads",
        processed: result.deleted,
        remaining: result.remaining,
        failed: result.failed,
      }),
    );
    if (result.failed > 0) {
      logServerError({
        request,
        route: "/api/cron/cleanup-uploads",
        category: "upload",
        error: new Error(`${result.failed} row(s) failed to delete`),
      });
      return NextResponse.json(
        { processed: result.deleted, remaining: result.remaining },
        { status: 502 },
      );
    }
    return NextResponse.json({
      processed: result.deleted,
      remaining: result.remaining,
    });
  } catch (error) {
    logServerError({
      request,
      route: "/api/cron/cleanup-uploads",
      category: "upload",
      error,
    });
    return NextResponse.json(
      { error: "Upload cleanup failed." },
      { status: 500 },
    );
  }
}
