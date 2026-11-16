import type { ChatSuggestion } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { myGitAccounts } from "./server/read";

// 108: what chat offers on Git accounts, each only when it can happen: connect when GitHub is set up and not connected,
// disconnect when it is. A suggestion fills the message box; chat still confirms.
const state = async (v: Viewer) => myGitAccounts(v);
const when = (check: (v: Viewer) => Promise<boolean>) => check as ChatSuggestion["when"];

export const chatSuggestions: ChatSuggestion[] = [
  { routes: ["/git-accounts"], label: "Connect GitHub", prompt: "Connect my GitHub", tool: "connect_github", when: when(async (v) => { const s = await state(v); return s.configured && !s.github; }) },
  { routes: ["/git-accounts"], label: "Disconnect GitHub", prompt: "Disconnect my GitHub", tool: "disconnect_github", when: when(async (v) => Boolean((await state(v)).github)) },
];
