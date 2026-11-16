import { z } from "zod";
import { unlinkGitIdentitiesOf, unlinkGitIdentity } from "@amax/auth/git-identity";
import { defineService } from "@amax/core/server";
import { EVENTS } from "../contracts";
import { CONNECT, selfOf, UNLINK } from "./context";

const refuse = (message: string, code = "invalid_input") => Object.assign(new Error(message), { retryable: false, code });

/** 108 AC-7: every GitHub login the viewer holds and every email under them, gone, through auth's own write. */
export const disconnectGitHub = defineService({
  name: "git-accounts.github.disconnect", action: CONNECT, resource: "auth.git_identity", input: z.object({}),
  async run(tx, _input, ctx) {
    const userId = selfOf(ctx);
    const gone = await unlinkGitIdentitiesOf(tx, userId, "github");
    if (!gone.length) throw refuse("GitHub isn't connected");
    const removed = gone.map((g) => ({ login: g.login, email: g.email }));
    const logins = [...new Set(removed.map((r) => r.login))];
    return { result: { logins, removed: removed.length }, resourceId: userId, before: { removed }, after: { removed: removed.length },
      events: logins.map((login) => ({ name: EVENTS.disconnected, payload: { userId, login, emails: removed.filter((r) => r.login === login && r.email).length } })) };
  },
});

/** 108 AC-8: an Admin unlinks one identity of anyone, audited with what it was. */
export const unlinkIdentity = defineService({
  name: "git-accounts.identity.unlink", action: UNLINK, resource: "auth.git_identity", input: z.object({ identityId: z.uuid() }),
  async run(tx, input) {
    const g = await unlinkGitIdentity(tx, input.identityId);
    if (!g) throw refuse("no such Git identity", "not_found");
    const before = { userId: g.userId, provider: g.provider, login: g.login, email: g.email };
    return { result: { unlinked: `${g.login}${g.email ? ` (${g.email})` : ""}` }, resourceId: input.identityId, before,
      events: [{ name: EVENTS.disconnected, payload: { userId: g.userId, login: g.login, emails: g.email ? 1 : 0 } }] };
  },
});
