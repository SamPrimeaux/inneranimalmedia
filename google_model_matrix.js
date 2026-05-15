#!/usr/bin/env node
// google_model_matrix.js — Gemini tier discovery + metric capture
// Tests all 7 Google model tiers, logs what's reachable, writes full
// metrics to D1 ai_api_test_runs + Supabase agentsam_eval_runs.
// Usage: node google_model_matrix.js
// Requires: .env.agentsam.local sourced

import { randomUUID } from 'crypto';

const E = process.env;
const required = ['GOOGLE_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_D1_DATABASE_ID'];
const missing = required.filter(k => !E[k]);
if (missing.length) { console.error('Missing env:', missing.join(', ')); process.exit(1); }

const CF_ACCOUNT_ID = await fetch('https://api.cloudflare.com/client/v4/accounts',
  { headers: { 'Authorization': `Bearer ${E.CLOUDFLARE_API_TOKEN}` } })
  .then(r => r.json()).then(d => d.result?.[0]?.id);

const RUN_GROUP_ID = 'rg_google_matrix_' + Date.now();
const TENANT_ID    = E.PINSTEST_TENANT_ID    || 'tenant_sam_primeaux';
const WORKSPACE_ID = E.PINSTEST_WORKSPACE_ID || 'ws_inneranimalmedia';

// ── GOOGLE MODEL TIERS ───────────────────────────────────────────
// Ordered cheapest → most capable
// api_id = exact string used in the generateContent endpoint
// max_tokens capped low for smoke — Pro models burn reasoning budget
const MODELS = [
  {
    key:       'gemini-2.5-flash-lite',
    api_id:    'gemini-2.5-flash-lite',
    tier:      'cheap_stable_worker',
    max_out:   128,
    rates:     { in: 0.10, out: 0.40, cached: 0.025 },
    notes:     'Cheapest stable. Good for routing/classification/bulk extraction.',
  },
  {
    key:       'gemini-2.5-flash',
    api_id:    'gemini-2.5-flash',
    tier:      'balanced_default_google',
    max_out:   256,
    rates:     { in: 0.30, out: 2.50, cached: 0.075 },
    notes:     'Best cost/quality balance. Main Google workhorse.',
  },
  {
    key:       'gemini-2.5-pro',
    api_id:    'gemini-2.5-pro',
    tier:      'stable_deep_reasoning',
    max_out:   256,
    rates:     { in: 1.25, out: 10.00, cached: 0.3125 },
    notes:     'Complex reasoning fallback. Use when flash-level quality isnt enough.',
  },
  {
    key:       'gemini-3.1-flash-lite-preview',
    api_id:    'gemini-3.1-flash-lite-preview',
    tier:      'cheap_gemini3_tool_worker',
    max_out:   128,
    rates:     { in: 0.25, out: 1.50, cached: 0.0625 },
    notes:     'Gemini 3 budget tier. Classification, translation, simple tool calls.',
  },
  {
    key:       'gemini-3-flash-preview',
    api_id:    'gemini-3-flash-preview',
    tier:      'agentic_fast',
    max_out:   256,
    rates:     { in: 0.125, out: 0.75, cached: 0.03125 },
    notes:     'Gemini 3 fast agent. Multimodal, computer-use experiments.',
  },
  {
    key:       'gemini-3.1-pro-preview',
    api_id:    'gemini-3.1-pro-preview',
    tier:      'deep_agentic',
    max_out:   64,   // low — burns reasoning budget; raise to 512+ for real tasks
    rates:     { in: 2.00, out: 12.00, cached: 0.50 },
    notes:     'Top reasoning. Expensive. Escalate only for repo audit / complex tool plans.',
  },
  {
    key:       'gemini-3.1-pro-preview-customtools',
    api_id:    'gemini-3.1-pro-preview-customtools',
    tier:      'deep_agentic_custom_tools',
    max_out:   64,
    rates:     { in: 2.00, out: 12.00, cached: 0.50 },
    notes:     'Same as 3.1 Pro but better at prioritizing custom tools (view_file, search_code).',
  },
];

// Simple prompt — no backtick wrapping, no reasoning needed
const PROMPT = 'Reply with only this exact JSON: {"ok":true,"tier":"smoke"}';

// ── GOOGLE CALL ──────────────────────────────────────────────────
async function callGoogle(apiId, maxOut) {
  const t0 = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${apiId}:generateContent?key=${E.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        generationConfig: { maxOutputTokens: maxOut, temperature: 0 },
      }),
    }
  );
  const latency_ms = Date.now() - t0;
  const body = await res.json();
  const usage = body.usageMetadata ?? {};
  return {
    http_status:   res.status,
    response_text: body.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    stop_reason:   body.candidates?.[0]?.finishReason ?? '',
    input_tokens:  usage.promptTokenCount        ?? null,
    output_tokens: usage.candidatesTokenCount    ?? null,
    cached_tokens: usage.cachedContentTokenCount ?? 0,
    total_tokens:  usage.totalTokenCount         ?? null,
    latency_ms,
    error:         res.status >= 400 ? (body.error?.message ?? JSON.stringify(body).slice(0,120)) : null,
    raw: body,
  };
}

// ── COST ─────────────────────────────────────────────────────────
function cost(rates, inp, out, cached) {
  if (inp == null || out == null) return { input_cost_usd: null, output_cost_usd: null, total_cost_usd: null };
  const ic = ((inp - (cached||0)) / 1e6) * rates.in + ((cached||0) / 1e6) * (rates.cached ?? rates.in * 0.25);
  const oc = (out / 1e6) * rates.out;
  return {
    input_cost_usd:  parseFloat(ic.toFixed(8)),
    output_cost_usd: parseFloat(oc.toFixed(8)),
    total_cost_usd:  parseFloat((ic + oc).toFixed(8)),
  };
}

// ── ASSERTION ────────────────────────────────────────────────────
function assert(text) {
  try { return JSON.parse(text.replace(/```json|```/g,'').trim())?.ok === true ? 1 : 0; }
  catch { return 0; }
}

// ── D1 WRITE ─────────────────────────────────────────────────────
async function writeD1(row) {
  const sql = `INSERT OR REPLACE INTO ai_api_test_runs (
    id,run_group_id,test_suite,test_name,mode,provider,model,status,http_status,success,
    error_code,error_message,response_text,stop_reason,
    input_tokens,output_tokens,cached_tokens,total_tokens,
    input_cost_usd,output_cost_usd,tool_cost_usd,total_cost_usd,
    latency_ms,started_at,completed_at,assertion_passed,expected_contains,
    workspace_id,tenant_id,experiment_id,notes
  ) VALUES (
    '${row.id}','${RUN_GROUP_ID}','google_model_matrix','${row.model}_smoke','direct',
    'google','${row.model}','${row.status}',${row.http_status},${row.success},
    '${row.error_code}','${(row.error_message||'').replace(/'/g,"''")}',
    '${(row.response_text||'').replace(/'/g,"''").slice(0,300)}','${row.stop_reason}',
    ${row.input_tokens??'NULL'},${row.output_tokens??'NULL'},${row.cached_tokens??0},${row.total_tokens??'NULL'},
    ${row.input_cost_usd??'NULL'},${row.output_cost_usd??'NULL'},0,${row.total_cost_usd??'NULL'},
    ${row.latency_ms??'NULL'},'${row.started_at}','${row.completed_at}',
    ${row.assertion_passed},'{"ok":true}',
    '${WORKSPACE_ID}','${TENANT_ID}','exp_google_matrix','${row.notes.replace(/'/g,"''")}'
  )`;
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${E.CLOUDFLARE_D1_DATABASE_ID}/query`,
    { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${E.CLOUDFLARE_API_TOKEN}`}, body: JSON.stringify({sql}) }
  ).then(r=>r.json());
  if (!r.success) throw new Error(JSON.stringify(r.errors));
}

// ── SUPABASE WRITE ───────────────────────────────────────────────
async function writeSupabase(row) {
  const payload = {
    run_group_id:      RUN_GROUP_ID,
    tenant_id:         TENANT_ID,
    workspace_id:      WORKSPACE_ID,
    request_id:        row.id,
    agent_tool:        'google_model_matrix',
    provider:          'google',
    model_key:         row.model,
    api_platform:      'google_ai',
    status:            row.status,
    success:           row.success === 1,
    failure_reason:    row.error_message || null,
    input_tokens:      row.input_tokens,
    output_tokens:     row.output_tokens,
    cache_read_tokens: row.cached_tokens ?? 0,
    cache_write_tokens: 0,
    cost_usd:          row.total_cost_usd,
    duration_ms:       row.latency_ms,
    prompt_preview:    PROMPT,
    output_preview:    (row.response_text||'').slice(0,200),
    metrics_json: {
      input_cost_usd:  row.input_cost_usd,
      output_cost_usd: row.output_cost_usd,
      stop_reason:     row.stop_reason,
      http_status:     row.http_status,
      assertion_passed: row.assertion_passed,
      tier:            row.tier,
    },
    metadata: { run_group_id: RUN_GROUP_ID, tier: row.tier, notes: row.notes },
    started_at:   row.started_at,
    completed_at: row.completed_at,
  };
  Object.keys(payload).forEach(k => payload[k] === null && delete payload[k]);
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/agentsam_eval_runs`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'apikey': E.SUPABASE_SERVICE_ROLE_KEY,
               'Authorization': `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}`, 'Prefer':'return=minimal' },
    body: JSON.stringify(payload),
  });
  if (r.status >= 400) { const b = await r.json(); throw new Error(JSON.stringify(b)); }
}

// ── MAIN ─────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(68)}`);
console.log(`  Google Model Matrix  ·  ${new Date().toISOString()}`);
console.log(`  run_group_id: ${RUN_GROUP_ID}`);
console.log(`  Testing ${MODELS.length} models cheapest → most capable`);
console.log('═'.repeat(68));

const summary = [];

for (const m of MODELS) {
  const id         = 'atr_goog_' + randomUUID().replace(/-/g,'').slice(0,16);
  const started_at = new Date().toISOString();
  process.stdout.write(`\n  ${m.tier.padEnd(30)} ${m.key} `);

  let result;
  try { result = await callGoogle(m.api_id, m.max_out); }
  catch(e) { result = { http_status:0, response_text:'', stop_reason:'', input_tokens:null, output_tokens:null, cached_tokens:0, total_tokens:null, latency_ms:null, error: e.message }; }

  const completed_at = new Date().toISOString();
  const c            = cost(m.rates, result.input_tokens, result.output_tokens, result.cached_tokens);
  const pass         = result.http_status === 200 ? assert(result.response_text) : 0;
  const reachable    = result.http_status === 200;

  const row = {
    id, model: m.key, tier: m.tier, notes: m.notes,
    status:          reachable ? 'succeeded' : 'failed',
    http_status:     result.http_status,
    success:         reachable ? 1 : 0,
    error_code:      reachable ? '' : `http_${result.http_status}`,
    error_message:   result.error ?? '',
    response_text:   result.response_text,
    stop_reason:     result.stop_reason,
    input_tokens:    result.input_tokens,
    output_tokens:   result.output_tokens,
    cached_tokens:   result.cached_tokens,
    total_tokens:    result.total_tokens,
    ...c,
    latency_ms:      result.latency_ms,
    started_at, completed_at,
    assertion_passed: pass,
  };

  // status indicator
  const icon = !reachable ? '✗ 404/err' : pass ? '✓ pass' : '⚠ no assert';
  process.stdout.write(`→ ${icon}\n`);
  if (reachable) {
    console.log(`     latency: ${result.latency_ms}ms  tokens: ${result.input_tokens}in/${result.output_tokens}out  cost: $${c.total_cost_usd ?? 'n/a'}  stop: ${result.stop_reason}`);
    if (!pass) console.log(`     response: "${result.response_text.slice(0,100)}"`);
  } else {
    console.log(`     error: ${result.error?.slice(0,100)}`);
  }

  // write to D1
  try { await writeD1(row); process.stdout.write(`     D1: ✓  `); }
  catch(e) { process.stdout.write(`     D1: ✗ ${e.message.slice(0,60)}  `); }

  // write to Supabase
  try { await writeSupabase(row); console.log(`Supabase: ✓`); }
  catch(e) { console.log(`Supabase: ✗ ${e.message.slice(0,80)}`); }

  summary.push({ model: m.key, tier: m.tier, reachable, pass, latency_ms: result.latency_ms, cost_usd: c.total_cost_usd });
}

// ── SUMMARY TABLE ────────────────────────────────────────────────
console.log(`\n${'─'.repeat(68)}`);
console.log(`  RESULTS  (run_group_id: ${RUN_GROUP_ID})\n`);
console.log(`  ${'MODEL'.padEnd(40)} ${'REACH'.padEnd(7)} ${'ASSERT'.padEnd(8)} ${'LATENCY'.padEnd(10)} COST`);
console.log(`  ${'─'.repeat(64)}`);
for (const r of summary) {
  const reach  = r.reachable ? '✓' : '✗ 404';
  const assert = !r.reachable ? '—' : r.pass ? '✓' : '⚠';
  const lat    = r.latency_ms != null ? `${r.latency_ms}ms` : '—';
  const cost   = r.cost_usd   != null ? `$${r.cost_usd}`   : '—';
  console.log(`  ${r.model.padEnd(40)} ${reach.padEnd(7)} ${assert.padEnd(8)} ${lat.padEnd(10)} ${cost}`);
}

const reachable = summary.filter(r => r.reachable).length;
const asserting = summary.filter(r => r.pass).length;
console.log(`\n  Reachable: ${reachable}/${summary.length}  Assertions passing: ${asserting}/${reachable}`);
console.log(`\n  Verify D1:`);
console.log(`  SELECT model,http_status,latency_ms,input_tokens,output_tokens,total_cost_usd,assertion_passed`);
console.log(`  FROM ai_api_test_runs WHERE run_group_id='${RUN_GROUP_ID}' ORDER BY rowid;\n`);
