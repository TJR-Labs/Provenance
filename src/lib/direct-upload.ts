export type UploadPurpose = "project-media" | "canvas-resource" | "avatar";

type UploadResult = {
  url: string;
  mimeType: string;
  resource?: { id: string };
};

async function responseJson<T>(response: Response) {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

export async function uploadFileDirect(
  file: File,
  purpose: UploadPurpose,
): Promise<UploadResult> {
  const intentResponse = await fetch("/api/upload/intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      purpose,
      mimeType: file.type,
      byteSize: file.size,
    }),
  });
  const intent = await responseJson<{
    intentId?: string;
    uploadUrl?: string;
    purpose?: UploadPurpose;
  }>(intentResponse);
  if (!intentResponse.ok || !intent.intentId || !intent.uploadUrl) {
    throw new Error(intent.error ?? "Unable to prepare the upload.");
  }

  const uploadResponse = await fetch(intent.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "content-type": file.type },
  });
  if (!uploadResponse.ok) {
    throw new Error("Unable to upload the file to Storage.");
  }

  const finalizeResponse = await fetch("/api/upload/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intentId: intent.intentId }),
  });
  const result = await responseJson<Partial<UploadResult>>(finalizeResponse);
  if (!finalizeResponse.ok || !result.url || !result.mimeType) {
    throw new Error(result.error ?? "Unable to finalize the upload.");
  }

  return result as UploadResult;
}
