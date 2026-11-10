import { fakeProvider } from "./fake";
import { scriptedWrite } from "./scripted-writes";

// A deterministic stand-in model for e2e tests and local demos without an API key
// (AMAX_AI_PROVIDER=scripted, refused in production). It recognises "add <title> to <KEY>", "add a task to PS-0000: <title>",
// "rotate the <connector> token", "create a service credential named <name> with <scopes> for <n> days" (035) and "pause|resume the <title> schedule" and "revoke <client> for <person>" with the grant pinned (047),
// the Ask amax prompts of time, allocations, delivery and presales (054, scripted-writes.ts),
// "open an erasure|access request for <person>" and "approve the erasure request" with it pinned (032), "run a restore drill now",
// "export all our data. Reason: <why>" and "approve the tenant export" with it pinned (034), and otherwise lists projects, so the full chat path runs end to end.
export function scriptedProvider() {
  return fakeProvider((req) => {
    const last = req.messages.at(-1)!;
    if (last.role === "user" && last.content[0]?.type === "tool_result") {
      const r = last.content[0];
      if (r.isError) return { text: `I couldn't do that: ${r.content}` };
      if (r.content.includes("awaiting_confirmation")) return { text: "Here's what I'll add. Check it and confirm." };
      if (r.content.includes("awaiting_answer")) return { text: "Which project is it for?" };
      const body = r.content.replace(/^<data[^>]*>\n|\n<\/data>$/g, "");
      const n = (() => { try { const v = JSON.parse(body); return Array.isArray(v) ? v.length : 1; } catch { return 0; } })();
      return { text: `I found ${n} result${n === 1 ? "" : "s"}.` };
    }
    const text = last.content.map((b) => (b.type === "text" ? b.text : "")).join(" ");
    const own = last.content.at(-1);
    const writes = own?.type === "text" ? scriptedWrite(own.text) : null;
    if (writes?.length) return { toolCalls: writes };
    const task = text.match(/add a task to (PS-\d{4}):\s*(.+?)\s*$/i);
    if (task) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "add_opportunity_task", input: { number: task[1], title: task[2] } }] };
    const rotate = text.match(/rotate the (.+?) (?:token|secret|key)\b/i);
    if (rotate) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "rotate_secret", input: { connector: rotate[1].toLowerCase().replace(/[^a-z0-9]+/g, "-") } }] };
    const cred = text.match(/create a service credential named (.+?) with ([a-z0-9:, -]+?) for (\d+) days/i);
    if (cred) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "create_api_credential", input: { name: cred[1], scopes: cred[2].split(/,\s*/), days: Number(cred[3]) } }] };
    const toggle = text.match(/\b(pause|resume) the (.+) schedule\b/i);
    if (toggle) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "set_schedule_enabled", input: { schedule: toggle[2], enabled: toggle[1].toLowerCase() === "resume" } }] };
    const [clientId, userId] = [/"clientId":\s*"([^"]+)"/, /"userId":\s*"([^"]+)"/].map((re) => text.match(re)?.[1]);
    if (/\brevoke .+ for .+$/i.test(text) && clientId && userId) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "revoke_mcp_client", input: { clientId, userId } }] };
    const privacy = text.match(/\bopen an? (erasure|access) request for (.+?)\s*$/im);
    if (privacy) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "open_privacy_request", input: { kind: privacy[1].toLowerCase(), person: privacy[2] } }] };
    const exportId = text.match(/"(?:exportId|id)":\s*"([0-9a-f-]{36})"/)?.[1];
    if (/\bapprove the tenant export\b/i.test(text) && exportId) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "approve_tenant_export", input: { exportId } }] };
    const exportAll = text.match(/\bexport all our data\. reason:\s*(.+?)\s*$/im);
    if (exportAll) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "request_tenant_export", input: { reason: exportAll[1] } }] };
    if (/\brun a restore drill now\b/i.test(text)) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "request_restore_drill", input: {} }] };
    const requestId = text.match(/"id":\s*"([0-9a-f-]{36})"/)?.[1];
    if (/\bapprove the (erasure|access) request\b/i.test(text) && requestId) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "complete_privacy_request", input: { id: requestId } }] };
    const add = text.match(/add (.+) to ([A-Z][A-Z0-9]{1,9})\s*$/);
    if (add) return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "create_proposal", input: { projectKey: add[2], title: add[1] } }] };
    return { toolCalls: [{ type: "tool_use", id: `t${Date.now()}`, name: "list_projects", input: {} }] };
  });
}
