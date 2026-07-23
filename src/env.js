import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const oauthProviderPairs = /** @type {const} */ ([
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
]);

const oauthProviderPairsSchema = z
  .object({
    GOOGLE_CLIENT_ID: z.unknown().optional(),
    GOOGLE_CLIENT_SECRET: z.unknown().optional(),
    GITHUB_CLIENT_ID: z.unknown().optional(),
    GITHUB_CLIENT_SECRET: z.unknown().optional(),
  })
  .superRefine((values, context) => {
    for (const [clientIdName, clientSecretName] of oauthProviderPairs) {
      const clientIdIsSet =
        values[clientIdName] !== undefined && values[clientIdName] !== "";
      const clientSecretIsSet =
        values[clientSecretName] !== undefined &&
        values[clientSecretName] !== "";

      if (clientIdIsSet && !clientSecretIsSet) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [clientSecretName],
          message: `${clientSecretName} is required when ${clientIdName} is set`,
        });
      }
      if (clientSecretIsSet && !clientIdIsSet) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [clientIdName],
          message: `${clientIdName} is required when ${clientSecretName} is set`,
        });
      }
    }
  });

/**
 * Build an error from issue paths and descriptions only. The issue objects and
 * raw environment values are intentionally not logged or included.
 *
 * @param {readonly { message: string; path?: readonly unknown[] }[]} issues
 * @returns {never}
 */
function throwInvalidEnvironmentError(issues) {
  const details = issues.map((issue) => {
    const firstPathSegment = issue.path?.[0];
    const variableName =
      typeof firstPathSegment === "string"
        ? firstPathSegment
        : typeof firstPathSegment === "object" &&
            firstPathSegment !== null &&
            "key" in firstPathSegment &&
            typeof firstPathSegment.key === "string"
          ? firstPathSegment.key
          : undefined;
    return variableName ? `${variableName}: ${issue.message}` : issue.message;
  });

  throw new Error(`Invalid environment variables: ${details.join("; ")}`);
}

/**
 * Create and validate the application environment. Accepting an explicit
 * source keeps production configuration behavior directly testable without
 * changing the process environment.
 *
 * @param {NodeJS.ProcessEnv} [source]
 */
export function createAppEnv(source = process.env) {
  const runtimeEnv = {
    AUTH_SECRET: source.AUTH_SECRET,
    ADMIN_PASSWORD: source.ADMIN_PASSWORD,
    GOOGLE_CLIENT_ID: source.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: source.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: source.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: source.GITHUB_CLIENT_SECRET,
    DATABASE_URL: source.DATABASE_URL,
    DIRECT_URL: source.DIRECT_URL,
    SUPABASE_URL: source.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_BUCKET: source.SUPABASE_STORAGE_BUCKET,
    SUPABASE_STORAGE_STAGING_BUCKET: source.SUPABASE_STORAGE_STAGING_BUCKET,
    NODE_ENV: source.NODE_ENV,
  };
  const skipValidation = !!source.SKIP_ENV_VALIDATION;
  const isProduction = source.NODE_ENV === "production";

  if (!skipValidation) {
    const oauthProviderPairs = oauthProviderPairsSchema.safeParse(runtimeEnv);
    if (!oauthProviderPairs.success) {
      throwInvalidEnvironmentError(oauthProviderPairs.error.issues);
    }
  }

  return createEnv({
    /**
     * Specify your server-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars.
     */
    server: {
      AUTH_SECRET: isProduction ? z.string() : z.string().optional(),
      ADMIN_PASSWORD: z.string().optional(),
      GOOGLE_CLIENT_ID: z.string().min(1).optional(),
      GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
      GITHUB_CLIENT_ID: z.string().min(1).optional(),
      GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
      DATABASE_URL: z.string().url(),
      DIRECT_URL: z.string().url(),
      SUPABASE_URL: isProduction
        ? z.string().url()
        : z.string().url().optional(),
      SUPABASE_SERVICE_ROLE_KEY: isProduction
        ? z.string().min(1)
        : z.string().min(1).optional(),
      SUPABASE_STORAGE_BUCKET: isProduction
        ? z.string().min(1)
        : z.string().min(1).default("project-media"),
      SUPABASE_STORAGE_STAGING_BUCKET: isProduction
        ? z.string().min(1)
        : z.string().min(1).default("upload-staging"),
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
    },

    /**
     * Specify your client-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars. To expose them to the client, prefix them with
     * `NEXT_PUBLIC_`.
     */
    client: {
      // NEXT_PUBLIC_CLIENTVAR: z.string(),
    },

    /**
     * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
     * middlewares) or client-side so we need to destruct manually.
     */
    runtimeEnv,
    /**
     * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
     * useful for Docker builds.
     */
    skipValidation,
    /**
     * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
     * `SOME_VAR=''` will throw an error.
     */
    emptyStringAsUndefined: true,
    onValidationError: throwInvalidEnvironmentError,
  });
}

export const env = createAppEnv();
