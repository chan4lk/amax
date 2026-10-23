import { PinButton } from "@amax/ui";
import { changeText, type ChangeRequest } from "../server/requests-read";
import { AskButton } from "./AskButton";
import { reviewPrompt } from "./prompts";
import { Since } from "./Since";
import { avatar, initials, STATUS } from "./parts";

// 070 amendment 3: open change requests the viewer reviews. Decisions are made in chat, on a confirm card.
export const requestPin = (r: ChangeRequest) => ({ label: `${r.personName}, change request`, tool: "get_change_requests", args: { id: r.id } });

export function ChangeRequests({ rows }: { rows: ChangeRequest[] }) {
  return (
    <div className="card flush pinnable requests" style={{ margin: "28px 0" }}>
      <div className="card-head"><h2>Change requests</h2><span className="chip">{rows.length} open</span></div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Change requests waiting for review</caption>
        <thead><tr><th>Person</th><th>Week</th><th>Entry</th><th>Change</th><th>Reason</th><th>Asked</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="pinnable">
              <td data-label="Person"><div className="who"><span className={`av sm ${avatar(r.personName)}`}>{initials(r.personName)}</span>{r.personName}</div></td>
              <td data-label="Week">{r.week} <span className={`chip ${STATUS[r.weekStatus as keyof typeof STATUS]?.[0] ?? ""}`}>{STATUS[r.weekStatus as keyof typeof STATUS]?.[1] ?? r.weekStatus}</span></td>
              <td data-label="Entry">{r.before.projectName}, {r.dayLabel}</td>
              <td data-label="Change">{changeText(r).join(" · ")}</td>
              <td data-label="Reason">{r.reason}{r.status === "needs_info" && <small className="muted"> · waiting for {r.personName.split(" ")[0]}'s answer</small>}</td>
              <td data-label="Asked"><Since at={r.createdAt} /></td>
              <td className="num" data-label=""><div className="row-actions">
                <AskButton label="Review" name={`Review ${r.personName}'s change request`} prompt={reviewPrompt(r)} pin={requestPin(r)} />
                <PinButton pin={requestPin(r)} />
              </div></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

export function MyRequests({ rows }: { rows: ChangeRequest[] }) {
  return <>{rows.map((r) => (
    <div key={r.id} className="card pinnable notice" role="status" style={{ marginBottom: 20 }}>
      <div className="card-head"><h2>Change requested: {r.before.projectName}, {r.dayLabel}</h2><PinButton inline pin={requestPin(r)} /></div>
      <p>{changeText(r).join(" · ")} · {r.status === "needs_info" ? `Your approver asks: ${r.question}` : "Waiting for review"} · asked <Since at={r.createdAt} /></p>
    </div>
  ))}</>;
}
