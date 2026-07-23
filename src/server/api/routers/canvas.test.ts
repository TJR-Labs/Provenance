import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setLayoutMode = vi.hoisted(() => vi.fn());

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/canvas", async (importOriginal) => ({
  ...(await importOriginal()),
  setLayoutMode,
}));

import { Role } from "../../../../generated/prisma";
import { canvasRouter } from "~/server/api/routers/canvas";
import {
  RATE_LIMIT_ATOMIC_UPDATE,
  type RateLimitConfig,
  type RateLimitDelegate,
} from "~/server/rate-limit";

function fakeRateLimits() {
  let count = 0;
  const atomicUpdate = vi.fn(
    async (config: Omit<RateLimitConfig, "message">) => {
      count += 1;
      const lockedUntil =
        count >= config.limit ? new Date(Date.now() + config.lockoutMs) : null;
      return {
        allowed: lockedUntil === null && count < config.limit,
        count,
        lockedUntil,
      };
    },
  );
  const delegate = {
    [RATE_LIMIT_ATOMIC_UPDATE]: atomicUpdate,
    findUnique: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  } as unknown as RateLimitDelegate;
  return { atomicUpdate, delegate };
}

function session(userId: string) {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: userId,
      role: Role.USER,
      displayName: "Canvas Owner",
      username: "canvas-owner",
      name: "Canvas Owner",
    },
  };
}

beforeEach(() => {
  setLayoutMode.mockReset();
  setLayoutMode.mockResolvedValue({ layoutMode: "GRID" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("canvas mutation rate limiting", () => {
  it("rejects the 61st call within the per-user procedure window", async () => {
    vi.useFakeTimers();
    const rateLimits = fakeRateLimits();
    const caller = canvasRouter.createCaller({
      db: { rateLimitAttempt: rateLimits.delegate } as never,
      headers: new Headers(),
      session: session("user-1"),
    });

    for (let i = 0; i < 59; i += 1) {
      const call = expect(caller.setMode({ mode: "GRID" })).resolves.toEqual({
        layoutMode: "GRID",
      });
      await vi.runAllTimersAsync();
      await call;
    }

    const thresholdCall = expect(
      caller.setMode({ mode: "GRID" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await vi.runAllTimersAsync();
    await thresholdCall;

    const rejectedCall = expect(
      caller.setMode({ mode: "GRID" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await vi.runAllTimersAsync();
    await rejectedCall;
    expect(setLayoutMode).toHaveBeenCalledTimes(59);
    expect(rateLimits.atomicUpdate).toHaveBeenLastCalledWith(
      {
        scope: "canvas.setMode",
        key: "user-1",
        limit: 60,
        windowMs: 60_000,
        lockoutMs: 60_000,
      },
      "consume",
    );
  });
});
