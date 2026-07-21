/**
 * find_tools meta-tool: canonical runtime capability discovery for Agent Sam.
 *
 * This is intentionally a core/meta tool, not an agentsam_tools DB row. It lets the
 * model discover what catalog tools exist before deciding whether to answer,
 * plan, or execute. Execution risk/approval still happens at execution time.
 *
 * P2 progressive discovery also routes agentsam_search_tools / search_tools here so
 * catalog handler_type=d1|agent never hits Database Studio (explicit_d1_resource_required).
 */

function trim(v) {
  return String(v ?? '').trim();
}

/**
 * True for find_tools + agentsam_search_tools aliases — platform env.DB discovery only.
 * @param {string} rawKey
 */
export function isCatalogDiscoveryMetaTool(rawKey) {
  const key = String(rawKey || '').trim().toLowerCase();
  return (
    key === 'find_tools' ||
    key === 'find-tools' ||
    key === 'agentsam_find_tools' ||
    key === 'agentsam_search_tools' ||
    key === 'search_tools' ||
    key === 'search-tools'
  );
}

/**
 * Infer discovery query from loose model args (no Studio D1 resource required).
 * @param {Record<string, unknown>|string|null|undefined} input
 * @param {Record<string, unknown>} [runContext]
 */
export function normalizeFindToolsInput(input = {}, runContext = {}) {
  const raw =
    input == null
      ? {}
      : typeof input === 'string'
        ? { query: input }
        : typeof input === 'object' && !Array.isArray(input)
          ? { ...input }
          : {};
  const candidates = [
    raw.query,
    raw.intent,
    raw.q,
    raw.search,
    raw.keyword,
    raw.keywords,
    raw.text,
    raw.prompt,
    raw.message,
    raw.value,
  ];
  let query = '';
  for (const c of candidates) {
    const t = trim(c);
    if (t) {
      query = t;
      break;
    }
  }
  if (!query) {
    query = trim(runContext.userMessage ?? runContext.message ?? runContext.user_message ?? '');
  }
  return {
    ...raw,
    query,
    intent: trim(raw.intent) || undefined,
    workspace_id: trim(raw.workspace_id) || undefined,
    mode: trim(raw.mode) || undefined,
    limit: raw.limit,
  };
}

function safeJsonParse(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function normalizeToolRow(row) {
  const schema = safeJsonParse(row.input_schema, row.input_schema || null);
  const workspaceScope = safeJsonParse(row.workspace_scope, row.workspace_scope || null);
  return {
    name: trim(row.tool_key) || trim(row.tool_code) || trim(row.tool_name),
    tool_key: trim(row.tool_key),
    tool_code: trim(row.tool_code),
    display_name: trim(row.display_name) || trim(row.tool_name) || trim(row.tool_key),
    description: trim(row.description),
    category: trim(row.tool_category),
    handler_type: trim(row.handler_type),
    risk_level: trim(row.risk_level) || 'low',
    input_schema: schema,
    requires_approval: row.requires_approval === 1 || row.requires_approval === true,
    workspace_scope: workspaceScope,
  };
}

function intentTerms(input) {
  return [
    trim(input.query),
    trim(input.intent),
    trim(input.mode),
  ]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

function scoreRow(row, terms) {
  const hay = [
    row.tool_key,
    row.tool_code,
    row.tool_name,
    row.display_name,
    row.description,
    row.tool_category,
    row.handler_type,
    row.capability_key,
  ]
    .map((x) => trim(x).toLowerCase())
    .join(' ');
  let score = 0;
  for (const t of terms) {
    if (!t) continue;
    if (hay.includes(t)) score += 10;
    if (trim(row.tool_key).toLowerCase() === t || trim(row.tool_code).toLowerCase() === t) score += 50;
  }
  return score;
}

function coreFallbackTools() {
  return [
    {
      name: 'find_tools',
      tool_key: 'find_tools',
      tool_code: 'find_tools',
      display_name: 'Find tools',
      description: 'Discover Agent Sam catalog tools by capability, intent, category, or name.',
      category: 'agent.discovery',
      handler_type: 'meta',
      risk_level: 'low',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          intent: { type: 'string' },
          workspace_id: { type: 'string' },
          mode: { type: 'string' },
        },
        required: ['query'],
      },
      requires_approval: false,
      workspace_scope: ['*'],
    },
  ];
}

/**
 * @param {any} env
 * @param {{ query?: string, intent?: string, workspace_id?: string, mode?: string, limit?: number }} input
 * @param {Record<string, unknown>} runContext
 */
export async function executeFindToolsMetaTool(env, input = {}, runContext = {}) {
  const normalized = normalizeFindToolsInput(input, runContext);
  const q = trim(normalized.query || normalized.intent || '');
  const limit = Math.max(1, Math.min(Number(normalized.limit || 24) || 24, 64));
  const terms = intentTerms(normalized);
  const workspaceId = trim(
    normalized.workspace_id || runContext.workspaceId || runContext.workspace_id,
  );

  if (!env?.DB) {
    return {
      ok: true,
      result: {
        query: q,
        tools: coreFallbackTools(),
        source: 'core_fallback',
      },
    };
  }

  const like = `%${q.toLowerCase().replace(/[%_]/g, '')}%`;
  const binds = [];
  let where = `COALESCE(is_active, 1) = 1 AND COALESCE(is_degraded, 0) = 0`;
  if (q) {
    where += ` AND (
      lower(COALESCE(tool_key, '')) LIKE ? OR
      lower(COALESCE(tool_code, '')) LIKE ? OR
      lower(COALESCE(tool_name, '')) LIKE ? OR
      lower(COALESCE(display_name, '')) LIKE ? OR
      lower(COALESCE(description, '')) LIKE ? OR
      lower(COALESCE(tool_category, '')) LIKE ? OR
      lower(COALESCE(handler_type, '')) LIKE ? OR
      lower(COALESCE(capability_key, '')) LIKE ?
    )`;
    binds.push(like, like, like, like, like, like, like, like);
  }
  if (workspaceId) {
    where += ` AND (workspace_scope IS NULL OR workspace_scope = '' OR workspace_scope = '*' OR workspace_scope LIKE ? OR workspace_scope LIKE '%"*"%')`;
    binds.push(`%${workspaceId}%`);
  }

  const sql = `SELECT id, tool_key, tool_code, tool_name, display_name, description,
                      tool_category, handler_type, capability_key, input_schema,
                      risk_level, requires_approval, workspace_scope
               FROM agentsam_tools
               WHERE ${where}
               LIMIT ${Math.max(limit * 3, limit)}`;

  let rows = [];
  try {
    const res = await env.DB.prepare(sql).bind(...binds).all();
    rows = Array.isArray(res?.results) ? res.results : [];
  } catch (e) {
    return {
      ok: false,
      error: `find_tools catalog query failed: ${e?.message ?? String(e)}`,
    };
  }

  const tools = rows
    .map((row) => ({ row, score: scoreRow(row, terms) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => normalizeToolRow(row));

  return {
    ok: true,
    result: {
      query: q,
      intent: trim(normalized.intent) || null,
      mode: trim(normalized.mode) || null,
      workspace_id: workspaceId || null,
      count: tools.length,
      // rows alias keeps progressive hydrate + legacy SQL-shaped consumers happy
      tools: [...coreFallbackTools(), ...tools].filter((tool, idx, arr) =>
        arr.findIndex((t) => t.name === tool.name) === idx,
      ),
      rows: tools,
      trace_event: 'tools_discovered',
      source: 'agentsam_tools',
      via: 'find_tools_meta',
    },
  };
}
