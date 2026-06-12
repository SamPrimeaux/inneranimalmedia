/**
 * Poll pending Vertex Veo long-running jobs and finalize outputs to ARTIFACTS.
 */
import { resolveMoviemodeKv } from './moviemode-kv.js';

const VEO_JOB_KV_PREFIX = 'veo_job_';

function parseInputJson(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

async function fetchVeoOperation(env, operationName, apiKey) {
  const url = `https://us-central1-aiplatform.googleapis.com/v1/${operationName.replace(/^\//, '')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return { ok: false, error: `Veo poll ${res.status}: ${err.slice(0, 300)}` };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, data };
}

async function downloadVeoVideoBytes(data) {
  const videos =
    data?.response?.videos ||
    data?.response?.predictions?.[0]?.videos ||
    data?.response?.predictions ||
    [];
  const first = Array.isArray(videos) ? videos[0] : null;
  const b64 =
    first?.bytesBase64Encoded ||
    first?.video?.bytesBase64Encoded ||
    data?.response?.bytesBase64Encoded ||
    null;
  if (b64) {
    const bin = atob(String(b64));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const uri = first?.gcsUri || first?.uri || data?.response?.gcsUri || null;
  if (uri && String(uri).startsWith('http')) {
    const res = await fetch(String(uri));
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }
  return null;
}

/**
 * @param {any} env
 * @param {{ limit?: number }} [opts]
 */
export async function pollPendingVeoJobs(env, opts = {}) {
  if (!env?.DB) return { polled: 0, completed: 0, failed: 0 };
  const limit = Math.min(20, Math.max(1, Number(opts.limit) || 10));
  const apiKey = env.GOOGLE_API_KEY || env.GOOGLE_AI_API_KEY || env.GEMINI_API_KEY;
  if (!apiKey) return { polled: 0, completed: 0, failed: 0, skipped: 'no_api_key' };

  const { results } = await env.DB.prepare(
    `SELECT id, tenant_id, workspace_id, project_id, status, input_json
     FROM moviemode_render_jobs
     WHERE status IN ('queued', 'running')
       AND input_json LIKE '%"kind":"veo"%'
     ORDER BY created_at ASC
     LIMIT ?`,
  )
    .bind(limit)
    .all()
    .catch(() => ({ results: [] }));

  let completed = 0;
  let failed = 0;

  for (const row of results || []) {
    const input = parseInputJson(row.input_json);
    const veoJobId = input.veo_job_id || input.job_id;
    const operationName = input.operation_name;
    if (!operationName) continue;

    const poll = await fetchVeoOperation(env, operationName, apiKey);
    if (!poll.ok) {
      failed += 1;
      continue;
    }

    const op = poll.data;
    if (!op.done) {
      await env.DB.prepare(
        `UPDATE moviemode_render_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(row.id)
        .run()
        .catch(() => {});
      const kv = resolveMoviemodeKv(env);
      if (kv && veoJobId) {
        const key = `${VEO_JOB_KV_PREFIX}${veoJobId}`;
        const prev = await kv.get(key);
        if (prev) {
          const job = JSON.parse(prev);
          await kv.put(key, JSON.stringify({ ...job, status: 'running' }), {
            expirationTtl: 86400,
          });
        }
      }
      continue;
    }

    if (op.error) {
      failed += 1;
      await env.DB.prepare(
        `UPDATE moviemode_render_jobs SET status = 'failed', error_message = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(JSON.stringify(op.error).slice(0, 500), row.id)
        .run()
        .catch(() => {});
      const kvFail = resolveMoviemodeKv(env);
      if (kvFail && veoJobId) {
        const key = `${VEO_JOB_KV_PREFIX}${veoJobId}`;
        const prev = await kvFail.get(key);
        if (prev) {
          const job = JSON.parse(prev);
          await kvFail.put(
            key,
            JSON.stringify({ ...job, status: 'failed', error: op.error }),
            { expirationTtl: 86400 },
          );
        }
      }
      continue;
    }

    const bytes = await downloadVeoVideoBytes(op);
    if (!bytes?.byteLength) {
      failed += 1;
      continue;
    }

    try {
      const { finalizeMoviemodeOutput } = await import('./moviemode-persistence.js');
      const filename = `veo_${veoJobId || row.id}.mp4`;
      const finalized = await finalizeMoviemodeOutput(env, bytes, {
        jobId: veoJobId || row.id,
        filename,
        contentType: 'video/mp4',
        workspaceId: String(row.workspace_id),
        tenantId: String(row.tenant_id),
        projectId: String(row.project_id),
        renderJobId: row.id,
        variantType: 'custom',
        durationMs: (input.duration_seconds || 5) * 1000,
      });

      completed += 1;
      const kvDone = resolveMoviemodeKv(env);
      if (kvDone && veoJobId) {
        const key = `${VEO_JOB_KV_PREFIX}${veoJobId}`;
        const prev = await kvDone.get(key);
        const job = prev ? JSON.parse(prev) : {};
        await kvDone.put(
          key,
          JSON.stringify({
            ...job,
            status: 'done',
            r2_key: finalized.r2_key,
            artifact_id: finalized.artifact_id,
          }),
          { expirationTtl: 86400 },
        );
      }
    } catch (e) {
      failed += 1;
      console.warn('[veo-poll] finalize', e?.message ?? e);
    }
  }

  return { polled: (results || []).length, completed, failed };
}
