import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { reconcileStorage }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/storage-reconciliation"),
  ]);

  try {
    const result = await reconcileStorage();
    console.log(JSON.stringify(result, null, 2));
    if (
      result.pendingDeletions.failed > 0 ||
      result.abandonedStaging.failed > 0
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
