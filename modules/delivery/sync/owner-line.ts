/**
 * 094 AC-5: the email on a change's `**Owner:**` header line, read by tokens rather than one pattern. The text after the
 * label (on that line, before the first `## ` section) is split on whitespace and `<>()[]`; each token loses the quotes,
 * markup and punctuation around it (and a `mailto:`); the first token that is a whole address is the owner.
 */
const ADDRESS = /^[A-Za-z0-9](?:[A-Za-z0-9.!#$%&'*+/=?^_{|}~-]*[A-Za-z0-9])?@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const AROUND = /^[`"'*_,;:.!?]+|[`"'*_,;:.!?]+$/g;

export function ownerFromHeader(change: string): string | null {
  const header = change.split(/^## /m)[0];
  const at = header.indexOf("**Owner:**");
  if (at < 0) return null;
  const line = header.slice(at + "**Owner:**".length).split("\n")[0];
  for (const raw of line.split(/[\s<>()[\]]+/)) {
    const token = raw.replace(AROUND, "").replace(/^mailto:/i, "").replace(AROUND, "");
    if (ADDRESS.test(token)) return token;
  }
  return null;
}
