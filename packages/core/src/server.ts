// Server-only surface: services, audit, tenancy. Kept out of the root export so client bundles
// that import manifests never pull in the database driver or node:crypto.
export { authorize, contextFor, ForbiddenError, isSystemContext, setAuthorizer, type Actor, type Authorizer, type ServiceContext, type Source } from "./authorize";
export { appendAudit, canonical, redact, SENSITIVITY_CLASSES, verifyAuditChain, type ChainResult, type Sensitivity } from "./audit";
export { keyed } from "./chain-key";
export { currentTrace, withTrace, type Trace } from "./trace-context";
export { appendTrace, traceStep, traceStepOrFail, verifyTraceChain, type TraceKind, type TraceStep } from "./trace";
export { configureRuntime, defineService, getRuntime, ValidationError, type Emitted, type Runtime, type ServiceOutcome, type ServiceSpec } from "./service";
export * as coreSchema from "./schema";
export { nextRun, onceForEvent, registryFrom, runDueJobs, scheduleJob, type JobRegistry, type TickResult } from "./jobs";
export { memoryStorage, ObjectLockedError, s3Storage, storageFromEnv, type PutOptions, type S3Config, type Storage } from "./adapters/storage";
export { memoryCache, type Cache } from "./adapters/cache";
export { auditExportJob, exportAuditDay } from "./audit-export";
export { auditStatus, getTrace, searchAudit, type AuditEntry, type AuditFilter, type AuditStatus, type ChainName, type TraceStepView } from "./audit-read";
export { logError } from "./log";
export { hasModule, setInstalledModules } from "./installed";
export { CancelledByKeyError, claimKey, KEY_DAYS, keyedOutcome, lookupKey, pruneKeysJob, ReplayedError, retryable, settleKey, UndeclaredWriteError, withIdempotency, type KeyedRun, type KeyOutcome, type Replay } from "./idempotency";
export { configureRateLimits, pageChannel, enforceRate, limitsFromEnv, rateLimits, RateLimitedError, takeRate, type Bucket, type Limited, type Limits, type RateChannel, type RateKey } from "./rate-limit";
