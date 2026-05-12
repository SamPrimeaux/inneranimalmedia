/**
 * Persist plan artifacts (Excalidraw JSON, Markdown) in R2 + agentsam_artifacts (D1).
 */

import { pragmaTableInfo } from './retention.js';
import { buildExcalidrawPlanScene } from './agentsam-excalidraw-plan.js';
import { buildPlanMarkdown } from './agentsam-plan-markdown.js';

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
 */
async function loadPlanAndTasksForArtifact(env, p) {
  const tenantId = String(p.tenantId || '').trim();
  const workspaceId = String(p.workspaceId || '').trim();
  const planId = String(p.planId || '').trim();
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
  return { plan, tasks };
}

/**
 * @param {any} env
 * @param {{
 *   userId: string,
 *   tenantId: string,
 *   workspaceId: string,
 *   planId: string,
 *   planTitle: string,
 *   r2Key: string,
 *   body: string,
 *   putContentType: string,
 *   artifactType: string,
 *   name: string,
 *   description: string,
 *   tags: string[],
 *   metadataKind: string,
 * }} row
 */
async function putR2AndInsertPlanArtifact(env, row) {
  const cols = await pragmaTableInfo(env.DB, 'agentsam_artifacts');
  if (!cols.size) throw new Error('agentsam_artifacts table missing');

  const bytes = new TextEncoder().encode(row.body);
  await env.DASHBOARD.put(row.r2Key, row.body, {
    httpMetadata: { contentType: row.putContentType },
  });

  const artifactId = newArtifactId();
  const origin = iamOrigin(env);
  const publicUrl = `${origin}/api/artifacts/${encodeURIComponent(artifactId)}/content`;

  const ins = {
    id: artifactId,
    user_id: row.userId,
    tenant_id: row.tenantId,
    workspace_id: row.workspaceId,
    name: row.name.slice(0, 500),
    description: row.description.slice(0, 2000),
    artifact_type: row.artifactType,
    r2_key: row.r2Key,
    public_url: publicUrl,
    source: 'agentsam_plan',
    tags: JSON.stringify(row.tags),
    file_size_bytes: bytes.byteLength,
    is_public: 0,
  };

  if (cols.has('metadata_json')) {
    ins.metadata_json = JSON.stringify({ plan_id: row.planId, kind: row.metadataKind });
  }

  const names = [];
  const ph = [];
  const binds = [];
  for (const [k, v] of Object.entries(ins)) {
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
    r2_key: row.r2Key,
    public_url: publicUrl,
    open_url: publicUrl,
    plan_id: row.planId,
  };
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

  const { plan, tasks } = await loadPlanAndTasksForArtifact(env, p);
  const scene = buildExcalidrawPlanScene({ plan, tasks });
  const json = JSON.stringify(scene);
  const r2Key = `agentsam/plans/${workspaceId}/${planId}/plan-map.excalidraw`;
  const planTitle = String(plan.title || 'Plan').slice(0, 400);

  return putR2AndInsertPlanArtifact(env, {
    userId,
    tenantId,
    workspaceId,
    planId,
    planTitle,
    r2Key,
    body: json,
    putContentType: 'application/json',
    artifactType: 'excalidraw',
    name: `${planTitle} - Plan Map`,
    description: `Excalidraw plan map for ${planId}`,
    tags: ['plan', 'excalidraw', 'agentsam'],
    metadataKind: 'plan_map',
  });
}

/**
 * @param {any} env
 * @param {{ tenantId: string, workspaceId: string, userId: string, planId: string }} p
 * @returns {Promise<{ artifact_id: string, r2_key: string, public_url: string, plan_id: string, open_url: string }>}
 */
export async function createPlanMarkdownArtifact(env, p) {
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

  const { plan, tasks } = await loadPlanAndTasksForArtifact(env, p);
  const md = buildPlanMarkdown({ plan, tasks });
  const r2Key = `agentsam/plans/${workspaceId}/${planId}/plan.md`;
  const planTitle = String(plan.title || 'Plan').slice(0, 400);

  return putR2AndInsertPlanArtifact(env, {
    userId,
    tenantId,
    workspaceId,
    planId,
    planTitle,
    r2Key,
    body: md,
    putContentType: 'text/markdown;charset=UTF-8',
    artifactType: 'markdown',
    name: `${planTitle} - Plan.md`,
    description: `Markdown plan export for ${planId}`,
    tags: ['plan', 'markdown', 'agentsam'],
    metadataKind: 'plan_markdown',
  });
}
