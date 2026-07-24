"use server";

import { TRPCError } from "@trpc/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";
import { signIn, signOut } from "~/server/auth";
import { OAUTH_LINK_COOKIE, oauthProviderSchema } from "~/server/users";

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function changePasswordAction(formData: FormData) {
  let destination = "/account?success=password-changed";

  try {
    const caller = await getServerCaller();
    await caller.users.changePassword({
      currentPassword: getString(formData, "currentPassword"),
      newPassword: getString(formData, "newPassword"),
    });
  } catch (error) {
    const message =
      error instanceof TRPCError && error.code === "BAD_REQUEST"
        ? "Current password is incorrect."
        : "Unable to change password. Check all fields and try again.";
    destination = `/account?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}

export async function linkOAuthAccountAction(formData: FormData) {
  const providerResult = oauthProviderSchema.safeParse(
    getString(formData, "provider"),
  );
  if (!providerResult.success) {
    redirect("/account?error=Invalid%20OAuth%20provider.");
  }

  let token: string;
  try {
    const result = await (
      await getServerCaller()
    ).users.beginOAuthLink({ provider: providerResult.data });
    token = result.token;
  } catch {
    redirect("/account?error=Unable%20to%20start%20account%20linking.");
  }

  (await cookies()).set(OAUTH_LINK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  await signIn(providerResult.data, { redirectTo: "/account" });
}

export async function unlinkOAuthAccountAction(formData: FormData) {
  const providerResult = oauthProviderSchema.safeParse(
    getString(formData, "provider"),
  );
  if (!providerResult.success) {
    redirect("/account?error=Invalid%20OAuth%20provider.");
  }

  let destination = `/account?success=${providerResult.data}-unlinked`;
  try {
    await (
      await getServerCaller()
    ).users.unlinkOAuthAccount({ provider: providerResult.data });
  } catch (error) {
    const message =
      error instanceof TRPCError && error.code === "BAD_REQUEST"
        ? error.message
        : "Unable to unlink that provider account.";
    destination = `/account?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}

export async function setPasswordAction(formData: FormData) {
  let destination = "/account?success=password-set";
  try {
    await (
      await getServerCaller()
    ).users.setPassword({
      newPassword: getString(formData, "newPassword"),
    });
  } catch (error) {
    const message =
      error instanceof TRPCError ? error.message : "Unable to set password.";
    destination = `/account?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}

export async function requestEmailVerificationAction(formData: FormData) {
  let destination = "/account?success=verification-sent";
  try {
    await (
      await getServerCaller()
    ).users.requestEmailVerification({
      email: getString(formData, "email"),
    });
  } catch (error) {
    const message =
      error instanceof TRPCError
        ? error.message
        : "Unable to send a verification email.";
    destination = `/account?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}

export async function reauthenticateOAuthAction(formData: FormData) {
  const providerResult = oauthProviderSchema.safeParse(
    getString(formData, "provider"),
  );
  if (!providerResult.success) {
    redirect("/account?error=Invalid%20OAuth%20provider.");
  }
  await signIn(providerResult.data, {
    redirectTo: "/account?success=reauthenticated",
  });
}

export async function deleteAccountAction(formData: FormData) {
  let errorDestination: string | null = null;
  try {
    await (
      await getServerCaller()
    ).users.requestAccountDeletion({
      confirmation: getString(formData, "confirmation") as "DELETE",
      currentPassword: getString(formData, "currentPassword") || undefined,
    });
  } catch (error) {
    const message =
      error instanceof TRPCError
        ? error.message
        : "Unable to delete the account. No changes were made.";
    errorDestination = `/account?error=${encodeURIComponent(message)}`;
  }

  if (errorDestination) redirect(errorDestination);
  await signOut({ redirectTo: "/?accountDeleted=1" });
}
