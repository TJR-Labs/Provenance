import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { Role } from "../../../../generated/prisma";
import { evaluationRouter } from "~/server/api/routers/evaluation";

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
    rubricCriterion?: Record<string, unknown>;
    submission?: Record<string, unknown>;
  },
) {
  return evaluationRouter.createCaller({
    db: {
      brief: delegates.brief ?? {},
      rubricCriterion: delegates.rubricCriterion ?? {},
      submission: delegates.submission ?? {},
    } as never,
    headers: new Headers(),
    session: session(id, role),
  });
}

const scores = [
  { criterionId: "works", value: 5 },
  { criterionId: "quality", value: 4 },
  { criterionId: "docs", value: 3 },
];

describe("evaluation router authorization and validation", () => {
  it("returns FORBIDDEN when another company requests the ranked score view", async () => {
    const brief = {
      findUnique: vi.fn().mockResolvedValue({
        id: "brief-1",
        companyId: "company-1",
        criteria: [],
        submissions: [],
      }),
    };

    await expect(
      caller(Role.COMPANY, "company-2", { brief }).companyView({
        briefId: "brief-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces ownership for adding, updating, and removing rubric criteria", async () => {
    const brief = {
      findUnique: vi.fn().mockResolvedValue({
        id: "brief-1",
        companyId: "company-1",
      }),
    };
    const rubricCriterion = {
      findUnique: vi.fn().mockResolvedValue({
        id: "criterion-1",
        briefId: "brief-1",
        brief: { companyId: "company-1" },
      }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const otherCompany = caller(Role.COMPANY, "company-2", {
      brief,
      rubricCriterion,
    });

    await expect(
      otherCompany.addCriterion({
        briefId: "brief-1",
        name: "New criterion",
        weight: 2,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      otherCompany.updateCriterion({
        criterionId: "criterion-1",
        name: "Renamed criterion",
        weight: 4,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      otherCompany.removeCriterion({ criterionId: "criterion-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(rubricCriterion.create).not.toHaveBeenCalled();
    expect(rubricCriterion.update).not.toHaveBeenCalled();
    expect(rubricCriterion.delete).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN without saving when another company scores a submission", async () => {
    const submission = {
      findUnique: vi.fn().mockResolvedValue({
        id: "submission-1",
        brief: {
          companyId: "company-1",
          criteria: scores.map(({ criterionId }) => ({ id: criterionId })),
        },
      }),
      update: vi.fn(),
    };

    await expect(
      caller(Role.COMPANY, "company-2", { submission }).scoreSubmission({
        submissionId: "submission-1",
        scores,
        feedbackNote: "Strong work.",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(submission.update).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN when an engineer requests a competitor's result", async () => {
    const submission = {
      findUnique: vi.fn().mockResolvedValue({
        id: "submission-1",
        engineerId: "engineer-1",
        feedbackNote: "Private feedback.",
        brief: { criteria: [] },
        scores: [],
      }),
    };

    await expect(
      caller(Role.ENGINEER, "engineer-2", { submission }).myResult({
        submissionId: "submission-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns no result or feedback until the engineer's submission is fully scored", async () => {
    const submission = {
      findUnique: vi.fn().mockResolvedValue({
        id: "submission-1",
        engineerId: "engineer-1",
        feedbackNote: "Not visible yet.",
        brief: {
          criteria: [
            { id: "works", name: "Works", weight: 5 },
            { id: "docs", name: "Docs", weight: 2 },
          ],
        },
        scores: [{ criterionId: "works", value: 5 }],
      }),
    };

    await expect(
      caller(Role.ENGINEER, "engineer-1", { submission }).myResult({
        submissionId: "submission-1",
      }),
    ).resolves.toBeNull();
  });

  it("returns the engineer's breakdown and feedback once every current criterion is scored", async () => {
    const submission = {
      findUnique: vi.fn().mockResolvedValue({
        id: "submission-1",
        engineerId: "engineer-1",
        feedbackNote: "Strong work.",
        brief: {
          criteria: [
            { id: "works", name: "Works end-to-end", weight: 5 },
            { id: "quality", name: "Code quality", weight: 3 },
            { id: "docs", name: "Docs & reproducibility", weight: 2 },
          ],
        },
        scores,
      }),
    };

    await expect(
      caller(Role.ENGINEER, "engineer-1", { submission }).myResult({
        submissionId: "submission-1",
      }),
    ).resolves.toMatchObject({
      submissionId: "submission-1",
      percentage: 86,
      feedbackNote: "Strong work.",
      scores: [
        { criterionId: "works", value: 5 },
        { criterionId: "quality", value: 4 },
        { criterionId: "docs", value: 3 },
      ],
    });
  });

  it("rejects an incomplete current-rubric score set without saving", async () => {
    const submission = {
      findUnique: vi.fn().mockResolvedValue({
        id: "submission-1",
        brief: {
          companyId: "company-1",
          criteria: [{ id: "works" }, { id: "docs" }],
        },
      }),
      update: vi.fn(),
    };

    await expect(
      caller(Role.COMPANY, "company-1", { submission }).scoreSubmission({
        submissionId: "submission-1",
        scores: [{ criterionId: "works", value: 5 }],
        feedbackNote: null,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(submission.update).not.toHaveBeenCalled();
  });

  it.each([-1, 6, 2.5])(
    "rejects an invalid score value of %s before reading or writing the database",
    async (value) => {
      const submission = { findUnique: vi.fn(), update: vi.fn() };

      await expect(
        caller(Role.COMPANY, "company-1", { submission }).scoreSubmission({
          submissionId: "submission-1",
          scores: [{ criterionId: "works", value }],
          feedbackNote: null,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(submission.findUnique).not.toHaveBeenCalled();
      expect(submission.update).not.toHaveBeenCalled();
    },
  );

  it.each([0, 6, 2.5])(
    "rejects an invalid criterion weight of %s before saving",
    async (weight) => {
      const brief = { findUnique: vi.fn() };
      const rubricCriterion = { create: vi.fn() };

      await expect(
        caller(Role.COMPANY, "company-1", {
          brief,
          rubricCriterion,
        }).addCriterion({ briefId: "brief-1", name: "Criterion", weight }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(brief.findUnique).not.toHaveBeenCalled();
      expect(rubricCriterion.create).not.toHaveBeenCalled();
    },
  );

  it.each([Role.ENGINEER, Role.ADMIN])(
    "returns FORBIDDEN when a %s user tries to score",
    async (role) => {
      await expect(
        caller(role, "not-a-company", {}).scoreSubmission({
          submissionId: "submission-1",
          scores,
          feedbackNote: null,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
});
