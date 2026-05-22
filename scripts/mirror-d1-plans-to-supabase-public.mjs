#!/usr/bin/env node
/**
 * Mirror D1 agentsam_plans + agentsam_plan_tasks → Supabase public.* via PostgREST.
 * Uses same column mapping as src/core/agentsam-plan-supabase-public-sync.js
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/mirror-d1-plans-to-supabase-public.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/mirror-d1-plans-to-supabase-public.mjs --plan plan_may22_2026_agent_sam
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DB = process.env.IAM_D1_DB || 'inneranimalmedia-business';
const WRANGLER_CFG = process.env.IAM_WRANGLER_CONFIG || 'wrangler.production.toml';

const DEFAULT_PLANS = [
  'plan_may22_2026_agent_sam',
  'plan_may14_2026_repair',
];

function loadEnvCloudflare() {
  const p = resolve(ROOT, '.env.cloudflare');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k && process.env[k] == null) process.env[k] = v;
  }
}

function d1Json(sql) {
  const args = [
    'wrangler',
    'd1',
    'execute',
    DB,
    '--remote',
    '-c',
    WRANGLER_CFG,
    '--json',
    '--command',
    sql,
  ];
  const out = execFileSync('npx', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  const start = out.indexOf('[');
  const parsed = JSON.parse(out.slice(start));
  return parsed[0]?.results ?? [];
}

function isoFromD1Time(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (Number.isFinite(n)) {
    const ms = n < 1e12 ? n * 1000 : n;
    return new Date(ms).toISOString();
  }
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function jsonTextToJsonb(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

function mapPlan(plan) {
  const nowIso = new Date().toISOString();
  const planDate = String(plan.plan_date || '').trim().slice(0, 10);
  return {
    id: String(plan.id),
    plan_date: planDate || nowIso.slice(0, 10),
    title: String(plan.title || 'Plan').slice(0, 2000),
    status: String(plan.status || 'active'),
    morning_brief: plan.morning_brief != null ? String(plan.morning_brief) : null,
    session_notes: plan.session_notes != null ? String(plan.session_notes) : null,
    eod_summary: plan.eod_summary != null ? String(plan.eod_summary) : null,
    available_providers: jsonTextToJsonb(plan.available_providers) ?? [],
    blocked_providers: jsonTextToJsonb(plan.blocked_providers) ?? [],
    budget_snapshot: jsonTextToJsonb(plan.budget_snapshot) ?? {},
    default_model: plan.default_model != null ? String(plan.default_model) : null,
    carry_over_from: plan.carry_over_from != null ? String(plan.carry_over_from) : null,
    carry_over_count: plan.carry_over_count != null ? Number(plan.carry_over_count) : null,
    tasks_total: Number(plan.tasks_total) || 0,
    tasks_done: Number(plan.tasks_done) || 0,
    tasks_blocked: Number(plan.tasks_blocked) || 0,
    created_at: isoFromD1Time(plan.created_at) || nowIso,
    updated_at: isoFromD1Time(plan.updated_at) || nowIso,
  };
}

function mapTask(task) {
  const notes =
    task.output_summary != null && String(task.output_summary).trim()
      ? String(task.output_summary)
      : null;
  return {
    id: String(task.id),
    plan_id: String(task.plan_id),
    order_index: Number(task.order_index) || 0,
    title: String(task.title || 'Task').slice(0, 2000),
    description: task.description != null ? String(task.description).slice(0, 8000) : null,
    priority: String(task.priority || 'P1').toUpperCase(),
    category: String(task.category || 'other').toLowerCase(),
    status: String(task.status || 'todo').toLowerCase(),
    files_involved: jsonTextToJsonb(task.files_involved) ?? [],
    tables_involved: jsonTextToJsonb(task.tables_involved) ?? [],
    routes_involved: jsonTextToJsonb(task.routes_involved) ?? [],
    estimated_minutes: task.estimated_minutes != null ? Number(task.estimated_minutes) : null,
    actual_minutes: task.actual_minutes != null ? Number(task.actual_minutes) : null,
    blocked_reason: task.blocked_reason != null ? String(task.blocked_reason) : null,
    notes,
    created_at: isoFromD1Time(task.created_at) || new Date().toISOString(),
    completed_at: isoFromD1Time(task.completed_at),
  };
}

async function postUpsert(base, key, table, rows) {
  if (!rows.length) return { ok: true, count: 0 };
  const q = `?on_conflict=${encodeURIComponent('id')}`;
  const res = await fetch(`${base}/rest/v1/${table}${q}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${table} HTTP ${res.status}: ${text.slice(0, 2000)}`);
  }
  return { ok: true, count: rows.length };
}

async function mirrorPlan(planId) {
  const pid = String(planId).replace(/'/g, "''");
  const planRows = d1Json(`SELECT * FROM agentsam_plans WHERE id = '${pid}' LIMIT 1`);
  if (!planRows.length) {
    console.warn(`[skip] plan not found: ${planId}`);
    return;
  }
  const taskRows = d1Json(
    `SELECT * FROM agentsam_plan_tasks WHERE plan_id = '${pid}' ORDER BY order_index ASC`,
  );
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(2);
  }
  const planRow = mapPlan(planRows[0]);
  const taskMapped = taskRows.map(mapTask).filter((t) => t.id && t.plan_id);
  await postUpsert(base, key, 'agentsam_plans', [planRow]);
  console.log(`[ok] agentsam_plans ${planId}`);
  if (taskMapped.length) {
    await postUpsert(base, key, 'agentsam_plan_tasks', taskMapped);
    console.log(`[ok] agentsam_plan_tasks ${taskMapped.length} rows for ${planId}`);
  }
}

async function main() {
  loadEnvCloudflare();
  const argPlan = process.argv.includes('--plan')
    ? process.argv[process.argv.indexOf('--plan') + 1]
    : null;
  const plans = argPlan ? [argPlan] : DEFAULT_PLANS;
  for (const p of plans) {
    await mirrorPlan(p);
  }
  console.log('[mirror-d1-plans] done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
