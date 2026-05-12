#!/usr/bin/env node
/**
 * scripts/run-eval-cases.mjs — Evaluation runner for Agent Sam.
 * Fetches cases from agentsam_eval_cases, hits /api/agent/chat,
 * grades results, and writes to agentsam_eval_runs.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Env loading ──────────────────────────────────────────────────────────────
function loadEnv() {
  const envFile = path.join(REPO_ROOT, '.env.cloudflare');
  if (existsSync(envFile)) {
    const lines = readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^export\s+([A-Z0-9_]+)=(.*)/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
loadEnv();

const BASE_URL = (process.env.BASE_URL || 'https://inneranimalmedia.com').replace(/\/$/, '');
const SESSION_COOKIE = process.env.SESSION_COOKIE || '';
const SUITE_ID = process.env.SUITE_ID || 'evs_smoke';
const TENANT_ID = process.env.TENANT_ID || 'tenant_sam_primeaux';
const GRADER_MODEL = process.env.GRADER_MODEL || 'gpt-4o-mini';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SESSION_COOKIE && !DRY_RUN) {
  console.error('Error: SESSION_COOKIE is required. Set it in environment.');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function d1Query(sql) {
  const cmd = `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --command="${sql.replace(/"/g, '\\"')}" --remote -c wrangler.production.toml --json`;
  try {
    const out = execSync(cmd, { cwd: REPO_ROOT, stdio: 'pipe' }).toString();
    const parsed = JSON.parse(out);
    return parsed?.[0]?.results ?? parsed?.results ?? parsed ?? [];
  } catch (e) {
    console.error('D1 Query Failed:', e.message);
    return [];
  }
}

async function runChat(prompt, model = 'auto') {
  const cookie = SESSION_COOKIE.includes('=') ? SESSION_COOKIE : `session=${SESSION_COOKIE}`;
  const start = Date.now();
  try {
    const resp = await fetch(`${BASE_URL}/api/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
      },
      body: JSON.stringify({
        message: prompt,
        model_id: model,
        stream: true,
      }),
    });

    const elapsed = Date.now() - start;
    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, error: `HTTP ${resp.status}: ${text}`, elapsed };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let toolsUsed = [];
    let donePayload = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') content += data.text;
            if (data.type === 'tool_call') toolsUsed.push(data.tool_call || data);
            if (data.type === 'done') donePayload = data;
          } catch (e) {
            // ignore parse errors for partial chunks
          }
        }
      }
    }

    return { 
      ok: true, 
      data: { 
        content, 
        tools_used: toolsUsed, 
        model_id: donePayload?.model_used || model,
        provider: donePayload?.provider || 'unknown'
      }, 
      elapsed: Date.now() - start 
    };
  } catch (e) {
    return { ok: false, error: e.message, elapsed: Date.now() - start };
  }
}

function simpleGrade(caseData, runResult) {
  const { expected_output, grading_criteria } = caseData;
  const outputText = runResult.data?.content || runResult.data?.message || '';
  const toolsUsed = runResult.data?.tools_used || [];
  
  let score = 1.0;
  let passed = 1;
  let notes = '';

  if (!outputText && !toolsUsed.length) {
    score = 0;
    passed = 0;
    notes = 'Empty response';
    return { score, passed, notes };
  }

  // Criteria: Must respond within 5s
  if (grading_criteria?.includes('5s') && runResult.elapsed > 5000) {
    score -= 0.2;
    notes += 'Slow response (>5s). ';
  }

  // Criteria: Must mention workspace name
  if (grading_criteria?.toLowerCase().includes('mention workspace')) {
    const wsName = expected_output || 'Inner Animal Media';
    if (!outputText.toLowerCase().includes(wsName.toLowerCase())) {
      score -= 0.5;
      notes += `Missing workspace name "${wsName}". `;
    }
  }

  // Criteria: Must call memory_read or d1_query tool
  if (grading_criteria?.toLowerCase().includes('call memory_read or d1_query')) {
    const usedRelevantTool = toolsUsed.some(t => t.name === 'memory_read' || t.name === 'd1_query' || t.name === 'memory_search');
    if (!usedRelevantTool) {
      score -= 0.5;
      notes += 'Did not call required tools. ';
    }
  }

  if (score < 0.5) passed = 0;
  return { score: Math.max(0, score), passed, notes: notes || 'Passed criteria' };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Starting Eval Run for suite: ${SUITE_ID}`);
  console.log(`Target: ${BASE_URL}\n`);

  const cases = d1Query(`SELECT * FROM agentsam_eval_cases WHERE suite_id = '${SUITE_ID}' AND tenant_id = '${TENANT_ID}'`);
  if (!cases.length) {
    console.log('No cases found to run.');
    return;
  }

  console.log(`Found ${cases.length} cases.\n`);

  for (const c of cases) {
    console.log(`Running Case: ${c.input_prompt.slice(0, 50)}...`);
    
    if (DRY_RUN) {
      console.log('  [DRY RUN] Skipping network call.');
      continue;
    }

    const result = await runChat(c.input_prompt);
    if (!result.ok) {
      console.log(`  ❌ Failed: ${result.error}`);
      continue;
    }

    const { score, passed, notes } = simpleGrade(c, result);
    console.log(`  ✅ Score: ${score.toFixed(2)} | Passed: ${passed} | Latency: ${result.elapsed}ms`);

    const runId = `evr_${Math.random().toString(36).slice(2, 11)}`;
    const outputText = (result.data?.content || '').replace(/'/g, "''");
    const graderNotes = notes.replace(/'/g, "''");
    
    const insertSql = `
      INSERT INTO agentsam_eval_runs (
        id, suite_id, case_id, tenant_id, model_key, provider,
        latency_ms, score_overall, passed, output_text, grader_notes, grader_model
      ) VALUES (
        '${runId}', '${c.suite_id}', '${c.id}', '${c.tenant_id}', 
        '${result.data?.model_id || 'unknown'}', '${result.data?.provider || 'unknown'}',
        ${result.elapsed}, ${score}, ${passed}, '${outputText}', '${graderNotes}', '${GRADER_MODEL}'
      );
    `;
    
    d1Query(insertSql);
  }

  console.log('\n✨ Eval run complete.');
}

main().catch(console.error);
