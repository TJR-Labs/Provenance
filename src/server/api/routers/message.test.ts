import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { Role } from "../../../../generated/prisma";
import { messageRouter } from "~/server/api/routers/message";

function session(id: string, role: Role) {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id,
      role,
      displayName: "Signed-in User",
      name: "Signed-in User",
    },
  };
}

function caller(
  role: Role,
  id: string,
  delegates: {
    brief?: Record<string, unknown>;
    message?: Record<string, unknown>;
    submission?: Record<string, unknown>;
    user?: Record<string, unknown>;
  },
) {
  return messageRouter.createCaller({
    db: {
      brief: delegates.brief ?? {},
      message: delegates.message ?? {},
      submission: delegates.submission ?? {},
      user: delegates.user ?? {},
    } as never,
    headers: new Headers(),
    session: session(id, role),
  });
}

describe("message router", () => {
  it("allows a company to send outreach to an engineer", async () => {
    const user = {
      findUnique: vi.fn().mockResolvedValue({
        id: "engineer-1",
        role: Role.ENGINEER,
      }),
    };
    const message = {
      create: vi.fn().mockResolvedValue({ id: "message-1" }),
    };

    await expect(
      caller(Role.COMPANY, "company-1", { user, message }).send({
        toEngineerId: "engineer-1",
        briefId: null,
        body: " Your project stood out. ",
      }),
    ).resolves.toEqual({ id: "message-1" });

    expect(message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fromCompanyId: "company-1",
          toEngineerId: "engineer-1",
          briefId: null,
          body: "Your project stood out.",
        },
      }),
    );
  });

  it.each([Role.ENGINEER, Role.ADMIN])(
    "returns FORBIDDEN when a %s user tries to send outreach",
    async (role) => {
      const user = { findUnique: vi.fn() };
      const message = { create: vi.fn() };

      await expect(
        caller(role, "not-a-company", { user, message }).send({
          toEngineerId: "engineer-1",
          briefId: null,
          body: "Hello",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(user.findUnique).not.toHaveBeenCalled();
      expect(message.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a company", { id: "company-2", role: Role.COMPANY }],
    ["an admin", { id: "admin-1", role: Role.ADMIN }],
    ["a missing user", null],
  ])("rejects outreach to %s without saving", async (_label, recipient) => {
    const user = { findUnique: vi.fn().mockResolvedValue(recipient) };
    const message = { create: vi.fn() };

    await expect(
      caller(Role.COMPANY, "company-1", { user, message }).send({
        toEngineerId: "invalid-recipient",
        briefId: null,
        body: "Hello",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(message.create).not.toHaveBeenCalled();
  });

  it("rejects an empty body before reading or writing the database", async () => {
    const user = { findUnique: vi.fn() };
    const message = { create: vi.fn() };

    await expect(
      caller(Role.COMPANY, "company-1", { user, message }).send({
        toEngineerId: "engineer-1",
        briefId: null,
        body: "   ",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(user.findUnique).not.toHaveBeenCalled();
    expect(message.create).not.toHaveBeenCalled();
  });

  it("returns only the signed-in engineer's inbox messages newest first", async () => {
    const inboxMessage = { id: "message-1" };
    const message = {
      findMany: vi.fn().mockResolvedValue([inboxMessage]),
    };

    await expect(
      caller(Role.ENGINEER, "engineer-1", { message }).inbox(),
    ).resolves.toEqual([inboxMessage]);
    expect(message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { toEngineerId: "engineer-1" },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("counts only unread messages for the signed-in engineer", async () => {
    const message = { count: vi.fn().mockResolvedValue(2) };

    await expect(
      caller(Role.ENGINEER, "engineer-1", { message }).unreadCount(),
    ).resolves.toBe(2);
    expect(message.count).toHaveBeenCalledWith({
      where: { toEngineerId: "engineer-1", readAt: null },
    });
  });

  it("marks every unread message for the signed-in engineer as read", async () => {
    const updateMany = vi.fn(
      async (_input: {
        where: { toEngineerId: string; readAt: null };
        data: { readAt: Date };
      }) => ({ count: 2 }),
    );
    const message = { updateMany };

    await expect(
      caller(Role.ENGINEER, "engineer-1", { message }).markAllRead(),
    ).resolves.toEqual({ count: 2 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { toEngineerId: "engineer-1", readAt: null },
      data: { readAt: updateMany.mock.calls[0]?.[0].data.readAt },
    });
    expect(updateMany.mock.calls[0]?.[0].data.readAt).toBeInstanceOf(Date);
  });

  it("scopes scout submissions and sent messages to the signed-in company", async () => {
    const submission = { findMany: vi.fn().mockResolvedValue([]) };
    const message = { findMany: vi.fn().mockResolvedValue([]) };
    const company = caller(Role.COMPANY, "company-2", {
      submission,
      message,
    });

    await company.scout();
    await company.sent();

    expect(submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { brief: { companyId: "company-2" } } }),
    );
    expect(message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fromCompanyId: "company-2" } }),
    );
  });

  it("ranks fully scored submissions globally before partial and unscored work", async () => {
    const earlier = new Date("2026-01-01T00:00:00.000Z");
    const later = new Date("2026-01-02T00:00:00.000Z");
    const criterion = { id: "quality", name: "Quality", weight: 1 };
    const makeSubmission = (
      id: string,
      createdAt: Date,
      scores: { criterionId: string; value: number }[],
      criteria = [criterion],
    ) => ({
      id,
      engineerId: `${id}-engineer`,
      repoUrl: `https://example.com/${id}`,
      createdAt,
      engineer: { displayName: id },
      brief: { id: `${id}-brief`, title: id, criteria },
      scores,
    });
    const submission = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          makeSubmission("unscored", earlier, []),
          makeSubmission("full-lower", earlier, [
            { criterionId: "quality", value: 3 },
          ]),
          makeSubmission(
            "partial",
            earlier,
            [{ criterionId: "quality", value: 5 }],
            [criterion, { id: "docs", name: "Docs", weight: 1 }],
          ),
          makeSubmission("full-higher", later, [
            { criterionId: "quality", value: 5 },
          ]),
        ]),
    };

    const result = await caller(Role.COMPANY, "company-1", {
      submission,
    }).scout();

    expect(result.map(({ id }) => id)).toEqual([
      "full-higher",
      "full-lower",
      "partial",
      "unscored",
    ]);
  });
});
