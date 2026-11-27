import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { createRelease, recordDeployment, voidDeployment } from "../server/services";
import { getProject, getRelease, listEnvironments } from "../server/queries";
import { ReleaseBody } from "../ui/ReleasePage";
import { completedLine } from "../ui/ReleaseInfo";
import { dayLabel } from "../server/release-status";
import { When } from "../ui/When";
import { mcpTools } from "../mcp";
import { OPEN, releaseDb, T } from "./release-db";

describe.skipIf(!hasDb)("125 the release page (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  let done: string, open: string;
  const page = async (viewer: Viewer, key: string, version: string) => {
    const [release, envs, project] = await Promise.all([getRelease(db.sahan, key, version), listEnvironments(db.sahan, key), getProject(db.sahan, key)]);
    return renderToStaticMarkup(createElement(ReleaseBody, { viewer, release: { ...release!, projectId: project!.project.id }, envs }));
  };
  beforeAll(async () => {
    db = await releaseDb();
    const p = await db.proposal("RTK");
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "d1", name: "Done one", proposalKeys: [p] });
    for (const environment of ["Dev", "UAT"]) await recordDeployment(db.admin(), { projectKey: "RTK", version: "d1", environment, pipelineRun: `run-${environment}` });
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "o1", name: "Open one" });
    [done, open] = [await page(db.sahan, "RTK", "d1"), await page(db.sahan, "RTK", "o1")];
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-5 the information card: category, status, dates and the completion with On time", () => {
    expect(done).toMatch(/<dt>Category<\/dt><dd>UAT<\/dd>/);
    expect(done).toMatch(/<dt>Completed<\/dt><dd>\d+ \w+ \d{4} · On time<\/dd>/);
    expect(open).toMatch(/<dt>Completed<\/dt><dd><span class="muted">Not yet<\/span>/);
  });

  it("AC-6 the proposals card links each proposal and shows its phase", () => {
    expect(done).toMatch(/href="\/delivery\/proposals\/RTK-\d+"><b>RTK-\d+<\/b>/);
    expect(done).toContain(">Verified<");
  });

  it("AC-7 deployments grouped by environment, the completing one marked, an empty environment said so", () => {
    expect(done).toMatch(/aria-label="UAT deployments">.*Run run-UAT.*Completed the release/);
    expect(done).toMatch(/aria-label="Dev deployments">(?:(?!Completed the release).)*<\/section>/);
    expect(done).toMatch(/aria-label="Prod deployments"><h3>Prod<span class="chip">Prod<\/span><\/h3><p class="muted">Not deployed yet/);
  });

  it("AC-8 the status history: from, to, why and who, oldest first", () => {
    expect(done).toMatch(/Created<\/td>.*Deployed to UAT<\/td>/);
    expect(done).toMatch(/In progress<\/span><\/td><td data-label="To"><span class="chip">Completed/);
    expect(done).not.toMatch(/(user|sp):[0-9a-f]{8}-/);
  });

  it("AC-7 AC-8 each history row pins its own change; the completion day is the project's; times render labelled UTC until the browser has them", async () => {
    const release = (await getRelease(db.sahan, "RTK", "d1"))!;
    const change = release.statusHistory.at(-1)!;
    expect(done).toContain(`&quot;tool&quot;:&quot;get_release_status_change&quot;,&quot;args&quot;:{&quot;changeId&quot;:&quot;${change.id}&quot;}`);
    expect(await mcpTools.find((t) => t.name === "get_release_status_change")!.run(db.sahan as never, { changeId: change.id } as never, "mcp")).toMatchObject({ id: change.id, to: "completed" });
    expect(completedLine({ ...release, completedAt: null })).toBeNull();
    expect(renderToStaticMarkup(createElement(When, { at: "2026-12-12T20:05:00Z" }))).toContain("12 Dec 2026, 20:05 UTC");
  });

  // The whole path, nothing planted: each release completes through recordDeployment and is voided through voidDeployment,
  // its target set beside the zone's midnight. The expected day comes from Intl, not from releaseDay, so the day getRelease
  // reads, the day completeOnDeployment judged `completion` by, and the word beside it must all agree.
  const dayIn = (zone: string, at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const targets = { "its own day": (d: string) => d, "the day before": dayBefore, "the UTC day": (_: string, utc: string) => utc };
  it.each(["Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Colombo", null].flatMap((zone) => Object.keys(targets).map((target) => ({ zone, target }))))(
    "AC-5 AC-7 the completed and voided days are the project's, beside On time or Late: $zone, target $target", async ({ zone, target }) => {
      const [e] = await db.t.owner`select id from core.legal_entity where tenant_id = ${T} limit 1`;
      if (zone) await db.t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${e.id}, ${T}, ${zone}) on conflict (legal_entity_id) do update set timezone = excluded.timezone`;
      await db.t.owner`update delivery.project set legal_entity_id = ${zone ? e.id : null} where key = 'RTK'`;
      const now = new Date();
      const targetDate = targets[target as keyof typeof targets](dayIn(zone ?? "UTC", now), dayIn("UTC", now));
      const version = `z-${zone ?? "utc"}-${target}`.replace(/\W+/g, "-");
      await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version, targetDate });
      await recordDeployment(db.admin(), { projectKey: "RTK", version, environment: "UAT" });
      await voidDeployment(db.admin(), { projectKey: "RTK", version, environment: "UAT", reason: "wrong run" });
      const release = (await getRelease(db.sahan, "RTK", version))!;
      const day = dayIn(zone ?? "UTC", new Date(release.completedAt!));
      const word = day > targetDate ? "Late" : "On time";
      expect([release.completedDay, release.completingVoided?.day, release.completion]).toEqual([day, dayIn(zone ?? "UTC", new Date(release.completingVoided!.at)), day > targetDate ? "late" : "on_time"]);
      const html = await page(db.sahan, "RTK", version);
      expect(html).toContain(`<dt>Completed</dt><dd>${dayLabel(day)} · ${word}</dd>`);
      expect(html).toContain(`Completed on ${dayLabel(day)} · ${word}`);
      expect(html).toContain(`was voided on ${dayLabel(release.completingVoided!.day)}: wrong run`);
      if (target === "the day before") expect(word).toBe("Late");
    });

  it("AC-9 AC-10 Edit for an Admin on an open release; a PM elsewhere is told; a completed release is read-only", async () => {
    expect(open).toMatch(/data-ask="Edit release o1 of RTK"[^>]*>.*Edit release/);
    const other = await page(db.maya, "RTK", "o1");
    expect(other).toContain("Only the project&#x27;s PM or an Admin can change a release.");
    expect(other).not.toContain("Edit release");
    expect(done).toContain("A completed release can&#x27;t change.");
    for (const button of ["Edit release", "Ask amax to re-tag", "Ask amax to change the proposals"]) expect(done).not.toContain(button);
    expect(await page(db.sahan, "CON", "v2.4.0")).toMatch(/isn&#x27;t tracked yet.*Ask amax to track it|Ask amax to track it.*isn&#x27;t tracked yet/);
  });
});
