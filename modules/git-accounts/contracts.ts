// 108: the git-accounts module's import surface. The app's GitHub callback route finishes a connect through
// `completeGitHubConnect`; nothing else reaches into the module.
export { completeConnect as completeGitHubConnect } from "./server/connect";
export { isGitHubReplyError } from "./server/github";

export const EVENTS = { connected: "git-accounts.github.connected", disconnected: "git-accounts.github.disconnected" } as const;
export type GitHubConnected = { userId: string; login: string; emails: number };

export type GitHubLogin = { login: string; emails: { id: string; email: string; verified: boolean }[] };
export type GitAccounts = { configured: boolean; github: { logins: GitHubLogin[] } | null };

export { NOT_SET_UP, OWNERS_NOTE, RESULTS, type ResultCode } from "./words";
