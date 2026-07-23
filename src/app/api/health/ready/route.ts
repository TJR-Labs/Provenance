import { NextResponse } from "next/server";

import { db } from "~/server/db";
import { logServerError } from "~/server/observability";

const DATABASE_TIMEOUT_MS = 3_000;

async function checkDatabase() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("Database readiness check timed out.");
      error.name = "DatabaseReadinessTimeoutError";
      reject(error);
    }, DATABASE_TIMEOUT_MS);
  });

  try {
    await Promise.race([db.$queryRaw`SELECT 1`, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function GET(request: Request) {
  try {
    await checkDatabase();
    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError({
      request,
      route: "/api/health/ready",
      category: "database",
      error,
    });
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
