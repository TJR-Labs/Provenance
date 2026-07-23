import { randomUUID } from "node:crypto";

export type ErrorCategory =
  | "authentication"
  | "authorization"
  | "database"
  | "not_found"
  | "rate_limit"
  | "upload"
  | "validation"
  | "unknown";

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_ERROR_CODE = /^[A-Za-z0-9_-]{1,64}$/;

function safeEnvironmentValue(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 128) : fallback;
}

export function getCorrelationId(request: Pick<Request, "headers">) {
  const incomingId =
    request.headers.get("x-correlation-id") ??
    request.headers.get("x-request-id");

  return incomingId && SAFE_CORRELATION_ID.test(incomingId)
    ? incomingId
    : randomUUID();
}

function getSafeErrorMetadata(error: unknown) {
  if (!(error instanceof Error)) {
    return { errorType: "NonErrorThrown" };
  }

  const errorCode: unknown = (error as { code?: unknown }).code;
  return {
    errorType: SAFE_ERROR_CODE.test(error.name) ? error.name : "Error",
    ...(typeof errorCode === "string" && SAFE_ERROR_CODE.test(errorCode)
      ? { errorCode }
      : {}),
  };
}

export function logServerError({
  request,
  route,
  category,
  error,
}: {
  request: Pick<Request, "headers">;
  route: string;
  category: ErrorCategory;
  error: unknown;
}) {
  const entry = {
    timestamp: new Date().toISOString(),
    severity: "error",
    event: "server_error",
    correlationId: getCorrelationId(request),
    route,
    deploymentEnvironment: safeEnvironmentValue(
      process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      "unknown",
    ),
    releaseIdentifier: safeEnvironmentValue(
      process.env.VERCEL_GIT_COMMIT_SHA,
      "local",
    ),
    errorCategory: category,
    ...getSafeErrorMetadata(error),
  };

  // Intentionally omit messages, stacks, headers, bodies, and request/user data:
  // provider errors can contain credentials, connection strings, or hostnames.
  console.error(JSON.stringify(entry));
}
