import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "~/server/auth";
import {
  createUploadIntent,
  UploadIntentError,
  UPLOAD_PURPOSES,
} from "~/server/upload-intents";
import { logServerError } from "~/server/observability";

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
    return NextResponse.json(
      await createUploadIntent({ userId: session.user.id, ...parsed.data }),
    );
  } catch (error) {
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
