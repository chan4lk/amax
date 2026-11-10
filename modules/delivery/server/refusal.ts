// Review 081 round 1 (B1): Delivery's refusals in one place. A refusal carries its code and `retryable: false`, so chat and
// MCP show the reason (userFacing) instead of an internal-error reference, and idempotency settles it as permanent. A
// plain `Error` is left for faults: something amax didn't expect, which the person can't fix by rephrasing.
const refusal = (message: string, code: "invalid_input" | "not_found") => Object.assign(new Error(message), { retryable: false as const, code });

/** The request can't be done as asked: `throw invalid("…")`. */
export const invalid = (message: string) => refusal(message, "invalid_input");
/** 087 AC-7: the part of amax that answers this is switched off; the same request works again once it's back. */
export const unavailable = (message: string) => Object.assign(new Error(message), { retryable: true as const, code: "unavailable" as const });
/** The record it names doesn't exist (or isn't visible): `throw notFound("…")`. */
export const notFound = (message: string) => refusal(message, "not_found");
