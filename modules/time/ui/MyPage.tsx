import type { ScreenProps } from "@amax/core";
import { PinButton } from "@amax/ui";
import { AskButton } from "./AskButton";
import { myWeek } from "../server/my";
import { shownToOwner, weekHistory } from "../server/requests-read";
import { MyRequests } from "./ChangeRequests";
import { MyBand } from "./MyBand";
import { RequestHistory } from "./RequestHistory";
import { SentBack } from "./SentBack";
import { myDayMarks } from "../server/my-days";
import { DayHead, dayLabelFor, type DayMark, Head, hrs, SignInFirst, weekParam, STATUS, viewerOrNull } from "./parts";

export async function MyPage({ viewer: raw, params, searchParams }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="time"><h1>My timesheet</h1><SignInFirst /></div>;
  const m = await myWeek(viewer, weekParam(params.week));
  // 073 AC-3: a day reminder links here with ?day=, and that day's column is marked.
  // Only while it's still empty: once hours are logged for it, the reminder link no longer marks it (review round 1).
  const marked = searchParams?.day && m.days.includes(searchParams.day) && !m.perDay[m.days.indexOf(searchParams.day)] ? searchParams.day : null;
  // As Team time marks them: past working days with nothing logged and no leave, and approved leave.
  const marks = await myDayMarks(viewer, m.days, m.perDay);
  const markOf = (d: string): DayMark => (d === marked || marks.missing.includes(d) ? "missing" : marks.leave.includes(d) ? "leave" : undefined);
  // Open requests as cards (a reopened week is a draft again, so any status); decided ones are on the Requests page.
  const requests = m.status ? await shownToOwner(viewer, m.key) : [];
  // 077: every decision on this week stays reachable on the Requests page; the week links there.
  const history = m.status ? await weekHistory(viewer, m.key) : [];
  const open = m.status !== "approved";
  const canSubmit = m.total > 0 && (m.status === "draft" || m.status === "rejected");
  const weekPin = { label: `My timesheet ${m.key}`, tool: "get_my_week", args: { week: m.key } };
  // 070 amendment 4: fixes are asked for in chat (its suggestions offer them); the row keeps its pin.
  // 073 review round 2: a row pins its project by id, as Team time's rows do.
  const rowPin = (r: { projectId: string; projectName: string }) => ({ label: `${r.projectName}, ${m.key}`, tool: "get_timesheet", args: { week: m.key, projectId: r.projectId } });
  const pin = (r: { projectId: string; projectName: string }) => <PinButton pin={rowPin(r)} />;
  return (
    <div className="time">
      {/* 075 amendment 2: the week at a glance is a slim band, not a sentence; the pill and the picker name the week. */}
      <Head title="My timesheet" lede="" week={m.week} days={m.days} base="/my" />
      <MyBand m={m} />
      {m.rejectComment && m.status === "rejected" && <SentBack m={m} />}
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
            {m.rows.map((r) => <tr key={r.projectId} className="pinnable"><td data-label="Project">{r.projectName}</td>{r.days.map((h, i) => <td className={`num${markOf(m.days[i]) === "missing" ? " missing" : ""}`} data-label={dayLabelFor(m.days[i], markOf(m.days[i]))} key={i}>{hrs(h)}</td>)}<td className="num" data-label="Total"><b>{r.total.toFixed(1)}</b></td><td className="num" data-label="">{pin(r)}</td></tr>)}
            {m.rows.length === 0 && <tr><td colSpan={m.days.length + 3} className="muted">No time logged this week.</td></tr>}
          </tbody>
          <tfoot><tr><th scope="row">Total</th>{m.perDay.map((h, i) => <td className={`num${markOf(m.days[i]) === "missing" ? " missing" : ""}`} data-label={dayLabelFor(m.days[i], markOf(m.days[i]))} key={i}>{hrs(h)}</td>)}<td className="num" data-label="Week"><b>{m.total.toFixed(1)}</b></td><td aria-hidden="true" /></tr></tfoot>
        </table></div>
      </div>
      {/* 077: decided requests live on the Requests page; this week links there, after its hours. */}
      <RequestHistory count={history.length} week={m.key} />
    </div>
  );
}
