"use server";

import { revalidatePath } from "next/cache";
import { isRole, setViewAs } from "@amax/auth";
import { signOut } from "../../auth";
import { getDb } from "../../lib/server";
import { profileOf } from "../../lib/profile";
import { sameUser } from "../../lib/same-user";
import { getViewer } from "../../lib/viewer";

export async function viewAsAction(role: string | null, as?: string) {
  const viewer = await getViewer();
  if (!viewer) throw new Error("not signed in");
  sameUser(viewer, as);
  if (role !== null && !isRole(role)) throw new Error(`unknown role ${role}`);
  await setViewAs(getDb()!, viewer, role);
  revalidatePath("/", "layout");
}

/** 070 AC-54: who this browser's session belongs to now; a tab compares it with the user it was rendered for. */
export async function currentIdentity(): Promise<{ userId: string; name: string } | null> {
  const viewer = await getViewer();
  return viewer ? { userId: viewer.userId, name: profileOf(viewer).name } : null;
}

export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}
