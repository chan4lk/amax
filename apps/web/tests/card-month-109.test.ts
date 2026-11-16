import { describe, expect, it } from "vitest";
import type { CardForm } from "@amax/core";
import { confirmLabel } from "../components/chat/form-values";

// 109 review round 1: the Add to project button names the range from the Through field, so an edit shows at once.
const form: CardForm = {
  fields: [{ name: "person", label: "Who", kind: "chips", options: [{ value: "LL-0412", label: "Dinesh Wickrama · Engineer", short: "Dinesh Wickrama" }] },
    { name: "through", label: "Through", kind: "text", rangeFrom: "2027-03-01" }],
  confirm: { label: "Add {person} to TMT, {through}" },
};

describe("109 the button follows Through", () => {
  it.each([
    ["as drafted", "2027-05", "Add Dinesh Wickrama to TMT, Mar–May"],
    ["edited to a later month", "2027-07", "Add Dinesh Wickrama to TMT, Mar–Jul"],
    ["edited into the next year: both years named", "2028-01", "Add Dinesh Wickrama to TMT, Mar 2027–Jan 2028"],
    ["thirteen months: never read as one", "2028-03", "Add Dinesh Wickrama to TMT, Mar 2027–Mar 2028"],
    ["a day given too: still the month", "2027-05-01", "Add Dinesh Wickrama to TMT, Mar–May"],
    ["half typed: the start, and the end as typed", "2027-1", "Add Dinesh Wickrama to TMT, Mar–2027-1"],
    ["cleared: the start, and the end to come", "", "Add Dinesh Wickrama to TMT, Mar–…"],
    ["110 AC5: before the start, as typed, never a range", "2027-01", "Add Dinesh Wickrama to TMT, Mar–2027-01"],
    ["110 AC5: the start month itself is a range of one", "2027-03", "Add Dinesh Wickrama to TMT, Mar–Mar"],
  ])("%s", (_name, through, label) => {
    expect(confirmLabel(form, { person: "LL-0412", through }, "Confirm")).toBe(label);
  });
});
