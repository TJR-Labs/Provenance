import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import { listMyProjects } from "~/server/projects";

describe("listMyProjects", () => {
  it("lists the user's own projects newest-first with thumbnail and placed status", async () => {
    const projects = {
      findMany: vi.fn().mockResolvedValue([
        { id: "project-2", title: "Second", media: [{ url: "https://example.com/2.png" }] },
        { id: "project-1", title: "First", media: [] },
      ]),
    };
    const users = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        canvasDraftSavedAt: null,
        canvasPublishedAt: new Date("2026-07-16T12:00:00Z"),
      }),
    };
    const canvasElements = {
      findMany: vi.fn().mockResolvedValue([{ projectId: "project-2" }]),
    };

    const result = await listMyProjects(
      "user-1",
      projects as never,
      users,
      canvasElements,
    );

    expect(projects.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(result).toEqual([
      { id: "project-2", title: "Second", thumbnailUrl: "https://example.com/2.png", placed: true },
      { id: "project-1", title: "First", thumbnailUrl: null, placed: false },
    ]);
  });

  it("resolves placement against the DRAFT state when the draft is newer than the last publish", async () => {
    const projects = {
      findMany: vi.fn().mockResolvedValue([{ id: "project-1", title: "Only", media: [] }]),
    };
    const users = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        canvasDraftSavedAt: new Date("2026-07-17T00:00:00Z"),
        canvasPublishedAt: new Date("2026-07-16T00:00:00Z"),
      }),
    };
    const canvasElements = {
      findMany: vi.fn().mockResolvedValue([{ projectId: "project-1" }]),
    };

    await listMyProjects("user-1", projects as never, users, canvasElements);

    expect(canvasElements.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", state: "DRAFT", type: "PROJECT" },
      select: { projectId: true },
    });
  });

  it("returns an empty list for a user with no projects, without querying canvas elements", async () => {
    const projects = { findMany: vi.fn().mockResolvedValue([]) };
    const users = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        canvasDraftSavedAt: null,
        canvasPublishedAt: null,
      }),
    };
    const canvasElements = { findMany: vi.fn() };

    const result = await listMyProjects(
      "user-1",
      projects as never,
      users,
      canvasElements,
    );

    expect(result).toEqual([]);
    expect(canvasElements.findMany).not.toHaveBeenCalled();
  });
});
