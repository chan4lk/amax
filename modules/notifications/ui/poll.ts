"use server";

import { currentViewer } from "@amax/auth";
import type { Inbox } from "../contracts";
import { inbox } from "../server/read";

/** Read-only: the bell's list for the signed-in person, fetched again while the page stays open. */
export async function pollInbox(): Promise<{ inbox: Inbox; now: number }> {
  return { inbox: await inbox(await currentViewer(), 20, true), now: Date.now() };
}
