import { PinButton, Since } from "@amax/ui";
import { pushPin, repoSyncPin } from "../pins";
import type { PushRow } from "../server/repo-sync";
import { AskButton } from "./AskButton";
import { groupSkips } from "./skips";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const result = (p: PushRow) => p.outcome === "refused" ? p.reason ?? "refused"
  : [`${p.created} created`, `${p.updated} updated`, p.withdrawn ? `${p.withdrawn} withdrawn` : "", `${p.unchanged} unchanged`, p.skipped.length ? `${p.skipped.length} skipped` : ""].filter(Boolean).join(" · ");
// 089 AC-7: an applied push with skips a person must act on (a duplicate change number) says so; the skip lines follow.
const outcomeChip = (p: PushRow) => p.outcome === "refused" ? <span className="chip warn">Refused</span>
  : p.needsReview ? <span className="chip warn">Needs you</span> : <span className="chip good">Applied</span>;

type Props = { projectKey: string; projectId: string; repoUrl: string | null; last: PushRow | null; recent: PushRow[]; canLink: boolean; first?: boolean };

// 062 AC-10: refused pushes first, since they need someone to act; linking happens in chat.
// 081 amendment 4 (AC-44, revised): the card folds to one row (a native <details>). With `first` (a refused push and a
// viewer who can fix it) it leads the board, open; otherwise it stays folded below the board.
// The heading stays in the <summary>; the pin and the Ask amax button sit outside it, so no control nests in another.
export function RepoSyncCard({ projectKey, projectId, repoUrl, last, recent, canLink, first = false }: Props) {
  const pin = repoSyncPin({ id: projectId, key: projectKey });
  const rows = [...recent.filter((p) => p.outcome === "refused"), ...recent.filter((p) => p.outcome === "applied")].slice(0, 8);
  const refused = recent.filter((p) => p.outcome === "refused").length;
  return (
    <div className="card flush pinnable dv-foldwrap dv-sync" style={first ? { marginBottom: 20 } : { marginTop: 28 }}>
      <details className="dv-fold" open={first}>
      <summary>
        <h2>Repo sync</h2>
        {refused > 0 ? <span className="chip warn">{refused} {refused === 1 ? "push" : "pushes"} refused</span> : !repoUrl && <span className="chip warn">No repo linked</span>}
        {last && <small className="muted">last sync <Since at={last.at} /></small>}
        <span className="dv-chev" aria-hidden="true" />
      </summary>
      <div className="card-head">
        <span className="muted" style={{ fontSize: 13 }}>{repoUrl ? `From ${repoUrl}` : "No repo linked: specclaw pushes are refused"}</span>
        {canLink && <div className="actions"><AskButton spark label={repoUrl ? "Ask amax to change the linked repo" : "Ask amax to link a repo"}
          prompt={repoUrl ? `Change the repo ${projectKey} syncs from to ` : `Link ${projectKey} to the repo `} pin={pin} /></div>}</div>
      <p className="lede" style={{ padding: "0 20px" }}>
        {last ? `Last sync ${when(last.at)} by ${last.by}: ${result(last)}.` : "No specclaw push applied yet."}
      </p>
      {rows.length > 0 && (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Recent specclaw pushes</caption>
          <thead><tr><th>When</th><th>By</th><th>Commit</th><th>Result</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="pinnable">
                <td data-label="When">{when(p.at)}</td>
                <td data-label="By">{p.by}</td>
                <td data-label="Commit"><code>{p.ref}@{p.sha.slice(0, 7)}</code></td>
                <td data-label="Result">{outcomeChip(p)} {result(p)}{p.needsReview && p.skipped.length > 0 && <small className="muted dv-skips">{groupSkips(p.skipped).join("; ")}</small>}</td>
                <td className="num"><PinButton pin={pushPin({ ...p, projectKey })} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      </details>
      <PinButton inline pin={pin} />
    </div>
  );
}
