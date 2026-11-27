// What a module puts on the Overview (068). The page knows these shapes, never the modules: each
// module's `overview` hook returns its parts, and every part carries the pin that resolves to it.
export type OverviewTone = "info" | "good" | "attention" | "problem";
export type OverviewPin = { label: string; tool: string; args: Record<string, unknown> };

/** A stat ticket at the top. `percent` draws its bar; `order` places it among the other modules' tickets. */
export type OverviewTicket = { key: string; order: number; tone: OverviewTone; label: string; value: string; note: string; percent?: number; pin: OverviewPin };

/**
 * A decision waiting on the viewer. `since` is when it started waiting (oldest shows first);
 * `prompt` is what "Ask amax" fills in, with the record pinned. Never a direct write.
 */
/** `snoozeDays` (116): a nudge, not a decision; "Not now" hides it that many days in the person's browser. */
export type OverviewWaiting = { id: string; title: string; detail: string | null; context: string; raisedBy: string; agent: boolean; since: string; action: string; prompt: string; pin: OverviewPin; snoozeDays?: number };

/** A read-only select that changes a panel through the URL. Only listed values are accepted. */
export type OverviewFilter = { param: string; label: string; value: string; options: { value: string; label: string }[] };

type PanelBase = { key: string; title: string; slot: "main" | "aside"; order: number; pin: OverviewPin };

export type OverviewPanel = PanelBase & (
  | { kind: "series"; labels: string[]; series: { name: string; data: number[] }[]; filters: OverviewFilter[] }
  | { kind: "share"; total: string; caption: string; parts: { label: string; value: number; pin: OverviewPin }[] }
  | { kind: "metric"; label: string; value: string; change: number | null; person: { name: string; note: string } | null }
  | { kind: "progress"; items: { id: string; label: string; done: number; total: number; note: string; problem: boolean; pin: OverviewPin }[] }
  | { kind: "list"; items: { id: string; title: string; detail: string; tone: OverviewTone; pin: OverviewPin }[]; href: string; hrefLabel: string }
);

export type OverviewPart = { tickets?: OverviewTicket[]; waiting?: OverviewWaiting[]; panels?: OverviewPanel[]; lede?: string };

/** URL inputs a hook may read: the series panel's filters, already checked against their options. */
export type OverviewQuery = Record<string, string | undefined>;
