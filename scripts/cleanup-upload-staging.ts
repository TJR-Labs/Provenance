import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

// Manual/operator invocations are not time-boxed like the cron route, so no
// batch cap is applied here.
const CLI_BATCH_SIZE = Number.MAX_SAFE_INTEGER;

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { runUploadCleanup }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/jobs/upload-cleanup"),
  ]);

  try {
    const { selected, deleted, expired, failed } =
      await runUploadCleanup(CLI_BATCH_SIZE);
    console.log(JSON.stringify({ selected, deleted, expired, failed }, null, 2));
    if (failed > 0) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) await main();
