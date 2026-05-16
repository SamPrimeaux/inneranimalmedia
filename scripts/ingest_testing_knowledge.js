#!/usr/bin/env node
// ingest_testing_knowledge.js
// Ollama (mxbai-embed-large:latest) → Cloudflare Vectorize v2
// Source: IAM smoke test, SLO, D1→Supabase join, and AI spend analytics knowledge
//
// Usage:
//   node scripts/ingest_testing_knowledge.js
//   node scripts/ingest_testing_knowledge.js --verify

import crypto from 'crypto';

// ── Config ────────────────────────────────────────────────────
const ACCOUNT_ID    = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN     = process.env.CLOUDFLARE_API_TOKEN;
const OLLAMA_HOST   = process.env.OLLAMA_BASE_URL          || 'http://localhost:11434';
const EMBED_MODEL   = process.env.OLLAMA_EMBEDDING_MODEL   || 'mxbai-embed-large:latest';
const INDEX         = 'ai-search-inneranimalmedia-autorag';
const SOURCE_ID     = 'iam_testing_quality_knowledge_001';
const WORKSPACE_ID  = 'ws_sam_primeaux';
const TENANT_ID     = 'sam_primeaux';
const EXPECTED_DIMS = 1024;
const CHUNK_CHARS   = 1600;
const OVERLAP_CHARS = 200;
const BATCH_SIZE    = 100;
const MIN_SCORE     = 0.70;
const VERIFY_ONLY   = process.argv.includes('--verify');

// ── Knowledge document ────────────────────────────────────────
const DOC = `
KNOWLEDGE DOMAIN: IAM Smoke Testing, Quality Validation, AI Spend Analytics, and D1-to-Supabase Join Strategy

PLATFORM CONTEXT: Inner Animal Media uses Cloudflare D1 as the live execution and source-of-truth layer and Supabase as the analytics, proof, and reporting layer. These two databases are joined by a canonical set of shared IDs that must appear on every test record: run_group_id, plan_id, task_id, route_key, routing_arm_id, provider, model_key, task_type, and source_tool. Without these shared IDs the data is powerful but fragmented. With them, Agent Sam has a complete telemetry graph across routing, prompts, tools, cost, SLOs, and outcomes.


SECTION 1: THE CANONICAL TEST SPINE

Every smoke test, eval run, and agent execution must carry a consistent set of shared identifiers across all tables it writes to. The run_group_id format is smoke_YYYYMMDD_HHMMSS_{short_slug} and is shared by every record in a single test session. The plan_id format is plan_YYYYMMDD_agent_smoke. Each individual test scenario gets its own task_id in the format task_{short_slug}. The comparison_key encodes the full test context as {task_type}:{provider}:{model}:{mode} and enables cross-model and cross-provider comparison queries.

Every row written during a test must carry tenant_id, workspace_id, run_group_id, plan_id, task_id, route_key, routing_arm_id, provider, model_key, task_type, and source_tool wherever those fields exist on the target table. This is the most important rule in the entire testing infrastructure. A record missing these IDs cannot be joined, cannot be aggregated into performance metrics, and cannot trigger SLO evaluation.


SECTION 2: D1 TABLE ROLES AND WHAT EACH ONE IS FOR

The D1 table ai_api_test_runs is the primary raw model API testing table. It stores both direct and batch test runs and contains every field needed for AI spend analytics: run_group_id, parent_batch_id, custom_id, comparison_key, test_suite, test_name, mode, provider, model, status, http_status, success, schema_valid, input_tokens, output_tokens, cached_tokens, total_cost_usd, latency_ms, time_to_first_token_ms, prompt_hash, response_hash, assertion_passed, prompt_id, and experiment_id. This table is the source for model quality comparison and AI spend proof.

The D1 table agentsam_agent_run is the high-level agent execution record. It captures user_id, workspace_id, conversation_id, model_id, routing_arm_id, input_tokens, output_tokens, cost_usd, quality_score, task_type, timed_out, sla_breach, and tenant_id. Every real Agent Sam execution produces one row here. This table is the starting point for agent-level analytics and SLO breach detection.

The D1 table agentsam_commands is the command catalog, not an execution history table. It is the registry of possible agent actions. Each row has slug, display_name, description, tool_key, workflow_key, route_key, task_type, risk_level, requires_confirmation, requires_approval, success_count, failure_count, avg_duration_ms, and router_type. Command execution history is tracked via agentsam_command_run, agentsam_tool_chain, and agentsam_executions.

The D1 table agentsam_prompt_routes is critical for routing tests. It defines what prompt layers, tools, RAG inclusion, memory inclusion, workspace context, model preference, fallback model, and token budget to use for each route_key. Smoke testing must verify that each route_key produces the correct routing decision, prompt context, model selection, and tool set in Supabase.

The D1 table agentsam_plans holds the structured work plan. The D1 table agentsam_plan_tasks holds individual tasks within a plan. Every task carries plan_id, order_index, priority, category, status, files_involved, tables_involved, routes_involved, tokens_used, cost_usd, and risk_level. These two tables are the anchors for structured work proof and should be joined with their Supabase counterparts via plan_id and task_id.

The D1 table agentsam_task_slos defines pass and fail thresholds by task_type. It has sla_p95_latency_ms, sla_avg_cost_usd, sla_min_quality, sla_min_schema_valid_rate, sla_min_tool_success_rate, alert_threshold_pct, and pause_arm_on_breach. This table is more important than it appears. It is the mechanism that turns subjective quality assessment into objective SLO enforcement. Breach flags from this table should be written back to sla_breach fields on agentsam_agent_run, agentsam_tool_chain, and agentsam_executions.

The D1 table agentsam_tool_chain is the per-tool-call trace within an agent session. It captures tool_name, tool_id, input_json, output_summary, result_json, error_message, retry_count, duration_ms, cost_usd, timed_out, sla_breach, and routing_arm_id. This table feeds tool reliability analytics and should be mirrored to Supabase agentsam_tool_call_events.

The D1 table agentsam_executions is the execution record per agent task. It captures execution_type, command, file_path, model_key, provider, output, error, duration_ms, timed_out, sla_breach, input_tokens, output_tokens, cost_usd, quality_score, and routing_arm_id. This table joins with agentsam_execution_steps for step-level granularity.

The D1 table agentsam_execution_performance_metrics is the pre-aggregated analytics rollup table. It rolls up execution_count, success_count, failure_count, timeout_count, sla_breach_count, avg_duration_ms, p95_duration_ms, p99_duration_ms, success_rate_percent, total_tokens_consumed, total_cost_usd, avg_quality_score, and error_types_json grouped by tenant, workspace, model, provider, tool, command, task_type, and time grain. This table is the source for dashboards and trend analysis.

The D1 table agentsam_mcp_workflows defines reusable agent workflows with steps_json, tools_json, acceptance_criteria_json, retry_policy_json, on_failure_json, run_count, success_count, avg_duration_ms, and total_cost_usd. Workflow execution is tracked via agentsam_workflow_runs and agentsam_execution_steps.

The D1 table agentsam_eval_suites, agentsam_eval_runs, and agentsam_eval_cases form the structured evaluation system. eval_suites groups related tests by provider, mode, and task_type. eval_cases define input_prompt, expected_output, and grading_criteria. eval_runs capture model_key, provider, input_tokens, output_tokens, latency_ms, cost_usd, score_quality, score_latency, score_cost, score_tool_use, score_overall, schema_valid, retry_count, tool_calls_attempted, and tool_calls_succeeded. This system should be used for every model comparison test.


SECTION 3: D1 TO SUPABASE JOIN STRATEGY

For AI spend analytics and model quality comparison, the primary D1 to Supabase join is ai_api_test_runs into Supabase public.agentsam_eval_runs. The join key is run_group_id. Additional fields that map across are: test_suite to suite_key, provider to provider, model to model_key, input_tokens to input_tokens, output_tokens to output_tokens, cached_tokens to cache_read_tokens, total_cost_usd to cost_usd, latency_ms to duration_ms, time_to_first_token_ms to first_token_ms, schema_valid into metrics_json, assertion_passed into metrics_json, and response_text to output_preview. Compact normalized results should be mirrored to Supabase agentsam_eval_runs and then rolled up to model_performance_snapshots and agentsam_model_cost_snapshots.

For agent run proof, the primary join is agentsam_agent_run into Supabase public.agentsam_workflow_runs. The join key is the D1 agentsam_agent_run.id stored as d1_run_id on the Supabase side. Additional mappings: user_id, workspace_id, conversation_id, status, model_id to model_key, routing_arm_id, input_tokens, output_tokens, cost_usd, quality_score, task_type, and tenant_id all map directly. The Supabase agentsam_workflow_runs table is the canonical run row for dashboard display because it already has plan_id, task_id, run_group_id, provider, model_key, latency_ms, cost, and sync status.

For command and tool execution proof, the chain is D1 agentsam_commands and agentsam_tools through agentsam_tool_chain and agentsam_executions into Supabase public.agentsam_tool_call_events and agentsam.tool_calls. The join keys are tool_name or tool_key for tool-level joins and command_id or command_slug for command-level joins. Build and deploy outcomes should also flow into Supabase public.build_deploy_events.

For prompt routing validation, D1 agentsam_prompt_routes maps into Supabase public.agentsam_routing_decisions via route_key and into public.agentsam_prompt_runs via included prompt layer keys, tool keys, context sources, and token budget. Every route tested should produce exactly one routing decision row and one prompt run row in Supabase.

For plans and tasks proof, D1 agentsam_plans and agentsam_plan_tasks join to Supabase public.agentsam_plans and public.agentsam_plan_tasks via plan_id and task_id. Downstream these connect to Supabase public.agentsam_workflow_runs, public.agentsam_workflow_steps, public.agentsam_workflow_events, and public.build_deploy_events.


SECTION 4: SLO DEFINITIONS BY TASK TYPE

The agentsam_task_slos table should have entries for every task_type used in smoke testing. The fields to populate are task_type as primary key, sla_p95_latency_ms, sla_avg_cost_usd, sla_min_quality, sla_min_schema_valid_rate, sla_min_tool_success_rate, alert_threshold_pct, and pause_arm_on_breach.

For task_type ai_api_smoke: sla_p95_latency_ms 15000, sla_avg_cost_usd 0.05, sla_min_quality 0.80, sla_min_schema_valid_rate 0.95, sla_min_tool_success_rate null. This covers direct and batch model API calls.

For task_type cloudflare_command: sla_p95_latency_ms 60000, sla_avg_cost_usd 0.10, sla_min_quality 0.85, sla_min_schema_valid_rate null, sla_min_tool_success_rate 0.95. This covers wrangler and Cloudflare API operations.

For task_type agent_refactor: sla_p95_latency_ms 180000, sla_avg_cost_usd 0.75, sla_min_quality 0.85, sla_min_schema_valid_rate 0.90, sla_min_tool_success_rate 0.90.

For task_type deploy_validation: sla_p95_latency_ms 120000, sla_avg_cost_usd 0.25, sla_min_quality 0.90, sla_min_schema_valid_rate null, sla_min_tool_success_rate 0.95.

For task_type routing_decision: sla_p95_latency_ms 5000, sla_avg_cost_usd 0.01, sla_min_quality 0.85, sla_min_schema_valid_rate 0.99, sla_min_tool_success_rate null.

For task_type embedding_search: sla_p95_latency_ms 2000, sla_avg_cost_usd 0.001, sla_min_quality 0.75, sla_min_schema_valid_rate null, sla_min_tool_success_rate null.

For task_type mcp_tool: sla_p95_latency_ms 30000, sla_avg_cost_usd 0.05, sla_min_quality 0.80, sla_min_schema_valid_rate null, sla_min_tool_success_rate 0.92.

For task_type terminal_command: sla_p95_latency_ms 45000, sla_avg_cost_usd 0.02, sla_min_quality null, sla_min_schema_valid_rate null, sla_min_tool_success_rate 0.98.

SLO breaches must be written back to the sla_breach field on agentsam_agent_run, agentsam_tool_chain, agentsam_executions, and agentsam_execution_steps. If pause_arm_on_breach is 1, the routing arm responsible for the breach should be paused in agentsam_routing_arms.


SECTION 5: FOUR CANONICAL SMOKE TEST FLOWS

Flow A is AI spend and model quality comparison. It uses D1 tables ai_api_test_runs, agentsam_eval_suites, agentsam_eval_cases, agentsam_eval_runs, and agentsam_task_slos joined to Supabase public.agentsam_eval_runs, public.agentsam_model_cost_snapshots, and public.model_performance_snapshots. The test matrix covers providers openai, google, and workers_ai with models gpt-5.4, gpt-5.4-mini, gpt-5.4-nano, and available Gemini and Workers AI options across modes direct, structured_json, and tool_plan. Validations include schema_valid, assertion_passed, latency_ms, time_to_first_token_ms, total_cost_usd, token counts, response_hash, and quality score.

Flow B is routing proof. It uses D1 agentsam_prompt_routes, agentsam_commands, agentsam_tools, and agentsam_task_slos joined to Supabase public.agentsam_routing_decisions and public.agentsam_prompt_runs. Test routes should include cloudflare_command, db_schema_audit, ui_review, model_comparison, deploy_validation, and agent_refactor. Each route must produce exactly one routing decision, one prompt run, one eval run, zero to N tool call events, and an optional workflow run. If any of those rows are missing the route is not wired correctly.

Flow C is tool and command execution proof. It uses D1 agentsam_commands, agentsam_tools, agentsam_tool_chain, agentsam_executions, agentsam_execution_steps, and agentsam_mcp_tool_execution joined to Supabase public.agentsam_tool_call_events, agentsam.tool_calls, agentsam.executions, and public.build_deploy_events. Smoke tests must start with read-only commands: wrangler whoami, wrangler d1 list, wrangler d1 execute with a read-only query, wrangler r2 bucket list, wrangler deployments list, curl health endpoint, and python schema audit preflight. Destructive or deploy commands come only after read-only logging is confirmed clean.

Flow D is plan and task workflow proof. It uses D1 agentsam_plans, agentsam_plan_tasks, agentsam_mcp_workflows, agentsam_workflow_runs, agentsam_execution_steps, and agentsam_tool_chain joined to Supabase public.agentsam_plans, public.agentsam_plan_tasks, public.agentsam_workflow_runs, public.agentsam_workflow_steps, public.agentsam_workflow_events, and public.agentsam_debug_snapshots. The target shape is one plan, three tasks, and each task producing a routing decision, prompt run, tool calls, eval run, workflow proof, and SLO result.


SECTION 6: SUPABASE TABLE ROLES BY DASHBOARD CATEGORY

For AI spend analytics dashboards, the primary Supabase tables are public.agentsam_eval_runs, public.agentsam_tool_call_events, public.agentsam_model_cost_snapshots, public.model_performance_snapshots, public.cost_forecasts, agentsam.usage_events, and agentsam.workflow_daily_rollups.

For routing validation dashboards, the primary Supabase tables are public.agentsam_routing_decisions, public.agentsam_prompt_runs, public.agentsam_eval_runs, and public.model_performance_snapshots.

For tool reliability dashboards, the primary Supabase tables are public.agentsam_tool_call_events, agentsam.tool_calls, agentsam.mcp_health_checks, agentsam.workflow_quality_snapshots, and agentsam.workflow_daily_rollups.

For plans and tasks proof dashboards, the primary Supabase tables are public.agentsam_plans, public.agentsam_plan_tasks, public.agentsam_workflow_runs, public.agentsam_workflow_steps, public.agentsam_workflow_events, and public.build_deploy_events.

For Cloudflare build and deploy proof dashboards, the primary Supabase tables are public.build_deploy_events, agentsam.worker_events, agentsam.worker_errors, agentsam.worker_hourly_rollups, agentsam.worker_daily_rollups, and public.agentsam_debug_snapshots.


SECTION 7: THE EXECUTION DEPENDENCY GRAPH AND HOOK SYSTEM

The D1 table agentsam_execution_dependency_graph tracks tool chain dependencies. Each row defines a chain_id that depends on depends_on_chain_id with a dependency_type of sequential, conditional, parallel_allowed, compensation, approval_gate, or guardrail_gate. The status field tracks whether the dependency is active, waiting, satisfied, blocked, skipped, failed, or archived. This table is the mechanism for complex multi-step agent workflows where some steps cannot start until others complete or succeed.

The D1 table agentsam_hook defines event-driven triggers. Each hook has a trigger type of start, stop, pre_deploy, post_deploy, pre_commit, error, imessage_reply, or email_reply and maps to a command, workflow_id, or subagent_slug. Hook executions are logged in agentsam_hook_execution with status, duration_ms, output, error, and full payload_json. Hooks are the mechanism for automated responses to system events and should be smoke tested by triggering a known event and confirming the hook_execution row appears with status success.

The D1 table agentsam_escalation tracks model escalation chains within a run_group_id. When a primary model fails, the escalation chain logs each model attempted with model_attempted, succeeded, input_tokens, output_tokens, latency_ms, and error_message. This table enables post-mortem analysis of which models were tried before success and at what cost.


SECTION 8: WHAT AGENT SAM MUST ALWAYS DO IN TESTING FLOWS

Agent Sam must always write run_group_id, plan_id, task_id, tenant_id, workspace_id, provider, model_key, task_type, and route_key to every row produced during a test or agent execution. Missing any of these on a record makes it unjoinable and invisible to analytics.

Agent Sam must always check agentsam_task_slos for the relevant task_type before marking a run complete. If latency_ms exceeds sla_p95_latency_ms or quality_score falls below sla_min_quality, set sla_breach to 1 on the relevant execution and agent run rows.

Agent Sam must always start tool and command smoke tests with read-only operations before moving to write or deploy operations. The sequence is: verify credentials, run read-only queries, confirm logging is clean, then proceed to write operations.

Agent Sam must always mirror compact normalized results from D1 to Supabase after each test flow. D1 is the source of truth for raw execution data. Supabase is the analytics and proof layer. The two must stay in sync within each run_group_id.

Agent Sam must never run a model comparison test without recording both prompt_hash and response_hash. These hashes enable deduplication, cache analysis, and response consistency tracking across providers and models.
`.trim();

// ── Helpers ───────────────────────────────────────────────────
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const estimateTokens = (t) => Math.ceil(t.length / 4);

// ── Chunker ───────────────────────────────────────────────────
function makeChunks(text) {
  const seps = ['\n\n', '\n', '. ', ' '];

  function split(str, si) {
    if (str.length <= CHUNK_CHARS) return [str.trim()];
    if (si >= seps.length) {
      const out = [];
      for (let i = 0; i < str.length; i += CHUNK_CHARS - OVERLAP_CHARS)
        out.push(str.slice(i, i + CHUNK_CHARS).trim());
      return out;
    }
    const sep = seps[si];
    const pieces = str.split(sep);
    const out = [];
    let cur = '';
    for (const p of pieces) {
      const candidate = cur ? cur + sep + p : p;
      if (candidate.length <= CHUNK_CHARS) {
        cur = candidate;
      } else {
        if (cur.trim()) out.push(cur.trim());
        if (p.length > CHUNK_CHARS) {
          out.push(...split(p, si + 1));
          cur = '';
        } else {
          cur = p;
        }
      }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  const raw = split(text, 0);
  const result = [];
  for (let i = 0; i < raw.length; i++) {
    if (i === 0) { result.push(raw[i]); continue; }
    const tail = raw[i - 1].slice(-OVERLAP_CHARS).trim();
    result.push((tail + ' ' + raw[i]).trim());
  }
  return result.filter(c => c.length > 60);
}

function detectSection(text) {
  const first = text.split('\n')[0].trim();
  if (/^SECTION \d+/i.test(first)) return first.slice(0, 80);
  if (/^KNOWLEDGE DOMAIN/i.test(first)) return 'overview';
  return 'general';
}

// ── Ollama ────────────────────────────────────────────────────
async function ollamaEmbed(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const { embedding } = await res.json();
  if (!embedding || embedding.length !== EXPECTED_DIMS)
    throw new Error(`Bad dims: got ${embedding?.length}, expected ${EXPECTED_DIMS}`);
  return embedding;
}

// ── Vectorize ─────────────────────────────────────────────────
const cfUrl = (path) =>
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${INDEX}/${path}`;

async function vectorizeUpsert(records) {
  const body = records.map(r => JSON.stringify(r)).join('\n');
  const res = await fetch(cfUrl('upsert'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/x-ndjson' },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(`Upsert failed: ${JSON.stringify(json.errors)}`);
  return json.result;
}

async function vectorizeQuery(vector, topK = 5) {
  const res = await fetch(cfUrl('query'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector, topK, returnMetadata: 'all' }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(`Query failed: ${JSON.stringify(json.errors)}`);
  return json.result?.matches ?? [];
}

// ── Preflight ─────────────────────────────────────────────────
async function preflight() {
  if (!ACCOUNT_ID) throw new Error('CLOUDFLARE_ACCOUNT_ID not set');
  if (!API_TOKEN)  throw new Error('CLOUDFLARE_API_TOKEN not set');
  log(`Checking Ollama at ${OLLAMA_HOST}...`);
  const res = await fetch(`${OLLAMA_HOST}/api/tags`);
  if (!res.ok) throw new Error('Ollama not reachable at ' + OLLAMA_HOST);
  const { models } = await res.json();
  if (!models?.some(m => m.name === EMBED_MODEL))
    throw new Error(`Model ${EMBED_MODEL} not found. Run: ollama pull mxbai-embed-large`);
  log(`Ollama OK — ${EMBED_MODEL} ready`);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const startMs = Date.now();
  await preflight();

  if (VERIFY_ONLY) {
    log('Verify-only mode...');
    const qv = await ollamaEmbed('Represent this sentence for searching: IAM smoke test SLO D1 Supabase join run_group_id plan_id task_id model quality analytics');
    const matches = await vectorizeQuery(qv, 5);
    log('Results (topK=5):');
    matches.forEach(m => log(`  ${m.score.toFixed(4)}  ${m.id}`));
    const hit = matches.find(m => m.id.startsWith(SOURCE_ID));
    log(hit ? `PASS — ${hit.id} score=${hit.score.toFixed(4)}` : 'MISS — no chunks from this source in top-5');
    return;
  }

  // Chunk
  log('Chunking...');
  const PREFIX = 'This chunk is from the IAM testing, quality, and analytics knowledge base for Agent Sam. ';
  const rawChunks = makeChunks(DOC);
  const chunks = rawChunks.map((text, i) => ({
    i,
    id:       `${SOURCE_ID}_chunk_${String(i).padStart(3, '0')}`,
    text,
    prefixed: PREFIX + text,
    section:  detectSection(text),
    tokens:   estimateTokens(text),
    hash:     sha256(text),
  }));
  const avgTokens = Math.round(chunks.reduce((s, c) => s + c.tokens, 0) / chunks.length);
  log(`${chunks.length} chunks, avg ~${avgTokens} tokens each`);

  // Embed
  log(`Embedding via Ollama — ${EMBED_MODEL}...`);
  const records = [];
  for (const c of chunks) {
    process.stdout.write(`  [${c.i + 1}/${chunks.length}] ${c.id} ... `);
    const t = Date.now();
    const values = await ollamaEmbed(c.prefixed);
    process.stdout.write(`${Date.now() - t}ms\n`);
    records.push({
      id: c.id,
      values,
      metadata: {
        source_id:       SOURCE_ID,
        workspace_id:    WORKSPACE_ID,
        tenant_id:       TENANT_ID,
        chunk_index:     c.i,
        section:         c.section.slice(0, 100),
        token_estimate:  c.tokens,
        content_hash:    c.hash,
        created_at_unix: Math.floor(Date.now() / 1000),
      },
    });
  }
  log(`All ${records.length} chunks embedded`);

  // Upsert
  log('Upserting to Vectorize...');
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} vectors`);
    const result = await vectorizeUpsert(batch);
    log(`  mutation_id: ${result?.mutationId ?? 'n/a'}`);
  }

  // Verify
  log('Waiting 5s for index to settle...');
  await sleep(5000);
  log('Running verification query...');
  const qv = await ollamaEmbed('Represent this sentence for searching: IAM smoke test SLO D1 Supabase join run_group_id plan_id task_id model quality analytics');
  const matches = await vectorizeQuery(qv, 5);
  log('Results (topK=5):');
  matches.forEach(m => log(`  ${m.score.toFixed(4)}  ${m.id}`));

  const hit = matches.find(m => m.id.startsWith(SOURCE_ID));
  const topScore = hit?.score ?? 0;
  const passed = topScore >= MIN_SCORE;
  const duration = Date.now() - startMs;

  log(`\nDone in ${(duration / 1000).toFixed(1)}s`);
  log(`Chunks    : ${chunks.length}`);
  log(`Index     : ${INDEX}`);
  log(`Top score : ${topScore.toFixed(4)}`);
  log(`Status    : ${passed ? 'SUCCESS ✓' : 'DEGRADED — score below threshold'}`);
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
