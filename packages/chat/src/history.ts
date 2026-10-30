import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import type { Message } from "@amax/ai";
import type { Viewer } from "@amax/auth";
import { isExpired, type PendingAction, type Pin } from "./engine";

export type ConversationSummary = { id: string; title: string; updatedAt: string; messageCount: number; pinCount: number; expiredCount: number };
export type ShownMessage = { role: "me" | "amax"; text: string };
export type RestoredAction = PendingAction & { expired: boolean };
export type Conversation = { id: string; title: string; updatedAt: string; archived: boolean; messages: ShownMessage[]; pins: Pin[]; pending: RestoredAction[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNTITLED = "Untitled chat";
const iso = (v: unknown) => new Date(v as string).toISOString();
const likePattern = (query: string) => `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Only undecided cards are restored as open or expired. A card that was confirmed or cancelled is
// in `decided`; a turn that raced the decision can leave it in `pending` too, and it must never come
// back with "Add it" or count as expired (052 review). The decision's note is in the messages.
export const openCards = (pending: PendingAction[], decided: Record<string, unknown> | null) =>
  pending.filter((p) => !decided || !(p.id in decided));

// The gateway puts the pinned records ahead of the person's first message ("Pinned context:" and its <data> blocks) for
// the model. It stays in the stored conversation, so a reopened one still has its context, but it was never typed: not shown.
const CONTEXT = "Pinned context:";
const typed = (m: Message, text: string) => text.trim() && !(m.role === "user" && text.startsWith(CONTEXT));
const textOf = (m: Message) => m.content.flatMap((b) => (b.type === "text" && typed(m, b.text) ? [b.text] : [])).join("\n");

export const shownMessages = (messages: Message[]): ShownMessage[] =>
  messages.flatMap((m) => {
    const text = textOf(m);
    return text ? [{ role: m.role === "user" ? ("me" as const) : ("amax" as const), text }] : [];
  });

const matches = (query: string) => {
  const pattern = likePattern(query);
  return sql`and (title ilike ${pattern} or exists (select 1 from jsonb_array_elements(messages) m, jsonb_array_elements(m->'content') c
    where c->>'type' = 'text' and c->>'text' ilike ${pattern}))`;
};

export async function listConversations(db: Db, viewer: Viewer, opts: { query?: string; limit?: number } = {}): Promise<ConversationSummary[]> {
  const query = opts.query?.trim();
  const rows = await withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`select id, title, updated_at, jsonb_array_length(pins) as pin_count, pending, decided,
    (select count(*) from jsonb_array_elements(messages) m where exists (select 1 from jsonb_array_elements(m->'content') c
      where c->>'type' = 'text' and btrim(c->>'text') <> ''))::int as message_count
    from chat.conversation where user_id = ${viewer.userId} and archived_at is null and jsonb_array_length(messages) > 0
    ${query ? matches(query) : sql``} order by updated_at desc limit ${Math.min(opts.limit ?? 50, 100)}`));
  return rows.map((r) => ({
    id: r.id as string,
    title: (r.title as string | null) ?? UNTITLED,
    updatedAt: iso(r.updated_at),
    messageCount: Number(r.message_count),
    pinCount: Number(r.pin_count),
    expiredCount: openCards(r.pending as PendingAction[], r.decided as Record<string, unknown>).filter((p) => isExpired(p)).length,
  }));
}

export async function getConversation(db: Db, viewer: Viewer, id: string): Promise<Conversation | null> {
  if (!UUID.test(id)) return null;
  const [row] = await withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`select id, title, updated_at, archived_at, messages, pins, pending, decided
    from chat.conversation where id = ${id} and user_id = ${viewer.userId}`));
  if (!row) return null;
  return {
    id: row.id as string,
    title: (row.title as string | null) ?? UNTITLED,
    updatedAt: iso(row.updated_at),
    archived: row.archived_at !== null,
    messages: shownMessages(row.messages as Message[]),
    pins: row.pins as Pin[],
    pending: openCards(row.pending as PendingAction[], row.decided as Record<string, unknown>).map((p) => ({ ...p, expired: isExpired(p) })),
  };
}
