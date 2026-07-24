/**
 * Cloudflare Images transform engine — allowlist, clamp, and binding pipeline helpers.
 *
 * SSOT: plans/active/cf-images-media-editor-2026-07.md §1.1, §4 F5, §13.
 * Lane 2 (Claude) owns this module — CF Images binding, transform/edit, .draw() watermark,
 * batch API, limits.
 *
 * === §13.1 — what a fetch() Response is (Agent C note, kept for future maintainers) ===
 * In Workers, fetch(url) returns a Response whose `.body` is a ReadableStream of bytes.
 * The Images binding's `.input()` accepts that stream — one legal image source, alongside
 * hosted Images bytes, R2 `.get(key).body`, and `request.body`/`file.stream()` from an upload.
 * This module deliberately never uses the `fetch()` + `cf: { image: {...} }` URL-transform path
 * (see §13.2 doc #8 and the QC-18 note below) — everything here is binding "bytes in, bytes out".
 *
 * === QC-18 — R2 thumb / transform source strategy (documented decision) ===
 * We do NOT use a guarded `cf.image` subrequest fetch against R2-hosted URLs for this feature.
 * Instead, R2 object bytes are read directly via `env.R2.get(key).body` and handed to
 * `env.IMAGES.input()` in-process. This has zero SSRF / Via-loop surface by construction —
 * there is no outbound fetch() of a URL we don't control, so no origin allowlist or
 * `Via: image-resizing` loop guard is needed for the *edit/transform* path this module powers.
 * (Gallery thumbnail rendering for R2-browse items, if it ever needs CF-side resizing, is Lane 1/3
 * scope and should follow the same binding-direct-bytes strategy documented here rather than a
 * cf.image URL fetch.) Binding transforms work without any CF Images subscription; only the
 * *committed derivative* upload (mode="derivative") requires CF Images credentials, matching §1.4.
 */

// ---------------------------------------------------------------------------
// Limits (§13.2 doc #4 — Limits and formats)
// https://developers.cloudflare.com/images/get-started/limits/
// ---------------------------------------------------------------------------

/** Cloudflare Images hosted upload limit (POST /images/v1, batch upload, derivative commit). */
export const MAX_HOSTED_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

/** Images binding .input() max source size. */
export const MAX_BINDING_INPUT_BYTES = 20 * 1024 * 1024; // 20MB

export class TransformValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'TransformValidationError';
    this.details = details || null;
  }
}

export class LimitExceededError extends Error {
  constructor(message, limitBytes, actualBytes) {
    super(message);
    this.name = 'LimitExceededError';
    this.limitBytes = limitBytes;
    this.actualBytes = actualBytes;
  }
}

function mb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Throws LimitExceededError with a message citing the CF doc limit. */
export function assertWithinBindingInputLimit(byteLength) {
  const n = Number(byteLength) || 0;
  if (n > MAX_BINDING_INPUT_BYTES) {
    throw new LimitExceededError(
      `Image is ${mb(n)}MB, which exceeds the Cloudflare Images binding input limit of ` +
        `${mb(MAX_BINDING_INPUT_BYTES)}MB. See https://developers.cloudflare.com/images/get-started/limits/`,
      MAX_BINDING_INPUT_BYTES,
      n,
    );
  }
}

/** Throws LimitExceededError with a message citing the CF doc limit. */
export function assertWithinHostedUploadLimit(byteLength) {
  const n = Number(byteLength) || 0;
  if (n > MAX_HOSTED_UPLOAD_BYTES) {
    throw new LimitExceededError(
      `Output is ${mb(n)}MB, which exceeds the Cloudflare Images hosted upload limit of ` +
        `${mb(MAX_HOSTED_UPLOAD_BYTES)}MB. Lower quality/dimensions and retry. ` +
        `See https://developers.cloudflare.com/images/get-started/limits/`,
      MAX_HOSTED_UPLOAD_BYTES,
      n,
    );
  }
}

/** SVG is not resizable via Cloudflare Images (vector format) — reject "resize" transforms. */
export function assertTransformableMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/svg+xml') {
    throw new TransformValidationError(
      'SVG images cannot be resized or transformed via Cloudflare Images (vector format is not rasterized). ' +
        'Use the SVG as-is or convert it externally first.',
    );
  }
}

// ---------------------------------------------------------------------------
// Allowlist (§4 F5, §13.2 doc #2 — Key concepts vocabulary)
// ---------------------------------------------------------------------------

const FIT_VALUES = ['scale-down', 'contain', 'cover', 'crop', 'pad'];
const FLIP_VALUES = ['h', 'v', 'hv'];
const GRAVITY_VALUES = ['auto', 'face', 'left', 'right', 'top', 'bottom', 'center'];
const FORMAT_VALUES = ['auto', 'avif', 'webp', 'jpeg', 'png'];

/**
 * Allowlisted transform ops with clamp ranges. Anything not listed here is dropped, never
 * passed through to the binding. Values mirror Cloudflare's documented `transform()` params
 * (https://developers.cloudflare.com/images/optimization/features/) so UI/API vocabulary matches
 * CF's own terms per §13.2 doc #2.
 */
export const ALLOWED_TRANSFORM_OPS = Object.freeze({
  width: { type: 'int', min: 1, max: 4096 },
  height: { type: 'int', min: 1, max: 4096 },
  fit: { type: 'enum', values: FIT_VALUES },
  gravity: { type: 'gravity' },
  rotate: { type: 'int', min: 0, max: 359 },
  flip: { type: 'enum', values: FLIP_VALUES },
  brightness: { type: 'float', min: 0, max: 2 },
  contrast: { type: 'float', min: 0, max: 2 },
  saturation: { type: 'float', min: 0, max: 2 },
  gamma: { type: 'float', min: 0, max: 2 },
  blur: { type: 'int', min: 0, max: 250 },
  sharpen: { type: 'float', min: 0, max: 10 },
  quality: { type: 'int', min: 1, max: 100 },
  format: { type: 'enum', values: FORMAT_VALUES },
  anim: { type: 'bool' },
});

/**
 * Validate + clamp a raw ops object against the allowlist. Unknown keys are dropped (reported in
 * `dropped`, never thrown). Out-of-range values are clamped, not rejected — invalid *types*
 * (e.g. fit: "banana") are collected in `errors`.
 * @param {Record<string, unknown>} raw
 * @returns {{ ops: Record<string, unknown>, errors: string[], dropped: string[] }}
 */
export function clampTransformOps(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const errors = [];
  const ops = {};

  for (const [key, spec] of Object.entries(ALLOWED_TRANSFORM_OPS)) {
    if (!(key in input)) continue;
    const val = input[key];
    if (val === undefined || val === null || val === '') continue;

    switch (spec.type) {
      case 'int': {
        const n = Number(val);
        if (!Number.isFinite(n)) {
          errors.push(`${key}: expected a number`);
          break;
        }
        ops[key] = Math.min(spec.max, Math.max(spec.min, Math.round(n)));
        break;
      }
      case 'float': {
        const n = Number(val);
        if (!Number.isFinite(n)) {
          errors.push(`${key}: expected a number`);
          break;
        }
        ops[key] = Math.round(Math.min(spec.max, Math.max(spec.min, n)) * 100) / 100;
        break;
      }
      case 'enum': {
        const v = typeof val === 'string' ? val.toLowerCase().trim() : val;
        if (!spec.values.includes(v)) {
          errors.push(`${key}: must be one of ${spec.values.join(', ')}`);
          break;
        }
        ops[key] = v;
        break;
      }
      case 'bool': {
        ops[key] = val === true || val === 'true' || val === 1 || val === '1';
        break;
      }
      case 'gravity': {
        if (typeof val === 'string') {
          const v = val.toLowerCase().trim();
          if (!GRAVITY_VALUES.includes(v)) {
            errors.push(`gravity: must be one of ${GRAVITY_VALUES.join(', ')} or {x, y}`);
            break;
          }
          ops.gravity = v;
        } else if (val && typeof val === 'object' && 'x' in val && 'y' in val) {
          const x = Math.min(1, Math.max(0, Number(val.x) || 0));
          const y = Math.min(1, Math.max(0, Number(val.y) || 0));
          ops.gravity = { x, y };
        } else {
          errors.push('gravity: invalid value');
        }
        break;
      }
      default:
        break;
    }
  }

  const dropped = Object.keys(input).filter((k) => !(k in ALLOWED_TRANSFORM_OPS));
  return { ops, errors, dropped };
}

/**
 * Orders clamped ops into binding-safe `.transform()` step objects: orient → resize → tone → filter.
 * Order matters for rotate/flip vs resize (CF applies each `.transform()` node in call sequence).
 * @param {Record<string, unknown>} ops — already clamped (see clampTransformOps)
 * @returns {Record<string, unknown>[]}
 */
export function buildTransformSteps(ops) {
  const steps = [];

  const orient = {};
  if (ops.rotate != null) orient.rotate = ops.rotate;
  if (ops.flip != null) orient.flip = ops.flip;
  if (Object.keys(orient).length) steps.push(orient);

  const resize = {};
  if (ops.width != null) resize.width = ops.width;
  if (ops.height != null) resize.height = ops.height;
  if (ops.fit != null) resize.fit = ops.fit;
  if (ops.gravity != null) resize.gravity = ops.gravity;
  if (Object.keys(resize).length) steps.push(resize);

  const tone = {};
  if (ops.brightness != null) tone.brightness = ops.brightness;
  if (ops.contrast != null) tone.contrast = ops.contrast;
  if (ops.saturation != null) tone.saturation = ops.saturation;
  if (ops.gamma != null) tone.gamma = ops.gamma;
  if (Object.keys(tone).length) steps.push(tone);

  const filter = {};
  if (ops.blur != null) filter.blur = ops.blur;
  if (ops.sharpen != null) filter.sharpen = ops.sharpen;
  if (Object.keys(filter).length) steps.push(filter);

  return steps;
}

// ---------------------------------------------------------------------------
// Delivery URL (flexible variant) — cheap preview path, no binding call required.
// https://developers.cloudflare.com/images/manage-images/enable-flexible-variants/
// Requires the account to have "Flexible variants" enabled; if not enabled the URL 404s and
// callers should fall back to the binding preview route (see src/api/images.js preview-url).
// ---------------------------------------------------------------------------

const DELIVERY_KEY_ORDER = [
  'width',
  'height',
  'fit',
  'gravity',
  'rotate',
  'flip',
  'brightness',
  'contrast',
  'saturation',
  'gamma',
  'blur',
  'sharpen',
  'quality',
  'format',
  'anim',
];

/**
 * Builds the comma-separated flexible-variant options segment, e.g. "width=400,fit=cover".
 * @param {Record<string, unknown>} rawOps
 * @returns {string}
 */
export function buildDeliveryOptions(rawOps) {
  const { ops } = clampTransformOps(rawOps);
  const parts = [];
  for (const key of DELIVERY_KEY_ORDER) {
    if (ops[key] == null) continue;
    if (key === 'gravity' && typeof ops[key] === 'object') {
      parts.push(`gravity=${ops[key].x},${ops[key].y}`);
    } else {
      parts.push(`${key}=${ops[key]}`);
    }
  }
  return parts.join(',');
}

/**
 * Full flexible-variant delivery URL for an existing hosted CF image.
 * @param {string} accountHash
 * @param {string} imageId
 * @param {Record<string, unknown>} rawOps
 */
export function buildFlexibleDeliveryUrl(accountHash, imageId, rawOps) {
  if (!accountHash || !imageId) return '';
  const options = buildDeliveryOptions(rawOps);
  return `https://imagedelivery.net/${accountHash}/${imageId}/${options || 'public'}`;
}

// ---------------------------------------------------------------------------
// Binding pipeline (§13.2 doc #6 — Optimize with Workers binding)
// ---------------------------------------------------------------------------

/**
 * Runs an allowlisted transform through the Images binding: input → transform steps →
 * optional watermark draw() → output. Bytes in, bytes out — never touches a URL.
 *
 * @param {any} env — Worker env (must have env.IMAGES bound)
 * @param {ReadableStream|ArrayBuffer|Blob} source
 * @param {Record<string, unknown>} rawOps — raw (unvalidated) transform request
 * @param {{ watermark?: boolean, defaultFormat?: string, baseWidth?: number }} [opts]
 * @returns {Promise<{ output: any, ops: Record<string, unknown>, dropped: string[], format: string }>}
 *   `output` is the Images binding's ImageOutput — call `.response()` / `.image()` on it.
 */
export async function applyBindingPipeline(env, source, rawOps, opts = {}) {
  if (!env?.IMAGES) {
    throw new TransformValidationError(
      'images_binding_unavailable: env.IMAGES is not bound. Add { "images": { "binding": "IMAGES" } } ' +
        'to wrangler.jsonc / wrangler.production.toml.',
    );
  }

  const { ops, errors, dropped } = clampTransformOps(rawOps);
  if (errors.length) {
    throw new TransformValidationError(`Invalid transform options: ${errors.join('; ')}`, errors);
  }

  let pipeline = env.IMAGES.input(source);
  for (const step of buildTransformSteps(ops)) {
    pipeline = pipeline.transform(step);
  }

  if (opts.watermark) {
    const logo = await getPlatformWatermarkStream(env);
    if (logo) {
      pipeline = pipeline.draw(
        env.IMAGES.input(logo).transform({ width: watermarkWidthFor(ops.width || opts.baseWidth) }),
        WATERMARK_DRAW_OPTIONS,
      );
    }
  }

  const formatKey = ops.format && ops.format !== 'auto' ? ops.format : normalizeDefaultFormat(opts.defaultFormat);
  const outputOpts = { format: `image/${formatKey}` };
  if (ops.quality != null) outputOpts.quality = ops.quality;
  if (ops.anim != null) outputOpts.anim = ops.anim;

  const output = await pipeline.output(outputOpts);
  return { output, ops, dropped, format: formatKey };
}

function normalizeDefaultFormat(fmt) {
  const f = String(fmt || 'webp').replace(/^image\//, '');
  return FORMAT_VALUES.includes(f) && f !== 'auto' ? f : 'webp';
}

// ---------------------------------------------------------------------------
// Watermark export preset (§13.2 doc #5 — Draw overlays)
// https://developers.cloudflare.com/images/optimization/draw-overlays/
// ---------------------------------------------------------------------------

/** Branded export preset — logo bottom-right, semi-transparent. */
export const WATERMARK_EXPORT_PRESET = Object.freeze({
  id: 'platform_watermark',
  opacity: 0.55,
  marginPx: 24,
  widthRatio: 0.18, // overlay width as a fraction of the base image width
  minWidthPx: 64,
  maxWidthPx: 512,
});

const WATERMARK_DRAW_OPTIONS = Object.freeze({
  opacity: WATERMARK_EXPORT_PRESET.opacity,
  bottom: WATERMARK_EXPORT_PRESET.marginPx,
  right: WATERMARK_EXPORT_PRESET.marginPx,
});

function watermarkWidthFor(baseWidth) {
  const base = Number(baseWidth) || 1024;
  const w = Math.round(base * WATERMARK_EXPORT_PRESET.widthRatio);
  return Math.max(WATERMARK_EXPORT_PRESET.minWidthPx, Math.min(WATERMARK_EXPORT_PRESET.maxWidthPx, w));
}

/**
 * Resolves the platform watermark/logo asset as a stream, for use as the `.draw()` overlay input.
 * Looked up (in order): R2 ASSETS bucket key `branding/watermark-logo.png`, then
 * `env.PLATFORM_WATERMARK_LOGO_URL` if set. Returns null (caller should skip watermarking, not
 * fail the whole transform) if neither is configured.
 *
 * OPERATOR NOTE: to enable the watermark export preset, upload a logo PNG (transparent
 * background recommended) to the `ASSETS` R2 bucket at key `branding/watermark-logo.png`,
 * or set the `PLATFORM_WATERMARK_LOGO_URL` var/secret to a publicly fetchable logo URL.
 * @param {any} env
 * @returns {Promise<ReadableStream|null>}
 */
export async function getPlatformWatermarkStream(env) {
  try {
    if (env?.ASSETS?.get) {
      const obj = await env.ASSETS.get('branding/watermark-logo.png');
      if (obj?.body) return obj.body;
    }
  } catch {
    // fall through to URL fallback
  }
  const url = String(env?.PLATFORM_WATERMARK_LOGO_URL || '').trim();
  if (url) {
    try {
      const res = await fetch(url);
      if (res.ok && res.body) return res.body;
    } catch {
      // no watermark available this request — caller treats as "skip watermark"
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Images batch API (§13.2 doc #10) — for Agent Sam / multi-select CF ops at scale.
// https://developers.cloudflare.com/images/storage/upload-images/images-batch/
// Batch tokens are rate-limited separately (200 rps) from the global CF API, so bulk
// migrate/tag/delete workflows should always route through these helpers, not the plain
// api.cloudflare.com v1 endpoints, once ids.length is more than a handful.
// ---------------------------------------------------------------------------

const CF_IMAGES_BATCH_HOST = 'https://batch.imagedelivery.net';

/**
 * Obtains a short-lived (~1hr) batch token scoped to an account.
 * @param {string} accountId
 * @param {string} apiToken — regular CF API token (not the batch token itself)
 */
export async function getCfImagesBatchToken(accountId, apiToken) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/images/v1/batch_token`,
    { headers: { Authorization: `Bearer ${apiToken}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success || !data?.result?.token) {
    throw new Error(data?.errors?.[0]?.message || 'Failed to obtain Cloudflare Images batch token');
  }
  return { token: data.result.token, expiresAt: data.result.expiresAt || null };
}

/** Upload a single file through the batch endpoint (200rps lane, not global API rate limit). */
export async function batchUploadToCfImages(batchToken, file, metadata) {
  const form = new FormData();
  form.append('file', file, file.name || 'upload.jpg');
  form.append('requireSignedURLs', 'false');
  form.append('metadata', JSON.stringify(metadata || {}));
  const res = await fetch(`${CF_IMAGES_BATCH_HOST}/images/v1`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${batchToken}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.errors?.[0]?.message || 'Cloudflare Images batch upload failed');
  }
  return data.result;
}

/** Patch metadata for a single image through the batch endpoint. */
export async function batchPatchCfImageMeta(batchToken, imageId, metadata) {
  const res = await fetch(`${CF_IMAGES_BATCH_HOST}/images/v1/${encodeURIComponent(imageId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${batchToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata, meta: metadata }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.errors?.[0]?.message || 'Cloudflare Images batch meta patch failed');
  }
  return data.result;
}

/** Delete a single image through the batch endpoint. */
export async function batchDeleteFromCfImages(batchToken, imageId) {
  const res = await fetch(`${CF_IMAGES_BATCH_HOST}/images/v1/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${batchToken}` },
  });
  if (res.status === 404) return true; // already gone — treat as success
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.errors?.[0]?.message || 'Cloudflare Images batch delete failed');
  }
  return true;
}

/**
 * Runs `worker(item, batchToken)` for each item using a shared batch token, with a small
 * concurrency cap so we stay well under the 200rps batch lane limit. Errors are collected
 * per-item rather than aborting the whole run.
 * @template T
 * @param {string} accountId
 * @param {string} apiToken
 * @param {T[]} items
 * @param {(item: T, batchToken: string) => Promise<any>} worker
 * @param {{ concurrency?: number }} [opts]
 */
export async function runCfImagesBatch(accountId, apiToken, items, worker, opts = {}) {
  const concurrency = Math.max(1, Math.min(20, opts.concurrency || 8));
  const { token: batchToken } = await getCfImagesBatchToken(accountId, apiToken);

  const results = new Array(items.length);
  let cursor = 0;
  async function runOne() {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      try {
        results[i] = { ok: true, item: items[i], result: await worker(items[i], batchToken) };
      } catch (e) {
        results[i] = { ok: false, item: items[i], error: e?.message || String(e) };
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runOne));
  return results;
}
