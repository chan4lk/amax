import { declarePayload, defineModule } from "@amax/core";
import { chatSuggestions } from "./chat-suggestions";
import { EVENTS, type GitHubConnected } from "./contracts";
import { gitAccountsFixtures } from "./fixtures";
import { mcpTools } from "./mcp";
import { gitAccountsOverview } from "./overview";
import { GITHUB_CALLBACK_SLOT } from "@amax/core/server";
import { githubCallback } from "./server/callback";
import { CONNECT, READ, UNLINK } from "./server/context";
import { GitAccountsPage } from "./ui/GitAccountsPage";

const OWN = [READ, CONNECT];

// 108: each person links their GitHub login and verified emails, so their commits and proposals carry their name.
export default defineModule({
  id: "git-accounts",
  title: "Git accounts",
  icon: "key",
  group: "Operations",
  menu: "profile",
  dependsOn: [],
  integratesWith: ["delivery"],
  permissions: [READ, CONNECT, UNLINK],
  grants: { ITAdmin: OWN, Leadership: OWN, PM: OWN, Engineer: OWN, Finance: OWN, Sales: OWN, HR: OWN, Payroll: OWN, Employee: OWN },
  routes: [{ path: "", title: "Git accounts", component: GitAccountsPage }],
  mcpTools,
  chatSuggestions,
  overview: gitAccountsOverview as never,
  // Final pass 2: GitHub's return, read by the app's callback route through this slot (it names no module package).
  provides: { [GITHUB_CALLBACK_SLOT]: githubCallback },
  events: {
    emits: Object.values(EVENTS),
    payloads: {
      [EVENTS.connected]: declarePayload<GitHubConnected>({ userId: "plain", login: "plain", emails: "plain" }),
      [EVENTS.disconnected]: declarePayload<GitHubConnected>({ userId: "plain", login: "plain", emails: "plain" }),
    },
  },
  fixtures: [gitAccountsFixtures],
});
