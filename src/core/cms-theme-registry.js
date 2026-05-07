/**
 * Optional D1 writes for R2 deploy manifests + inventory (reuse existing tables).
 * Failures are logged; callers always continue.
 */

/**
 * Merge package_meta into cms_themes.tokens_json (compact metadata).
 * @param {string | null | undefined} tokensJsonStr
 * @param {Record<string, unknown>} packageMeta
 */
export function mergePackageMetaIntoTokensJson(tokensJsonStr, packageMeta) {
  /** @type {Record<string, unknown>} */
  let obj = {};
  try {
    if (tokensJsonStr != null && String(tokensJsonStr).trim() !== "") {
      const p = JSON.parse(String(tokensJsonStr));
      if (p && typeof p === "object" && !Array.isArray(p)) obj = /** @type {Record<string, unknown>} */ (p);
    }
  } catch {
    obj = {};
  }
  obj.package_meta = { ...packageMeta };
  return JSON.stringify(obj);
}

/**
 * @param {any} env
 * @param {{
 *   tenantId: string,
 *   workspaceId: string,
 *   bucketName: string,
 *   slug: string,
 *   themeId: string,
 *   assetOrigin: string,
 *   pkg: {
 *     theme_css: string,
 *     theme_json: string,
 *     monaco_json: string,
 *     manifest_json: string,
 *     preview_html: string,
 *     readme_md: string,
 *     file_hashes: Record<string, string>,
 *     source_hash: string,
 *     package_hash: string,
 *     compiled_css_hash: string,
 *     version_prefix: string,
 *     public_base?: string,
 *   },
 * }} args
 */
export async function recordCmsThemePackageDeploy(env, args) {
  if (!env?.DB) return;
  const tid = String(args.tenantId || "").trim();
  const ws = String(args.workspaceId || "").trim();
  const bucket = String(args.bucketName || "").trim();
  const slug = String(args.slug || "").trim();
  const pkg = args.pkg;
  const themeId = String(args.themeId || "").trim();
  const assetOrigin = String(args.assetOrigin || "https://assets.inneranimalmedia.com").replace(/\/$/, "");
  if (!tid || !ws || !bucket || !slug || !pkg || !themeId) return;

  const projectId = "cms-themes";
  const deployId = `theme_pkg_${slug}_${pkg.source_hash.slice(0, 16)}`;
  const manifestId = `r2dm_theme_${slug.replace(/[^a-zA-Z0-9_-]/g, "_")}_${pkg.source_hash.slice(0, 12)}`;

  const manifestSummary = {
    kind: "cms_theme_package",
    theme_id: themeId,
    slug,
    source_hash: pkg.source_hash,
    package_hash: pkg.package_hash,
    css_hash: pkg.compiled_css_hash,
    file_hashes: pkg.file_hashes,
  };

  const artifacts = [
    ["theme.css", pkg.theme_css, "text/css; charset=utf-8"],
    ["theme.json", pkg.theme_json, "application/json; charset=utf-8"],
    ["monaco.json", pkg.monaco_json, "application/json; charset=utf-8"],
    ["manifest.json", pkg.manifest_json, "application/json; charset=utf-8"],
    ["preview.html", pkg.preview_html, "text/html; charset=utf-8"],
    ["README.md", pkg.readme_md, "text/markdown; charset=utf-8"],
  ];

  let totalBytes = 0;
  for (const [, body] of artifacts) {
    totalBytes += new TextEncoder().encode(body).length;
  }

  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO r2_deploy_manifests (
        id, tenant_id, workspace_id, project_id, bucket_name, site_slug, deploy_id,
        source, manifest_json, object_count, total_size_bytes, status, applied_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied', datetime('now'))`,
    )
      .bind(
        manifestId,
        tid,
        ws,
        projectId,
        bucket,
        slug,
        deployId,
        "cms_theme_package",
        JSON.stringify(manifestSummary),
        artifacts.length,
        totalBytes,
      )
      .run();
  } catch (e) {
    console.warn("[cms-theme-registry] r2_deploy_manifests skipped:", e?.message ?? e);
    return;
  }

  const registerObject = async (objectKey, fname, body, contentType, sha, metaExtra) => {
    const bytes = new TextEncoder().encode(body).length;
    const pubUrl = `${assetOrigin}/${objectKey}`;
    const oid = `${manifestId}_${objectKey.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    try {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO r2_deploy_manifest_objects (
          id, manifest_id, bucket_name, object_key, size_bytes, content_type,
          sha256_hash, r2_public_url, status, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?)`,
      )
        .bind(
          oid,
          manifestId,
          bucket,
          objectKey,
          bytes,
          contentType.split(";")[0].trim(),
          sha,
          pubUrl,
          JSON.stringify({ theme_id: themeId, slug, fname, ...metaExtra }),
        )
        .run();
    } catch (e) {
      console.warn("[cms-theme-registry] manifest_object skipped:", objectKey, e?.message ?? e);
    }

    try {
      await env.DB.prepare(
        `INSERT INTO r2_object_inventory (
          bucket_name, object_key, size_bytes,
          tenant_id, workspace_id, project_id,
          status, content_hash,
          last_seen_at, inventoried_at, edited_by, deploy_id, last_seen_deploy_id
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, datetime('now'), datetime('now'), ?, ?, ?)
        ON CONFLICT(bucket_name, object_key) DO UPDATE SET
          size_bytes = excluded.size_bytes,
          tenant_id = excluded.tenant_id,
          workspace_id = excluded.workspace_id,
          project_id = excluded.project_id,
          status = 'active',
          content_hash = excluded.content_hash,
          last_seen_at = excluded.last_seen_at,
          inventoried_at = excluded.inventoried_at,
          deploy_id = excluded.deploy_id,
          last_seen_deploy_id = excluded.last_seen_deploy_id`,
      )
        .bind(
          bucket,
          objectKey,
          bytes,
          tid,
          ws,
          projectId,
          sha,
          "cms_theme_package",
          deployId,
          deployId,
        )
        .run();
    } catch (e) {
      console.warn("[cms-theme-registry] inventory skipped:", objectKey, e?.message ?? e);
    }
  };

  for (const [fname, body, ct] of artifacts) {
    const objectKey = `cms/themes/${slug}/${fname}`;
    const sha = pkg.file_hashes[fname] || "";
    await registerObject(objectKey, fname, body, ct, sha, { channel: "latest" });
  }

  const vprefix = String(pkg.version_prefix || "").trim();
  if (vprefix) {
    for (const [fname, body, ct] of artifacts) {
      const objectKey = `${vprefix.replace(/\/$/, "")}/${fname}`;
      const sha = pkg.file_hashes[fname] || "";
      await registerObject(objectKey, fname, body, ct, sha, { channel: "versioned", source_hash: pkg.source_hash });
    }
  }
}
