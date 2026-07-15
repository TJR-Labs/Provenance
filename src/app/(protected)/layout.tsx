import { redirect } from "next/navigation";

import { auth } from "~/server/auth";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await auth())) {
    redirect("/login");
  }

  return children;
}
