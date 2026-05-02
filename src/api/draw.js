/**
 * src/api/draw.js
 * Collaborative Drawing & Canvas — Excalidraw scene sync + multi-destination export
 * Destinations: R2 (always), Google Drive (user OAuth), GitHub (user OAuth)
 *
 * Routes:
 *   GET  /api/draw/libraries          — list Excalidraw libraries
 *   GET  /api/draw/list               — list user's saved draws
 *   GET  /api/draw/load               — load most recent scene JSON
 *   GET  /api/draw/download/:id       — stream file bytes (R2)
 *   POST /api/draw/save               — save scene JSON or PNG to R2
 *   POST /api/draw/export             — export to R2 + optional GDrive + GitHub
 *   DELETE /api/draw/:id              — delete a draw record + R2 object
 *   GET  /api/draw/connections        — check which exports are connected for user
 */

import { getAuthUser, jsonResponse } from '../core/auth.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const parts     = dataUrl.split(',');
  if (parts.length < 2) return null;
  const mimeMatch = parts[0].match(/:(.*?);/);
  const contentType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return { bytes: u8arr, contentType };
}

function safeFilename(name = '') {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || `draw_${Date.now()}`;
}

// ── Token lookup ──────────────────────────────────────────────────────────────

async function getUserOAuthToken(db, userId, provider) {
  const row = await db.prepare(`
    SELECT access_token, refresh_token, expires_at
    FROM user_oauth_tokens
    WHERE user_id = ? AND provider = ?
    ORDER BY updated_at DESC LIMIT 1
  `).bind(userId, provider).first();
  return row || null;
}

// ── Google Drive export ───────────────────────────────────────────────────────

async function exportToGDrive(db, userId, { bytes, contentType, filename, existingFileId }) {
  const token = await getUserOAuthToken(db, userId, 'google_drive');
  if (!token?.access_token) {
    return { ok: false, error: 'Google Drive not connected. Connect it in Settings → Integrations.' };
  }

  const meta     = JSON.stringify({ name: filename, mimeType: contentType });
  const boundary = '-------IAMDrawBoundary';
  const body     = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
  ];

  // Build multipart body manually (Workers don't have FormData binary support)
  const enc     = new TextEncoder();
  const part1   = enc.encode(body[0]);
  const part2   = enc.encode(body[1]);
  const closing = enc.encode(`\r\n--${boundary}--`);
  const merged  = new Uint8Array(part1.length + part2.length + bytes.length + closing.length);
  merged.set(part1, 0);
  merged.set(part2, part1.length);
  merged.set(bytes, part1.length + part2.length);
  merged.set(closing, part1.length + part2.length + bytes.length);

  // Create new or update existing
  const isUpdate = !!existingFileId;
  const url = isUpdate
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const res = await fetch(url, {
    method:  isUpdate ? 'PATCH' : 'POST',
    headers: {
      'Authorization':  `Bearer ${token.access_token}`,
      'Content-Type':   `multipart/related; boundary="${boundary}"`,
      'Content-Length': String(merged.length),
    },
    body: merged,
  });

  if (!res.ok) {
    const err = await res.text();
    // 401 = token expired
    if (res.status === 401) {
      return { ok: false, error: 'Google Drive token expired. Re-connect in Settings → Integrations.' };
    }
    return { ok: false, error: `Google Drive API error ${res.status}: ${err}` };
  }

  const data = await res.json();
  return {
    ok:        true,
    fileId:    data.id,
    fileName:  data.name,
    webViewLink: `https://drive.google.com/file/d/${data.id}/view`,
  };
}

// ── GitHub export ─────────────────────────────────────────────────────────────

async function exportToGitHub(db, userId, { bytes, filename, repo, path, existingSha, commitMessage }) {
  const token = await getUserOAuthToken(db, userId, 'github');
  if (!token?.access_token) {
    return { ok: false, error: 'GitHub not connected. Connect it in Settings → Integrations.' };
  }

  if (!repo) {
    return { ok: false, error: 'GitHub repo required (format: owner/repo).' };
  }

  const filePath  = path ? `${path.replace(/\/$/, '')}/${filename}` : `excalidraw/${filename}`;
  const b64Content = btoa(String.fromCharCode(...bytes));
  const message   = commitMessage || `[IAM] Update ${filename}`;

  const body = { message, content: b64Content };
  if (existingSha) body.sha = existingSha; // required for updates

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) {
      return { ok: false, error: 'GitHub token expired or revoked. Re-connect in Settings → Integrations.' };
    }
    if (res.status === 422) {
      return { ok: false, error: 'File already exists on GitHub. Provide the existing SHA to update.' };
    }
    return { ok: false, error: `GitHub API error ${res.status}: ${err.message || JSON.stringify(err)}` };
  }

  const data = await res.json();
  return {
    ok:      true,
    sha:     data.content?.sha,
    htmlUrl: data.content?.html_url,
    path:    data.content?.path,
    repo,
  };
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function handleDrawApi(request, url, env, ctx) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method    = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (!env.DB)        return jsonResponse({ error: 'DB not configured' }, 503);
  if (!env.DASHBOARD) return jsonResponse({ error: 'DASHBOARD bucket not configured' }, 503);

  const userId = authUser.id || authUser.user_id || authUser.userId;

  try {
    // ── POST /api/canvas/theme ────────────────────────────────────────────────
    if (pathLower === '/api/canvas/theme' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const workspace_id = String(body.workspace_id || '').trim();
      const theme_slug = String(body.theme_slug || '').trim();
      if (!workspace_id) return jsonResponse({ error: 'workspace_id required' }, 400);
      if (!theme_slug) return jsonResponse({ error: 'theme_slug required' }, 400);

      // Store per-user per-workspace theme in user_workspace_settings (existing schema).
      try {
        await env.DB.prepare(
          `INSERT INTO user_workspace_settings (user_id, workspace_id, theme, updated_at)
           VALUES (?, ?, ?, unixepoch())
           ON CONFLICT(user_id, workspace_id) DO UPDATE SET
             theme = excluded.theme,
             updated_at = excluded.updated_at`,
        )
          .bind(String(userId), workspace_id, theme_slug)
          .run();
      } catch (_) {
        // Fallback for older schema without theme column.
        try {
          await env.DB.prepare(
            `INSERT INTO user_workspace_settings (user_id, workspace_id, updated_at)
             VALUES (?, ?, unixepoch())
             ON CONFLICT(user_id, workspace_id) DO UPDATE SET
               updated_at = excluded.updated_at`,
          )
            .bind(String(userId), workspace_id)
            .run();
        } catch (__) {}
      }

      return jsonResponse({ success: true, theme: theme_slug });
    }

    // ── GET /api/draw/libraries ───────────────────────────────────────────────
    if (pathLower === '/api/draw/libraries' && method === 'GET') {
      const { results } = await env.DB.prepare(`
        SELECT slug, name, filename, category, icon, public_url, r2_dev_url,
               auto_load, agent_tags, description, item_count
        FROM draw_libraries WHERE is_active = 1
        ORDER BY category ASC, sort_order ASC, name ASC
      `).all();
      return jsonResponse({ libraries: results || [] });
    }

    // ── GET /api/draw/list ────────────────────────────────────────────────────
    if (pathLower === '/api/draw/list' && method === 'GET') {
      const projectId = (url.searchParams.get('project_id') || userId).trim();
      const { results } = await env.DB.prepare(`
        SELECT id, project_id, user_id, title, filename, r2_key, generation_type,
               exports_json, gdrive_file_id, github_repo, github_path, github_sha,
               created_at
        FROM project_draws
        WHERE project_id = ? OR user_id = ?
        ORDER BY created_at DESC LIMIT 100
      `).bind(projectId, userId).all();
      return jsonResponse({ draws: results || [] });
    }

    // ── GET /api/draw/load ────────────────────────────────────────────────────
    if (pathLower === '/api/draw/load' && method === 'GET') {
      const sceneRow = await env.DB.prepare(`
        SELECT r2_key FROM project_draws
        WHERE (project_id = ? OR user_id = ?) AND generation_type = 'json_scene'
        ORDER BY created_at DESC LIMIT 1
      `).bind(userId, userId).first();

      if (!sceneRow) return jsonResponse({ scene: null });
      const obj = await env.DASHBOARD.get(sceneRow.r2_key);
      if (!obj) return jsonResponse({ scene: null });
      try {
        return jsonResponse({ scene: JSON.parse(await obj.text()), r2_key: sceneRow.r2_key });
      } catch { return jsonResponse({ scene: null }); }
    }

    // ── GET /api/draw/download/:id ────────────────────────────────────────────
    if (pathLower.startsWith('/api/draw/download/') && method === 'GET') {
      const id  = pathLower.replace('/api/draw/download/', '');
      const row = await env.DB.prepare(`
        SELECT r2_key, filename, generation_type FROM project_draws
        WHERE id = ? AND (project_id = ? OR user_id = ?)
      `).bind(id, userId, userId).first();

      if (!row) return jsonResponse({ error: 'Not found' }, 404);
      const obj = await env.DASHBOARD.get(row.r2_key);
      if (!obj) return jsonResponse({ error: 'File not found in storage' }, 404);

      const contentType = row.generation_type === 'png_export' ? 'image/png' : 'application/json';
      const disposition = `attachment; filename="${row.filename || 'drawing'}"`;
      return new Response(obj.body, {
        headers: {
          'Content-Type':        contentType,
          'Content-Disposition': disposition,
          'Cache-Control':       'private, max-age=3600',
        },
      });
    }

    // ── GET /api/draw/connections ─────────────────────────────────────────────
    if (pathLower === '/api/draw/connections' && method === 'GET') {
      const [gdrive, github] = await Promise.all([
        getUserOAuthToken(env.DB, userId, 'google_drive'),
        getUserOAuthToken(env.DB, userId, 'github'),
      ]);
      return jsonResponse({
        google_drive: !!gdrive?.access_token,
        github:       !!github?.access_token,
      });
    }

    // ── POST /api/draw/save ───────────────────────────────────────────────────
    if (pathLower === '/api/draw/save' && method === 'POST') {
      const body     = await request.json().catch(() => ({}));
      const title    = (body.title || '').trim() || `Drawing ${new Date().toLocaleDateString()}`;
      const filename = safeFilename(body.filename || title);

      // Scene JSON save
      if (body.scene && typeof body.scene === 'object') {
        const r2Key = `draw/scenes/${userId}/${crypto.randomUUID()}.json`;
        await env.DASHBOARD.put(r2Key, JSON.stringify(body.scene), {
          httpMetadata: { contentType: 'application/json' },
        });
        const ins = await env.DB.prepare(`
          INSERT INTO project_draws (project_id, user_id, title, filename, r2_key, generation_type, created_at)
          VALUES (?, ?, ?, ?, ?, 'json_scene', datetime('now'))
        `).bind(userId, userId, title, `${filename}.excalidraw`, r2Key).run();
        return jsonResponse({ ok: true, id: ins?.meta?.last_row_id, r2_key: r2Key });
      }

      // PNG export save
      if (body.canvasData && typeof body.canvasData === 'string') {
        const parsed = parseDataUrl(body.canvasData);
        if (!parsed) return jsonResponse({ error: 'Invalid canvasData' }, 400);
        const r2Key = `draw/exports/${userId}/${crypto.randomUUID()}.png`;
        await env.DASHBOARD.put(r2Key, parsed.bytes, {
          httpMetadata: { contentType: parsed.contentType },
        });
        const ins = await env.DB.prepare(`
          INSERT INTO project_draws (project_id, user_id, title, filename, r2_key, generation_type, created_at)
          VALUES (?, ?, ?, ?, ?, 'png_export', datetime('now'))
        `).bind(userId, userId, title, `${filename}.png`, r2Key).run();
        return jsonResponse({ ok: true, id: ins?.meta?.last_row_id, r2_key: r2Key });
      }

      return jsonResponse({ error: 'scene or canvasData required' }, 400);
    }

    // ── POST /api/draw/export ─────────────────────────────────────────────────
    //
    // Body:
    //   canvasData    string  — data URL (PNG) — required
    //   scene         object  — Excalidraw JSON — optional, saved alongside
    //   title         string  — human name
    //   filename      string  — base filename (no extension)
    //   destinations  array   — ['r2', 'gdrive', 'github'] — defaults to ['r2']
    //   drawId        number  — existing draw ID to update
    //   gdrive        object  — { fileId? }  — optional, for updating existing GDrive file
    //   github        object  — { repo, path?, sha?, commitMessage? }
    //
    if (pathLower === '/api/draw/export' && method === 'POST') {
      const body         = await request.json().catch(() => ({}));
      const title        = (body.title || '').trim() || `Export ${new Date().toLocaleDateString()}`;
      const baseName     = safeFilename(body.filename || title);
      const destinations = Array.isArray(body.destinations) ? body.destinations : ['r2'];

      if (!body.canvasData) return jsonResponse({ error: 'canvasData (PNG data URL) required' }, 400);

      const parsed = parseDataUrl(body.canvasData);
      if (!parsed) return jsonResponse({ error: 'Invalid canvasData' }, 400);

      const pngFilename  = `${baseName}.png`;
      const results = {};

      // ── 1. R2 (always) ──
      const r2Key = `draw/exports/${userId}/${crypto.randomUUID()}.png`;
      await env.DASHBOARD.put(r2Key, parsed.bytes, {
        httpMetadata: { contentType: 'image/png' },
      });
      results.r2 = { ok: true, r2_key: r2Key };

      // Also save scene JSON if provided
      let sceneR2Key = null;
      if (body.scene && typeof body.scene === 'object') {
        sceneR2Key = `draw/scenes/${userId}/${crypto.randomUUID()}.excalidraw`;
        await env.DASHBOARD.put(sceneR2Key, JSON.stringify(body.scene), {
          httpMetadata: { contentType: 'application/json' },
        });
      }

      // ── 2. Google Drive (optional) ──
      let gdriveFileId = body.gdrive?.fileId || null;
      if (destinations.includes('gdrive')) {
        const gd = await exportToGDrive(env.DB, userId, {
          bytes:          parsed.bytes,
          contentType:    'image/png',
          filename:       pngFilename,
          existingFileId: gdriveFileId,
        });
        results.gdrive = gd;
        if (gd.ok) gdriveFileId = gd.fileId;
      }

      // ── 3. GitHub (optional) ──
      let githubSha  = body.github?.sha  || null;
      let githubRepo = body.github?.repo || null;
      let githubPath = null;
      if (destinations.includes('github') && body.github?.repo) {
        const gh = await exportToGitHub(env.DB, userId, {
          bytes:         parsed.bytes,
          filename:      pngFilename,
          repo:          body.github.repo,
          path:          body.github.path || 'excalidraw',
          existingSha:   githubSha,
          commitMessage: body.github.commitMessage,
        });
        results.github = gh;
        if (gh.ok) { githubSha = gh.sha; githubPath = gh.path; githubRepo = gh.repo; }
      }

      // ── Persist to D1 ──
      const exportsJson = JSON.stringify(results);
      let drawId = body.drawId || null;

      if (drawId) {
        await env.DB.prepare(`
          UPDATE project_draws SET
            title = ?, filename = ?, r2_key = ?, generation_type = 'png_export',
            exports_json = ?, gdrive_file_id = ?, github_repo = ?,
            github_path = ?, github_sha = ?
          WHERE id = ? AND (project_id = ? OR user_id = ?)
        `).bind(
          title, pngFilename, r2Key, exportsJson,
          gdriveFileId, githubRepo, githubPath, githubSha,
          drawId, userId, userId
        ).run();
      } else {
        const ins = await env.DB.prepare(`
          INSERT INTO project_draws
            (project_id, user_id, title, filename, r2_key, generation_type,
             exports_json, gdrive_file_id, github_repo, github_path, github_sha, created_at)
          VALUES (?, ?, ?, ?, ?, 'png_export', ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          userId, userId, title, pngFilename, r2Key, exportsJson,
          gdriveFileId, githubRepo, githubPath, githubSha
        ).run();
        drawId = ins?.meta?.last_row_id;
      }

      // Also link scene JSON row if saved
      if (sceneR2Key) {
        await env.DB.prepare(`
          INSERT INTO project_draws
            (project_id, user_id, title, filename, r2_key, generation_type, created_at)
          VALUES (?, ?, ?, ?, ?, 'json_scene', datetime('now'))
        `).bind(userId, userId, title, `${baseName}.excalidraw`, sceneR2Key).run();
      }

      return jsonResponse({
        ok:      true,
        drawId,
        r2_key:  r2Key,
        results,
        // Summarize what actually succeeded
        exported: Object.entries(results)
          .filter(([, v]) => v?.ok)
          .map(([k]) => k),
        errors: Object.entries(results)
          .filter(([, v]) => !v?.ok)
          .reduce((acc, [k, v]) => ({ ...acc, [k]: v.error }), {}),
      });
    }

    // ── DELETE /api/draw/:id ──────────────────────────────────────────────────
    if (pathLower.startsWith('/api/draw/') && method === 'DELETE') {
      const id  = pathLower.replace('/api/draw/', '');
      const row = await env.DB.prepare(`
        SELECT r2_key FROM project_draws WHERE id = ? AND (project_id = ? OR user_id = ?)
      `).bind(id, userId, userId).first();

      if (!row) return jsonResponse({ error: 'Not found or not yours' }, 404);

      await Promise.all([
        env.DASHBOARD.delete(row.r2_key).catch(() => {}),
        env.DB.prepare(`DELETE FROM project_draws WHERE id = ?`).bind(id).run(),
      ]);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Draw route not found' }, 404);

  } catch (e) {
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}
