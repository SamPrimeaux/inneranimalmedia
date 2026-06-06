#!/usr/bin/env node
/**
 * CAD job runner — polls D1 agentsam_cad_jobs (pending) and executes OpenSCAD/Blender locally.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/designstudio/cad-job-runner.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/designstudio/cad-job-runner.mjs --once
 *
 * Env:
 *   OPENSCAD_BIN, BLENDER_BIN — toolchain paths
 *   CAD_RUNNER_HOST — recorded on job rows (default: hostname)
 *   IAM_WORKER_ORIGIN — default https://inneranimalmedia.com
 *   INTERNAL_API_SECRET — job-complete callback auth
 *   CAD_RUNNER_POLL_MS — default 5000
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runD1Query, runD1Exec } from '../lib/d1-deploy-record.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const SCRIPT_DIR = __dirname;
const ONCE = process.argv.includes('--once');
const POLL_MS = Number(process.env.CAD_RUNNER_POLL_MS || 5000);
const RUNNER_HOST = process.env.CAD_RUNNER_HOST || hostname();
const WORKER_ORIGIN = (process.env.IAM_WORKER_ORIGIN || 'https://inneranimalmedia.com').replace(/\/$/, '');
const STUCK_SEC = Number(process.env.CAD_RUNNER_STUCK_SEC || 1800);

function log(...args) {
  console.log(`[cad-runner ${new Date().toISOString()}]`, ...args);
}

function decodeScript(stored) {
  const raw = String(stored || '').trim();
  if (!raw) return '';
  if (raw.startsWith('b64:')) {
    return Buffer.from(raw.slice(4), 'base64').toString('utf8');
  }
  return raw;
}

function resolveOpenscad() {
  const bin = process.env.OPENSCAD_BIN;
  if (bin) return bin;
  try {
    return execFileSync('bash', ['-lc', 'command -v openscad'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function resolveBlender() {
  const bin = process.env.BLENDER_BIN;
  if (bin) return bin;
  try {
    return execFileSync('bash', ['-lc', 'command -v blender'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function sqlEscape(s) {
  return String(s ?? '').replace(/'/g, "''");
}

async function resetStuckJobs() {
  const cutoff = Math.floor(Date.now() / 1000) - STUCK_SEC;
  await runD1Exec(
    REPO_ROOT,
    `UPDATE agentsam_cad_jobs SET status = 'pending', started_at = NULL, runner_host = NULL, updated_at = unixepoch()
     WHERE status = 'running' AND started_at IS NOT NULL AND started_at < ${cutoff}`,
  );
}

async function claimNextJob() {
  const rows = runD1Query(
    REPO_ROOT,
    `SELECT id FROM agentsam_cad_jobs
     WHERE status = 'pending' AND engine IN ('openscad', 'blender')
     ORDER BY created_at ASC LIMIT 1`,
  );
  if (!rows.length) return null;
  const id = String(rows[0].id);
  const now = Math.floor(Date.now() / 1000);
  await runD1Exec(
    REPO_ROOT,
    `UPDATE agentsam_cad_jobs SET
       status = 'running', started_at = ${now}, runner_host = '${sqlEscape(RUNNER_HOST)}',
       progress_pct = 5, updated_at = unixepoch()
     WHERE id = '${sqlEscape(id)}' AND status = 'pending'`,
  );
  const jobRows = runD1Query(
    REPO_ROOT,
    `SELECT * FROM agentsam_cad_jobs WHERE id = '${sqlEscape(id)}' AND status = 'running' LIMIT 1`,
  );
  return jobRows[0] || null;
}

function runOpenscadPipeline(tmpDir, scadPath, stlPath, glbPath) {
  const openscad = resolveOpenscad();
  if (!openscad) throw new Error('openscad_not_found');
  const r1 = spawnSync('bash', [join(SCRIPT_DIR, 'run-openscad.sh'), scadPath, stlPath], {
    encoding: 'utf8',
    env: { ...process.env, OPENSCAD_BIN: openscad },
  });
  if (r1.status !== 0) {
    throw new Error(r1.stderr || r1.stdout || 'openscad_failed');
  }
  const r2 = spawnSync('python3', [join(SCRIPT_DIR, 'stl-to-glb.py'), stlPath, glbPath, resolveBlender()], {
    encoding: 'utf8',
    env: process.env,
  });
  if (r2.status !== 0) {
    throw new Error(r2.stderr || r2.stdout || 'stl_to_glb_failed');
  }
  if (!existsSync(glbPath)) {
    throw new Error('glb_missing_after_convert');
  }
}

function runBlenderPipeline(tmpDir, scriptPath, glbPath) {
  const blender = resolveBlender();
  if (!blender) throw new Error('blender_not_found');
  let script = readFileSync(scriptPath, 'utf8');
  script = `OUTPUT_GLB = ${JSON.stringify(glbPath)}\n` + script;
  writeFileSync(scriptPath, script, 'utf8');
  const r = spawnSync(blender, ['--background', '--python', scriptPath], {
    encoding: 'utf8',
    env: process.env,
    timeout: 600_000,
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || 'blender_failed');
  }
  if (!existsSync(glbPath)) {
    throw new Error('glb_missing_after_blender');
  }
}

function buildR2Key(job) {
  const t = String(job.tenant_id || 'system').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const w = String(job.workspace_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const j = String(job.id || 'job').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  return `cad/exports/${t}/${w}/${j}.glb`;
}

function uploadGlb(localPath, r2Key) {
  spawnSync(
    'bash',
    [join(REPO_ROOT, 'scripts/with-cloudflare-env.sh'), 'npx', 'wrangler', 'r2', 'object', 'put',
      `inneranimalmedia/${r2Key}`,
      `--file=${localPath}`,
      '--content-type=model/gltf-binary',
      '--remote',
      '-c',
      'wrangler.jsonc',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' },
  );
}

async function callJobComplete(payload) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    log('INTERNAL_API_SECRET missing — updating D1 only via runner fallback');
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
  const started = Date.now();
  const tmpDir = mkdtempSync(join(tmpdir(), 'cadj-'));
  const glbPath = join(tmpDir, 'output.glb');
  try {
    const engine = String(job.engine || '').toLowerCase();
    const script = decodeScript(job.r2_key);
    if (!script) throw new Error('missing_script_payload');

    if (engine === 'openscad') {
      const scadPath = join(tmpDir, 'model.scad');
      const stlPath = join(tmpDir, 'model.stl');
      writeFileSync(scadPath, script, 'utf8');
      runOpenscadPipeline(tmpDir, scadPath, stlPath, glbPath);
    } else if (engine === 'blender') {
      const pyPath = join(tmpDir, 'script.py');
      writeFileSync(pyPath, script, 'utf8');
      runBlenderPipeline(tmpDir, pyPath, glbPath);
    } else {
      throw new Error(`unsupported_engine:${engine}`);
    }

    const r2Key = buildR2Key(job);
    uploadGlb(glbPath, r2Key);
    const publicUrl = `/assets/${r2Key}`;
    const sizeBytes = statSync(glbPath).size;

    const result = await callJobComplete({
      job_id: job.id,
      status: 'done',
      r2_key: r2Key,
      r2_bucket: 'inneranimalmedia',
      public_url: publicUrl,
      size_bytes: sizeBytes,
      duration_ms: Date.now() - started,
      runner_host: RUNNER_HOST,
    });

    if (!result) {
      await runD1Exec(
        REPO_ROOT,
        `UPDATE agentsam_cad_jobs SET status='done', r2_key='${sqlEscape(r2Key)}', r2_bucket='inneranimalmedia',
         result_url='${sqlEscape(publicUrl)}', progress_pct=100, finished_at=unixepoch(), updated_at=unixepoch()
         WHERE id='${sqlEscape(job.id)}'`,
      );
    }

    log('done', job.id, publicUrl);
    return true;
  } catch (e) {
    const err = String(e?.message || e).slice(0, 2000);
    log('failed', job.id, err);
    try {
      await callJobComplete({
        job_id: job.id,
        status: 'failed',
        error: err,
        error_code: 'runner_failed',
        duration_ms: Date.now() - started,
        runner_host: RUNNER_HOST,
      });
    } catch (cbErr) {
      await runD1Exec(
        REPO_ROOT,
        `UPDATE agentsam_cad_jobs SET status='failed', error='${sqlEscape(err)}', error_code='runner_failed',
         finished_at=unixepoch(), updated_at=unixepoch() WHERE id='${sqlEscape(job.id)}'`,
      );
      log('job-complete callback failed:', cbErr?.message ?? cbErr);
    }
    return false;
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function loopOnce() {
  await resetStuckJobs();
  const job = await claimNextJob();
  if (!job) return false;
  log('claimed', job.id, job.engine);
  await processJob(job);
  return true;
}

async function main() {
  log('starting', { host: RUNNER_HOST, once: ONCE, pollMs: POLL_MS });
  if (ONCE) {
    const ran = await loopOnce();
    if (!ran) log('no pending jobs');
    return;
  }
  for (;;) {
    try {
      await loopOnce();
    } catch (e) {
      log('loop error', e?.message ?? e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
