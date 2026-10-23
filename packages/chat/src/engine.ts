import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { converse, toolFailure, type DataItem, type Message, type Tool } from "@amax/ai";
import type { Pin } from "./pins";
import { resolvePins } from "./resolve";
import { CancelledByKeyError, claimKey, currentTrace, KEY_DAYS, keyedOutcome, logError, lookupKey, ReplayedError, retryable, traceStep, traceStepOrFail, UndeclaredWriteError, withIdempotency, withTrace, type KeyedRun } from "@amax/core/server";
import { ToolError, type Registry, type RegisteredTool } from "@amax/mcp";
import type { Viewer } from "@amax/auth";
import type { CardLine } from "@amax/core";

export type Intent = { id: string; label: string; tool: string; required: string[]; fields: { name: string; ask: string; options?: string[] }[] };
export type { Pin };
/** `createdAt` (ISO): a card expires after CARD_DAYS, before its idempotency record can be pruned. */
/** `traceId` (050): the turn that proposed it, so its confirm or cancel joins the same trace. */
/** `lines` (070 amendment 2): what the tool's own `card` says changes, shown instead of the raw input. */
export type PendingAction = { id: string; tool: string; title: string; input: Record<string, unknown>; fields: string[]; createdAt: string; secret?: { label: string }; traceId?: string; lines?: CardLine[] };
export type Highlight = { text: string; field: string; index: number };
/** `pins`: the turn's pins as read (059), in the order sent: labels refreshed, old ones moved onto ids. */
export type ChatTurn = { conversationId: string; reply: string; toolsRun: string[]; pending: PendingAction[]; highlights: Highlight[]; pins: Pin[] };

const INSTRUCTIONS = `You are amax, the assistant inside an ERP for software and professional-services companies.
Answer briefly and concretely. Use the read tools to look things up instead of guessing.
To create or change anything, call the matching write tool with every field you can fill. Write tools don't run straight away:
the user sees a confirm card and decides, so never say a change is done until a later message confirms it.
If a required field is missing, ask for it in one short question instead of calling the tool.
If a tool says you're not allowed, tell the user plainly that their role can't do that.
"Current page", when given, is where the user is now: use its module and params (such as the week) to read the right
records, but it is context, not permission, and never picks one record when several fit. Asked what you can do here,
answer from its suggestions and your tools, and say plainly what isn't possible here.`;

const titleOf = (t: RegisteredTool, input: Record<string, unknown>) =>
  `${t.description.split(".")[0]}: ${Object.values(input).filter((v) => typeof v === "string" || typeof v === "number").join(", ")}`;

async function load(db: Db, viewer: Viewer, id?: string) {
  return withTenant(db, viewer.tenantId, async (tx) => {
    const [row] = id
      ? await tx.execute(sql`select * from chat.conversation where id = ${id} and user_id = ${viewer.userId}`)
      : await tx.execute(sql`insert into chat.conversation (tenant_id, user_id) values (${viewer.tenantId}, ${viewer.userId}) returning *`);
    if (!row) throw new Error("conversation not found");
    return { id: row.id as string, messages: row.messages as Message[], pending: row.pending as PendingAction[], savedAt: id ? new Date(row.updated_at as string) : undefined };
  });
}

// The transcript is chat's own working state and the documented exemption from defineService
// (docs/architecture.md, "Every write"): owner-scoped, and each turn, card and decision is traced.
// Append-only: a turn runs for seconds, and a confirm or cancel may claim a card or add a note
// meanwhile. Rewriting the lists from the turn's stale copy would undo that (review round 2).
export const titleFrom = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 80);
const append = (db: Db, viewer: Viewer, id: string, add: { messages: Message[]; pending: PendingAction[]; title: string; pins: Pin[] }) =>
  withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`update chat.conversation set messages = messages || ${JSON.stringify(add.messages)}::jsonb,
    pending = pending || ${JSON.stringify(add.pending)}::jsonb, title = coalesce(title, ${add.title}), pins = ${JSON.stringify(add.pins)}::jsonb,
    updated_at = now() where id = ${id} and user_id = ${viewer.userId}`));

// Each extracted value that appears in the user's words gets its field's colour (AC-3).
export function highlightsFor(text: string, pending: PendingAction[]): Highlight[] {
  const out: Highlight[] = [];
  for (const p of pending) {
    for (const [field, value] of Object.entries(p.input)) {
      const v = String(value);
      if (v.length < 2) continue;
      const at = text.toLowerCase().indexOf(v.toLowerCase());
      if (at >= 0) out.push({ text: text.slice(at, at + v.length), field, index: at });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

// 050: a turn, and later its cards' decisions, run under one trace acting as the user.
const traceFor = (viewer: Viewer, traceId?: string) => ({ traceId, tenantId: viewer.tenantId, actor: `user:${viewer.userId}`, source: "chat" as const });

// The gateway hands write tools the input it validated, so a field the tool doesn't declare (a
// "value" the model made up, say) never reaches the card. A tool that takes a typed secret marks the
// card, which then asks the person for it in a masked field (047 AC-4).
// A tool's own card (070 amendment 2) words it from the stored record; one that fails keeps today's card.
async function pendingFor(t: RegisteredTool, viewer: Viewer, input: Record<string, unknown>): Promise<PendingAction> {
  const card = await t.card?.(viewer as never, input as never).catch((e: unknown) => void logError(`chat.card ${t.name}`, e));
  return { id: randomUUID(), tool: t.name, title: card?.title ?? titleOf(t, input), input, fields: Object.keys(input), createdAt: new Date().toISOString(), traceId: currentTrace()?.traceId,
    ...(card ? { lines: card.lines } : {}), ...(t.secretInput ? { secret: t.secretInput } : {}) };
}

// An error from a write that was given a secret never carries it on, even if some layer echoed it.
function scrub(e: unknown, secret: string | undefined): unknown {
  if (!secret || !(e instanceof Error) || !`${e.message}${e.stack ?? ""}`.includes(secret)) return e;
  const clean = new Error(e.message.split(secret).join("••••"));
  return Object.assign(clean, { name: e.name, retryable: (e as { retryable?: unknown }).retryable, code: (e as { code?: unknown }).code });
}

const NOT_PROPOSED = { status: "not_proposed", note: "No confirm card was made: amax couldn't record the request. Tell the user it didn't go through and to try again shortly." };
// 043 AC-1: a card's write runs keyed to the tool's declared service, so a tool without one can't be
// made safe to confirm and never becomes a card.
const serviceNames = (t: RegisteredTool | undefined) => [t?.service ?? []].flat().map((s) => s.spec.name);
const UNDECLARED = { status: "not_proposed", note: "No confirm card was made: this change can't be confirmed in chat yet. Tell the user." };

// A write tool's own check at proposal time (053): its ToolError message goes to the model, and no
// card is made, so the person never types a value for a write that is bound to be refused.
async function proposeCheck(t: RegisteredTool, viewer: Viewer, input: Record<string, unknown>) {
  try {
    await t.propose?.(viewer as never, input as never);
    return null;
  } catch (e) {
    if (e instanceof ToolError && e.code === "invalid_input") return { status: "not_proposed", note: `No confirm card was made: ${e.message}.` };
    throw e;
  }
}

/** One user message: answer with read tools, turn write calls into confirm cards. */
/** `page` (070 amendment 4): the page the user is on, as the host matched it; context for the model, never permission. */
export type TurnPage = { module: string; page: string; label: string; params: Record<string, string>; suggestions: { label: string; prompt: string }[] };
export const chatTurn = (db: Db, registry: Registry, viewer: Viewer, opts: { conversationId?: string; text: string; pins?: Pin[]; intent?: Intent; page?: TurnPage }): Promise<ChatTurn> =>
  withTrace(traceFor(viewer), () => runTurn(db, registry, viewer, opts));

async function runTurn(db: Db, registry: Registry, viewer: Viewer, opts: { conversationId?: string; text: string; pins?: Pin[]; intent?: Intent; page?: TurnPage }): Promise<ChatTurn> {
  const convo = await load(db, viewer, opts.conversationId);
  await traceStep({ kind: "turn", recordId: convo.id, detail: { pins: opts.pins?.length ?? 0, intent: opts.intent?.id ?? null } });
  const pending: PendingAction[] = [];
  const tools: Tool[] = registry.toolsFor(viewer).map((t) => ({
    name: t.name,
    description: t.description,
    input: t.input,
    sensitive: t.sensitive,
    run: async (input: Record<string, unknown>) => {
      if (t.scope !== "write") return registry.call(viewer, t.name, input, { source: "chat" });
      if (!serviceNames(t).length) return UNDECLARED;
      const refused = await proposeCheck(t, viewer, input);
      if (refused) return refused;
      // The step comes first (053): a card is shown only once its pending step is in the trace, so a
      // step that can't be written means nothing was proposed, and the model is told exactly that.
      const action = await pendingFor(t, viewer, input);
      if (!(await traceStep({ kind: "pending", tool: t.name, args: input, detail: { actionId: action.id } }))) return NOT_PROPOSED;
      pending.push(action);
      return { status: "awaiting_confirmation", note: "The user now sees a confirm card for this. Don't say it's done." };
    },
  }) as Tool);

  // Pinned records are fetched with the user's own permissions and sent as quoted data (AC-4), each
  // under its label as it is now (059). A record, not text, so the gateway redacts its classified
  // fields like any other record.
  const resolved = await resolvePins(registry, viewer, opts.pins ?? [], convo.savedAt);
  const data: DataItem[] = [...(opts.page ? [{ label: "Current page", record: opts.page }] : []),
    ...resolved.map((r) => ({ label: r.pin.label, record: r.record, ...(r.tool ? { sensitive: r.tool.sensitive } : {}) }))];
  const pins = resolved.map((r) => r.pin);

  const intentNote = opts.intent
    ? `\n\nThe user started "${opts.intent.label}". Fill the ${opts.intent.tool} tool; required: ${opts.intent.required.join(", ")}. Questions to use when something is missing: ${opts.intent.fields.map((f) => `${f.name}: ${f.ask}`).join(" | ")}.`
    : "";
  const messages: Message[] = [...convo.messages, { role: "user", content: [{ type: "text", text: opts.text }] }];
  const result = await converse({ tenantId: viewer.tenantId, caller: `user:${viewer.userId}`, userId: viewer.userId, conversationId: convo.id, source: "chat", purpose: opts.intent ? `chat:${opts.intent.id}` : "chat" }, {
    instructions: INSTRUCTIONS + intentNote,
    messages,
    tools,
    data,
  });
  await append(db, viewer, convo.id, { messages: result.messages.slice(convo.messages.length), pending, title: titleFrom(opts.text), pins });
  return { conversationId: convo.id, reply: result.text, toolsRun: result.toolsRun.filter((n) => !pending.some((p) => p.tool === n)), pending, highlights: highlightsFor(opts.text, pending), pins };
}

/** What happened to a card: confirmed (the write ran), cancelled, failed for good, or unknown. */
export type Decision = "confirmed" | "cancelled" | "failed" | "unknown" | "expired";

/**
 * The card isn't pending: `decision` says what happened to it earlier (perhaps by a request whose
 * reply was lost), or is null when this conversation never had that action.
 */
export class NotPendingError extends Error {
  constructor(public decision: Decision | null) {
    super(decision ? `that action was already ${decision}` : "that action isn't in this conversation");
    this.name = "NotPendingError";
  }
}

/**
 * The write didn't complete. `retry`: nothing was written and the card is still there. `failed`: it
 * can't succeed, the card is closed. `unknown`: whether it was done can't be told, the card is closed
 * and the user is asked to check before trying again (never a blind retry).
 */
export class ActionFailedError extends Error {
  constructor(message: string, public kind: "retry" | "failed" | "unknown") {
    super(message);
    this.name = "ActionFailedError";
  }
}

// Each card's write runs under its own idempotency key (core/idempotency.ts has the contract). The
// stored outcome is checked first; the tool must make exactly one service write; an error is
// resolved by reading the key back, so a write that committed is reported as done, never retried;
// cancel claims the same key, so cancel and confirm can't both win (review rounds 7 and 8).
const keyOf = (actionId: string) => `chat:${actionId}`;

async function card(db: Db, viewer: Viewer, conversationId: string, actionId: string) {
  const [row] = await withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`select pending, decided from chat.conversation where id = ${conversationId} and user_id = ${viewer.userId}`));
  if (!row) throw new Error("conversation not found");
  const action = (row.pending as PendingAction[]).find((p) => p.id === actionId);
  if (!action) throw new NotPendingError((row.decided as Record<string, Decision>)[actionId] ?? null);
  return action;
}

// Records the decision once: takes the card out of pending (if it's still there) and adds a note.
// An unknown outcome also replaces a cancel that lost the race: a card that may have been written
// never reads "Cancelled. Nothing was changed." (043 AC-3).
async function settle(tx: Tx, viewer: Viewer, conversationId: string, action: PendingAction, decision: Decision, text: string) {
  const [row] = await tx.execute(sql`select pending, decided from chat.conversation where id = ${conversationId} and user_id = ${viewer.userId} for update`);
  const pending = (row?.pending ?? []) as PendingAction[];
  const overCancel = decision === "unknown" && (row?.decided as Record<string, Decision> | undefined)?.[action.id] === "cancelled";
  if (!pending.some((p) => p.id === action.id) && !overCancel) return;
  await tx.execute(sql`update chat.conversation set pending = ${JSON.stringify(pending.filter((p) => p.id !== action.id))}::jsonb,
    decided = decided || ${JSON.stringify({ [action.id]: decision })}::jsonb,
    messages = messages || ${JSON.stringify([{ role: "user", content: [{ type: "text", text }] }])}::jsonb, updated_at = now() where id = ${conversationId}`);
}

const settleNow = (db: Db, viewer: Viewer, conversationId: string, action: PendingAction, decision: Decision, text: string) =>
  withTenant(db, viewer.tenantId, (tx) => settle(tx, viewer, conversationId, action, decision, text));

const UNKNOWN = "I can't tell whether this was done. Check the record before trying again.";

// A card can be confirmed for CARD_DAYS. Its idempotency record lives KEY_DAYS from the attempt, so
// while a card can still be confirmed, the record of any earlier attempt still exists: a pruned
// record can never be mistaken for "never written" (review round 9).
// Fail closed: a card without a readable createdAt counts as expired (migration 0015 backfilled the
// cards stored before it). Once expired, a missing record can mean "never confirmed" or "confirmed,
// record pruned", so an expired card never claims nothing happened (review rounds 9 and 10).
export const CARD_DAYS = KEY_DAYS - 1;
export const isExpired = (a: PendingAction, now = Date.now()) => {
  const at = Date.parse(a.createdAt ?? "");
  return Number.isNaN(at) || now - at > CARD_DAYS * 86_400_000;
};
const expire = async (db: Db, viewer: Viewer, conversationId: string, action: PendingAction) => {
  await settleNow(db, viewer, conversationId, action, "expired", `(The request "${action.title}" expired. If it was confirmed earlier, check the record before asking again.)`);
  return new NotPendingError("expired");
};

// What the conversation records about a write: the record's key, never the result itself, which
// may hold classified fields and is read back by the model (review round 9).
const doneNote = (title: string, result: unknown) => {
  const key = (result as { key?: unknown } | null)?.key;
  return `(I confirmed "${title}".${typeof key === "string" ? ` Record: ${key}.` : ""})`;
};

// The decided step says what the person chose and what came of it: `run` just before the write runs
// (so the timeline reads decided, then the tool call), otherwise why it didn't run. The trace is
// immutable, so a confirm that never took effect must never read as a plain confirm (052 review).
// A cancel is recorded once it has taken effect. Every decided step is best-effort except `run`
// (traceStepOrFail): it is written before the write, so a write never runs untraced (053).
export type ConfirmOutcome = "run" | "already_done" | "already_cancelled" | "expired" | "needs_secret";
const decidedStep = (action: PendingAction, decision: "confirmed" | "cancelled", outcome?: ConfirmOutcome) => {
  const step = { kind: "decided" as const, tool: action.tool, detail: { actionId: action.id, decision, ...(outcome ? { outcome } : {}) } };
  return outcome === "run" ? traceStepOrFail(step) : traceStep(step);
};
const inTrace = <T>(viewer: Viewer, action: PendingAction, fn: () => Promise<T>) => withTrace(traceFor(viewer, action.traceId), fn);

/** "Add it": run the pending write as the user, source chat (AC-3), at most once per card. */
export async function confirmAction(db: Db, registry: Registry, viewer: Viewer, conversationId: string, actionId: string, opts: { secret?: string } = {}) {
  const action = await card(db, viewer, conversationId, actionId);
  return inTrace(viewer, action, () => confirmCard(db, registry, viewer, conversationId, action, opts));
}

async function confirmCard(db: Db, registry: Registry, viewer: Viewer, conversationId: string, action: PendingAction, opts: { secret?: string }) {
  const actionId = action.id;
  const key = keyOf(actionId);
  const by = viewer.userId;
  const done = async (result: unknown) => {
    await settleNow(db, viewer, conversationId, action, "confirmed", doneNote(action.title, result));
    return { action, result };
  };
  const cancelled = async () => {
    await settleNow(db, viewer, conversationId, action, "cancelled", `(I cancelled "${action.title}".)`);
    return new NotPendingError("cancelled");
  };
  const unknown = async (why: string) => {
    await settleNow(db, viewer, conversationId, action, "unknown", `(I tried "${action.title}" but ${why}; check before trying again.)`);
    return new ActionFailedError(UNKNOWN, "unknown");
  };
  // 1. An earlier attempt's outcome comes first (its reply may have been lost). The one lookup: the
  // service itself only meets a record a concurrent attempt settled, and throws it (043 AC-4).
  const known = await lookupKey(db, viewer.tenantId, key, by);
  const decide = (outcome: ConfirmOutcome) => decidedStep(action, "confirmed", outcome);
  if (known && "cancelled" in known) {
    await decide("already_cancelled");
    throw await cancelled();
  }
  if (known) {
    await decide("already_done");
    return done(known.done);
  }
  if (isExpired(action)) {
    await decide("expired");
    throw await expire(db, viewer, conversationId, action);
  }
  // 2. Run the tool, keyed to its declared service: it makes exactly that one write or none (043 AC-1).
  if (action.secret && !opts.secret) {
    await decide("needs_secret");
    throw new ActionFailedError(`type the ${action.secret.label.toLowerCase()} first`, "retry");
  }
  const service = serviceNames(registry.all.find((t) => t.name === action.tool));
  if (!service.length) {
    await settleNow(db, viewer, conversationId, action, "failed", `(I couldn't run "${action.title}": it can't be confirmed in chat.)`);
    throw new ActionFailedError("this change can't be confirmed in chat", "failed");
  }
  await decide("run");
  const raw = await withIdempotency(key, () => registry.call(viewer, action.tool, action.input, { source: "chat", secret: action.secret ? opts.secret : undefined }), { service, by });
  const run = raw.ok ? raw : { ...raw, error: scrub(raw.error, opts.secret) };
  if (run.writes > 1) throw await unknown("it made more than one change");
  if (run.ok) {
    if (run.writes === 1 && run.nested === 0) return done(run.value);
    throw await unknown(run.writes === 1 ? "part of it may not have finished" : "couldn't confirm what it changed");
  }
  return failedRun(db, viewer, conversationId, action, run, { done, cancelled, unknown });
}

type Endings = { done: (result: unknown) => Promise<{ action: PendingAction; result: unknown }>; cancelled: () => Promise<NotPendingError>; unknown: (why: string) => Promise<ActionFailedError> };

// 3. It threw. Fail closed (043 AC-3): a stored outcome decides first; a retry is offered only when the
// declared service was reached once, wrote nothing nested, and its key holds no outcome; a refusal
// before anything ran (the registry's check, an undeclared service) is failed; anything else is unknown.
async function failedRun(db: Db, viewer: Viewer, conversationId: string, action: PendingAction, run: Extract<KeyedRun<unknown>, { ok: false }>, end: Endings) {
  const key = keyOf(action.id);
  const thrown = keyedOutcome(run.error);
  if (thrown instanceof CancelledByKeyError) throw await end.cancelled();
  if (thrown instanceof ReplayedError) {
    if (thrown.key === key) return end.done(thrown.replay);
    throw await end.unknown("part of it had already been done");
  }
  const after = await lookupKey(db, viewer.tenantId, key, viewer.userId);
  if (after && "done" in after) return end.done(after.done);
  if (after) throw await end.cancelled();
  if (run.nested > 0) throw await end.unknown("part of it may have been done");
  const message = run.error instanceof Error ? run.error.message : String(run.error);
  const refusedBeforeRun = run.writes === 0 && (run.error instanceof ToolError || run.error instanceof UndeclaredWriteError);
  if (run.writes === 0 && !refusedBeforeRun) throw await end.unknown("couldn't confirm what it changed");
  if (run.writes === 1 && retryable(run.error)) throw new ActionFailedError(message, "retry");
  // The note is read back by the model: the failure kind and a reference, never the message (final review).
  await settleNow(db, viewer, conversationId, action, "failed", `(I tried "${action.title}" but ${toolFailure(action.tool, run.error, logError(`chat.confirm ${action.tool}`, run.error))})`);
  throw new ActionFailedError(message, "failed");
}

/** "Cancel": nothing is written. Cancelling twice is fine; a card that was already decided otherwise throws NotPendingError. */
export async function cancelAction(db: Db, viewer: Viewer, conversationId: string, actionId: string) {
  const action = await card(db, viewer, conversationId, actionId).catch((e) => {
    if (e instanceof NotPendingError && e.decision === "cancelled") return null;
    throw e;
  });
  if (!action) return;
  await inTrace(viewer, action, async () => {
    await cancelCard(db, viewer, conversationId, action);
    await decidedStep(action, "cancelled");
  });
}

async function cancelCard(db: Db, viewer: Viewer, conversationId: string, action: PendingAction) {
  const actionId = action.id;
  // The same expiry rule as confirm: past it, the key may have been pruned, so claiming it as
  // cancelled could hide a write that happened (review round 10).
  if (isExpired(action)) {
    const known = await lookupKey(db, viewer.tenantId, keyOf(actionId), viewer.userId);
    if (known && "done" in known) {
      await settleNow(db, viewer, conversationId, action, "confirmed", doneNote(action.title, known.done));
      throw new NotPendingError("confirmed");
    }
    throw await expire(db, viewer, conversationId, action);
  }
  const prior = await withTenant(db, viewer.tenantId, async (tx) => {
    const prior = await claimKey(tx, viewer.tenantId, keyOf(actionId), { cancelled: true }, viewer.userId);
    if (!prior || "cancelled" in prior) await settle(tx, viewer, conversationId, action, "cancelled", `(I cancelled "${action.title}".)`);
    return prior;
  });
  if (prior && "done" in prior) {
    // The write had already run (its reply may have been lost): record it as done.
    await settleNow(db, viewer, conversationId, action, "confirmed", doneNote(action.title, prior.done));
    throw new NotPendingError("confirmed");
  }
}
