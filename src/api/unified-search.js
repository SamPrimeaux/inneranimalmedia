/**
 * Unified Cmd+K search — D1 + Supabase pgvector (Hyperdrive).
 */
import { jsonResponse } from '../core/responses.js';
import { getAuthUser, fetchAuthUserTenantId, platformTenantIdFromEnv } from '../core/auth.js';
import { isHyperdriveUsable, runHyperdriveQuery } from '../core/hyperdrive-query.js';
import { documentsSourceFilterSql, normalizeSourceFilters } from '../core/unified-source-filters.js';
import { resolveGitHubToken } from '../core/github-token.js';
import { fetchWorkspaceGithubRepo } from '../core/status-bar-runtime.js';
import { logSemanticSearch } from './rag.js';

/** @param {any} authUser */
function resolveSearchAnalyticsWorkspaceId(authUser) {
  const ws =
    authUser?.active_workspace_id ??
    authUser?.workspace_id ??
    authUser?.activeWorkspaceId ??
    null;
  return ws != null && String(ws).trim() !== '' ? String(ws).trim() : null;
}

/** @param {any} env @param {any} authUser @param {string|null} userId */
async function resolveSearchAnalyticsTenantId(env, authUser, userId) {
  const fromUser =
    authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
      ? String(authUser.tenant_id).trim()
      : null;
  if (fromUser) return fromUser;
  if (userId) {
    const tid = await fetchAuthUserTenantId(env, userId);
    if (tid && String(tid).trim()) return String(tid).trim();
  }
  return platformTenantIdFromEnv(env) || null;
}

/**
 * Must match `public.documents.embed_model` + `vector(1024)` ingest (Workers AI bge-m3).
 * Optional override: env.UNIFIED_SEARCH_EMBED_MODEL (same dims as stored rows only).
 */
function unifiedSearchEmbedModel(env) {
  const o =
    typeof env?.UNIFIED_SEARCH_EMBED_MODEL === 'string' ? env.UNIFIED_SEARCH_EMBED_MODEL.trim() : '';
  return o || '@cf/baai/bge-m3';
}

/** @param {any} env */
function ragDocumentsProjectId(env) {
  return typeof env?.RAG_DOCUMENTS_PROJECT_ID === 'string' && env.RAG_DOCUMENTS_PROJECT_ID.trim()
    ? env.RAG_DOCUMENTS_PROJECT_ID.trim()
    : null;
}

/** Mirrors `projectIdFromEnv` in agent routes — Worker identity for github_repositories lookup. */
function projectIdFromEnv(env) {
  const candidates = [env?.PROJECT_ID, env?.WORKER_NAME, env?.CLOUDFLARE_WORKER_NAME];
  for (const c of candidates) {
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return 'inneranimalmedia';
}

/** Vector/doc facets only — workspace/branch/repo are appended separately. */
function documentFacetIdsOnly(facetIds) {
  return facetIds.filter((f) => f !== 'workspace' && f !== 'branch' && f !== 'repo');
}

/**
 * @param {any} env
 * @param {string} sql
 * @param {unknown[]} params
 */
async function hyperdriveQuery(env, sql, params) {
  if (!isHyperdriveUsable(env)) return [];
  const r = await runHyperdriveQuery(env, sql, params);
  if (!r.ok) {
    console.warn('[unified-search] hyperdrive', r.error ?? 'query_failed');
    return [];
  }
  return r.rows ?? [];
}

/**
 * Single-facet → RPC prefix / LIKE (must match DB convention: prefix without trailing %).
 * `scripts` uses OR patterns → caller uses raw SQL path instead of RPC.
 *
 * @param {string} facetId
 * @returns {{ prefix: string | null, like: string | null }}
 */
function facetToRpcPrefixLike(facetId) {
  switch (facetId) {
    case 'docs':
      return { prefix: 'docs:', like: null };
    case 'd1':
      return { prefix: 'd1:', like: null };
    case 'commands':
      return { prefix: 'd1:commands', like: null };
    case 'rules':
      return { prefix: null, like: '%agent_rules%' };
    case 'guardrails':
      return { prefix: null, like: '%guardrails%' };
    case 'memory':
      return { prefix: null, like: '%project_memory%' };
    case 'codebase':
      return { prefix: null, like: '%codebase%' };
    case 'scripts':
      return { prefix: null, like: null };
    case 'workspace':
    case 'branch':
    case 'repo':
      return { prefix: null, like: null }; // handled separately, not via RPC
    default:
      return { prefix: null, like: null };
  }
}

/**
 * Multi-facet OR + scripts bucket need legacy WHERE; scoped RPC supports one prefix XOR one like.
 *
 * @param {string[]} facetIds
 */
function useScopedRpcForFacets(facetIds) {
  if (facetIds.length > 1) return false;
  if (facetIds.length === 1 && facetIds[0] === 'scripts') return false;
  return true;
}

/**
 * @param {Record<string, unknown>} row
 */
function mapDocumentRowToHit(row) {
  const sim = Number(row.similarity ?? 0);
  let meta = row.metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  const m = meta && typeof meta === 'object' ? meta : {};
  const src = typeof row.source === 'string' ? row.source : '';
  const previewRaw =
    typeof row.content_preview === 'string'
      ? row.content_preview
      : typeof row.content === 'string'
        ? row.content
        : '';
  const title =
    (typeof row.title === 'string' && row.title.trim()) ||
    (typeof m.title === 'string' && m.title) ||
    (previewRaw ? previewRaw.slice(0, 120) : 'Document');
  const metaSrc =
    (typeof m.source === 'string' && m.source) ||
    (typeof m.snippet === 'string' && m.snippet) ||
    '';
  const previewLine = previewRaw ? previewRaw.slice(0, 160) : '';
  const subtitle = [src || null, metaSrc || previewLine].filter(Boolean).join(' · ') || undefined;
  const url = typeof m.url === 'string' ? m.url : null;
  return {
    type: 'knowledge',
    id: String(row.id ?? ''),
    title,
    subtitle,
    score: sim,
    url,
    source: src,
  };
}

/**
 * @param {any} env
 * @param {string} query
 * @param {number} limit
 * @param {{
 *   sourceFilters?: unknown,
 *   matchThreshold?: number,
 *   tenantId?: string | null,
 *   workspaceId?: string | null,
 *   projectId?: string | null,
 *   sessionId?: string | null,
 *   queryPreview?: string,
 * }} [opts]
 */
async function searchDocumentsVector(env, query, limit, opts = {}) {
  if (!env?.AI || !isHyperdriveUsable(env)) return [];
  const t0 = Date.now();
  let embResult;
  try {
    embResult = await env.AI.run(unifiedSearchEmbedModel(env), { text: String(query || '').trim() });
  } catch (e) {
    console.warn('[unified-search] embed', e?.message ?? e);
    return [];
  }
  const vec = embResult?.data?.[0] ?? embResult?.result?.[0];
  if (!Array.isArray(vec) || !vec.length) return [];

  const embedding = JSON.stringify(vec);
  const lim = Math.min(Math.max(1, limit), 50);
  const thresholdRaw = Number(opts.matchThreshold);
  const threshold =
    Number.isFinite(thresholdRaw) && thresholdRaw >= 0 && thresholdRaw <= 1 ? thresholdRaw : 0.45;

  const facetIds = normalizeSourceFilters(opts.sourceFilters);
  const sourceSql = documentsSourceFilterSql(facetIds);
  const embedModel = unifiedSearchEmbedModel(env);

  const tid = opts.tenantId != null ? String(opts.tenantId).trim() : '';
  const ws = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  const pid = opts.projectId != null ? String(opts.projectId).trim() : '';

  /** @type {Record<string, unknown>[]} */
  let rows = [];
  let filledBy = /** @type {'none' | 'match_documents_scoped' | 'documents_sql_fallback'} */ ('none');

  const tryRpc = useScopedRpcForFacets(facetIds);
  if (tryRpc) {
    let prefix = /** @type {string | null} */ (null);
    let like = /** @type {string | null} */ (null);
    if (facetIds.length === 1) {
      const fl = facetToRpcPrefixLike(facetIds[0]);
      prefix = fl.prefix;
      like = fl.like;
    }

    rows = await hyperdriveQuery(
      env,
      `SELECT * FROM public.match_documents_scoped(
        $1::vector(1024),
        $2::double precision,
        $3::integer,
        $4::text,
        $5::text,
        $6::text,
        $7::text,
        $8::text,
        $9::text
      )`,
      [
        embedding,
        threshold,
        lim,
        tid || null,
        ws || null,
        pid || null,
        embedModel,
        prefix,
        like,
      ],
    );
    if (rows.length) filledBy = 'match_documents_scoped';
  }

  if (!tryRpc || rows.length === 0) {
    const params = /** @type {unknown[]} */ ([embedding, threshold]);
    let scopeSql = '';
    if (tid) {
      params.push(tid);
      scopeSql += ` AND tenant_id = $${params.length}`;
    }
    if (ws) {
      params.push(ws);
      scopeSql += ` AND workspace_id = $${params.length}`;
    }
    if (pid) {
      params.push(pid);
      scopeSql += ` AND project_id = $${params.length}`;
    }

    params.push(lim);
    const limitIdx = params.length;

    rows = await hyperdriveQuery(
      env,
      `SELECT id, source, title,
            LEFT(content, 280) AS content_preview,
            metadata,
            1 - (embedding <=> $1::vector(1024)) AS similarity
     FROM public.documents
     WHERE (1 - (embedding <=> $1::vector(1024))) >= $2
     ${scopeSql}${sourceSql}
     ORDER BY embedding <=> $1::vector(1024)
     LIMIT $${limitIdx}`,
      params,
    );
    if (rows.length) filledBy = filledBy === 'match_documents_scoped' ? 'match_documents_scoped' : 'documents_sql_fallback';
  }

  /** @type {{ type: string, id: string, title: string, subtitle?: string, score: number, url?: string | null, source?: string }[]} */
  const out = [];
  for (const row of rows) {
    out.push(mapDocumentRowToHit(row));
  }

  const scores = out.map((r) => r.score).filter((s) => Number.isFinite(s));
  const topSim = scores.length ? Math.max(...scores) : null;
  const avgSim = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const sourcesDistinct = [...new Set(out.map((r) => r.source).filter(Boolean))];

  await logSemanticSearch(env, {
    searchFn: 'unified_search.documents',
    tenantId: tid || null,
    sessionId: opts.sessionId ?? null,
    queryPreview: opts.queryPreview ?? query,
    matchThreshold: threshold,
    matchCountRequested: lim,
    matchCountReturned: out.length,
    topSimilarity: topSim,
    avgSimilarity: avgSim,
    sourcesHit: sourcesDistinct,
    latencyMs: Date.now() - t0,
    metadata: {
      workspace_id: ws || null,
      project_id: pid || null,
      embed_model: embedModel,
      facet_ids: facetIds,
      filled_by: filledBy,
    },
  });

  return out.map(({ source: _s, ...rest }) => rest);
}

/**
 * @param {any} env
 * @param {any} authUser
 * @param {{ type: string, id: string, title: string, subtitle?: string, score: number, url?: string|null, sql_text?: string }[]} merged
 * @param {string} rawQ
 * @param {string[]} facetIds
 */
async function appendStructuralFacetResults(env, authUser, merged, rawQ, facetIds, request, url) {
  const qPat = `%${rawQ}%`;

  if (facetIds.includes('workspace') && env.DB) {
    try {
      const uid = String(authUser.id || '').trim();
      const tid =
        authUser.tenant_id != null && String(authUser.tenant_id).trim()
          ? String(authUser.tenant_id).trim()
          : '';
      const { results } = await env.DB.prepare(
        `SELECT DISTINCT w.id, w.display_name, w.slug, w.status,
                w.github_repo, COALESCE(wm.role,'owner') AS member_role
         FROM workspaces w
         LEFT JOIN workspace_members wm
           ON wm.workspace_id = w.id AND wm.user_id = ?
         WHERE (w.tenant_id = ? OR wm.user_id = ?)
           AND (w.display_name LIKE ? OR w.slug LIKE ?)
         ORDER BY w.updated_at DESC
         LIMIT 20`,
      )
        .bind(uid, tid, uid, qPat, qPat)
        .all();
      for (const w of results || []) {
        merged.push({
          type: 'workspace',
          id: String(w.id ?? ''),
          title: String(w.display_name || w.slug || w.id || 'Workspace'),
          subtitle: String(w.slug || ''),
          score: 0.86,
          display_name: w.display_name,
          slug: w.slug,
          status: w.status,
          github_repo: w.github_repo,
          member_role: w.member_role,
        });
      }
    } catch (e) {
      console.warn('[unified-search] workspace facet', e?.message ?? e);
    }
  }

  if (facetIds.includes('branch')) {
    const { token, error } = await resolveGitHubToken(authUser, env);
    if (!error && token && request && url) {
      try {
        const repoCtx = await fetchWorkspaceGithubRepo(env, authUser, request, url);
        if (!repoCtx.error && repoCtx.repo) {
          const ghRes = await fetch(
            `https://api.github.com/repos/${repoCtx.repo}/branches?per_page=100`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'inneranimalmedia-agent/1.0',
              },
            },
          );
          if (ghRes.ok) {
            const branches = await ghRes.json();
            const q = rawQ.toLowerCase();
            for (const b of branches) {
              const name = String(b?.name ?? '');
              if (!q || name.toLowerCase().includes(q)) {
                const shaFull = b?.commit?.sha != null ? String(b.commit.sha) : '';
                merged.push({
                  type: 'branch',
                  id: name,
                  ref: name,
                  sha: shaFull.slice(0, 7),
                  protected: Boolean(b?.protected),
                  repo: String(repoCtx.repo),
                  title: name,
                  score: 0.85,
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn('[unified-search] branch facet', e?.message ?? e);
      }
    }
  }

  if (facetIds.includes('repo')) {
    const { token, error } = await resolveGitHubToken(authUser, env);
    if (!error && token) {
      try {
        const ghRes = await fetch(
          'https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member',
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'inneranimalmedia-agent/1.0',
            },
          },
        );
        if (ghRes.ok) {
          const repos = await ghRes.json();
          const q = rawQ.toLowerCase();
          for (const r of repos) {
            const full = String(r.full_name ?? '');
            if (
              !q ||
              full.toLowerCase().includes(q) ||
              String(r.name ?? '')
                .toLowerCase()
                .includes(q)
            ) {
              merged.push({
                type: 'repo',
                id: full,
                full_name: full,
                name: String(r.name ?? ''),
                owner: String(r.owner?.login ?? ''),
                private: Boolean(r.private),
                pushed_at: String(r.pushed_at ?? ''),
                default_branch: String(r.default_branch ?? 'main'),
                linked_worker: null,
                title: String(r.name ?? full),
                score: 0.84,
              });
            }
          }
        }
      } catch (e) {
        console.warn('[unified-search] repo facet', e?.message ?? e);
      }
    }
  }
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 */
export async function handleUnifiedSearchApi(request, url, env) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const userId = authUser.id ? String(authUser.id) : null;
  const workspaceId = resolveSearchAnalyticsWorkspaceId(authUser);
  const tenantId = await resolveSearchAnalyticsTenantId(env, authUser, userId);

  if (method === 'GET' && pathLower === '/api/unified-search/recent') {
    if (!env.DB || !tenantId || !userId) return jsonResponse({ items: [] });
    try {
      const { results } = await env.DB.prepare(
        `SELECT query, search_type, clicked_result_id, created_at
         FROM ai_search_analytics
         WHERE user_id = ?
           AND tenant_id = ?
           AND COALESCE(workspace_id, '') = COALESCE(?, '')
         ORDER BY created_at DESC
         LIMIT 10`,
      )
        .bind(userId, tenantId, workspaceId)
        .all();
      const items = (results || []).map((r) => ({
        query: r.query,
        result_kind: r.search_type,
        opened_id: r.clicked_result_id,
        search_type: r.search_type,
        clicked_result_id: r.clicked_result_id,
      }));
      return jsonResponse({ items });
    } catch (e) {
      console.warn('[unified-search/recent]', e?.message ?? e);
      return jsonResponse({ items: [] });
    }
  }

  if (method === 'POST' && pathLower === '/api/unified-search/track') {
    if (!env.DB) return jsonResponse({ ok: false }, 503);
    if (!tenantId || !userId) return jsonResponse({ ok: false, error: 'tenant_or_user_required' }, 400);
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const query = String(body.query || '').slice(0, 500);
    const searchType =
      body.search_type != null
        ? String(body.search_type).slice(0, 64)
        : body.result_kind != null
          ? String(body.result_kind).slice(0, 64)
          : 'palette_open';
    const clickedResultId =
      body.clicked_result_id != null
        ? String(body.clicked_result_id).slice(0, 500)
        : body.opened_id != null
          ? String(body.opened_id).slice(0, 500)
          : null;
    const resultsCount =
      body.results_count != null && Number.isFinite(Number(body.results_count))
        ? Math.max(0, Math.floor(Number(body.results_count)))
        : 0;
    const latencyMs =
      body.latency_ms != null && Number.isFinite(Number(body.latency_ms))
        ? Math.max(0, Math.floor(Number(body.latency_ms)))
        : null;
    const source =
      body.source != null && String(body.source).trim() !== ''
        ? String(body.source).trim().slice(0, 64)
        : 'dashboard';
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        `INSERT INTO ai_search_analytics (
           id, tenant_id, workspace_id, user_id, query,
           results_count, clicked_result_id, search_type, latency_ms, source, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
      )
        .bind(
          id,
          tenantId,
          workspaceId,
          userId,
          query,
          resultsCount,
          clickedResultId,
          searchType,
          latencyMs,
          source,
        )
        .run();
    } catch (e) {
      console.warn('[unified-search/track]', e?.message ?? e);
      return jsonResponse({ ok: false }, 500);
    }
    return jsonResponse({ ok: true });
  }

  if (method === 'POST' && pathLower === '/api/unified-search') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const limit = Math.min(Math.max(1, Number(body.limit) || 22), 50);
    const sourceFilters = body.source_filters ?? body.sourceFilters ?? [];
    const facetIds = normalizeSourceFilters(sourceFilters);
    const rawQ = String(body.query || '').trim();
    const hasStructuralFacet = facetIds.some(
      (f) => f === 'workspace' || f === 'branch' || f === 'repo',
    );
    if (rawQ.length < 2 && !hasStructuralFacet) {
      return jsonResponse({ results: [] });
    }
    const qLow = `%${String(rawQ).toLowerCase()}%`;
    const matchThreshold = Number(body.match_threshold ?? body.matchThreshold);
    const docFacetsOnly = documentFacetIdsOnly(facetIds);

    if (!env.DB) {
      return jsonResponse({ results: [], warning: 'DB not configured' });
    }

    if (rawQ.length < 2 && hasStructuralFacet) {
      /** @type {{ type: string, id: string, title: string, subtitle?: string, score: number, url?: string|null, sql_text?: string }[]} */
      const mergedOnly = [];
      await appendStructuralFacetResults(env, authUser, mergedOnly, rawQ, facetIds, request, url);
      mergedOnly.sort((a, b) => b.score - a.score);
      return jsonResponse({ results: mergedOnly.slice(0, limit) });
    }

    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim()
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId && typeof env?.TENANT_ID === 'string' && env.TENANT_ID.trim()) {
      tenantId = env.TENANT_ID.trim();
    }
    let workspaceId =
      authUser.active_workspace_id != null && String(authUser.active_workspace_id).trim()
        ? String(authUser.active_workspace_id).trim()
        : null;
    if (!workspaceId && typeof env?.WORKSPACE_ID === 'string' && env.WORKSPACE_ID.trim()) {
      workspaceId = env.WORKSPACE_ID.trim();
    }
    const projectId = ragDocumentsProjectId(env);

    const [
      tableRows,
      cmdRows,
      todoRows,
      planRows,
      toolRows,
      docRows,
    ] = await Promise.all([
      env.DB.prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND lower(name) LIKE ?
         LIMIT 15`,
      )
        .bind(qLow)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT id, user_input, normalized_intent, output_text
         FROM agentsam_command_run
         WHERE lower(user_input) LIKE ? OR lower(COALESCE(normalized_intent,'')) LIKE ?
            OR lower(COALESCE(output_text,'')) LIKE ?
         ORDER BY rowid DESC
         LIMIT 10`,
      )
        .bind(qLow, qLow, qLow)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT id, title, description, status
         FROM agentsam_todo
         WHERE status IN ('todo','in_progress','blocked')
           AND (lower(title) LIKE ? OR lower(COALESCE(description,'')) LIKE ?)
         ORDER BY updated_at DESC
         LIMIT 10`,
      )
        .bind(qLow, qLow)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT id, title, status FROM agentsam_plans
         WHERE lower(title) LIKE ?
         ORDER BY plan_date DESC
         LIMIT 10`,
      )
        .bind(qLow)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      env.DB.prepare(
        `SELECT id, COALESCE(tool_name, tool_key) AS tool_name, COALESCE(description,'') AS description
         FROM agentsam_tools
         WHERE lower(COALESCE(tool_name, tool_key)) LIKE ? OR lower(COALESCE(description,'')) LIKE ?
         LIMIT 10`,
      )
        .bind(qLow, qLow)
        .all()
        .then((r) => r.results || [])
        .catch(() => []),
      searchDocumentsVector(env, rawQ, Math.min(limit, 8), {
        sourceFilters: docFacetsOnly,
        matchThreshold,
        tenantId,
        workspaceId,
        projectId,
        sessionId: authUser.session_id ?? null,
        queryPreview: rawQ,
      }),
    ]);

    /** @type {{ type: string, id: string, title: string, subtitle?: string, score: number, url?: string|null, sql_text?: string }[]} */
    const merged = [];

    for (const t of tableRows) {
      const name = String(t.name || '');
      const nm = name.toLowerCase();
      const hit = rawQ.toLowerCase();
      const score = nm.includes(hit) ? 0.92 : 0.78;
      merged.push({
        type: 'table',
        id: name,
        title: name,
        subtitle: 'D1 table',
        score,
      });
    }

    for (const c of cmdRows) {
      const id = String(c.id || '');
      const ui = String(c.user_input || '').slice(0, 200);
      merged.push({
        type: 'query',
        id,
        title: ui || 'Command run',
        subtitle: c.normalized_intent ? String(c.normalized_intent).slice(0, 120) : undefined,
        sql_text: ui,
        score: 0.74,
      });
    }

    for (const td of todoRows) {
      merged.push({
        type: 'knowledge',
        id: String(td.id || ''),
        title: String(td.title || 'Todo'),
        subtitle: td.status ? `todo · ${td.status}` : 'todo',
        score: 0.73,
      });
    }

    for (const p of planRows) {
      merged.push({
        type: 'knowledge',
        id: String(p.id || ''),
        title: String(p.title || 'Plan'),
        subtitle: p.status ? `plan · ${p.status}` : 'plan',
        score: 0.71,
      });
    }

    for (const tl of toolRows) {
      merged.push({
        type: 'knowledge',
        id: String(tl.id || tl.tool_name || ''),
        title: String(tl.tool_name || 'tool'),
        subtitle: String(tl.description || '').slice(0, 160) || 'MCP tool',
        score: 0.79,
      });
    }

    for (const d of docRows) {
      merged.push({
        type: 'knowledge',
        id: d.id,
        title: d.title,
        subtitle: d.subtitle,
        score: typeof d.score === 'number' ? d.score : 0.65,
        url: d.url ?? null,
      });
    }

    await appendStructuralFacetResults(env, authUser, merged, rawQ, facetIds, request, url);

    merged.sort((a, b) => b.score - a.score);
    const results = merged.slice(0, limit);

    return jsonResponse({ results });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
