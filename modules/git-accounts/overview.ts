import type { OverviewPart } from "@amax/core";
import { can, type Viewer } from "@amax/auth";
import { CONNECT } from "./server/context";
import { githubAppStatus, myGitAccounts } from "./server/read";

/**
 * 116 AC-5: Overview's "Waiting on you" asks a person to connect GitHub while it would credit them: they can connect,
 * the workspace has the GitHub app, and they hold no GitHub login yet. "Not now" hides it for 30 days in that browser.
 */
export async function gitAccountsOverview(v: Viewer): Promise<OverviewPart> {
  if (!can(v, CONNECT)) return {};
  if ((await myGitAccounts(v)).github) return {};
  // 119 AC-2: the nudge follows the app's state, so an incomplete or unreadable app invites nobody.
  if ((await githubAppStatus(v)).state !== "ready") return {};
  return { waiting: [{
    id: "git-accounts.connect-github", title: "Connect GitHub", detail: "so your commits and proposals are credited to you", context: "Git accounts",
    raisedBy: "amax", agent: true, since: new Date().toISOString(), action: "Ask amax · Connect GitHub", prompt: "Connect my GitHub",
    pin: { label: "Your Git accounts", tool: "get_my_git_identities", args: {} }, snoozeDays: 30,
  }] };
}
