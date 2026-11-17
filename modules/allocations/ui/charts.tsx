export const SrTable = ({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) => (
  <table className="sr"><caption>{caption}</caption><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r) => <tr key={String(r[0])}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table>
);
