import { describe, expect, it } from "vitest";

import { migrationSkipMessage, shouldRunMigrations } from "./vercel-build.js";

describe("Vercel migration gating", () => {
  it("runs migrations only for the exact production environment", () => {
    expect(shouldRunMigrations("production")).toBe(true);
  });

  it.each([
    ["preview", "VERCEL_ENV=preview"],
    ["development", "VERCEL_ENV=development"],
    [undefined, "VERCEL_ENV is unset"],
    ["Production", 'unexpected VERCEL_ENV="Production"'],
    ["staging", 'unexpected VERCEL_ENV="staging"'],
  ])("skips migrations for %s", (vercelEnv, expectedReason) => {
    expect(shouldRunMigrations(vercelEnv)).toBe(false);
    expect(migrationSkipMessage(vercelEnv)).toContain(expectedReason);
  });
});
