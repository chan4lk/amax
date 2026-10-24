// 070 amendment 5 (AC-53): a page rendered for one user must not act as another. One browser keeps one session
// cookie for all its tabs, so after another tab signs in as someone else this tab's requests carry that person's
// session. Each guarded action gets the user id the page was rendered for and refuses a mismatch before it does
// anything. It never grants anything: permissions come from the session row on the server.
export class SignedInElsewhere extends Error {
  constructor() {
    super("You're signed in as someone else in another tab. Reload this page to continue as them; nothing was changed.");
    this.name = "SignedInElsewhere";
  }
}

export function sameUser(viewer: { userId: string } | null, as: unknown) {
  if (typeof as === "string" && viewer?.userId !== as) throw new SignedInElsewhere();
}
