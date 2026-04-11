/**
 * API Layer: Collaborative Drawing & Canvas
 * Excalidraw scene sync, R2-backed library loading, agent blueprint assistance,
 * and live DO-backed canvas broadcasting so Sam can watch Agent Sam draw in real time.
 *
 * Agent Sam workflow:
 *   1. GET /api/draw/libraries/for-task?task=... → pick best libraries
 *   2. GET /api/draw/library/:slug              → load library JSON from R2/public URL
 *   3. POST /api/draw/elements                  → push elements to DO (broadcasts live)
 *   4. POST /api/draw/save                      → persist scene to R2 + D1
 *
 * Tables: draw_libraries, project_draws
 * Bindings: env.DASHBOARD (R2), env.IAM_COLLAB (DO)
 */
import { jsonResponse }          from '../core/responses.js';
import { getAuthUser }           from '../core/auth.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDataUrlToBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const parts     = dataUrl.split(',');
  if (parts.length < 2) return null;
  const mimeMatch = parts[0].match(/:(.*?);/);
  const ct        = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr      = atob(parts[1]);
  let n           = bstr.length;
  const u8        = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return { bytes: u8, contentType: ct };
}

/** Get IAMCollaborationSession DO stub for a canvas room. */
function getCanvasDO(env, roomId) {
  if (!env.IAM_COLLAB) return null;
  return env.IAM_COLLAB.get(env.IAM_COLLAB.idFromName(String(roomId)));
}

/**
 * Tag-based library scoring: returns libraries sorted by relevance to a task string.
 * Scores by how many agent_tags overlap with words in the task.
 */
function scoreLibraries(libraries, task) {
  const words = task.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return libraries
    .map(lib => {
      let tags = [];
      try { tags = JSON.parse(lib.agent_tags || '[]'); } catch (_) {}
      const score = tags.filter(t => words.some(w => t.includes(w) || w.includes(t))).length
                  + (lib.auto_load ? 0.5 : 0);
      return { ...lib, _score: score };
    })
    .filter(l => l._score > 0)
    .sort((a, b) => b._score - a._score);
}

/**
 * Blueprint type → library slug recommendations.
 * Agent Sam uses this to know which libraries to load before drawing.
 */
const BLUEPRINT_LIBRARY_MAP = {
  system_architecture: ['software-arch', 'systems-design-components', 'arch-components', 'decision-flow'],
  api_design:          ['software-arch', 'uml-er', 'decision-flow', 'arch-components'],
  database_schema:     ['uml-er', 'algorithms-ds', 'arch-components'],
  wireframe:           ['ux-wireframe', 'lofi-wireframe', 'webpage-frames'],
  ui_design:           ['ux-wireframe', 'webpage-frames', 'icons', 'awesome-icons'],
  user_flow:           ['decision-flow', 'stick-figures', 'ux-wireframe'],
  infrastructure:      ['systems-design-components', 'cloud', 'aws-lite', 'network-topology', 'devops'],
  data_pipeline:       ['data-viz', 'algorithms-ds', 'decision-flow', 'system-design'],
  project_plan:        ['gantt', 'decision-flow', 'stick-figures'],
  brainstorm:          ['decision-flow', 'stick-figures', 'icons', 'drwnio'],
  er_diagram:          ['uml-er', 'algorithms-ds'],
  sequence_diagram:    ['uml-er', 'software-arch', 'stick-figures'],
  deployment:          ['devops', 'cloud', 'systems-design-components', 'software-arch'],
  ml_pipeline:         ['deep-learning', 'data-viz', 'algorithms-ds', 'decision-flow'],
};

/** Detect blueprint type from a natural language description. */
function detectBlueprintType(description) {
  const d = description.toLowerCase();
  if (/wireframe|ui|interface|screen|page|layout|mobile/.test(d))    return 'wireframe';
  if (/database|schema|table|er diagram|entity/.test(d))             return 'database_schema';
  if (/api|endpoint|route|rest|graphql|openapi/.test(d))             return 'api_design';
  if (/infrastructure|aws|cloud|server|kubernetes|docker/.test(d))   return 'infrastructure';
  if (/user flow|journey|onboarding|signup|login/.test(d))           return 'user_flow';
  if (/gantt|timeline|sprint|roadmap|milestone/.test(d))             return 'project_plan';
  if (/data pipeline|etl|transform|stream|kafka/.test(d))            return 'data_pipeline';
  if (/ml|machine learning|neural|model|training/.test(d))           return 'ml_pipeline';
  if (/deploy|ci\/cd|pipeline|release|github action/.test(d))        return 'deployment';
  if (/sequence|interaction|message|protocol/.test(d))               return 'sequence_diagram';
  if (/brainstorm|idea|concept|mind map/.test(d))                    return 'brainstorm';
  if (/er diagram|relationship|entity/.test(d))                      return 'er_diagram';
  return 'system_architecture'; // default to most useful
}

/** Canvas color palettes for different blueprint types. */
const PALETTES = {
  system_architecture: { bg: '#f8f9fa', primary: '#4a9eda', secondary: '#98c379', accent: '#e5c07b', text: '#1e1e1e' },
  wireframe:           { bg: '#ffffff', primary: '#868e96', secondary: '#dee2e6', accent: '#495057', text: '#212529' },
  database_schema:     { bg: '#f8f9fa', primary: '#6f42c1', secondary: '#d0bfff', accent: '#e06c75', text: '#1e1e1e' },
  infrastructure:      { bg: '#0d1117', primary: '#58a6ff', secondary: '#3fb950', accent: '#f85149', text: '#c9d1d9' },
  data_pipeline:       { bg: '#f8f9fa', primary: '#0369a1', secondary: '#7dd3fc', accent: '#f59e0b', text: '#1e1e1e' },
  brainstorm:          { bg: '#fffbeb', primary: '#d97706', secondary: '#fcd34d', accent: '#059669', text: '#1c1917' },
  default:             { bg: '#ffffff', primary: '#4a9eda', secondary: '#98c379', accent: '#e5c07b', text: '#1e1e1e' },
};

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function handleDrawApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (!env.DB)        return jsonResponse({ error: 'DB not configured' }, 503);
  if (!env.DASHBOARD) return jsonResponse({ error: 'DASHBOARD bucket not configured' }, 503);

  try {

    // ── GET /api/draw/libraries ───────────────────────────────────────────────
    // Full library catalog — used by draw panel UI to populate library picker
    if (path === '/api/draw/libraries' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT slug, name, category, icon, public_url, r2_dev_url,
                auto_load, agent_tags, description, item_count
         FROM draw_libraries WHERE is_active = 1
         ORDER BY category ASC, sort_order ASC, name ASC`
      ).all();
      return jsonResponse({ libraries: results || [] });
    }

    // ── GET /api/draw/libraries/for-task ──────────────────────────────────────
    // Agent Sam calls this to pick which libraries to load before drawing.
    // Returns ranked library list with public URLs ready to load.
    if (path === '/api/draw/libraries/for-task' && method === 'GET') {
      const task  = (url.searchParams.get('task') || url.searchParams.get('q') || '').trim();
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 10);

      const { results } = await env.DB.prepare(
        `SELECT slug, name, category, icon, public_url, r2_dev_url, agent_tags, auto_load
         FROM draw_libraries WHERE is_active = 1`
      ).all();

      const ranked = task
        ? scoreLibraries(results || [], task).slice(0, limit)
        : (results || []).filter(l => l.auto_load).slice(0, limit);

      return jsonResponse({
        task,
        libraries: ranked.map(l => ({
          slug:         l.slug,
          name:         l.name,
          category:     l.category,
          url:          l.r2_dev_url || l.public_url,
          auto_load:    !!l.auto_load,
          agent_tags:   l.agent_tags,
        })),
      });
    }

    // ── GET /api/draw/library/:slug ───────────────────────────────────────────
    // Fetch library JSON by slug. Agent Sam uses this before loading into canvas.
    // Tries R2 binding first, falls back to public URL.
    const libSlugMatch = path.match(/^\/api\/draw\/library\/([^/]+)$/);
    if (libSlugMatch && method === 'GET') {
      const slug = libSlugMatch[1];
      const row  = await env.DB.prepare(
        `SELECT slug, name, r2_key, r2_bucket, public_url, r2_dev_url
         FROM draw_libraries WHERE slug = ? AND is_active = 1 LIMIT 1`
      ).bind(slug).first();

      if (!row) return jsonResponse({ error: `Library not found: ${slug}` }, 404);

      // Try R2 binding if it's in the tools bucket (we use env.DASHBOARD as fallback)
      let libJson = null;
      try {
        const obj = await env.DASHBOARD.get(row.r2_key);
        if (obj) libJson = await obj.json();
      } catch (_) {}

      // Fall back to public URL
      if (!libJson) {
        try {
          const fetchUrl = row.r2_dev_url || row.public_url;
          const res      = await fetch(fetchUrl, { signal: AbortSignal.timeout(10000) });
          if (res.ok) libJson = await res.json();
        } catch (_) {}
      }

      if (!libJson) return jsonResponse({ error: `Could not load library: ${slug}` }, 502);

      return jsonResponse({ slug, name: row.name, library: libJson });
    }

    // ── GET /api/draw/blueprint-plan ─────────────────────────────────────────
    // Agent Sam calls this first when given a drawing task.
    // Returns: blueprint type, recommended libraries, palette, canvas hints.
    // Agent Sam then uses this to structure its drawing approach.
    if (path === '/api/draw/blueprint-plan' && method === 'GET') {
      const description = (url.searchParams.get('description') || url.searchParams.get('q') || '').trim();
      if (!description) return jsonResponse({ error: 'description required' }, 400);

      const type          = detectBlueprintType(description);
      const suggestedSlugs = BLUEPRINT_LIBRARY_MAP[type] || BLUEPRINT_LIBRARY_MAP.system_architecture;
      const palette        = PALETTES[type] || PALETTES.default;

      // Fetch library details for suggested slugs
      const placeholders = suggestedSlugs.map(() => '?').join(',');
      const { results }  = await env.DB.prepare(
        `SELECT slug, name, category, public_url, r2_dev_url, agent_tags
         FROM draw_libraries WHERE slug IN (${placeholders}) AND is_active = 1`
      ).bind(...suggestedSlugs).all();

      const libMap  = Object.fromEntries((results || []).map(r => [r.slug, r]));
      const libraries = suggestedSlugs
        .filter(s => libMap[s])
        .map(s => ({
          slug:  s,
          name:  libMap[s].name,
          url:   libMap[s].r2_dev_url || libMap[s].public_url,
          category: libMap[s].category,
        }));

      return jsonResponse({
        description,
        blueprint_type:    type,
        libraries,
        palette,
        canvas_hints: {
          start_x:        100,
          start_y:        100,
          gap_x:          200,
          gap_y:          150,
          default_width:  180,
          default_height:  80,
          font_size:       16,
          roughness:        0,  // 0 = clean/sharp, 1 = hand-drawn
          stroke_width:     1,
        },
        agent_instructions: [
          `Blueprint type detected: ${type}`,
          `Load these libraries first using excalidraw_load_library for each slug.`,
          `Use the palette colors for consistency: primary=${palette.primary}, secondary=${palette.secondary}`,
          `Start elements at x:100, y:100. Use ${200}px horizontal gaps, ${150}px vertical gaps.`,
          `Set roughness:0 for clean diagrams. Use font_size:16 for labels.`,
          `Always add a text label to every shape using boundElements + containerId pattern.`,
          `After drawing, call POST /api/draw/save to persist.`,
        ],
      });
    }

    // ── POST /api/draw/elements ───────────────────────────────────────────────
    // Push Excalidraw elements to the live canvas.
    // DO broadcasts to all connected clients — Sam sees it appear in real time.
    if (path === '/api/draw/elements' && method === 'POST') {
      const body      = await request.json().catch(() => ({}));
      const elements  = body.elements;
      const roomId    = body.room_id || body.session_id || body.project_id || 'default';
      const projectId = body.project_id || roomId;
      const append    = body.append !== false; // default: append, not replace

      if (!Array.isArray(elements)) return jsonResponse({ error: 'elements array required' }, 400);

      // Push to DO for live broadcast
      const stub = getCanvasDO(env, roomId);
      if (stub) {
        stub.fetch(new Request('https://do/canvas/elements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ elements, append }),
        })).catch(() => {});
      }

      // Persist to R2 (read current → merge if appending → write back)
      const r2Key = `canvas/${projectId}/elements.json`;
      let finalElements = elements;

      if (append) {
        try {
          const existing = await env.DASHBOARD.get(r2Key);
          if (existing) {
            const current = JSON.parse(await existing.text());
            // Merge by id — new elements override existing ones with same id
            const idMap = new Map((current || []).map(e => [e.id, e]));
            for (const el of elements) idMap.set(el.id, el);
            finalElements = [...idMap.values()];
          }
        } catch (_) {}
      }

      await env.DASHBOARD.put(r2Key, JSON.stringify(finalElements), {
        httpMetadata: { contentType: 'application/json' },
      });

      // Update project_draws record
      await env.DB.prepare(
        `INSERT OR REPLACE INTO project_draws (project_id, r2_key, generation_type, created_at)
         VALUES (?, ?, 'live_elements', datetime('now'))`
      ).bind(projectId, r2Key).run().catch(() => {});

      return jsonResponse({ ok: true, elements_count: finalElements.length, room_id: roomId });
    }

    // ── GET /api/draw/state ───────────────────────────────────────────────────
    // Get current canvas state. Tries DO first (hot), falls back to R2.
    if (path === '/api/draw/state' && method === 'GET') {
      const projectId = url.searchParams.get('project_id') || 'default';
      const roomId    = url.searchParams.get('room_id') || projectId;

      const stub = getCanvasDO(env, roomId);
      if (stub) {
        try {
          const res  = await stub.fetch(new Request('https://do/canvas/state'));
          const data = await res.json();
          if (data.canvasElements?.length) {
            return jsonResponse({ elements: data.canvasElements, source: 'do', room_id: roomId });
          }
        } catch (_) {}
      }

      // Fall back to R2
      try {
        const obj = await env.DASHBOARD.get(`canvas/${projectId}/elements.json`);
        if (obj) {
          const elements = JSON.parse(await obj.text());
          return jsonResponse({ elements, source: 'r2', room_id: roomId });
        }
      } catch (_) {}

      return jsonResponse({ elements: [], source: 'empty', room_id: roomId });
    }

    // ── DELETE /api/draw/state ────────────────────────────────────────────────
    // Clear canvas. Agent Sam uses this before starting a fresh blueprint.
    if (path === '/api/draw/state' && method === 'DELETE') {
      const projectId = url.searchParams.get('project_id') || 'default';
      const roomId    = url.searchParams.get('room_id') || projectId;

      const stub = getCanvasDO(env, roomId);
      if (stub) {
        stub.fetch(new Request('https://do/canvas/elements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ elements: [], append: false }),
        })).catch(() => {});
      }

      await env.DASHBOARD.delete(`canvas/${projectId}/elements.json`).catch(() => {});
      return jsonResponse({ ok: true, cleared: true });
    }

    // ── POST /api/draw/save ───────────────────────────────────────────────────
    // Persist a scene (JSON or PNG export) to R2 + D1.
    if (path === '/api/draw/save' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const uid  = String(authUser.id || '').trim();

      // Scene JSON save
      if (body.scene && typeof body.scene === 'object') {
        const r2Key = `draw/scenes/${uid}/${crypto.randomUUID()}.json`;
        await env.DASHBOARD.put(r2Key, JSON.stringify(body.scene), {
          httpMetadata: { contentType: 'application/json' },
        });
        const ins = await env.DB.prepare(
          `INSERT INTO project_draws (project_id, r2_key, generation_type, created_at)
           VALUES (?, ?, 'json_scene', datetime('now'))`
        ).bind(uid, r2Key).run();
        return jsonResponse({ ok: true, id: ins?.meta?.last_row_id, key: r2Key });
      }

      // PNG export save
      if (body.canvasData && typeof body.canvasData === 'string') {
        const parsed = parseDataUrlToBytes(body.canvasData);
        if (!parsed) return jsonResponse({ error: 'Invalid canvasData' }, 400);
        const projectId = String(body.projectId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
        const r2Key     = `draw/exports/${projectId}/${crypto.randomUUID()}.png`;
        await env.DASHBOARD.put(r2Key, parsed.bytes, {
          httpMetadata: { contentType: parsed.contentType },
        });
        const ins = await env.DB.prepare(
          `INSERT INTO project_draws (project_id, r2_key, generation_type, created_at)
           VALUES (?, ?, 'png_export', datetime('now'))`
        ).bind(projectId, r2Key).run();
        return jsonResponse({ ok: true, id: ins?.meta?.last_row_id, r2_key: r2Key });
      }

      return jsonResponse({ error: 'scene or canvasData required' }, 400);
    }

    // ── GET /api/draw/load ────────────────────────────────────────────────────
    // Load most recent scene for current user.
    if (path === '/api/draw/load' && method === 'GET') {
      const uid     = String(authUser.id || '').trim();
      const sceneRow = await env.DB.prepare(
        `SELECT r2_key FROM project_draws
         WHERE project_id = ? AND generation_type = 'json_scene'
         ORDER BY created_at DESC LIMIT 1`
      ).bind(uid).first();

      if (!sceneRow) return jsonResponse({ scene: null });

      try {
        const obj = await env.DASHBOARD.get(sceneRow.r2_key);
        if (!obj) return jsonResponse({ scene: null });
        return jsonResponse({ scene: JSON.parse(await obj.text()), r2_key: sceneRow.r2_key });
      } catch (_) {
        return jsonResponse({ scene: null });
      }
    }

    // ── GET /api/draw/list ────────────────────────────────────────────────────
    // List saved scenes for a project.
    if (path === '/api/draw/list' && method === 'GET') {
      const projectId = (url.searchParams.get('project_id') || 'default').trim();
      const { results } = await env.DB.prepare(
        `SELECT id, project_id, r2_key, generation_type, created_at
         FROM project_draws WHERE project_id = ? ORDER BY created_at DESC LIMIT 100`
      ).bind(projectId).all();
      return jsonResponse({ draws: results || [] });
    }

    return jsonResponse({ error: 'Draw route not found', path }, 404);

  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}
