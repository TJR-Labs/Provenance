import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import {
  countDevlogEntriesSince,
  createDevlogEntry,
  listDevlogEntries,
} from "./devlog";

describe("createDevlogEntry", () => {
  it("validates, trims, and creates an entry for the user", async () => {
    const entry = {
      id: "entry-1",
      userId: "user-1",
      label: "Shipped",
      body: "Released the first version.",
      createdAt: new Date("2026-07-27T12:00:00.000Z"),
    };
    const create = vi.fn().mockResolvedValue(entry);
    const database = { devlogEntry: { create } } as never;

    const result = await createDevlogEntry(
      "user-1",
      {
        label: "  Shipped  ",
        body: "  Released the first version.  ",
      },
      database,
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        label: "Shipped",
        body: "Released the first version.",
      },
    });
    expect(result).toBe(entry);
  });
});

describe("listDevlogEntries", () => {
  it("lists the user's newest entries with the default limit", async () => {
    const entries = [
      {
        id: "entry-2",
        userId: "user-1",
        label: "Building",
        body: "Added the devlog.",
        createdAt: new Date("2026-07-27T13:00:00.000Z"),
      },
    ];
    const findMany = vi.fn().mockResolvedValue(entries);
    const database = { devlogEntry: { findMany } } as never;

    const result = await listDevlogEntries("user-1", database);

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    expect(result).toBe(entries);
  });
});

describe("countDevlogEntriesSince", () => {
  it("counts the user's entries created on or after the cutoff", async () => {
    const count = vi.fn().mockResolvedValue(3);
    const database = { devlogEntry: { count } } as never;
    const since = new Date("2026-07-27T12:00:00.000Z");

    const result = await countDevlogEntriesSince("user-1", since, database);

    expect(count).toHaveBeenCalledWith({
      where: { userId: "user-1", createdAt: { gte: since } },
    });
    expect(result).toBe(3);
  });
});
