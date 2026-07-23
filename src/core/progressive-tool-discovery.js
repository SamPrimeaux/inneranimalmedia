/**
 * Progressive tool discovery — core schemas on turn 0, hydrate via agentsam_search_tools.
 * Law: menu = discovery; write_policy / capability = safety (Agent/Debug/Multitask).
 *
 * SSOT plan: plans/active/CURSOR-PARITY-TOOL-DISCOVERY-2026-07.md
 */

/**
 * Always-on schemas for agent / debug / multitask turn 0.
 * D1 stays on the profile ceiling — discover via agentsam_search_tools (not free at turn 0).
 */
export const PROGRESSIVE_CORE_TOOL_KEYS = Object.freeze([
  'agentsam_search_tools',
  'fs_read_file',
  'fs_write_file',
  'fs_search_files',
  // Workspace PTY (Mac/localpty). Without this, terra + openai_hosted_shell is the only
  // "shell" on turn 0 and models ls OpenAI's Debian box — which has no repo .scratch/.
  'agentsam_terminal_local',
  'agentsam_codebase_retrieve',
  'agentsam_memory_search',
  'search_web',
]);

export const PROGRESSIVE_DISCOVERY_MODES = Object.freeze(['agent', 'debug', 'multitask']);

/**
 * Product surfaces with a tight curated profile (e.g. Design Studio CAD) must NOT
 * thin-pipe to generic core — that drops cad_generate and the model pastes .scad instead.
 * @param {{ routeKey?: string|null, taskType?: string|null, profileKey?: string|null }} [opts]
 */
export function surfaceSkipsProgressiveToolDiscovery(opts = {}) {
  const vals = [opts.routeKey, opts.taskType, opts.profileKey]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
  for (const v of vals) {
    if (
      v === 'design_studio' ||
      v === 'design_studio_base' ||
      v === 'cad_generation' ||
      v.startsWith('design_studio') ||
      v.startsWith('cad_')
    ) {
      return true;
    }
  }
  return false;
}

/** Soft cap on hydrated schemas (Cursor MCP-shaped ceiling). */
export const PROGRESSIVE_HYDRATE_SOFT_MAX = 40;

/**
 * @param {unknown} mode
 */
export function modeUsesProgressiveToolDiscovery(mode) {
  return PROGRESSIVE_DISCOVERY_MODES.includes(String(mode || '').trim().toLowerCase());
}

/**
 * Option (a): skip restrictive tool_policy.allowlist for these modes.
 * @param {unknown} mode
 */
export function modeSkipsToolPolicyAllowlist(mode) {
  return modeUsesProgressiveToolDiscovery(mode);
}

/**
 * @param {unknown} name
 */
export function isAgentsamSearchToolsName(name) {
  const n = String(name || '')
    .trim()
    .toLowerCase();
  return n === 'agentsam_search_tools' || n === 'search_tools';
}

/**
 * @param {unknown} t
 */
function toolNameOf(t) {
  return String(t?.name || t?.tool_key || t?.tool_name || t?.function?.name || '')
    .trim();
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function inputSchemaFromRow(row) {
  if (row?.input_schema && typeof row.input_schema === 'object') {
    return Object.assign({ type: 'object', properties: {} }, row.input_schema, { type: 'object' });
  }
  if (row?.input_schema != null && String(row.input_schema).trim() !== '') {
    try {
      const parsed = JSON.parse(String(row.input_schema));
      if (parsed && typeof parsed === 'object') {
        return Object.assign({ type: 'object', properties: {} }, parsed, { type: 'object' });
      }
    } catch {
      /* fall through */
    }
  }
  return { type: 'object', properties: {} };
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @returns {Map<string, Record<string, unknown>>}
 */
function rowsByName(rows) {
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map();
  for (const r of rows || []) {
    const n = toolNameOf(r);
    if (n && !map.has(n)) map.set(n, r);
  }
  return map;
}

/**
 * @param {Record<string, unknown>} row
 */
export function compiledRowFromAgentsamTool(row) {
  const name = String(row.tool_name || row.tool_key || row.name || '').trim();
  return {
    name,
    tool_key: String(row.tool_key || name),
    tool_name: name,
    description: String(row.description || name).slice(0, 4000),
    input_schema: inputSchemaFromRow(row),
    tool_category: String(row.tool_category || 'platform'),
    requires_approval: Number(row.requires_approval || 0) === 1,
    caller_policy: row.caller_policy != null ? row.caller_policy : null,
  };
}

/**
 * Wire-facing tool def from a compiled catalog row (preserve caller_policy for PTC).
 * @param {Record<string, unknown>} compiled
 */
export function wireToolFromCompiledRow(compiled) {
  return {
    name: compiled.name,
    description: compiled.description,
    input_schema: compiled.input_schema,
    tool_category: compiled.tool_category,
    requires_approval: compiled.requires_approval,
    caller_policy: compiled.caller_policy != null ? compiled.caller_policy : null,
    ...(compiled.tool_key ? { tool_key: compiled.tool_key } : {}),
  };
}

/**
 * @param {any} env
 * @param {string[]} names
 */
async function fetchToolRowsByNameOrKey(env, names) {
  if (!env?.DB || !names.length) return [];
  const placeholders = names.map(() => '?').join(',');
  try {
    const { results } = await env.DB.prepare(
      `SELECT tool_name, tool_key, description, input_schema, handler_config, tool_category, requires_approval,
              caller_policy
       FROM agentsam_tools
       WHERE COALESCE(is_active, 1) = 1
         AND (tool_name IN (${placeholders}) OR tool_key IN (${placeholders}))`,
    )
      .bind(...names, ...names)
      .all();
    return results || [];
  } catch (e) {
    console.warn('[progressive-tools] fetchToolRowsByNameOrKey', e?.message ?? e);
    return [];
  }
}

/**
 * Ensure core tools exist as compiled rows (fetch missing from catalog).
 * @param {any} env
 * @param {Array<Record<string, unknown>>} existingRows
 */
export async function ensureProgressiveCoreCompiledRows(env, existingRows = []) {
  const byName = rowsByName(existingRows);
  const missing = PROGRESSIVE_CORE_TOOL_KEYS.filter((k) => !byName.has(k));
  if (missing.length && env?.DB) {
    const fetched = await fetchToolRowsByNameOrKey(env, missing);
    for (const row of fetched) {
      const compiled = compiledRowFromAgentsamTool(row);
      if (compiled.name && !byName.has(compiled.name)) byName.set(compiled.name, compiled);
    }
  }
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (const key of PROGRESSIVE_CORE_TOOL_KEYS) {
    const row = byName.get(key);
    if (!row) continue;
    out.push(row.name ? row : compiledRowFromAgentsamTool(row));
  }
  return out;
}

/**
 * Apply progressive core compile: shrink schemas on wire; keep ceiling for telemetry.
 *
 * @param {any} env
 * @param {{
 *   mode: string,
 *   compiledToolRows: Array<Record<string, unknown>>,
 *   toolAllowlist: string[],
 *   routeKey?: string|null,
 *   taskType?: string|null,
 *   profileKey?: string|null,
 * }} input
 */
export async function applyProgressiveCoreCompile(env, input) {
  const mode = String(input.mode || '').trim().toLowerCase();
  if (!modeUsesProgressiveToolDiscovery(mode)) {
    return {
      progressive: false,
      compiledToolRows: input.compiledToolRows || [],
      toolAllowlist: input.toolAllowlist || [],
      discoveryCeilingKeys: null,
    };
  }
  if (
    surfaceSkipsProgressiveToolDiscovery({
      routeKey: input.routeKey,
      taskType: input.taskType,
      profileKey: input.profileKey,
    })
  ) {
    console.info(
      '[progressive-tools] skip_surface',
      JSON.stringify({
        mode,
        route_key: input.routeKey || null,
        task_type: input.taskType || null,
        profile_key: input.profileKey || null,
        allowlist_count: (input.toolAllowlist || []).length,
      }),
    );
    return {
      progressive: false,
      compiledToolRows: input.compiledToolRows || [],
      toolAllowlist: input.toolAllowlist || [],
      discoveryCeilingKeys: null,
    };
  }

  const ceilingKeys = [
    ...new Set(
      (input.toolAllowlist || [])
        .map((x) => String(x || '').trim())
        .filter(Boolean),
    ),
  ];
  const coreRows = await ensureProgressiveCoreCompiledRows(env, input.compiledToolRows || []);
  const toolAllowlist = coreRows
    .map((r) => String(r.name || r.tool_key || r.tool_name || '').trim())
    .filter(Boolean);

  console.info(
    '[progressive-tools] core_compile',
    JSON.stringify({
      mode,
      core_count: toolAllowlist.length,
      ceiling_count: ceilingKeys.length,
      core: toolAllowlist,
    }),
  );

  return {
    progressive: true,
    compiledToolRows: coreRows,
    toolAllowlist,
    discoveryCeilingKeys: ceilingKeys.length ? ceilingKeys : null,
  };
}

/**
 * Pull tool_key / tool_name values from agentsam_search_tools exec result.
 * @param {unknown} execResult
 * @returns {string[]}
 */
export function extractToolKeysFromSearchToolsResult(execResult) {
  /** @type {string[]} */
  const keys = [];
  const seen = new Set();
  const push = (raw) => {
    const k = String(raw || '').trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    keys.push(k);
  };

  const walkRow = (row) => {
    if (!row || typeof row !== 'object') return;
    const o = /** @type {Record<string, unknown>} */ (row);
    push(o.tool_key || o.tool_name || o.name);
  };

  if (execResult == null) return keys;
  if (typeof execResult === 'string') {
    try {
      return extractToolKeysFromSearchToolsResult(JSON.parse(execResult));
    } catch {
      return keys;
    }
  }
  if (Array.isArray(execResult)) {
    for (const row of execResult) walkRow(row);
    return keys;
  }
  if (typeof execResult === 'object') {
    const o = /** @type {Record<string, unknown>} */ (execResult);
    if (Array.isArray(o.rows)) for (const row of o.rows) walkRow(row);
    if (Array.isArray(o.results)) for (const row of o.results) walkRow(row);
    if (Array.isArray(o.tools)) for (const row of o.tools) walkRow(row);
    if (Array.isArray(o.data)) for (const row of o.data) walkRow(row);
    if (o.result && typeof o.result === 'object') {
      for (const k of extractToolKeysFromSearchToolsResult(o.result)) push(k);
    }
  }
  return keys;
}

/**
 * Append full schemas for discovered tool keys onto activeTools.
 * @param {any} env
 * @param {unknown[]} activeTools
 * @param {unknown} execResult
 * @param {{ softMax?: number, preferKeys?: string[], userMessage?: string, allowMediaTools?: boolean }} [opts]
 * @returns {Promise<{ tools: unknown[], added: string[] }>}
 */
export async function hydrateActiveToolsFromSearchResult(env, activeTools, execResult, opts = {}) {
  const softMax = Math.max(
    8,
    Math.floor(Number(opts.softMax) || PROGRESSIVE_HYDRATE_SOFT_MAX),
  );
  const list = Array.isArray(activeTools) ? [...activeTools] : [];
  const have = new Set(list.map((t) => toolNameOf(t)).filter(Boolean));
  const prefer = (Array.isArray(opts.preferKeys) ? opts.preferKeys : [])
    .map((k) => String(k || '').trim())
    .filter(Boolean);
  const fromSearch = extractToolKeysFromSearchToolsResult(execResult);
  const allowMedia =
    opts.allowMediaTools === true || userMessageAllowsMediaToolHydrate(opts.userMessage);

  /** Prefer keys win so exact user-named tools beat noisy MCP list_* ranking. */
  const wanted = [];
  const deferredMedia = [];
  const seenWanted = new Set();
  for (const k of [...prefer, ...fromSearch]) {
    if (!k || have.has(k) || seenWanted.has(k)) continue;
    seenWanted.add(k);
    if (isMediaGenerationToolKey(k) && !allowMedia) {
      deferredMedia.push(k);
      continue;
    }
    wanted.push(k);
  }
  // Media last (and only if room remains after non-media) when not explicitly allowed.
  if (allowMedia) {
    for (const k of deferredMedia) wanted.push(k);
  } else if (deferredMedia.length) {
    console.info(
      '[progressive-tools] media_hydrate_deferred',
      JSON.stringify({ deferred: deferredMedia.slice(0, 12), reason: 'non_media_user_message' }),
    );
  }
  if (!wanted.length || !env?.DB) {
    return { tools: list, added: [] };
  }

  const room = Math.max(0, softMax - list.length);
  const slice = wanted.slice(0, room);
  if (!slice.length) {
    console.info(
      '[progressive-tools] hydrate_skip_at_cap',
      JSON.stringify({ soft_max: softMax, active: list.length, wanted: wanted.length }),
    );
    return { tools: list, added: [] };
  }

  const rows = await fetchToolRowsByNameOrKey(env, slice);
  /** @type {string[]} */
  const added = [];
  for (const row of rows) {
    const compiled = compiledRowFromAgentsamTool(row);
    const nm = compiled.name;
    if (!nm || have.has(nm)) continue;
    if (list.length >= softMax) break;
    have.add(nm);
    added.push(nm);
    list.push(wireToolFromCompiledRow(compiled));
  }

  if (added.length) {
    console.info(
      '[progressive-tools] hydrated',
      JSON.stringify({ added, active_tools: list.length, soft_max: softMax }),
    );
  }
  return { tools: list, added };
}

/**
 * HTML/"get a visual" language must not unlock imgx_/veo_ hydrate.
 * Explicit image/video generation asks still do.
 * @param {string|null|undefined} userMessage
 */
export function userMessageAllowsMediaToolHydrate(userMessage) {
  const m = String(userMessage || '');
  if (!m.trim()) return false;
  if (/\b(imgx_|veo_|dall[- ]?e|imagen|gpt-image|image gen)\b/i.test(m)) return true;
  if (
    /\b(generate|create|make|draw|render)\s+(an?\s+)?(image|photo|png|jpe?g|picture|illustration|video|mp4)\b/i.test(
      m,
    )
  ) {
    return true;
  }
  if (/\b(generate|create)\s+image\b/i.test(m)) return true;
  return false;
}

/**
 * @param {string} key
 */
export function isMediaGenerationToolKey(key) {
  return /^(imgx_|veo_|moviemode_)/i.test(String(key || '').trim());
}

/**
 * Pin full schemas for tools the user named in the message (progressive thin pipe).
 * Without this, search_tools ranking often hydrates MCP noise and never surfaces the
 * exact key (e.g. agentsam_github_list_commits), so the model claims it is unavailable.
 * @param {any} env
 * @param {unknown[]} activeTools
 * @param {string[]} names
 * @param {{ softMax?: number }} [opts]
 * @returns {Promise<{ tools: unknown[], added: string[] }>}
 */
export async function hydrateNamedCatalogTools(env, activeTools, names, opts = {}) {
  const softMax = Math.max(
    8,
    Math.floor(Number(opts.softMax) || PROGRESSIVE_HYDRATE_SOFT_MAX),
  );
  const list = Array.isArray(activeTools) ? [...activeTools] : [];
  const have = new Set(list.map((t) => toolNameOf(t)).filter(Boolean));
  const wanted = (Array.isArray(names) ? names : [])
    .map((k) => String(k || '').trim())
    .filter((k) => k && !have.has(k));
  if (!wanted.length || !env?.DB) {
    return { tools: list, added: [] };
  }
  const room = Math.max(0, softMax - list.length);
  const slice = wanted.slice(0, room);
  if (!slice.length) return { tools: list, added: [] };

  const rows = await fetchToolRowsByNameOrKey(env, slice);
  /** @type {string[]} */
  const added = [];
  for (const row of rows) {
    const compiled = compiledRowFromAgentsamTool(row);
    const nm = compiled.name;
    if (!nm || have.has(nm)) continue;
    if (list.length >= softMax) break;
    have.add(nm);
    added.push(nm);
    list.push(wireToolFromCompiledRow(compiled));
  }
  if (added.length) {
    console.info(
      '[progressive-tools] named_pin',
      JSON.stringify({ added, active_tools: list.length, soft_max: softMax }),
    );
  }
  return { tools: list, added };
}
