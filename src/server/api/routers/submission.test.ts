import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { BriefStatus, Role } from "../../../../generated/prisma";
import { submissionRouter } from "~/server/api/routers/submission";

const validSubmission = {
  briefId: "brief-1",
  repoUrl: "https://github.com/engineer/project",
  demoUrl: "https://demo.example.com",
  writeup: "Built the solution and documented how to run it.",
};

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
    submission?: Record<string, unknown>;
    user?: Record<string, unknown>;
  },
) {
  return submissionRouter.createCaller({
    db: {
      brief: delegates.brief ?? {},
      submission: delegates.submission ?? {},
      user: delegates.user ?? {},
    } as never,
    headers: new Headers(),
    session: session(id, role),
  });
}

describe("submission router", () => {
  it("upserts on the brief-and-engineer key so a second submit updates rather than duplicates", async () => {
    const brief = {
      findUnique: vi.fn().mockResolvedValue({
        id: "brief-1",
        status: BriefStatus.OPEN,
      }),
    };
    const submission = {
      upsert: vi
        .fn()
        .mockResolvedValueOnce({ id: "submission-1", ...validSubmission })
        .mockResolvedValueOnce({
          id: "submission-1",
          ...validSubmission,
          writeup: "Updated writeup.",
        }),
    };
    const engineer = caller(Role.ENGINEER, "engineer-1", {
      brief,
      submission,
    });

    await engineer.upsert(validSubmission);
    await engineer.upsert({ ...validSubmission, writeup: "Updated writeup." });

    expect(submission.upsert).toHaveBeenCalledTimes(2);
    expect(submission.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          briefId_engineerId: {
            briefId: "brief-1",
            engineerId: "engineer-1",
          },
        },
        update: {
          repoUrl: validSubmission.repoUrl,
          demoUrl: validSubmission.demoUrl,
          writeup: "Updated writeup.",
        },
      }),
    );
  });

  it("rejects submissions and edits after the brief closes without saving", async () => {
    const brief = {
      findUnique: vi.fn().mockResolvedValue({
        id: "brief-1",
        status: BriefStatus.CLOSED,
      }),
    };
    const submission = { upsert: vi.fn() };

    await expect(
      caller(Role.ENGINEER, "engineer-1", { brief, submission }).upsert(
        validSubmission,
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "This brief is closed. Submissions can no longer be created or edited.",
    });
    expect(submission.upsert).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN when a non-owner company lists brief submissions", async () => {
    const brief = {
      findUnique: vi.fn().mockResolvedValue({
        id: "brief-1",
        companyId: "company-1",
      }),
    };
    const submission = { findMany: vi.fn() };

    await expect(
      caller(Role.COMPANY, "company-2", { brief, submission }).listForBrief({
        briefId: "brief-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(submission.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ["javascript:alert(1)", null],
    ["github.com/engineer/project", null],
    [validSubmission.repoUrl, "ftp://example.com/demo"],
  ])(
    "rejects non-http(s) repository or demo URLs",
    async (repoUrl, demoUrl) => {
      const brief = { findUnique: vi.fn() };
      const submission = { upsert: vi.fn() };

      await expect(
        caller(Role.ENGINEER, "engineer-1", { brief, submission }).upsert({
          ...validSubmission,
          repoUrl,
          demoUrl,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(brief.findUnique).not.toHaveBeenCalled();
      expect(submission.upsert).not.toHaveBeenCalled();
    },
  );

  it.each([Role.COMPANY, Role.ADMIN])(
    "returns FORBIDDEN when a %s user calls upsert",
    async (role) => {
      await expect(
        caller(role, "not-an-engineer", {}).upsert(validSubmission),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
});
