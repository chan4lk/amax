import { PinButton, type PinRef } from "@amax/ui";
import { NEED_LABEL, NEEDS, type Need } from "../server/attention";

/** A list link's query: the filters it carries, empty ones left out. Filters, search, need and pages keep each other. */
export type ListQuery = { project?: string; q?: string; owner?: string; need?: string; page?: number };
export const listQuery = (o: ListQuery) => {
  const s = new URLSearchParams(Object.entries(o).filter(([, x]) => x).map(([k, x]) => [k, String(x)])).toString();
  return s ? `?${s}` : "";
};

/** AC-96: a tile's pin: `list_proposals` with that need and the list's own filters. */
export const needPin = (need: Need, scope: { projectKey?: string; projectName?: string; mine?: boolean }): PinRef => ({
  label: `${NEED_LABEL[need]}${scope.mine ? ", mine" : ""}${scope.projectName ? `, ${scope.projectName}` : ""}`,
  tool: "list_proposals",
  args: { need, ...(scope.projectKey ? { projectKey: scope.projectKey } : {}), ...(scope.mine ? { mine: true } : {}) },
});

/**
 * 081 amendment 11 (AC-96): what needs attention, before the rest of the list. One tile per reason with any, each a
 * read-only link that filters the table to it; the current one is marked. Nothing to show is one quiet line.
 */
export function AttentionStrip({ counts, href, pin, active }: { counts: Record<Need, number>; href: (n: Need) => string; pin: (n: Need) => PinRef; active?: Need }) {
  const shown = NEEDS.filter((n) => counts[n] > 0 || n === active);
  return (
    <section className="attn" aria-label="Needs attention">
      {shown.length === 0 ? <p className="attn-none">Nothing needs attention here.</p> : (
        <ul>
          {shown.map((n) => (
            <li key={n} className={`pinnable attn-${n}`}>
              <a href={href(n)} aria-current={active === n ? "true" : undefined}><b>{counts[n]}</b><span>{NEED_LABEL[n]}</span></a>
              <PinButton pin={pin(n)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
