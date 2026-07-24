import { TRPCError } from "@trpc/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { consumeRateLimit } from "~/server/rate-limit";
import {
  finalizeUploadIntent,
  UploadIntentError,
} from "~/server/upload-intents";
import { logServerError } from "~/server/observability";
import { UploadValidationError } from "~/server/upload-validation";

const UPLOAD_FINALIZE_RATE_LIMIT_SCOPE = "upload.finalize";
const UPLOAD_RATE_LIMIT_THRESHOLD = 60;
const UPLOAD_RATE_LIMIT_WINDOW_MS = 60_000;

const requestSchema = z.object({ intentId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Sign in to upload files." },
      { status: 401 },
    );
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid upload intent is required." },
      { status: 400 },
    );
  }

  try {
    await consumeRateLimit(
      {
        scope: UPLOAD_FINALIZE_RATE_LIMIT_SCOPE,
        key: session.user.id,
        limit: UPLOAD_RATE_LIMIT_THRESHOLD,
        windowMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
        lockoutMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
      },
      db.rateLimitAttempt,
    );
    return NextResponse.json(
      await finalizeUploadIntent({
        userId: session.user.id,
        intentId: parsed.data.intentId,
      }),
    );
  } catch (error) {
    if (error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS") {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (
      error instanceof UploadIntentError ||
      error instanceof UploadValidationError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    logServerError({
      request,
      route: "/api/upload/finalize",
      category: "upload",
      error,
    });
    return NextResponse.json(
      { error: "Unable to finalize the upload." },
      { status: 500 },
    );
  }
}
