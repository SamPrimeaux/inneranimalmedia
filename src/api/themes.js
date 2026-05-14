/**
 * Theme gallery, active resolution (D1 `cms_theme_preferences` + fallbacks), apply + IAM_COLLAB broadcast.
 */
import { getAuthUser, jsonResponse, fallbackSystemTenantId } from "../core/auth.js";

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
import { buildActiveThemeApiPayload, hydrateCmsThemeCssVarsFromR2 } from "../core/cms-theme-active.js";
import {
  resolveActiveCmsThemeRow,
  resolveTenantIdForCmsThemeOps,
  userCanAccessWorkspace,
  canUsePlatformAssetsR2Upload,
  broadcastWorkspaceThemeCollab,
} from "../core/cms-theme-resolve.js";
import { normalizeCatalogThemeRow } from "../core/cms-theme-preview-model.js";
import { buildFullThemePackage } from "../core/cms-theme-package-files.js";
import {
  normalizeThemeSlug,
  buildConfigFromPalette,
  buildMonacoThemeDataJson,
  buildThemeSidecarJson,
  expectedMonacoEditorThemeId,
} from "../core/cms-theme-create.js";
import {
  mergePackageMetaIntoTokensJson,
  recordCmsThemePackageDeploy,
} from "../core/cms-theme-registry.js";

const DEFAULT_ASSETS_ORIGIN = "https://assets.inneranimalmedia.com";
const DEFAULT_R2_BUCKET = "inneranimalmedia";

/**
 * @param {any} env
 * @param {string} workspaceId
 */
async function fetchWorkspaceRow(env, workspaceId) {
  const wid = String(workspaceId || "").trim();
  if (!wid || !env.DB) return null;
  try {
    return await env.DB.prepare(
      `SELECT id, tenant_id, r2_prefix, github_repo, settings_json FROM workspaces WHERE id = ? LIMIT 1`,
    )
      .bind(wid)
      .first();
  } catch {
    return null;
  }
}

/**
 * @param {any} env
 * @param {string} slug
 */
async function fetchThemeRowBySlug(env, slug) {
  const s = String(slug || "").trim();
  if (!s) return null;
  return await env.DB.prepare(`SELECT * FROM cms_themes WHERE slug = ? LIMIT 1`).bind(s).first();
}

/**
 * Upload portable theme artifacts to stable + versioned R2 prefixes.
 * @param {any} env
 * @param {string} slug
 * @param {Awaited<ReturnType<typeof import("../core/cms-theme-package-files.js").buildFullThemePackage>>} pkg
 */
async function putPortableThemePackage(env, slug, pkg) {
  const bucket = env.ASSETS;
  if (!bucket || typeof bucket.put !== "function") {
    throw new Error("R2 ASSETS binding unavailable");
  }
  const s = String(slug).trim();
  const map = [
    ["theme.css", pkg.theme_css, "text/css; charset=utf-8"],
    ["theme.json", pkg.theme_json, "application/json; charset=utf-8"],
    ["monaco.json", pkg.monaco_json, "application/json; charset=utf-8"],
    ["manifest.json", pkg.manifest_json, "application/json; charset=utf-8"],
    ["preview.html", pkg.preview_html, "text/html; charset=utf-8"],
    ["README.md", pkg.readme_md, "text/markdown; charset=utf-8"],
  ];
  const vp = String(pkg.version_prefix || "").trim();
  for (const [fn, body, ct] of map) {
    await bucket.put(`cms/themes/${s}/${fn}`, body, { httpMetadata: { contentType: ct } });
    if (vp) {
      await bucket.put(`${vp}/${fn}`, body, { httpMetadata: { contentType: ct } });
    }
  }
}

/**
 * Persist compact package hashes + manifest pointers into tokens_json.package_meta.
 * @param {any} env
 * @param {string} themeId
 * @param {string} slug
 * @param {Awaited<ReturnType<typeof import("../core/cms-theme-package-files.js").buildFullThemePackage>>} pkg
 */
async function persistThemePackageMeta(env, themeId, slug, pkg) {
  const id = String(themeId || "").trim();
  if (!id || !env.DB) return;
  try {
    const row = await env.DB.prepare(`SELECT tokens_json FROM cms_themes WHERE id = ? LIMIT 1`)
      .bind(id)
      .first();
    const merged = mergePackageMetaIntoTokensJson(row?.tokens_json, {
      source_hash: pkg.source_hash,
      css_hash: pkg.compiled_css_hash,
      package_hash: pkg.package_hash,
      manifest_r2_key: `cms/themes/${slug}/manifest.json`,
      manifest_url: `${DEFAULT_ASSETS_ORIGIN}/cms/themes/${slug}/manifest.json`,
      preview_html_url: `${DEFAULT_ASSETS_ORIGIN}/cms/themes/${slug}/preview.html`,
      versioned_r2_prefix: `${pkg.version_prefix}/`,
      generated_at: new Date().toISOString(),
      file_hashes: pkg.file_hashes,
    });
    await env.DB.prepare(`UPDATE cms_themes SET tokens_json = ?, updated_at = unixepoch() WHERE id = ?`)
      .bind(merged, id)
      .run();
  } catch (e) {
    console.warn("[themes] persistThemePackageMeta", e?.message ?? e);
  }
}

/**
 * @param {any} env
 * @param {string} themeId
 * @param {{
 *   css_r2_key: string | null,
 *   css_url: string | null,
 *   compiled_css_hash: string | null,
 *   css_r2_bucket: string | null,
 *   preview_image_url?: string | null,
 * }} meta
 */
async function updateThemeR2Meta(env, themeId, meta) {
  const id = String(themeId || "").trim();
  if (!id) return;
  try {
    await env.DB.prepare(
      `UPDATE cms_themes SET
         css_r2_key = ?,
         css_url = ?,
         css_r2_bucket = ?,
         compiled_css_hash = ?,
         preview_image_url = COALESCE(?, preview_image_url),
         updated_at = unixepoch()
       WHERE id = ?`,
    )
      .bind(
        meta.css_r2_key,
        meta.css_url,
        meta.css_r2_bucket,
        meta.compiled_css_hash,
        meta.preview_image_url ?? null,
        id,
      )
      .run();
  } catch (e) {
    console.warn("[themes] updateThemeR2Meta", e?.message ?? e);
  }
}

/**
 * @param {any} env
 * @param {any} authUser
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
 * Best-effort mirror slug onto workspaces row (some DBs lack theme_set).
 * @param {any} env
 * @param {string} workspaceId
 * @param {string} slug
 */
async function patchWorkspaceThemeSlug(env, workspaceId, slug) {
  const wid = String(workspaceId || "").trim();
  const s = String(slug || "").trim();
  if (!wid || !s || !env?.DB) return;
  try {
    await env.DB.prepare(
      `UPDATE workspaces SET theme_id = ?, theme_set = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(s, s, wid)
      .run();
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (msg.includes("no such column") && msg.includes("theme_set")) {
      try {
        await env.DB.prepare(`UPDATE workspaces SET theme_id = ?, updated_at = datetime('now') WHERE id = ?`)
          .bind(s, wid)
          .run();
      } catch (_) {}
    } else {
      console.warn("[themes] patchWorkspaceThemeSlug", msg);
    }
  }
}

/**
 * Workspace scope preference upsert + resolved active payload (same semantics as POST /api/themes/apply).
 * @param {any} env
 * @param {any} authUser
 * @param {string} tenantId
 * @param {string} workspaceId
 * @param {string} themeSlug
 */
async function upsertWorkspaceThemeAndResolve(env, authUser, tenantId, workspaceId, themeSlug) {
  const tid = String(tenantId).trim();
  const ws = String(workspaceId).trim();
  const slug = String(themeSlug).trim();
  const prefId = `tp_ws_${tid}_${ws}`;

  await env.DB.prepare(
    `INSERT INTO cms_theme_preferences (id, tenant_id, scope, workspace_id, project_id, user_id, theme_slug, updated_at)
     VALUES (?, ?, 'workspace', ?, NULL, NULL, ?, unixepoch())
     ON CONFLICT(id) DO UPDATE SET
       theme_slug = excluded.theme_slug,
       updated_at = unixepoch()`,
  )
    .bind(prefId, tid, ws, slug)
    .run();

  return resolveActiveCmsThemeRow(env, {
    tenantId: tid,
    authUser,
    workspaceId: ws,
    projectId: null,
  });
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
        `SELECT *
         FROM cms_themes
         WHERE (COALESCE(status, 'active') = 'active')
           AND (COALESCE(visibility, 'public') IN ('public', 'internal'))
         ORDER BY is_system DESC, theme_family ASC, sort_order ASC, name ASC`,
      ).all();
      const rows = results || [];
      const themes = rows.map((r) => normalizeCatalogThemeRow(/** @type {Record<string, unknown>} */ (r)));
      return jsonResponse({ themes });
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

      const tenantId = await resolveTenantIdForCmsThemeOps(env, authUser, workspaceId || null);

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

    // ── POST /api/themes/create ──
    if (pathLower === "/api/themes/create" && method === "POST") {
      const authUser = await getAuthUser(request, env).catch(() => null);
      if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const body = await request.json().catch(() => ({}));
      const workspaceId =
        body.workspace_id != null && String(body.workspace_id).trim() !== ""
          ? String(body.workspace_id).trim()
          : "";
      if (!workspaceId) return jsonResponse({ error: "workspace_id required" }, 400);

      const okWs = await userCanAccessWorkspace(env, authUser, workspaceId);
      if (!okWs) return jsonResponse({ error: "Forbidden" }, 403);

      let tenantId = await resolveTenantIdForCmsThemeOps(env, authUser, workspaceId);
      if (!tenantId) tenantId = fallbackSystemTenantId(env);

      const tid = String(tenantId).trim();
      const slug = normalizeThemeSlug(body.slug != null ? String(body.slug) : "");
      const name =
        body.name != null && String(body.name).trim() !== "" ? String(body.name).trim() : slug;
      const themeFamily =
        body.theme_family != null && String(body.theme_family).trim() !== ""
          ? String(body.theme_family).trim().toLowerCase()
          : "light";

      const paletteObj = body.palette && typeof body.palette === "object" ? body.palette : {};
      const cfgObj = buildConfigFromPalette(paletteObj, themeFamily);
      const configJson = JSON.stringify(cfgObj);
      const monacoBg =
        cfgObj.monaco_bg != null && String(cfgObj.monaco_bg).trim() !== ""
          ? String(cfgObj.monaco_bg).trim()
          : "#2C4259";

      const monacoThemeDataJson = buildMonacoThemeDataJson({
        palette: paletteObj,
        tokens: body.tokens,
        monaco: body.monaco,
        theme_family: themeFamily,
      });

      const sidecars = buildThemeSidecarJson(
        body.tokens && typeof body.tokens === "object" ? body.tokens : { palette: paletteObj },
      );

      const monacoEditorId = expectedMonacoEditorThemeId(slug);
      const requestedId =
        body.theme_id != null && String(body.theme_id).trim() !== ""
          ? String(body.theme_id).trim()
          : `theme-${slug}`;

      const existing = await env.DB.prepare(`SELECT id FROM cms_themes WHERE slug = ? LIMIT 1`)
        .bind(slug)
        .first();
      const rowId = existing?.id != null ? String(existing.id).trim() : requestedId;

      const sortOrder =
        typeof body.sort_order === "number" && Number.isFinite(body.sort_order)
          ? Math.floor(body.sort_order)
          : 500;

      await env.DB.prepare(
        `INSERT INTO cms_themes (
           id, tenant_id, name, slug, config, theme_family, sort_order,
           monaco_theme, monaco_bg, monaco_theme_data,
           tokens_json, css_vars_json, brand_json, layout_json, typography_json, components_json, motion_json,
           status, visibility, is_system, workspace_id, updated_at
         ) VALUES (
           ?, ?, ?, ?, ?, ?, ?,
           ?, ?, ?,
           ?, ?, ?, ?, ?, ?, ?,
           'active', 'public', 0, ?, unixepoch()
         )
         ON CONFLICT(id) DO UPDATE SET
           tenant_id = excluded.tenant_id,
           name = excluded.name,
           slug = excluded.slug,
           config = excluded.config,
           theme_family = excluded.theme_family,
           sort_order = excluded.sort_order,
           monaco_theme = excluded.monaco_theme,
           monaco_bg = excluded.monaco_bg,
           monaco_theme_data = excluded.monaco_theme_data,
           tokens_json = excluded.tokens_json,
           css_vars_json = excluded.css_vars_json,
           brand_json = excluded.brand_json,
           layout_json = excluded.layout_json,
           typography_json = excluded.typography_json,
           components_json = excluded.components_json,
           motion_json = excluded.motion_json,
           workspace_id = excluded.workspace_id,
           updated_at = unixepoch()`,
      )
        .bind(
          rowId,
          tid,
          name,
          slug,
          configJson,
          themeFamily,
          sortOrder,
          monacoEditorId,
          monacoBg,
          monacoThemeDataJson,
          sidecars.tokens_json,
          sidecars.css_vars_json,
          sidecars.brand_json,
          sidecars.layout_json,
          sidecars.typography_json,
          sidecars.components_json,
          sidecars.motion_json,
          workspaceId,
        )
        .run();

      let fullRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE id = ?`).bind(rowId).first();
      if (!fullRow) {
        fullRow = await fetchThemeRowBySlug(env, slug);
      }
      if (!fullRow) return jsonResponse({ error: "Theme persist failed" }, 500);

      const normalized = normalizeCatalogThemeRow(/** @type {Record<string, unknown>} */ (fullRow));

      const wsRow = await fetchWorkspaceRow(env, workspaceId);
      const platformR2 = await canUsePlatformAssetsR2Upload(env, workspaceId, tid);
      const explicitMode = body.output_mode != null ? String(body.output_mode).trim() : "";
      let outputMode = explicitMode;
      if (!outputMode) {
        if (platformR2) outputMode = "r2_and_d1";
        else if (wsRow?.r2_prefix != null && String(wsRow.r2_prefix).trim() !== "")
          outputMode = "r2_and_d1";
        else outputMode = "export_bundle";
      }

      /** @type {Record<string, unknown>} */
      const out = {
        theme: normalized,
        output_mode: outputMode,
      };

      if (
        !platformR2 &&
        (explicitMode === "r2_and_d1" || outputMode === "r2_and_d1")
      ) {
        out.storage_notice =
          "Automatic upload to the platform R2 assets bucket is not enabled for this workspace. Enable it in Workspace settings (CMS pipeline: platform R2), set env CMS_THEME_PLATFORM_WORKSPACE_IDS, or use export_bundle / your own storage.";
        out.output_mode_options = ["r2_and_d1", "export_bundle", "workspace_storage"];
      }

      const pkg = await buildFullThemePackage({
        row: /** @type {Record<string, unknown>} */ (fullRow),
        publicAssetOrigin: DEFAULT_ASSETS_ORIGIN,
        bucket: DEFAULT_R2_BUCKET,
        preview_model: normalized.preview_model,
      });

      const shouldUpload =
        env.ASSETS &&
        platformR2 &&
        outputMode !== "export_bundle" &&
        outputMode !== "d1_only";

      if (shouldUpload) {
        try {
          await putPortableThemePackage(env, slug, pkg);
          await updateThemeR2Meta(env, String(fullRow.id), {
            css_r2_key: pkg.css_r2_key,
            css_url: pkg.css_url,
            compiled_css_hash: pkg.compiled_css_hash,
            css_r2_bucket: pkg.css_r2_bucket,
          });
          await persistThemePackageMeta(env, String(fullRow.id), slug, pkg);
          await recordCmsThemePackageDeploy(env, {
            tenantId: tid,
            workspaceId,
            bucketName: DEFAULT_R2_BUCKET,
            slug,
            themeId: String(fullRow.id),
            assetOrigin: DEFAULT_ASSETS_ORIGIN,
            pkg,
          });
          fullRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE id = ?`).bind(rowId).first();
          out.theme = normalizeCatalogThemeRow(/** @type {Record<string, unknown>} */ (fullRow || {}));
          out.package_meta = {
            source_hash: pkg.source_hash,
            css_hash: pkg.compiled_css_hash,
            package_hash: pkg.package_hash,
            file_hashes: pkg.file_hashes,
          };
        } catch (e) {
          out.r2_upload_error = e?.message ? String(e.message) : String(e);
          out.package_files = {
            "theme.css": pkg.theme_css,
            "theme.json": pkg.theme_json,
            "monaco.json": pkg.monaco_json,
            "manifest.json": pkg.manifest_json,
            "preview.html": pkg.preview_html,
            "README.md": pkg.readme_md,
          };
          out.package_meta = {
            source_hash: pkg.source_hash,
            css_hash: pkg.compiled_css_hash,
            package_hash: pkg.package_hash,
            file_hashes: pkg.file_hashes,
          };
        }
      } else {
        if (!out.output_mode_options) {
          out.output_mode_options = ["r2_and_d1", "export_bundle", "workspace_storage"];
        }
        out.package_files = {
          "theme.css": pkg.theme_css,
          "theme.json": pkg.theme_json,
          "monaco.json": pkg.monaco_json,
          "manifest.json": pkg.manifest_json,
          "preview.html": pkg.preview_html,
          "README.md": pkg.readme_md,
        };
        out.package_meta = {
          source_hash: pkg.source_hash,
          css_hash: pkg.compiled_css_hash,
          package_hash: pkg.package_hash,
          file_hashes: pkg.file_hashes,
        };
      }

      const applyFlag =
        body.apply_to_workspace === true ||
        body.apply_to_workspace === 1 ||
        body.apply_to_workspace === "1";
      if (applyFlag) {
        const resolved = await upsertWorkspaceThemeAndResolve(env, authUser, tid, workspaceId, slug);
        let outRow = resolved.row;
        if (!outRow) {
          outRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE slug = ?`).bind(slug).first();
        }
        const activePayload =
          buildActiveThemeApiPayload(outRow) ||
          ({
            name: slug,
            slug,
            is_dark: themeFamily === "dark",
            data: {},
            theme_channel: "live",
          });
        activePayload.resolved_from = resolved.resolved_from;
        activePayload.workspace_id = workspaceId;
        out.active_theme = activePayload;
        await broadcastWorkspaceThemeCollab(env, workspaceId, activePayload);
      }

      return jsonResponse(out);
    }

    // ── POST /api/themes/package — regenerate portable package from D1 row ──
    if (pathLower === "/api/themes/package" && method === "POST") {
      const authUser = await getAuthUser(request, env).catch(() => null);
      if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401);

      const body = await request.json().catch(() => ({}));
      const workspaceId =
        body.workspace_id != null && String(body.workspace_id).trim() !== ""
          ? String(body.workspace_id).trim()
          : "";
      if (!workspaceId) return jsonResponse({ error: "workspace_id required" }, 400);
      const okWs = await userCanAccessWorkspace(env, authUser, workspaceId);
      if (!okWs) return jsonResponse({ error: "Forbidden" }, 403);

      const slug =
        body.slug != null && String(body.slug).trim() !== "" ? String(body.slug).trim() : "";
      const themeId =
        body.theme_id != null && String(body.theme_id).trim() !== ""
          ? String(body.theme_id).trim()
          : "";
      let fullRow = null;
      if (themeId) {
        fullRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE id = ?`).bind(themeId).first();
      }
      if (!fullRow && slug) {
        fullRow = await fetchThemeRowBySlug(env, slug);
      }
      if (!fullRow?.slug) return jsonResponse({ error: "Theme not found" }, 404);

      let tenantId = await resolveTenantIdForCmsThemeOps(env, authUser, workspaceId);
      if (!tenantId) tenantId = fallbackSystemTenantId(env);
      const normalizedSlug = String(fullRow.slug).trim();
      const normalized = normalizeCatalogThemeRow(/** @type {Record<string, unknown>} */ (fullRow));

      const pkg = await buildFullThemePackage({
        row: /** @type {Record<string, unknown>} */ (fullRow),
        publicAssetOrigin: DEFAULT_ASSETS_ORIGIN,
        bucket: DEFAULT_R2_BUCKET,
        preview_model: normalized.preview_model,
      });

      const explicitMode = body.output_mode != null ? String(body.output_mode).trim() : "";
      const platformR2 = await canUsePlatformAssetsR2Upload(env, workspaceId, tenantId);
      const allowIamR2Upload = env.ASSETS && platformR2;

      /** @type {Record<string, unknown>} */
      const out = { theme: normalized, output_mode: allowIamR2Upload ? "r2_and_d1" : "export_bundle" };

      const tenantStr =
        tenantId != null && String(tenantId).trim() !== "" ? String(tenantId).trim() : "";

      if (allowIamR2Upload && explicitMode !== "export_bundle") {
        try {
          await putPortableThemePackage(env, normalizedSlug, pkg);
          await updateThemeR2Meta(env, String(fullRow.id), {
            css_r2_key: pkg.css_r2_key,
            css_url: pkg.css_url,
            compiled_css_hash: pkg.compiled_css_hash,
            css_r2_bucket: pkg.css_r2_bucket,
          });
          await persistThemePackageMeta(env, String(fullRow.id), normalizedSlug, pkg);
          if (tenantStr) {
            await recordCmsThemePackageDeploy(env, {
              tenantId: tenantStr,
              workspaceId,
              bucketName: DEFAULT_R2_BUCKET,
              slug: normalizedSlug,
              themeId: String(fullRow.id),
              assetOrigin: DEFAULT_ASSETS_ORIGIN,
              pkg,
            });
          }
          const refreshed = await env.DB.prepare(`SELECT * FROM cms_themes WHERE id = ?`)
            .bind(fullRow.id)
            .first();
          out.theme = normalizeCatalogThemeRow(/** @type {Record<string, unknown>} */ (refreshed || fullRow));
          out.package_meta = {
            source_hash: pkg.source_hash,
            css_hash: pkg.compiled_css_hash,
            package_hash: pkg.package_hash,
            file_hashes: pkg.file_hashes,
          };
        } catch (e) {
          out.r2_upload_error = e?.message ? String(e.message) : String(e);
        }
      }
      if (!allowIamR2Upload || out.r2_upload_error) {
        out.package_files = {
          "theme.css": pkg.theme_css,
          "theme.json": pkg.theme_json,
          "monaco.json": pkg.monaco_json,
          "manifest.json": pkg.manifest_json,
          "preview.html": pkg.preview_html,
          "README.md": pkg.readme_md,
        };
        out.output_mode_options = ["r2_and_d1", "export_bundle", "workspace_storage"];
        out.package_meta = {
          source_hash: pkg.source_hash,
          css_hash: pkg.compiled_css_hash,
          package_hash: pkg.package_hash,
          file_hashes: pkg.file_hashes,
        };
      }

      return jsonResponse(out);
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
        const okWs = await userCanAccessWorkspace(env, authUser, workspaceId);
        const isSuper = Number(authUser.is_superadmin) === 1;
        if (!okWs && !isSuper) {
          return jsonResponse({ error: "Not allowed for this workspace" }, 403);
        }
      }
      if (scope === "project" && !projectId) {
        return jsonResponse({ error: "project_id required for project scope" }, 400);
      }

      let tenantId = await resolveTenantIdForCmsThemeOps(
        env,
        authUser,
        scope === "user_global" ? null : workspaceId || null,
      );
      if (!tenantId) tenantId = fallbackSystemTenantId(env);

      const tid = String(tenantId).trim();
      const uid = String(authUser.id || "").trim();

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
        if (scope === "workspace" && workspaceId) {
          await patchWorkspaceThemeSlug(env, String(workspaceId).trim(), slug);
        }
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

      await hydrateCmsThemeCssVarsFromR2(env, outRow);

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
