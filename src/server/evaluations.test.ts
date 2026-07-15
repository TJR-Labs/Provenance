import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import {
  calculateWeightedPercentage,
  classifySubmission,
  rankSubmissions,
} from "~/server/evaluations";

const criteria = [
  { id: "works", name: "Works end-to-end", weight: 5 },
  { id: "quality", name: "Code quality", weight: 3 },
  { id: "docs", name: "Docs & reproducibility", weight: 2 },
];

describe("evaluation scoring", () => {
  it("calculates the hand-checked mixed-weight percentage as 86.0%", () => {
    const percentage = calculateWeightedPercentage(criteria, [
      { criterionId: "works", value: 5 },
      { criterionId: "quality", value: 4 },
      { criterionId: "docs", value: 3 },
    ]);

    expect(percentage).toBe(86);
    expect(percentage?.toFixed(1)).toBe("86.0");
  });

  it("classifies full, partial, and unscored submissions against current criteria", () => {
    expect(
      classifySubmission(criteria, [
        { criterionId: "works", value: 5 },
        { criterionId: "quality", value: 4 },
        { criterionId: "docs", value: 3 },
      ]),
    ).toEqual({ scoringStatus: "FULLY_SCORED", percentage: 86 });

    expect(
      classifySubmission(criteria, [{ criterionId: "works", value: 5 }]),
    ).toEqual({ scoringStatus: "PARTIALLY_SCORED", percentage: null });

    expect(classifySubmission(criteria, [])).toEqual({
      scoringStatus: "UNSCORED",
      percentage: null,
    });
  });

  it("recomputes a partial submission as fully scored after criterion removal", () => {
    const scores = [{ criterionId: "works", value: 5 }];

    expect(classifySubmission(criteria.slice(0, 2), scores).scoringStatus).toBe(
      "PARTIALLY_SCORED",
    );
    expect(classifySubmission(criteria.slice(0, 1), scores)).toEqual({
      scoringStatus: "FULLY_SCORED",
      percentage: 100,
    });
  });

  it("treats submissions as unscored when every criterion is removed", () => {
    expect(
      classifySubmission([], [{ criterionId: "removed", value: 5 }]),
    ).toEqual({ scoringStatus: "UNSCORED", percentage: null });
  });

  it("ranks full before partial before unscored, with percentage and date tie-breaks", () => {
    const earlier = new Date("2026-01-01T00:00:00.000Z");
    const later = new Date("2026-01-02T00:00:00.000Z");
    const submissions = [
      { id: "unscored", createdAt: earlier, scores: [] },
      {
        id: "partial",
        createdAt: earlier,
        scores: [{ criterionId: "works", value: 5 }],
      },
      {
        id: "full-lower",
        createdAt: earlier,
        scores: criteria.map((criterion) => ({
          criterionId: criterion.id,
          value: 3,
        })),
      },
      {
        id: "full-tied-later",
        createdAt: later,
        scores: criteria.map((criterion) => ({
          criterionId: criterion.id,
          value: 5,
        })),
      },
      {
        id: "full-tied-earlier",
        createdAt: earlier,
        scores: criteria.map((criterion) => ({
          criterionId: criterion.id,
          value: 5,
        })),
      },
    ];

    expect(rankSubmissions(criteria, submissions).map(({ id }) => id)).toEqual([
      "full-tied-earlier",
      "full-tied-later",
      "full-lower",
      "partial",
      "unscored",
    ]);
  });
});
