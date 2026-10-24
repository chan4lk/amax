import type { ReactNode } from "react";
import { PinButton } from "@amax/ui";
import type { ChangeRequest } from "../server/requests-read";
import { Since } from "./Since";
import { requestPin } from "./request-view";

const h = (n: number) => `${Number(n.toFixed(2))} h`;
/** The change in a few characters for the folded row: "8 h → 7 h", "8 h → removed", or "Billable yes → no". */
export const shortChange = (r: ChangeRequest) =>
  r.kind === "delete" ? `${h(r.before.hours)} → removed` : r.proposed.hours !== undefined && r.proposed.hours !== r.before.hours ? `${h(r.before.hours)} → ${h(r.proposed.hours)}` : "Details";

/**
 * 073: a change request that folds to one row, so several don't fill the screen. A native <details>: click, Enter or
 * Space opens it, and screen readers announce it as expandable. The row keeps the request's pin.
 */
export function RequestFold({ r, chip, title, open, children }: { r: ChangeRequest; chip: [string, string]; title: ReactNode; open: boolean; children: ReactNode }) {
  // The pin sits beside the row, not in it: a button inside the <summary> (itself a button) would be nested controls.
  return (
    <div className="rq-foldwrap pinnable">
      <details className="rq-fold" open={open}>
        <summary className="rq-sum">
          <span className={`chip ${chip[0]}`}>{chip[1]}</span>
          <span className="rq-title">{title}</span>
          <span className="rq-short">{shortChange(r)}</span>
          <small className="muted">asked <Since at={r.createdAt} /></small>
          <span className="rq-chev" aria-hidden="true" />
        </summary>
        <div className="rq-body">{children}</div>
      </details>
      <PinButton inline pin={requestPin(r)} />
    </div>
  );
}
