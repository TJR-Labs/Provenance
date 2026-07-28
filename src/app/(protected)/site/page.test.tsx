/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Category, ProjectStatus } from "../../../../generated/prisma";
import SitePage from "./page";

const mocks = vi.hoisted(() => ({
  profileMe: vi.fn(),
  projectListMine: vi.fn(),
  devlogListMine: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("~/server/api/caller", () => ({
  getServerCaller: async () => ({
    profile: { me: mocks.profileMe },
    project: { listMine: mocks.projectListMine },
    devlog: { listMine: mocks.devlogListMine },
  }),
}));

vi.mock("./site-interactive", () => ({
  ProjectsFlyoutTrigger: () => <button>Manage projects</button>,
  DevlogQuickAdd: () => <button>+ Add entry</button>,
}));

const projects = [
  {
    id: "project-1",
    title: "Compiler",
    status: ProjectStatus.BUILDING,
    category: Category.SOFTWARE_ENGINEER,
    thumbnailUrl: null,
    placed: true,
  },
  {
    id: "project-2",
    title: "Robot Arm",
    status: ProjectStatus.SHIPPED,
    category: Category.ROBOTICS_ENGINEER,
    thumbnailUrl: null,
    placed: true,
  },
  {
    id: "project-3",
    title: "Field Notes",
    status: ProjectStatus.IDEA,
    category: Category.WRITER,
    thumbnailUrl: null,
    placed: false,
  },
  {
    id: "project-4",
    title: "Gallery",
    status: ProjectStatus.ARCHIVED,
    category: Category.ARTIST,
    thumbnailUrl: null,
    placed: false,
  },
  {
    id: "project-5",
    title: "Fifth Project",
    status: ProjectStatus.BUILDING,
    category: Category.DESIGNER,
    thumbnailUrl: null,
    placed: false,
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
  vi.clearAllMocks();

  mocks.profileMe.mockResolvedValue({
    username: "ryan",
    displayName: "Ryan V.",
    bio: "I build thoughtful tools.",
    siteStylePublished: {
      colorBg: "#f1eee6",
      colorText: "#17150f",
      colorAccent: "#ed4b2a",
    },
    sitePublishedAt: new Date("2026-07-27T11:00:00.000Z"),
    siteDraftSavedAt: null,
  });
  mocks.projectListMine.mockResolvedValue({
    items: projects,
    nextCursor: null,
  });
  mocks.devlogListMine.mockResolvedValue([
    {
      id: "entry-1",
      userId: "user-1",
      label: "V0.4",
      body: "Polished the portfolio hub.",
      createdAt: new Date("2026-07-26T10:00:00.000Z"),
    },
    {
      id: "entry-2",
      userId: "user-1",
      label: "NOTE",
      body: "Updated project covers.",
      createdAt: new Date("2026-07-21T09:00:00.000Z"),
    },
    {
      id: "entry-3",
      userId: "user-1",
      label: "V0.3",
      body: "Started the first draft.",
      createdAt: new Date("2026-07-18T09:00:00.000Z"),
    },
  ]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SitePage", () => {
  it("renders the utility bar, portfolio preview, devlog, and weekly stats", async () => {
    render(await SitePage());

    expect(
      screen.getByText("ryan.provenance.site · LIVE PREVIEW"),
    ).toBeTruthy();
    expect(screen.getByText("Ryan V.")).toBeTruthy();
    expect(screen.getAllByText("I build thoughtful tools.")).toHaveLength(2);
    expect(screen.getByText("EDITORIAL CREAM")).toBeTruthy();

    for (const { title, category } of [
      { title: "Compiler", category: "Software Engineer" },
      { title: "Robot Arm", category: "Robotics Engineer" },
      { title: "Field Notes", category: "Writer" },
      { title: "Gallery", category: "Artist" },
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(category)).toBeTruthy();
    }
    expect(screen.queryByText("Fifth Project")).toBeNull();
    expect(screen.queryByText("Designer")).toBeNull();

    expect(screen.getByText("2026-07-26 · V0.4")).toBeTruthy();
    expect(screen.getByText("Polished the portfolio hub.")).toBeTruthy();

    const visitorsRow = screen.getByText("Visitors").parentElement;
    const logEntriesRow = screen.getByText("Log entries").parentElement;
    expect(visitorsRow).not.toBeNull();
    expect(logEntriesRow).not.toBeNull();
    expect(within(visitorsRow!).getByText("—")).toBeTruthy();
    expect(within(logEntriesRow!).getByText("2")).toBeTruthy();

    expect(mocks.profileMe).toHaveBeenCalledTimes(1);
    expect(mocks.projectListMine).toHaveBeenCalledTimes(1);
    expect(mocks.devlogListMine).toHaveBeenCalledTimes(1);
  });

  it("renders the project and devlog empty states with a zero weekly count", async () => {
    mocks.projectListMine.mockResolvedValue({ items: [], nextCursor: null });
    mocks.devlogListMine.mockResolvedValue([]);

    render(await SitePage());

    expect(screen.getByText("No projects yet.")).toBeTruthy();
    expect(screen.getByText("No entries yet — add one below.")).toBeTruthy();

    const logEntriesRow = screen.getByText("Log entries").parentElement;
    expect(logEntriesRow).not.toBeNull();
    expect(within(logEntriesRow!).getByText("0")).toBeTruthy();
  });
});
