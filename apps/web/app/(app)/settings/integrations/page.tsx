import { notFound } from "next/navigation";
import { can, roleLabel } from "@amax/auth";
import { installed } from "../../../../lib/registry";
import { connectedClients, toolCatalogue } from "@amax/mcp/admin";
import { PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { GitHubAppCard, type GitHubAppStatus } from "../../../../components/settings/GitHubAppCard";
import { getDb, toolRegistry } from "../../../../lib/server";
import { getViewer } from "../../../../lib/viewer";
import "../settings.css";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

const CLIENTS = { label: "Connected clients", tool: "list_mcp_clients", args: {} };

// Chat-first (047): revoking a client is an "Ask amax" chip; chat confirms revoke_mcp_client.
export default async function IntegrationsPage() {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "mcp:client:read")) notFound();
  const tools = toolCatalogue(toolRegistry(), viewer.tenantId);
  const clients = await connectedClients(getDb()!, viewer.tenantId);
  const modules = [...new Set(tools.map((t) => t.module))];
  const gitAccounts = installed.some((m) => m.id === "git-accounts") && can(viewer, "git-accounts:read");
  // 116 AC-4: the app's state through the same read tool chat and MCP use; its rotation date and the callback URL GitHub needs.
  const app = gitAccounts ? await toolRegistry().call(viewer, "get_github_app_status", {}, { source: "chat" }) as GitHubAppStatus : null;
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/settings">Settings</a><span>/</span>Integrations</nav>
      <div className="row head"><div><h1>Integrations</h1><p className="lede">Every amax capability is an MCP tool with the same permissions as the screens. Claude and other MCP clients connect at <code>/api/mcp</code> with OAuth; each person approves the scopes. Changes happen in chat. Pin anything, then ask.</p></div></div>
      {app && <GitHubAppCard app={app} />}
      <div className="card flush pinnable" style={{ marginBottom: 28 }}>
        <div className="card-head"><h2>Connected clients</h2><PinButton inline pin={CLIENTS} /><span className="muted" style={{ fontSize: 13 }}>{clients.length} active</span></div>
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Connected clients</caption>
          <thead><tr><th>Client</th><th>Person</th><th>Scopes</th><th>Last sign-in</th><th className="num"><span className="sr">Ask</span></th></tr></thead>
          <tbody>
            {clients.length === 0 && <tr><td colSpan={5} className="muted">No MCP clients connected yet.</td></tr>}
            {clients.map((c) => {
              const pin = { label: `${c.clientName} for ${c.userName}`, tool: "get_mcp_client", args: { clientId: c.clientId, userId: c.userId } };
              return (
                <tr key={`${c.clientId}-${c.userId}`} className="pinnable"><td data-label="Client"><b>{c.clientName}</b></td><td data-label="Person">{c.userName}</td><td data-label="Scopes">{c.scopes.join(", ")}</td>
                  <td data-label="Last sign-in">{new Date(c.lastAuth).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}</td>
                  <td className="num"><AskButton label="Ask to revoke" prompt={`Revoke ${c.clientName} for ${c.userName}`} pin={pin} tool="revoke_mcp_client" name={`Ask to revoke ${c.clientName} for ${c.userName}`} /><PinButton pin={pin} /></td></tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
      {modules.map((m) => (
        <div className="card flush pinnable" key={m} style={{ marginBottom: 28 }}>
          <div className="card-head"><h2>{m === "core" ? "Built in" : m}</h2><PinButton inline pin={{ label: `${m === "core" ? "Built-in" : m} tools`, tool: "list_mcp_tools", args: { module: m } }} /><span className="muted" style={{ fontSize: 13 }}>{tools.filter((t) => t.module === m).length} tools</span></div>
          <div className="scroll-x"><table className="tbl">
            <caption className="sr">{m} tools</caption>
            <thead><tr><th>Tool</th><th>Scope</th><th>Who can use it</th></tr></thead>
            <tbody>
              {tools.filter((t) => t.module === m).map((t) => (
                <tr key={t.name} className="pinnable"><td data-label="Tool"><b><code>{t.name}</code></b><small>{t.description}</small></td>
                  <td data-label="Scope"><span className={`chip ${t.scope === "write" ? "warn" : t.scope === "sensitive" ? "bad" : "good"}`}>{t.scope}</span>{t.destructive && <span className="chip bad">destructive</span>}</td>
                  <td data-label="Who can use it">{t.roles.map(roleLabel).join(", ")}<PinButton pin={{ label: t.name, tool: "get_mcp_tool", args: { name: t.name } }} /></td></tr>
              ))}
            </tbody>
          </table></div>
        </div>
      ))}
    </>
  );
}
