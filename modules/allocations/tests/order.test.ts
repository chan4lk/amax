import { describe, expect, it } from "vitest";
import { shown, type Flag } from "../server/attention";
import type { GridPerson } from "../server/grid";

const person = (name: string) => ({ personId: name, name }) as GridPerson;

describe("people order", () => {
  it("AC20 keeps people in name order whether or not they are flagged", () => {
    const people = [person("Nimal"), person("Ayesha"), person("Kasun")];
    const flags = [{ personId: "Nimal", kind: "over" }] as Flag[];
    expect(shown(people, flags, "all").map((p) => p.name)).toEqual(["Ayesha", "Kasun", "Nimal"]);
    expect(shown(people, [], "all").map((p) => p.name)).toEqual(["Ayesha", "Kasun", "Nimal"]);
  });
});
