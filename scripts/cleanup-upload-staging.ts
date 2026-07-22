import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { cleanupUploadStaging }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/upload-staging-cleanup"),
  ]);

  try {
    const result = await cleanupUploadStaging();
    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) await main();
