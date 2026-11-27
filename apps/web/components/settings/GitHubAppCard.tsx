import { PinButton } from "@amax/ui";
import { CopyValue } from "../chat/CopyValue";
import { AskButton } from "./AskButton";

// 116 AC-4, 117 AC-3 (review rounds 3 and 4): the GitHub app's row on Integrations, read through get_github_app_status
// and switched on its one `state`. The app can't import the module (it may be removed), so this list mirrors the module's
// AppState; a test keeps the two equal, and a state this list doesn't know is shown as unknown, never as another.
export type GitHubAppState = "none" | "expired" | "incomplete" | "unchecked" | "ready";
export type GitHubAppStatus = { state: GitHubAppState; checkProblem: string | null; rotatedAt: string | Date | null; callbackUrl: string | null; callbackProblem: string | null };

const PIN = { label: "GitHub accounts", tool: "get_github_app_status", args: {} };
const day = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const SET_UP = "Set up the GitHub OAuth app with its Client ID and Client secret, so people can connect their GitHub accounts.";
const SHOWN: Record<GitHubAppState, { chip: string; tone: "" | " good" | " warn"; note: string; setUp: boolean }> = {
  none: { chip: "Not configured", tone: "", note: SET_UP, setUp: true },
  expired: { chip: "Expired", tone: " warn", note: SET_UP, setUp: true },
  incomplete: { chip: "Incomplete · set it up again", tone: " warn", note: SET_UP, setUp: true },
  unchecked: { chip: "Not checked", tone: " warn", note: "amax hasn't checked the GitHub app's credential; the line below says why.", setUp: false },
  ready: { chip: "Configured", tone: " good", note: "People connect their GitHub accounts from Git accounts in their profile menu.", setUp: false },
};

export const GITHUB_APP_STATES = Object.keys(SHOWN) as GitHubAppState[];
const UNKNOWN = { chip: "Unknown state", tone: " warn" as const, note: "amax reports a state this screen doesn't know yet.", setUp: false };

export function GitHubAppCard({ app }: { app: GitHubAppStatus }) {
  const s = SHOWN[app.state] ?? UNKNOWN;
  const rotated = app.state === "ready" && app.rotatedAt ? ` · rotated ${day(app.rotatedAt)}` : "";
  return (
    <div className="card pinnable" style={{ marginBottom: 28 }}>
      <div className="card-head"><h2>GitHub accounts</h2><PinButton inline pin={PIN} /><span className={`chip${s.tone}`}>{s.chip}{rotated}</span></div>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>{s.note}</p>
      {app.checkProblem && <p className="err" style={{ fontSize: 13, margin: "0 0 10px" }}>{app.checkProblem}</p>}
      {app.callbackProblem && <p className="err" style={{ fontSize: 13, margin: "0 0 10px" }}>{app.callbackProblem}</p>}
      {app.callbackUrl && <p style={{ fontSize: 13, margin: "0 0 10px" }}>Callback URL for the GitHub app&apos;s Redirect URIs: <code>{app.callbackUrl}</code> <CopyValue value={app.callbackUrl} label="the callback URL" /></p>}
      {s.setUp && <AskButton label="Ask amax · Set up the GitHub app" prompt="Set up the GitHub app" pin={PIN} tool="set_github_app" name="Ask amax to set up the GitHub app" />}
    </div>
  );
}
