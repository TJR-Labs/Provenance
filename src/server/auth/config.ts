import type { DefaultSession, NextAuthConfig, Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import type { Role } from "../../../generated/prisma";
import { verifyPassword } from "~/server/auth/password";
import { db } from "~/server/db";

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
  ],
  callbacks: {
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
          banned: true,
        },
      });
      if (!currentUser || currentUser.banned) return null;

      return {
        ...token,
        sub: currentUser.id,
        name: currentUser.displayName,
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
          email: session.user?.email,
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
