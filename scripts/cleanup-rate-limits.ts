import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { cleanupSecurityAndOAuthRows }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/scheduled-cleanup"),
  ]);

  try {
    const result = await cleanupSecurityAndOAuthRows();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
  }
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) await main();
