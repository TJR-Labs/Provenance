import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { Role } from "../../../generated/prisma";
import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";

const roleTestRouter = createTRPCRouter({
  adminOnly: adminProcedure.query(() => "allowed"),
});

function session(role: Role) {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: "user-1",
      role,
      displayName: "Test User",
      name: "Test User",
    },
  };
}

describe("adminProcedure", () => {
  it.each([Role.COMPANY, Role.ENGINEER])(
    "rejects a %s session with FORBIDDEN",
    async (role) => {
      const caller = roleTestRouter.createCaller({
        db: {} as never,
        headers: new Headers(),
        session: session(role),
      });

      await expect(caller.adminOnly()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    },
  );

  it("rejects an anonymous caller with UNAUTHORIZED", async () => {
    const caller = roleTestRouter.createCaller({
      db: {} as never,
      headers: new Headers(),
      session: null,
    });

    await expect(caller.adminOnly()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("allows an admin session", async () => {
    const caller = roleTestRouter.createCaller({
      db: {} as never,
      headers: new Headers(),
      session: session(Role.ADMIN),
    });

    await expect(caller.adminOnly()).resolves.toBe("allowed");
  });
});
