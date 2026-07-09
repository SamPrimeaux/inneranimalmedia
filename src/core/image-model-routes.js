/**
 * Image generation lane map — aligns with google-model-routes.js + Thompson arms (task_type=image_generation).
 *
 * Routing stack:
 * 1. resolveImageGenerationIntent(message) → lane slug
 * 2. pickImageModelFromDb(env, workspaceId, prompt) → tier from prompt + Thompson sample
 * 3. runImageGenerationForTool / imgx_* with resolved model_key
 */
import { GOOGLE_MODEL_ROUTES } from './google-model-routes.js';

export const RETIRED_OPENAI_IMAGE_MODEL_KEYS = Object.freeze([
  'gpt-image-1',
  'gpt-image-1-mini',
  'gpt-image-1.5',
]);

/** @param {string} modelKey */
export function assertOpenAiImageModelActive(modelKey) {
  const mk = String(modelKey || '').trim();
  if (RETIRED_OPENAI_IMAGE_MODEL_KEYS.includes(mk)) {
    throw new Error(
      `model_retired:${mk} — OpenAI gpt-image-1 generation is removed; use gpt-image-2, gemini-3.1-flash-image, or gemini-3-pro-image`,
    );
  }
}

export const IMAGE_GENERATION_LANES = Object.freeze({
  /** Drafts, thumbnails, quick previews — prefer flash / cheap OpenAI. */
  fast_draft: {
    preferredModels: ['gemini-3.1-flash-image', 'gpt-image-2', '@cf/black-forest-labs/flux-2-klein-4b'],
    googleDefault: GOOGLE_MODEL_ROUTES.imageFast,
  },
  /** Logos, hero, client-facing mockups — balanced quality/cost. */
  brand_mockup: {
    preferredModels: ['gemini-3-pro-image', 'gpt-image-2', 'gemini-3.1-flash-image'],
    googleDefault: GOOGLE_MODEL_ROUTES.imagePro,
  },
  /** Final / print / ultra — pro lane first. */
  high_quality: {
    preferredModels: ['gemini-3-pro-image', 'gpt-image-2', 'imagen-4.0-ultra-generate-001'],
    googleDefault: GOOGLE_MODEL_ROUTES.imagePro,
  },
  /** Reference edit / inpaint — imgx_edit_image (OpenAI edit path today). */
  edit_reference: {
    preferredModels: ['gpt-image-2', 'gemini-3.1-flash-image', 'gemini-3-pro-image'],
    googleDefault: GOOGLE_MODEL_ROUTES.imageFast,
  },
});

/** Non-picker image-capable surfaces in IAM (tools + routing + CMS). */
export const IMAGE_CAPABLE_SURFACES = Object.freeze([
  { id: 'gemini_flash_image', model: GOOGLE_MODEL_ROUTES.imageFast, task_type: 'image_generation', tool: 'imgx_generate_image' },
  { id: 'gemini_pro_image', model: GOOGLE_MODEL_ROUTES.imagePro, task_type: 'image_generation', tool: 'imgx_generate_image' },
  { id: 'openai_gpt_image_2', model: 'gpt-image-2', task_type: 'image_generation', tool: 'imgx_generate_image' },
  { id: 'openai_dalle_3', model: 'dall-e-3', task_type: 'image_generation', tool: 'imgx_generate_image' },
  { id: 'workers_ai_flux_klein_4b', model: '@cf/black-forest-labs/flux-2-klein-4b', task_type: 'image_generation', tool: 'imgx_generate_image' },
  { id: 'workers_ai_flux_klein_9b', model: '@cf/black-forest-labs/flux-2-klein-9b', task_type: 'image_generation', tool: 'imgx_generate_image' },
  { id: 'cms_theme_cover', model: 'gemini-3.1-flash-image', task_type: 'cms_theme_cover', tool: null },
  { id: 'meshy_image_to_3d', model: null, task_type: 'meshy', tool: 'meshyai_image_to_3d' },
  { id: 'cf_images_upload', model: null, task_type: 'cf_images', tool: 'cf_images_upload' },
]);

/**
 * @param {string} laneSlug
 * @returns {string|null}
 */
export function preferredGoogleImageModelForLane(laneSlug) {
  const lane = IMAGE_GENERATION_LANES[String(laneSlug || '').trim()];
  return lane?.googleDefault || GOOGLE_MODEL_ROUTES.imageFast;
}
