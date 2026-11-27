import { describe, expect, it } from "vitest";
import { githubMismatchForward } from "../lib/github-return";

const at = (path: string) => githubMismatchForward(new URL(path, "http://localhost:3000"));
const CALLBACK = "/api/git/github/callback?error=redirect_uri_mismatch&state=abcdefghijklmnop0123";

// 117 AC-1: GitHub's mismatch return is sent to the callback from whatever page the wrong Redirect URI named.
describe("117 AC-1 a Redirect URI mismatch is caught wherever it lands", () => {
  it.each([
    ["the homepage", "/?error=redirect_uri_mismatch&error_description=x&state=abcdefghijklmnop0123"],
    ["Git accounts", "/git-accounts?error=redirect_uri_mismatch&state=abcdefghijklmnop0123"],
    ["the sign-in page", "/signin?error=redirect_uri_mismatch&state=abcdefghijklmnop0123"],
    ["Auth.js's GitHub callback", "/api/auth/callback/github?error=redirect_uri_mismatch&state=abcdefghijklmnop0123"],
  ])("from %s", (_n, path) => {
    const to = at(path);
    expect(to && `${to.pathname}${to.search}`).toBe(CALLBACK);
  });

  it.each([
    ["the callback itself", CALLBACK],
    ["another error", "/?error=access_denied&state=abcdefghijklmnop0123"],
    ["no state", "/?error=redirect_uri_mismatch"],
    ["an ordinary page", "/delivery?state=open"],
  ])("leaves %s alone", (_n, path) => {
    expect(at(path)).toBeNull();
  });
});
