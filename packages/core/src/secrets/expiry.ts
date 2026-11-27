// 052, 116: the one rule for keeping a credential's expiry when its value is replaced. A future date or no date is kept;
// a past one can't be, since dropping it would leave a credential that never expires and never shows as Expiring again.
export class ExpiryPassedError extends Error {
  override name = "ExpiryPassedError";
  constructor(connector: string, expiresAt: Date) {
    super(`the ${connector} credential's expiry (${expiresAt.toISOString().slice(0, 10)}) has passed; give a new expiresAt for the replaced value`);
  }
}

export function keptExpiry(connector: string, expiresAt: Date | null, now = new Date()): string | null {
  if (!expiresAt) return null;
  if (expiresAt > now) return expiresAt.toISOString();
  throw new ExpiryPassedError(connector, expiresAt);
}

/** 116 review round 2: a credential's expiry as tools take it (YYYY-MM-DD), and the instant it means: the end of that UTC day. */
export const EXPIRY_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const EXPIRY_DAY_HINT = "YYYY-MM-DD; the credential stops working at the end of that day (UTC)";
export const endOfDay = (d: string | undefined) => (d ? `${d}T23:59:59Z` : undefined);
/** Review round 3: what's wrong with an expiry day a tool was given, before anyone types a value: not a real day, or not ahead. */
export function expiryDayProblem(d: string, now = new Date()): string | null {
  const at = new Date(endOfDay(d)!);
  if (!EXPIRY_DAY.test(d) || Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== d) return `${d} isn't a real day; give the expiry as YYYY-MM-DD`;
  return at > now ? null : `${d} has passed; give an expiry in the future`;
}

/** 116: said when no key service is set, by every tool that stores a credential. */
export const NO_KEY_SERVICE = "amax can't store credentials yet: no key service is set (AMAX_KMS); an operator sets it";
/** Final pass: the words for a SecretsUnavailableError: no key service only when none is set; otherwise its own reason
 * (no data key yet, a destroyed one, or one held by another key service), which names no secret. */
export const unavailableWords = (e: Error, keyService: string | null) => (keyService === null ? NO_KEY_SERVICE : e.message);
