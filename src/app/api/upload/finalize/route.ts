import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "~/server/auth";
import {
  finalizeUploadIntent,
  UploadIntentError,
} from "~/server/upload-intents";
import { UploadValidationError } from "~/server/upload-validation";

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
    return NextResponse.json(
      await finalizeUploadIntent({
        userId: session.user.id,
        intentId: parsed.data.intentId,
      }),
    );
  } catch (error) {
    if (
      error instanceof UploadIntentError ||
      error instanceof UploadValidationError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Upload finalization failed", error);
    return NextResponse.json(
      { error: "Unable to finalize the upload." },
      { status: 500 },
    );
  }
}
