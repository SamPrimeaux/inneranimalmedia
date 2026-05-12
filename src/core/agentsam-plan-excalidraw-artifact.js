/**
 * Persist plan map as Excalidraw JSON in R2 + agentsam_artifacts (D1).
 */

import { pragmaTableInfo } from './retention.js';
import { buildExcalidrawPlanScene } from './agentsam-excalidraw-plan.js';

function newArtifactId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return `art_${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function iamOrigin(env) {
  const o = env?.IAM_ORIGIN != null ? String(env.IAM_ORIGIN).trim().replace(/\/$/, '') : '';
  return o || 'https://inneranimalmedia.com';
}

/**
 * @param {any} env
 * @param {{ tenantId: string, workspaceId: string, userId: string, planId: string }} p
 * @returns {Promise<{ artifact_id: string, r2_key: string, public_url: string, plan_id: string, open_url: string }>}
 */
export async function createPlanExcalidrawArtifact(env, p) {
  if (!env?.DB) throw new Error('DB not available');
  const tenantId = String(p.tenantId || '').trim();
  const workspaceId = String(p.workspaceId || '').trim();
  const userId = String(p.userId || '').trim();
  const planId = String(p.planId || '').trim();
  if (!tenantId) throw new Error('tenant_id required');
  if (!workspaceId) throw new Error('workspace_id required');
  if (!userId) throw new Error('user_id required');
  if (!planId) throw new Error('plan_id required');
  if (!env.DASHBOARD || typeof env.DASHBOARD.put !== 'function') {
    throw new Error('DASHBOARD R2 binding not available');
  }

  const plan = await env.DB.prepare(`SELECT * FROM agentsam_plans WHERE id = ? LIMIT 1`).bind(planId).first();
  if (!plan?.id) throw new Error('plan not found');
  if (String(plan.tenant_id || '').trim() !== tenantId) throw new Error('plan tenant mismatch');
  const planWs = String(plan.workspace_id || '').trim();
  if (planWs && planWs !== workspaceId) throw new Error('plan workspace mismatch');

  const { results: taskRows } = await env.DB
    .prepare(`SELECT * FROM agentsam_plan_tasks WHERE plan_id = ? ORDER BY order_index ASC, id ASC`)
    .bind(planId)
    .all();
  const tasks = taskRows || [];

  const scene = buildExcalidrawPlanScene({ plan, tasks });
  const json = JSON.stringify(scene);
  const bytes = new TextEncoder().encode(json);
  const r2Key = `agentsam/plans/${workspaceId}/${planId}/plan-map.excalidraw`;

  await env.DASHBOARD.put(r2Key, json, {
    httpMetadata: { contentType: 'application/json' },
  });

  const cols = await pragmaTableInfo(env.DB, 'agentsam_artifacts');
  if (!cols.size) throw new Error('agentsam_artifacts table missing');

  const artifactId = newArtifactId();
  const planTitle = String(plan.title || 'Plan').slice(0, 400);
  const name = `${planTitle} - Plan Map`.slice(0, 500);
  const origin = iamOrigin(env);
  const publicUrl = `${origin}/api/artifacts/${encodeURIComponent(artifactId)}/content`;

  const row = {
    id: artifactId,
    user_id: userId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    name,
    description: `Excalidraw plan map for ${planId}`,
    artifact_type: 'excalidraw',
    r2_key: r2Key,
    public_url: publicUrl,
    source: 'agentsam_plan',
    tags: JSON.stringify(['plan', 'excalidraw', 'agentsam']),
    file_size_bytes: bytes.byteLength,
    is_public: 0,
  };

  if (cols.has('metadata_json')) {
    row.metadata_json = JSON.stringify({ plan_id: planId, kind: 'plan_map' });
  }

  const names = [];
  const ph = [];
  const binds = [];
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    const kl = k.toLowerCase();
    if (!cols.has(kl)) continue;
    names.push(k);
    ph.push('?');
    binds.push(v);
  }
  if (!names.length) throw new Error('agentsam_artifacts: no insertable columns');

  await env.DB
    .prepare(`INSERT INTO agentsam_artifacts (${names.join(', ')}) VALUES (${ph.join(', ')})`)
    .bind(...binds)
    .run();

  return {
    artifact_id: artifactId,
    r2_key: r2Key,
    public_url: publicUrl,
    open_url: publicUrl,
    plan_id: planId,
  };
}
