import type { ScreenProps } from "@amax/core";
import { PinButton } from "@amax/ui";
import { AskButton } from "./AskButton";
import { myWeek } from "../server/my";
import { openOfMine } from "../server/requests-read";
import { MyRequests } from "./ChangeRequests";
import { myLeaveDays } from "../server/my-days";
import { DayHead, dayLabelFor, type DayMark, Head, hrs, SignInFirst, weekParam, STATUS, viewerOrNull, weekSpan } from "./parts";

export async function MyPage({ viewer: raw, params, searchParams }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="time"><h1>My timesheet</h1><SignInFirst /></div>;
  const m = await myWeek(viewer, weekParam(params.week));
  // 073 AC-3: a day reminder links here with ?day=, and that day's column is marked.
  const marked = searchParams?.day && m.days.includes(searchParams.day) ? searchParams.day : null;
  // Approved leave days say so, as on Team time; only a reminder's day is marked Missing (073 AC-3).
  const leave = await myLeaveDays(viewer, m.days);
  const markOf = (d: string): DayMark => (d === marked ? "missing" : leave.includes(d) ? "leave" : undefined);
  const requests = m.status === "submitted" || m.status === "approved" ? await openOfMine(viewer, m.key) : [];
  const open = m.status !== "approved";
  const canSubmit = m.total > 0 && (m.status === "draft" || m.status === "rejected");
  const weekPin = { label: `My timesheet ${m.key}`, tool: "get_my_week", args: { week: m.key } };
  // 070 amendment 4: fixes are asked for in chat (its suggestions offer them); the row keeps its pin.
  const rowPin = (project: string) => ({ label: `${project}, ${m.key}`, tool: "get_timesheet", args: { week: m.key, project } });
  const pin = (project: string) => <PinButton pin={rowPin(project)} />;
  const lede = `${weekSpan(m.week, m.days)}. ${m.total.toFixed(1)} h logged${m.total ? `, ${Math.round((m.agentHours / m.total) * 100)}% by agents` : ""}.${m.status === "approved" ? " Approved and locked." : ""}`;
  return (
    <div className="time">
      <Head title="My timesheet" lede={lede} week={m.week} days={m.days} base="/my" />
      {m.rejectComment && m.status === "rejected" && <p className="chip bad" role="status">Sent back: {m.rejectComment}</p>}
      <MyRequests rows={requests} />
      <div className="card flush pinnable">
        <div className="card-head">
          <h2>{m.key}{m.status && <> <span className={`chip ${STATUS[m.status][0]}`}>{STATUS[m.status][1]}</span></>}</h2>
          <PinButton inline pin={weekPin} />
          <div className="actions">
            {open && <AskButton className="btn" label="Ask amax to log time" prompt={`Log time on ${m.key}: `} pin={weekPin} />}
            {canSubmit && <AskButton className="btn primary" label={`Ask amax to submit week ${m.week.week}`} prompt={`Submit my timesheet for ${m.key}`} pin={weekPin} />}
          </div>
        </div>
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">My hours for {m.key}</caption>
          <thead><tr><th>Project</th>{m.days.map((d) => <DayHead key={d} day={d} mark={markOf(d)} />)}<th className="num">Total</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {m.rows.map((r) => <tr key={r.projectName} className="pinnable"><td data-label="Project">{r.projectName}</td>{r.days.map((h, i) => <td className="num" data-label={dayLabelFor(m.days[i], markOf(m.days[i]))} key={i}>{hrs(h)}</td>)}<td className="num" data-label="Total"><b>{r.total.toFixed(1)}</b></td><td className="num" data-label="">{pin(r.projectName)}</td></tr>)}
            {m.rows.length === 0 && <tr><td colSpan={m.days.length + 3} className="muted">No time logged this week.</td></tr>}
          </tbody>
          <tfoot><tr><th scope="row">Total</th>{m.perDay.map((h, i) => <td className={`num${markOf(m.days[i]) === "missing" ? " missing" : ""}`} data-label={dayLabelFor(m.days[i], markOf(m.days[i]))} key={i}>{hrs(h)}</td>)}<td className="num" data-label="Week"><b>{m.total.toFixed(1)}</b></td><td aria-hidden="true" /></tr></tfoot>
        </table></div>
      </div>
    </div>
  );
}
