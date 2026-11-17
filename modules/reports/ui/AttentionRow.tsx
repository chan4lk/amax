import type { PinRef } from "@amax/ui";
import type { ViewData } from "./data";
import { BAND_COLOR, bandOfPct } from "./look";
import { tab, type Item } from "./attentionItems";

export function AttentionRow({ x, d, act }: { x: Item; d: ViewData; act: (prompt: string, pin: PinRef) => void }) {
  if (x.k === "proj") {
    const r = x.r, dd = r.drift ?? 0, max = Math.max(r.planned, r.logged, 1) * 1.15, over = r.flag === "over";
    return (
      <div className="arow">
        <span className="av a4" aria-hidden="true">{tab(x)}</span>
        <div className="nm"><b>{r.name}</b><small>project</small></div>
        <div className={`big ${over ? "bad" : "warnc"}`}>{over ? "+" : "−"}{Math.abs(dd)}%<small>{over ? "over" : "behind"} plan</small></div>
        <div className="sub">{r.logged} h logged against {r.planned} h planned<div className="mb"><i style={{ width: `${(r.logged / max) * 100}%`, background: over ? "#C2412D" : "#F2A93B" }} /><b style={{ left: `${(r.planned / max) * 100}%` }} /></div></div>
        <button type="button" className="btn" onClick={() => act(`Why is ${r.name} ${over ? "over" : "behind"} plan?`, r.pin)}>✦ Take action</button>
      </div>
    );
  }
  if (x.k === "nogroup") return (
    <div className="arow">
      <span className="av a1" aria-hidden="true">{x.n}</span>
      <div className="nm"><b>No time yet</b><small>people</small></div>
      <div className="big warnc">{x.n}<small>people</small></div>
      <div className="sub">have no submitted time in {d.monthName} yet · left out of the team figure until they do</div>
      <button type="button" className="btn" onClick={() => act(`Who has no time logged in ${d.monthName}?`, x.pin)}>✦ Take action</button>
    </div>
  );
  const p = x.p;
  return (
    <div className="arow">
      <span className={`av ${p.av}`} aria-hidden="true">{p.initials}</span>
      <div className="nm"><b>{p.name}</b><small>{p.title}</small></div>
      {p.none ? (
        <><div className="big warnc" style={{ fontSize: 22 }}>no time yet</div><div className="sub">{p.available === null ? "leave not visible" : `${p.available} h available`} · left out of the team figure</div></>
      ) : (
        <>
          <div className={`big ${x.k === "over" ? "bad" : "warnc"}`}>{p.pct}%<small>in {d.monthName}</small></div>
          <div className="sub">{p.billable} billable of {p.available} available h{p.note ? ` · ${p.note}` : ""}<div className="mb"><i style={{ width: `${Math.min(100, p.pct ?? 0)}%`, background: BAND_COLOR[bandOfPct(p.pct, d.target)] }} /><b style={{ left: `${d.target}%` }} /></div></div>
        </>
      )}
      <button type="button" className="btn" onClick={() => act(`Tell me about ${p.name}`, p.pin)}>✦ Take action</button>
    </div>
  );
}
