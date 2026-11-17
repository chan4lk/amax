import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { RunwayBox } from "../ui/RunwayBox";
import { RunwayChart } from "../ui/RunwayChart";
import { forecast, grid } from "./people";

const render = async (element: ReturnType<typeof createElement>) => (await import("react-dom/server")).renderToStaticMarkup(element);

describe("capacity runway", () => {
  it("AC2 draws forecast months striped and says spare or short under every month", async () => {
    const html = await render(createElement(RunwayChart, { f: forecast, onHover: () => {}, onLeave: () => {}, onPress: () => {} }));
    expect(html).toContain("+2 spare");
    expect(html).toContain("−2 short");
    expect(html).toContain("+6 spare");
    expect(html).toContain("forecast");
    expect(html).toContain("Demand 136");
  });

  it("AC3 the month box shows your people against capacity, everyone against demand and who is over 100%", async () => {
    const spot = { index: 0, left: 10, top: 10, flip: false };
    const html = await render(createElement(RunwayBox, { f: forecast, people: grid.people, who: "Your 3 people", spot }));
    expect(html).toContain("December");
    expect(html).toContain("Capacity");
    expect(html).toContain("Demand");
    expect(html).toContain("Your 3 people");
    expect(html).toContain("1 person over 100% on the board");
  });
});
