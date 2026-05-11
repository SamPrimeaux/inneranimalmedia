/**
 * Request-scoped tool menu (Layer B): narrow global catalog tools by capability + message intent.
 */

function parseJsonSafe(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function inputSchemaFromAgentsamToolRow(row) {
  const parsed = parseJsonSafe(row?.input_schema, null);
  if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
    const o = { ...parsed };
    if (!o.type) o.type = 'object';
    return o;
  }
  const hc = parseJsonSafe(row?.handler_config, null);
  if (hc && typeof hc === 'object') {
    if (hc.parameters && typeof hc.parameters === 'object') {
      const o = { ...hc.parameters };
      if (!o.type) o.type = 'object';
      return o;
    }
    if (hc.input_schema && typeof hc.input_schema === 'object') {
      const o = { ...hc.input_schema };
      if (!o.type) o.type = 'object';
      return o;
    }
  }
  return { type: 'object', properties: {} };
}

async function fetchToolDefsByNames(env, names) {
  if (!env?.DB || !names.length) return [];
  const placeholders = names.map(() => '?').join(',');
  try {
    const { results } = await env.DB.prepare(
      `SELECT tool_name, description, input_schema, handler_config, tool_category, requires_approval
       FROM agentsam_tools
       WHERE COALESCE(is_active, 1) = 1 AND tool_name IN (${placeholders})`,
    )
      .bind(...names)
      .all();
    return results || [];
  } catch (e) {
    console.warn('[tool-capability-filter] fetchToolDefsByNames', e?.message ?? e);
    return [];
  }
}

/**
 * @param {any} env
 * @param {any[]} tools
 * @param {string[]} allowed
 */
async function narrowToToolNames(env, tools, allowed) {
  const allow = new Set(allowed);
  const byName = Object.fromEntries(
    tools.filter((t) => t && allow.has(String(t.name))).map((t) => [String(t.name), t]),
  );
  const missing = allowed.filter((n) => !byName[n]);
  const rows = await fetchToolDefsByNames(env, missing);
  for (const row of rows) {
    const nm = String(row.tool_name);
    if (byName[nm]) continue;
    byName[nm] = {
      name: nm,
      description: String(row.description || nm).slice(0, 4000),
      input_schema: inputSchemaFromAgentsamToolRow(row),
      tool_category: String(row.tool_category || 'builtin'),
      requires_approval: Number(row.requires_approval || 0) === 1,
    };
  }
  return allowed.map((n) => byName[n]).filter(Boolean);
}

/** True when the message does not request D1 mutations. */
export function inferD1ReadOnlyIntent(message) {
  const m = String(message || '');
  if (/\b(insert|update|delete|drop|alter|truncate|replace\s+into|d1_write|d1_batch_write)\b/i.test(m)) {
    return false;
  }
  if (/\b(write|mutate|patch rows|remove rows|delete from)\b/i.test(m)) return false;
  return true;
}

export function inferSqlSchemaInspectionIntent(message) {
  return /\b(schema|pragma|table_info|introspect|describe\s+table|columns)\b/i.test(String(message || ''));
}

function inferWantsD1FromMessage(message, capabilityDecision) {
  if (capabilityDecision && capabilityDecision.should_use_d1) return true;
  const m = String(message || '');
  return (
    /\b(agentsam_|d1\b|hyperdrive|sqlite_master|pragma\b|\bselect\b|\bcount\s*\(|\bfrom\s+\w)/i.test(m) ||
    /\b(workflow_runs|agentsam_todo|agentsam_tools|agentsam_model_catalog)\b/i.test(m)
  );
}

function inferGithubIntentMessage(message, capabilityDecision) {
  if (capabilityDecision && capabilityDecision.should_use_github) return true;
  return /\bgithub\b|github\.com\/|pull request|create_pr|\.git\b/i.test(String(message || ''));
}

function inferAgentManagementIntent(message) {
  return /\b(list|run|get|show)\s+(my\s+)?agents?\b|\bagentsam_(get_agent|list_agents|run_agent)\b|\bcursor\s+cloud\s+agent\b/i.test(
    String(message || ''),
  );
}

function isBrowserToolName(name) {
  const n = String(name || '');
  return (
    n.startsWith('browser_') ||
    n.startsWith('cdt_') ||
    n === 'playwright_screenshot' ||
    n === 'preview_in_browser' ||
    n === 'web_search'
  );
}

function isGithubToolName(name) {
  return String(name || '').startsWith('github_');
}

function isTerminalToolName(name) {
  const n = String(name || '');
  return (
    n === 'terminal_run' ||
    n === 'terminal_execute' ||
    n === 'run_command' ||
    n === 'bash' ||
    n === 'python_execute'
  );
}

function isArtifactOrR2ToolName(name) {
  const n = String(name || '');
  return n.startsWith('r2_') || n.startsWith('workspace_') || n === 'get_r2_url' || n.includes('artifact');
}

function isAgentSamAgentToolName(name) {
  const n = String(name || '');
  return n === 'agentsam_get_agent' || n === 'agentsam_list_agents' || n === 'agentsam_run_agent';
}

/**
 * Final tool list for the model: minimal relevant subset per capability decision + message.
 *
 * @param {any} env
 * @param {any[]} tools
 * @param {Record<string, unknown>|null} capabilityDecision
 * @param {string} userMessage
 * @param {{ requestedMode?: string, emit?: (type: string, payload: unknown) => void }} [opts]
 * @returns {Promise<any[]>}
 */
export async function filterToolsForCapabilityDecision(env, tools, capabilityDecision, userMessage, opts = {}) {
  const requestedMode = opts.requestedMode != null ? String(opts.requestedMode).toLowerCase() : 'agent';
  if (requestedMode !== 'agent' || !Array.isArray(tools)) return tools;

  const before = tools.map((t) => String(t?.name || '')).filter(Boolean);
  const d = capabilityDecision && typeof capabilityDecision === 'object' ? capabilityDecision : {};
  const msg = String(userMessage || '');

  const wantsD1 = inferWantsD1FromMessage(msg, d);
  const d1ReadOnly = inferD1ReadOnlyIntent(msg);
  const wantsGh = inferGithubIntentMessage(msg, d);
  const wantsAgentMgmt = inferAgentManagementIntent(msg);

  let next = tools;

  if (wantsD1 && d1ReadOnly) {
    next = await narrowToToolNames(env, tools, ['d1_query', 'd1_explain', 'd1_schema_introspect']);
  } else if (wantsD1 && !d1ReadOnly) {
    next = await narrowToToolNames(env, tools, [
      'd1_query',
      'd1_explain',
      'd1_schema_introspect',
      'd1_write',
      'd1_batch_write',
    ]);
  } else if (d.should_use_browser) {
    next = tools.filter((t) => isBrowserToolName(t.name));
  } else if (d.should_use_github || wantsGh) {
    next = tools.filter((t) => isGithubToolName(t.name));
  } else if (d.should_use_terminal) {
    next = tools.filter((t) => isTerminalToolName(t.name));
  } else if (d.should_use_artifact_r2) {
    next = tools.filter((t) => isArtifactOrR2ToolName(t.name));
  } else if (wantsAgentMgmt) {
    next = tools.filter((t) => isAgentSamAgentToolName(t.name));
  }

  const after = next.map((t) => String(t?.name || '')).filter(Boolean);
  const debug =
    env?.AGENT_SAM_TOOL_DEBUG === '1' ||
    env?.AGENT_SAM_TOOL_DEBUG === true ||
    env?.AGENT_SAM_TOOL_DEBUG === 'true';
  if (debug || typeof opts.emit === 'function') {
    const payload = { phase: 'tool_capability_filter', before, after };
    console.log('[AGENT_SAM_TOOL_DEBUG]', JSON.stringify(payload));
    try {
      opts.emit?.('agent_tool_debug', payload);
    } catch (_) {}
  }

  return next.length ? next : tools;
}
