import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({ db: { $queryRaw: queryRaw } }));

import { GET } from "./route";

function request() {
  return new Request("http://localhost/api/health/ready", {
    headers: { "x-request-id": "request-123" },
  });
}

beforeEach(() => {
  queryRaw.mockReset();
  queryRaw.mockResolvedValue([{ "?column?": 1 }]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/health/ready", () => {
  it("returns success when the database query succeeds", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it("returns a generic 503 and logs safe metadata when the query fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    queryRaw.mockRejectedValue(
      new Error("postgres://user:secret@private-db.internal/database"),
    );

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    expect(log).toHaveBeenCalledOnce();
    const line = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({
      event: "server_error",
      correlationId: "request-123",
      route: "/api/health/ready",
      errorCategory: "database",
      errorType: "Error",
    });
    expect(line).not.toContain("secret");
    expect(line).not.toContain("private-db.internal");
  });

  it("returns a generic 503 when the database query times out", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    queryRaw.mockReturnValue(new Promise(() => undefined));

    const responsePromise = GET(request());
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });
});
