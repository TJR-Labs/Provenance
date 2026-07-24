import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));

import { Role } from "../../../../generated/prisma";
import { appRouter } from "~/server/api/root";

function userSession() {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: "user-1",
      role: Role.USER,
      displayName: "User",
      username: "user",
      name: "User",
    },
  };
}

describe("public project pagination input", () => {
  it("defaults to 24 and clamps discovery requests above 100", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const caller = appRouter.createCaller({
      db: { project: { findMany } } as never,
      headers: new Headers(),
      session: null,
    });

    await caller.discovery.list({});
    await caller.discovery.list({ limit: 1_000 });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ take: 25 });
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({ take: 101 });
  });

  it("applies the same clamp to projects-by-username", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const caller = appRouter.createCaller({
      db: { project: { findMany } } as never,
      headers: new Headers(),
      session: null,
    });

    await caller.project.listByUsername({
      username: "Alice",
      limit: 1_000,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
  });

  it("rejects malformed cursors in both public schemas", async () => {
    const findMany = vi.fn();
    const caller = appRouter.createCaller({
      db: { project: { findMany } } as never,
      headers: new Headers(),
      session: null,
    });

    await expect(
      caller.discovery.list({ cursor: "malformed" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.project.listByUsername({
        username: "Alice",
        cursor: "malformed",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("signed-in project pagination input", () => {
  it("defaults to 24 and clamps My Work requests above 100", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const caller = appRouter.createCaller({
      db: {
        project: { findMany },
        user: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            canvasDraftSavedAt: null,
            canvasPublishedAt: null,
          }),
        },
        canvasElement: { findMany: vi.fn() },
      } as never,
      headers: new Headers(),
      session: userSession(),
    });

    await caller.project.listMine();
    await caller.project.listMine({ limit: 1_000 });

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ take: 25 });
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({ take: 101 });
  });
});
