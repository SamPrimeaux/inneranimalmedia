/**
 * cms-theme-handlers.js
 * Registers all cms.* handler_key implementations into agent-step.js.
 * Called once at module load from agent-step.js.
 *
 * Thompson sampling: Beta(alpha, beta) approximated via Gumbel trick:
 *   score = -log(rand) / alpha  →  highest score wins.
 * Cheap, no stats library needed, correct in expectation.
 */

import { registerAgentStepHandler } from './agent-step.js';
import { assertOpenAiImageModelActive, RETIRED_OPENAI_IMAGE_MODEL_KEYS } from './image-model-routes.js';

const D1_ID = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49';
const CF_ACCOUNT = 'ede6590ac0d2fb7daf155b35653457b2';
const EXCLUDED_MODELS = [
  'claude-sonnet-4-6','claude-sonnet-4-5',
  ...RETIRED_OPENAI_IMAGE_MODEL_KEYS,
];

function thompsonSample(arms) {
  // Gumbel-max trick: score = -log(rand)/alpha, pick max
  return arms
    .map(a => ({ ...a, _score: -Math.log(Math.random() + 1e-10) / (a.success_alpha || 1) }))
    .sort((a, b) => b._score - a._score)[0];
}

function json(v) {
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return {}; }
}

// ── cms.resolveActiveModels ───────────────────────────────────────────────────
registerAgentStepHandler('cms.resolveActiveModels', async (env, { runContext }) => {
  const taskType = 'cms_theme_generation';
  const excluded = EXCLUDED_MODELS.map(() => '?').join(',');
  const { results: arms } = await env.DB.prepare(`
    SELECT id, task_type, model_key, provider,
           success_alpha, success_beta, total_executions,
           avg_quality_score, is_active, is_paused, budget_exhausted
    FROM agentsam_routing_arms
    WHERE task_type = ?
      AND is_active = 1 AND is_paused = 0 AND budget_exhausted = 0
      AND model_key NOT IN (${EXCLUDED_MODELS.map(() => '?').join(',')})
    ORDER BY (success_alpha * 1.0 / (success_alpha + success_beta)) DESC
  `).bind(taskType, ...EXCLUDED_MODELS).all();

  if (!arms.length) return { ok: false, error: 'no_eligible_arms' };

  const winner = thompsonSample(arms);
  return { ok: true, result: { arms, selected_arm: winner, arm_id: winner.id, model_key: winner.model_key } };
});

// ── cms.resolveImageArm ───────────────────────────────────────────────────────
registerAgentStepHandler('cms.resolveImageArm', async (env) => {
  const { results: arms } = await env.DB.prepare(`
    SELECT id, task_type, model_key, provider,
           success_alpha, success_beta, total_executions
    FROM agentsam_routing_arms
    WHERE task_type = 'cms_theme_cover'
      AND is_active = 1 AND is_paused = 0 AND budget_exhausted = 0
    ORDER BY success_alpha DESC
  `).bind().all();

  if (!arms.length) return { ok: false, error: 'no_image_arms' };
  const winner = thompsonSample(arms);
  return { ok: true, result: { selected_arm: winner, arm_id: winner.id, model_key: winner.model_key } };
});

// ── cms.claimTheme ────────────────────────────────────────────────────────────
registerAgentStepHandler('cms.claimTheme', async (env, { runContext }) => {
  // Find a slug that needs work and isn't claimed by another active run
  const row = await env.DB.prepare(`
    SELECT slug, name, css_vars_json, tokens_json, brand_json, monaco_theme_data
    FROM cms_themes
    WHERE status = 'active'
      AND (compiled_css_hash IS NULL OR css_vars_json = '{}' OR preview_image_url IS NULL)
      AND slug NOT IN (
        SELECT COALESCE(
          json_extract(step_results_json, '$.claim_theme.slug'),
          json_extract(step_results_json, '$.claim_theme.result.slug')
        )
        FROM agentsam_workflow_runs
        WHERE status IN ('running','completed')
          AND workflow_key = 'cms_theme_pump_unique'
          AND created_at > datetime('now','-24 hours')
      )
    ORDER BY RANDOM() LIMIT 1
  `).first();

  if (!row) return { ok: false, error: 'no_unclaimed_themes' };

  return {
    ok: true,
    result: {
      slug:              row.slug,
      name:              row.name,
      css_vars_json:     json(row.css_vars_json),
      tokens_json:       json(row.tokens_json),
      brand_json:        json(row.brand_json),
      monaco_theme_data: json(row.monaco_theme_data),
    }
  };
});

// ── cms.validateTheme — handled by eval node_type (quality_gate_json) ─────────
// No registration needed.

// ── cms.updateThemeRow ────────────────────────────────────────────────────────
registerAgentStepHandler('cms.updateThemeRow', async (env, { input }) => {
  const s = input?.claim_theme?.result || input?.claim_theme || {};
  const g = input?.generate_tokens?.result || input?.generate_tokens || {};
  const h = input?.write_r2?.result || {};
  const slug = s.slug;
  if (!slug) return { ok: false, error: 'no slug in input' };

  const css_vars   = g.css_vars_json   ? JSON.stringify(g.css_vars_json)   : undefined;
  const tokens     = g.tokens_json     ? JSON.stringify(g.tokens_json)     : undefined;
  const brand      = g.brand_json      ? JSON.stringify(g.brand_json)      : undefined;
  const monaco_td  = g.monaco_theme_data ? JSON.stringify(g.monaco_theme_data) : undefined;
  const css_hash   = h.compiled_css_hash || undefined;
  const css_r2_key = h.css_r2_key || `cms/themes/${slug}/theme.css`;
  const css_url    = `https://assets.inneranimalmedia.com/${css_r2_key}`;

  const sets = [], binds = [];
  if (css_vars)   { sets.push('css_vars_json = ?');     binds.push(css_vars); }
  if (tokens)     { sets.push('tokens_json = ?');       binds.push(tokens); }
  if (brand)      { sets.push('brand_json = ?');        binds.push(brand); }
  if (monaco_td)  { sets.push('monaco_theme_data = ?'); binds.push(monaco_td); }
  if (css_hash)   { sets.push('compiled_css_hash = ?'); binds.push(css_hash); }
  sets.push('css_r2_key = ?', 'css_url = ?', 'updated_at = datetime("now")');
  binds.push(css_r2_key, css_url, slug);

  await env.DB.prepare(
    `UPDATE cms_themes SET ${sets.join(', ')} WHERE slug = ?`
  ).bind(...binds).run();

  return { ok: true, result: { slug, css_url, css_r2_key, css_hash } };
});

// ── cms.updatePreviewUrl ──────────────────────────────────────────────────────
registerAgentStepHandler('cms.updatePreviewUrl', async (env, { input }) => {
  const slug = input?.claim_theme?.result?.slug || input?.slug;
  const url  = input?.upload_cover?.result?.preview_image_url || input?.preview_image_url;
  if (!slug || !url) return { ok: false, error: 'missing slug or preview_image_url' };

  await env.DB.prepare(
    `UPDATE cms_themes SET preview_image_url = ?, updated_at = datetime("now") WHERE slug = ?`
  ).bind(url, slug).run();

  return { ok: true, result: { slug, preview_image_url: url } };
});

// ── cms.recordMetrics (Thompson write-back) ────────────────────────────────────
registerAgentStepHandler('cms.recordMetrics', async (env, { input }) => {
  const arm_id   = input?.resolve_models?.result?.arm_id;
  const img_arm  = input?.resolve_image_arm?.result?.arm_id;
  const slug     = input?.claim_theme?.result?.slug;
  const quality  = input?.validate_output?.result?.quality_score || 0.69;

  // Determine overall success: needs hash + preview
  const has_hash    = !!input?.write_r2?.result?.compiled_css_hash;
  const has_preview = !!input?.upload_cover?.result?.preview_image_url;
  const success     = has_hash && has_preview;

  const updates = [];

  if (arm_id) {
    // Text generation arm feedback
    if (success) {
      updates.push(env.DB.prepare(`
        UPDATE agentsam_routing_arms
        SET success_alpha = success_alpha + ?,
            avg_quality_score = (avg_quality_score * quality_n + ?) / (quality_n + 1),
            quality_n = quality_n + 1,
            total_executions = total_executions + 1,
            updated_at = unixepoch()
        WHERE id = ?
      `).bind(quality, quality, arm_id).run());
    } else {
      updates.push(env.DB.prepare(`
        UPDATE agentsam_routing_arms
        SET success_beta = success_beta + 1,
            total_executions = total_executions + 1,
            updated_at = unixepoch()
        WHERE id = ?
      `).bind(arm_id).run());
    }
  }

  if (img_arm) {
    // Image generation arm feedback
    if (has_preview) {
      updates.push(env.DB.prepare(`
        UPDATE agentsam_routing_arms
        SET success_alpha = success_alpha + 0.5,
            total_executions = total_executions + 1,
            updated_at = unixepoch()
        WHERE id = ?
      `).bind(img_arm).run());
    } else {
      updates.push(env.DB.prepare(`
        UPDATE agentsam_routing_arms
        SET success_beta = success_beta + 1,
            total_executions = total_executions + 1,
            updated_at = unixepoch()
        WHERE id = ?
      `).bind(img_arm).run());
    }
  }

  await Promise.all(updates);
  return { ok: true, result: { slug, success, arm_id, img_arm, quality } };
});

// ── cms.writeThemeR2 ──────────────────────────────────────────────────────────
registerAgentStepHandler('cms.writeThemeR2', async (env, { input }) => {
  const slug   = input?.claim_theme?.result?.slug;
  const tokens = input?.generate_tokens?.result;
  if (!slug || !tokens) return { ok: false, error: 'missing slug or tokens' };

  const css_vars_json     = tokens.css_vars_json     || {};
  const tokens_json       = tokens.tokens_json       || {};
  const brand_json        = tokens.brand_json        || {};
  const monaco_theme_data = tokens.monaco_theme_data || {};

  // Build CSS from css_vars_json
  const cssVars = Object.entries(css_vars_json)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  const compiledCss = `:root {\n${cssVars}\n}\n`;
  const hash = await sha256(compiledCss);

  const prefix = `cms/themes/${slug}`;
  const files = {
    [`${prefix}/theme.css`]:     { body: compiledCss,                     ct: 'text/css' },
    [`${prefix}/theme.json`]:    { body: JSON.stringify(tokens_json, null, 2),  ct: 'application/json' },
    [`${prefix}/brand.json`]:    { body: JSON.stringify(brand_json, null, 2),   ct: 'application/json' },
    [`${prefix}/monaco.json`]:   { body: JSON.stringify(monaco_theme_data, null, 2), ct: 'application/json' },
    [`${prefix}/manifest.json`]: { body: JSON.stringify({ slug, hash, generated_at: new Date().toISOString() }, null, 2), ct: 'application/json' },
  };

  const bucket = env.ASSETS;
  if (!bucket) return { ok: false, error: 'no R2 bucket binding (DASHBOARD or ASSETS)' };

  const uploads = Object.entries(files).map(([key, { body, ct }]) =>
    bucket.put(key, body, { httpMetadata: { contentType: ct } })
  );
  await Promise.all(uploads);

  return {
    ok: true,
    result: {
      slug,
      css_r2_key:       `${prefix}/theme.css`,
      compiled_css_hash: hash,
      files_written:    Object.keys(files),
    }
  };
});

// ── cms.uploadCoverCFImages ───────────────────────────────────────────────────
registerAgentStepHandler('cms.uploadCoverCFImages', async (env, { input }) => {
  const slug      = input?.claim_theme?.result?.slug;
  const name      = input?.claim_theme?.result?.name;
  const arm       = input?.resolve_image_arm?.result;
  const coverPrompt = input?.generate_cover?.result?.prompt;

  if (!slug || !coverPrompt) return { ok: false, error: 'missing slug or cover prompt' };

  const model_key = arm?.model_key || 'gemini-3.1-flash-image';
  const arm_id    = arm?.arm_id;

  // Call image generation API
  let imageBase64;
  try {
    imageBase64 = await generateCoverImage(env, model_key, coverPrompt);
  } catch (e) {
    return { ok: false, error: `image gen failed: ${e.message}`, arm_id };
  }

  // Upload to Cloudflare Images with full metadata tags
  const CF_ACCOUNT = env.CF_ACCOUNT_ID || 'ede6590ac0d2fb7daf155b35653457b2';
  const CF_IMAGES_TOKEN = env.CLOUDFLARE_API_TOKEN || env.CF_TOKEN;

  const formData = new FormData();
  const blob = base64ToBlob(imageBase64, 'image/png');
  formData.append('file', blob, `${slug}.png`);
  formData.append('metadata', JSON.stringify({
    slug,
    task:           'cms_theme_cover',
    model:          model_key,
    arm_id:         arm_id || '',
    workflow_run:   input?._run_id || '',
    generated_at:   new Date().toISOString(),
  }));
  formData.append('requireSignedURLs', 'false');

  const upload = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/images/v1`,
    { method: 'POST', headers: { Authorization: `Bearer ${CF_IMAGES_TOKEN}` }, body: formData }
  );
  const uploadJson = await upload.json();
  if (!uploadJson.success) {
    return { ok: false, error: `CF Images upload failed: ${JSON.stringify(uploadJson.errors)}`, arm_id };
  }

  const imageId  = uploadJson.result.id;
  const variants = uploadJson.result.variants || [];
  // Prefer 'public' variant for preview_image_url
  const publicUrl = variants.find(v => v.includes('/public')) || variants[0] || '';

  return {
    ok: true,
    result: {
      slug,
      cf_image_id:       imageId,
      preview_image_url: publicUrl,
      variants,
      model_key,
      arm_id,
    }
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generateCoverImage(env, model_key, prompt) {
  assertOpenAiImageModelActive(model_key);
  // Route by model family
  if (model_key.startsWith('gpt-image')) {
    const apiKey = env.OPENAI_API_KEY;
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model_key,
        prompt,
        n: 1,
        size: '1792x1024',
        response_format: 'b64_json',
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'OpenAI image gen failed');
    return data.data[0].b64_json;
  }

  if (model_key.startsWith('imagen')) {
    const apiKey = env.GEMINI_API_KEY;
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model_key}:generateImages?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: { text: prompt }, number_of_images: 1 }),
      }
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'Imagen gen failed');
    return data.generatedImages?.[0]?.image?.imageBytes;
  }

  if (model_key.includes('gemini') && model_key.includes('image')) {
    const apiKey = env.GEMINI_API_KEY;
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model_key}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'Gemini image gen failed');
    return data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  }

  throw new Error(`Unknown image gen model: ${model_key}`);
}

function base64ToBlob(base64, mimeType) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
