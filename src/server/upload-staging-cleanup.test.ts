import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
  env: {
    SUPABASE_URL: "https://example.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    NODE_ENV: "test",
  },
}));

import { cleanupUploadStaging } from "~/server/upload-staging-cleanup";

describe("cleanupUploadStaging", () => {
  it("selects only expired pending/failed intents and is idempotent", async () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const rows = [
      {
        id: "expired-pending",
        status: "PENDING",
        expiresAt: new Date(now.getTime() - 1),
        stagingBucket: "staging",
        stagingPath: "user-1/expired",
      },
      {
        id: "failed",
        status: "FAILED",
        expiresAt: new Date(now.getTime() + 60_000),
        stagingBucket: "staging",
        stagingPath: "user-1/failed",
      },
      {
        id: "pending",
        status: "PENDING",
        expiresAt: new Date(now.getTime() + 60_000),
        stagingBucket: "staging",
        stagingPath: "user-1/pending",
      },
      {
        id: "finalized",
        status: "FINALIZED",
        expiresAt: new Date(now.getTime() - 60_000),
        stagingBucket: "staging",
        stagingPath: "user-1/finalized",
      },
    ];
    const eligible = () =>
      rows.filter(
        (row) =>
          row.status === "FAILED" ||
          (row.status === "PENDING" && row.expiresAt < now),
      );
    const prisma = {
      uploadIntent: {
        findMany: vi.fn(async () => eligible()),
        updateMany: vi.fn(async ({ where }: { where: { id: string } }) => {
          const row = eligible().find((candidate) => candidate.id === where.id);
          if (!row) return { count: 0 };
          row.status = "EXPIRED";
          return { count: 1 };
        }),
      },
    };
    const remove = vi.fn(async () => ({ data: {}, error: null }));
    const getStorageClient = () =>
      ({ storage: { from: () => ({ remove }) } }) as never;
    const dependencies = {
      prisma: prisma as never,
      getStorageClient,
      now: () => now,
    };

    await expect(cleanupUploadStaging(dependencies)).resolves.toEqual({
      selected: 2,
      deleted: 2,
      expired: 2,
      failed: 0,
    });
    await expect(cleanupUploadStaging(dependencies)).resolves.toEqual({
      selected: 0,
      deleted: 0,
      expired: 0,
      failed: 0,
    });

    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalledWith(["user-1/pending"]);
    expect(remove).not.toHaveBeenCalledWith(["user-1/finalized"]);
  });
});
