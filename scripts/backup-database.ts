import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { createGzip } from "node:zlib";

import { loadEnvConfig } from "@next/env";

const BACKUP_FILE_PREFIX = "provenance-database";

type RedactedConnection = {
  host: string;
  database: string;
};

type BackupResult = {
  status: "created";
  backupFile: string;
  compressedBytes: number;
  connection: RedactedConnection;
  format: "plain SQL compressed with gzip";
  requiresEncryptionBeforeOffsiteCopy: true;
  operatorInstructions: string[];
};

class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

export function redactConnectionString(
  connectionString: string,
): RedactedConnection {
  let parsed: URL;

  try {
    parsed = new URL(connectionString);
  } catch {
    throw new BackupError(
      "DIRECT_URL must be a valid PostgreSQL connection string.",
    );
  }

  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !parsed.hostname
  ) {
    throw new BackupError(
      "DIRECT_URL must be a valid PostgreSQL connection string.",
    );
  }

  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    throw new BackupError(
      "DIRECT_URL must contain a valid encoded database name.",
    );
  }

  if (!database) {
    throw new BackupError("DIRECT_URL must include a database name.");
  }

  return {
    host: parsed.hostname,
    database,
  };
}

export function buildBackupOutputPath(
  configuredOutputDirectory: string | undefined,
  timestamp: Date,
  workingDirectory = process.cwd(),
) {
  const outputDirectory =
    configuredOutputDirectory?.trim() !== ""
      ? configuredOutputDirectory
      : undefined;
  const resolvedOutputDirectory = outputDirectory
    ? isAbsolute(outputDirectory)
      ? outputDirectory
      : resolve(workingDirectory, outputDirectory)
    : resolve(workingDirectory, "backups");
  const safeTimestamp = timestamp.toISOString().replace(/[:.]/g, "-");

  return join(
    resolvedOutputDirectory,
    `${BACKUP_FILE_PREFIX}-${safeTimestamp}.sql.gz`,
  );
}

function waitForPgDump(
  child: ChildProcessWithoutNullStreams,
  connection: RedactedConnection,
) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    child.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        rejectPromise(
          new BackupError(
            "pg_dump was not found on PATH. Install the PostgreSQL client tools (which include pg_dump) from PostgreSQL.org or your operating system package manager, then ensure pg_dump is available on PATH.",
          ),
        );
        return;
      }

      rejectPromise(
        new BackupError(
          `Could not start pg_dump for host=${connection.host} database=${connection.database}. No backup was created.`,
        ),
      );
    });

    child.once("close", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const outcome =
        code === null ? `signal ${signal ?? "unknown"}` : `exit code ${code}`;
      rejectPromise(
        new BackupError(
          `pg_dump failed for host=${connection.host} database=${connection.database} (${outcome}). No complete backup was created. Check database connectivity, credentials, and PostgreSQL client/server compatibility.`,
        ),
      );
    });
  });
}

function getOperatorInstructions(backupFile: string) {
  return [
    `Encrypt ${backupFile} before long-term storage, for example with age passphrase encryption or 7-Zip AES-256 and a strong password.`,
    "Copy only the encrypted backup to private off-site storage that is independent of this project's Supabase account. Do not use this project's own Supabase Storage bucket, which would create a single point of failure.",
    "Verify the backup with a restore into a non-production project, and verify a current backup before every destructive migration or bulk cleanup job.",
  ];
}

async function backupDatabase(
  directUrl: string,
  configuredOutputDirectory: string | undefined,
  timestamp = new Date(),
): Promise<BackupResult> {
  const connection = redactConnectionString(directUrl);
  const backupFile = buildBackupOutputPath(
    configuredOutputDirectory,
    timestamp,
  );
  const partialBackupFile = `${backupFile}.partial`;

  try {
    await mkdir(dirname(backupFile), { recursive: true });
  } catch {
    throw new BackupError(
      `Could not create backup output directory: ${dirname(backupFile)}`,
    );
  }

  // A full logical dump includes ProjectMedia.storageBucket/storagePath,
  // ImageResource.storageBucket/storagePath, and UploadIntent's staging and
  // result bucket/path fields. Restored rows therefore retain the metadata
  // needed to reconnect separately restored Supabase Storage objects.
  const pgDump = spawn(
    "pg_dump",
    ["--format=plain", "--no-owner", "--no-privileges", "--no-password"],
    {
      env: {
        ...process.env,
        // Supplying DIRECT_URL through libpq's environment keeps credentials
        // out of the command line and ensures the pooled DATABASE_URL is unused.
        PGDATABASE: directUrl,
      },
      windowsHide: true,
    },
  );
  pgDump.stdin.end();
  // Consume diagnostics so the child cannot block, but never echo provider
  // output because it can contain connection details beyond host/database.
  pgDump.stderr.resume();

  try {
    const compression = pipeline(
      pgDump.stdout,
      createGzip(),
      createWriteStream(partialBackupFile, { flags: "wx" }),
    ).catch((error: unknown) => {
      pgDump.kill();
      throw error;
    });
    const outcomes = await Promise.allSettled([
      compression,
      waitForPgDump(pgDump, connection),
    ]);
    const dumpOutcome = outcomes[1];
    const compressionOutcome = outcomes[0];

    if (dumpOutcome?.status === "rejected") {
      throw dumpOutcome.reason;
    }
    if (compressionOutcome?.status === "rejected") {
      throw new BackupError(
        `Could not write the gzip backup to ${backupFile}. No complete backup was created.`,
      );
    }

    await rename(partialBackupFile, backupFile);
  } catch (error) {
    await rm(partialBackupFile, { force: true }).catch(() => undefined);
    if (error instanceof BackupError) throw error;
    throw new BackupError(
      `Database backup failed for host=${connection.host} database=${connection.database}. No complete backup was created.`,
    );
  }

  return {
    status: "created",
    backupFile,
    compressedBytes: (await stat(backupFile)).size,
    connection,
    format: "plain SQL compressed with gzip",
    requiresEncryptionBeforeOffsiteCopy: true,
    operatorInstructions: getOperatorInstructions(backupFile),
  };
}

async function main() {
  try {
    loadEnvConfig(process.cwd());
    const directUrl = process.env.DIRECT_URL;
    if (!directUrl) {
      throw new BackupError(
        "DIRECT_URL is required. The pooled DATABASE_URL is intentionally not used for backups.",
      );
    }

    const result = await backupDatabase(
      directUrl,
      process.env.BACKUP_OUTPUT_DIR,
    );
    console.log(JSON.stringify(result, null, 2));
    console.log("\nRequired operator follow-up:");
    for (const instruction of result.operatorInstructions) {
      console.log(`- ${instruction}`);
    }
  } catch (error) {
    console.error(
      error instanceof BackupError
        ? error.message
        : "Database backup failed unexpectedly. No complete backup was created.",
    );
    process.exitCode = 1;
  }
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectInvocation) await main();
