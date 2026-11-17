import { PinButton } from "@amax/ui";
import { pulsePin } from "../pins";
import { comingOf } from "../server/coming";
import type { Pulse } from "../server/pulse-types";

export function ComingUp({ p }: { p: Pulse }) {
  const items = comingOf(p);
  const months = p.capacity.months;
  const calm = months.length > 0 && months.every((m) => m.over === 0);
  return (
    <section className="card pinnable coming">
      <PinButton pin={pulsePin("Coming up", "capacity")} />
      <div className="card-head"><h2>Coming up</h2><span className="muted">leave in the next 14 days, and the next six months of plans</span></div>
      {calm && <p className="calm"><span className="chip good">Capacity covers demand</span> every month from {months[0].label} to {months[months.length - 1].label}.</p>}
      {items.length === 0 ? <p className="muted">Nothing coming up: nobody away, nobody over, nobody on the bench.</p> : (
        <ol className="timeline">
          {items.map((it) => (
            <li key={`${it.card}-${it.sort}-${it.text}`} className={`pinnable ${it.tone}`}>
              <span className="when">{it.when}</span>
              <span className="what">{it.text}</span>
              <PinButton pin={pulsePin(`${it.when}: ${it.text}`, it.card, it.key)} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
