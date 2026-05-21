/**
 * Unified image generation — OpenAI, Google Imagen, Workers AI.
 * Used by /api/images/generate|edit and agent chat SSE tool paths.
 */

import { generateImageOpenAI } from '../integrations/openai.js';
import { resolveModelApiKey } from '../integrations/tokens.js';
import { getR2Binding } from '../api/r2-api.js';
import { resolvePrimaryUploadPrefix } from '../core/media-r2-access.js';

const BUCKET = 'inneranimalmedia';
const PROGRESS_INTERVAL_MS = 5000;

export const IMAGE_GEN_TOOL_NAMES = new Set(['imgx_generate_image', 'imgx_edit_image']);

/** @type {ReadonlyArray<{ stage: string; message: string; progress: number }>} */
export const IMAGE_PROGRESS_TICKS = [
  { stage: 'initializing', message: 'Understanding the visual direction...', progress: 8 },
  { stage: 'composition', message: 'Sketching the composition...', progress: 22 },
  { stage: 'lighting', message: 'Blocking out lighting...', progress: 38 },
  { stage: 'refinement', message: 'Refining cinematic details...', progress: 52 },
  { stage: 'atmosphere', message: 'Enhancing depth and atmosphere...', progress: 68 },
  { stage: 'polishing', message: 'Polishing textures...', progress: 82 },
  { stage: 'finalizing', message: 'Finalizing the render...', progress: 94 },
];

const IMAGE_NOUN_RE =
  /\b(images?|heroes?|hero\s+images?|posters?|wallpapers?|illustrations?|artworks?|graphics?|thumbnails?|banners?|logos?|logo\s+concepts?|renders?|concept\s+arts?|covers?|visuals?|backgrounds?|icons?|avatars?|pictures?|art|mockups?|mock[- ]?ups?|favicons?|og\s+images?|social\s+cards?|app\s+icons?|splash\s+screens?|ui\s+assets?)\b/i;
const IMAGE_CREATE_VERB_RE =
  /\b(generate|create|make|design|render|draw|paint|produce|craft|build|illustrate|visualize)\b/i;

/** User is doing substantial non-image work in the same message — use tool path, not image-only fast path. */
const COMBINED_WORK_RE =
  /\b(fix|debug|refactor|implement|deploy|migrate|sql|d1_query|terminal|wrangler|github|pull request|test suite|unit test|eslint|typescript error|bug in)\b/i;

/**
 * User explicitly wants planning/strategy — not an immediate single-image render.
 * @param {string} message
 */
export function isExplicitImagePlanningIntent(message) {
  const m = String(message || '').trim();
  if (!m) return false;
  if (/\b(make|create|write|build|draft)\s+(a\s+)?plan\b|\bplan\s+(for|to)\b/i.test(m)) return true;
  if (/\b(plan|roadmap|strategy|breakdown)\b.*\b(campaign|branding|workflow|multi[- ]?step)\b/i.test(m)) {
    return true;
  }
  if (/\bmulti[- ]?step\b.*\b(image|generation|workflow|creative|visual)\b/i.test(m)) return true;
  if (/\b(image\s+generation\s+)?workflow\b/i.test(m) && /\b(plan|design|create|build|draft)\b/i.test(m)) {
    return true;
  }
  if (/\b(create|write|draft|make)\s+(prompts?|a\s+set\s+of\s+prompts?)\s+for\b/i.test(m)) return true;
  if (/\bprompts?\s+for\s+(a\s+)?(future\s+)?(campaign|project|workflow|brand)\b/i.test(m)) return true;
  return false;
}

/**
 * Broader image signal — primary render now OR secondary "also generate a logo" while coding.
 * @param {string} message
 */
export function hasImageGenerationIntent(message) {
  const m = String(message || '').trim();
  if (!m || isExplicitImagePlanningIntent(m)) return false;

  if (matchesCoreImageGenerationPatterns(m)) return true;

  if (
    /\b(also|and then|plus|as well|while you'?re at it|when done)\b[\s\S]{0,48}\b(generate|create|make|design|render|draw)\b[\s\S]{0,32}\b(image|logo|icon|banner|thumbnail|mockup|hero|illustration|artwork|graphic)\b/i.test(
      m,
    )
  ) {
    return true;
  }
  if (
    /\b(need|want|could you|can you)\b[\s\S]{0,24}\b(a |an )?(hero|banner|logo|icon|thumbnail|og image|app icon|mockup|illustration|cover image|feature graphic)\b/i.test(
      m,
    )
  ) {
    return true;
  }
  if (/\b(imgx_|dall[- ]?e|imagen|gpt-image|image gen)/i.test(m)) return true;
  if (/\b(visual asset|marketing asset|brand asset|social preview)\b/i.test(m)) return true;
  return false;
}

/**
 * @param {string} m
 */
function matchesCoreImageGenerationPatterns(m) {
  if (/^(what|how|why|when|where|explain|describe|define)\b/i.test(m) && !IMAGE_CREATE_VERB_RE.test(m)) {
    return false;
  }
  if (/\b(edit|modify|change|upscale|remove\s+background|inpaint|outpaint)\b/i.test(m) && IMAGE_NOUN_RE.test(m)) {
    return true;
  }
  if (/\b(hero\s+image|dashboard\s+hero|landing\s+page\s+hero|hero\s+banner|hero\s+section)\b/i.test(m)) {
    return true;
  }
  if (/\bmake\s+me\s+(a\s+)?/i.test(m) && IMAGE_NOUN_RE.test(m)) return true;
  if (/\b(an?\s+)?(image|illustration|artwork|render|graphic|poster|wallpaper|banner|thumbnail)\s+(of|for|showing)\b/i.test(m)) {
    return true;
  }
  if (IMAGE_CREATE_VERB_RE.test(m) && IMAGE_NOUN_RE.test(m)) return true;
  if (/\b(sci[- ]?fi|cyberpunk|futuristic|cinematic|neon)\b/i.test(m) && IMAGE_NOUN_RE.test(m)) {
    return true;
  }
  if (/\b(poster|wallpaper|banner|thumbnail|illustration|concept\s+art|app icon|favicon)\b/i.test(m) && m.split(/\s+/).length >= 3) {
    return true;
  }
  return false;
}

/**
 * True when image work is the main ask (mode-agnostic fast path — any Agent Sam mode).
 * @param {string} message
 */
export function isPrimaryImageGenerationIntent(message) {
  const m = String(message || '').trim();
  if (!hasImageGenerationIntent(m)) return false;
  if (COMBINED_WORK_RE.test(m) && m.split(/\s+/).filter(Boolean).length > 14) return false;
  return matchesCoreImageGenerationPatterns(m);
}

/**
 * Natural-language request to render a single image now (bypass long-work plan pipeline).
 * Alias for {@link isPrimaryImageGenerationIntent}.
 * @param {string} message
 */
export function isDirectImageGenerationIntent(message) {
  return isPrimaryImageGenerationIntent(message);
}

/**
 * Video generation / Veo / MovieMode render intent (capability tool injection).
 * @param {string} message
 */
export function hasVideoGenerationIntent(message) {
  const m = String(message || '').trim();
  if (!m) return false;
  return (
    /\b(generate|create|make|produce|render)\b.{0,40}\b(video|clip|footage|movie|animation)\b/i.test(m) ||
    /\b(veo|sora|text.to.video|video.gen|moviemode)\b/i.test(m)
  );
}

/**
 * @param {string} message
 * @param {boolean} [hasReferenceImage]
 */
export function resolveImageLane(message, hasReferenceImage = false) {
  if (
    hasReferenceImage ||
    /\b(edit|modify|change|update|adjust|alter)\b.*\b(image|photo|pic)\b/i.test(message)
  ) {
    return 'edit_reference';
  }
  if (/\b(draft|rough|quick|sketch|thumbnail|preview|cheap|fast)\b/i.test(message)) {
    return 'fast_draft';
  }
  if (
    /\b(logo|brand|identity|mockup|hero|banner|campaign|professional|client)\b/i.test(message)
  ) {
    return 'brand_mockup';
  }
  if (/\b(final|high.?res|ultra|best|quality|print|production)\b/i.test(message)) {
    return 'high_quality';
  }
  return 'brand_mockup';
}

/**
 * @param {unknown} env
 * @param {string} lane
 * @param {string} workspaceId
 */
export async function pickImageModelFromDb(env, lane, workspaceId) {
  const ws = String(workspaceId || '').trim();
  if (!env?.DB || !ws) return null;
  const rows = await env.DB.prepare(
    `SELECT id, model_key, provider, api_platform, secret_key_name, cost_per_unit
     FROM ai_models
     WHERE is_active = 1
       AND billing_unit = 'per_image'
       AND json_extract(features_json, '$.image_lanes') LIKE ?
     ORDER BY sort_order DESC`,
  )
    .bind(`%${lane}%`)
    .all()
    .catch(() => ({ results: [] }));

  if (!rows.results?.length) return null;

  const period = new Date().toISOString().slice(0, 10);
  const keys = rows.results.map((r) => r.model_key);
  const placeholders = keys.map(() => '?').join(',');
  const scores = await env.DB.prepare(
    `SELECT model_key, alpha, beta
     FROM model_performance_scores
     WHERE model_key IN (${placeholders})
       AND workspace_id = ?
       AND period_start = ?`,
  )
    .bind(...keys, ws, period)
    .all()
    .catch(() => ({ results: [] }));

  const scoreMap = Object.fromEntries((scores.results || []).map((s) => [s.model_key, s]));

  function betaSample(a, b) {
    const x = Math.pow(Math.random(), 1 / Math.max(a, 1));
    const y = Math.pow(Math.random(), 1 / Math.max(b, 1));
    return x / (x + y);
  }

  let best = null;
  let bestScore = -1;
  for (const row of rows.results) {
    if (row.secret_key_name && !env[row.secret_key_name]) continue;
    if (row.api_platform === 'workers_ai' && !env.AI) continue;
    const s = scoreMap[row.model_key];
    const score = betaSample(s?.alpha ?? 1, s?.beta ?? 1);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

/**
 * @param {unknown} env
 * @param {string} modelKey
 * @param {string} workspaceId
 * @param {boolean} success
 * @param {number} latencyMs
 */
export async function recordImageModelOutcome(env, modelKey, workspaceId, success, latencyMs) {
  const ws = String(workspaceId || '').trim();
  const mk = String(modelKey || '').trim();
  if (!env?.DB || !ws || !mk) return;
  const period = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO model_performance_scores
       (model_key, workspace_id, period_start, alpha, beta,
        avg_latency_ms, success_count, failure_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (model_key, workspace_id, period_start) DO UPDATE SET
       alpha         = alpha + ?,
       beta          = beta  + ?,
       success_count = success_count + ?,
       failure_count = failure_count + ?,
       avg_latency_ms = CAST(
         (avg_latency_ms * (success_count + failure_count) + ?)
         / (success_count + failure_count + 1) AS INTEGER
       )`,
  )
    .bind(
      mk,
      ws,
      period,
      success ? 2 : 1,
      success ? 1 : 2,
      latencyMs,
      success ? 1 : 0,
      success ? 0 : 1,
      success ? 1 : 0,
      success ? 0 : 1,
      success ? 1 : 0,
      success ? 0 : 1,
      latencyMs,
    )
    .run()
    .catch((e) => console.warn('[image_generation] recordImageModelOutcome', e?.message ?? e));
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Agent chat fast path: imgx_generate_image + image_generation_* SSE only (no plan pipeline).
 * @param {unknown} env
 * @param {unknown} ctx
 * @param {{
 *   request?: Request;
 *   message: string;
 *   userId?: string | null;
 *   tenantId?: string | null;
 *   workspaceId?: string | null;
 *   sessionId?: string | null;
 *   authUser?: { id?: string } | null;
 * }} opts
 */
export function handleDirectImageGenerationChatStream(env, ctx, opts) {
  const message = String(opts.message || '').trim();
  const userId = opts.userId ?? opts.authUser?.id ?? null;
  const tenantId = opts.tenantId ?? null;
  const workspaceId = opts.workspaceId ?? null;
  const sessionId = opts.sessionId ?? null;
  const request = opts.request;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const emit = (type, payload) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
    } catch (_) {
      /* stream closed */
    }
  };

  let origin = '';
  try {
    origin = (env.IAM_ORIGIN || '').replace(/\/$/, '') || '';
    if (!origin && request?.url) origin = new URL(request.url).origin;
  } catch (_) {
    origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
  }

  (async () => {
    try {
      emit('context', {
        intent: 'image_generation',
        mode: 'image_generation',
        runtime_mode: 'image_generation',
        tool: 'imgx_generate_image',
        session_id: sessionId,
      });

      const referenceImageB64 = opts.referenceImageB64 ?? opts.referenceImage ?? null;
      const lane = resolveImageLane(message, !!referenceImageB64);
      const ws = workspaceId != null ? String(workspaceId).trim() : '';
      const imageModel = ws ? await pickImageModelFromDb(env, lane, ws) : null;
      const sseCtx = {
        authUser: opts.authUser || { id: userId },
        workspaceId,
        tenantId,
        userId,
        origin,
      };
      const sseParams = imageModel
        ? {
            prompt: message,
            model: imageModel.model_key,
            provider: imageModel.api_platform || imageModel.provider,
          }
        : { prompt: message };

      const t0 = Date.now();
      try {
        if (imageModel) {
          emit('image_generation_started', {
            provider: imageModel.provider,
            model: imageModel.model_key,
          });
        }
        const result = await streamImageGenerationSse(
          emit,
          env,
          'imgx_generate_image',
          sseParams,
          sseCtx,
        );
        if (imageModel && ws) {
          await recordImageModelOutcome(env, imageModel.model_key, ws, true, Date.now() - t0);
        }
        console.log('[agent] image_generation_fast_path_done', {
          generation_id: result?.artifact_id,
          provider: result?.provider,
          model: result?.model,
        });
      } catch (err) {
        if (imageModel && ws) {
          await recordImageModelOutcome(env, imageModel.model_key, ws, false, Date.now() - t0);
          emit('image_generation_complete', {
            type: 'image_generation_complete',
            failed: true,
            provider: imageModel.provider,
            model: imageModel.model_key,
            error: err?.message != null ? String(err.message) : String(err),
          });
        }
        throw err;
      }
    } catch (e) {
      const msg = e?.message != null ? String(e.message) : String(e);
      console.warn('[agent] image_generation_fast_path_error', msg.slice(0, 400));
      emit('error', { error: msg, code: 'image_generation_failed' });
    } finally {
      emit('done', {});
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: SSE_HEADERS });
}

/**
 * @param {string} name
 */
export function isImageGenerationTool(name) {
  return IMAGE_GEN_TOOL_NAMES.has(String(name || '').trim());
}

/**
 * @param {string | undefined} size
 * @returns {{ width: number; height: number; openAiSize: string }}
 */
export function parseImageDimensions(size) {
  const raw = String(size || '1024x1024').trim().toLowerCase();
  const m = raw.match(/^(\d{3,4})x(\d{3,4})$/);
  if (m) {
    const w = parseInt(m[1], 10);
    const h = parseInt(m[2], 10);
    return { width: w, height: h, openAiSize: `${w}x${h}` };
  }
  if (raw === 'landscape' || raw === '1792x1024') {
    return { width: 1792, height: 1024, openAiSize: '1792x1024' };
  }
  if (raw === 'portrait' || raw === '1024x1792') {
    return { width: 1024, height: 1792, openAiSize: '1024x1792' };
  }
  return { width: 1024, height: 1024, openAiSize: '1024x1024' };
}

/**
 * @param {unknown} env
 * @param {Uint8Array | ArrayBuffer} bytes
 * @param {string} contentType
 * @param {{ authUser?: { id?: string }; workspaceId?: string | null; origin?: string }} ctx
 */
export async function uploadImageBytesToR2(env, bytes, contentType, ctx = {}) {
  const binding = getR2Binding(env, BUCKET);
  if (!binding?.put) throw new Error('R2 bucket inneranimalmedia not configured');

  const authUser = ctx.authUser || { id: 'system' };
  const uploadPack = await resolvePrimaryUploadPrefix(env, authUser, ctx.workspaceId || null);
  if (uploadPack.error) throw new Error(uploadPack.error);

  const ext =
    contentType === 'image/jpeg'
      ? 'jpg'
      : contentType === 'image/webp'
        ? 'webp'
        : contentType === 'image/gif'
          ? 'gif'
          : 'png';
  const key = `${uploadPack.prefix}gen-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  await binding.put(key, buf, { httpMetadata: { contentType: contentType || 'image/png' } });

  const origin = (ctx.origin || env.IAM_ORIGIN || 'https://inneranimalmedia.com').replace(/\/$/, '');
  const imageUrl = `${origin}/api/r2/buckets/${encodeURIComponent(BUCKET)}/object/${encodeURIComponent(key)}`;
  return { r2_key: key, image_url: imageUrl, artifact_id: `img_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}` };
}

/**
 * @param {unknown} env
 * @param {string} url
 */
async function fetchImageBytes(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'InnerAnimalMedia-ImageGen/1.0' },
  });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const ct = (res.headers.get('Content-Type') || 'image/png').split(';')[0].trim();
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), contentType: ct };
}

/**
 * @param {unknown} env
 * @param {{ model?: string; prompt: string; size?: string; quality?: string; userId?: string | null }} opts
 */
async function generateOpenAI(env, opts) {
  const modelKey = String(opts.model || '').trim();
  if (!modelKey) throw new Error('OpenAI image model required');
  const dims = parseImageDimensions(opts.size);
  const row = await generateImageOpenAI(env, {
    modelKey,
    prompt: opts.prompt,
    size: dims.openAiSize,
    quality: opts.quality || 'standard',
    n: 1,
    userId: opts.userId,
  });
  if (!row) throw new Error('OpenAI image generation returned no data');
  const url = typeof row.url === 'string' ? row.url : null;
  const b64 = typeof row.b64_json === 'string' ? row.b64_json : null;
  if (url) {
    const fetched = await fetchImageBytes(url);
    return {
      provider: 'openai',
      model: modelKey,
      bytes: fetched.bytes,
      contentType: fetched.contentType,
      preview_urls: [url],
      metadata: { revised_prompt: row.revised_prompt },
    };
  }
  if (b64) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return {
      provider: 'openai',
      model: modelKey,
      bytes,
      contentType: 'image/png',
      preview_urls: [],
      metadata: { revised_prompt: row.revised_prompt },
    };
  }
  throw new Error('OpenAI image generation returned no image bytes');
}

/**
 * @param {unknown} env
 * @param {{ model?: string; prompt: string; size?: string; userId?: string | null }} opts
 */
async function generateGoogle(env, opts) {
  const modelKey = String(opts.model || '').trim();
  if (!modelKey) throw new Error('Google image model required');
  const dims = parseImageDimensions(opts.size);
  const apiKey = await resolveModelApiKey(env, 'google', modelKey, opts.userId);
  if (!apiKey) throw new Error('Google AI API key not configured');

  const aspect = dims.width > dims.height ? '16:9' : dims.height > dims.width ? '9:16' : '1:1';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelKey)}:predict`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        instances: [{ prompt: opts.prompt }],
        parameters: { sampleCount: 1, aspectRatio: aspect },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Imagen error ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const pred = data?.predictions?.[0] || data?.generatedImages?.[0];
  const b64 =
    pred?.bytesBase64Encoded ||
    pred?.image?.bytesBase64Encoded ||
    pred?.b64_json ||
    data?.bytesBase64Encoded;
  if (!b64 || typeof b64 !== 'string') throw new Error('Imagen returned no image bytes');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return {
    provider: 'google',
    model: modelKey,
    bytes,
    contentType: 'image/png',
    preview_urls: [],
    metadata: {},
  };
}

/**
 * @param {unknown} env
 * @param {{ prompt: string; model?: string; tenantId?: string | null }} opts
 */
async function generateWorkersAi(env, opts) {
  if (!env?.AI) throw new Error('Workers AI not configured');
  let model = opts.model ? String(opts.model).trim() : '';
  if (!model && env.DB && opts.tenantId) {
    const row = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
         AND LOWER(COALESCE(api_platform, '')) = 'workers_ai'
         AND (
           LOWER(COALESCE(name, '')) LIKE '%image%'
           OR LOWER(model_key) LIKE '%flux%'
         )
       ORDER BY COALESCE(sort_order, 999), COALESCE(input_rate_per_mtok, 999999) ASC
       LIMIT 1`,
    )
      .bind(opts.tenantId)
      .first()
      .catch(() => null);
    model = row?.model_key || '';
  }
  if (!model) model = '@cf/black-forest-labs/flux-1-schnell';
  const result = await env.AI.run(model, { prompt: opts.prompt });
  const bytes = result instanceof ArrayBuffer ? new Uint8Array(result) : new Uint8Array(result);
  return {
    provider: 'workers_ai',
    model,
    bytes,
    contentType: 'image/png',
    preview_urls: [],
    metadata: {},
  };
}

/**
 * @param {unknown} env
 * @param {{
 *   provider?: string;
 *   model?: string;
 *   prompt: string;
 *   size?: string;
 *   quality?: string;
 *   userId?: string | null;
 *   tenantId?: string | null;
 * }} params
 */
export async function generateImage(env, params) {
  const prompt = String(params.prompt || '').trim();
  if (!prompt) throw new Error('prompt required');

  const provider = String(params.provider || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const model = params.model ? String(params.model).trim() : '';

  if (provider === 'openai' || provider === 'openai_compatible') {
    return await generateOpenAI(env, {
      model,
      prompt,
      size: params.size,
      quality: params.quality,
      userId: params.userId,
    });
  }
  if (provider === 'google' || provider === 'gemini') {
    return await generateGoogle(env, {
      model,
      prompt,
      size: params.size,
      userId: params.userId,
    });
  }
  if (provider === 'workers_ai' || provider === 'workersai') {
    return await generateWorkersAi(env, {
      model,
      prompt,
      tenantId: params.tenantId,
    });
  }

  return await generateWorkersAi(env, {
    model,
    prompt,
    tenantId: params.tenantId,
  });
}

/**
 * OpenAI-only image edit.
 * @param {unknown} env
 * @param {{ prompt: string; image_url?: string; image?: string; model?: string; size?: string; userId?: string | null }} params
 */
export async function editImage(env, params) {
  const prompt = String(params.prompt || '').trim();
  if (!prompt) throw new Error('prompt required');
  const src = String(params.image_url || params.image || '').trim();
  if (!src) throw new Error('image_url required');

  const modelKey = String(params.model || '').trim();
  if (!modelKey) throw new Error('OpenAI edit model required');
  const apiKey = await resolveModelApiKey(env, 'openai', modelKey, params.userId);
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const { bytes, contentType } = await fetchImageBytes(src);
  const dims = parseImageDimensions(params.size);

  const form = new FormData();
  form.append('model', modelKey);
  form.append('prompt', prompt);
  form.append('size', dims.openAiSize);
  form.append('image', new Blob([bytes], { type: contentType }), 'source.png');

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`OpenAI edit error ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const row = data?.data?.[0];
  const url = typeof row?.url === 'string' ? row.url : null;
  const b64 = typeof row?.b64_json === 'string' ? row.b64_json : null;
  if (url) {
    const fetched = await fetchImageBytes(url);
    return {
      provider: 'openai',
      model: modelKey,
      bytes: fetched.bytes,
      contentType: fetched.contentType,
      preview_urls: [url],
      metadata: {},
    };
  }
  if (b64) {
    return {
      provider: 'openai',
      model: modelKey,
      bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      contentType: 'image/png',
      preview_urls: [],
      metadata: {},
    };
  }
  throw new Error('OpenAI edit returned no image');
}

/**
 * REST + tool result shape.
 * @param {unknown} env
 * @param {string} toolName
 * @param {Record<string, unknown>} params
 * @param {{ authUser?: { id?: string }; workspaceId?: string | null; tenantId?: string | null; userId?: string | null; origin?: string }} ctx
 */
export async function runImageGenerationForTool(env, toolName, params, ctx = {}) {
  const prompt = String(params.prompt || params.description || '').trim();
  const isEdit = toolName === 'imgx_edit_image';

  const gen = isEdit
    ? await editImage(env, {
        prompt,
        image_url: params.image_url || params.image,
        model: params.model,
        size: params.size,
        userId: ctx.userId,
      })
    : await generateImage(env, {
        provider: params.provider,
        model: params.model,
        prompt,
        size: params.size,
        quality: params.quality,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
      });

  const uploaded = await uploadImageBytesToR2(env, gen.bytes, gen.contentType, {
    authUser: ctx.authUser,
    workspaceId: ctx.workspaceId,
    origin: ctx.origin,
  });

  const previewUrls = [...(gen.preview_urls || [])];
  if (uploaded.image_url && !previewUrls.includes(uploaded.image_url)) {
    previewUrls.push(uploaded.image_url);
  }

  return {
    ok: true,
    image_url: uploaded.image_url,
    public_url: uploaded.image_url,
    url: uploaded.image_url,
    r2_key: uploaded.r2_key,
    artifact_id: uploaded.artifact_id,
    provider: gen.provider,
    model: gen.model,
    preview_urls: previewUrls,
    metadata: gen.metadata || {},
  };
}

/**
 * Run image tool with cinematic SSE progress (agent chat).
 * @param {(type: string, payload: Record<string, unknown>) => void} emit
 * @param {unknown} env
 * @param {string} toolName
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} ctx
 */
export async function streamImageGenerationSse(emit, env, toolName, params, ctx = {}) {
  const generationId = `igen_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const prompt = String(params.prompt || params.description || '').trim();
  const dims = parseImageDimensions(params.size);
  const isEdit = toolName === 'imgx_edit_image';

  const ws = ctx.workspaceId != null ? String(ctx.workspaceId).trim() : '';
  let providerGuess = 'workers_ai';
  let modelGuess = params.model ? String(params.model).trim() : '';
  let scoredModelKey = null;

  if (isEdit) {
    providerGuess = 'openai';
  } else if (!modelGuess && ws) {
    const lane = resolveImageLane(prompt, false);
    const picked = await pickImageModelFromDb(env, lane, ws);
    if (picked) {
      scoredModelKey = picked.model_key;
      providerGuess = String(picked.api_platform || picked.provider || 'workers_ai');
      modelGuess = scoredModelKey;
      params = {
        ...params,
        model: scoredModelKey,
        provider: providerGuess,
      };
    }
  }

  emit('image_generation_started', {
    type: 'image_generation_started',
    generation_id: generationId,
    provider: providerGuess,
    model: String(modelGuess || ''),
    prompt: prompt.slice(0, 500),
    width: dims.width,
    height: dims.height,
  });

  let tickIndex = 0;
  let frameIndex = 0;
  const progressTimer = setInterval(() => {
    const tick = IMAGE_PROGRESS_TICKS[tickIndex % IMAGE_PROGRESS_TICKS.length];
    tickIndex += 1;
    emit('image_generation_progress', {
      type: 'image_generation_progress',
      generation_id: generationId,
      progress: tick.progress,
      stage: tick.stage,
      message: tick.message,
      preview_frame: frameIndex,
    });
  }, PROGRESS_INTERVAL_MS);

  // Immediate first tick
  const first = IMAGE_PROGRESS_TICKS[0];
  emit('image_generation_progress', {
    type: 'image_generation_progress',
    generation_id: generationId,
    progress: first.progress,
    stage: first.stage,
    message: first.message,
    preview_frame: 0,
  });
  tickIndex = 1;

  const scoredT0 = Date.now();
  try {
    const result = await runImageGenerationForTool(env, toolName, params, ctx);
    if (scoredModelKey && ws) {
      await recordImageModelOutcome(env, scoredModelKey, ws, true, Date.now() - scoredT0);
    }

    for (const previewUrl of result.preview_urls || []) {
      if (!previewUrl) continue;
      frameIndex += 1;
      emit('image_generation_preview', {
        type: 'image_generation_preview',
        generation_id: generationId,
        preview_url: previewUrl,
        frame_index: frameIndex,
      });
    }
    if (result.image_url) {
      frameIndex += 1;
      emit('image_generation_preview', {
        type: 'image_generation_preview',
        generation_id: generationId,
        preview_url: result.image_url,
        frame_index: frameIndex,
      });
    }

    emit('image_generation_complete', {
      type: 'image_generation_complete',
      generation_id: generationId,
      image_url: result.image_url,
      r2_key: result.r2_key,
      artifact_id: result.artifact_id,
      provider: result.provider,
      model: result.model,
    });

    return result;
  } catch (e) {
    if (scoredModelKey && ws) {
      await recordImageModelOutcome(env, scoredModelKey, ws, false, Date.now() - scoredT0);
    }
    const msg = e?.message != null ? String(e.message) : String(e);
    emit('image_generation_progress', {
      type: 'image_generation_progress',
      generation_id: generationId,
      progress: 100,
      stage: 'failed',
      message: 'Image generation failed',
      preview_frame: frameIndex,
      failed: true,
    });
    throw new Error(msg);
  } finally {
    clearInterval(progressTimer);
  }
}
