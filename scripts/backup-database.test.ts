import { basename, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildBackupOutputPath,
  redactConnectionString,
} from "./backup-database";

describe("backup-database helpers", () => {
  it("redacts credentials and connection options to host and database only", () => {
    const connection = redactConnectionString(
      "postgresql://backup-user:super-secret@db.example.test:5432/provenance%20prod?sslmode=require",
    );

    expect(connection).toEqual({
      host: "db.example.test",
      database: "provenance prod",
    });
    expect(JSON.stringify(connection)).not.toContain("backup-user");
    expect(JSON.stringify(connection)).not.toContain("super-secret");
    expect(JSON.stringify(connection)).not.toContain("sslmode");
  });

  it("uses the default backup directory and a filesystem-safe timestamp", () => {
    const workingDirectory = resolve("workspace");
    const outputPath = buildBackupOutputPath(
      undefined,
      new Date("2026-07-22T19:20:21.123Z"),
      workingDirectory,
    );

    expect(outputPath).toBe(
      resolve(
        workingDirectory,
        "backups",
        "provenance-database-2026-07-22T19-20-21-123Z.sql.gz",
      ),
    );
  });

  it("resolves a relative BACKUP_OUTPUT_DIR override", () => {
    const workingDirectory = resolve("workspace");
    const outputPath = buildBackupOutputPath(
      "private-backups",
      new Date("2026-07-22T19:20:21.123Z"),
      workingDirectory,
    );

    expect(outputPath).toBe(
      resolve(
        workingDirectory,
        "private-backups",
        "provenance-database-2026-07-22T19-20-21-123Z.sql.gz",
      ),
    );
    expect(basename(outputPath)).not.toContain(":");
  });
});
