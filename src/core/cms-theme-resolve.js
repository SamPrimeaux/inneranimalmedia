/**
 * Resolve live `cms_themes` row from D1 using workspace/project/user/tenant fallbacks.
 */
import { fetchAuthUserTenantId } from "./auth.js";

/**
 * @param {any} env
 * @param {any} authUser
 * @param {string} workspaceId
 */
export async function userCanAccessWorkspace(env, authUser, workspaceId) {
  if (!env?.DB || !authUser || !workspaceId) return false;
  const wid = String(workspaceId).trim();
  const uid = String(authUser.id || "").trim();
  if (!wid || !uid) return false;
  const isSuper = Number(authUser.is_superadmin) === 1;
  if (isSuper) return true;

  let tenantId =
    authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ""
      ? String(authUser.tenant_id).trim()
      : null;
  if (!tenantId) tenantId = await fetchAuthUserTenantId(env, uid).catch(() => null);

  try {
    const ws = await env.DB.prepare(`SELECT user_id, tenant_id FROM workspaces WHERE id = ? LIMIT 1`)
      .bind(wid)
      .first();
    if (!ws) return false;
    if (String(ws.user_id || "") === uid) return true;
    if (tenantId && String(ws.tenant_id || "") === tenantId) return true;
    const m = await env.DB.prepare(
      `SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
    )
      .bind(wid, uid)
      .first();
    return !!m;
  } catch {
    return false;
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} ref
 */
async function fetchCmsThemeRowByRef(db, ref) {
  const s = String(ref ?? "").trim();
  if (!s) return null;
  let row = await db.prepare(`SELECT * FROM cms_themes WHERE slug = ? LIMIT 1`).bind(s).first();
  if (row) return row;
  row = await db.prepare(`SELECT * FROM cms_themes WHERE id = ? LIMIT 1`).bind(s).first();
  return row || null;
}

async function fetchPrefsProject(db, tenantId, workspaceId, projectId) {
  try {
    return await db
      .prepare(
        `SELECT theme_slug FROM cms_theme_preferences
         WHERE tenant_id = ? AND scope = 'project' AND workspace_id = ? AND project_id = ? LIMIT 1`,
      )
      .bind(tenantId, workspaceId, projectId)
      .first();
  } catch {
    return null;
  }
}

async function fetchPrefsWorkspace(db, tenantId, workspaceId) {
  try {
    return await db
      .prepare(
        `SELECT theme_slug FROM cms_theme_preferences
         WHERE tenant_id = ? AND scope = 'workspace' AND workspace_id = ? LIMIT 1`,
      )
      .bind(tenantId, workspaceId)
      .first();
  } catch {
    return null;
  }
}

async function fetchPrefsUserGlobal(db, tenantId, userId) {
  try {
    return await db
      .prepare(
        `SELECT theme_slug FROM cms_theme_preferences
         WHERE tenant_id = ? AND scope = 'user_global' AND user_id = ? LIMIT 1`,
      )
      .bind(tenantId, userId)
      .first();
  } catch {
    return null;
  }
}

async function fetchWorkspaceSettingsThemeRef(db, workspaceId) {
  try {
    const row = await db
      .prepare(`SELECT theme_id, theme FROM workspace_settings WHERE workspace_id = ? LIMIT 1`)
      .bind(workspaceId)
      .first();
    if (!row) return null;
    const a = row.theme != null && String(row.theme).trim() !== "" ? String(row.theme).trim() : null;
    const b =
      row.theme_id != null && String(row.theme_id).trim() !== "" ? String(row.theme_id).trim() : null;
    return a || b;
  } catch {
    try {
      const row = await db
        .prepare(`SELECT theme_id FROM workspace_settings WHERE workspace_id = ? LIMIT 1`)
        .bind(workspaceId)
        .first();
      return row?.theme_id != null ? String(row.theme_id).trim() : null;
    } catch {
      return null;
    }
  }
}

async function fetchWorkspacesThemeRef(db, workspaceId) {
  try {
    const row = await db
      .prepare(`SELECT theme_id FROM workspaces WHERE id = ? LIMIT 1`)
      .bind(workspaceId)
      .first();
    return row?.theme_id != null && String(row.theme_id).trim() !== ""
      ? String(row.theme_id).trim()
      : null;
  } catch {
    return null;
  }
}

async function fetchUserSettingsThemeRef(db, userId) {
  try {
    const row = await db
      .prepare(`SELECT theme FROM user_settings WHERE user_id = ? LIMIT 1`)
      .bind(userId)
      .first();
    return row?.theme != null && String(row.theme).trim() !== "" ? String(row.theme).trim() : null;
  } catch {
    return null;
  }
}

async function fetchTenantAppearanceSlug(db, tenantId) {
  try {
    const row = await db
      .prepare(
        `SELECT t.slug FROM cms_themes t
         INNER JOIN settings s ON (s.setting_value = t.slug OR s.setting_value = CAST(t.id AS TEXT))
         WHERE s.tenant_id = ? AND s.setting_key = 'appearance.theme' LIMIT 1`,
      )
      .bind(tenantId)
      .first();
    return row?.slug != null ? String(row.slug).trim() : null;
  } catch {
    return null;
  }
}

/**
 * @typedef {{ row: Record<string, unknown> | null, resolved_from: string }} ResolvedCmsTheme
 */

/**
 * @param {any} env
 * @param {{
 *   tenantId: string | null,
 *   authUser: { id?: string } | null,
 *   workspaceId: string | null,
 *   projectId: string | null,
 * }} args
 * @returns {Promise<ResolvedCmsTheme>}
 */
export async function resolveActiveCmsThemeRow(env, { tenantId, authUser, workspaceId, projectId }) {
  const db = env?.DB;
  if (!db) return { row: null, resolved_from: "no_db" };

  const tid = tenantId != null ? String(tenantId).trim() : "";
  const wsId = workspaceId != null ? String(workspaceId).trim() : "";
  const projId = projectId != null ? String(projectId).trim() : "";
  const uid = authUser?.id != null ? String(authUser.id).trim() : "";

  const trySlug = async (ref, source) => {
    if (ref == null || String(ref).trim() === "") return null;
    const row = await fetchCmsThemeRowByRef(db, ref);
    return row ? { row, resolved_from: source } : null;
  };

  if (tid && wsId && projId) {
    const p = await fetchPrefsProject(db, tid, wsId, projId);
    if (p?.theme_slug) {
      const hit = await trySlug(p.theme_slug, "cms_theme_preferences.project");
      if (hit) return hit;
    }
  }

  if (tid && wsId) {
    const p = await fetchPrefsWorkspace(db, tid, wsId);
    if (p?.theme_slug) {
      const hit = await trySlug(p.theme_slug, "cms_theme_preferences.workspace");
      if (hit) return hit;
    }
  }

  if (wsId) {
    const ref = await fetchWorkspaceSettingsThemeRef(db, wsId);
    const hit = await trySlug(ref, "workspace_settings");
    if (hit) return hit;
  }

  if (wsId) {
    const ref = await fetchWorkspacesThemeRef(db, wsId);
    const hit = await trySlug(ref, "workspaces");
    if (hit) return hit;
  }

  if (tid && uid) {
    const p = await fetchPrefsUserGlobal(db, tid, uid);
    if (p?.theme_slug) {
      const hit = await trySlug(p.theme_slug, "cms_theme_preferences.user_global");
      if (hit) return hit;
    }
  }

  if (uid) {
    const ref = await fetchUserSettingsThemeRef(db, uid);
    const hit = await trySlug(ref, "user_settings.theme");
    if (hit) return hit;
  }

  if (tid) {
    const ref = await fetchTenantAppearanceSlug(db, tid);
    const hit = await trySlug(ref, "settings.appearance.theme");
    if (hit) return hit;
  }

  let fallback = await db
    .prepare(`SELECT * FROM cms_themes WHERE is_system = 1 AND slug = 'dark' LIMIT 1`)
    .first();
  if (!fallback) {
    fallback = await db
      .prepare(`SELECT * FROM cms_themes WHERE is_system = 1 ORDER BY sort_order ASC LIMIT 1`)
      .first();
  }
  if (fallback) return { row: fallback, resolved_from: "system_default" };

  return { row: null, resolved_from: "none" };
}

/**
 * Broadcast theme payload to IAM_COLLAB canvas room for a workspace (realtime only).
 * @param {any} env
 * @param {string} workspaceId
 * @param {Record<string, unknown>} payload — output of buildActiveThemeApiPayload
 */
export async function broadcastWorkspaceThemeCollab(env, workspaceId, payload) {
  if (!env?.IAM_COLLAB || !workspaceId || !payload?.slug || !payload?.data) return;
  const id = env.IAM_COLLAB.idFromName(`canvas:${workspaceId}`);
  const stub = env.IAM_COLLAB.get(id);
  const text = JSON.stringify({
    type: "theme_update",
    theme_slug: payload.slug,
    cssVars: payload.data,
    monaco_theme: payload.monaco_theme ?? null,
    monaco_bg: payload.monaco_bg ?? null,
    monaco_theme_data: payload.monaco_theme_data ?? null,
  });
  try {
    await stub.fetch(new Request("https://internal/broadcast", { method: "POST", body: text }));
  } catch (e) {
    console.warn("[broadcastWorkspaceThemeCollab]", e?.message ?? e);
  }
}
