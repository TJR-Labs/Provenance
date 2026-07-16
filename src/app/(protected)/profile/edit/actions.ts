"use server";

import { redirect } from "next/navigation";

import { getServerCaller } from "~/server/api/caller";
import { profileSections, profileThemes } from "~/server/users";

function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item : "";
}

export async function updateProfileAction(formData: FormData) {
  const theme = profileThemes.find((item) => item === value(formData, "theme"));
  const sections = value(formData, "sections")
    .split(",")
    .filter((item): item is (typeof profileSections)[number] =>
      profileSections.includes(item as (typeof profileSections)[number]),
    );
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
    if (!theme) throw new Error("Choose a supported theme.");
    await (
      await getServerCaller()
    ).profile.update({
      displayName: value(formData, "displayName"),
      bio: value(formData, "bio"),
      school: value(formData, "school"),
      avatarUrl: value(formData, "avatarUrl"),
      links,
      theme,
      layoutSections: sections,
      customCss: value(formData, "customCss"),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update profile.";
    destination = `/profile/edit?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}
