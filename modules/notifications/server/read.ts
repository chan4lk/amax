import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { entityZone } from "@amax/workflows";
import { CATEGORIES, DEFAULT_PREFERENCE, unreadCount, type Category, type Inbox, type InboxItem, type PinRef, type Preferences } from "../contracts";
import { read } from "./context";

const COLUMNS = sql`id, module, module_title, category, urgency, title, body, href, created_at, read_at`;

function itemOf(r: Record<string, unknown>): InboxItem {
  const id = r.id as string;
  const pin: PinRef = { label: r.title as string, tool: "get_notification", args: { id } };
  return {
    id, module: r.module as string, moduleTitle: r.module_title as string, category: r.category as Category, urgent: r.urgency === "urgent",
    title: r.title as string, body: (r.body as string | null) ?? null, href: (r.href as string | null) ?? null, pin,
    createdAt: new Date(r.created_at as string).toISOString(), read: r.read_at !== null,
  };
}

export const inbox = (viewer: Viewer, limit = 20, unreadOnly = false): Promise<Inbox> => read(viewer, async (tx) => {
  const rows = await tx.execute(sql`select ${COLUMNS} from notifications.notification where user_id = ${viewer.userId}
    ${unreadOnly ? sql`and read_at is null` : sql``} order by read_at is not null, created_at desc limit ${limit}`);
  const groups = new Map<string, Inbox["groups"][number]>();
  for (const item of rows.map(itemOf)) {
    const g = groups.get(item.module) ?? { module: item.module, title: item.moduleTitle, items: [] };
    g.items.push(item);
    groups.set(item.module, g);
  }
  return { unread: await unreadCount(tx, viewer), groups: [...groups.values()] };
});

/** One of the viewer's own notifications; null for anyone else's. */
export const notification = (viewer: Viewer, id: string) => read(viewer, async (tx) => {
  const [r] = await tx.execute(sql`select ${COLUMNS} from notifications.notification where id = ${id} and user_id = ${viewer.userId}`);
  return r ? itemOf(r) : null;
});

export const preferences = (viewer: Viewer): Promise<Preferences> => read(viewer, async (tx) => {
  const rows = await tx.execute(sql`select category, email, teams, digest from notifications.preference where user_id = ${viewer.userId}`);
  const [q] = await tx.execute(sql`select to_char(starts, 'HH24:MI') as starts, to_char(ends, 'HH24:MI') as ends from notifications.quiet_hours where user_id = ${viewer.userId}`);
  const [u] = await tx.execute(sql`select e.id, e.name from auth.user u left join core.legal_entity e on e.id = u.legal_entity_id where u.id = ${viewer.userId}`);
  const categories = CATEGORIES.map((c) => {
    const r = rows.find((x) => x.category === c.id);
    return { category: c.id, title: c.title, ...(r ? { email: r.email as boolean, teams: r.teams as boolean, digest: r.digest as boolean } : DEFAULT_PREFERENCE) };
  });
  return { categories, quietHours: q ? { starts: q.starts as string, ends: q.ends as string } : null,
    zone: await entityZone(tx, (u?.id as string | null) ?? null), entity: (u?.name as string | null) ?? null };
});
