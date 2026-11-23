import { z } from "zod";

const postgresUrl = z.string().regex(/^postgres(ql)?:\/\//, "a postgres:// URL");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AMAX_BASE_URL: z.url().optional(),
  // 108: GitHub's web and API origins for people's Git accounts; set only to point tests at a fake GitHub.
  AMAX_GITHUB_URL: z.url().optional(),
  AMAX_GITHUB_API_URL: z.url().optional(),
  AMAX_MODULES_DISABLED: z.string().regex(/^[a-z0-9,-]*$/, "comma-separated module ids").optional(),
  PORT: z.coerce.number().int().positive().optional(),
  // App connection (role amax_app, row-level security applies) and the schema owner for migrations.
  // Both optional so the app still boots and serves /healthz before a database is configured.
  DATABASE_URL: postgresUrl.optional(),
  DATABASE_MIGRATE_URL: postgresUrl.optional(),
  // Keys the HMAC that replaces classified values in the audit. Moves to 031 secrets later.
  AUDIT_HASH_KEY: z.string().min(32, "at least 32 characters").optional(),
  CRON_SECRET: z.string().min(16, "at least 16 characters").optional(),
  // Auth.js session encryption; required once DATABASE_URL is set (sign-in is enforced then).
  AUTH_SECRET: z.string().min(32, "at least 32 characters").optional(),
  // Fixtures-only "sign in as" for local and CI e2e. Ignored when NODE_ENV=production.
  AMAX_AUTH_DEMO: z.enum(["0", "1"]).optional(),
  AMAX_AUTH_DEMO_TENANT: z.uuid().optional(),
  // Email + password sign-in for one tenant, for deployments without Entra (allowed in production).
  AMAX_AUTH_PASSWORD_TENANT: z.uuid().optional(),
  // 062: the "Book a demo" mailto on the public marketing page; the button hides when unset.
  AMAX_SALES_EMAIL: z.email().optional(),
  // S3-compatible object storage (S3, R2, MinIO). The audit export bucket needs object lock.
  S3_ENDPOINT: z.url().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),
  // 033 AI gateway: Haiku first, Sonnet when Haiku fails (product owner, 2026-10-17). The key itself
  // (ANTHROPIC_API_KEY) is read by the provider SDK; loadEnv checks it but keeps only that it is set.
  AMAX_AI_MODEL: z.string().default("claude-haiku-5-5"),
  AMAX_AI_FALLBACK_MODEL: z.string().default("claude-sonnet-5-5"),
  // 044: where AI calls go and the region it serves from (AU, LK, …). Under a data region the gate
  // blocks AI unless this region is set and matches.
  AMAX_AI_ENDPOINT: z.url().optional(),
  AMAX_AI_ENDPOINT_REGION: z.string().optional(),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(2555),
  ANTHROPIC_API_KEY: z.string().min(20, "at least 20 characters").optional().transform((v) => (v ? ("set" as const) : undefined)),
  // 031 key service that wraps each tenant's data key. Tenant credentials themselves never come from here.
  AMAX_KMS: z.enum(["local", "aws", "azure"]).optional(),
  AMAX_KMS_KEY_FILE: z.string().min(1).optional(),
  AMAX_KMS_REGION: z.string().optional(),
  AMAX_KMS_AWS_KEY_ID: z.string().min(1).optional(),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SESSION_TOKEN: z.string().optional(),
  AMAX_KMS_AZURE_VAULT_URL: z.url().optional(),
  AMAX_KMS_AZURE_KEY: z.string().min(1).optional(),
  AZURE_TENANT_ID: z.string().optional(),
  AZURE_CLIENT_ID: z.string().optional(),
  AZURE_CLIENT_SECRET: z.string().optional(),
  // 034 backups. Point-in-time recovery is the host's (CloudNativePG, Neon, Supabase, RDS): these say
  // what it is set to, so the Backups screen can show it. Tenant snapshots go to AMAX_BACKUP_DIR (a
  // volume in AMAX_BACKUP_REGION) or to S3_BACKUP_BUCKET, with S3_BACKUP_BUCKETS mapping regions to buckets.
  AMAX_PITR: z.string().regex(/^[a-z0-9-]+$/).optional(),
  AMAX_PITR_RPO_MINUTES: z.coerce.number().int().positive().optional(),
  AMAX_PITR_WINDOW_DAYS: z.coerce.number().int().positive().optional(),
  AMAX_BACKUP_DIR: z.string().min(1).optional(),
  AMAX_BACKUP_REGION: z.string().optional(),
  S3_BACKUP_BUCKET: z.string().optional(),
  // The restore drill's scratch database (its owner): wiped, restored into and wiped again each drill.
  AMAX_DRILL_DATABASE_URL: postgresUrl.optional(),
  S3_BACKUP_BUCKETS: z.string().regex(/^([A-Za-z]{2}=[\w.-]+)(,[A-Za-z]{2}=[\w.-]+)*$/, "REGION=bucket pairs, comma-separated").optional(),
  // 035 rate limits per one-minute window. Unset keeps the defaults in rate-limit.ts.
  AMAX_RATE_PAGE_USER: z.coerce.number().int().positive().optional(),
  AMAX_RATE_PAGE_TENANT: z.coerce.number().int().positive().optional(),
  AMAX_RATE_CALL_TOKEN: z.coerce.number().int().positive().optional(),
  AMAX_RATE_CALL_USER: z.coerce.number().int().positive().optional(),
  AMAX_RATE_CALL_TENANT: z.coerce.number().int().positive().optional(),
}).superRefine((env, ctx) => {
  const needs: Record<string, (keyof typeof env)[]> = {
    local: ["AMAX_KMS_KEY_FILE"],
    aws: ["AMAX_KMS_AWS_KEY_ID", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    azure: ["AMAX_KMS_AZURE_VAULT_URL", "AMAX_KMS_AZURE_KEY", "AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"],
  };
  for (const name of env.AMAX_KMS ? needs[env.AMAX_KMS] : []) {
    if (!env[name]) ctx.addIssue({ code: "custom", path: [name], message: `required when AMAX_KMS=${env.AMAX_KMS}` });
  }
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  throw new Error(`amax: invalid environment configuration\n${lines.join("\n")}\nFix these variables and restart.`);
}
