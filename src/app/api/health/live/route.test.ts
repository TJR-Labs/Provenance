import { describe, expect, it, vi } from "vitest";

const dbModuleLoaded = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => {
  dbModuleLoaded();
  return { db: {} };
});

import { GET } from "./route";

describe("GET /api/health/live", () => {
  it("returns success without loading or querying the database", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(dbModuleLoaded).not.toHaveBeenCalled();
  });
});
