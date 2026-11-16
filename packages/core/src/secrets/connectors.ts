export type Connector = { name: string; usedFor: string; noun: string; logo: string; color: string };

export const CONNECTORS = {
  "msgraph-read": { name: "Microsoft Graph, read", usedFor: "People, licences, devices sync", noun: "secret", logo: "E", color: "#2F6FEB" },
  "msgraph-write": { name: "Microsoft Graph, write", usedFor: "Approved access changes only", noun: "secret", logo: "E", color: "#2F6FEB" },
  "azure-devops": { name: "Azure DevOps", usedFor: "Commits, pipelines, webhooks", noun: "token", logo: "D", color: "#0078D4" },
  github: { name: "GitHub", usedFor: "Commits, pull requests, webhooks", noun: "token", logo: "G", color: "#24292F" },
  "github-oauth": { name: "GitHub accounts app", usedFor: "People connecting their GitHub accounts (client id:client secret)", noun: "secret", logo: "G", color: "#24292F" },
  "stp-gateway": { name: "STP gateway", usedFor: "Single Touch Payroll lodgement", noun: "key", logo: "S", color: "#00843D" },
  xero: { name: "Xero", usedFor: "Payroll journals, invoices", noun: "secret", logo: "X", color: "#13B5EA" },
  keyflow: { name: "Keyflow", usedFor: "Two-way people and goals sync", noun: "key", logo: "K", color: "linear-gradient(135deg,#7B61FF,#2FCB8C)" },
  "zoho-sign": { name: "Zoho Sign", usedFor: "Offers and contracts", noun: "token", logo: "Z", color: "#E42527" },
  teams: { name: "Microsoft Teams", usedFor: "Notifications and approvals in Teams", noun: "secret", logo: "T", color: "#5059C9" },
  "msgraph-mail": { name: "Microsoft Graph, mail", usedFor: "Notification emails", noun: "secret", logo: "E", color: "#2F6FEB" },
  "github-webhook": { name: "GitHub webhooks", usedFor: "Verifying incoming GitHub webhooks", noun: "secret", logo: "G", color: "#24292F" },
  "azure-devops-webhook": { name: "Azure DevOps webhooks", usedFor: "Verifying incoming service hooks", noun: "secret", logo: "D", color: "#0078D4" },
  "msgraph-webhook": { name: "Microsoft Graph notifications", usedFor: "Verifying change notifications (clientState)", noun: "secret", logo: "E", color: "#2F6FEB" },
  "amax-webhook": { name: "amax webhook signing", usedFor: "Signing outgoing webhooks and verifying signed calls", noun: "secret", logo: "A", color: "#6A6681" },
} as const satisfies Record<string, Connector>;

export type ConnectorId = keyof typeof CONNECTORS;
export const CONNECTOR_IDS = Object.keys(CONNECTORS) as [ConnectorId, ...ConnectorId[]];
export const REVOKE_REASONS = ["replaced", "compromised", "unused"] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];
