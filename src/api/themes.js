/**
 * Theme gallery, active resolution (D1 `cms_theme_preferences` + fallbacks), apply + IAM_COLLAB broadcast.
 */
import { getAuthUser, jsonResponse, fetchAuthUserTenantId } from "../core/auth.js";

/** Same mapping as settings.js resolveCanonicalUserId — kept local to avoid themes↔settings import cycles. */
async function resolveCanonicalUserIdShort(env, sessionUserId, email) {
  if (!env?.DB) return { userId: null };
  const sid = sessionUserId != null ? String(sessionUserId).trim() : "";
  const em = email != null ? String(email).trim() : "";
  try {
    const row = await env.DB.prepare(
      `SELECT u.id as user_id
       FROM auth_users au
       LEFT JOIN users u ON u.auth_id = au.id OR LOWER(COALESCE(u.email,'')) = LOWER(au.email)
       WHERE au.id = ? OR LOWER(au.email) = LOWER(?)
       LIMIT 1`,
    )
      .bind(sid, em || sid)
      .first();
    return { userId: row?.user_id != null ? String(row.user_id).trim() : null };
  } catch {
    return { userId: null };
  }
}
import { buildActiveThemeApiPayload } from "../core/cms-theme-active.js";
import {
  resolveActiveCmsThemeRow,
  userCanAccessWorkspace,
  broadcastWorkspaceThemeCollab,
} from "../core/cms-theme-resolve.js";

/**
 * @param {any} env
 * @param {string} userId auth_users.id
 */
async function fetchDefaultWorkspaceId(env, authUser) {
  const uid = String(authUser?.id || "").trim();
  if (!uid || !env.DB) return "";
  const tryUid = async (id) => {
    try {
      const row = await env.DB.prepare(
        `SELECT default_workspace_id FROM user_settings WHERE user_id = ? LIMIT 1`,
      )
        .bind(id)
        .first();
      return row?.default_workspace_id != null && String(row.default_workspace_id).trim() !== ""
        ? String(row.default_workspace_id).trim()
        : "";
    } catch {
      return "";
    }
  };
  let v = await tryUid(uid);
  if (v) return v;
  const { userId: canonicalUserId } = await resolveCanonicalUserIdShort(env, uid, authUser?.email);
  const cid = canonicalUserId != null ? String(canonicalUserId).trim() : "";
  if (cid && cid !== uid) {
    v = await tryUid(cid);
    if (v) return v;
  }
  return "";
}

/**
 * @param {any} env
 * @param {any} authUser
 */
async function resolveAuthTenantId(env, authUser) {
  let tid =
    authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ""
      ? String(authUser.tenant_id).trim()
      : null;
  if (!tid && authUser?.id) tid = await fetchAuthUserTenantId(env, authUser.id).catch(() => null);
  if (!tid && authUser?.email) tid = await fetchAuthUserTenantId(env, authUser.email).catch(() => null);
  return tid;
}

/**
 * Main dispatcher for Theme-related API routes (/api/themes/*).
 */
export async function handleThemesApi(request, url, env, ctx) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, "") || "/";
  const method = request.method.toUpperCase();

  if (!env.DB) return jsonResponse({ error: "DB not configured" }, 503);

  try {
    // ── GET /api/themes (Gallery) ──
    if (pathLower === "/api/themes" && method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT id, name, slug, config, theme_family, sort_order, css_url, tenant_id, workspace_id, wcag_scores, contrast_flags, is_system, monaco_bg
         FROM cms_themes ORDER BY is_system DESC, theme_family ASC, sort_order ASC, name ASC`,
      ).all();
      return jsonResponse({ themes: results || [] });
    }

    // ── GET /api/themes/active ──
    if (pathLower === "/api/themes/active" && method === "GET") {
      const authUser = await getAuthUser(request, env).catch(() => null);
      if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401);

      let workspaceId =
        url.searchParams.get("workspace_id")?.trim() ||
        url.searchParams.get("workspace")?.trim() ||
        "";
      if (!workspaceId) {
        workspaceId = await fetchDefaultWorkspaceId(env, authUser);
      }

      const projectId = url.searchParams.get("project_id")?.trim() || "";

      if (workspaceId) {
        const ok = await userCanAccessWorkspace(env, authUser, workspaceId);
        if (!ok) return jsonResponse({ error: "Forbidden" }, 403);
      }

      const tenantId = await resolveAuthTenantId(env, authUser);

      const resolved = await resolveActiveCmsThemeRow(env, {
        tenantId,
        authUser,
        workspaceId: workspaceId || null,
        projectId: projectId || null,
      });

      let themeRow = resolved.row;
      if (!themeRow) {
        themeRow = await env.DB.prepare(
          `SELECT * FROM cms_themes WHERE is_system = 1 AND slug = 'dark' LIMIT 1`,
        ).first();
      }

      const payload =
        buildActiveThemeApiPayload(themeRow) ||
        ({
          name: "dark",
          slug: "dark",
          is_dark: true,
          data: {},
          theme_channel: "live",
        });

      payload.resolved_from = resolved.resolved_from;
      if (workspaceId) payload.workspace_id = workspaceId;
      if (projectId) payload.project_id = projectId;

      return jsonResponse(payload);
    }

    // ── POST /api/themes/apply ──
    if (pathLower === "/api/themes/apply" && method === "POST") {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const body = await request.json().catch(() => ({}));
      const themeId = body.theme_id != null ? String(body.theme_id).trim() : "";
      const themeSlugIn = body.theme_slug != null ? String(body.theme_slug).trim() : "";
      const scopeRaw = String(body.scope || "workspace").toLowerCase().trim();
      const scope =
        scopeRaw === "project" || scopeRaw === "user_global" ? scopeRaw : "workspace";

      let themeRow = null;
      if (themeId) {
        themeRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE id = ?`).bind(themeId).first();
      }
      if (!themeRow && themeSlugIn) {
        themeRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE slug = ?`)
          .bind(themeSlugIn)
          .first();
      }
      if (!themeRow?.slug) return jsonResponse({ error: "Theme not found" }, 404);

      const tenantId = await resolveAuthTenantId(env, authUser);
      if (!tenantId) return jsonResponse({ error: "Tenant could not be resolved" }, 403);

      const tid = String(tenantId).trim();
      const uid = String(authUser.id || "").trim();
      const workspaceId =
        body.workspace_id != null && String(body.workspace_id).trim() !== ""
          ? String(body.workspace_id).trim()
          : "";
      const projectId =
        body.project_id != null && String(body.project_id).trim() !== ""
          ? String(body.project_id).trim()
          : "";

      if (scope === "workspace" || scope === "project") {
        if (!workspaceId) return jsonResponse({ error: "workspace_id required for this scope" }, 400);
        const ok = await userCanAccessWorkspace(env, authUser, workspaceId);
        if (!ok) return jsonResponse({ error: "Forbidden" }, 403);
      }
      if (scope === "project" && !projectId) {
        return jsonResponse({ error: "project_id required for project scope" }, 400);
      }

      const slug = String(themeRow.slug).trim();
      let prefId = "";
      /** @type {string | null} */
      let wsCol = null;
      /** @type {string | null} */
      let projCol = null;
      /** @type {string | null} */
      let userCol = null;

      if (scope === "workspace") {
        prefId = `tp_ws_${tid}_${workspaceId}`;
        wsCol = workspaceId;
      } else if (scope === "project") {
        prefId = `tp_pr_${tid}_${workspaceId}_${projectId}`;
        wsCol = workspaceId;
        projCol = projectId;
      } else {
        prefId = `tp_ug_${tid}_${uid}`;
        userCol = uid;
      }

      try {
        await env.DB.prepare(
          `INSERT INTO cms_theme_preferences (id, tenant_id, scope, workspace_id, project_id, user_id, theme_slug, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
           ON CONFLICT(id) DO UPDATE SET
             theme_slug = excluded.theme_slug,
             updated_at = unixepoch()`,
        )
          .bind(prefId, tid, scope, wsCol, projCol, userCol, slug)
          .run();
      } catch (e) {
        const msg = String(e?.message || e || "");
        if (msg.includes("no such table")) {
          return jsonResponse(
            { error: "cms_theme_preferences table missing — run migrations/256_cms_theme_preferences.sql" },
            503,
          );
        }
        throw e;
      }

      /** Workspace context used to resolve the merged chain after upsert. */
      let resolveWs = "";
      let resolveProj = "";
      if (scope === "workspace") {
        resolveWs = workspaceId;
      } else if (scope === "project") {
        resolveWs = workspaceId;
        resolveProj = projectId;
      } else {
        resolveWs =
          body.workspace_id != null && String(body.workspace_id).trim() !== ""
            ? String(body.workspace_id).trim()
            : await fetchDefaultWorkspaceId(env, authUser);
      }

      let resolved;
      try {
        resolved = await resolveActiveCmsThemeRow(env, {
          tenantId: tid,
          authUser,
          workspaceId: resolveWs || null,
          projectId: resolveProj || null,
        });
      } catch (e) {
        console.warn("[themes/apply] resolveActiveCmsThemeRow", e?.message ?? e);
        resolved = { row: null, resolved_from: "resolve_error" };
      }

      let outRow = resolved.row;
      if (!outRow) {
        outRow = await env.DB.prepare(
          `SELECT * FROM cms_themes WHERE is_system = 1 AND slug = 'dark' LIMIT 1`,
        ).first();
      }

      const payload =
        buildActiveThemeApiPayload(outRow) ||
        ({
          name: "dark",
          slug: "dark",
          is_dark: true,
          data: {},
          theme_channel: "live",
        });

      payload.resolved_from = resolved.resolved_from;
      if (resolveWs) payload.workspace_id = resolveWs;
      if (resolveProj) payload.project_id = resolveProj;

      const broadcastWs = scope === "user_global" ? resolveWs : workspaceId;
      if (broadcastWs) {
        await broadcastWorkspaceThemeCollab(env, broadcastWs, payload);
      }

      return jsonResponse(payload);
    }

    return jsonResponse({ error: "Theme route not found" }, 404);
  } catch (e) {
    return jsonResponse({ error: e?.message || String(e) }, 500);
  }
}
