/**
 * Meshy API credit cost estimates (https://docs.meshy.ai/en/api/pricing).
 * Used for preflight balance checks before generation.
 */

/** @typedef {'text-to-3d-preview' | 'text-to-3d-refine' | 'text-to-3d-full' | 'image-to-3d' | 'multi-image-to-3d' | 'retexture' | 'remesh' | 'rigging' | 'animation' | 'text-to-image' | 'image-to-image' | 'print-repair' | 'print-multi-color'} MeshyOperation */

export const MESHY_CREDIT_COSTS = {
  /** Text-to-3D preview — meshy-6 / lowpoly */
  TEXT_TO_3D_PREVIEW_MESHY6: 20,
  /** Text-to-3D preview — meshy-5 / other models */
  TEXT_TO_3D_PREVIEW_DEFAULT: 5,
  /** Text-to-3D refine (texturing + PBR) */
  TEXT_TO_3D_REFINE: 10,
  /** Full text path: preview (worst-case meshy-6) + refine */
  TEXT_TO_3D_FULL: 15,
  /** Conservative preflight for preview+refine auto chain */
  TEXT_TO_3D_FULL_CONSERVATIVE: 30,
  /** Image-to-3D with texture (typical) */
  IMAGE_TO_3D_TEXTURED: 30,
  /** Image-to-3D mesh-only minimum */
  IMAGE_TO_3D_MESH: 5,
  MULTI_IMAGE_TO_3D_TEXTURED: 30,
  MULTI_IMAGE_TO_3D_MESH: 5,
  RETEXTURE: 10,
  REMESH: 5,
  RIGGING: 5,
  ANIMATION: 3,
  TEXT_TO_IMAGE_NANO: 3,
  TEXT_TO_IMAGE_PRO: 9,
  PRINT_REPAIR: 10,
  PRINT_MULTI_COLOR: 10,
};

/**
 * Estimate credits for a text-to-3D preview request.
 * @param {Record<string, unknown>} [body]
 */
export function estimateTextTo3dPreviewCost(body = {}) {
  const aiModel = String(body.ai_model || body.aiModel || 'latest').toLowerCase();
  const modelType = String(body.model_type || body.modelType || 'standard').toLowerCase();
  if (modelType === 'lowpoly' || aiModel.includes('meshy-6') || aiModel === 'latest') {
    return MESHY_CREDIT_COSTS.TEXT_TO_3D_PREVIEW_MESHY6;
  }
  return MESHY_CREDIT_COSTS.TEXT_TO_3D_PREVIEW_DEFAULT;
}

/**
 * Estimate credits for text-to-3D preview + refine chain.
 * @param {Record<string, unknown>} [body]
 * @param {{ autoRefine?: boolean }} [opts]
 */
export function estimateTextTo3dFullCost(body = {}, opts = {}) {
  const autoRefine = opts.autoRefine !== false && body.auto_refine !== false;
  if (!autoRefine) return estimateTextTo3dPreviewCost(body);
  return estimateTextTo3dPreviewCost(body) + MESHY_CREDIT_COSTS.TEXT_TO_3D_REFINE;
}

/**
 * Estimate credits for image-to-3D.
 * @param {Record<string, unknown>} [body]
 */
export function estimateImageTo3dCost(body = {}) {
  const shouldTexture = body.should_texture !== false && body.enable_pbr !== false;
  return shouldTexture
    ? MESHY_CREDIT_COSTS.IMAGE_TO_3D_TEXTURED
    : MESHY_CREDIT_COSTS.IMAGE_TO_3D_MESH;
}

/**
 * @param {string} operation
 * @param {Record<string, unknown>} [body]
 */
export function estimateMeshyOperationCost(operation, body = {}) {
  switch (String(operation || '').toLowerCase()) {
    case 'text-to-3d-preview':
      return estimateTextTo3dPreviewCost(body);
    case 'text-to-3d-refine':
      return MESHY_CREDIT_COSTS.TEXT_TO_3D_REFINE;
    case 'text-to-3d-full':
    case 'text-to-3d':
      return estimateTextTo3dFullCost(body);
    case 'image-to-3d':
      return estimateImageTo3dCost(body);
    case 'multi-image-to-3d':
      return body.should_texture === false
        ? MESHY_CREDIT_COSTS.MULTI_IMAGE_TO_3D_MESH
        : MESHY_CREDIT_COSTS.MULTI_IMAGE_TO_3D_TEXTURED;
    case 'retexture':
      return MESHY_CREDIT_COSTS.RETEXTURE;
    case 'remesh':
      return MESHY_CREDIT_COSTS.REMESH;
    case 'rigging':
      return MESHY_CREDIT_COSTS.RIGGING;
    case 'animation':
      return MESHY_CREDIT_COSTS.ANIMATION;
    default:
      return MESHY_CREDIT_COSTS.TEXT_TO_3D_FULL_CONSERVATIVE;
  }
}
