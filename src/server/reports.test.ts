import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import { listReports } from "~/server/reports";

function reportRow(id: string, createdAt: string) {
  return {
    id,
    createdAt: new Date(createdAt),
    reporterId: "reporter-1",
    projectId: null,
    reportedUserId: "reported-1",
    reason: null,
    reporter: { username: "reporter" },
    project: null,
    reportedUser: { id: "reported-1", username: "reported", banned: false },
  };
}

describe("listReports pagination", () => {
  it("returns first and subsequent pages and null at the end", async () => {
    const tiedAt = "2026-07-20T12:00:00.000Z";
    const reports = {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([
          reportRow("report-c", tiedAt),
          reportRow("report-b", tiedAt),
          reportRow("report-a", tiedAt),
        ])
        .mockResolvedValueOnce([reportRow("report-a", tiedAt)]),
    };

    const firstPage = await listReports(reports as never, { limit: 2 });
    const secondPage = await listReports(reports as never, {
      limit: 2,
      cursor: firstPage.nextCursor!,
    });

    expect(firstPage.items.map((report) => report.id)).toEqual([
      "report-c",
      "report-b",
    ]);
    expect(firstPage.nextCursor).toBe(`${tiedAt}|report-b`);
    expect(secondPage.items.map((report) => report.id)).toEqual(["report-a"]);
    expect(secondPage.nextCursor).toBeNull();
    expect(reports.findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
    });
    expect(reports.findMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        OR: [
          { createdAt: { lt: new Date(tiedAt) } },
          { createdAt: new Date(tiedAt), id: { lt: "report-b" } },
        ],
      },
    });
  });

  it("rejects malformed cursors before querying", async () => {
    const reports = { findMany: vi.fn() };

    await expect(
      listReports(reports as never, { cursor: "malformed" }),
    ).rejects.toThrow("Invalid pagination cursor");
    expect(reports.findMany).not.toHaveBeenCalled();
  });

  it("clamps oversized pages to 100 reports", async () => {
    const reports = { findMany: vi.fn().mockResolvedValue([]) };

    await listReports(reports as never, { limit: 1_000 });

    expect(reports.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
  });
});
