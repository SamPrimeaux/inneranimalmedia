#!/usr/bin/env node
// smoke_e2e.js — full metric capture smoke test
// Usage: node smoke_e2e.js
// Requires: .env.agentsam.local loaded (or env vars set)
// Fires real API calls to OpenAI, Anthropic, Google
// Writes every result to D1 ai_api_test_runs + Supabase agentsam_eval_runs
// NULL in any required metric = test failure

import { randomUUID } from 'crypto';

// ── ENV ──────────────────────────────────────────────────────────
const E = process.env;
const required = [
  'OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_API_KEY',
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
  'CLOUDFLARE_API_TOKEN','CLOUDFLARE_D1_DATABASE_ID'
];
const missing = required.filter(k => !E[k]);
if (missing.length) { console.error('Missing env:', missing.join(', ')); process.exit(1); }

const CF_ACCOUNT_ID = E.CF_ACCOUNT_ID || await fetch(
  'https://api.cloudflare.com/client/v4/accounts',
  { headers: { 'Authorization': `Bearer ${E.CLOUDFLARE_API_TOKEN}` } }
).then(r => r.json()).then(d => d.result?.[0]?.id);

// ── CONSTANTS ────────────────────────────────────────────────────
const RUN_GROUP_ID  = 'rg_smoke_' + Date.now();
const TENANT_ID     = E.PINSTEST_TENANT_ID     || 'tenant_sam_primeaux';
const WORKSPACE_ID  = E.PINSTEST_WORKSPACE_ID  || 'ws_inneranimalmedia';
const TEST_SUITE    = 'smoke_e2e_full_metrics';
const PROMPT        = 'Reply with exactly this JSON and nothing else: {"ok":true,"model":"<your model id>","tokens":"estimated"}';

// ── PROVIDERS ────────────────────────────────────────────────────
const PROBES = [
  {
    provider: 'openai',
    model: 'gpt-5.4-mini',
    call: async () => {
      const t0 = Date.now();
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${E.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: PROMPT }],
          max_tokens: 100,
          temperature: 0,
        })
      });
      const latency_ms = Date.now() - t0;
      const body = await res.json();
      return {
        http_status:       res.status,
        response_text:     body.choices?.[0]?.message?.content ?? '',
        input_tokens:      body.usage?.prompt_tokens ?? null,
        output_tokens:     body.usage?.completion_tokens ?? null,
        cached_tokens:     body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        total_tokens:      body.usage?.total_tokens ?? null,
        stop_reason:       body.choices?.[0]?.finish_reason ?? '',
        latency_ms,
        time_to_first_token_ms: null, // not available on non-streaming
        raw: body,
      };
    }
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    call: async () => {
      const t0 = Date.now();
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': E.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 100,
          messages: [{ role: 'user', content: PROMPT }],
        })
      });
      const latency_ms = Date.now() - t0;
      const body = await res.json();
      return {
        http_status:       res.status,
        response_text:     body.content?.[0]?.text ?? '',
        input_tokens:      body.usage?.input_tokens ?? null,
        output_tokens:     body.usage?.output_tokens ?? null,
        cached_tokens:     body.usage?.cache_read_input_tokens ?? 0,
        total_tokens:      (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0),
        stop_reason:       body.stop_reason ?? '',
        latency_ms,
        time_to_first_token_ms: null,
        raw: body,
      };
    }
  },
  {
    provider: 'google',
    model: 'gemini-2.5-flash',
    call: async () => {
      const t0 = Date.now();
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${E.GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: PROMPT }] }],
            generationConfig: { maxOutputTokens: 100, temperature: 0 },
          })
        }
      );
      const latency_ms = Date.now() - t0;
      const body = await res.json();
      const usage = body.usageMetadata ?? {};
      return {
        http_status:       res.status,
        response_text:     body.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
        input_tokens:      usage.promptTokenCount ?? null,
        output_tokens:     usage.candidatesTokenCount ?? null,
        cached_tokens:     usage.cachedContentTokenCount ?? 0,
        total_tokens:      usage.totalTokenCount ?? null,
        stop_reason:       body.candidates?.[0]?.finishReason ?? '',
        latency_ms,
        time_to_first_token_ms: null,
        raw: body,
      };
    }
  },
];

// ── COST RATES (USD per 1M tokens) ───────────────────────────────
const RATES = {
  'openai/gpt-5.4-mini':              { in: 0.15,  out: 0.60,  cached: 0.075 },
  'anthropic/claude-haiku-4-5-20251001': { in: 0.80,  out: 4.00,  cached: 0.08  },
  'google/gemini-2.5-flash':     { in: 0.30,  out: 2.50,  cached: 0.075 },
};

function computeCost(provider, model, input_tokens, output_tokens, cached_tokens) {
  const key = `${provider}/${model}`;
  const r = RATES[key];
  if (!r || input_tokens == null || output_tokens == null) return { input_cost_usd: null, output_cost_usd: null, total_cost_usd: null };
  const input_cost_usd  = ((input_tokens  - (cached_tokens||0)) / 1_000_000) * r.in
                        +  ((cached_tokens||0) / 1_000_000) * r.cached;
  const output_cost_usd = (output_tokens / 1_000_000) * r.out;
  return {
    input_cost_usd:  parseFloat(input_cost_usd.toFixed(8)),
    output_cost_usd: parseFloat(output_cost_usd.toFixed(8)),
    total_cost_usd:  parseFloat((input_cost_usd + output_cost_usd).toFixed(8)),
  };
}

// ── ASSERTION ────────────────────────────────────────────────────
function assertResponse(text) {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return parsed?.ok === true ? 1 : 0;
  } catch { return 0; }
}

// ── D1 WRITE ─────────────────────────────────────────────────────
async function writeD1(row) {
  const sql = `
    INSERT OR REPLACE INTO ai_api_test_runs (
      id, run_group_id, test_suite, test_name, mode,
      provider, model, status, http_status, success,
      error_code, error_message,
      response_text, structured_output_json,
      stop_reason,
      input_tokens, output_tokens, cached_tokens, total_tokens,
      input_cost_usd, output_cost_usd, tool_cost_usd, total_cost_usd,
      latency_ms, time_to_first_token_ms,
      started_at, completed_at,
      assertion_passed,
      expected_contains,
      workspace_id, tenant_id,
      experiment_id, prompt_id
    ) VALUES (
      '${row.id}','${row.run_group_id}','${row.test_suite}','${row.test_name}','${row.mode}',
      '${row.provider}','${row.model}','${row.status}',${row.http_status},${row.success},
      '${row.error_code}','${row.error_message?.replace(/'/g,"''")}',
      '${row.response_text?.replace(/'/g,"''").slice(0,500)}','${row.structured_output_json}',
      '${row.stop_reason}',
      ${row.input_tokens ?? 'NULL'},${row.output_tokens ?? 'NULL'},${row.cached_tokens ?? 0},${row.total_tokens ?? 'NULL'},
      ${row.input_cost_usd ?? 'NULL'},${row.output_cost_usd ?? 'NULL'},0,${row.total_cost_usd ?? 'NULL'},
      ${row.latency_ms ?? 'NULL'},${row.time_to_first_token_ms ?? 'NULL'},
      '${row.started_at}','${row.completed_at}',
      ${row.assertion_passed},
      '${row.expected_contains}',
      '${row.workspace_id}','${row.tenant_id}',
      '${row.experiment_id}','${row.prompt_id}'
    )`;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${E.CLOUDFLARE_D1_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${E.CLOUDFLARE_API_TOKEN}`,
      },
      body: JSON.stringify({ sql }),
    }
  );
  const body = await res.json();
  if (!body.success) throw new Error(JSON.stringify(body.errors));
  return body;
}

// ── SUPABASE WRITE ───────────────────────────────────────────────
async function writeSupabase(row) {
  const payload = {
    run_group_id:        row.run_group_id,
    tenant_id:           row.tenant_id,
    workspace_id:        row.workspace_id,
    request_id:          row.id,
    agent_tool:          'smoke_e2e',
    provider:            row.provider,
    model_key:           row.model,
    api_platform:        'direct',
    status:              row.status,
    success:             row.success === 1,
    failure_reason:      row.error_message || null,
    error_message:       row.error_message || null,
    input_tokens:        row.input_tokens,
    output_tokens:       row.output_tokens,
    cache_read_tokens:   row.cached_tokens ?? 0,
    cache_write_tokens:  0,
    cost_usd:            row.total_cost_usd,
    duration_ms:         row.latency_ms,
    first_token_ms:      row.time_to_first_token_ms,
    prompt_preview:      PROMPT.slice(0, 200),
    output_preview:      row.response_text?.slice(0, 200),
    metrics_json: {
      input_cost_usd:  row.input_cost_usd,
      output_cost_usd: row.output_cost_usd,
      assertion_passed: row.assertion_passed,
      stop_reason:     row.stop_reason,
      http_status:     row.http_status,
    },
    metadata: {
      test_suite:    row.test_suite,
      test_name:     row.test_name,
      experiment_id: row.experiment_id,
      run_group_id:  row.run_group_id,
    },
    started_at:   row.started_at,
    completed_at: row.completed_at,
  };

  // strip nulls — Supabase NOT NULL columns will reject explicit nulls
  Object.keys(payload).forEach(k => payload[k] === null && delete payload[k]);

  const res = await fetch(`${E.SUPABASE_URL}/rest/v1/agentsam_eval_runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': E.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (res.status >= 400) throw new Error(JSON.stringify(body));
  return body;
}

// ── NULL GUARD ───────────────────────────────────────────────────
function checkNulls(row, label) {
  const required = [
    'id','run_group_id','provider','model','http_status','latency_ms',
    'input_tokens','output_tokens','total_tokens','total_cost_usd',
    'started_at','completed_at','assertion_passed'
  ];
  const nulled = required.filter(k => row[k] == null);
  if (nulled.length) {
    console.error(`  ✗ NULL fields in ${label}: ${nulled.join(', ')}`);
    return false;
  }
  return true;
}

// ── MAIN ─────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Agent Sam — E2E Smoke  ·  ${new Date().toISOString()}`);
console.log(`  run_group_id: ${RUN_GROUP_ID}`);
console.log('═'.repeat(60));

let passed = 0, failed = 0;

for (const probe of PROBES) {
  const id         = 'atr_smoke_' + randomUUID().replace(/-/g,'').slice(0,16);
  const started_at = new Date().toISOString();
  console.log(`\n  → ${probe.provider}/${probe.model}`);

  let result, error_message = '', success = 0;
  try {
    result = await probe.call();
    success = result.http_status === 200 ? 1 : 0;
    if (!success) error_message = JSON.stringify(result.raw).slice(0, 200);
  } catch (e) {
    error_message = e.message;
    result = {
      http_status: 0, response_text: '', input_tokens: null, output_tokens: null,
      cached_tokens: 0, total_tokens: null, stop_reason: '', latency_ms: null,
      time_to_first_token_ms: null, raw: {},
    };
  }

  const completed_at = new Date().toISOString();
  const costs        = computeCost(probe.provider, probe.model, result.input_tokens, result.output_tokens, result.cached_tokens);
  const assertion    = success ? assertResponse(result.response_text) : 0;

  const row = {
    id,
    run_group_id:            RUN_GROUP_ID,
    experiment_id:           `exp_smoke_${Date.now()}`,
    prompt_id:               'prompt_smoke_json_response',
    test_suite:              TEST_SUITE,
    test_name:               `${probe.provider}_${probe.model}_json_response`,
    mode:                    'direct',
    provider:                probe.provider,
    model:                   probe.model,
    status:                  success ? 'succeeded' : 'failed',
    http_status:             result.http_status,
    success,
    error_code:              success ? '' : 'api_error',
    error_message,
    response_text:           result.response_text,
    structured_output_json:  '{}',
    stop_reason:             result.stop_reason,
    input_tokens:            result.input_tokens,
    output_tokens:           result.output_tokens,
    cached_tokens:           result.cached_tokens,
    total_tokens:            result.total_tokens,
    ...costs,
    latency_ms:              result.latency_ms,
    time_to_first_token_ms:  result.time_to_first_token_ms,
    started_at,
    completed_at,
    assertion_passed:        assertion,
    expected_contains:       '"ok":true',
    workspace_id:            WORKSPACE_ID,
    tenant_id:               TENANT_ID,
  };

  // null guard before writing
  const clean = checkNulls(row, `${probe.provider}/${probe.model}`);

  // print metrics
  console.log(`     http:       ${row.http_status}`);
  console.log(`     latency:    ${row.latency_ms}ms`);
  console.log(`     tokens:     ${row.input_tokens} in / ${row.output_tokens} out / ${row.cached_tokens} cached`);
  console.log(`     cost:       $${row.total_cost_usd} ($${row.input_cost_usd} in + $${row.output_cost_usd} out)`);
  console.log(`     stop:       ${row.stop_reason}`);
  console.log(`     assertion:  ${assertion === 1 ? '✓ pass' : '✗ fail'} — "${result.response_text.slice(0,80)}"`);

  // write D1
  try {
    await writeD1(row);
    console.log(`     D1:         ✓ written (${id})`);
  } catch (e) {
    console.error(`     D1:         ✗ ${e.message}`);
    failed++;
    continue;
  }

  // write Supabase
  try {
    await writeSupabase(row);
    console.log(`     Supabase:   ✓ written`);
  } catch (e) {
    console.error(`     Supabase:   ✗ ${e.message}`);
    failed++;
    continue;
  }

  if (clean && success && assertion) passed++;
  else failed++;
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`  PASSED ${passed}  FAILED ${failed}`);
console.log(`  run_group_id: ${RUN_GROUP_ID}`);
console.log(`\n  Verify in D1:`);
console.log(`  SELECT id,provider,model,latency_ms,input_tokens,output_tokens,total_cost_usd,assertion_passed`);
console.log(`  FROM ai_api_test_runs WHERE run_group_id='${RUN_GROUP_ID}';`);
console.log(`\n  Verify in Supabase:`);
console.log(`  SELECT request_id,provider,model_key,cost_usd,duration_ms,success`);
console.log(`  FROM agentsam_eval_runs WHERE metadata->>'run_group_id'='${RUN_GROUP_ID}';\n`);

process.exit(failed === 0 ? 0 : 1);
