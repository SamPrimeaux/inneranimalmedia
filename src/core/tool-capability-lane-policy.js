/**
 * Pure lane-policy helpers for tool-capability-filter (no heavy imports).
 * Progressive discovery + negation must not fight each other.
 */

/**
 * Strip "do not / don't / never call|use|run …" spans so negated tool names
 * (e.g. "Do not call agentsam_d1_query") do not trigger a D1-only menu.
 * @param {string} message
 */
export function stripNegatedToolMentions(message) {
  return String(message || '').replace(
    /\b(do\s+not|don't|dont|never)\s+(call|use|run|invoke)\s+[a-z0-9_.-]+/gi,
    ' ',
  );
}

/**
 * Progressive discovery owns the turn-0 menu — Layer B lane narrowing shreds it.
 * @param {{ progressiveToolDiscovery?: boolean, progressive_tool_discovery?: boolean }} [opts]
 * @param {boolean} [createFlowActive]
 */
export function shouldBypassCapabilityLaneFilter(opts = {}, createFlowActive = false) {
  if (createFlowActive) return false;
  return opts.progressiveToolDiscovery === true || opts.progressive_tool_discovery === true;
}

/**
 * @param {unknown} message
 * @param {Record<string, unknown>|null|undefined} capabilityDecision
 */
export function inferWantsD1FromMessage(message, capabilityDecision) {
  if (capabilityDecision && capabilityDecision.should_use_d1) return true;
  const m = stripNegatedToolMentions(String(message || ''));
  // Do NOT match bare `agentsam_` — that steals github/fs catalog tool pins.
  return (
    /\b(agentsam_d1|d1_query|d1_write|d1_schema|d1\b|hyperdrive|sqlite_master|pragma\b|\bselect\b|\bcount\s*\(|\bfrom\s+\w)/i.test(
      m,
    ) || /\b(workflow_runs|agentsam_todo|agentsam_tools|agentsam_model_catalog)\b/i.test(m)
  );
}
