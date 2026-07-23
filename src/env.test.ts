import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { createAppEnv as CreateAppEnv } from "~/env";

let createAppEnv: typeof CreateAppEnv;

function completeProductionEnv(): NodeJS.ProcessEnv {
  return {
    AUTH_SECRET: "fabricated-auth-secret",
    GOOGLE_CLIENT_ID: "fabricated-google-client-id",
    GOOGLE_CLIENT_SECRET: "fabricated-google-client-secret",
    GITHUB_CLIENT_ID: "fabricated-github-client-id",
    GITHUB_CLIENT_SECRET: "fabricated-github-client-secret",
    DATABASE_URL:
      "postgresql://user:password@database.example.test:5432/provenance",
    DIRECT_URL:
      "postgresql://user:password@database.example.test:5432/provenance",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fabricated-service-role-key",
    SUPABASE_STORAGE_BUCKET: "project-media",
    SUPABASE_STORAGE_STAGING_BUCKET: "upload-staging",
    NODE_ENV: "production",
  };
}

beforeAll(async () => {
  for (const [name, value] of Object.entries(completeProductionEnv())) {
    vi.stubEnv(name, value);
  }
  ({ createAppEnv } = await import("~/env"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("production environment validation", () => {
  it("accepts a complete production configuration", () => {
    expect(createAppEnv(completeProductionEnv())).toMatchObject({
      NODE_ENV: "production",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "fabricated-service-role-key",
    });
  });

  it("rejects a production configuration without SUPABASE_URL", () => {
    expect(() =>
      createAppEnv({
        ...completeProductionEnv(),
        SUPABASE_URL: undefined,
      }),
    ).toThrow(/SUPABASE_URL/);
  });

  it("rejects a production configuration without the service-role key", () => {
    expect(() =>
      createAppEnv({
        ...completeProductionEnv(),
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it.each([
    "SUPABASE_STORAGE_BUCKET",
    "SUPABASE_STORAGE_STAGING_BUCKET",
  ] as const)("rejects production without %s", (variableName) => {
    expect(() =>
      createAppEnv({
        ...completeProductionEnv(),
        [variableName]: undefined,
      }),
    ).toThrow(variableName);
  });

  it("rejects every incomplete OAuth pair in every environment", () => {
    const environments = ["development", "test", "production"] as const;
    const incompletePairs = [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      ["GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_ID"],
      ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
      ["GITHUB_CLIENT_SECRET", "GITHUB_CLIENT_ID"],
    ] as const;

    for (const nodeEnv of environments) {
      for (const [configuredName, missingName] of incompletePairs) {
        const configuration = {
          ...completeProductionEnv(),
          NODE_ENV: nodeEnv,
          [missingName]: undefined,
        };

        expect(() => createAppEnv(configuration)).toThrow(
          `${missingName} is required when ${configuredName} is set`,
        );
      }
    }
  });

  it("rejects a malformed DATABASE_URL without exposing secret values", () => {
    const serviceRoleKey = "do-not-print-this-service-role-key";
    const configuration = {
      ...completeProductionEnv(),
      DATABASE_URL: "not-a-url",
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    };

    let validationError;
    try {
      createAppEnv(configuration);
    } catch (error) {
      validationError = error;
    }

    expect(validationError).toBeInstanceOf(Error);
    expect((validationError as Error).message).toContain("DATABASE_URL");
    expect((validationError as Error).message).not.toContain(serviceRoleKey);
  });
});
