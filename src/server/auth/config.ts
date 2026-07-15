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
    } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

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

        const user = await db.user.findUnique({
          where: { username: parsed.data.username.toLowerCase() },
        });

        if (
          !user ||
          !(await verifyPassword(parsed.data.password, user.passwordHash))
        ) {
          return null;
        }

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
        select: { id: true, role: true, displayName: true },
      });
      if (!currentUser) return null;

      return {
        ...token,
        sub: currentUser.id,
        name: currentUser.displayName,
        role: currentUser.role,
        displayName: currentUser.displayName,
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
          role: token.role as Role,
        },
      };
      return authenticatedSession;
    },
  },
} satisfies NextAuthConfig;
