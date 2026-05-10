#!/usr/bin/env node


function requireIdentity(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${name}. Refusing to run without explicit tenant/workspace/user scope.`);
  }
  return String(value).trim();
}

import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import crypto from "node:crypto";

const env = process.env;

const DB = env.IAM_D1_DB || "inneranimalmedia-business";
const tenantId = env.IAM_TENANT_ID || "tenant_sam_primeaux";
const workspaceId = env.IAM_WORKSPACE_ID || "ws_inneranimalmedia";
const userId = env.IAM_USER_ID || "au_871d920d1233cbd1";
const bucket = env.AGENTSAM_R2_BUCKET || env.CLOUDFLARE_R2_BUCKET || "inneranimalmedia";
const resultsPrefix = env.AGENTSAM_R2_RESULTS_PREFIX || "captures/inneranimalmedia/results";
const analyticsPrefix = env.AGENTSAM_R2_ANALYTICS_PREFIX || "analytics/agentsam";
const maxCostUsd = Number(env.AGENTSAM_SMOKE_MAX_COST_USD || "0.25");

const OPENAI_API_KEY = env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;

if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");

const runId = `cms3theme_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${crypto.randomUUID().slice(0, 8)}`;
const workflowRunId = `wrun_${runId}`;
const commandRunId = `run_${runId}`;
const suiteId = "evs_cms_routing_matrix";
const caseId = "evc_cms_3_theme_generation";

const slugs = [
  "iam-violet-nocturne",
  "iam-arctic-command",
  "iam-mocha-orbit",
];

const models = [
  { provider: "openai", model: "gpt-5.4-nano", lane: "cheap" },
  { provider: "openai", model: "gpt-5.4-mini", lane: "default" },
  { provider: "openai", model: "gpt-5-codex", lane: "code" },
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", lane: "cheap_anthropic" },
  { provider: "anthropic", model: "claude-sonnet-4-6", lane: "quality_anthropic" },
];

const approxCosts = {
  "gpt-5.4-nano": { in: 0.0002, out: 0.00125 },
  "gpt-5.4-mini": { in: 0.00075, out: 0.0045 },
  "gpt-5-codex": { in: 0, out: 0 },
  "claude-haiku-4-5-20251001": { in: 0, out: 0 },
  "claude-sonnet-4-6": { in: 0, out: 0 },
};

function q(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replaceAll("'", "''")}'`;
}

function d1(sql, json = false) {
  const args = ["wrangler", "d1", "execute", DB, "--remote"];
  if (json) args.push("--json");
  args.push("--command", sql);
  const out = execFileSync("npx", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!json) return out;
  return JSON.parse(out)?.[0]?.results || [];
}

function wranglerR2Put(key, file) {
  execFileSync("npx", [
    "wrangler",
    "r2",
    "object",
    "put",
    `${bucket}/${key}`,
    "--file",
    file,
    "--remote",
  ], { stdio: "inherit" });
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

function usageOpenAI(json) {
  const u = json.usage || {};
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  return { input, output, total: u.total_tokens || input + output };
}

function usageAnthropic(json) {
  const u = json.usage || {};
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  return { input, output, total: input + output };
}

function estimateCost(model, input, output) {
  const rate = approxCosts[model] || { in: 0, out: 0 };
  return (input * rate.in / 1000) + (output * rate.out / 1000);
}

async function callOpenAI(model, prompt) {
  const started = performance.now();
  const body = {
    model,
    input: prompt,
    max_output_tokens: 1800,
    store: false,
  };
  if (/^gpt-5/.test(model)) body.reasoning = { effort: "low" };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  const elapsed = Math.round(performance.now() - started);
  const json = JSON.parse(raw);

  if (!res.ok) throw new Error(`${model} ${res.status}: ${json?.error?.message || raw}`);

  const text = json.output_text ||
    (json.output || []).flatMap(x => x.content || []).map(c => c.text || "").join("").trim();

  const usage = usageOpenAI(json);
  return { text, elapsed, usage, responseId: json.id || null };
}

async function callAnthropic(model, prompt) {
  const started = performance.now();

  const body = {
    model,
    max_tokens: 1800,
    messages: [{ role: "user", content: prompt }],
  };

  if (model === "claude-sonnet-4-6") {
    body.effort = "low";
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  const elapsed = Math.round(performance.now() - started);
  const json = JSON.parse(raw);

  if (!res.ok) throw new Error(`${model} ${res.status}: ${json?.error?.message || raw}`);

  const text = (json.content || []).map(c => c.text || "").join("").trim();
  const usage = usageAnthropic(json);
  return { text, elapsed, usage, responseId: json.id || null };
}

function makePrompt(slug) {
  return `
You are Agent Sam generating a TEST-ONLY CMS theme package.

Theme slug: ${slug}

Return valid JSON only with this exact structure:
{
  "slug": "${slug}",
  "theme_json": {
    "slug": "${slug}",
    "name": "...",
    "mode": "dark|light|auto",
    "tokens": {
      "color": {},
      "font": {},
      "radius": {},
      "shadow": {},
      "motion": {}
    }
  },
  "css_vars_json": {
    "--color-bg": "...",
    "--color-surface": "...",
    "--color-text": "...",
    "--color-muted": "...",
    "--color-primary": "...",
    "--color-accent": "...",
    "--radius-card": "...",
    "--font-body": "Inter",
    "--font-display": "Satoshi"
  },
  "monaco_json": {
    "base": "vs-dark|vs",
    "inherit": true,
    "rules": [],
    "colors": {}
  },
  "manifest_json": {
    "slug": "${slug}",
    "files": ["theme.css", "theme.json", "monaco.json", "manifest.json"],
    "safe_test_only": true
  },
  "theme_css": ":root { ... }",
  "quality_notes": ["..."],
  "safety_notes": ["test-only path, do not promote automatically"]
}

Rules:
- Do not use built-in Monaco IDs like "vs-dark" as final monaco theme id. Use "${slug}-monaco" in manifest/theme metadata where relevant.
- CSS must be valid and use the CSS vars.
- Keep output concise but complete.
- Do not mention writing to live cms/themes/. This is test-only under cms/test-runs/.
`.trim();
}

function scoreTheme(parsed, slug, text, elapsed, cost) {
  let score = 0;
  const reasons = [];

  if (parsed) { score += 20; reasons.push("valid_json"); }
  if (parsed?.slug === slug) { score += 10; reasons.push("slug_match"); }
  if (parsed?.theme_css && String(parsed.theme_css).includes(":root")) { score += 15; reasons.push("css_root"); }
  if (parsed?.theme_json?.tokens) { score += 15; reasons.push("tokens_present"); }
  if (parsed?.css_vars_json && Object.keys(parsed.css_vars_json).length >= 6) { score += 15; reasons.push("css_vars_present"); }
  if (parsed?.monaco_json) { score += 10; reasons.push("monaco_present"); }
  if (parsed?.manifest_json?.safe_test_only === true) { score += 5; reasons.push("safe_test_only"); }
  if (elapsed < 5000) { score += 5; reasons.push("latency_ok"); }
  if (cost < 0.005) { score += 5; reasons.push("cost_ok"); }

  return { score, reasons };
}

async function writeFile(path, content) {
  await fs.mkdir(path.split("/").slice(0, -1).join("/"), { recursive: true });
  await fs.writeFile(path, content);
}

function registerArtifact({ name, description, type, r2Key, source, tags, file }) {
  const id = `art_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const size = existsSync(file) ? statSync(file).size : 0;

  d1(`
    INSERT INTO agentsam_artifacts (
      id, user_id, tenant_id, workspace_id,
      name, description, artifact_type, r2_key,
      public_url, source, tags, is_public, file_size_bytes,
      created_at, updated_at
    )
    VALUES (
      ${q(id)}, ${q(userId)}, ${q(tenantId)}, ${q(workspaceId)},
      ${q(name)}, ${q(description)}, ${q(type)}, ${q(r2Key)},
      NULL, ${q(source)}, ${q(JSON.stringify(tags))}, 0, ${size},
      unixepoch(), unixepoch()
    );
  `);

  return id;
}

function insertWorkflowRun() {
  d1(`
    INSERT INTO agentsam_workflow_runs (
      id, workflow_id, workflow_key, display_name,
      tenant_id, workspace_id, user_id, session_id, run_group_id,
      trigger_type, status, input_json, output_json, step_results_json,
      steps_completed, steps_total, environment, metadata_json,
      graph_mode, max_cost_usd, max_total_tokens
    )
    VALUES (
      ${q(workflowRunId)}, 'wf_cms_theme_matrix', 'cms_3_theme_model_matrix', 'CMS 3 Theme Model Matrix',
      ${q(tenantId)}, ${q(workspaceId)}, ${q(userId)}, ${q(`sess_${runId}`)}, ${q(runId)},
      'manual', 'running',
      ${q(JSON.stringify({ slugs, models: models.map(m => m.model) }))},
      '{}', '[]',
      0, ${slugs.length * models.length}, 'production',
      ${q(JSON.stringify({ smoke: true, source: "agentsam-cms-3-theme-matrix" }))},
      1, ${maxCostUsd}, 100000
    );
  `);
}

function insertCommandRun() {
  d1(`
    INSERT INTO agentsam_command_run (
      id, workspace_id, session_id, conversation_id, user_input,
      normalized_intent, intent_category, tier_used, model_id,
      commands_json, result_json, success, tenant_id, user_id
    )
    VALUES (
      ${q(commandRunId)}, ${q(workspaceId)}, ${q(`sess_${runId}`)}, ${q(runId)},
      'Run CMS 3-theme model quality/cost matrix',
      'cms_3_theme_model_matrix', 'misc', 1, 'multi',
      ${q(JSON.stringify({ slugs, models }))}, '{}', 1, ${q(tenantId)}, ${q(userId)}
    );
  `);
}

function insertStep({ nodeKey, model, provider, input, output, elapsed, usage, cost, score, status = "success" }) {
  const stepId = `estep_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  d1(`
    INSERT INTO agentsam_execution_steps (
      id, execution_id, node_key, node_type, status,
      input_json, output_json, error_json,
      started_at, completed_at, latency_ms,
      tokens_in, tokens_out, cost_usd, quality_score,
      gate_results_json, attempt
    )
    VALUES (
      ${q(stepId)}, ${q(workflowRunId)}, ${q(nodeKey)}, 'agent', ${q(status)},
      ${q(JSON.stringify(input))}, ${q(JSON.stringify(output))}, '{}',
      unixepoch(), unixepoch(), ${elapsed},
      ${usage.input}, ${usage.output}, ${cost}, ${score / 100},
      '{}', 1
    );
  `);
  return stepId;
}

function insertToolChain({ stepId, model, provider, slug, r2Key, elapsed, usage, cost, score }) {
  const chainId = `atc_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  d1(`
    INSERT INTO agentsam_tool_chain (
      id, tenant_id, workspace_id, user_id, command_run_id,
      depth, tool_name, tool_status,
      input_json, output_summary, result_json,
      duration_ms, input_tokens, output_tokens, cost_usd,
      started_at, completed_at, execution_step_id, workflow_run_id
    )
    VALUES (
      ${q(chainId)}, ${q(tenantId)}, ${q(workspaceId)}, ${q(userId)}, ${q(commandRunId)},
      0, 'cms_theme_generate', 'completed',
      ${q(JSON.stringify({ model, provider, slug }))},
      ${q(`Generated ${slug} with ${model}; score ${score}`)},
      ${q(JSON.stringify({ slug, model, provider, r2Key, score }))},
      ${elapsed}, ${usage.input}, ${usage.output}, ${cost},
      unixepoch(), unixepoch(), ${q(stepId)}, ${q(workflowRunId)}
    );
  `);
  return chainId;
}

function insertUsage({ model, provider, chainId, elapsed, usage, cost }) {
  const id = `ue_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  d1(`
    INSERT OR IGNORE INTO agentsam_usage_events (
      id, tenant_id, workspace_id, user_id, session_id,
      agent_name, provider, model, tokens_in, tokens_out,
      cost_usd, status, tool_name, reason,
      ref_table, ref_id, event_type, model_key,
      duration_ms, total_tokens
    )
    VALUES (
      ${q(id)}, ${q(tenantId)}, ${q(workspaceId)}, ${q(userId)}, ${q(`sess_${runId}`)},
      'agent-sam', ${q(provider)}, ${q(model)}, ${usage.input}, ${usage.output},
      ${cost}, 'ok', 'cms_theme_generate', 'cms_3_theme_model_matrix',
      'agentsam_tool_chain', ${q(chainId)}, 'cms_3_theme_model_matrix', ${q(model)},
      ${elapsed}, ${usage.total}
    );
  `);
}

function insertEvalRun({ model, provider, slug, score, elapsed, usage, cost, outputR2Key }) {
  const id = `evr_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;

  const latencyScore = elapsed <= 5000 ? 1.0 : elapsed <= 10000 ? 0.75 : elapsed <= 20000 ? 0.5 : 0.25;
  const costScore = cost <= 0.0025 ? 1.0 : cost <= 0.01 ? 0.75 : cost <= 0.025 ? 0.5 : 0.25;
  const qualityScore = score / 100;
  const safetyScore = 1.0;
  const toolUseScore = 1.0;
  const overallScore = Math.round(((qualityScore * 0.45) + (latencyScore * 0.15) + (costScore * 0.15) + (toolUseScore * 0.10) + (safetyScore * 0.15)) * 1000) / 1000;

  const notes = {
    slug,
    output_r2_key: outputR2Key,
    run_id: runId,
    workflow_run_id: workflowRunId,
    command_run_id: commandRunId,
    model,
    provider,
    score_raw: score,
    latency_ms: elapsed,
    input_tokens: usage.input,
    output_tokens: usage.output,
    total_tokens: usage.total,
    cost_usd: cost,
  };

  d1(`
    INSERT INTO agentsam_eval_runs (
      id,
      suite_id,
      case_id,
      tenant_id,
      model_key,
      provider,
      input_tokens,
      output_tokens,
      latency_ms,
      cost_usd,
      score_quality,
      score_latency,
      score_cost,
      score_tool_use,
      score_safety,
      score_overall,
      passed,
      output_text,
      grader_notes,
      grader_model,
      run_at,
      cached_input_tokens,
      schema_valid,
      retry_count,
      run_group_id,
      tool_calls_attempted,
      tool_calls_succeeded,
      failure_taxonomy
    )
    VALUES (
      ${q(id)},
      ${q(suiteId)},
      ${q(caseId)},
      ${q(tenantId)},
      ${q(model)},
      ${q(provider)},
      ${usage.input},
      ${usage.output},
      ${elapsed},
      ${cost},
      ${qualityScore},
      ${latencyScore},
      ${costScore},
      ${toolUseScore},
      ${safetyScore},
      ${overallScore},
      ${overallScore >= 0.7 ? 1 : 0},
      ${q(JSON.stringify(notes))},
      ${q(JSON.stringify(notes))},
      'agentsam-cms-3-theme-matrix',
      datetime('now'),
      0,
      ${score >= 70 ? 1 : 0},
      0,
      ${q(runId)},
      1,
      1,
      NULL
    );
  `);
}

function insertPerfMetric({ model, provider, slug, score, elapsed, usage, cost }) {
  const date = new Date().toISOString().slice(0, 10);
  d1(`
    INSERT OR IGNORE INTO agentsam_execution_performance_metrics (
      tenant_id, workspace_id, user_id,
      metric_date, metric_grain, source_table,
      command_slug, tool_name, workflow_run_id,
      task_type, trigger_key, model_key, provider,
      execution_count, success_count, failure_count,
      avg_duration_ms, min_duration_ms, max_duration_ms,
      success_rate_percent,
      total_tokens_consumed, input_tokens, output_tokens,
      total_cost_usd, avg_cost_usd, avg_quality_score,
      status_counts_json, metadata_json,
      first_seen_at, last_seen_at, node_key
    )
    VALUES (
      ${q(tenantId)}, ${q(workspaceId)}, ${q(userId)},
      ${q(date)}, 'daily', 'agentsam_tool_chain',
      'cms_3_theme_model_matrix', 'cms_theme_generate', ${q(workflowRunId)},
      'cms_theme_generation', 'cms_3_theme_model_matrix', ${q(model)}, ${q(provider)},
      1, 1, 0,
      ${elapsed}, ${elapsed}, ${elapsed}, 100,
      ${usage.total}, ${usage.input}, ${usage.output},
      ${cost}, ${cost}, ${score / 100},
      '{"completed":1}', ${q(JSON.stringify({ run_id: runId, slug }))},
      unixepoch(), unixepoch(), ${q(slug)}
    );
  `);
}

async function main() {
  console.log(`Starting CMS 3-theme matrix: ${runId}`);
  await fs.mkdir(`tmp/cms-theme-matrix/${runId}`, { recursive: true });

  insertWorkflowRun();
  insertCommandRun();

  const results = [];
  let totalCost = 0;
  let totalTokens = 0;

  for (const modelCfg of models) {
    for (const slug of slugs) {
      const prompt = makePrompt(slug);
      const nodeKey = `${modelCfg.model.replaceAll(".", "_").replaceAll("-", "_")}__${slug}`;

      console.error(`Running ${modelCfg.model} / ${slug}`);

      let call;
      if (modelCfg.provider === "openai") call = await callOpenAI(modelCfg.model, prompt);
      else call = await callAnthropic(modelCfg.model, prompt);

      const parsed = safeJsonParse(call.text);
      const cost = estimateCost(modelCfg.model, call.usage.input, call.usage.output);
      const scored = scoreTheme(parsed, slug, call.text, call.elapsed, cost);

      const baseDir = `tmp/cms-theme-matrix/${runId}/${modelCfg.model}/${slug}`;
      await fs.mkdir(baseDir, { recursive: true });

      const safeParsed = parsed || { raw: call.text, parse_failed: true, slug };
      const files = {
        "theme.json": JSON.stringify(safeParsed.theme_json || safeParsed, null, 2),
        "monaco.json": JSON.stringify(safeParsed.monaco_json || {}, null, 2),
        "manifest.json": JSON.stringify({
          ...(safeParsed.manifest_json || {}),
          slug,
          model: modelCfg.model,
          provider: modelCfg.provider,
          run_id: runId,
          test_only: true,
        }, null, 2),
        "theme.css": String(safeParsed.theme_css || `/* parse failed for ${slug} / ${modelCfg.model} */\n`),
        "raw-output.json": JSON.stringify({
          run_id: runId,
          slug,
          model: modelCfg.model,
          provider: modelCfg.provider,
          text: call.text,
          parsed_ok: !!parsed,
          score: scored.score,
          reasons: scored.reasons,
          usage: call.usage,
          cost_usd: cost,
          latency_ms: call.elapsed,
        }, null, 2),
      };

      const artifactIds = [];
      for (const [filename, content] of Object.entries(files)) {
        const localFile = `${baseDir}/${filename}`;
        await writeFile(localFile, content);

        const r2Key = `cms/test-runs/${runId}/${modelCfg.model}/${slug}/${filename}`;
        wranglerR2Put(r2Key, localFile);

        const artifactId = registerArtifact({
          name: `CMS Theme Matrix ${slug} ${modelCfg.model} ${filename}`,
          description: `Test-only CMS theme matrix artifact for ${slug}, generated by ${modelCfg.model}.`,
          type: filename.endsWith(".css") ? "css" : "json",
          r2Key,
          source: "agentsam_cms_3_theme_matrix",
          tags: ["agentsam", "cms", "theme", "matrix", slug, modelCfg.model],
          file: localFile,
        });
        artifactIds.push({ filename, r2Key, artifactId });
      }

      const outputR2Key = `cms/test-runs/${runId}/${modelCfg.model}/${slug}/raw-output.json`;
      const stepId = insertStep({
        nodeKey,
        model: modelCfg.model,
        provider: modelCfg.provider,
        input: { slug, model: modelCfg.model },
        output: { slug, score: scored.score, reasons: scored.reasons, artifacts: artifactIds },
        elapsed: call.elapsed,
        usage: call.usage,
        cost,
        score: scored.score,
      });

      const chainId = insertToolChain({
        stepId,
        model: modelCfg.model,
        provider: modelCfg.provider,
        slug,
        r2Key: outputR2Key,
        elapsed: call.elapsed,
        usage: call.usage,
        cost,
        score: scored.score,
      });

      insertUsage({ model: modelCfg.model, provider: modelCfg.provider, chainId, elapsed: call.elapsed, usage: call.usage, cost });
      insertEvalRun({ model: modelCfg.model, provider: modelCfg.provider, slug, score: scored.score, elapsed: call.elapsed, usage: call.usage, cost, outputR2Key });
      insertPerfMetric({ model: modelCfg.model, provider: modelCfg.provider, slug, score: scored.score, elapsed: call.elapsed, usage: call.usage, cost });

      totalCost += cost;
      totalTokens += call.usage.total;

      results.push({
        model: modelCfg.model,
        provider: modelCfg.provider,
        lane: modelCfg.lane,
        slug,
        score: scored.score,
        reasons: scored.reasons,
        latency_ms: call.elapsed,
        tokens: call.usage,
        cost_usd: Number(cost.toFixed(8)),
        artifacts: artifactIds,
      });
    }
  }

  const winnersBySlug = {};
  for (const slug of slugs) {
    winnersBySlug[slug] = results
      .filter(r => r.slug === slug)
      .sort((a, b) => b.score - a.score || a.cost_usd - b.cost_usd || a.latency_ms - b.latency_ms)[0];
  }

  const summary = {
    pass: true,
    run_id: runId,
    workflow_run_id: workflowRunId,
    command_run_id: commandRunId,
    slugs,
    models: models.map(m => m.model),
    total_calls: results.length,
    total_tokens: totalTokens,
    total_cost_usd: Number(totalCost.toFixed(8)),
    max_cost_usd: maxCostUsd,
    winners_by_slug: winnersBySlug,
    results,
  };

  const summaryFile = `tmp/cms-theme-matrix/${runId}/matrix-summary.json`;
  await writeFile(summaryFile, JSON.stringify(summary, null, 2));
  const summaryR2 = `${resultsPrefix}/cms_3_theme_matrix_${runId}.json`;
  wranglerR2Put(summaryR2, summaryFile);
  registerArtifact({
    name: `CMS 3 Theme Matrix Summary ${runId}`,
    description: "Summary of CMS 3-theme model quality/cost matrix.",
    type: "json",
    r2Key: summaryR2,
    source: "agentsam_cms_3_theme_matrix",
    tags: ["agentsam", "cms", "theme", "matrix", "summary"],
    file: summaryFile,
  });

  const analyticsFile = `tmp/cms-theme-matrix/${runId}/analytics-summary.json`;
  await writeFile(analyticsFile, JSON.stringify(summary, null, 2));
  const analyticsR2 = `${analyticsPrefix}/cms-matrix/${runId}.json`;
  wranglerR2Put(analyticsR2, analyticsFile);
  registerArtifact({
    name: `CMS 3 Theme Matrix Analytics ${runId}`,
    description: "Analytics copy of CMS 3-theme model matrix.",
    type: "json",
    r2Key: analyticsR2,
    source: "agentsam_cms_3_theme_matrix",
    tags: ["agentsam", "analytics", "cms", "theme", "matrix"],
    file: analyticsFile,
  });

  d1(`
    UPDATE agentsam_workflow_runs
    SET
      status = 'completed',
      output_json = ${q(JSON.stringify(summary))},
      step_results_json = ${q(JSON.stringify(results))},
      steps_completed = ${results.length},
      steps_total = ${results.length},
      input_tokens = ${results.reduce((s, r) => s + r.tokens.input, 0)},
      output_tokens = ${results.reduce((s, r) => s + r.tokens.output, 0)},
      cost_usd = ${totalCost},
      duration_ms = ${results.reduce((s, r) => s + r.latency_ms, 0)},
      model_used = ${q(Object.values(winnersBySlug)[0]?.model || null)},
      completed_at = unixepoch(),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ${q(workflowRunId)};
  `);

  d1(`
    UPDATE agentsam_eval_suites
    SET run_count = COALESCE(run_count, 0) + ${results.length}
    WHERE id = ${q(suiteId)};
  `);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(err);
  try {
    d1(`
      UPDATE agentsam_workflow_runs
      SET status = 'failed',
          error_message = ${q(err.message)},
          completed_at = unixepoch(),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ${q(workflowRunId)};
    `);
  } catch {}
  process.exit(1);
});
