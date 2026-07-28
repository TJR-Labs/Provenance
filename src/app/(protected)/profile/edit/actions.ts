"use server";

import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";

function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item : "";
}

export async function updateProfileAction(formData: FormData) {
  const links = value(formData, "links")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("|");
      return separator === -1
        ? { label: line, url: line }
        : {
            label: line.slice(0, separator).trim(),
            url: line.slice(separator + 1).trim(),
          };
    });

  let destination = "/profile/edit?success=1";
  try {
    // profile.update returns the acting user (including username), so the
    // success redirect target needs no extra session round trip.
    const updated = await (
      await getServerCaller()
    ).profile.update({
      displayName: value(formData, "displayName"),
      bio: value(formData, "bio"),
      school: value(formData, "school"),
      avatarUrl: value(formData, "avatarUrl"),
      links,
      customCss: value(formData, "customCss"),
      private: value(formData, "private") === "on",
    });
    // Drop the user back on their live profile with a transient save flag,
    // instead of leaving them mid-edit.
    destination = `/${encodeURIComponent(updated.username)}?saved=1`;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update profile.";
    destination = `/profile/edit?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}
