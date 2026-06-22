export type MeshyPhase = 'preview' | 'refine';

export type MeshySettings = {
  prompt: string;
  ai_model: string;
  model_type: 'standard' | 'lowpoly';
  topology: 'triangle' | 'quad';
  target_polycount: number;
  polycount_mode: 'fixed' | 'adaptive';
  should_remesh: boolean;
  enable_pbr: boolean;
  hd_texture: boolean;
  remove_lighting: boolean;
  moderation: boolean;
  auto_size: boolean;
  experimental_turbo: boolean;
  target_formats: string[];
  preview_task_id: string;
  texture_prompt: string;
};

export const DEFAULT_MESHY_SETTINGS: MeshySettings = {
  prompt: '',
  ai_model: 'meshy-6',
  model_type: 'standard',
  topology: 'triangle',
  target_polycount: 5000,
  polycount_mode: 'fixed',
  should_remesh: true,
  enable_pbr: true,
  hd_texture: true,
  remove_lighting: true,
  moderation: false,
  auto_size: true,
  experimental_turbo: false,
  target_formats: ['glb'],
  preview_task_id: '',
  texture_prompt: '',
};

export function estimatePreviewCost(settings: MeshySettings): number {
  if (settings.model_type === 'lowpoly' || settings.ai_model.includes('meshy-6')) return 20;
  return 5;
}

export function estimateRefineCost(): number {
  return 10;
}

export function buildMeshyPreviewBody(settings: MeshySettings) {
  return {
    prompt: settings.prompt.trim(),
    ai_model: settings.ai_model,
    model_type: settings.model_type,
    topology: settings.topology,
    target_polycount: settings.target_polycount,
    should_remesh: settings.should_remesh,
    target_formats: settings.target_formats,
    moderation: settings.moderation,
    auto_size: settings.auto_size,
    enable_pbr: settings.enable_pbr,
  };
}

export function buildMeshyRefineBody(settings: MeshySettings) {
  return {
    preview_task_id: settings.preview_task_id.trim(),
    texture_prompt: settings.texture_prompt.trim() || settings.prompt.trim(),
    enable_pbr: settings.enable_pbr,
    ai_model: settings.ai_model,
    target_formats: settings.target_formats,
    remove_lighting: settings.remove_lighting,
    moderation: settings.moderation,
    auto_size: settings.auto_size,
  };
}

export function buildCurl(method: string, path: string, body?: unknown, apiKey = 'YOUR_MESHY_API_KEY') {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com';
  const lines = [`curl -X ${method} '${origin}${path}' \\`, `  -H 'Content-Type: application/json' \\`];
  if (path.includes('meshy.ai') || apiKey !== 'YOUR_MESHY_API_KEY') {
    lines.push(`  -H 'Authorization: Bearer ${apiKey}' \\`);
  }
  if (body) {
    lines.push(`  -d '${JSON.stringify(body, null, 2).replace(/'/g, "'\\''")}'`);
  } else {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, '');
  }
  return lines.join('\n');
}
