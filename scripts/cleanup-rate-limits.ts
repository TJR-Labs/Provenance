import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

// Manual/operator invocations are not time-boxed like the cron route, so no
// batch cap is applied here.
const CLI_BATCH_SIZE = Number.MAX_SAFE_INTEGER;

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { runRateLimitCleanup }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/jobs/rate-limit-cleanup"),
  ]);

  try {
    const {
      rateLimitAttemptsDeleted,
      loginAttemptsDeleted,
      pendingOAuthSignupsDeleted,
      oAuthLinkIntentsDeleted,
      passwordResetTokensDeleted,
      emailVerificationTokensDeleted,
      anonymizedReportsDeleted,
    } = await runRateLimitCleanup(CLI_BATCH_SIZE);
    console.log(
      JSON.stringify(
        {
          rateLimitAttemptsDeleted,
          loginAttemptsDeleted,
          pendingOAuthSignupsDeleted,
          oAuthLinkIntentsDeleted,
          passwordResetTokensDeleted,
          emailVerificationTokensDeleted,
          anonymizedReportsDeleted,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) await main();
