/**
 * MovieMode + Veo agent tool handlers (metadata / queue only — heavy render on PTY or Vertex async).
 */
import { buildMoviemodeR2Prefix } from '../../api/moviemode-api.js';
import { getR2Binding } from '../../api/r2-api.js';

const MOVIE_JOB_KV_PREFIX = 'moviemode_job_';
const VEO_JOB_KV_PREFIX = 'veo_job_';

function jobKvKey(jobId) {
  return `${MOVIE_JOB_KV_PREFIX}${jobId}`;
}

async function readMoviemodeKvJob(env, jobId) {
  if (!env?.KV) return null;
  const raw = await env.KV.get(jobKvKey(jobId));
  return raw ? JSON.parse(raw) : null;
}

function betaSample(a, b) {
  const x = Math.pow(Math.random(), 1 / Math.max(a, 1));
  const y = Math.pow(Math.random(), 1 / Math.max(b, 1));
  return x / (x + y);
}

function secretKeyNameForCatalogRow(env, row) {
  const fromAi = row.secret_key_name != null ? String(row.secret_key_name).trim() : '';
  if (fromAi) return fromAi;
  const plat = String(row.resolved_platform || row.api_platform || '').toLowerCase();
  if (plat.startsWith('openai')) return 'OPENAI_API_KEY';
  if (plat.startsWith('google') || plat.startsWith('gemini')) return 'GOOGLE_API_KEY';
  if (plat.startsWith('anthropic')) return 'ANTHROPIC_API_KEY';
  return '';
}

/**
 * Thompson sample over video_generation arms (catalog + agentsam_ai; no ai_models).
 * @param {unknown} env
 * @param {string} workspaceId
 */
async function pickVeoModelFromDb(env, workspaceId) {
  const ws = String(workspaceId || '').trim();
  if (!env?.DB || !ws) return null;

  const rows = await env.DB.prepare(
    `SELECT
       ra.id              AS arm_id,
       ra.model_key,
       ra.success_alpha,
       ra.success_beta,
       ra.max_cost_per_call_usd,
       mc.api_platform,
       mc.google_model_id,
       mc.openai_model_id,
       COALESCE(ai.api_platform, mc.api_platform)    AS resolved_platform,
       COALESCE(ai.secret_key_name, '')              AS secret_key_name
     FROM agentsam_routing_arms ra
     INNER JOIN agentsam_model_catalog mc
       ON  mc.model_key = ra.model_key
       AND mc.is_active = 1
     LEFT JOIN agentsam_ai ai
       ON  ai.model_key = mc.model_key
       AND ai.status    = 'active'
       AND (ai.mode = 'model' OR ai.model_key IS NOT NULL)
     WHERE ra.task_type    = 'video_generation'
       AND ra.workspace_id = ?
       AND ra.is_paused    = 0
       AND ra.is_active    = 1
       AND (mc.deprecated_after IS NULL OR mc.deprecated_after > date('now'))`,
  )
    .bind(ws)
    .all()
    .catch(() => ({ results: [] }));

  if (!rows.results?.length) return null;

  let best = null;
  let bestScore = -1;
  for (const row of rows.results) {
    const keyName = secretKeyNameForCatalogRow(env, row);
    if (keyName && !env[keyName]) continue;
    const plat = String(row.resolved_platform || '').toLowerCase();
    if (plat === 'workers_ai' && !env.AI) continue;

    const score = betaSample(row.success_alpha ?? 1, row.success_beta ?? 1);
    if (score > bestScore) {
      bestScore = score;
      best = { ...row, keyName: keyName || null };
    }
  }
  return best;
}

/**
 * @param {unknown} env
 * @param {{ tenantId: string, workspaceId: string, projectId: string }} scope
 */
async function ensureMoviemodeProject(env, scope) {
  const { tenantId, workspaceId, projectId } = scope;
  const existing = await env.DB.prepare(
    `SELECT id FROM moviemode_projects WHERE id = ? AND workspace_id = ? LIMIT 1`,
  )
    .bind(projectId, workspaceId)
    .first()
    .catch(() => null);
  if (existing?.id) return String(existing.id);

  const slug = `agent-${projectId.slice(0, 20).replace(/[^a-z0-9-]/gi, '-')}`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO moviemode_projects
       (id, tenant_id, workspace_id, slug, title, r2_prefix, status)
     VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
  )
    .bind(
      projectId,
      tenantId,
      workspaceId,
      slug,
      'Agent MovieMode',
      buildMoviemodeR2Prefix(workspaceId, slug),
    )
    .run()
    .catch((e) => console.warn('[moviemode] ensure project', e?.message ?? e));
  return projectId;
}

function resolveScope(params) {
  const session = params.session && typeof params.session === 'object' ? params.session : {};
  return {
    tenantId: String(params.tenant_id || session.tenant_id || '').trim(),
    workspaceId: String(params.workspace_id || session.workspace_id || session.workspaceId || '').trim(),
    userId: String(params.user_id || session.user_id || '').trim(),
  };
}

/**
 * handler.moviemode.render — queue Remotion render job (D1 + optional PTY export path).
 */
export async function handleMoviemodeRender(env, params) {
  const {
    composition_id,
    format = 'mp4',
    codec = 'h264',
    quality = '720p',
    fps = 30,
    start_frame,
    end_frame,
    timeline_id,
  } = params || {};

  const projectId = String(composition_id || params.project_id || '').trim();
  if (!projectId) return { ok: false, error: 'composition_id required' };

  const { tenantId, workspaceId } = resolveScope(params);
  if (!tenantId || !workspaceId) {
    return { ok: false, error: 'workspace_id and tenant_id required' };
  }

  if (!env.DB) return { ok: false, error: 'DB not configured' };

  await ensureMoviemodeProject(env, { tenantId, workspaceId, projectId });

  const jobId = `mmrender_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const input = {
    format,
    codec,
    quality,
    fps,
    start_frame: start_frame ?? null,
    end_frame: end_frame ?? null,
    source: 'tool_moviemode_render',
  };

  await env.DB.prepare(
    `INSERT INTO moviemode_render_jobs
       (id, tenant_id, workspace_id, project_id, timeline_id, renderer, status, input_json)
     VALUES (?, ?, ?, ?, ?, 'remotion', 'queued', ?)`,
  )
    .bind(
      jobId,
      tenantId,
      workspaceId,
      projectId,
      timeline_id || null,
      JSON.stringify(input),
    )
    .run();

  return {
    ok: true,
    job_id: jobId,
    status: 'queued',
    composition_id: projectId,
    project_id: projectId,
  };
}

function r2ObjectUrl(env, bucket, key) {
  const origin = (env.IAM_ORIGIN || 'https://inneranimalmedia.com').replace(/\/$/, '');
  return `${origin}/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`;
}

/**
 * handler.moviemode.export — resolve completed render to R2 URL.
 */
export async function handleMoviemodeExport(env, params) {
  const {
    job_id,
    output_filename,
    r2_prefix = 'moviemode/exports/',
    public: isPublic = false,
  } = params || {};

  const jobId = String(job_id || '').trim();
  if (!jobId) return { ok: false, error: 'job_id required' };

  const { workspaceId } = resolveScope(params);
  const kvJob = await readMoviemodeKvJob(env, jobId);
  let status = kvJob?.status || null;
  let r2Key = kvJob?.r2Key || null;
  let format = 'mp4';
  let quality = '720p';
  let durationSeconds = null;

  if (env.DB) {
    const d1Id = jobId.startsWith('mmrender_') ? jobId : `mmrender_${jobId}`;
    const row = await env.DB.prepare(
      `SELECT id, status, output_json, input_json, duration_ms
       FROM moviemode_render_jobs
       WHERE (id = ? OR id = ?) AND (? = '' OR workspace_id = ?)
       LIMIT 1`,
    )
      .bind(jobId, d1Id, workspaceId, workspaceId)
      .first()
      .catch(() => null);
    if (row) {
      status = row.status || status;
      const out = (() => {
        try {
          return JSON.parse(row.output_json || '{}');
        } catch {
          return {};
        }
      })();
      const inp = (() => {
        try {
          return JSON.parse(row.input_json || '{}');
        } catch {
          return {};
        }
      })();
      r2Key = r2Key || out.r2_key || out.r2Key || null;
      format = inp.format || format;
      quality = inp.quality || quality;
      if (row.duration_ms != null) durationSeconds = Number(row.duration_ms) / 1000;
    }
  }

  const normalizedStatus = String(status || '').toLowerCase();
  if (!['done', 'complete', 'completed'].includes(normalizedStatus)) {
    return {
      ok: false,
      error: 'render not complete',
      status: status || 'unknown',
    };
  }

  const filename =
    output_filename ||
    kvJob?.outputFilename ||
    (r2Key ? r2Key.split('/').pop() : null) ||
    `${jobId}.mp4`;
  const key = r2Key || `${String(r2_prefix).replace(/\/?$/, '/')}${filename}`;

  const binding = getR2Binding(env, 'inneranimalmedia');
  if (binding?.head) {
    const head = await binding.head(key).catch(() => null);
    if (!head) return { ok: false, error: 'export object not found in R2', r2_key: key };
  }

  const url = isPublic ? r2ObjectUrl(env, 'inneranimalmedia', key) : r2ObjectUrl(env, 'inneranimalmedia', key);
  const fileSizeBytes = kvJob?.size_bytes ?? null;

  return {
    ok: true,
    r2_key: key,
    url,
    file_size_bytes: fileSizeBytes,
    duration_seconds: durationSeconds,
    format,
    quality,
  };
}

/**
 * handler.veo.generate — queue Vertex Veo long-running video generation.
 */
export async function handleVeoGenerate(env, params) {
  const {
    prompt,
    reference_image_r2_key,
    duration_seconds = 5,
    quality = 'fast',
    resolution = '720p',
    aspect_ratio = '16:9',
    negative_prompt,
  } = params || {};

  const text = String(prompt || '').trim();
  if (!text) return { ok: false, error: 'prompt required' };

  const { tenantId, workspaceId } = resolveScope(params);
  if (!workspaceId) return { ok: false, error: 'workspace_id required' };

  const model = await pickVeoModelFromDb(env, workspaceId);
  if (!model) return { ok: false, error: 'no active Veo model in catalog' };

  const keyName = model.keyName || secretKeyNameForCatalogRow(env, model);
  const apiKey = keyName ? env[keyName] : env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: 'Google API key not configured' };

  const project = env.GOOGLE_CLOUD_PROJECT || env.GCP_PROJECT_ID || 'inneranimalmedia';
  const catalogModelKey = String(model.model_key);
  const vertexModelId =
    model.google_model_id != null && String(model.google_model_id).trim() !== ''
      ? String(model.google_model_id).trim()
      : catalogModelKey;
  const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/us-central1/publishers/google/models/${encodeURIComponent(vertexModelId)}:predictLongRunning`;

  const instance = { prompt: text };
  if (negative_prompt) instance.negative_prompt = String(negative_prompt);
  if (reference_image_r2_key) instance.reference_image_r2_key = String(reference_image_r2_key);

  const body = {
    instances: [instance],
    parameters: {
      sampleCount: 1,
      durationSeconds: Math.max(1, Math.min(60, Number(duration_seconds) || 5)),
      aspectRatio: aspect_ratio,
      resolution: quality === 'ultra' ? '4k' : resolution,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      error: `Veo API ${res.status}: ${errText.slice(0, 400)}`,
      model_used: catalogModelKey,
    };
  }

  const data = await res.json().catch(() => ({}));
  const operationName = data?.name ? String(data.name) : null;
  if (!operationName) {
    return { ok: false, error: 'Veo returned no operation name', model_used: catalogModelKey };
  }

  const jobId = `veojob_${crypto.randomUUID().slice(0, 12)}`;
  const costPer = Number(model.max_cost_per_call_usd) || 0;
  const estimatedCostUsd = costPer > 0 ? costPer : (Number(duration_seconds) || 5) * 0.05;

  const jobRow = {
    job_id: jobId,
    operation_name: operationName,
    model_key: catalogModelKey,
    workspace_id: workspaceId,
    tenant_id: tenantId,
    prompt: text.slice(0, 2000),
    quality,
    resolution,
    duration_seconds: Number(duration_seconds) || 5,
    status: 'queued',
    created_at: Date.now(),
  };

  if (env.KV) {
    await env.KV.put(`${VEO_JOB_KV_PREFIX}${jobId}`, JSON.stringify(jobRow), { expirationTtl: 86400 });
  }

  if (env.DB && tenantId) {
    const projectId = `mmproj_veo_${workspaceId.slice(0, 12)}`;
    await ensureMoviemodeProject(env, { tenantId, workspaceId, projectId });
    const renderId = `mmrender_${jobId.replace(/^veojob_/, '')}`;
    await env.DB.prepare(
      `INSERT INTO moviemode_render_jobs
         (id, tenant_id, workspace_id, project_id, renderer, status, input_json)
       VALUES (?, ?, ?, ?, 'remotion', 'queued', ?)`,
    )
      .bind(
        renderId,
        tenantId,
        workspaceId,
        projectId,
        JSON.stringify({ kind: 'veo', veo_job_id: jobId, ...jobRow }),
      )
      .run()
      .catch((e) => console.warn('[veo] render_jobs mirror', e?.message ?? e));
  }

  return {
    ok: true,
    job_id: jobId,
    model_used: catalogModelKey,
    status: 'queued',
    operation_name: operationName,
    estimated_cost_usd: estimatedCostUsd,
  };
}

/**
 * handler.agentsam_video_embed — Gemini multimodal index for media_assets (AGENTSAM_VECTORIZE_MEDIA).
 */
export async function handleAgentsamVideoEmbed(env, params) {
  const workspaceId = String(params?.workspace_id || params?.workspaceId || '').trim();
  const assetId = String(params?.asset_id || params?.id || '').trim();
  if (!env?.DB) return { ok: false, error: 'DB not configured' };
  if (!workspaceId || !assetId) return { ok: false, error: 'workspace_id and asset_id required' };

  const row = await env.DB.prepare(
    `SELECT * FROM media_assets WHERE id = ? AND workspace_id = ? LIMIT 1`,
  )
    .bind(assetId, workspaceId)
    .first();
  if (!row) return { ok: false, error: 'asset not found' };

  const { transcriptFromAssetRow } = await import('../../core/moviemode-whisper.js');
  const transcript =
    params?.transcript != null
      ? String(params.transcript || '').trim() || null
      : transcriptFromAssetRow(row);

  try {
    const { indexMediaAssetForSearch } = await import('../../core/moviemode-media-vectorize.js');
    const index = await indexMediaAssetForSearch(env, row, {
      caption: params?.caption || params?.description || null,
      transcript,
      force: params?.force !== false,
    });
    return {
      ok: true,
      asset_id: assetId,
      lane: 'moviemode_media',
      embed_model: 'gemini-embedding-2',
      index,
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 400) };
  }
}

export const handlers = {
  moviemode_render: handleMoviemodeRender,
  moviemode_export: handleMoviemodeExport,
  veo_generate_video: handleVeoGenerate,
  agentsam_video_embed: handleAgentsamVideoEmbed,
};
