/**
 * Poll pending Vertex Veo long-running jobs and finalize outputs to ARTIFACTS.
 * Default destination is local (playable artifact URL). Stream ingest is optional.
 */
import { resolveMoviemodeKv } from './moviemode-kv.js';
import { resolveVeoArtifactUserId } from './moviemode-persistence.js';
import { buildStreamWatchUrls, copyStreamVideoFromUrl } from './stream-api.js';

export { resolveVeoArtifactUserId };

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

async function readVeoKvJob(env, veoJobId) {
  const kv = resolveMoviemodeKv(env);
  if (!kv || !veoJobId) return null;
  const raw = await kv.get(`${VEO_JOB_KV_PREFIX}${veoJobId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeVeoKvJob(env, veoJobId, patch) {
  const kv = resolveMoviemodeKv(env);
  if (!kv || !veoJobId) return;
  const key = `${VEO_JOB_KV_PREFIX}${veoJobId}`;
  const prev = await readVeoKvJob(env, veoJobId);
  await kv.put(key, JSON.stringify({ ...(prev || {}), ...patch }), { expirationTtl: 86400 });
}

function normalizeDestination(raw) {
  const d = String(raw || 'local').trim().toLowerCase();
  return d === 'stream' ? 'stream' : 'local';
}

/**
 * Optional Stream ingest after local finalize. Never required for local destination.
 * Uses customer BYOK Stream context when userId/workspaceId are available.
 */
async function maybeIngestToStream(env, {
  destination,
  publicUrl,
  name,
  requireStream,
  userId,
  workspaceId,
}) {
  const dest = normalizeDestination(destination);
  if (dest !== 'stream') return {};

  const { resolveCfStreamContext } = await import('./cf-oauth-stream.js');
  const { isPlatformOperator, resolveOperatorAuthUserRow } = await import('./operator-identity.js');
  let allowPlatformFallback = false;
  if (userId) {
    try {
      const opRow = await resolveOperatorAuthUserRow(env, { id: userId });
      allowPlatformFallback = await isPlatformOperator(env, opRow);
    } catch {
      allowPlatformFallback = false;
    }
  }
  const streamCtx = await resolveCfStreamContext(env, {
    userId,
    workspaceId,
    requireWrite: true,
    allowPlatformFallback,
  });
  if (!streamCtx.ok) {
    const msg = streamCtx.message || streamCtx.error || 'Stream not connected';
    if (requireStream) throw new Error(`Stream destination requested but unavailable: ${msg}`);
    return { error: msg, reconnect_required: !!streamCtx.reconnectRequired };
  }

  if (!publicUrl) {
    const msg = 'playable URL required for Stream copy';
    if (requireStream) throw new Error(msg);
    return { error: msg };
  }
  const result = await copyStreamVideoFromUrl(streamCtx, {
    url: publicUrl,
    meta: { name: String(name || 'Veo video').slice(0, 120) },
  });
  const uid = String(result?.uid || result?.id || '').trim();
  if (!uid) {
    const msg = 'Stream copy returned no uid';
    if (requireStream) throw new Error(msg);
    return { error: msg };
  }
  const urls = buildStreamWatchUrls(uid, { video: result, accountId: streamCtx.accountId });
  try {
    const { upsertStreamMediaAsset } = await import('./stream-api.js');
    await upsertStreamMediaAsset(env, {
      streamCtx,
      video: result,
      userId,
      workspaceId,
      providerStatus: result?.status?.state || 'queued',
    });
  } catch {
    /* best-effort registry */
  }
  return {
    stream_uid: uid,
    watch_url: urls.watch_url || null,
    hls: urls.hls || result?.playback?.hls || null,
    iframe_url: urls.iframe_url || null,
    thumbnail: urls.thumbnail || null,
    cloudflare_account_id: streamCtx.accountId,
    credential_source: streamCtx.source,
  };
}

async function persistStreamUidOnAsset(env, { assetId, workspaceId, stream, userId }) {
  if (!env?.DB || !assetId || !stream?.stream_uid) return;
  const metaPatch = {
    stream_uid: stream.stream_uid,
    stream_hls_url: stream.hls || null,
    stream_watch_url: stream.watch_url || null,
    stream_iframe_url: stream.iframe_url || null,
    cloudflare_account_id: stream.cloudflare_account_id || null,
    credential_source: stream.credential_source || null,
  };
  await env.DB.prepare(
    `UPDATE media_assets
     SET source_kind = 'stream',
         source_uri = ?,
         stream_uid = ?,
         cloudflare_account_id = COALESCE(?, cloudflare_account_id),
         provider_credential_source = COALESCE(?, provider_credential_source),
         created_by_user_id = COALESCE(created_by_user_id, ?),
         created_from_workspace_id = COALESCE(created_from_workspace_id, ?),
         provider_status = 'ready',
         metadata_json = ?,
         status = 'ready',
         updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      `stream://${stream.stream_uid}`,
      stream.stream_uid,
      stream.cloudflare_account_id || null,
      stream.credential_source || null,
      userId || null,
      workspaceId || null,
      JSON.stringify(metaPatch),
      assetId,
    )
    .run()
    .catch((e) => console.warn('[veo-poll] stream_uid persist', e?.message ?? e));
}

/**
 * Finalize one completed Veo operation for a render_jobs row.
 * @param {any} env
 * @param {any} row - moviemode_render_jobs row
 * @param {any} op - Vertex operation payload (done)
 * @param {any} input - parsed input_json
 */
async function finalizeVeoRow(env, row, op, input) {
  const veoJobId = input.veo_job_id || input.job_id;
  const kvJob = await readVeoKvJob(env, veoJobId);
  const destination = normalizeDestination(input.destination ?? kvJob?.destination);
  const requireStream = destination === 'stream';

  if (op.error) {
    await env.DB.prepare(
      `UPDATE moviemode_render_jobs SET status = 'failed', error_message = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(JSON.stringify(op.error).slice(0, 500), row.id)
      .run()
      .catch(() => {});
    await writeVeoKvJob(env, veoJobId, { status: 'failed', error: op.error, destination });
    return { ok: false, failed: true, reason: 'operation_error' };
  }

  const bytes = await downloadVeoVideoBytes(op);
  if (!bytes?.byteLength) {
    await writeVeoKvJob(env, veoJobId, { status: 'failed', error: 'no_video_bytes', destination });
    return { ok: false, failed: true, reason: 'no_video_bytes' };
  }

  const userId = await resolveVeoArtifactUserId(env, {
    userId: input.user_id || kvJob?.user_id,
    workspaceId: row.workspace_id,
  });
  if (!userId) {
    throw new Error('user_id required to finalize Veo output (missing on job and no workspace owner)');
  }

  const { finalizeMoviemodeOutput } = await import('./moviemode-persistence.js');
  const filename = `veo_${veoJobId || row.id}.mp4`;
  const finalized = await finalizeMoviemodeOutput(env, bytes, {
    jobId: veoJobId || row.id,
    filename,
    contentType: 'video/mp4',
    workspaceId: String(row.workspace_id),
    tenantId: String(row.tenant_id),
    userId,
    projectId: String(row.project_id),
    renderJobId: row.id,
    variantType: 'custom',
    durationMs: (input.duration_seconds || kvJob?.duration_seconds || 5) * 1000,
    destination,
    metadataExtra: {
      kind: 'veo',
      destination,
      model_key: input.model_key || kvJob?.model_key || null,
      prompt: (input.prompt || kvJob?.prompt || '').slice(0, 500) || null,
    },
  });

  let stream = {};
  try {
    stream = await maybeIngestToStream(env, {
      destination,
      publicUrl: finalized.public_url,
      name: filename,
      requireStream,
      userId,
      workspaceId: String(row.workspace_id),
    });
  } catch (e) {
    // Local artifact already persisted — mark job failed only when Stream was required.
    if (requireStream) {
      await writeVeoKvJob(env, veoJobId, {
        status: 'failed',
        error: String(e?.message || e).slice(0, 400),
        destination,
        r2_key: finalized.r2_key,
        artifact_id: finalized.artifact_id,
        public_url: finalized.public_url,
        playable_url: finalized.public_url,
      });
      await env.DB.prepare(
        `UPDATE moviemode_render_jobs SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(String(e?.message || e).slice(0, 500), row.id)
        .run()
        .catch(() => {});
      throw e;
    }
    stream = { error: String(e?.message || e).slice(0, 400) };
  }

  if (stream.stream_uid) {
    await persistStreamUidOnAsset(env, {
      assetId: finalized.asset_id,
      workspaceId: String(row.workspace_id),
      stream,
      userId,
    });
  }

  const playableUrl = stream.watch_url || finalized.public_url;
  await writeVeoKvJob(env, veoJobId, {
    status: 'done',
    destination,
    user_id: userId,
    r2_key: finalized.r2_key,
    artifact_id: finalized.artifact_id,
    asset_id: finalized.asset_id,
    export_id: finalized.export_id,
    public_url: finalized.public_url,
    playable_url: playableUrl,
    stream_uid: stream.stream_uid || null,
    watch_url: stream.watch_url || null,
    hls: stream.hls || null,
    stream_error: stream.error || null,
  });

  return {
    ok: true,
    completed: true,
    finalized,
    stream,
    playable_url: playableUrl,
    destination,
  };
}

/**
 * Poll a single Veo job by id (on-demand from status API).
 * @param {any} env
 * @param {string} veoJobId
 */
export async function pollVeoJobById(env, veoJobId) {
  const id = String(veoJobId || '').trim();
  if (!env?.DB || !id) return { ok: false, error: 'job_id required' };
  const apiKey = env.GOOGLE_API_KEY || env.GOOGLE_AI_API_KEY || env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: 'no_api_key' };

  const renderId = `mmrender_${id.replace(/^veojob_/, '')}`;
  let row = await env.DB.prepare(
    `SELECT id, tenant_id, workspace_id, project_id, status, input_json, output_json
     FROM moviemode_render_jobs WHERE id = ? LIMIT 1`,
  )
    .bind(renderId)
    .first()
    .catch(() => null);

  if (!row) {
    const { results } = await env.DB.prepare(
      `SELECT id, tenant_id, workspace_id, project_id, status, input_json, output_json
       FROM moviemode_render_jobs
       WHERE input_json LIKE ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
      .bind(`%"veo_job_id":"${id}"%`)
      .all()
      .catch(() => ({ results: [] }));
    row = results?.[0] || null;
  }

  const kvJob = await readVeoKvJob(env, id);
  if (!row && !kvJob) return { ok: false, error: 'not_found' };
  if (kvJob?.status === 'done' || kvJob?.status === 'failed') {
    return { ok: true, job: kvJob, polled: false };
  }
  if (!row) {
    return { ok: true, job: kvJob || { job_id: id, status: 'queued' }, polled: false };
  }
  if (row.status === 'complete' || row.status === 'failed') {
    return { ok: true, job: kvJob || { job_id: id, status: row.status }, polled: false };
  }

  const input = { ...parseInputJson(row.input_json), ...(kvJob || {}) };
  const operationName = input.operation_name;
  if (!operationName) return { ok: false, error: 'missing_operation_name', job: kvJob };

  const poll = await fetchVeoOperation(env, operationName, apiKey);
  if (!poll.ok) return { ok: false, error: poll.error, job: kvJob };

  const op = poll.data;
  if (!op.done) {
    await env.DB.prepare(
      `UPDATE moviemode_render_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(row.id)
      .run()
      .catch(() => {});
    await writeVeoKvJob(env, id, { status: 'running' });
    const next = await readVeoKvJob(env, id);
    return { ok: true, job: next || { ...kvJob, status: 'running' }, polled: true };
  }

  try {
    const out = await finalizeVeoRow(env, row, op, input);
    const next = await readVeoKvJob(env, id);
    return { ok: true, job: next, polled: true, finalize: out };
  } catch (e) {
    console.warn('[veo-poll] finalize single', e?.message ?? e);
    return { ok: false, error: String(e?.message || e).slice(0, 400), job: await readVeoKvJob(env, id) };
  }
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
    const kvJob = await readVeoKvJob(env, veoJobId);
    const mergedInput = { ...input, ...(kvJob || {}) };
    const operationName = mergedInput.operation_name;
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
      if (veoJobId) await writeVeoKvJob(env, veoJobId, { status: 'running' });
      continue;
    }

    try {
      const out = await finalizeVeoRow(env, row, op, mergedInput);
      if (out.failed) failed += 1;
      else if (out.completed) completed += 1;
    } catch (e) {
      failed += 1;
      console.warn('[veo-poll] finalize', e?.message ?? e);
    }
  }

  return { polled: (results || []).length, completed, failed };
}
