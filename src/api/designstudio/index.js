/**
 * DesignStudio API — modular entry (worker + src/index).
 * SSE live stream is owned by AGENT_SESSION DO; this module only proxies GET .../events.
 */
import {
  getAuthUser,
  jsonResponse,
  fetchAuthUserTenantId,
  fallbackSystemTenantId,
} from '../../core/auth.js';
import { syncRunToSupabase, buildCadCreationsPrefix } from './sync.js';

const WORKFLOW_RUNS = 'agentsam_workflow_runs';
const BLUEPRINTS = 'designstudio_design_blueprints';
const MCP_WORKFLOWS = 'agentsam_mcp_workflows';
const WORKSPACE_TABLE = 'agentsam_workspace';
/** Matches D1 default on designstudio_design_blueprints.workspace_id */
const DEFAULT_WS = 'ws_inneranimalmedia';

async function resolveWorkspaceId(env, tenantId, explicit) {
  const ex = explicit != null && String(explicit).trim() !== '' ? String(explicit).trim() : null;
  if (ex) return ex;
  if (!env?.DB) return DEFAULT_WS;
  try {
    const row = await env.DB.prepare(
      `SELECT id FROM ${WORKSPACE_TABLE} WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(tenantId)
      .first();
    return row?.id ? String(row.id) : DEFAULT_WS;
  } catch (_) {
    return DEFAULT_WS;
  }
}

function internalSecretOk(request, env) {
  const secret = env?.INTERNAL_API_SECRET;
  if (!secret || !String(secret).trim()) return false;
  const authHeader = request.headers.get('Authorization') || request.headers.get('X-Internal-Secret') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  return token === String(secret).trim();
}

async function resolveTenantId(env, authUser) {
  if (authUser.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
    return String(authUser.tenant_id).trim();
  }
  let tid = await fetchAuthUserTenantId(env, authUser.id);
  if (tid) return tid;
  if (authUser.email) {
    tid = await fetchAuthUserTenantId(env, authUser.email);
    if (tid) return tid;
  }
  return fallbackSystemTenantId(env);
}

function supabaseRestBase(env) {
  const raw = env?.SUPABASE_URL;
  if (!raw || !String(raw).trim()) throw new Error('SUPABASE_URL is not configured');
  return String(raw).replace(/\/$/, '');
}

function supabasePublicHeaders(env, extra = {}) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !String(key).trim()) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  const k = String(key).trim();
  return {
    apikey: k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra,
  };
}

async function sha256hex(message) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacBytes(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function hmacHex(key, message) {
  const bytes = await hmacBytes(key, message);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getSigningKey(secret, date, region, service) {
  const kDate = await hmacBytes('AWS4' + secret, date);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, 'aws4_request');
}

function getR2S3Host(env) {
  if (!env.CLOUDFLARE_ACCOUNT_ID) return null;
  return `${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

async function presignR2GetObjectUrl(env, bucket, key, expiresSeconds = 3600) {
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  const host = getR2S3Host(env);
  if (!accessKey || !secretKey || !host) return null;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const encodedKey = String(key)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  });

  const sortedPairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const canonicalQueryString = sortedPairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canonicalRequest = [
    'GET',
    `/${bucket}/${encodedKey}`,
    canonicalQueryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256hex(canonicalRequest)].join('\n');
  const signingKey = await getSigningKey(secretKey, dateStamp, 'auto', 's3');
  const signature = await hmacHex(signingKey, stringToSign);

  return `https://${host}/${bucket}/${encodedKey}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 * @param {any} _ctx
 */
export async function handleDesignStudioApi(request, url, env, _ctx) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = (request.method || 'GET').toUpperCase();

  try {
    const eventsMatch = pathLower.match(/^\/api\/designstudio\/runs\/([^/]+)\/events$/);
    if (eventsMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const runId = eventsMatch[1];
      const tenantId = await resolveTenantId(env, authUser);
      const run = await env.DB.prepare(
        `SELECT r.id, r.session_id
         FROM ${WORKFLOW_RUNS} r
         INNER JOIN ${WORKSPACE_TABLE} w ON w.id = r.workspace_id
         WHERE r.id = ? AND w.tenant_id = ?
         LIMIT 1`,
      )
        .bind(runId, tenantId)
        .first();
      if (!run) {
        return jsonResponse({ error: 'Not found' }, 404);
      }
      let sessionId = (url.searchParams.get('session_id') || '').trim();
      if (!sessionId && run.session_id) sessionId = String(run.session_id).trim();
      if (!sessionId) {
        return jsonResponse({ error: 'session_id required' }, 400);
      }
      if (!env.AGENT_SESSION) return jsonResponse({ error: 'AGENT_SESSION not configured' }, 503);
      const stub = env.AGENT_SESSION.get(env.AGENT_SESSION.idFromName(sessionId));
      const doUrl = new URL(request.url);
      doUrl.pathname = '/designstudio/events';
      doUrl.search = '';
      doUrl.searchParams.set('run_id', runId);
      const lastId = url.searchParams.get('last_id');
      if (lastId) doUrl.searchParams.set('last_id', lastId);
      return stub.fetch(new Request(doUrl.toString(), { headers: request.headers }));
    }

    if (pathLower === '/api/designstudio/blueprints' && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const statusFilter = (url.searchParams.get('status') || '').trim();
      const limitRaw = parseInt(url.searchParams.get('limit') || '50', 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
      let sql = `SELECT * FROM ${BLUEPRINTS} WHERE tenant_id = ?`;
      const binds = [tenantId];
      if (statusFilter) {
        sql += ` AND status = ?`;
        binds.push(statusFilter);
      }
      sql += ` ORDER BY created_at DESC LIMIT ?`;
      binds.push(limit);
      const { results } = await env.DB.prepare(sql).bind(...binds).all();
      return jsonResponse({ blueprints: results || [] }, 200);
    }

    if (pathLower === '/api/designstudio/blueprints' && method === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      let body = {};
      try {
        body = await request.json();
      } catch (_) {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }
      const title = String(body.title || '').trim();
      if (!title) return jsonResponse({ error: 'title required' }, 400);
      const workspaceId = await resolveWorkspaceId(env, tenantId, body.workspace_id);
      const sketchJson =
        typeof body.sketch_json === 'object' && body.sketch_json !== null
          ? JSON.stringify(body.sketch_json)
          : typeof body.sketch_json === 'string'
            ? body.sketch_json
            : '{}';
      const tagsJson = Array.isArray(body.tags)
        ? JSON.stringify(body.tags)
        : typeof body.tags === 'string'
          ? body.tags
          : '[]';
      const row = await env.DB.prepare(
        `INSERT INTO ${BLUEPRINTS}
           (tenant_id, workspace_id, title, description, original_prompt, sketch_json, tags, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
         RETURNING *`,
      )
        .bind(
          tenantId,
          workspaceId,
          title,
          body.description != null ? String(body.description) : null,
          body.original_prompt != null ? String(body.original_prompt) : null,
          sketchJson,
          tagsJson,
        )
        .first();
      return jsonResponse({ blueprint: row }, 201);
    }

    const bpOneMatch = pathLower.match(/^\/api\/designstudio\/blueprints\/([^/]+)$/);
    if (bpOneMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const row = await env.DB.prepare(`SELECT * FROM ${BLUEPRINTS} WHERE id = ? AND tenant_id = ?`)
        .bind(bpOneMatch[1], tenantId)
        .first();
      if (!row) return jsonResponse({ error: 'Not found' }, 404);
      return jsonResponse({ blueprint: row }, 200);
    }

    if (bpOneMatch && method === 'PATCH') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      let body = {};
      try {
        body = await request.json();
      } catch (_) {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }
      const existing = await env.DB.prepare(`SELECT id FROM ${BLUEPRINTS} WHERE id = ? AND tenant_id = ?`)
        .bind(bpOneMatch[1], tenantId)
        .first();
      if (!existing) return jsonResponse({ error: 'Not found' }, 404);
      const sets = [];
      const vals = [];
      const push = (col, v) => {
        sets.push(`${col} = ?`);
        vals.push(v);
      };
      if (body.title != null) push('title', String(body.title));
      if (body.description !== undefined) push('description', body.description != null ? String(body.description) : null);
      if (body.original_prompt !== undefined) push('original_prompt', body.original_prompt != null ? String(body.original_prompt) : null);
      if (body.intent_json !== undefined) {
        push(
          'intent_json',
          typeof body.intent_json === 'object' ? JSON.stringify(body.intent_json) : String(body.intent_json || '{}'),
        );
      }
      if (body.sketch_json !== undefined) {
        push(
          'sketch_json',
          typeof body.sketch_json === 'object' ? JSON.stringify(body.sketch_json) : String(body.sketch_json || '{}'),
        );
      }
      if (body.tags !== undefined) {
        push(
          'tags',
          Array.isArray(body.tags) ? JSON.stringify(body.tags) : String(body.tags ?? '[]'),
        );
      }
      if (body.notes !== undefined) push('notes', body.notes != null ? String(body.notes) : null);
      if (body.cad_script !== undefined) push('cad_script', body.cad_script != null ? String(body.cad_script) : null);
      if (body.cad_engine !== undefined) push('cad_engine', body.cad_engine != null ? String(body.cad_engine) : null);
      if (body.status != null) push('status', String(body.status));
      if (!sets.length) return jsonResponse({ error: 'No fields to update' }, 400);
      sets.push(`updated_at = datetime('now')`);
      vals.push(bpOneMatch[1], tenantId);
      await env.DB.prepare(`UPDATE ${BLUEPRINTS} SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
      const row = await env.DB.prepare(`SELECT * FROM ${BLUEPRINTS} WHERE id = ?`).bind(bpOneMatch[1]).first();
      return jsonResponse({ blueprint: row }, 200);
    }

    if (pathLower === '/api/designstudio/runs' && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const blueprintId = (url.searchParams.get('blueprint_id') || '').trim();
      const limitRaw = parseInt(url.searchParams.get('limit') || '20', 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
      let sql = `SELECT r.* FROM ${WORKFLOW_RUNS} r
        INNER JOIN ${WORKSPACE_TABLE} w ON w.id = r.workspace_id
        WHERE w.tenant_id = ? AND r.workflow_key LIKE 'designstudio%'`;
      const binds = [tenantId];
      if (blueprintId) {
        sql += ` AND json_extract(r.input_json, '$.blueprint_id') = ?`;
        binds.push(blueprintId);
      }
      sql += ` ORDER BY r.started_at DESC LIMIT ?`;
      binds.push(limit);
      const { results } = await env.DB.prepare(sql).bind(...binds).all();
      return jsonResponse({ runs: results || [] }, 200);
    }

    if (pathLower === '/api/designstudio/runs' && method === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const userId = authUser.id != null ? String(authUser.id).trim() : null;
      let body = {};
      try {
        body = await request.json();
      } catch (_) {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }
      const blueprintId = String(body.blueprint_id || '').trim();
      if (!blueprintId) return jsonResponse({ error: 'blueprint_id required' }, 400);
      const blueprint = await env.DB.prepare(
        `SELECT * FROM ${BLUEPRINTS} WHERE id = ? AND tenant_id = ? LIMIT 1`,
      )
        .bind(blueprintId, tenantId)
        .first();
      if (!blueprint) return jsonResponse({ error: 'Not found' }, 404);
      const wf = await env.DB.prepare(
        `SELECT id, workflow_key FROM ${MCP_WORKFLOWS}
         WHERE workflow_key LIKE 'designstudio%' AND COALESCE(is_active, 0) = 1
         LIMIT 1`,
      ).first();
      if (!wf?.id || !wf.workflow_key) {
        return jsonResponse({ error: 'No active DesignStudio workflow configured' }, 503);
      }
      const workspaceId = await resolveWorkspaceId(env, tenantId, body.workspace_id ?? blueprint.workspace_id);
      const inputPayload = {
        blueprint_id: blueprintId,
        prompt: blueprint.original_prompt != null ? String(blueprint.original_prompt) : null,
      };
      const inputJson = JSON.stringify(inputPayload);
      const inserted = await env.DB.prepare(
        `INSERT INTO ${WORKFLOW_RUNS}
           (workflow_id, workflow_key, tenant_id, user_id, workspace_id,
            trigger_type, status, input_json, started_at, environment)
         VALUES (?, ?, ?, ?, ?, 'user', 'running', ?, unixepoch(), 'production')
         RETURNING id`,
      )
        .bind(
          String(wf.id),
          String(wf.workflow_key),
          tenantId,
          userId,
          workspaceId,
          inputJson,
        )
        .first();
      const newRunId = inserted?.id != null ? String(inserted.id) : null;
      if (!newRunId) return jsonResponse({ error: 'run_insert_failed' }, 500);
      await env.DB.prepare(
        `UPDATE ${BLUEPRINTS} SET latest_run_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
      )
        .bind(newRunId, blueprintId, tenantId)
        .run();
      return jsonResponse({ run_id: newRunId, status: 'running' }, 202);
    }

    const runOneMatch = pathLower.match(/^\/api\/designstudio\/runs\/([^/]+)$/);
    if (runOneMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const rid = runOneMatch[1];
      const row = await env.DB.prepare(
        `SELECT r.* FROM ${WORKFLOW_RUNS} r
         INNER JOIN ${WORKSPACE_TABLE} w ON w.id = r.workspace_id
         WHERE r.id = ? AND w.tenant_id = ?
         LIMIT 1`,
      )
        .bind(rid, tenantId)
        .first();
      if (!row) return jsonResponse({ error: 'Not found' }, 404);
      return jsonResponse({ run: row }, 200);
    }

    const presignMatch = pathLower.match(/^\/api\/designstudio\/assets\/([^/]+)\/presign\/([^/]+)$/);
    if (presignMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const runId = presignMatch[1];
      const assetType = presignMatch[2];
      const run = await env.DB.prepare(
        `SELECT r.id FROM ${WORKFLOW_RUNS} r
         INNER JOIN ${WORKSPACE_TABLE} w ON w.id = r.workspace_id
         WHERE r.id = ? AND w.tenant_id = ?
         LIMIT 1`,
      )
        .bind(runId, tenantId)
        .first();
      if (!run) return jsonResponse({ error: 'Not found' }, 404);
      const base = supabaseRestBase(env);
      const res = await fetch(
        `${base}/rest/v1/designstudio_asset_metrics?workflow_run_id=eq.${encodeURIComponent(runId)}&asset_type=eq.${encodeURIComponent(
          assetType,
        )}&select=*`,
        { headers: supabasePublicHeaders(env) },
      );
      const text = await res.text();
      let rows = [];
      try {
        rows = text ? JSON.parse(text) : [];
      } catch (_) {
        rows = [];
      }
      const asset = Array.isArray(rows) && rows.length ? rows[0] : null;
      if (!asset || !asset.r2_key) {
        return jsonResponse({ error: 'Not found' }, 404);
      }
      const key = String(asset.r2_key);
      const bucket = (url.searchParams.get('bucket') || '').trim() || 'autorag';
      const signed = await presignR2GetObjectUrl(env, bucket, key, 3600);
      if (!signed) {
        return jsonResponse({ error: 'presign_unavailable', r2_key: key, bucket }, 503);
      }
      return jsonResponse({ url: signed, r2_key: key, expires_in: 3600 }, 200);
    }

    const assetsMatch = pathLower.match(/^\/api\/designstudio\/assets\/([^/]+)$/);
    if (assetsMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const runId = assetsMatch[1];
      const run = await env.DB.prepare(
        `SELECT r.id FROM ${WORKFLOW_RUNS} r
         INNER JOIN ${WORKSPACE_TABLE} w ON w.id = r.workspace_id
         WHERE r.id = ? AND w.tenant_id = ?
         LIMIT 1`,
      )
        .bind(runId, tenantId)
        .first();
      if (!run) return jsonResponse({ error: 'Not found' }, 404);
      try {
        const base = supabaseRestBase(env);
        const res = await fetch(
          `${base}/rest/v1/designstudio_asset_metrics?workflow_run_id=eq.${encodeURIComponent(runId)}&select=*`,
          { headers: supabasePublicHeaders(env) },
        );
        const text = await res.text();
        const rows = text ? JSON.parse(text) : [];
        const ws = (url.searchParams.get('workspace_id') || '').trim() || DEFAULT_WS;
        const prefix = buildCadCreationsPrefix(tenantId, ws, runId);
        return jsonResponse({ workflow_run_id: runId, r2_prefix: prefix, assets: Array.isArray(rows) ? rows : [] }, 200);
      } catch (e) {
        const ws = (url.searchParams.get('workspace_id') || '').trim() || DEFAULT_WS;
        const prefix = buildCadCreationsPrefix(tenantId, ws, runId);
        return jsonResponse(
          { workflow_run_id: runId, r2_prefix: prefix, assets: [], supabase_error: String(e?.message || e) },
          200,
        );
      }
    }

    if (pathLower === '/api/internal/designstudio/sync-run' && method === 'POST') {
      if (!internalSecretOk(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      let body = {};
      try {
        const raw = await request.text();
        if (raw) body = JSON.parse(raw);
      } catch (_) {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }

      const runId = String(body.run_id || body.workflow_run_id || '').trim();
      if (!runId) return jsonResponse({ error: 'run_id required' }, 400);

      const assets = Array.isArray(body.assets) ? body.assets : [];
      const r2Prefix = body.r2_prefix != null ? String(body.r2_prefix).trim() : null;
      const sessionId = body.session_id != null ? String(body.session_id).trim() : null;
      const workspaceId = body.workspace_id != null ? String(body.workspace_id).trim() : undefined;
      const skipKeyCheck = body.skip_designstudio_key_check === true;

      const result = await syncRunToSupabase(env, runId, {
        sessionId: sessionId || null,
        r2Prefix: r2Prefix || null,
        assets,
        workspaceId,
        skipDesignStudioKeyCheck: skipKeyCheck,
      });

      return jsonResponse({ ok: true, ...result }, 200);
    }

    return jsonResponse({ error: 'DesignStudio route not found' }, 404);
  } catch (e) {
    const msg = String(e?.message || e);
    console.warn('[handleDesignStudioApi]', msg);
    return jsonResponse({ error: msg }, 500);
  }
}
