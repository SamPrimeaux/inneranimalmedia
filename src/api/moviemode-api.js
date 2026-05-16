/**
 * MovieMode / media registry API — metadata only (no render in Worker).
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';

async function requireAuth(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return { error: jsonResponse({ error: 'Unauthorized' }, 401) };
  const workspaceId = authUser.active_workspace_id || authUser.workspace_id || null;
  const tenantId = authUser.tenant_id || authUser.active_tenant_id || null;
  if (!workspaceId || !tenantId) {
    return { error: jsonResponse({ error: 'workspace_id and tenant_id required' }, 400) };
  }
  return { authUser, workspaceId: String(workspaceId), tenantId: String(tenantId) };
}

export function buildMoviemodeR2Prefix(workspaceId, projectSlug) {
  return `moviemode/${workspaceId}/${projectSlug}`;
}

export async function handleMoviemodeApi(request, url, env) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const method = (request.method || 'GET').toUpperCase();
  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  const { workspaceId, tenantId } = auth;

  if (path === '/api/moviemode/projects' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM moviemode_projects WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 100`,
    )
      .bind(workspaceId)
      .all();
    return jsonResponse({ projects: results || [] });
  }

  if (path === '/api/moviemode/projects' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const slug = String(body.slug || '').trim();
    const title = String(body.title || '').trim();
    if (!slug || !title) return jsonResponse({ error: 'slug and title required' }, 400);
    const id = `mmproj_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const r2_prefix = buildMoviemodeR2Prefix(workspaceId, slug);
    await env.DB.prepare(
      `INSERT INTO moviemode_projects (id, tenant_id, workspace_id, slug, title, client_name, brief_text, brand_json, target_json, r2_prefix, plan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        tenantId,
        workspaceId,
        slug,
        title,
        body.client_name || null,
        body.brief_text || null,
        JSON.stringify(body.brand || {}),
        JSON.stringify(body.target || {}),
        r2_prefix,
        body.plan_id || null,
      )
      .run();
    return jsonResponse({ ok: true, id, r2_prefix });
  }

  const projectMatch = path.match(/^\/api\/moviemode\/projects\/([^/]+)$/);
  if (projectMatch && method === 'GET') {
    const id = decodeURIComponent(projectMatch[1]);
    const row = await env.DB.prepare(
      `SELECT * FROM moviemode_projects WHERE id = ? AND workspace_id = ? LIMIT 1`,
    )
      .bind(id, workspaceId)
      .first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    return jsonResponse({ project: row });
  }

  if (path === '/api/media/assets' && method === 'GET') {
    const projectId = url.searchParams.get('project_id');
    const stmt = projectId
      ? env.DB.prepare(
          `SELECT * FROM media_assets WHERE workspace_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 200`,
        ).bind(workspaceId, projectId)
      : env.DB.prepare(
          `SELECT * FROM media_assets WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 200`,
        ).bind(workspaceId);
    const { results } = await stmt.all();
    return jsonResponse({ assets: results || [] });
  }

  if (path === '/api/media/assets/register' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const bucket = String(body.bucket || '').trim();
    const object_key = String(body.object_key || body.key || '').trim();
    if (!bucket || !object_key) return jsonResponse({ error: 'bucket and object_key required' }, 400);
    const id = `asset_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await env.DB.prepare(
      `INSERT INTO media_assets (id, tenant_id, workspace_id, project_id, bucket, object_key, filename, content_type, media_kind, size_bytes, etag, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'registered')
       ON CONFLICT(workspace_id, bucket, object_key) DO UPDATE SET
         content_type = excluded.content_type,
         media_kind = excluded.media_kind,
         size_bytes = excluded.size_bytes,
         etag = excluded.etag,
         status = 'uploaded',
         updated_at = datetime('now')`,
    )
      .bind(
        id,
        tenantId,
        workspaceId,
        body.project_id || null,
        bucket,
        object_key,
        body.filename || object_key.split('/').pop(),
        body.content_type || null,
        body.media_kind || 'unknown',
        body.size_bytes ?? null,
        body.etag || null,
      )
      .run();
    return jsonResponse({ ok: true, id, bucket, object_key });
  }

  if (path === '/api/moviemode/render-jobs' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const projectId = String(body.project_id || '').trim();
    if (!projectId) return jsonResponse({ error: 'project_id required' }, 400);
    const id = `mmrender_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await env.DB.prepare(
      `INSERT INTO moviemode_render_jobs (id, tenant_id, workspace_id, project_id, timeline_id, renderer, status, input_json)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)`,
    )
      .bind(
        id,
        tenantId,
        workspaceId,
        projectId,
        body.timeline_id || null,
        body.renderer || 'remotion',
        JSON.stringify(body.input || {}),
      )
      .run();
    return jsonResponse({ ok: true, id, status: 'queued' });
  }

  const renderMatch = path.match(/^\/api\/moviemode\/render-jobs\/([^/]+)$/);
  if (renderMatch && method === 'PATCH') {
    const id = decodeURIComponent(renderMatch[1]);
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    await env.DB.prepare(
      `UPDATE moviemode_render_jobs SET
        status = COALESCE(?, status),
        progress_pct = COALESCE(?, progress_pct),
        output_json = COALESCE(?, output_json),
        error_message = COALESCE(?, error_message),
        completed_at = CASE WHEN ? IN ('complete','failed','cancelled') THEN datetime('now') ELSE completed_at END,
        updated_at = datetime('now')
       WHERE id = ? AND workspace_id = ?`,
    )
      .bind(
        body.status || null,
        body.progress_pct ?? null,
        body.output_json != null ? JSON.stringify(body.output_json) : null,
        body.error_message || null,
        body.status || null,
        id,
        workspaceId,
      )
      .run();
    return jsonResponse({ ok: true, id });
  }

  if (path === '/api/moviemode/timelines' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const projectId = String(body.project_id || '').trim();
    if (!projectId) return jsonResponse({ error: 'project_id required' }, 400);
    const id = `mmtl_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const timelineJson = JSON.stringify(body.timeline_json || body.timeline || {});
    await env.DB.prepare(
      `INSERT INTO moviemode_timelines (id, tenant_id, workspace_id, project_id, version, renderer, fps, width, height, duration_frames, timeline_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        tenantId,
        workspaceId,
        projectId,
        body.version ?? 1,
        body.renderer || 'remotion',
        body.fps ?? 30,
        body.width ?? 1920,
        body.height ?? 1080,
        body.duration_frames ?? null,
        timelineJson,
      )
      .run();
    return jsonResponse({ ok: true, id });
  }

  return jsonResponse({ error: 'MovieMode route not matched' }, 404);
}
