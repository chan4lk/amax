// 117 AC-1: GitHub sends a Redirect URI mismatch back to whatever URI the app has registered, so it can land on any page,
// signed in or not. The proxy sends it on to the GitHub callback, which records it on the connect's own state and shows
// Git accounts what to fix. The callback itself is never redirected.
export const GITHUB_CALLBACK = "/api/git/github/callback";

export function githubMismatchForward(url: URL): URL | null {
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") !== "redirect_uri_mismatch" || !state || url.pathname === GITHUB_CALLBACK) return null;
  return new URL(`${GITHUB_CALLBACK}?${new URLSearchParams({ error: "redirect_uri_mismatch", state })}`, url);
}
