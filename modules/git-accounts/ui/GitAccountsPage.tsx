import type { ScreenProps } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { PinButton } from "@amax/ui";
import { NOT_SET_UP } from "../contracts";
import { accountsPin, identityPin } from "../pins";
import { myGitAccounts, returnResult } from "../server/read";
import { AskButton } from "./AskButton";
import { ResultNote } from "./ResultNote";
import { ResumeReturn } from "./ResumeReturn";

// 108 AC-6, AC-11: the connection first, then the login and the verified emails amax matches commits by. Connect and
// Disconnect are asked of amax; nothing on the page writes.
export async function GitAccountsPage({ viewer, searchParams }: ScreenProps) {
  const v = viewer as Viewer | null;
  if (!v) return <h1>Git accounts</h1>;
  if (searchParams?.resume) return <><h1>Git accounts</h1><ResumeReturn query={searchParams.resume} /></>;
  const shown = Boolean(searchParams?.github);
  const [{ configured, github }, record] = await Promise.all([myGitAccounts(v), shown && searchParams?.ref ? returnResult(v, searchParams.ref) : null]);
  return (
    <>
      <h1>Git accounts</h1>
      <p className="lede">amax matches your commits and proposals to you by these verified emails.</p>
      <ResultNote shown={shown} record={record}
        connectedAs={github ? { logins: github.logins.map((l) => l.login), emails: github.logins.reduce((n, l) => n + l.emails.length, 0) } : undefined} />
      {github ? (
        <div className="card pinnable" style={{ maxWidth: 720 }}>
          <div className="card-head"><h2>GitHub · Connected as {github.logins.map((l) => `@${l.login}`).join(", ")}</h2><PinButton inline pin={accountsPin} /></div>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>These emails are verified by GitHub.</p>
          <ul className="list" aria-label="Verified emails">
            {github.logins.flatMap((l) => l.emails.map((e) => (
              <li key={e.id} className="pinnable"><div className="l"><div>{e.email}{github.logins.length > 1 && <small>@{l.login}</small>}</div></div><PinButton pin={identityPin(e)} /></li>)))}
          </ul>
          <p style={{ margin: "12px 0 0" }}><AskButton label="Ask amax · Disconnect GitHub" prompt="Disconnect my GitHub" pin={accountsPin} /></p>
        </div>
      ) : (
        <div className="card pinnable" style={{ maxWidth: 720 }}>
          <div className="card-head"><h2>GitHub · Not connected</h2><PinButton inline pin={accountsPin} /></div>
          {configured ? (
            <>
              <p className="muted" style={{ fontSize: 13 }}>Until you connect, proposals from the repo can&apos;t name you as owner and no hours are drafted from your commits.</p>
              <AskButton className="btn sm primary" label="Ask amax · Connect GitHub" prompt="Connect my GitHub" pin={accountsPin} />
            </>
          ) : <p className="muted" style={{ fontSize: 13, margin: 0 }}>{NOT_SET_UP}.</p>}
        </div>
      )}
    </>
  );
}
