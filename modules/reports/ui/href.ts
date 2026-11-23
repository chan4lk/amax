import type { Group } from "../server/roster";

const KEEP = ["view", "band", "find"] as const;

export const groupHref = (g: Group, params: Record<string, string | undefined> = {}) => {
  const q = new URLSearchParams();
  for (const k of KEEP) if (params[k]) q.set(k, params[k]!);
  q.set("group", g);
  return `/reports?${q}`;
};
