import NextAuth from "next-auth";
import { cache } from "react";

import { db } from "~/server/db";
import { authConfig } from "./config";

const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(authConfig);

const auth = cache(async () => {
  const session = await uncachedAuth();
  if (!session?.user.id) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      displayName: true,
      username: true,
      banned: true,
    },
  });
  if (!user || user.banned) return null;

  return {
    ...session,
    user: {
      ...session.user,
      id: user.id,
      name: user.displayName,
      displayName: user.displayName,
      username: user.username,
      role: user.role,
    },
  };
});

export { auth, handlers, signIn, signOut };
