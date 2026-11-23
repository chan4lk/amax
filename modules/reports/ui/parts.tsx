import { hoursText } from "../server/lede";

export const avatar = (name: string) => `a${([...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 4) + 1}`;
export const hrs = (n: number | null) => (n === null ? "—" : `${hoursText(n)} h`);
export const logged = (n: number) => `${n.toFixed(1)} h`;

export function Who({ name, initials }: { name: string; initials: string }) {
  return <div className="who"><span className={`av sm ${avatar(name)}`} aria-hidden="true">{initials}</span>{name}</div>;
}

export function Meter({ value, tone }: { value: number | null; tone: "good" | "under" | "team" }) {
  if (value === null) return <span className="muted">Not counted</span>;
  return <div className="bar"><div className="meter" aria-hidden="true"><i className={tone} style={{ width: `${Math.min(100, value)}%` }} /></div><b className={`pct ${tone}`}>{value}%</b></div>;
}

export function ExportLink({ filename, csv }: { filename: string; csv: string }) {
  return (
    <a className="btn" download={filename} href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></svg>Export<span className="sr"> as CSV</span>
    </a>
  );
}
