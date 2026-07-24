import { TRPCError } from "@trpc/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { consumeRateLimit } from "~/server/rate-limit";
import {
  createUploadIntent,
  UploadIntentError,
  UPLOAD_PURPOSES,
} from "~/server/upload-intents";
import { logServerError } from "~/server/observability";

const UPLOAD_INTENT_RATE_LIMIT_SCOPE = "upload.intent";
const UPLOAD_RATE_LIMIT_THRESHOLD = 60;
const UPLOAD_RATE_LIMIT_WINDOW_MS = 60_000;

const requestSchema = z.object({
  purpose: z.enum(UPLOAD_PURPOSES),
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
});

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
      { error: "Enter a valid upload purpose, MIME type, and byte size." },
      { status: 400 },
    );
  }

  try {
    await consumeRateLimit(
      {
        scope: UPLOAD_INTENT_RATE_LIMIT_SCOPE,
        key: session.user.id,
        limit: UPLOAD_RATE_LIMIT_THRESHOLD,
        windowMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
        lockoutMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
      },
      db.rateLimitAttempt,
    );
    return NextResponse.json(
      await createUploadIntent({ userId: session.user.id, ...parsed.data }),
    );
  } catch (error) {
    if (error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS") {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof UploadIntentError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    logServerError({
      request,
      route: "/api/upload/intent",
      category: "upload",
      error,
    });
    return NextResponse.json(
      { error: "Unable to prepare the upload." },
      { status: 500 },
    );
  }
}
