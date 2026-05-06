#!/usr/bin/env node
/**
 * Append one deploy tool event to .deploy-tool-events.jsonl (flushed on complete).
 * Flushed to agentsam_tool_call_events by record-supabase-deploy-complete.mjs (run_group_id, tenant, emails).
 * docs/DEPLOY_ENV_SUPABASE_MAPPING.md
 *
 * Usage:
 *   node scripts/log-supabase-deploy-tool.mjs --tool wrangler_deploy --category deploy --success 1 --duration-ms 12000
 */
import { appendFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { repoRoot, DEPLOY_TOOL_EVENTS_FILE } from './lib/supabase-deploy-paths.mjs';

function arg(name, def = '') {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  return process.argv[i + 1] ?? def;
}

function main() {
  const root = repoRoot();
  let ctx = {};
  try {
    const p = resolve(root, '.deploy-run-context.json');
    if (existsSync(p)) ctx = JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    /* optional */
  }

  const toolName = arg('--tool', 'unknown');
  const category = arg('--category', 'deploy');
  const toolSource = arg('--source', 'script');
  const durationMs = Number(arg('--duration-ms', '0')) || 0;
  const success = arg('--success', '1') !== '0' && arg('--success', '1') !== 'false';
  const err = arg('--error', '');
  const inputPreview = arg('--input-preview', '').slice(0, 800);
  const outputPreview = arg('--output-preview', '').slice(0, 800);

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    run_group_id: ctx.run_group_id || process.env.RUN_GROUP_ID || null,
    tenant_id: ctx.tenant_id || process.env.TENANT_ID || null,
    workspace_id: ctx.workspace_id || process.env.WORKSPACE_ID || null,
    d1_auth_user_id: ctx.d1_auth_user_id || process.env.D1_AUTH_USER_ID || null,
    user_email: ctx.user_email || process.env.DEPLOY_USER_EMAIL || null,
    agent_tool: 'deploy_automation',
    tool_name: toolName,
    tool_category: category,
    tool_source: toolSource,
    duration_ms: durationMs,
    success,
    error_message: err || null,
    input_preview: inputPreview || null,
    output_preview: outputPreview || null,
    input_json: {},
    output_json: {},
    metadata: { script: 'log-supabase-deploy-tool.mjs' },
  });

  appendFileSync(resolve(root, DEPLOY_TOOL_EVENTS_FILE), line + '\n', 'utf8');
}

main();
