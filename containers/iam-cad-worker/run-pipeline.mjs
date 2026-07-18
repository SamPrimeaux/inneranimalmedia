#!/usr/bin/env node
/**
 * Headless CAD pipeline inside iam-cad-worker container.
 * Mirrors scripts/designstudio/cad-job-runner.mjs processJob (no D1).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizeGlbInPlace } from './scripts/lib/glb-optimize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_DIR = join(__dirname, 'scripts/designstudio');
const RUNNER_HOST = process.env.CAD_RUNNER_HOST || hostname();

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

function resolveFreecad() {
  const bin = process.env.FREECAD_BIN;
  if (bin) return bin;
  try {
    return execFileSync('bash', ['-lc', 'command -v FreeCADCmd || command -v freecadcmd'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function runOpenscadPipeline(tmpDir, scadPath, stlPath, glbPath) {
  const openscad = resolveOpenscad();
  if (!openscad) throw new Error('openscad_not_found');
  const r1 = spawnSync('bash', [join(SCRIPT_DIR, 'run-openscad.sh'), scadPath, stlPath], {
    encoding: 'utf8',
    env: { ...process.env, OPENSCAD_BIN: openscad },
  });
  if (r1.status !== 0) throw new Error(r1.stderr || r1.stdout || 'openscad_failed');

  const r2 = spawnSync('python3', [join(SCRIPT_DIR, 'stl-to-glb.py'), stlPath, glbPath, resolveBlender()], {
    encoding: 'utf8',
    env: process.env,
  });
  if (r2.status !== 0) throw new Error(r2.stderr || r2.stdout || 'stl_to_glb_failed');
  if (!existsSync(glbPath)) throw new Error('glb_missing_after_convert');
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
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'blender_failed');
  if (!existsSync(glbPath)) throw new Error('glb_missing_after_blender');
}

function runFreecadPipeline(scriptPath, logPath) {
  const freecad = resolveFreecad();
  if (!freecad) throw new Error('freecad_not_found');
  const r = spawnSync('bash', [join(SCRIPT_DIR, 'run-freecad.sh'), scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, FREECAD_BIN: freecad },
    timeout: 600_000,
  });
  writeFileSync(logPath, `${r.stdout || ''}\n${r.stderr || ''}`, 'utf8');
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'freecad_failed');
}

async function uploadGlbViaWorker({ workerOrigin, internalSecret, r2Key, localPath }) {
  const origin = String(workerOrigin || '').replace(/\/$/, '');
  const secret = String(internalSecret || '').trim();
  if (!origin || !secret) throw new Error('worker_upload_config_missing');

  const body = new FormData();
  body.append('r2_key', r2Key);
  body.append(
    'file',
    new Blob([readFileSync(localPath)], { type: 'model/gltf-binary' }),
    'output.glb',
  );

  const res = await fetch(`${origin}/api/internal/cad/glb-upload`, {
    method: 'POST',
    headers: { 'X-Internal-Secret': secret },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`glb_upload_${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true };
  }
}

async function callJobComplete({ workerOrigin, internalSecret, payload }) {
  const origin = String(workerOrigin || '').replace(/\/$/, '');
  const secret = String(internalSecret || '').trim();
  if (!origin || !secret) throw new Error('job_complete_config_missing');

  const res = await fetch(`${origin}/api/internal/cad/job-complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': secret,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`job_complete_${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}

/**
 * @param {{
 *   job_id: string,
 *   engine: string,
 *   script: string,
 *   r2_key: string,
 *   worker_origin: string,
 *   internal_secret: string,
 * }} job
 */
export async function runCadPipelineJob(job) {
  const started = Date.now();
  const tmpDir = mkdtempSync(join(tmpdir(), 'cadj-'));
  const glbPath = join(tmpDir, 'output.glb');

  try {
    const engine = String(job.engine || '').toLowerCase();
    const script = String(job.script || '');
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
    } else if (engine === 'freecad') {
      const pyPath = join(tmpDir, 'script.py');
      const logPath = join(tmpDir, 'freecad.log');
      writeFileSync(pyPath, script, 'utf8');
      runFreecadPipeline(pyPath, logPath);
      const stlPath = join(tmpDir, 'output.stl');
      const stepPath = join(tmpDir, 'output.step');
      if (existsSync(stlPath)) {
        const r = spawnSync('python3', [join(SCRIPT_DIR, 'stl-to-glb.py'), stlPath, glbPath, resolveBlender()], {
          encoding: 'utf8',
          env: process.env,
        });
        if (r.status !== 0 || !existsSync(glbPath)) {
          throw new Error(r.stderr || r.stdout || 'freecad_stl_to_glb_failed');
        }
      } else if (!existsSync(glbPath)) {
        throw new Error(
          existsSync(stepPath)
            ? 'freecad_output_step_only: export GLB or STL from script for viewport ingest'
            : 'freecad_no_output: script must write output.stl or export GLB',
        );
      }
    } else {
      throw new Error(`unsupported_engine:${engine}`);
    }

    await optimizeGlbInPlace(glbPath);

    const r2Key = String(job.r2_key || '').trim();
    if (!r2Key) throw new Error('r2_key_required');

    const uploaded = await uploadGlbViaWorker({
      workerOrigin: job.worker_origin,
      internalSecret: job.internal_secret,
      r2Key,
      localPath: glbPath,
    });

    // Bucket + public URL come from the Worker's glb-upload response (dedicated `cad`
    // bucket / cad.inneranimalmedia.com). Do NOT hardcode /assets/ or the legacy bucket —
    // when omitted the Worker's job-complete derives them, keeping one source of truth.
    const uploadedBucket = uploaded && typeof uploaded.bucket === 'string' ? uploaded.bucket.trim() : '';
    const uploadedPublicUrl =
      uploaded && typeof uploaded.public_url === 'string' ? uploaded.public_url.trim() : '';
    const sizeBytes = statSync(glbPath).size;

    await callJobComplete({
      workerOrigin: job.worker_origin,
      internalSecret: job.internal_secret,
      payload: {
        job_id: job.job_id,
        status: 'done',
        r2_key: r2Key,
        ...(uploadedBucket ? { r2_bucket: uploadedBucket } : {}),
        ...(uploadedPublicUrl ? { public_url: uploadedPublicUrl } : {}),
        size_bytes: sizeBytes,
        duration_ms: Date.now() - started,
        runner_host: RUNNER_HOST,
      },
    });

    return {
      ok: true,
      job_id: job.job_id,
      public_url: uploadedPublicUrl || null,
      duration_ms: Date.now() - started,
    };
  } catch (e) {
    const err = String(e?.message || e).slice(0, 2000);
    try {
      await callJobComplete({
        workerOrigin: job.worker_origin,
        internalSecret: job.internal_secret,
        payload: {
          job_id: job.job_id,
          status: 'failed',
          error: err,
          error_code: 'cad_container_failed',
          duration_ms: Date.now() - started,
          runner_host: RUNNER_HOST,
        },
      });
    } catch {
      /* worker callback failed — logged by caller */
    }
    throw e;
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
