import type { Heat } from "../server/heat";

const tone = (v: number | null, target: number) => (v === null ? "none" : v > 100 ? "over" : v >= target ? "on" : "under");

export function Spark({ heat, userId, target }: { heat: Heat; userId: string; target: number }) {
  const cells = heat.rows.find((h) => h.userId === userId)?.cells;
  if (!cells) return <span className="muted">–</span>;
  const label = heat.months.map((m, i) => `${m.label} ${cells[i] === null ? "no hours" : `${cells[i]}%`}`).join(", ");
  return (
    <span className="spark" role="img" aria-label={`Last 6 months: ${label}`}>
      {cells.map((v, i) => <i key={heat.months[i].month} className={tone(v, target)} title={`${heat.months[i].label}: ${v === null ? "no hours" : `${v}%`}`} style={{ height: `${v === null ? 4 : Math.max(6, Math.min(100, v) * 0.26)}px` }} />)}
    </span>
  );
}
