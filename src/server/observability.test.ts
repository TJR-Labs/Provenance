import { afterEach, describe, expect, it, vi } from "vitest";

import { getCorrelationId, logServerError } from "./observability";

function request(headers: HeadersInit = {}) {
  return new Request("http://localhost/api/test", { headers });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("observability", () => {
  it("prefers a valid incoming correlation id and accepts request ids", () => {
    expect(
      getCorrelationId(
        request({
          "x-correlation-id": "correlation-123",
          "x-request-id": "request-123",
        }),
      ),
    ).toBe("correlation-123");
    expect(getCorrelationId(request({ "x-request-id": "request-123" }))).toBe(
      "request-123",
    );
  });

  it("generates an id instead of trusting an unsafe incoming value", () => {
    expect(
      getCorrelationId(request({ "x-correlation-id": "unsafe value" })),
    ).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("logs deployment metadata without arbitrary error details", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "release-abc");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("password=do-not-log"), {
      code: "P1001",
    });

    logServerError({
      request: request({ "x-request-id": "request-123" }),
      route: "/api/test",
      category: "database",
      error,
    });

    const line = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({
      event: "server_error",
      correlationId: "request-123",
      route: "/api/test",
      deploymentEnvironment: "preview",
      releaseIdentifier: "release-abc",
      errorCategory: "database",
      errorType: "Error",
      errorCode: "P1001",
    });
    expect(line).not.toContain("do-not-log");
  });
});
