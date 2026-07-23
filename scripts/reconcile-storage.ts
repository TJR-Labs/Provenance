import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

// Manual/operator invocations are not time-boxed like the cron route, so no
// batch cap is applied here.
const CLI_BATCH_SIZE = Number.MAX_SAFE_INTEGER;

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { runStorageReconciliation }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/jobs/storage-reconciliation-job"),
  ]);

  try {
    const { pendingDeletions, abandonedStaging } =
      await runStorageReconciliation(CLI_BATCH_SIZE);
    console.log(
      JSON.stringify({ pendingDeletions, abandonedStaging }, null, 2),
    );
    if (
      pendingDeletions.failed > 0 ||
      abandonedStaging.failed > 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) await main();
