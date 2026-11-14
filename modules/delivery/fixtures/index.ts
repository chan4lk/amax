import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";

// Delivery data from fixtures.md: 3 projects; 37 proposals in flight (6 proposed, 4 planned,
// 18 building, 9 verified) and 5 released this month; the Contoso board; four active releases and
// the older ones behind "Shipped to Prod per week".
const PROJECTS = [
  { key: "CON", color: "violet", sprint: "Sprint 18", start: "2026-10-12", end: "2026-10-23", done: 9, total: 16, health: "on-track", risk: null, margin: 38.2, next: "v2.5.0, Nov 28" },
  { key: "FLT", color: "amber", sprint: "Sprint 11", start: "2026-10-12", end: "2026-10-23", done: 5, total: 16, health: "at-risk", risk: 71, margin: 29.6, next: "v1.8.0, retry UAT" },
  { key: "HRI", color: "pink", sprint: "Kanban", start: null, end: null, done: 14, total: 17, health: "on-track", risk: null, margin: 41.0, next: "v0.9.3, Nov 6" },
];

type P = { key: string; title: string; phase: string; done?: number; total?: number; est?: number; owner?: string; agent?: string; release?: string; releasedAt?: string };

const NAMED: P[] = [
  { key: "CON-014", title: "Invoice export to PDF", phase: "building", done: 3, total: 5, owner: "Nimal Silva", agent: "Claude for Nimal", release: "CON v2.5.0" },
  { key: "CON-012", title: "SSO token refresh", phase: "verified", done: 4, total: 4, owner: "Ayesha Rahman", agent: "specclaw", release: "CON v2.4.0" },
  { key: "CON-010", title: "Email digest", phase: "verified", done: 6, total: 6, owner: "Kasun Dias", agent: "specclaw", release: "CON v2.4.0" },
  { key: "CON-009", title: "Reports v2", phase: "released", done: 8, total: 8, owner: "Nimal Silva", release: "CON v2.3.0", releasedAt: "2026-09-30T10:00:00Z" },
  { key: "FLT-015", title: "Bulk upload", phase: "proposed", owner: "Kasun Dias" },
  { key: "CON-016", title: "Audit trail on approvals", phase: "proposed", est: 6, owner: "Ayesha Rahman" },
  { key: "CON-017", title: "CSV import for clients", phase: "proposed", est: 4, owner: "Nimal Silva", agent: "Claude for Nimal" },
  { key: "CON-011", title: "Global search", phase: "building", done: 1, total: 5, owner: "Kasun Dias", release: "CON v2.5.0" },
  { key: "CON-013", title: "Dark mode", phase: "planned", done: 0, total: 3, owner: "Kasun Dias", release: "CON v2.5.0" },
];

const TITLES = ["Driver roster sync", "Route replay", "Geofence alerts", "Trip export", "Fuel report", "Map clustering", "Offline mode", "Vehicle health widget",
  "Maintenance reminders", "Telematics webhook", "Role-based dashboards", "Attrition trend", "Survey import", "Headcount drill-down", "Manager digest",
  "Absence heatmap", "Team pulse", "Skills matrix view", "Payroll cost chart", "Diversity report", "Org chart export", "Data refresh status", "Alert rules",
  "Saved filters", "Audit export", "Bulk tagging", "Access review", "Dashboard sharing", "Usage analytics", "Release notes page", "Retention cohort"];

function fillers(): P[] {
  const out: P[] = [];
  let t = 0;
  const add = (project: string, from: number, phases: [string, number][], extra: Partial<P> = {}) => {
    let n = from;
    for (const [phase, count] of phases) for (let i = 0; i < count; i++) {
      const total = phase === "planned" ? 3 : phase === "building" ? 5 : phase === "verified" ? 4 : 0;
      const done = phase === "building" ? 1 + (i % 3) : phase === "verified" ? total : 0;
      out.push({ key: `${project}-${String(n++).padStart(3, "0")}`, title: TITLES[t++ % TITLES.length], phase, done, total, ...extra,
        ...(phase === "verified" && project === "FLT" ? { release: "FLT v1.8.0" } : {}) });
    }
  };
  add("FLT", 20, [["proposed", 1], ["planned", 2], ["building", 8], ["verified", 5]], { owner: "Nimal Silva" });
  add("HRI", 1, [["proposed", 2], ["planned", 1], ["building", 8], ["verified", 2]], { owner: "Ayesha Rahman" });
  for (let i = 0; i < 4; i++) out.push({ key: `HRI-1${String(i).padStart(2, "0")}`, title: TITLES[(t++) % TITLES.length], phase: "released", done: 3, total: 3, owner: "Ayesha Rahman", release: "HRI v0.9.2", releasedAt: "2026-10-01T09:00:00Z" });
  // Every released proposal has a release with a deployed Prod behind it (review round 2).
  const next: Record<string, number> = { FLT: 5, HRI: 90 };
  for (const r of SHIPPED) for (let i = 0; i < r.n; i++)
    out.push({ key: `${r.project}-${String(next[r.project]++).padStart(3, "0")}`, title: r.title ?? TITLES[(t++) % TITLES.length], phase: "released", done: r.title ? 1 : 3, total: r.title ? 1 : 3,
      owner: r.project === "FLT" ? "Nimal Silva" : "Ayesha Rahman", release: `${r.project} ${r.version}`, releasedAt: `${r.day}T14:00:00Z` });
  return out;
}

// Shipped to Prod per week, W35 to W39 (the mock's 2, 3, 1, 4, 3): one older release a week; then
// FLT's Oct 6 hotfix, the fifth "released this month" (W40 and W41 come out 5 and 1, W42 0: the
// mock's own 4 and 6 contradict its "5 released this month"; see the module README).
const SHIPPED: { project: string; version: string; day: string; n: number; title?: string }[] = [
  { project: "FLT", version: "v1.7.0", day: "2026-08-26", n: 2 }, { project: "HRI", version: "v0.9.0", day: "2026-09-02", n: 3 },
  { project: "FLT", version: "v1.7.1", day: "2026-09-09", n: 1 }, { project: "HRI", version: "v0.9.1", day: "2026-09-16", n: 4 },
  { project: "FLT", version: "v1.7.2", day: "2026-09-23", n: 3 }, { project: "FLT", version: "v1.7.3", day: "2026-10-06", n: 1, title: "Login hotfix" },
];

const RELEASES: { project: string; version: string; deployments: [string, string, string, string?, string?][] }[] = [
  { project: "CON", version: "v2.5.0", deployments: [] },
  { project: "CON", version: "v2.4.0", deployments: [["Dev", "deployed", "2026-10-12T09:00:00Z"], ["QA", "testing", "2026-10-15T09:00:00Z"]] },
  { project: "FLT", version: "v1.8.0", deployments: [["Dev", "deployed", "2026-10-08T09:00:00Z"], ["QA", "deployed", "2026-10-12T09:00:00Z"],
    ["UAT", "rolled-back", "2026-10-14T11:00:00Z", "waiting on Maya 2 d", "1190"]] },
  { project: "HRI", version: "v0.9.2", deployments: [["Dev", "deployed", "2026-09-22T09:00:00Z"], ["QA", "deployed", "2026-09-25T09:00:00Z"], ["UAT", "deployed", "2026-09-29T09:00:00Z"], ["Prod", "deployed", "2026-10-01T09:00:00Z"]] },
  // Older, superseded releases (off the Active map, after the mock's four rows in the table). Their
  // proposals' released_at give "Shipped to Prod per week" its W35 to W40 history.
  { project: "CON", version: "v2.3.0", deployments: [["Dev", "deployed", "2026-09-18T09:00:00Z"], ["QA", "deployed", "2026-09-22T09:00:00Z"], ["UAT", "deployed", "2026-09-25T09:00:00Z"], ["Prod", "deployed", "2026-09-30T10:00:00Z"]] },
  ...SHIPPED.map((s) => ({ project: s.project, version: s.version, deployments: [["UAT", "deployed", `${s.day}T09:00:00Z`], ["Prod", "deployed", `${s.day}T14:00:00Z`]] as [string, string, string][] })),
];

const userId = async (tx: Tx, key: string) =>
  ((await tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`))[0]?.id as string | undefined) ?? null;

// Tasks done per week, W35-W42 2026 (Mondays), the portfolio roll-up: the mock's chart.
const WEEKLY = { planned: [28, 30, 30, 32, 32, 34, 34, 36], done: [24, 29, 31, 27, 33, 35, 30, 38] };

/** Pins a tenant's "today" (delivery.clock_pin) for date windows: the e2e tenant uses fixtures.md's Oct 16, 2026. */
export const pinToday = (tx: Tx, tenantId: string, day: string) =>
  tx.execute(sql`insert into delivery.clock_pin (tenant_id, today) values (${tenantId}, ${day}) on conflict (tenant_id) do update set today = excluded.today`);

export const deliveryFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  const ids: Record<string, string> = {};
  for (const [i, p] of PROJECTS.entries()) {
    const s = shared.projects.find((x) => x.key === p.key)!;
    // The manager comes from the shared fixtures (one source for every module).
    const managerKey = s.manager;
    const managerName = shared.people.find((x) => x.key === managerKey)!.name;
    const [row] = await tx.execute(sql`insert into delivery.project (tenant_id, key, name, client, billing, manager_name, manager_user_id, color, sprint, sprint_done, sprint_total,
        health, risk_pct, margin_pct, contract_value, invoiced, currency, next_release, created_at, sprint_start, sprint_end)
      values (${tenantId}, ${p.key}, ${s.name}, ${s.client}, ${s.billing}, ${managerName}, ${await userId(tx, managerKey)}, ${p.color}, ${p.sprint}, ${p.done}, ${p.total},
        ${p.health}, ${p.risk}, ${p.margin}, ${s.contractValue}, ${s.invoiced}, ${s.currency}, ${p.next}, ${new Date(Date.UTC(2026, 0, 1 + i)).toISOString()}, ${p.start}, ${p.end})
      on conflict (tenant_id, key) do update set name = excluded.name returning id`);
    ids[p.key] = row.id as string;
  }
  for (const projectId of Object.values(ids)) {
    for (const [i, name] of ["Dev", "QA", "UAT", "Prod"].entries()) {
      await tx.execute(sql`insert into delivery.environment (tenant_id, project_id, name, position, is_prod) values (${tenantId}, ${projectId}, ${name}, ${i + 1}, ${name === "Prod"}) on conflict do nothing`);
    }
  }
  const releaseIds: Record<string, string> = {};
  for (const [i, r] of RELEASES.entries()) {
    const [row] = await tx.execute(sql`insert into delivery.release (tenant_id, project_id, version, created_at)
      values (${tenantId}, ${ids[r.project]}, ${r.version}, ${new Date(Date.UTC(2026, 9, 10 - i)).toISOString()})
      on conflict (project_id, version) do update set version = excluded.version returning id`);
    releaseIds[`${r.project} ${r.version}`] = row.id as string;
    for (const [env, status, at, note, run] of r.deployments) {
      const exists = await tx.execute(sql`select 1 from delivery.deployment d join delivery.environment e on e.id = d.environment_id where d.release_id = ${row.id} and e.name = ${env} and e.project_id = ${ids[r.project]}`);
      if (exists.length) continue;
      await tx.execute(sql`insert into delivery.deployment (tenant_id, release_id, environment_id, status, at, note, pipeline_run, recorded_by, released)
        select ${tenantId}, ${row.id}, id, ${status}, ${at}, ${note ?? null}, ${run ?? null}, 'fixtures', is_prod and ${status} = 'deployed' from delivery.environment where name = ${env} and project_id = ${ids[r.project]}`);
    }
  }
  for (const [i, p] of [...NAMED, ...fillers()].entries()) {
    const project = p.key.split("-")[0];
    // 081 (demo prep): made on fixtures' Sep 14, before any fixture release (Sep 30) and the Oct 16 update, not on the
    // day the fixtures load, so a proposal's page never reads "made Nov 5, updated Oct 16".
    await tx.execute(sql`insert into delivery.proposal (tenant_id, project_id, key, title, phase, tasks_done, tasks_total, estimate_hours, owner_name, agent, release_id, released_at, updated_at, created_at)
      values (${tenantId}, ${ids[project]}, ${p.key}, ${p.title}, ${p.phase}, ${p.done ?? 0}, ${p.total ?? 0}, ${p.est ?? null}, ${p.owner ?? null}, ${p.agent ?? null},
        ${p.release ? releaseIds[p.release] : null}, ${p.releasedAt ?? null}, ${new Date(Date.UTC(2026, 9, 16, 12, 0, 0) - i * 60_000).toISOString()},
        ${new Date(Date.UTC(2026, 8, 14, 12, 0, 0) - i * 60_000).toISOString()})
      on conflict (tenant_id, key) do nothing`);
  }
  // 081: the fixture owners are people (fixtures.md), so their proposals name them by id too.
  await tx.execute(sql`update delivery.proposal p set owner_user_id = u.id from auth.user u where u.name = p.owner_name and p.owner_user_id is null`);
  // 008 AC-4: the mock's Agent activity feed (fictional people, as in fixtures.md).
  const nimal = await userId(tx, "nimal"), ayesha = await userId(tx, "ayesha");
  const FEED = [
    { at: "2026-10-16T11:56:00Z", actor: "agent:claude", kind: "agent", for: nimal, project: "CON", text: "finished task 3 of CON-014 Invoice export", detail: "1.5 h logged from commit a91f3c2" },
    { at: "2026-10-15T09:10:00Z", actor: ayesha ? `user:${ayesha}` : "user:fixture", kind: "user", for: null, project: "CON", text: "promoted Contoso v2.4.0 to QA", detail: "Confirmed by pipeline run 1182" },
    { at: "2026-10-13T16:40:00Z", actor: "agent:specclaw", kind: "agent", for: null, project: "CON", text: "verified CON-012 SSO token refresh", detail: "4 of 4 criteria pass, tagged v2.4.0" },
  ];
  const fed = await tx.execute(sql`select 1 from delivery.activity limit 1`);
  if (!fed.length) for (const f of FEED) {
    await tx.execute(sql`insert into delivery.activity (tenant_id, at, actor_id, actor_kind, for_user_id, project_id, text, detail) values (${tenantId}, ${f.at}, ${f.actor}, ${f.kind}, ${f.for}, ${ids[f.project]}, ${f.text}, ${f.detail})`);
  }
  // 068 AC-5: tasks closed this month, so Delivery performance has a top contributor (Claude for Nimal, as in the 001 mock).
  const kasunId = await userId(tx, "kasun");
  const closers = [...Array(10).fill(`agent:claude for user:${nimal}`), ...Array(4).fill(`user:${nimal}`), ...Array(6).fill(`user:${kasunId}`)];
  const building = await tx.execute(sql`select id from delivery.proposal where phase in ('building', 'verified') order by key limit 5`);
  for (const [i, by] of closers.entries()) {
    const proposal = building[i % Math.max(1, building.length)];
    if (!proposal || !nimal || !kasunId) break;
    await tx.execute(sql`insert into delivery.task (tenant_id, proposal_id, ref, title, done, done_at, done_by)
      values (${tenantId}, ${proposal.id}, ${`T${Math.floor(i / Math.max(1, building.length)) + 1}`}, ${`Fixture task ${i + 1}`}, true, ${new Date(Date.UTC(2026, 9, 1 + (i % 15), 10)).toISOString()}, ${by})
      on conflict (proposal_id, ref) do nothing`);
  }
  // 081 amendment 4: a hand-made proposal's rows are topped up with open tasks to the total its counters claim (after its
  // done ones), so its pin can offer "Mark T<n> done" and its page lists them. Counters stay as fixtures.md has them.
  await tx.execute(sql`insert into delivery.task (tenant_id, proposal_id, ref, title)
    select p.tenant_id, p.id, 'T' || (coalesce(m.top, 0) + g), 'Open fixture task ' || g
    from delivery.proposal p
    left join lateral (select max(substring(t.ref from 2)::int) as top, count(*)::int as n from delivery.task t where t.proposal_id = p.id) m on true
    cross join lateral generate_series(1, p.tasks_total - coalesce(m.n, 0)) g
    where p.tenant_id = ${tenantId} and p.source is null and p.phase in ('proposed', 'planned', 'building') and p.tasks_total > p.tasks_done
      and not exists (select 1 from delivery.task t where t.proposal_id = p.id and not t.done)
    on conflict (proposal_id, ref) do nothing`);
  // 062: Contoso syncs from its (fictional) repo; the mock's Repo sync card, one push applied and two refused.
  await tx.execute(sql`update delivery.project set repo_url = 'github.com/example/contoso-portal', repo_default_ref = 'main' where id = ${ids.CON} and repo_url is null`);
  const kasun = kasunId;
  const PUSHES = [
    { at: "2026-10-16T09:42:00Z", who: kasun, repo: "github.com/example/contoso-portal", sha: "4f2c9a1e", outcome: "applied", updated: 3, unchanged: 14, reason: null },
    { at: "2026-10-16T09:40:00Z", who: nimal, repo: "github.com/example/contoso-portal", sha: "1b7d0c3f", outcome: "refused", updated: 0, unchanged: 0, reason: "stale: 1b7d0c3 is older than 4f2c9a1, already synced from main" },
    { at: "2026-10-16T08:15:00Z", who: ayesha, repo: "github.com/example/fleet-tracker", sha: "9e8d7c6b", outcome: "refused", updated: 0, unchanged: 0, reason: "repo not linked to CON (github.com/example/fleet-tracker)" },
  ];
  const pushed = await tx.execute(sql`select 1 from delivery.sync_push limit 1`);
  if (!pushed.length) for (const p of PUSHES) {
    await tx.execute(sql`insert into delivery.sync_push (tenant_id, project_id, at, actor_id, actor_kind, repo_url, ref, sha, committed_at, outcome, updated, unchanged, reason)
      values (${tenantId}, ${ids.CON}, ${p.at}, ${p.who ? `user:${p.who}` : "user:fixture"}, 'user', ${p.repo}, 'main', ${p.sha}, ${p.at}, ${p.outcome}, ${p.updated}, ${p.unchanged}, ${p.reason})`);
  }
  for (let i = 0; i < 8; i++) {
    const week = new Date(Date.UTC(2026, 7, 24 + i * 7)).toISOString().slice(0, 10);
    await tx.execute(sql`insert into delivery.weekly_stat (tenant_id, project_id, week, planned, done) values (${tenantId}, null, ${week}, ${WEEKLY.planned[i]}, ${WEEKLY.done[i]}) on conflict do nothing`);
  }
};
