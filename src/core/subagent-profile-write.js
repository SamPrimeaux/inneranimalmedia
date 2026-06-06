/**
 * CRUD helpers for `agentsam_subagent_profile` (singular — not agentsam_subagent_profiles).
 */
import { pragmaTableInfo } from './retention.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

export function slugifySubagentLabel(label) {
  const s = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || 'subagent';
}

export function buildSubagentScopeSystemPromptLine() {
  return (
    'Subagents (enforced): custom profiles live in D1 table `agentsam_subagent_profile` (singular). ' +
    'Use tools `agentsam_list_agents`, `agentsam_get_agent` (slug), and `agentsam_create_subagent` — ' +
    'do not INSERT via raw d1_query. Required columns: user_id, workspace_id, slug, display_name; ' +
    'timestamps are created_at/updated_at (TEXT datetime), not updated_at_unix.'
  );
}

/**
 * @param {any} env
 * @param {{
 *   userId: string,
 *   workspaceId?: string|null,
 *   tenantId?: string|null,
 *   includePlatformGlobal?: boolean,
 * }} scope
 */
export async function listSubagentProfilesForScope(env, scope) {
  if (!env?.DB) return [];
  const userId = trim(scope.userId);
  const workspaceId = trim(scope.workspaceId);
  const tenantId = trim(scope.tenantId);
  if (!userId) return [];

  const includeGlobal = scope.includePlatformGlobal !== false;
  const sql = includeGlobal
    ? `SELECT id, slug, display_name, description, agent_type, default_model_id, is_active,
              sort_order, sandbox_mode, access_mode, user_id, workspace_id, tenant_id,
              COALESCE(is_platform_global, 0) AS is_platform_global
         FROM agentsam_subagent_profile
        WHERE is_active = 1
          AND (
            (user_id = ? AND COALESCE(workspace_id, '') = ?)
            OR (
              COALESCE(is_platform_global, 0) = 1
              AND (trim(COALESCE(workspace_id, '')) = '' OR COALESCE(workspace_id, '') = ?)
              AND (? = '' OR tenant_id IS NULL OR trim(COALESCE(tenant_id, '')) = '' OR tenant_id = ?)
            )
          )
        ORDER BY COALESCE(sort_order, 9999) ASC, display_name ASC
        LIMIT 50`
    : `SELECT id, slug, display_name, description, agent_type, default_model_id, is_active,
              sort_order, sandbox_mode, access_mode, user_id, workspace_id, tenant_id,
              COALESCE(is_platform_global, 0) AS is_platform_global
         FROM agentsam_subagent_profile
        WHERE is_active = 1
          AND user_id = ?
          AND COALESCE(workspace_id, '') = ?
        ORDER BY COALESCE(sort_order, 9999) ASC, display_name ASC
        LIMIT 50`;

  try {
    const out = includeGlobal
      ? await env.DB.prepare(sql)
          .bind(userId, workspaceId, workspaceId, tenantId, tenantId)
          .all()
      : await env.DB.prepare(sql).bind(userId, workspaceId).all();
    return out?.results || [];
  } catch (_) {
    return [];
  }
}

/**
 * @param {any} env
 * @param {{ userId: string, workspaceId?: string|null, tenantId?: string|null }} scope
 * @param {string} slug
 */
export async function getSubagentProfileBySlug(env, scope, slug) {
  if (!env?.DB) return null;
  const userId = trim(scope.userId);
  const workspaceId = trim(scope.workspaceId);
  const tenantId = trim(scope.tenantId);
  const slugKey = slugifySubagentLabel(slug);
  if (!userId || !slugKey) return null;

  try {
    const row = await env.DB.prepare(
      `SELECT *
         FROM agentsam_subagent_profile
        WHERE slug = ?
          AND is_active = 1
          AND (
            (user_id = ? AND COALESCE(workspace_id, '') = ?)
            OR (
              COALESCE(is_platform_global, 0) = 1
              AND (trim(COALESCE(workspace_id, '')) = '' OR COALESCE(workspace_id, '') = ?)
              AND (? = '' OR tenant_id IS NULL OR trim(COALESCE(tenant_id, '')) = '' OR tenant_id = ?)
            )
          )
        LIMIT 1`,
    )
      .bind(slugKey, userId, workspaceId, workspaceId, tenantId, tenantId)
      .first();
    return row || null;
  } catch {
    return null;
  }
}

function pickTimestampLiterals(cols) {
  const hasTextCreated = cols.has('created_at');
  const hasTextUpdated = cols.has('updated_at');
  const hasUnixCreated = cols.has('created_at_unix');
  const hasUnixUpdated = cols.has('updated_at_unix');
  const nowText = "datetime('now')";
  const nowUnix = Math.floor(Date.now() / 1000);
  return {
    createdCol: hasTextCreated ? 'created_at' : hasUnixCreated ? 'created_at_unix' : null,
    updatedCol: hasTextUpdated ? 'updated_at' : hasUnixUpdated ? 'updated_at_unix' : null,
    createdVal: hasTextCreated ? nowText : hasUnixCreated ? nowUnix : null,
    updatedVal: hasTextUpdated ? nowText : hasUnixUpdated ? nowUnix : null,
  };
}

/**
 * @param {any} env
 * @param {{ userId: string, workspaceId?: string|null, tenantId?: string|null }} scope
 * @param {Record<string, unknown>} input
 */
export async function createSubagentProfile(env, scope, input) {
  if (!env?.DB) return { ok: false, error: 'DB not configured' };
  const userId = trim(scope.userId);
  const workspaceId = trim(scope.workspaceId);
  const tenantId = trim(scope.tenantId) || null;
  if (!userId) return { ok: false, error: 'user_id required' };

  const displayName =
    typeof input.display_name === 'string' && input.display_name.trim()
      ? input.display_name.trim().slice(0, 120)
      : '';
  if (!displayName) return { ok: false, error: 'display_name required' };

  const slugRaw =
    typeof input.slug === 'string' && input.slug.trim()
      ? input.slug.trim()
      : slugifySubagentLabel(displayName);
  const slug = slugifySubagentLabel(slugRaw);
  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : `asp_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  const cols = await pragmaTableInfo(env.DB, 'agentsam_subagent_profile');
  if (!cols.size) {
    return { ok: false, error: 'agentsam_subagent_profile table missing' };
  }

  const ts = pickTimestampLiterals(cols);
  const fields = {
    id,
    user_id: userId,
    workspace_id: workspaceId,
    tenant_id: tenantId,
    slug,
    display_name: displayName,
    description: typeof input.description === 'string' ? input.description : '',
    instructions_markdown:
      typeof input.instructions_markdown === 'string' ? input.instructions_markdown : '',
    allowed_tool_globs:
      typeof input.allowed_tool_globs === 'string'
        ? input.allowed_tool_globs
        : Array.isArray(input.allowed_tool_globs)
          ? JSON.stringify(input.allowed_tool_globs)
          : null,
    default_model_id:
      input.default_model_id != null && trim(input.default_model_id) !== ''
        ? trim(input.default_model_id)
        : null,
    is_active: 1,
    personality_tone:
      typeof input.personality_tone === 'string' && input.personality_tone.trim()
        ? input.personality_tone.trim().slice(0, 64)
        : 'professional',
    access_mode:
      input.access_mode === 'read_only' || input.access_mode === 'read_write'
        ? input.access_mode
        : 'read_write',
    sandbox_mode:
      typeof input.sandbox_mode === 'string' && input.sandbox_mode.trim()
        ? input.sandbox_mode.trim().slice(0, 64)
        : 'workspace-write',
    model_reasoning_effort:
      typeof input.model_reasoning_effort === 'string' && input.model_reasoning_effort.trim()
        ? input.model_reasoning_effort.trim().slice(0, 32)
        : 'medium',
    agent_type:
      typeof input.agent_type === 'string' && input.agent_type.trim()
        ? input.agent_type.trim().slice(0, 64)
        : 'custom',
    run_in_background:
      input.run_in_background === true || input.run_in_background === 1 || input.run_in_background === '1'
        ? 1
        : 0,
    sort_order:
      input.sort_order != null && Number.isFinite(Number(input.sort_order))
        ? Number(input.sort_order)
        : 100,
    is_platform_global: 0,
  };

  const insertCols = [];
  const placeholders = [];
  const binds = [];
  for (const [col, val] of Object.entries(fields)) {
    if (!cols.has(col)) continue;
    insertCols.push(col);
    placeholders.push('?');
    binds.push(val);
  }
  if (ts.createdCol && !insertCols.includes(ts.createdCol)) {
    insertCols.push(ts.createdCol);
    if (typeof ts.createdVal === 'number') {
      placeholders.push('?');
      binds.push(ts.createdVal);
    } else {
      placeholders.push(String(ts.createdVal));
    }
  }
  if (ts.updatedCol && !insertCols.includes(ts.updatedCol)) {
    insertCols.push(ts.updatedCol);
    if (typeof ts.updatedVal === 'number') {
      placeholders.push('?');
      binds.push(ts.updatedVal);
    } else {
      placeholders.push(String(ts.updatedVal));
    }
  }

  if (!insertCols.length) {
    return { ok: false, error: 'no_insertable_columns' };
  }

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_subagent_profile (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})`,
    )
      .bind(...binds)
      .run();
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (msg.includes('UNIQUE') || msg.includes('constraint')) {
      return { ok: false, error: 'slug_already_exists', slug };
    }
    return { ok: false, error: msg };
  }

  const created = await getSubagentProfileBySlug(env, scope, slug);
  return { ok: true, id, slug, subagent: created };
}

/**
 * Auto-provision minimal default profile when workspace has none.
 * @param {any} env
 * @param {{ userId: string, workspaceId: string, tenantId?: string|null }} scope
 */
export async function ensureDefaultSubagentProfile(env, scope) {
  const userId = trim(scope.userId);
  const workspaceId = trim(scope.workspaceId);
  if (!env?.DB || !userId || !workspaceId) {
    return { ok: false, profiles: [], createdDefault: false, reason: 'missing_scope' };
  }

  const existing = await listSubagentProfilesForScope(env, {
    userId,
    workspaceId,
    tenantId: scope.tenantId,
    includePlatformGlobal: false,
  });
  if (Array.isArray(existing) && existing.length) {
    return { ok: true, profiles: existing, createdDefault: false, reason: null };
  }

  const created = await createSubagentProfile(env, scope, {
    slug: 'primary',
    display_name: 'Primary',
    description: 'Auto-provisioned default subagent profile.',
    access_mode: 'read_write',
  });
  if (!created.ok) {
    return { ok: false, profiles: [], createdDefault: false, reason: created.error };
  }

  const profiles = await listSubagentProfilesForScope(env, {
    userId,
    workspaceId,
    tenantId: scope.tenantId,
    includePlatformGlobal: false,
  });
  return {
    ok: true,
    profiles: Array.isArray(profiles) ? profiles : [],
    createdDefault: true,
    reason: null,
  };
}
