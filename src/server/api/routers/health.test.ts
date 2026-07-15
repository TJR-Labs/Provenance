import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { appRouter } from "~/server/api/root";

describe("health router", () => {
  it("returns an ok status", async () => {
    const caller = appRouter.createCaller({
      db: {} as never,
      headers: new Headers(),
      session: null,
    });

    await expect(caller.health.check()).resolves.toEqual({ status: "ok" });
  });
});
