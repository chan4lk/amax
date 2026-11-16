/** 109: one rule, one message, for the card's check and the allocate service: until further notice has no end month. */
export const STANDING_WITH_END = "until further notice has no end month: clear Through, or pick This month";
export const standingWithEnd = (i: { standing?: boolean; through?: string }) => Boolean(i.standing && i.through);
