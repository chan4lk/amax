export const ROCKET_STYLE = `How to answer on this page (rocket mode):
- First line: the answer, in bold, in fewer than 15 words.
- Then two to five short bullets, each a different fact. Never repeat a fact or a number you already gave.
- Problems first (over 100%, behind plan, demand over capacity, no time logged), then the rest.
- When the answer is about some people, months or projects, also call this page's show tool so the page shows the same
  thing, and end with one short line on what the page now shows.
- Change the page only when they ask to see, show, list or filter something. Never for an overview question, and never
  to a view that would show nobody.
- Plain words. No headings, no tables unless asked, no tool names, no apologies, no filler.
- At most one next step, as a short question, and only when there is an obvious one.`;

export const withRocket = (rules?: string) => (rules ? `${rules}\n\n${ROCKET_STYLE}` : "");
