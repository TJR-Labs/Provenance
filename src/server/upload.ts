import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { env } from "~/env";
import {
  EXTENSION_BY_MIME_TYPE,
  validateUpload,
} from "~/server/upload-validation";

export function createStorageClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase Storage is not configured.");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type StorageClientFactory = () => ReturnType<typeof createStorageClient>;

export async function uploadFile(
  file: File,
  userId: string,
  getClient: StorageClientFactory = createStorageClient,
) {
  await validateUpload(file);
  // Extension comes from the validated content type, never from the
  // user-supplied filename, so declared/stored metadata can't disagree.
  const extension = EXTENSION_BY_MIME_TYPE[file.type];
  const path = `${userId}/${randomUUID()}${extension ? `.${extension}` : ""}`;
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const storage = getClient().storage.from(bucket);
  const { error } = await storage.upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  return {
    url: storage.getPublicUrl(path).data.publicUrl,
    mimeType: file.type,
  };
}
