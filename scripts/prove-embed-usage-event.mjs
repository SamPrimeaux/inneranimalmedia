#!/usr/bin/env node
/**
 * Prove agentsam_usage_events accepts the embed spine shape (Gate 0).
 * Inserts one smoke row then selects it back. Does not call OpenAI.
 *
 * Usage: node scripts/prove-embed-usage-event.mjs
 */
import { execFileSync } from 'child_process';

const id = `ue_embed_smoke_${Date.now().toString(36)}`;
const ws = 'ws_inneranimalmedia';
const tenant = 'tenant_sam_primeaux';

const insertSql = `
INSERT INTO agentsam_usage_events (
  id, tenant_id, workspace_id, user_id, provider, model, model_key,
  tokens_in, tokens_out, input_tokens, output_tokens, total_tokens, cost_usd,
  event_type, tool_name, task_type, status, ref_table, ref_id, agent_name, created_at
) VALUES (
  '${id}', '${tenant}', '${ws}', 'usr_sam_primeaux', 'openai',
  'text-embedding-3-large', 'text-embedding-3-large',
  12, 0, 12, 0, 12, 0.000002,
  'embed', 'agentsam_codebase_retrieve', 'ast_retrieve', 'ok',
  'agentsam_codebase_ast_symbols_oai3large_1536', 'smoke',
  'agent-sam', unixepoch()
)`;

const selectSql = `
SELECT id, event_type, task_type, tool_name, model_key, tokens_in, cost_usd,
       workspace_id, user_id, ref_table, ref_id
  FROM agentsam_usage_events
 WHERE id = '${id}'
 LIMIT 1`;

function d1(sql) {
  const out = execFileSync(
    './scripts/with-cloudflare-env.sh',
    [
      'npx',
      'wrangler',
      'd1',
      'execute',
      'inneranimalmedia-business',
      '--remote',
      '-c',
      'wrangler.production.toml',
      '--json',
      '--command',
      sql,
    ],
    { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname },
  );
  return JSON.parse(out);
}

const ins = d1(insertSql);
if (!ins?.[0]?.success && !ins?.success) {
  console.error('INSERT failed', ins);
  process.exit(1);
}
const sel = d1(selectSql);
const row = sel?.[0]?.results?.[0] || sel?.results?.[0];
if (!row || row.event_type !== 'embed' || row.task_type !== 'ast_retrieve') {
  console.error('SELECT proof failed', sel);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, proof_row: row }, null, 2));
