import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const base = process.env.EVAL_URL ?? "http://localhost:3000";
const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));
const only = process.argv[2];

async function say(page, text) {
  await page.fill("[aria-label='Message amax']", text);
  await page.click("button.c-send");
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !document.querySelector(".thinking"), null, { timeout: 180000 });
  await page.waitForTimeout(2000);
  const reply = await page.$$eval(".c-log > .m:not(.me) .b", (b) => b.filter((x) => !x.id && !x.closest("[id^=card-]") && !x.querySelector("#add-all-bar")).map((x) => x.innerText).pop() ?? "");
  const bar = await page.$$eval("#add-all-bar li", (l) => l.length);
  const open = bar || (await page.$$eval("[id^=card-]", (c) => c.filter((x) => x.querySelector("button")).length));
  return { reply, open, url: page.url() };
}

function judge(step, { reply, open, url }) {
  const bad = [];
  if (step.open !== undefined && open !== step.open) bad.push(`open cards ${open}, wanted ${step.open}`);
  if (step.url && !new RegExp(step.url).test(url)) bad.push(`page address ${url.replace(base, "")}, wanted /${step.url}/`);
  for (const m of step.match ?? []) if (!new RegExp(m, "i").test(reply)) bad.push(`reply lacks /${m}/`);
  for (const n of step.not ?? []) if (new RegExp(n, "i").test(reply)) bad.push(`reply has /${n}/`);
  if (step.maxWords && reply.split(/\s+/).length > step.maxWords) bad.push(`reply has ${reply.split(/\s+/).length} words, max ${step.maxWords}`);
  return bad;
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(`${base}/signin`);
await page.fill("input[type=email], input[name=email]", process.env.EVAL_EMAIL);
await page.fill("input[type=password]", process.env.EVAL_PASSWORD);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 60000 }), page.click("button[type=submit]")]);
await page.goto(`${base}/allocations/everyone`, { waitUntil: "load" });
await page.keyboard.press("Control+k");
let failed = 0;
for (const c of cases.filter((x) => !only || x.name.includes(only))) {
  await page.click("button[aria-label='New conversation']");
  const bad = [];
  for (const step of c.steps) {
    const got = await say(page, step.say);
    bad.push(...judge(step, got).map((b) => `"${step.say}": ${b}`));
    if (bad.length) { bad.push(`reply was: ${got.reply.replace(/\s+/g, " ").slice(0, 160)}`); break; }
  }
  failed += bad.length ? 1 : 0;
  console.log(`${bad.length ? "FAIL" : "PASS"}  ${c.name}${bad.length ? "\n      " + bad.join("\n      ") : ""}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
