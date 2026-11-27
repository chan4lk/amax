import { describe, expect, it } from "vitest";
import { projectLede } from "../server/header";

const prod = [{ name: "Dev", isProd: false }, { name: "Production", isProd: true }];

describe("122 the project header's lede", () => {
  it("AC1 one lede for every tab: the sprint line, then where Released means it reached", () => {
    expect(projectLede({ sprint: "Sprint 18", sprintStart: "2026-10-12", sprintEnd: "2026-10-23" }, prod)).toBe("Sprint 18 runs Mon Oct 12 to Fri Oct 23. Released means it reached Production.");
    expect(projectLede({ sprint: "Continuous", sprintStart: null, sprintEnd: null }, prod)).toBe("Continuous. Released means it reached Production.");
    expect(projectLede({ sprint: null, sprintStart: null, sprintEnd: null }, [])).toBe("Released means it reached Prod.");
  });
});
