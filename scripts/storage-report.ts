import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { getStorageReport }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/storage-reconciliation"),
  ]);

  try {
    // This deliberately prints aggregate counts only. Environment values and
    // per-object errors (which may contain provider details) are never emitted.
    console.log(JSON.stringify(await getStorageReport(), null, 2));
  } finally {
    await db.$disconnect();
  }
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) await main();
