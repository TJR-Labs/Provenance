import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { BriefDomain, BriefStatus, Role } from "../../../../generated/prisma";
import { briefRouter } from "~/server/api/routers/brief";
import { defaultRubricCriteria } from "~/server/briefs";

const validBrief = {
  title: "Build a telemetry pipeline",
  summary: "Ship reliable device telemetry into the analytics warehouse.",
  description: "Design and implement the ingestion pipeline.",
  domain: BriefDomain.SOFTWARE,
  deliverables: "Source code and a short runbook.",
};

function companySession(id: string) {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id,
      role: Role.COMPANY,
      displayName: "Company User",
      name: "Company User",
    },
  };
}

function caller(brief: Record<string, unknown>, id = "company-1") {
  return briefRouter.createCaller({
    db: { brief } as never,
    headers: new Headers(),
    session: companySession(id),
  });
}

describe("brief router", () => {
  it("attaches the default rubric when creating a brief", async () => {
    const create = vi.fn(async (_args: unknown) => ({ id: "brief-1" }));
    const brief = { create };

    await caller(brief).create(validBrief);

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: { criteria: { create: [...defaultRubricCriteria] } },
    });
  });

  it.each(["update", "close"] as const)(
    "returns FORBIDDEN when a non-owner tries to %s a brief",
    async (operation) => {
      const brief = {
        findUnique: vi.fn().mockResolvedValue({
          id: "brief-1",
          companyId: "company-1",
          status: BriefStatus.OPEN,
          closedAt: null,
        }),
        update: vi.fn(),
      };
      const otherCompany = caller(brief, "company-2");

      const result =
        operation === "update"
          ? otherCompany.update({ id: "brief-1", ...validBrief })
          : otherCompany.close({ id: "brief-1" });

      await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(brief.update).not.toHaveBeenCalled();
    },
  );

  it("applies the requested domain to the open-brief filter", async () => {
    const matchingBrief = {
      id: "brief-ml",
      domain: BriefDomain.ML_AI,
      status: BriefStatus.OPEN,
    };
    const brief = {
      findMany: vi.fn().mockResolvedValue([matchingBrief]),
    };

    await expect(
      caller(brief).listOpen({ domain: BriefDomain.ML_AI }),
    ).resolves.toEqual([matchingBrief]);
    expect(brief.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: BriefStatus.OPEN, domain: BriefDomain.ML_AI },
      }),
    );
  });

  it.each([
    [{ ...validBrief, title: "x".repeat(121) }, "title"],
    [{ ...validBrief, summary: "x".repeat(201) }, "summary"],
    [{ ...validBrief, description: "   " }, "description"],
    [{ ...validBrief, deliverables: "" }, "deliverables"],
    [{ ...validBrief, domain: "INVALID" }, "domain"],
  ])("rejects invalid create input for %s", async (input, _field) => {
    const brief = { create: vi.fn() };

    await expect(caller(brief).create(input as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(brief.create).not.toHaveBeenCalled();
  });
});
