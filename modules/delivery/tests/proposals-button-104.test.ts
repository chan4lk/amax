import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { AgentFirstLine } from "../ui/AgentFirstLine";
import { NewProposalButton } from "../ui/NewProposalButton";

const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup(node as never);

// 104 AC-1: the secondary button on the all-projects Proposals page says what it does: it opens chat.
describe("104 AC-1 the manual-creation button is named for what it opens", () => {
  it("AC-1 the secondary button reads New proposal in chat, with chat's create intent; the primary one is unchanged", async () => {
    const secondary = await html(createElement(NewProposalButton, { secondary: true }));
    expect(secondary).toContain("New proposal in chat");
    expect(secondary).toContain('title="Opens chat to add one"');
    expect(secondary).toContain('data-intent="delivery.new-proposal"');
    expect(secondary).not.toContain("Add by hand");
    const primary = await html(createElement(NewProposalButton, {}));
    expect(primary).toContain(">New proposal</button>");
    expect(primary).toContain('class="btn primary"');
  });

  // Amendment 1: the line is an info icon whose tooltip says to sync the repo.
  it("AC-14 the agent-first line is a labelled info button with a tooltip naming the repo and the sync", async () => {
    const one = await html(createElement(AgentFirstLine, { repoUrl: "github.com/example/amax", intro: "Every change, with its time." }));
    expect(one).toContain('aria-label="About proposals and how to add one"');
    // Review round 1 (WCAG 1.4.13): a native popover the button toggles, so click, tap, Enter and Escape all work.
    expect(one).toMatch(/<button[^>]*aria-describedby="([^"]+)"[^>]*popover[Tt]arget="\1"[\s\S]*<div popover="auto" role="tooltip" id="\1"/);
    expect(one).toContain("<p>Every change, with its time.</p>");
    expect(one).toContain("Proposals come from github.com/example/amax; nothing is typed in here. To add one:");
    expect(one).toMatch(/<ol><li>In the repo, write it with <code>\/specclaw:propose<\/code>\.<\/li><li>Sync the repo to amax: run <code>\/amax:sync-specclaw<\/code> there, or merge the change and CI syncs it\.<\/li><\/ol>/);
    expect(one).not.toContain("it appears here when merged");
    expect(await html(createElement(AgentFirstLine, {}))).toContain("Proposals come from your repos; nothing is typed in here.");
  });
});
