import { z } from "zod";
import type { ToolCard } from "@amax/core";
import { endOfDay, EXPIRY_DAY, EXPIRY_DAY_HINT, expiryDayProblem, keptExpiryOf, putSecret } from "@amax/core/secrets";
import type { Viewer } from "@amax/auth";
import { appRow, asRefusal, checkClientId, checkClientSecret, storeGitHubApp } from "./server/app";
import { ToolError } from "@amax/mcp";
import { ctxFor } from "./server/context";
import { redirectUri } from "./server/github";
import { tool } from "./tool";

export const MANAGE_APP = "secrets:credential:manage";
const Input = z.object({
  clientId: z.string().trim().describe("The GitHub OAuth app's Client ID, as GitHub shows it on the app's page"),
  expiresAt: z.string().regex(EXPIRY_DAY).optional().describe(`${EXPIRY_DAY_HINT}; give it when the app expires, or when its current expiry has passed`),
});
type In = z.infer<typeof Input>;

/** 116 AC-1: the card says what GitHub needs back (the callback URL, to copy) and whether this adds or replaces the app. */
const appCard = async (v: Viewer, a: In): Promise<ToolCard> => {
  const row = await appRow(ctxFor(v, "chat"));
  // Review round 2: an expired secret already stopped working; only a live one keeps working 72 more hours.
  const what = !row ? "the GitHub app people connect their GitHub accounts through"
    : row.status === "expired" ? "the expired GitHub app's client id and secret" : "the GitHub app's client id and secret; the old secret works 72 more hours";
  return {
    title: row ? "Replace the GitHub app" : "Set up the GitHub app",
    lines: [{ label: "Client ID", value: a.clientId }, { label: "Callback URL to paste into GitHub", value: redirectUri(), copy: true }, { label: row ? "Replaces" : "Adds", value: what },
      ...(a.expiresAt ? [{ label: "Expires", value: a.expiresAt }] : [])],
    look: { kind: "Integrations", confirm: row ? "Replace the GitHub app" : "Set up the GitHub app", done: row ? "GitHub app replaced" : "GitHub app set up" },
  };
};

async function checkInput(v: Viewer, a: In) {
  checkClientId(a.clientId);
  const given = a.expiresAt ? expiryDayProblem(a.expiresAt) : null;
  if (given) throw new ToolError(given, "invalid_input", "expiresAt");
  const row = a.expiresAt ? null : await appRow(ctxFor(v, "chat"));
  if (row) try { keptExpiryOf("github-oauth", row.expiresAt); } catch (e) { asRefusal(e); }
}

/** 116 AC-1: an Admin sets up or replaces the GitHub app; the Client secret is typed only into the card's masked field. */
export const setGitHubAppTool = tool({
  scope: "write", permission: MANAGE_APP, name: "set_github_app", secretInput: { label: "Client secret" },
  description: "Admin: set up or replace the GitHub app people connect their GitHub accounts through (connector github-oauth). Give clientId, the app's Client ID from GitHub; ask for it if the person hasn't said it. The person types the Client secret on the confirm card. Use this, never put_secret or rotate_secret, for the GitHub app.",
  input: Input, card: appCard, service: putSecret,
  // Review rounds 2 and 3: every expiry the write would refuse, given or kept, is refused before the secret is typed.
  propose: async (v, a) => checkInput(v, a),
  run: async (v, a, s = "mcp", secret) => {
    await checkInput(v, a);
    return storeGitHubApp(ctxFor(v, s), { clientId: a.clientId, secret: checkClientSecret(secret), ...(a.expiresAt ? { expiresAt: endOfDay(a.expiresAt) } : {}) });
  },
});
