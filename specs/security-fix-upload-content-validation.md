# Fix Upload Content-Type Trust — Spec

## Objective
`src/server/upload-validation.ts` validates uploads using only the
client-declared `file.type` (the MIME type reported in the multipart
request) and file size — nothing inspects the actual file bytes. Separately,
`src/server/upload.ts` derives the storage path's file extension from the
user-supplied filename (`file.name`), independent of the validated MIME
type. A request can set an arbitrary declared `Content-Type` on a multipart
upload part (trivial outside a browser, e.g. via `curl`/`fetch`), so
malicious content can be uploaded and stored under a validated-looking MIME
type while the stored path extension can disagree with it entirely.

Close this gap by verifying the real file content against the allowlist
(magic-byte/content sniffing) and by deriving the stored extension from the
validated type rather than trusting the filename. Full detail in
`SECURITY_AUDIT.md` finding #3.

## Requirements
1. Add real content-based validation: read the file's magic bytes/signature and confirm they match one of the allowed types (`image/png`, `image/jpeg`, `image/webp`, `image/gif`, `video/mp4`, `video/webm`) before allowing the upload to proceed. Use a well-established sniffing approach (a small dependency such as `file-type` is acceptable if it fits the project's dependency policy; otherwise hand-roll signature checks for these six types — they all have short, well-known magic numbers).
2. If the sniffed content type doesn't match the declared `file.type`, or doesn't match any allowed type, reject the upload the same way an unsupported type is rejected today (`UploadValidationError`, 415).
3. Derive the storage path's file extension from the **validated** type (a fixed type→extension map), not from `file.name`. Remove the current `file.name.split(".").pop()` extension-derivation logic.
4. Preserve existing size-limit behavior (`MAX_IMAGE_BYTES` / `MAX_VIDEO_BYTES`) unchanged.
5. Preserve the existing API contract of `POST /api/upload` (response shape `{ url, mimeType }`, same error status codes) so calling code (`src/app/(protected)/profile/canvas/...`, project media upload flows) doesn't need to change.

## Constraints
- Any new dependency must be small, actively maintained, and used only for magic-byte sniffing (no new runtime surface beyond that).
- Must not require buffering entire large video files into memory in a way that meaningfully changes the app's memory profile — reading the first N bytes needed for signature detection is sufficient; do not read the whole file into memory solely for this check if it isn't already being fully buffered.
- Do not change `ALLOWED_UPLOAD_TYPES`, `MAX_IMAGE_BYTES`, or `MAX_VIDEO_BYTES` values.
- Do not change the Supabase bucket/config or the `~/env` schema.

## Edge Cases
- A file declared as `image/png` (passes the current check) but whose real bytes are HTML/SVG/script content → must now be rejected.
- A genuine PNG/JPEG/WebP/GIF/MP4/WebM file → must still be accepted (no false-positive rejections of real media).
- A truncated/corrupt file too short to contain a valid signature → rejected as unsupported/invalid, with a clear error message (not a crash or 500).
- A file with a misleading filename extension (e.g. named `photo.html` but real content is a valid PNG, declared type `image/png`) → accepted, and the stored extension comes from the validated type (`.png`), not the filename.
- Empty file (0 bytes) → rejected cleanly, not a crash.

## Definition of Done
- [ ] Uploads are validated against real file content (magic bytes), not just the client-declared `Content-Type`.
- [ ] The stored object's file extension is derived from the validated type via a fixed map, never from the user-supplied filename.
- [ ] A mismatched declared-vs-actual-content upload (e.g. HTML bytes declared as `image/png`) is rejected with `UploadValidationError` / HTTP 415.
- [ ] Existing valid-upload behavior for all six allowed types still passes (extend/add tests in `src/server/upload.test.ts` and `src/server/upload-validation.ts`'s test coverage as needed).
- [ ] `src/app/api/upload/route.ts` behavior (response shape, status codes) is unchanged for the happy path.
- [ ] `SECURITY_AUDIT.md` finding #3 can be marked resolved.
