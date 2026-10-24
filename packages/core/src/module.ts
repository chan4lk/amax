import type { ComponentType } from "react";
import type { z } from "zod";
import type { Tx } from "@amax/db";
import type { IconName } from "@amax/ui";
import type { Sensitivity } from "./audit";
import type { OverviewPart, OverviewQuery } from "./overview";

/** What a screen receives: route params (":key" segments), query params (optional, 041) and the signed-in viewer (null in the guest preview). */
export type ScreenProps = { params: Record<string, string>; searchParams?: Record<string, string>; viewer: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/**
 * `mount` (051) serves the route under another module's URL space, e.g. allocations' Team section at
 * /delivery/p/:key/team. That module's ":read" still gates the URL, a mounted route wins over the
 * owner's route with the same path (the owner's is the fallback when the contributor is switched
 * off), and the contributor gets no import edge to the owner.
 */
export type ModuleRoute = { path: string; title: string; mount?: string; component: ComponentType<ScreenProps> | ComponentType<any> };

export type JobContext = { tx: Tx; tenantId: string; payload: Record<string, unknown>; jobId: string };
export type JobDef = {
  /** Unique across modules: "<module>.<job>". */
  name: string;
  /** Five-field cron, UTC. Omit for jobs only scheduled on demand with scheduleJob(). */
  cron?: string;
  run: (ctx: JobContext) => Promise<void>;
};

export type EventContext = { tx: Tx; tenantId: string; event: { id: string; name: string; payload: Record<string, unknown> } };
export type EventHandlerDef = {
  /** Stable id; together with the event id it makes delivery idempotent. */
  id: string;
  event: string;
  handle: (ctx: EventContext) => Promise<void>;
};

/** Who a notification rule reaches (030 AC-1): everyone holding a role, the person a payload field names
 * (the record's owner), or the approver chain of the person a payload field names (their manager, else Admins). */
/**
 * `approvers`: the subject's managers who could approve, else the Admins. 072: `projects` (a payload field holding
 * project ids) adds everyone who holds the rule's permission on one of them; `entity` (a payload field holding the
 * subject's legal entity) keeps every approver within it. Both optional; without them the rule is unchanged.
 */
export type NotificationRecipient = { role: string } | { owner: string } | { approvers: string; projects?: string; entity?: string };

/**
 * A notification rule (030 AC-1), plain data in the emitting module's manifest. The notifications module
 * turns the event into messages; modules never send any themselves. Templates fill `{field}` from the
 * event payload, and `{field|name}` turns a user id into the person's name. A field the emitter declared
 * as a 002 class (or didn't declare) shows as "•••" unless the recipient may see that class.
 */
export type NotificationRule = {
  /** Unique across modules: "<module>.<rule>". */
  id: string;
  event: string;
  /** Payload values the event must carry for the rule to fire, e.g. { status: "rolled-back" }. */
  when?: Record<string, string | number | boolean>;
  category: "approvals" | "releases" | "reminders";
  /** Urgent items skip the digest; they still wait for quiet hours. */
  urgency?: "normal" | "urgent";
  to: NotificationRecipient[];
  /** A recipient must hold this permission, on the record the `scope` payload fields describe (its data scope). */
  permission?: string;
  scope?: Record<string, string>;
  /** The payload field naming the person the record is about, for the masking rules ("self" sees their own pay). */
  subject?: string;
  /** A payload field naming who acted ("by"): they are not told about their own action. */
  except?: string;
  title: string;
  body?: string;
  /** Where the item links: the record's screen, which takes focus when the link is followed. */
  href?: string;
};

export type SharedFixtures = {
  tenant: { id: string; name: string };
  today: string;
  entities: { id: string; key: string; name: string; country: string; baseCurrency: string; headcount: number }[];
  departments: Record<string, number>;
  people: {
    key: string; name: string; initials: string; title: string; entity: string; roles: string[];
    manager?: string; status: "active" | "left" | "joining"; joined?: string; left?: string; probationEnds?: string;
  }[];
  projects: { key: string; name: string; client: string; manager: string; billing: "fixed" | "t&m" | "retainer"; contractValue: string; invoiced: string; currency: string }[];
};

/** A module's fixtures: seeds its own tables for the shared tenant, inside a tenant-scoped transaction. */
export type FixtureSeed = (ctx: { tx: Tx; tenantId: string; shared: SharedFixtures }) => Promise<void>;

/** An MCP tool (004). `run` gets the signed-in viewer from @amax/auth (opaque here) and validated input. */
/** What a write tool names as its service: a defineService result. */
export type ToolService = { spec: { name: string } };

export type CardLine = { label: string; value: string };
export type ChatSuggestion = { routes: string[]; label: string; prompt: string; tool: string; when?: (viewer: never, params: Record<string, string>) => Promise<boolean> };
export type ToolCard = { title: string; lines: CardLine[] };

export type McpToolDef = {
  name: string;
  description: string;
  input: z.ZodType;
  /** The permission the viewer needs (checked with canEver up front; the service checks scope again). */
  permission: string;
  scope: "read" | "write" | "sensitive";
  readOnly?: boolean;
  destructive?: boolean;
  /** Classified fields in the result (002 classes), so the AI gateway can redact them per tenant policy. */
  sensitive?: Partial<Record<string, Sensitivity>>;
  /**
   * A value only a person types, into a masked field on chat's confirm card (047 AC-4). It is never
   * part of `input`, so the model can neither see nor fill it; `run` gets it as `secret`.
   */
  secretInput?: { label: string };
  run: (viewer: never, input: never, source: "mcp" | "chat" | "api", secret?: string) => Promise<unknown>;
  /**
   * A write tool's one service, the defineService result it calls (043 AC-1); a list when the input
   * picks one of several, still one write per call. Chat makes a confirm card only for a write tool
   * that names one and runs it with the key scoped to it. Every write tool says: `null` is a write
   * that can't be one keyed call, so it is never confirmed in chat. The registry refuses a write tool
   * that leaves it out.
   */
  service?: ToolService | readonly ToolService[] | null;
  /**
   * A write tool's check when chat proposes its card, before the person types anything (053). Throw
   * a ToolError (code invalid_input) to refuse the card; its message is what the model is told.
   */
  propose?: (viewer: never, input: never) => Promise<void>;
  /**
   * What a write tool's confirm card says, in the person's words (070 amendment 2): a title and labelled
   * lines read from the stored record. Without it, the card shows the description and the raw input.
   */
  card?: (viewer: never, input: never) => Promise<ToolCard>;
  /** How a pin on this read tool names what it shows (059); the registry checks it at startup. */
  pin?: PinSpec;
};

/**
 * A pin names one record by its stable id, never by a name or key that can be renamed (059).
 * `id`: the input field holding the record's UUID; the registry refuses a spec whose field isn't one.
 * `of`: reads the record's id, current label and, where a key can be reused, when it was made, from
 * the tool's result, or null when there is no such record. `"view"`: a list, a total or a period,
 * with no record behind it to rename, so its label never changes.
 */
export type PinSpec = { id: string; of: (result: never) => PinnedRecord | null } | "view";
export type PinnedRecord = { id: string; label: string; createdAt?: string | null };

/**
 * One retention rule (032 AC-1): the data class (002 classes, or "personal" for identifying data
 * such as names), the period as an ISO 8601 duration ("P7Y"), what starts the clock, and what
 * happens when it runs out. The clock starts at the earliest set timestamp among the row's own
 * `start.at` columns, or once the row has gone `start.idle` without a change to its `updated_at`,
 * whichever comes first. Columns of the retained row, so there's no event-to-row mapping to get
 * wrong; a test checks they exist (review rounds 3 and 4).
 */
export type RetentionEntry = {
  table: string;
  fields: string[];
  class: Sensitivity | "personal";
  period: `P${string}`;
  start: { at: string[]; idle?: `P${string}` };
  action: "delete" | "anonymise";
  /** What the Data retention screen calls it, e.g. "Leavers' HR record". */
  label?: string;
  /** Columns naming the person or matter a row is about (a user id, an hr.person id, "user:<id>", a
   * project id). Legal holds and access and erasure requests find rows through them. */
  subject?: string[];
  /** Free-text columns holding the person's name where no id column names them (an owner_name on a
   * sales task). Requests and holds match them case-insensitively against the person's name. */
  subjectName?: string[];
  /** The shortest period a tenant may set, for rows kept for security rather than for a person (the
   * inbound webhook dedupe that stops replays). Tenant periods never go below it (review 058). */
  minimum?: `P${string}`;
  /** The row's legal entity column, so each entity's statutory minimum applies to its own rows. */
  entity?: string;
};

/** Every field of an event payload with its 002 class, or "plain" for a field safe to send outside. */
export type PayloadFields = Record<string, Sensitivity | "plain">;

/** Declares a payload type's fields; the compiler requires every field of `T`, so a new one can't go out undeclared. */
export const declarePayload = <T>(fields: Record<keyof T & string, Sensitivity | "plain">): PayloadFields => fields;

/** A country pack's statutory minimum (032 AC-2): no tenant may keep this class for less. */
export type StatutoryMinimum = { country: string; class: Sensitivity | "personal"; period: `P${string}`; reason: string };

/**
 * One line of the Overview's Agent activity feed (008 AC-4). `by` names who did it, e.g. "Claude for
 * Nimal" or "specclaw"; `agent` marks an agent or service acting (shown in the agent colour). `pin`
 * resolves through the module's read tool to this line.
 */
export type ActivityItem = { id: string; at: string; by: string; agent: boolean; text: string; detail: string | null; pin: { label: string; tool: string; args: Record<string, unknown> } };

/** A webhook 035 verified and deduplicated (008), handed to every module that takes its provider. */
export type InboundEvent = { tenantId: string; provider: string; eventId: string; headers: Headers; payload: unknown };

/** A search hit for the built-in `search` tool and the chat. */
export type SearchHit = { type: string; id: string; title: string; url?: string; summary?: string };

/**
 * An extra screen of a module (041). It sits in the rail under its module's group, or under its own
 * `group`. With `parent: "settings"` it is a Settings hub card instead (038): `blurb` is the card's
 * one line, and `status` returns its status line for the viewer.
 */
export type NavEntry = {
  path: string;
  title: string;
  icon: IconName;
  group?: "Work" | "People" | "Business" | "Operations";
  parent?: "settings";
  blurb?: string;
  status?: (viewer: never) => Promise<string>;
};

export type ModuleManifest = {
  id: string;
  title: string;
  icon: IconName;
  group: "Work" | "People" | "Business" | "Operations";
  order?: number;
  primary?: boolean;
  /** Extra rail entries beyond the module's root (041): e.g. Proposals and Releases under delivery. */
  nav?: NavEntry[];
  dependsOn?: string[];
  integratesWith?: string[];
  permissions?: string[];
  /**
   * Which roles get which permissions. A permission may carry a data-scope qualifier:
   * "time:approve@managed" (projects the viewer manages), "@assigned" (managed or assigned),
   * "@own" (the viewer's own records). Admin holds every permission. Nav needs "<id>:read".
   */
  grants?: Partial<Record<"Admin" | "ITAdmin" | "Leadership" | "PM" | "Engineer" | "Finance" | "Sales" | "HR" | "Payroll" | "Employee", string[]>>;
  routes: ModuleRoute[];
  mcpTools?: McpToolDef[];
  /**
   * Contributes to the signed-in viewer's data scopes at load time (002 AC-3): e.g. delivery returns
   * the projects a user manages, so "@managed" grants work for real users, not just in tests.
   */
  viewerScopes?: (tx: Tx, user: { tenantId: string; userId: string }) => Promise<{ managedProjects?: string[]; assignedProjects?: string[]; reports?: string[] }>;
  /** Retention for tables holding personal data, in the 032 AC-1 shape so it can be enforced. */
  retention?: RetentionEntry[];
  /** Country packs' statutory minimum periods per class (032 AC-2). */
  statutory?: StatutoryMinimum[];
  /** Ids this module knows a signed-in person by (an hr.person id, say), for access and erasure (032 AC-4). */
  subjectIds?: (tx: Tx, userId: string) => Promise<string[]>;
  /** Contributes the newest lines to the Overview's Agent activity feed (008 AC-4). */
  activity?: (viewer: never, limit: number) => Promise<ActivityItem[]>;
  /** Contributes tickets, waiting decisions and panels to the Overview (068). Return only what the viewer may read. */
  overview?: (viewer: never, query: OverviewQuery) => Promise<OverviewPart>;
  /** Verified inbound webhooks this module acts on (008: GitHub and Azure DevOps pushes). */
  inbound?: { providers: readonly string[]; handle: (e: InboundEvent) => Promise<void> };
  /** Contributes results to the built-in `search` tool. */
  search?: (viewer: never, query: string) => Promise<SearchHit[]>;
  chatIntents?: unknown[];
  /**
   * What chat offers on this module's pages (070 amendment 4): shown only when the viewer may use `tool` and
   * `when` (if any) passes for the page's route params. A suggestion fills the message box; it never sends.
   */
  chatSuggestions?: ChatSuggestion[];
  /** A short label for a page's params in chat's header, e.g. "Week of Oct 12" for a week. */
  pageLabel?: (params: Record<string, string>) => string | null;
  jobs?: JobDef[];
  /** Durable workflows (029): defineWorkflow() results from @amax/workflows, opaque to core. */
  workflows?: readonly unknown[];
  /** Cron schedules (029): cron() results from @amax/workflows, opaque to core. */
  schedules?: readonly unknown[];
  /** Agent suggestion kinds (006): defineSuggestionKind() results from @amax/agents, opaque to core. */
  suggestions?: readonly unknown[];
  /** Notification rules for the events this module emits (030). */
  notifications?: NotificationRule[];
  /** Where the module's root screen is reached: the rail (default) or the profile menu (030's preferences). */
  menu?: "rail" | "profile";
  /** A control the module adds to the top bar for the signed-in viewer (030's bell). */
  topBar?: ComponentType<{ viewer: unknown }>;
  /** `payloads`: each emitted event's fields with their 002 class or "plain" (declarePayload). Outgoing
   * webhooks send a declared plain field, mask a classified one and mask any field not declared (035, review 058). */
  events?: {
    emits?: string[];
    handles?: EventHandlerDef[];
    payloads?: Record<string, PayloadFields>;
    /** Handlers built from every installed manifest (030 turns other modules' notification rules into handlers). */
    handlesFrom?: (modules: ModuleManifest[]) => EventHandlerDef[];
  };
  fixtures?: FixtureSeed[];
};

/** A column that records who: an id, actor or name of a person (060 AC-2). */
export const PERSON_COLUMN = /_by$|_user_id$|_actor$|^person_id$|^(owner|lead|manager|person|by)_name$/;

/** Personal columns a rule changes but can't find the person by, so their rows are never erased, exported or held. */
export const unfoundColumns = (r: Pick<RetentionEntry, "fields" | "subject" | "subjectName">) =>
  r.fields.filter((f) => PERSON_COLUMN.test(f) && !r.subject?.includes(f) && !r.subjectName?.includes(f));

export function defineModule(manifest: ModuleManifest): ModuleManifest {
  if (!/^[a-z][a-z0-9-]*$/.test(manifest.id)) throw new Error(`module id "${manifest.id}" must be kebab-case`);
  if (!manifest.routes.some((r) => r.path === "" && !r.mount)) throw new Error(`module "${manifest.id}" needs a root route ("")`);
  for (const r of manifest.retention ?? []) {
    if (!r.start.at.length && !r.start.idle) throw new Error(`module "${manifest.id}": retention for ${r.table} never starts`);
    const unfound = unfoundColumns(r);
    if (unfound.length) throw new Error(`module "${manifest.id}": retention for ${r.table} changes ${unfound.join(", ")} but can't find the person by ${unfound.length === 1 ? "it" : "them"}; add ${unfound.length === 1 ? "it" : "them"} to subject or subjectName`);
  }
  return manifest;
}
