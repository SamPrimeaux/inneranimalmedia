#!/usr/bin/env node
/**
 * Real browser capability path via POST /api/agent/chat (SSE).
 * Requires: IAM_BASE_URL, INGEST_SECRET, IAM_TENANT_ID, IAM_WORKSPACE_ID, IAM_USER_ID (D1 user id for trusted origins).
 * Optional: IAM_D1_DB for remote row verification.
 *
 *   IAM_BASE_URL=https://inneranimalmedia.com INGEST_SECRET=... \
 *   IAM_TENANT_ID=... IAM_WORKSPACE_ID=... IAM_USER_ID=... \
 *   node scripts/e2e/workspace-capability-real-action.mjs
 */
import { execFileSync } from "node:child_process";

const BASE = (process.env.IAM_BASE_URL || "https://inneranimalmedia.com").replace(/\/$/, "");
const INGEST = process.env.INGEST_SECRET || "";
const TENANT_ID = process.env.IAM_TENANT_ID || "";
const WORKSPACE_ID = process.env.IAM_WORKSPACE_ID || "";
const USER_ID = process.env.IAM_USER_ID || "";
const DB = process.env.IAM_D1_DB || "inneranimalmedia-business";

const PROMPT =
  "Use the browser to inspect https://assets.inneranimalmedia.com and summarize the visible page.";

if (!INGEST) {
  console.error("Missing INGEST_SECRET (X-Ingest-Secret for /api/agent/chat ingest bypass).");
  process.exit(1);
}
if (!TENANT_ID || !WORKSPACE_ID || !USER_ID) {
  console.error("Missing IAM_TENANT_ID, IAM_WORKSPACE_ID, or IAM_USER_ID.");
  process.exit(1);
}

function parseSse(buffer) {
  const events = [];
  const chunks = buffer.split("\n\n");
  for (const ch of chunks) {
    const line = ch
      .split("\n")
      .find((l) => l.startsWith("data: "));
    if (!line) continue;
    const raw = line.slice(6).trim();
    try {
      events.push(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }
  return events;
}

const res = await fetch(`${BASE}/api/agent/chat`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Ingest-Secret": INGEST,
  },
  body: JSON.stringify({
    message: PROMPT,
    mode: "agent",
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
    sessionId: `e2e_cap_${Date.now()}`,
  }),
});

if (!res.ok) {
  const t = await res.text();
  console.error("HTTP", res.status, t.slice(0, 2000));
  process.exit(1);
}

const text = await res.text();
const events = parseSse(text);

const types = events.map((e) => e.type).filter(Boolean);
const hasCap = types.includes("capability_selected") || types.includes("agent_capability_selected");
const hasStart = types.includes("workflow_start");
const hasStep = types.some((t) => t === "workflow_step");
const hasEnd =
  types.includes("workflow_complete") || types.includes("workflow_error");

const wfStart = events.find((e) => e.type === "workflow_start");
const runId = wfStart && typeof wfStart.run_id === "string" ? wfStart.run_id : null;

console.log("SSE types (sample):", [...new Set(types)].slice(0, 40).join(", "));
console.log("run_id:", runId);

if (!hasCap || !hasStart || !hasStep) {
  console.error("FAIL: missing capability_selected, workflow_start, or workflow_step");
  process.exit(1);
}
if (!hasEnd) {
  console.error("FAIL: missing workflow_complete or workflow_error");
  process.exit(1);
}

if (!runId) {
  console.error("FAIL: no run_id on workflow_start");
  process.exit(1);
}

let row = null;
try {
  const safeId = runId.replace(/'/g, "''");
  const out = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      DB,
      "--remote",
      "--command",
      `SELECT id, workflow_key, status, length(step_results_json) AS sr_len, error_message FROM agentsam_workflow_runs WHERE id = '${safeId}' LIMIT 1;`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const idx = out.lastIndexOf("[");
  if (idx >= 0) {
    const arr = JSON.parse(out.slice(idx).trim());
    const first = Array.isArray(arr) ? arr[0] : null;
    const results = first?.results;
    if (Array.isArray(results) && results[0]) row = results[0];
  }
} catch (e) {
  console.warn("D1 check skipped:", e?.message || e);
}

if (!row) {
  console.warn("WARN: could not load D1 row (wrangler / remote). SSE checks passed.");
  process.exit(0);
}

const srLen = Number(row.sr_len || 0);
if (srLen < 3) {
  console.error("FAIL: step_results_json empty or too small", row);
  process.exit(1);
}

if (row.status !== "completed" && row.status !== "failed") {
  console.error("FAIL: unexpected status", row.status);
  process.exit(1);
}

if (row.workflow_key !== "workspace_capability_browser") {
  console.error("FAIL: workflow_key mismatch", row.workflow_key);
  process.exit(1);
}

console.log("OK:", { id: row.id, status: row.status, workflow_key: row.workflow_key, sr_len: srLen });
if (row.status === "failed" && !row.error_message) {
  console.error("FAIL: failed run without error_message");
  process.exit(1);
}
