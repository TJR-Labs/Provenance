import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import { dismissOnboarding, getOnboardingChecklist } from "./onboarding";

function databaseWithUser(user: {
  bio: string | null;
  layoutMode: "GRID" | "CANVAS";
  onboardingDismissedAt: Date | null;
  _count: { projects: number };
}) {
  return {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(user),
    },
  } as never;
}

describe("getOnboardingChecklist", () => {
  it("shows all incomplete items for a new, undismissed account", async () => {
    const result = await getOnboardingChecklist(
      "user-1",
      databaseWithUser({
        bio: null,
        layoutMode: "GRID",
        onboardingDismissedAt: null,
        _count: { projects: 0 },
      }),
    );

    expect(result).toEqual({
      shouldShow: true,
      items: { bio: false, project: false, layout: false },
    });
  });

  it("auto-hides when every item is complete", async () => {
    const result = await getOnboardingChecklist(
      "user-1",
      databaseWithUser({
        bio: "A short bio",
        layoutMode: "CANVAS",
        onboardingDismissedAt: null,
        _count: { projects: 1 },
      }),
    );

    expect(result).toEqual({
      shouldShow: false,
      items: { bio: true, project: true, layout: true },
    });
  });

  it("keeps showing while an undismissed item is incomplete", async () => {
    const result = await getOnboardingChecklist(
      "user-1",
      databaseWithUser({
        bio: "A short bio",
        layoutMode: "CANVAS",
        onboardingDismissedAt: null,
        _count: { projects: 0 },
      }),
    );

    expect(result).toEqual({
      shouldShow: true,
      items: { bio: true, project: false, layout: true },
    });
  });

  it("stays hidden after dismissal even with incomplete items", async () => {
    const result = await getOnboardingChecklist(
      "user-1",
      databaseWithUser({
        bio: null,
        layoutMode: "GRID",
        onboardingDismissedAt: new Date("2026-07-17T23:00:00.000Z"),
        _count: { projects: 0 },
      }),
    );

    expect(result.shouldShow).toBe(false);
  });

  it("treats the default GRID mode as incomplete", async () => {
    const result = await getOnboardingChecklist(
      "user-1",
      databaseWithUser({
        bio: "A short bio",
        layoutMode: "GRID",
        onboardingDismissedAt: null,
        _count: { projects: 1 },
      }),
    );

    expect(result.items.layout).toBe(false);
    expect(result.shouldShow).toBe(true);
  });
});

describe("dismissOnboarding", () => {
  it("persists the dismissal timestamp", async () => {
    type UpdateArgs = {
      where: { id: string };
      data: { onboardingDismissedAt: Date };
      select: { onboardingDismissedAt: boolean };
    };
    const update = vi
      .fn<(args: UpdateArgs) => Promise<{ onboardingDismissedAt: Date }>>()
      .mockResolvedValue({
        onboardingDismissedAt: new Date("2026-07-17T23:00:00.000Z"),
      });
    const database = { user: { update } } as never;

    await dismissOnboarding("user-1", database);

    expect(update).toHaveBeenCalledOnce();
    const call = update.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      where: { id: "user-1" },
      select: { onboardingDismissedAt: true },
    });
    expect(call?.data.onboardingDismissedAt).toBeInstanceOf(Date);
  });
});
