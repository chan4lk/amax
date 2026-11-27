import type { ChatSuggestion } from "@amax/core";
import { can, type Viewer } from "@amax/auth";
import { MANAGE_APP } from "./app-tool";
import { githubAppStatus, myGitAccounts, type AppState } from "./server/read";

// 108: what chat offers on Git accounts, each only when it can happen: connect when GitHub is set up and not connected,
// disconnect when it is. A suggestion fills the message box; chat still confirms.
const state = async (v: Viewer) => myGitAccounts(v);
const when = (check: (v: Viewer) => Promise<boolean>) => check as ChatSuggestion["when"];
// 116 AC-3: on Integrations, only for those who manage credentials, each only when it can happen.
// 117 AC-3 (review round 3): each suggestion names the states it fits, so a state is never read as another.
const admin = (states: AppState[]) => when(async (v) => can(v, MANAGE_APP) && states.includes((await githubAppStatus(v)).state));
const INTEGRATIONS = ["/settings/integrations"];

export const chatSuggestions: ChatSuggestion[] = [
  // 119 AC-2: invited to connect only when the app is ready, never against an incomplete, expired or unreadable one.
  { routes: ["/git-accounts"], label: "Connect GitHub", prompt: "Connect my GitHub", tool: "connect_github", when: when(async (v) => !(await state(v)).github && (await githubAppStatus(v)).state === "ready") },
  { routes: INTEGRATIONS, label: "Set up the GitHub app", prompt: "Set up the GitHub app", tool: "set_github_app", when: admin(["none", "expired", "incomplete"]) },
  { routes: INTEGRATIONS, label: "Rotate the GitHub app secret", prompt: "Rotate the GitHub app secret", tool: "set_github_app", when: admin(["ready"]) },
  { routes: INTEGRATIONS, label: "Remove the GitHub app", prompt: "Remove the GitHub app: revoke the github-oauth credential as unused", tool: "revoke_secret", when: admin(["ready", "unchecked"]) },
  { routes: ["/git-accounts"], label: "Disconnect GitHub", prompt: "Disconnect my GitHub", tool: "disconnect_github", when: when(async (v) => Boolean((await state(v)).github)) },
];
