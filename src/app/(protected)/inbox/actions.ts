"use server";

import { getServerCaller } from "~/server/api/caller";

export async function markInboxReadAction() {
  await (await getServerCaller()).message.markAllRead();
}
