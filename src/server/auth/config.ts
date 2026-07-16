import type { DefaultSession, NextAuthConfig, Session } from "next-auth";
import GitHub, {
  type GitHubEmail,
  type GitHubProfile,
} from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { z } from "zod";

import type { Role } from "../../../generated/prisma";
import { env } from "~/env";
import { verifyPassword } from "~/server/auth/password";
import { db } from "~/server/db";
import {
  completeOAuthLink,
  consumeCompletedOAuthSignup,
  InvalidOAuthFlowError,
  OAUTH_LINK_COOKIE,
  OAuthAccountAlreadyLinkedError,
  OAuthProviderAlreadyLinkedError,
  OAuthUserBannedError,
  oauthUsernamePickerPath,
  oauthProviderSchema,
  resolveOAuthSignIn,
} from "~/server/users";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: Role;
      displayName: string;
      username: string;
    } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const LOGIN_FAILURE_THRESHOLD = 10;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

function authUser(user: {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  displayName: string;
}) {
  return {
    id: user.id,
    name: user.displayName,
    email: user.email,
    username: user.username,
    role: user.role,
    displayName: user.displayName,
  };
}

export function isOAuthEmailVerified(
  provider: "google" | "github",
  profile: Record<string, unknown> | undefined,
) {
  if (!profile) return false;
  return provider === "google"
    ? profile.email_verified === true
    : profile.email_verified === true;
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const oauthSignupToken = (credentials as Record<string, unknown>)
          .oauthSignupToken;
        if (typeof oauthSignupToken === "string" && oauthSignupToken) {
          const user = await consumeCompletedOAuthSignup(oauthSignupToken);
          return user ? authUser(user) : null;
        }

        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const username = parsed.data.username.toLowerCase();
        const now = new Date();
        const loginAttempt = await db.loginAttempt.findUnique({
          where: { username },
        });

        if (loginAttempt?.lockedUntil && loginAttempt.lockedUntil > now) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { username },
        });

        if (user?.banned) return null;

        if (
          !user ||
          !(await verifyPassword(parsed.data.password, user.passwordHash))
        ) {
          let startsNewWindow = true;
          let failedCount = 1;
          if (
            loginAttempt?.lockedUntil === null &&
            now.getTime() - loginAttempt.firstFailedAt.getTime() <
              LOGIN_ATTEMPT_WINDOW_MS
          ) {
            startsNewWindow = false;
            failedCount = loginAttempt.failedCount + 1;
          }
          const lockedUntil =
            failedCount >= LOGIN_FAILURE_THRESHOLD
              ? new Date(now.getTime() + LOGIN_LOCKOUT_DURATION_MS)
              : null;

          await db.loginAttempt.upsert({
            where: { username },
            create: {
              username,
              failedCount,
              firstFailedAt: now,
              lockedUntil,
            },
            update: {
              failedCount,
              ...(startsNewWindow && { firstFailedAt: now }),
              lockedUntil,
            },
          });

          return null;
        }

        await db.loginAttempt.deleteMany({ where: { username } });

        return {
          id: user.id,
          name: user.displayName,
          username: user.username,
          role: user.role,
          displayName: user.displayName,
        };
      },
    }),
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      userinfo: {
        url: "https://api.github.com/user",
        async request({ tokens }: { tokens: { access_token?: string } }) {
          const headers = {
            Authorization: `Bearer ${tokens.access_token}`,
            "User-Agent": "provenance",
          };
          const profileResponse = await fetch("https://api.github.com/user", {
            headers,
          });
          if (!profileResponse.ok) {
            throw new Error("GitHub did not return an OAuth profile.");
          }
          const profile = (await profileResponse.json()) as GitHubProfile & {
            email_verified?: boolean;
          };

          const emailsResponse = await fetch(
            "https://api.github.com/user/emails",
            { headers },
          );
          const emails = emailsResponse.ok
            ? ((await emailsResponse.json()) as GitHubEmail[])
            : [];
          const selectedEmail = profile.email
            ? emails.find(
                (candidate) =>
                  candidate.email.toLowerCase() ===
                  profile.email?.toLowerCase(),
              )
            : (emails.find((candidate) => candidate.primary) ?? emails[0]);
          if (!profile.email && selectedEmail) {
            profile.email = selectedEmail.email;
          }
          profile.email_verified = selectedEmail?.verified === true;
          return profile;
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const providerResult = oauthProviderSchema.safeParse(account?.provider);
      if (!providerResult.success || !account) return true;

      const provider = providerResult.data;
      const cookieStore = await cookies();
      const linkToken = cookieStore.get(OAUTH_LINK_COOKIE)?.value;
      if (linkToken) {
        cookieStore.delete(OAUTH_LINK_COOKIE);
        try {
          await completeOAuthLink(linkToken, {
            provider,
            providerAccountId: account.providerAccountId,
          });
          return `/account?success=${provider}-linked`;
        } catch (error) {
          const message =
            error instanceof OAuthAccountAlreadyLinkedError ||
            error instanceof OAuthProviderAlreadyLinkedError ||
            error instanceof InvalidOAuthFlowError
              ? error.message
              : "Unable to link that provider account.";
          return `/account?error=${encodeURIComponent(message)}`;
        }
      }

      try {
        const resolution = await resolveOAuthSignIn({
          provider,
          providerAccountId: account.providerAccountId,
          email: user.email ?? null,
          emailVerified: isOAuthEmailVerified(provider, profile),
          name: user.name ?? null,
        });
        if (resolution.kind === "pending") {
          return oauthUsernamePickerPath(resolution.token);
        }
        Object.assign(user, authUser(resolution.user));
        return true;
      } catch (error) {
        if (
          error instanceof OAuthUserBannedError ||
          error instanceof OAuthAccountAlreadyLinkedError
        ) {
          return false;
        }
        throw error;
      }
    },
    async jwt({ token, user }) {
      const userId = user?.id ?? token.sub;
      if (!userId) return null;

      const currentUser = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          displayName: true,
          username: true,
          email: true,
          banned: true,
        },
      });
      if (!currentUser || currentUser.banned) return null;

      return {
        ...token,
        sub: currentUser.id,
        name: currentUser.displayName,
        email: currentUser.email,
        role: currentUser.role,
        displayName: currentUser.displayName,
        username: currentUser.username,
      };
    },
    session({ session, token }) {
      const displayName = token.displayName as string;
      const authenticatedSession: Session = {
        expires: session.expires,
        user: {
          id: token.sub!,
          name: displayName,
          email: typeof token.email === "string" ? token.email : undefined,
          image: session.user?.image,
          displayName,
          username: token.username as string,
          role: token.role as Role,
        },
      };
      return authenticatedSession;
    },
  },
} satisfies NextAuthConfig;
