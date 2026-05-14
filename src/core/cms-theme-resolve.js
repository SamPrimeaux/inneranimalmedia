/**
 * Resolve live `cms_themes` row from D1 using workspace/project/user/tenant fallbacks.
 */
import { fetchAuthUserTenantId } from "./auth.js";

function parseWorkspaceSettingsJson(settingsJson) {
  if (settingsJson == null || settingsJson === "") return {};
  try {
    return typeof settingsJson === "string" ? JSON.parse(settingsJson) : settingsJson;
  } catch {
    return {};
  }
}

/**
 * Whether theme packaging may upload to the platform ASSETS (R2) bucket (InnerAnimalMedia CDN path).
 * Eligibility: env allowlists (`CMS_THEME_PLATFORM_WORKSPACE_IDS`, `CMS_THEME_PLATFORM_TENANT_IDS`)
 * or workspace `settings_json.cms_pipeline` (`platform_r2_upload` / `storage_output: platform_r2`).
 * No hardcoded workspace or tenant IDs.
 *
 * @param {any} env
 * @param {string | undefined} workspaceId
 * @param {string | undefined} tenantId
 */
export async function canUsePlatformAssetsR2Upload(env, workspaceId, tenantId) {
  if (!env?.ASSETS || typeof env.ASSETS.put !== "function") return false;
  const wid = String(workspaceId || "").trim();
  const tid = String(tenantId || "").trim();
  const envWs = String(env.CMS_THEME_PLATFORM_WORKSPACE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (wid && envWs.includes(wid)) return true;
  const envTn = String(env.CMS_THEME_PLATFORM_TENANT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (tid && envTn.includes(tid)) return true;
  if (!wid || !env.DB) return false;
  try {
    const row = await env.DB.prepare(`SELECT settings_json FROM workspaces WHERE id = ? LIMIT 1`)
      .bind(wid)
      .first();
    const j = parseWorkspaceSettingsJson(row?.settings_json);
    const pipe = j.cms_pipeline && typeof j.cms_pipeline === "object" ? j.cms_pipeline : {};
    if (pipe.platform_r2_upload === true) return true;
    if (String(pipe.storage_output || "").trim() === "platform_r2") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * auth_users.id (au_*) vs users.id (usr_*) — workspace_members.user_id may match either.
 * @param {any} env
 * @param {any} authUser
 * @returns {Promise<string[]>}
 */
async function workspaceMemberUserCandidates(env, authUser) {
  const uid = String(authUser?.id || "").trim();
  const email = authUser?.email != null ? String(authUser.email).trim() : "";
  /** @type {Set<string>} */
  const ids = new Set();
  if (uid) ids.add(uid);
  if (!env?.DB) return [...ids];
  try {
    const row = await env.DB.prepare(
      `SELECT u.id AS app_user_id
       FROM auth_users au
       LEFT JOIN users u ON u.auth_id = au.id OR LOWER(COALESCE(u.email,'')) = LOWER(au.email)
       WHERE au.id = ? OR LOWER(COALESCE(au.email,'')) = LOWER(?)
       LIMIT 1`,
    )
      .bind(uid, email || uid)
      .first();
    if (row?.app_user_id != null && String(row.app_user_id).trim()) {
      ids.add(String(row.app_user_id).trim());
    }
  } catch {
    /* ignore */
  }
  return [...ids];
}

/**
 * Tenant for cms_theme_preferences + resolveActiveCmsThemeRow: auth/session tenant first,
 * then workspace row (owner/default) when scoping to a workspace.
 * @param {any} env
 * @param {any} authUser
 * @param {string | null | undefined} workspaceId
 */
export async function resolveTenantIdForCmsThemeOps(env, authUser, workspaceId) {
  let tid = null;
  if (authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== "") {
    tid = String(authUser.tenant_id).trim();
  }
  if (!tid && authUser?.id) {
    tid = await fetchAuthUserTenantId(env, authUser.id).catch(() => null);
  }
  if (!tid && authUser?.email) {
    tid = await fetchAuthUserTenantId(env, authUser.email).catch(() => null);
  }
  const ws = workspaceId != null ? String(workspaceId).trim() : "";
  if (!tid && ws && env?.DB) {
    try {
      const row = await env.DB.prepare(
        `SELECT tenant_id, owner_tenant_id, default_tenant_id FROM workspaces WHERE id = ? LIMIT 1`,
      )
        .bind(ws)
        .first();
      for (const col of [row?.tenant_id, row?.owner_tenant_id, row?.default_tenant_id]) {
        if (col != null && String(col).trim() !== "") {
          tid = String(col).trim();
          break;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return tid || null;
}

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
    const candidates = await workspaceMemberUserCandidates(env, authUser);
    const ws = await env.DB.prepare(`SELECT user_id, tenant_id FROM workspaces WHERE id = ? LIMIT 1`)
      .bind(wid)
      .first();
    if (!ws) return false;
    if (candidates.some((c) => String(ws.user_id || "") === c)) return true;
    if (tenantId && String(ws.tenant_id || "") === tenantId) return true;
    const ph = candidates.map(() => "?").join(", ");
    const m = await env.DB.prepare(
      `SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id IN (${ph}) AND COALESCE(is_active, 1) = 1 LIMIT 1`,
    )
      .bind(wid, ...candidates)
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
 * Persist a cms_theme_preferences row for POST /api/themes/apply.
 *
 * Production D1 may be migration **256** (minimal columns) or an **extended** table with
 * `theme_id NOT NULL` and `UNIQUE(tenant_id, user_id, workspace_id, project_id, page_id, scope)`.
 * The old `INSERT … ON CONFLICT(id)` path fails on extended schemas (NOT NULL theme_id,
 * composite unique vs synthetic `tp_ws_*` ids) and surfaced as HTTP 500 + client theme rollback.
 *
 * Strategy: delete any existing row for the same logical scope key, then insert a fresh row.
 * Insert tries `(…, theme_slug, theme_id, …)` first; on missing `theme_id` column, retries without it.
 *
 * @param {any} env
 * @param {{
 *   prefId: string,
 *   tenantId: string,
 *   scope: string,
 *   workspaceId: string | null,
 *   projectId: string | null,
 *   userId: string | null,
 *   themeSlug: string,
 *   themeCmsRowId?: string | null,
 * }} p
 */
export async function upsertCmsThemePreferenceRow(env, p) {
  const db = env?.DB;
  if (!db) throw new Error("DB not configured");

  const tid = String(p.tenantId || "").trim();
  const slug = String(p.themeSlug || "").trim();
  const prefId = String(p.prefId || "").trim();
  const scope = String(p.scope || "workspace").trim();
  const ws =
    p.workspaceId != null && String(p.workspaceId).trim() !== "" ? String(p.workspaceId).trim() : null;
  const proj =
    p.projectId != null && String(p.projectId).trim() !== "" ? String(p.projectId).trim() : null;
  const uid = p.userId != null && String(p.userId).trim() !== "" ? String(p.userId).trim() : null;

  let themeRowId =
    p.themeCmsRowId != null && String(p.themeCmsRowId).trim() !== "" ? String(p.themeCmsRowId).trim() : "";
  if (!themeRowId && slug) {
    try {
      const t = await db.prepare(`SELECT id FROM cms_themes WHERE slug = ? LIMIT 1`).bind(slug).first();
      if (t?.id != null && String(t.id).trim()) themeRowId = String(t.id).trim();
    } catch {
      /* ignore */
    }
  }
  if (!themeRowId) themeRowId = slug;

  const run = async (sql, ...binds) => {
    await db.prepare(sql).bind(...binds).run();
  };

  const deleteWorkspaceScoped = async () => {
    if (!ws) return;
    try {
      await run(
        `DELETE FROM cms_theme_preferences
         WHERE tenant_id = ? AND scope = 'workspace' AND workspace_id = ?
           AND (project_id IS NULL OR project_id = '')
           AND (page_id IS NULL OR page_id = '')`,
        tid,
        ws,
      );
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (msg.includes("no such table")) throw e;
      if (msg.includes("no such column") && msg.includes("page_id")) {
        try {
          await run(
            `DELETE FROM cms_theme_preferences
             WHERE tenant_id = ? AND scope = 'workspace' AND workspace_id = ?
               AND (project_id IS NULL OR project_id = '')`,
            tid,
            ws,
          );
        } catch (e2) {
          const m2 = String(e2?.message || e2 || "");
          if (m2.includes("no such table")) throw e2;
          await run(
            `DELETE FROM cms_theme_preferences WHERE tenant_id = ? AND scope = 'workspace' AND workspace_id = ?`,
            tid,
            ws,
          );
        }
      } else {
        await run(
          `DELETE FROM cms_theme_preferences WHERE tenant_id = ? AND scope = 'workspace' AND workspace_id = ?`,
          tid,
          ws,
        );
      }
    }
  };

  const deleteProjectScoped = async () => {
    if (!ws || !proj) return;
    try {
      await run(
        `DELETE FROM cms_theme_preferences
         WHERE tenant_id = ? AND scope = 'project' AND workspace_id = ? AND project_id = ?
           AND (page_id IS NULL OR page_id = '')`,
        tid,
        ws,
        proj,
      );
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (msg.includes("no such table")) throw e;
      if (msg.includes("no such column") && msg.includes("page_id")) {
        await run(
          `DELETE FROM cms_theme_preferences
           WHERE tenant_id = ? AND scope = 'project' AND workspace_id = ? AND project_id = ?`,
          tid,
          ws,
          proj,
        );
      } else {
        throw e;
      }
    }
  };

  const deleteUserGlobalScoped = async () => {
    if (!uid) return;
    try {
      await run(
        `DELETE FROM cms_theme_preferences
         WHERE tenant_id = ? AND scope = 'user_global' AND user_id = ?
           AND (page_id IS NULL OR page_id = '')`,
        tid,
        uid,
      );
    } catch (e) {
      const msg = String(e?.message || e || "");
      if (msg.includes("no such table")) throw e;
      if (msg.includes("no such column") && msg.includes("page_id")) {
        await run(
          `DELETE FROM cms_theme_preferences WHERE tenant_id = ? AND scope = 'user_global' AND user_id = ?`,
          tid,
          uid,
        );
      } else {
        throw e;
      }
    }
  };

  if (scope === "workspace") {
    await deleteWorkspaceScoped();
  } else if (scope === "project") {
    await deleteProjectScoped();
  } else if (scope === "user_global") {
    await deleteUserGlobalScoped();
  }

  try {
    await run(
      `INSERT INTO cms_theme_preferences (id, tenant_id, scope, workspace_id, project_id, user_id, theme_slug, theme_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
      prefId,
      tid,
      scope,
      ws,
      proj,
      uid,
      slug,
      themeRowId,
    );
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (msg.includes("no such column") && msg.includes("theme_id")) {
      await run(
        `INSERT INTO cms_theme_preferences (id, tenant_id, scope, workspace_id, project_id, user_id, theme_slug, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`,
        prefId,
        tid,
        scope,
        ws,
        proj,
        uid,
        slug,
      );
    } else {
      throw e;
    }
  }
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
