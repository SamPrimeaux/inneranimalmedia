#!/usr/bin/env node
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";


function requireIdentity(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${name}. Refusing to run without explicit tenant/workspace/user scope.`);
  }
  return String(value).trim();
}

const DB = process.env.IAM_D1_DB || "inneranimalmedia-business";
const bucket = process.env.AGENTSAM_R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET || "inneranimalmedia";
const userId = requireIdentity("IAM_USER_ID", process.env.IAM_USER_ID);

if (!tenantId || !workspaceId || !userId) {
  throw new Error("Missing IAM_TENANT_ID, IAM_WORKSPACE_ID, or IAM_USER_ID. Refusing to run without explicit tenant/workspace/user scope.");
}

const tenantId = requireIdentity("IAM_TENANT_ID", process.env.IAM_TENANT_ID);
const workspaceId = requireIdentity("IAM_WORKSPACE_ID", process.env.IAM_WORKSPACE_ID);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

const runId = `cmd_script_study_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0,14)}_${crypto.randomUUID().slice(0,8)}`;
const outDir = `tmp/agentsam-command-script-study/${runId}`;
const resultKey = `captures/inneranimalmedia/results/${runId}.json`;
const artifactKey = `analytics/agentsam/command-script-study/${runId}.json`;

function q(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${String(v).replaceAll("'", "''")}'`;
}

function d1(sql) {
  execFileSync("npx", ["wrangler", "d1", "execute", DB, "--remote", "--command", sql], {
    stdio: "inherit",
  });
}

function r2Put(key, file) {
  execFileSync("npx", ["wrangler", "r2", "object", "put", `${bucket}/${key}`, "--file", file, "--remote"], {
    stdio: "inherit",
  });
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}

async function callNano(prompt) {
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.4-nano",
      input: prompt,
      max_output_tokens: 4000,
      reasoning: { effort: "low" },
      store: false,
    }),
  });

  const text = await res.text();
  const json = JSON.parse(text);
  if (!res.ok) throw new Error(json?.error?.message || text);

  const outputText =
    json.output_text ||
    (json.output || []).flatMap(x => x.content || []).map(c => c.text || "").join("");

  const usage = json.usage || {};
  return {
    outputText,
    latency_ms: Date.now() - started,
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    total_tokens: usage.total_tokens || ((usage.input_tokens || 0) + (usage.output_tokens || 0)),
    cost_usd: ((usage.input_tokens || 0) * 0.0002 / 1000) + ((usage.output_tokens || 0) * 0.00125 / 1000),
  };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error("Model did not return parseable JSON");
}

function registerArtifact({ name, description, type, r2Key, source, tags, fileSize }) {
  const id = `art_${crypto.randomUUID().replaceAll("-", "").slice(0,16)}`;
  d1(`
INSERT INTO agentsam_artifacts (
  id, user_id, tenant_id, workspace_id, name, description, artifact_type,
  r2_key, public_url, source, tags, is_public, file_size_bytes, created_at, updated_at
)
VALUES (
  ${q(id)}, ${q(userId)}, ${q(tenantId)}, ${q(workspaceId)}, ${q(name)}, ${q(description)}, ${q(type)},
  ${q(r2Key)}, NULL, ${q(source)}, ${q(JSON.stringify(tags))}, 0, ${fileSize || 0}, unixepoch(), unixepoch()
);
`);
  return id;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const commandsSchema = await readJson("tmp/agentsam-command-script-study/schema/agentsam_commands.schema.json");
  const scriptsSchema = await readJson("tmp/agentsam-command-script-study/schema/agentsam_scripts.schema.json");
  const commandRows = await readJson("tmp/agentsam-command-script-study/agentsam_commands.sample.json");

  const prompt = `
You are OA Smoke IAM using gpt-5.4-nano.

Study the live agentsam_commands sample and propose reusable agentsam_scripts.

Goal:
Turn repeated command patterns into safe reusable scripts for Agent Sam. Focus on CMS live editor, D1 inspection, R2 artifacts, workflow graph smoke, telemetry verification, and deployment checks.

Return valid JSON only:
{
  "run_id": "${runId}",
  "summary": "...",
  "script_proposals": [
    {
      "id": "script_...",
      "name": "...",
      "path": "scripts/...",
      "description": "...",
      "purpose": "deploy|build|test|ingest|benchmark|maintenance|dev|dangerous|audit",
      "runner": "bash|node|python|sql|wrangler|npm",
      "safe_to_run": 1,
      "owner_only": 1,
      "requires_env": 1,
      "preferred_for": "...",
      "run_before": null,
      "run_after": null,
      "never_run_with": null,
      "notes": "..."
    }
  ],
  "command_clusters": [],
  "recommended_first_scripts": [],
  "r2_artifacts_to_register": [],
  "d1_insert_sql_preview": [],
  "risks": [],
  "next_action": "..."
}

Rules:
- Do not invent live schema columns.
- Use the provided agentsam_scripts schema.
- Prefer nano-cheap, repeatable scripts.
- Mark risky scripts safe_to_run=0.
- Include scripts for:
  1. inspect cms_* schema
  2. verify R2 artifact registry
  3. smoke workflow graph rows
  4. verify agentsam telemetry joins
  5. seed CMS live editor dev artifacts
  6. dry-run template-library generation
  7. dashboard route/browser smoke
`.trim();

  const payload = {
    commands_schema: commandsSchema?.[0]?.results || commandsSchema,
    scripts_schema: scriptsSchema?.[0]?.results || scriptsSchema,
    commands_sample: commandRows?.[0]?.results || commandRows,
  };

  const result = await callNano(`${prompt}\n\nDATA:\n${JSON.stringify(payload).slice(0, 90000)}`);
  const parsed = parseJson(result.outputText);

  const final = {
    pass: true,
    run_id: runId,
    model: "gpt-5.4-nano",
    workflow_id: "wf_cms_live_editor_dev_app",
    todo_id: "todo_cms_live_editor",
    usage: result,
    parsed,
  };

  const file = `${outDir}/command-script-study.json`;
  await fs.writeFile(file, JSON.stringify(final, null, 2));

  r2Put(resultKey, file);
  r2Put(artifactKey, file);

  const size = Buffer.byteLength(JSON.stringify(final, null, 2));

  const art1 = registerArtifact({
    name: `Agent Sam Command Script Study ${runId}`,
    description: "Nano-first study of agentsam_commands proposing reusable agentsam_scripts.",
    type: "json",
    r2Key: resultKey,
    source: "agentsam_command_script_study",
    tags: ["agentsam", "commands", "scripts", "cms-live-editor", "nano", "smoke"],
    fileSize: size,
  });

  const art2 = registerArtifact({
    name: `Agent Sam Command Script Study Analytics ${runId}`,
    description: "Analytics copy of agentsam_commands to agentsam_scripts proposal.",
    type: "json",
    r2Key: artifactKey,
    source: "agentsam_command_script_study",
    tags: ["agentsam", "analytics", "commands", "scripts", "nano"],
    fileSize: size,
  });

  d1(`
INSERT INTO agentsam_usage_events (
  tenant_id, workspace_id, user_id, session_id, agent_name, provider, model,
  tokens_in, tokens_out, cost_usd, status, tool_name, reason,
  ref_table, ref_id, event_type, model_key, duration_ms, total_tokens
)
VALUES (
  ${q(tenantId)}, ${q(workspaceId)}, ${q(userId)}, ${q(`sess_${runId}`)}, 'agent-sam',
  'openai', 'gpt-5.4-nano',
  ${result.input_tokens}, ${result.output_tokens}, ${result.cost_usd}, 'ok',
  'study_agentsam_commands_for_scripts', 'command_script_study',
  'agentsam_artifacts', ${q(art1)}, 'command_script_study', 'gpt-5.4-nano',
  ${result.latency_ms}, ${result.total_tokens}
);
`);

  console.log(JSON.stringify({
    pass: true,
    run_id: runId,
    cost_usd: result.cost_usd,
    tokens: result.total_tokens,
    r2_keys: [resultKey, artifactKey],
    artifact_ids: [art1, art2],
    proposals: parsed.script_proposals?.length || 0,
    next_action: "Review proposals, then insert approved rows into agentsam_scripts.",
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
