import { sql } from "drizzle-orm";
import { createDb, migrate, migrationScopes, withTenant, type Db, type Tx } from "@amax/db";
import { verifyAuditChain } from "../audit";
import { dataKeyFor } from "../secrets/runtime";
import { BackupError } from "./catalog";
import { backupConfig } from "./config";
import type { DrillOutcome } from "./drill";
import { openJson, snapshotKey } from "./snapshot";
import { countRows, tableIdent, type TableRef } from "./tables";

/** The database's own reason (drizzle wraps it with the whole query and its rows), never row values. */
const reason = (e: unknown) => String((e as { cause?: Error })?.cause?.message ?? (e instanceof Error ? e.message : e)).slice(0, 300);

type Snapshot = { id: string; region: string | null; takenAt: string; tables: Record<string, number> };
const ref = (name: string): TableRef => ({ name, schema: name.split(".")[0], table: name.slice(name.indexOf(".") + 1) });

async function latest(live: Db, tenantId: string): Promise<Snapshot> {
  const [s] = await withTenant(live, tenantId, (tx) => tx.execute(sql`select id, region, taken_at, tables from backup.snapshot where pruned_at is null order by taken_at desc limit 1`));
  if (!s) throw new BackupError("there is no snapshot to restore");
  return { id: s.id as string, region: (s.region as string | null) ?? null, takenAt: new Date(s.taken_at as string).toISOString(), tables: s.tables as Record<string, number> };
}

/** Every non-system schema dropped (no restored row outlives the drill), then migrated when asked. */
async function resetScratch(url: string, root: string | null) {
  const owner = createDb(url, { max: 1 }).client;
  try {
    const schemas = await owner`select nspname from pg_namespace where nspname not like 'pg\_%' and nspname not in ('information_schema', 'public')`;
    for (const s of schemas) await owner.unsafe(`drop schema "${String(s.nspname).replaceAll('"', '""')}" cascade`);
    if (root) await migrate(owner, migrationScopes(root));
  } finally {
    await owner.end();
  }
}

/**
 * Parents before children by foreign key, so each table's single insert finds the rows it points at. A key deferred by
 * default (`initially deferred`) is checked at the restore's commit, so it doesn't order anything (154: release and deployment point at each other). Tables
 * still left with no parent restored first are a cycle of keys checked at once: refused, naming them, never loaded in no
 * order.
 */
export async function inOrder(tx: Tx, names: string[]) {
  const edges = await tx.execute(sql`select cn.nspname || '.' || cc.relname as child, pn.nspname || '.' || pc.relname as parent from pg_constraint c
    join pg_class cc on cc.oid = c.conrelid join pg_namespace cn on cn.oid = cc.relnamespace join pg_class pc on pc.oid = c.confrelid join pg_namespace pn on pn.oid = pc.relnamespace
    where c.contype = 'f' and c.conrelid <> c.confrelid and not c.condeferred`);
  const deps = new Map(names.map((n) => [n, new Set(edges.filter((e) => e.child === n && names.includes(e.parent as string)).map((e) => e.parent as string))]));
  const out: string[] = [];
  while (out.length < names.length) {
    const ready = names.filter((n) => !out.includes(n) && [...deps.get(n)!].every((p) => out.includes(p)));
    if (!ready.length) throw new BackupError(`these tables' foreign keys form a cycle checked at once, so no restore order exists: ${names.filter((n) => !out.includes(n)).sort().join(", ")}`);
    out.push(...ready);
  }
  return out;
}

async function userTriggers(tx: Tx, names: string[], on: boolean) {
  for (const n of names) await tx.execute(sql`alter table ${tableIdent(ref(n))} ${on ? sql`enable` : sql`disable`} trigger user`);
}

async function load(tx: Tx, t: TableRef, rows: unknown[]) {
  await tx.execute(sql`insert into ${tableIdent(t)} overriding system value select * from jsonb_populate_recordset(null::${tableIdent(t)}, ${JSON.stringify(rows)}::jsonb)`);
}

/** AC-3: restores the tenant's latest snapshot into the scratch database and checks it. */
export async function restoreLatest(o: { live: Db; scratchUrl: string; root: string; tenantId: string; drillId: string | null }): Promise<DrillOutcome> {
  const startedAt = new Date();
  const base = { drillId: o.drillId, snapshotId: null, backupTakenAt: null, startedAt: startedAt.toISOString(), tablesChecked: 0, rowsChecked: 0, mismatches: [], chainOk: null, chainLength: null };
  let snap: Snapshot | null = null;
  try {
    snap = await latest(o.live, o.tenantId);
    const storage = backupConfig().storageFor(snap.region);
    if (!storage) throw new BackupError(`no backup storage is configured in the snapshot's region (${snap.region})`);
    const key = await withTenant(o.live, o.tenantId, (tx) => dataKeyFor(tx, o.tenantId));
    await resetScratch(o.scratchUrl, o.root);
    const { db, client } = createDb(o.scratchUrl, { max: 1 });
    try {
      const checked = await withTenant(db, o.tenantId, async (tx) => {
        const mismatches: DrillOutcome["mismatches"] = [];
        let rows = 0;
        // 154: user triggers off for the whole load and back on after it: a table can't be altered while a deferred key
        // check it queued (release ↔ deployment) is pending, so those run first, together, once every row is in.
        const order = await inOrder(tx, Object.keys(snap!.tables));
        await userTriggers(tx, order, false);
        for (const name of order) {
          const body = await storage.get(snapshotKey(o.tenantId, snap!.id, name));
          await load(tx, ref(name), body ? openJson<unknown[]>(key, body, o.tenantId, snap!.id, name) : []);
          const restored = await countRows(tx, ref(name));
          rows += restored;
          if (restored !== snap!.tables[name]) mismatches.push({ table: name, expected: snap!.tables[name], restored });
        }
        await tx.execute(sql`set constraints all immediate`);
        await userTriggers(tx, order, true);
        return { mismatches, rows, chain: await verifyAuditChain(tx, o.tenantId) };
      });
      return { ...base, snapshotId: snap.id, backupTakenAt: snap.takenAt, durationMs: Date.now() - startedAt.getTime(), tablesChecked: Object.keys(snap.tables).length, rowsChecked: checked.rows, mismatches: checked.mismatches, chainOk: checked.chain.ok, chainLength: checked.chain.ok ? checked.chain.length : null, error: null };
    } finally {
      await client.end();
      await resetScratch(o.scratchUrl, null);
    }
  } catch (e) {
    return { ...base, snapshotId: snap?.id ?? null, backupTakenAt: snap?.takenAt ?? null, durationMs: Date.now() - startedAt.getTime(), error: reason(e) };
  }
}
