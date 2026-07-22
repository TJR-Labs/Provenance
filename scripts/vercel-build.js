import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCTION_ENV = "production";
const DATABASE_ENV_NAMES = ["DATABASE_URL", "DIRECT_URL"];
const require = createRequire(import.meta.url);
const PRISMA_CLI = require.resolve("prisma/build/index.js");
const NEXT_CLI = require.resolve("next/dist/bin/next");

/**
 * @param {string | undefined} vercelEnv
 * @returns {boolean}
 */
export function shouldRunMigrations(vercelEnv) {
  return vercelEnv === PRODUCTION_ENV;
}

/**
 * @param {string | undefined} vercelEnv
 * @returns {string}
 */
export function migrationSkipMessage(vercelEnv) {
  if (vercelEnv === undefined || vercelEnv === "") {
    return `[vercel-build] Migrations blocked: VERCEL_ENV is unset; only VERCEL_ENV=${PRODUCTION_ENV} runs prisma migrate deploy.`;
  }

  if (vercelEnv === "preview" || vercelEnv === "development") {
    return `[vercel-build] Migrations skipped: VERCEL_ENV=${vercelEnv}; only VERCEL_ENV=${PRODUCTION_ENV} runs prisma migrate deploy.`;
  }

  return `[vercel-build] Migrations blocked: unexpected VERCEL_ENV=${JSON.stringify(vercelEnv)}; only VERCEL_ENV=${PRODUCTION_ENV} runs prisma migrate deploy.`;
}

/**
 * @param {string} cliPath
 * @param {string[]} args
 * @param {string} label
 * @returns {number}
 */
function runCommand(cliPath, args, label) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(
      `[vercel-build] Failed to start ${label}: ${result.error.message}`,
    );
    return 1;
  }

  if (result.status !== 0) {
    console.error(
      `[vercel-build] ${label} failed${result.status === null ? "" : ` with exit code ${result.status}`}; aborting build.`,
    );
    return result.status ?? 1;
  }

  return 0;
}

function runVercelBuild() {
  const vercelEnv = process.env.VERCEL_ENV;

  if (shouldRunMigrations(vercelEnv)) {
    const missingDatabaseUrls = DATABASE_ENV_NAMES.filter(
      (name) => !process.env[name]?.trim(),
    );
    if (missingDatabaseUrls.length > 0) {
      console.error(
        `[vercel-build] Production migrations blocked: missing ${missingDatabaseUrls.join(", ")}.`,
      );
      return 1;
    }

    console.log(
      `[vercel-build] VERCEL_ENV=${PRODUCTION_ENV}; running prisma migrate deploy.`,
    );
    const migrationStatus = runCommand(
      PRISMA_CLI,
      ["migrate", "deploy"],
      "prisma migrate deploy",
    );
    if (migrationStatus !== 0) {
      return migrationStatus;
    }
  } else {
    console.log(migrationSkipMessage(vercelEnv));
  }

  return runCommand(NEXT_CLI, ["build"], "next build");
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  process.exitCode = runVercelBuild();
}
