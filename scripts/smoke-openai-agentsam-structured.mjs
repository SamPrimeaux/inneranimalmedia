#!/usr/bin/env node

import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const OUT_DIR = "tmp/openai-smoke";
await fs.mkdir(OUT_DIR, { recursive: true });

const models = [
  { model: "gpt-5.4-nano", lane: "router", effort: "low" },
  { model: "gpt-5.4-mini", lane: "default", effort: "low" },
  { model: "gpt-5.4", lane: "premium", effort: "low" },

  { model: "gpt-5-codex", lane: "code", effort: "low" },
  { model: "gpt-5.1-codex", lane: "code", effort: "low" },
  { model: "gpt-5.2-codex", lane: "code", effort: "low" },
  { model: "gpt-5.3-codex", lane: "code", effort: "low" },

  { model: "o3", lane: "reasoning", effort: "low" },
  { model: "o4-mini", lane: "reasoning", effort: "low" },

  // Pro models do not allow low.
  { model: "gpt-5.4-pro", lane: "manual_pro", effort: "medium" },
  { model: "gpt-5.5-pro", lane: "manual_pro", effort: "medium" },

  // Retry once; previous failure was 500.
  { model: "gpt-5", lane: "retry_observe", effort: "low" },
];

const tasks = [
  {
    task_key: "route_classification",
    route_key: "general",
    max_output_tokens: 220,
    required_json: true,
    input: `You are Agent Sam's router.

Classify this request into exactly one route_key:
chat, code, db_query, deploy, cms_edit, workflow_run, security_audit, r2_ops, billing_finance.

User request:
"Check my D1 schema, patch the Worker route, run smoke tests, and deploy if the checks pass."

Return JSON only:
{
  "route_key": "...",
  "confidence": 0.0,
  "requires_tools": true,
  "risk_level": "low|medium|high",
  "reason": "..."
}`,
  },
  {
    task_key: "db_safety_check",
    route_key: "db_query",
    max_output_tokens: 260,
    required_json: true,
    input: `You are Agent Sam's D1 safety checker.

Analyze this SQL:
DROP TABLE agentsam_usage_events;

Return JSON only:
{
  "safe_to_run": false,
  "risk_level": "low|medium|high|critical",
  "why": "...",
  "safer_alternative": "...",
  "requires_approval": true
}`,
  },
  {
    task_key: "code_patch_plan",
    route_key: "code",
    max_output_tokens: 340,
    required_json: true,
    input: `You are Agent Sam's code planning model.

Repo issue:
"agentsam_routing_arms.model_key sometimes stores raw provider IDs. Normalize through agentsam_model_catalog aliases before writing."

Return JSON only:
{
  "files": ["..."],
  "implementation_steps": ["..."],
  "tests": ["..."],
  "migration_needed": true,
  "risk_level": "low|medium|high"
}`,
  },
  {
    task_key: "tool_decision",
    route_key: "deploy",
    max_output_tokens: 280,
    required_json: true,
    input: `You are Agent Sam's tool governance layer.

Scenario:
The user asks: "run npm test and then wrangler deploy"
workspace_id=ws_inneranimalmedia
tenant_id=tenant_sam_primeaux

Return JSON only:
{
  "tool_key": "...",
  "command_key": "...",
  "safe_to_run": true,
  "requires_approval": true,
  "workspace_id": "ws_inneranimalmedia",
  "tenant_id": "tenant_sam_primeaux",
  "reason": "..."
}`,
  },
  {
    task_key: "workflow_node_plan",
    route_key: "workflow_run",
    max_output_tokens: 420,
    required_json: true,
    input: `You are Agent Sam's workflow planner.

Create a 4-node workflow for:
"Inspect D1 routing tables, run model access smoke, update catalog rows, verify Thompson arms."

Return JSON only:
{
  "workflow_key": "openai_routing_smoke",
  "nodes": [
    {"node_key":"...", "type":"...", "depends_on":[]}
  ],
  "edges": [
    {"from":"...", "to":"..."}
  ],
  "approval_gates": ["..."]
}`,
  },
];

function addReasoning(body, model, effort) {
  if (/^(o3|o4|gpt-5)/.test(model)) {
    body.reasoning = { effort };
  }
}

function outputText(json) {
  if (typeof json.output_text === "string") return json.output_text;
  const chunks = [];
  for (const item of json.output || []) {
    for (const c of item.content || []) {
      if (typeof c.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonLoose(text) {
  if (!text) return { ok: false, error: "empty_output" };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return { ok: true, value: JSON.parse(match[0]), repaired: true };
    } catch {}
  }
  return { ok: false, error: "invalid_json" };
}

function usageSummary(json) {
  const u = json?.usage || {};
  return {
    input_tokens: u.input_tokens ?? u.prompt_tokens ?? null,
    output_tokens: u.output_tokens ?? u.completion_tokens ?? null,
    total_tokens: u.total_tokens ?? null,
  };
}

function scoreResult(task, outText, parsed, elapsed_ms, usage) {
  let score = 0;

  if (parsed.ok) score += 40;
  if (outText && outText.length > 8) score += 10;

  const val = parsed.value || {};
  if (task.task_key === "route_classification" && val.route_key && typeof val.confidence === "number") score += 25;
  if (task.task_key === "db_safety_check" && val.safe_to_run === false && val.requires_approval === true) score += 25;
  if (task.task_key === "code_patch_plan" && Array.isArray(val.files) && Array.isArray(val.tests)) score += 25;
  if (task.task_key === "tool_decision" && val.workspace_id && val.tenant_id && typeof val.requires_approval === "boolean") score += 25;
  if (task.task_key === "workflow_node_plan" && Array.isArray(val.nodes) && Array.isArray(val.edges)) score += 25;

  if (elapsed_ms < 1000) score += 10;
  else if (elapsed_ms < 2500) score += 7;
  else if (elapsed_ms < 5000) score += 4;

  if ((usage.total_tokens ?? 99999) < 500) score += 10;

  return Math.min(score, 100);
}

async function callResponses(modelCfg, task, attempt = 1) {
  const started = performance.now();

  const body = {
    model: modelCfg.model,
    input: task.input,
    max_output_tokens: task.max_output_tokens,
    store: false,
  };

  addReasoning(body, modelCfg.model, modelCfg.effort);

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const elapsed_ms = Math.round(performance.now() - started);
  const raw = await res.text();

  let json = null;
  try { json = JSON.parse(raw); } catch {}

  if (!res.ok) {
    return {
      model: modelCfg.model,
      lane: modelCfg.lane,
      effort: modelCfg.effort,
      task_key: task.task_key,
      route_key: task.route_key,
      ok: false,
      status: res.status,
      attempt,
      elapsed_ms,
      error_code: json?.error?.code ?? null,
      error_type: json?.error?.type ?? null,
      error_message: json?.error?.message ?? raw.slice(0, 400),
    };
  }

  const text = outputText(json);
  const parsed = parseJsonLoose(text);
  const usage = usageSummary(json);
  const score = scoreResult(task, text, parsed, elapsed_ms, usage);

  return {
    model: modelCfg.model,
    lane: modelCfg.lane,
    effort: modelCfg.effort,
    task_key: task.task_key,
    route_key: task.route_key,
    ok: true,
    status: res.status,
    attempt,
    elapsed_ms,
    json_valid: parsed.ok,
    json_repaired: parsed.repaired === true,
    score,
    ...usage,
    output_preview: text.slice(0, 260).replaceAll("\n", " "),
  };
}

const results = [];

for (const modelCfg of models) {
  for (const task of tasks) {
    process.stderr.write(`testing ${modelCfg.model} / ${task.task_key} ... `);
    let r = await callResponses(modelCfg, task, 1);

    // Retry transient 500s once.
    if (!r.ok && r.status >= 500) {
      process.stderr.write(`retry ${r.status} ... `);
      r = await callResponses(modelCfg, task, 2);
    }

    process.stderr.write(r.ok ? `OK score=${r.score}\n` : `FAIL ${r.status}\n`);
    results.push(r);
  }
}

const created_at = new Date().toISOString();

await fs.writeFile(
  `${OUT_DIR}/openai_agentsam_structured_results.json`,
  JSON.stringify({ created_at, models, tasks: tasks.map(t => t.task_key), results }, null, 2)
);

const cols = [
  "model",
  "lane",
  "effort",
  "task_key",
  "route_key",
  "ok",
  "status",
  "attempt",
  "elapsed_ms",
  "json_valid",
  "json_repaired",
  "score",
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "error_code",
  "error_type",
  "error_message",
  "output_preview",
];

const tsv = [
  cols.join("\t"),
  ...results.map((r) =>
    cols.map((c) => String(r[c] ?? "").replaceAll("\t", " ").replaceAll("\n", " ")).join("\t")
  ),
].join("\n");

await fs.writeFile(`${OUT_DIR}/openai_agentsam_structured_results.tsv`, tsv);
console.log(tsv);

// Simple aggregate by model
const byModel = new Map();
for (const r of results) {
  const row = byModel.get(r.model) || { model: r.model, ok: 0, total: 0, avg_score: 0, avg_ms: 0, tokens: 0 };
  row.total += 1;
  if (r.ok) {
    row.ok += 1;
    row.avg_score += r.score ?? 0;
    row.avg_ms += r.elapsed_ms ?? 0;
    row.tokens += r.total_tokens ?? 0;
  }
  byModel.set(r.model, row);
}

const summary = [...byModel.values()].map((r) => ({
  ...r,
  pass_rate: r.ok / r.total,
  avg_score: r.ok ? Math.round((r.avg_score / r.ok) * 10) / 10 : 0,
  avg_ms: r.ok ? Math.round(r.avg_ms / r.ok) : null,
  avg_tokens: r.ok ? Math.round(r.tokens / r.ok) : null,
})).sort((a, b) => b.pass_rate - a.pass_rate || b.avg_score - a.avg_score || a.avg_ms - b.avg_ms);

await fs.writeFile(`${OUT_DIR}/openai_agentsam_structured_summary.json`, JSON.stringify(summary, null, 2));

console.error("\nSUMMARY");
console.error("model\tpass_rate\tavg_score\tavg_ms\tavg_tokens");
for (const r of summary) {
  console.error(`${r.model}\t${r.pass_rate}\t${r.avg_score}\t${r.avg_ms}\t${r.avg_tokens}`);
}
