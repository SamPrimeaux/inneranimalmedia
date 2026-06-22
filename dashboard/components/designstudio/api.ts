/** Design Studio CAD API client — blueprints, jobs, OpenSCAD, Meshy. */

export type BlueprintRow = {
  id: number | string;
  title: string;
  description?: string | null;
  original_prompt?: string | null;
  status?: string;
  cad_script?: string | null;
  cad_engine?: string | null;
  sketch_json?: string | null;
  intent_json?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CadJobRow = {
  id: string;
  engine: string;
  prompt?: string;
  status: string;
  progress_pct?: number;
  error?: string | null;
  public_url?: string | null;
  r2_key?: string | null;
  result_url?: string | null;
  workspace_id?: string | null;
  scene_snapshot_id?: string | null;
  project_id?: string | null;
  created_at?: number;
  updated_at?: number;
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err =
      typeof (data as { error?: string }).error === 'string'
        ? (data as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(err);
  }
  return data as T;
}

export async function fetchBlueprints(limit = 50): Promise<BlueprintRow[]> {
  const data = await jsonFetch<{ blueprints?: BlueprintRow[] }>(
    `/api/designstudio/blueprints?limit=${limit}`,
  );
  return Array.isArray(data.blueprints) ? data.blueprints : [];
}

export async function createBlueprint(body: {
  title: string;
  description?: string;
  original_prompt?: string;
  sketch_json?: unknown;
  tags?: string[];
}): Promise<BlueprintRow> {
  const data = await jsonFetch<{ blueprint: BlueprintRow }>('/api/designstudio/blueprints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return data.blueprint;
}

export async function patchBlueprint(
  id: string | number,
  body: Record<string, unknown>,
): Promise<BlueprintRow> {
  const data = await jsonFetch<{ blueprint: BlueprintRow }>(
    `/api/designstudio/blueprints/${encodeURIComponent(String(id))}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return data.blueprint;
}

export async function fetchCadJobs(limit = 20): Promise<CadJobRow[]> {
  const data = await jsonFetch<{ jobs?: CadJobRow[] }>(`/api/cad/jobs?limit=${limit}`);
  return Array.isArray(data.jobs) ? data.jobs : [];
}

export async function fetchCadJob(jobId: string): Promise<CadJobRow> {
  const data = await jsonFetch<{ job: CadJobRow }>(`/api/cad/jobs/${encodeURIComponent(jobId)}`);
  return data.job;
}

export async function generateOpenScad(body: {
  prompt: string;
  session_id?: string;
  scene_snapshot_id?: string;
  blueprint_id?: string;
}): Promise<{ job_id: string; status: string; script?: string }> {
  return jsonFetch('/api/cad/openscad/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function executeCadJob(
  jobId: string,
  body?: { session_id?: string; scene_snapshot_id?: string; blueprint_id?: string },
): Promise<{ ok: boolean; job_id: string; status: string }> {
  return jsonFetch(`/api/cad/jobs/${encodeURIComponent(jobId)}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

export async function generateMeshy(body: {
  prompt?: string;
  mode?: 'text' | 'image';
  image_url?: string;
  session_id?: string;
  scene_snapshot_id?: string;
  blueprint_id?: string;
  ai_model?: string;
  model_type?: string;
  topology?: string;
  target_polycount?: number;
  should_remesh?: boolean;
  should_texture?: boolean;
  target_formats?: string[];
  auto_refine?: boolean;
  enable_pbr?: boolean;
  moderation?: boolean;
  auto_size?: boolean;
}): Promise<{ job_id: string; status: string; task_id?: string }> {
  return jsonFetch('/api/cad/meshy/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function pollMeshyStatus(jobId: string): Promise<{
  job_id: string;
  status: string;
  public_url?: string;
  progress_pct?: number;
}> {
  return jsonFetch(`/api/cad/meshy/status/${encodeURIComponent(jobId)}`);
}

export async function fetchMeshyBalance(): Promise<{ balance: number; stub?: boolean }> {
  return jsonFetch('/api/cad/meshy/balance');
}

export async function meshyRigging(body: {
  input_task_id?: string;
  model_task_id?: string;
  model_url?: string;
  height_meters?: number;
  session_id?: string;
  scene_snapshot_id?: string;
}): Promise<{ job_id: string; task_id: string; status: string }> {
  return jsonFetch('/api/cad/meshy/rigging', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function meshyCreateTask(body: {
  task_type: string;
  session_id?: string;
  scene_snapshot_id?: string;
  [key: string]: unknown;
}): Promise<{ job_id: string; task_id: string; status: string; external_task_id?: string }> {
  return jsonFetch('/api/cad/meshy/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchMeshyAnimationLibrary(): Promise<{
  animations?: { action_id?: number; name?: string; category?: string }[];
}> {
  return jsonFetch('/api/cad/meshy/animations/library');
}

export async function meshyTextTo3dPreview(body: Record<string, unknown>): Promise<{
  job_id: string;
  task_id: string;
  status: string;
}> {
  return jsonFetch('/api/cad/meshy/text-to-3d/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function meshyTextTo3dRefine(body: {
  preview_task_id: string;
  enable_pbr?: boolean;
  texture_prompt?: string;
}): Promise<{ job_id: string; task_id: string; status: string }> {
  return jsonFetch('/api/cad/meshy/text-to-3d/refine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
