import { NextResponse } from "next/server";

import { auth } from "~/server/auth";
import { uploadFile } from "~/server/upload";
import { UploadValidationError } from "~/server/upload-validation";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Sign in to upload files." },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }

  try {
    return NextResponse.json(await uploadFile(file, session.user.id));
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Project media upload failed", error);
    return NextResponse.json(
      { error: "Unable to upload the file." },
      { status: 500 },
    );
  }
}
