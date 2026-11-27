import { describe, expect, it } from "vitest";
import { expiryDayProblem, NO_KEY_SERVICE, SecretsUnavailableError, unavailableWords } from "../src/secrets";

// 116 final pass: "no key service" only when none is set; every other reason the vault can't be used says itself.
describe("116 what an unusable vault is called", () => {
  it.each([
    ["no key service set", null, undefined, NO_KEY_SERVICE],
    ["no data key yet", "Local key file", "this tenant has no data key yet", /no data key yet/],
    ["a data key destroyed when the tenant left", "Local key file", "this tenant's data key was destroyed when it left amax (034)", /destroyed when it left amax/],
    ["a data key held by another key service", "AWS KMS", "this tenant's data key is held by the local key service, but AMAX_KMS is aws", /held by the local key service/],
  ])("%s", (_n, keyService, why, words) => {
    const said = unavailableWords(new SecretsUnavailableError(why), keyService);
    if (typeof words === "string") expect(said).toBe(words);
    else expect([words.test(said), said === NO_KEY_SERVICE]).toEqual([true, false]);
  });
});

// 116 review round 3: a given expiry day is a real day, ahead of now.
describe("116 an expiry day a tool is given", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  it.each([
    ["2026-11-17", null], ["2026-11-16", null], ["2026-11-15", /has passed/],
    ["2026-13-45", /isn't a real day/], ["2027-02-30", /isn't a real day/], ["16/11/2026", /isn't a real day/],
  ])("%s", (day, problem) => {
    const said = expiryDayProblem(day, now);
    if (problem === null) expect(said).toBeNull();
    else expect(said).toMatch(problem);
  });
});
