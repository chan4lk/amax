import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import type { ScreenProps } from "@amax/core";
import { Card, EmptyState, facet, PinButton } from "@amax/ui";
import { PERSON_SECTIONS } from "../contracts";
import { personPin } from "../pins";
import { getPersonView } from "../server/queries";
import { readHr } from "../server/read";
import { DocumentsCard } from "./DocumentsCard";
import { EmploymentCard } from "./EmploymentCard";
import { avClass, countryName, longDate, needViewer, SignInFirst, statusChip } from "./parts";

const installedSections = (viewer: Parameters<typeof readHr>[0]) => readHr(viewer, async (tx) =>
  (await Promise.all(PERSON_SECTIONS.map(async (s) => ((await tx.execute(sql`select to_regnamespace(${s.schema}) is not null as on`))[0]?.on ? [s] : [])))).flat());

export async function PersonPage({ params, viewer: raw }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Person</h1><SignInFirst /></>;
  const view = await getPersonView(viewer, params.employeeNo);
  if (!view) notFound();
  const { person: p } = view;
  const sections = await installedSections(viewer);
  const [tone, label] = statusChip(p, p.asOf);
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/hr">People</a><span aria-hidden="true">/</span>{p.name}</nav>
      <div className="profile">
        <div className="card idcard pinnable">
          <span className={`av lg ${avClass(p.name)}`} style={{ width: 88, height: 88, borderRadius: 28, fontSize: 26 }} aria-hidden="true">{p.initials}</span>
          <h1>{p.name}</h1><span className="muted" style={{ fontSize: 14 }}>{p.title}</span>
          <div className="chips"><span className={`chip ${tone}`}>{label}</span><span className="chip">{countryName(p.country, p.entityName)}</span><PinButton inline pin={personPin(p)} /></div>
          <dl className="kv">
            <dt>Employee no.</dt><dd>{p.employeeNo}</dd>
            <dt>Joined</dt><dd>{longDate(p.joinedOn)}</dd>
            <dt>Manager</dt><dd>{p.managerName ?? "–"}</dd>
            <dt>Department</dt><dd>{p.department ?? "–"}</dd>
            <dt>Work email</dt><dd>{view.workEmail ?? "–"}</dd>
            <dt>Location</dt><dd>{view.location ?? "–"}</dd>
          </dl>
        </div>
        <div className="stack">
          <nav className="tabs" aria-label="Sections">
            <a className="btn sm" href="#employment" aria-current="true">Employment</a>
            <a className="btn sm" href="#documents">Documents</a><a className="btn sm" href="#leave">Leave</a>
            {sections.map((s) => <a key={s.path} className="btn sm" href={`/hr/p/${encodeURIComponent(p.employeeNo)}/${s.path}`}>{s.label}</a>)}
          </nav>
          <div className="cols even">
            <EmploymentCard e={view.employment} probationEnds={p.probationEnds} person={p} />
            <DocumentsCard docs={view.documents} person={p} />
          </div>
          <div className="cols even">
            <div id="leave"><Card title="Leave balance" actions={<PinButton inline pin={facet(personPin(p), ", leave")} />}><EmptyState icon="calendar" title="No leave balances yet" hint="Balances show here once the Leave module is installed." /></Card></div>
          </div>
        </div>
      </div>
    </>
  );
}
