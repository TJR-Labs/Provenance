import { createHash } from "node:crypto";

import { z } from "zod";

export const emailSchema = z.string().trim().email().max(320);

export class DuplicateEmailError extends Error {
  constructor() {
    super("That email address is already in use.");
    this.name = "DuplicateEmailError";
  }
}

export function normalizeAccountEmail(rawEmail: string) {
  return emailSchema.parse(rawEmail).toLowerCase();
}

export function accountEmailRateLimitKey(rawEmail: string) {
  return createHash("sha256")
    .update(normalizeAccountEmail(rawEmail))
    .digest("hex");
}
