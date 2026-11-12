// 091 AC-3: one rule for a commit sha, for every specclaw writer. A ref is "<branch>@<sha>", and withdrawal compares
// refs with the sha taken off (`refOf`), so a sha this rule doesn't accept would leave its ref unmatched for good.
export const SHA = "[0-9a-f]{7,40}";
export const SHA_RE = new RegExp(`^${SHA}$`, "i");
export const isSha = (sha: string) => SHA_RE.test(sha);

/** Throws when `sha` isn't a commit sha, naming where it came from. */
export function assertSha(sha: string, where: string) {
  if (!isSha(sha)) throw new Error(`${where} must be a commit sha (7 to 40 hex characters), got "${sha}"`);
}

/**
 * 096 review rounds 1 and 2: the one "<ref>@<sha>" rule for a read (a record's or proposal's `source`): a ref with no
 * blank in it (git allows `@`), then `@` and a commit sha. Capture 1 is the ref, 2 the sha. Withdrawal (refOf), the
 * author walk and a repo phase's read all use it, so each gives the same answer.
 */
export const READ = new RegExp(`^(\\S+)@(${SHA})$`, "i");
export const isRead = (source: unknown): source is string => typeof source === "string" && READ.test(source);
/** The ref and sha of a read; null when it isn't one. */
export const readParts = (source: unknown) => {
  const m = typeof source === "string" ? READ.exec(source) : null;
  return m ? { ref: m[1], sha: m[2] } : null;
};
