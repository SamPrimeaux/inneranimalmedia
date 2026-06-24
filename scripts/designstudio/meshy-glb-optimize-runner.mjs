#!/usr/bin/env node
/**
 * Post-process Meshy GLBs on R2 — meshopt + webp (invisible to users).
 * Invoked by ExecOS after Worker ingest, or polled by designstudio:runner.
 */
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runD1Query, runD1Exec } from '../lib/d1-deploy-record.mjs';
import { optimizeGlbInPlace } from '../lib/glb-optimize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const ONCE = process.argv.includes('--once');
const JOB_ID_ARG = process.argv.find((a) => a.startsWith('--job-id='));
const TARGET_JOB_ID = JOB_ID_ARG ? JOB_ID_ARG.slice('--job-id='.length).trim() : null;
const POLL_MS = Number(process.env.GLB_OPTIMIZE_POLL_MS || 8000);
const BUCKET = 'inneranimalmedia';
const WORKER_ORIGIN = (process.env.IAM_WORKER_ORIGIN || 'https://inneranimalmedia.com').replace(/\/$/, '');

function log(...args) {
  console.log(`[meshy-glb-opt ${new Date().toISOString()}]`, ...args);
}

function sqlEscape(s) {
  return String(s ?? '').replace(/'/g, "''");
}

function parseTextureData(raw) {
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

function mergeTextureData(raw, patch) {
  return JSON.stringify({ ...parseTextureData(raw), ...patch });
}

function buildPublicUrl(r2Key) {
  const key = String(r2Key || '').trim();
  if (!key) return '';
  return key.startsWith('/') ? key : `/assets/${key.replace(/^\/+/, '')}`;
}

async function fetchPendingJobs() {
  const baseWhere = `engine = 'meshy' AND r2_key IS NOT NULL AND r2_key != '' AND r2_key NOT LIKE 'b64:%'`;
  const pendingClause = `(
    (status = 'running' AND texture_data LIKE '%"glb_optimize_pending":true%')
    OR (status = 'done' AND (
      texture_data IS NULL
      OR texture_data NOT LIKE '%"glb_optimized":true%'
      OR texture_data LIKE '%"glb_optimize_pending":true%'
    ))
  )`;

  if (TARGET_JOB_ID) {
    return runD1Query(
      REPO_ROOT,
      `SELECT * FROM agentsam_cad_jobs
       WHERE id = '${sqlEscape(TARGET_JOB_ID)}' AND ${baseWhere} AND ${pendingClause}
       LIMIT 1`,
    );
  }
  return runD1Query(
    REPO_ROOT,
    `SELECT * FROM agentsam_cad_jobs
     WHERE ${baseWhere} AND ${pendingClause}
     ORDER BY updated_at ASC LIMIT 3`,
  );
}

function wranglerR2(args) {
  const r = spawnSync(
    'npx',
    ['wrangler', ...args, '--remote', '-c', 'wrangler.production.toml'],
    { cwd: REPO_ROOT, encoding: 'utf8', env: process.env, stdio: 'pipe' },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `wrangler_r2_failed:${args.join(' ')}`);
  }
}

function downloadR2(r2Key, localPath) {
  wranglerR2(['r2', 'object', 'get', `${BUCKET}/${r2Key}`, `--file=${localPath}`]);
}

function uploadR2(r2Key, localPath) {
  wranglerR2([
    'r2',
    'object',
    'put',
    `${BUCKET}/${r2Key}`,
    `--file=${localPath}`,
    '--content-type=model/gltf-binary',
  ]);
}

async function callJobComplete(payload) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    log('INTERNAL_API_SECRET missing — D1 updated only');
    return null;
  }
  const res = await fetch(`${WORKER_ORIGIN}/api/internal/cad/job-complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': secret,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`job-complete ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}

async function processJob(job) {
  const r2Key = String(job.r2_key || '').trim();
  if (!r2Key || r2Key.startsWith('b64:')) {
    log('skip', job.id, 'no binary r2_key');
    return false;
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'meshy-glb-'));
  const glbPath = join(tmpDir, 'model.glb');
  try {
    downloadR2(r2Key, glbPath);
    const before = statSync(glbPath).size;
    const result = optimizeGlbInPlace(glbPath);
    uploadR2(r2Key, glbPath);
    const after = statSync(glbPath).size;
    const publicUrl = buildPublicUrl(r2Key);

    const td = mergeTextureData(job.texture_data, {
      glb_optimized: true,
      glb_optimize_pending: false,
      glb_compress: result.compress,
      glb_skinned: result.skinned,
      glb_bytes_before: before,
      glb_bytes_after: after,
      glb_optimized_at: new Date().toISOString(),
    });

    await runD1Exec(
      REPO_ROOT,
      `UPDATE agentsam_cad_jobs SET texture_data = '${sqlEscape(td)}', updated_at = unixepoch() WHERE id = '${sqlEscape(job.id)}'`,
    );

    await callJobComplete({
      job_id: job.id,
      status: 'done',
      r2_key: r2Key,
      r2_bucket: BUCKET,
      public_url: publicUrl,
      size_bytes: after,
      runner_host: 'glb-optimize',
    });

    log(
      'done',
      job.id,
      `${Math.round(before / 1024)}KB → ${Math.round(after / 1024)}KB`,
      result.skinned ? 'skinned/meshopt' : result.compress,
    );
    return true;
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export async function runMeshyGlbOptimizeOnce() {
  const jobs = await fetchPendingJobs();
  if (!jobs.length) return false;
  for (const job of jobs) {
    try {
      await processJob(job);
    } catch (e) {
      log('failed', job.id, e?.message ?? e);
    }
  }
  return true;
}

async function main() {
  log('starting', { once: ONCE, targetJob: TARGET_JOB_ID });
  if (ONCE) {
    const ran = await runMeshyGlbOptimizeOnce();
    if (!ran) log('no pending meshy GLB polish');
    return;
  }
  for (;;) {
    try {
      await runMeshyGlbOptimizeOnce();
    } catch (e) {
      log('loop error', e?.message ?? e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('meshy-glb-optimize-runner.mjs')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
