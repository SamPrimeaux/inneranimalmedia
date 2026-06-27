/**
 * Resolve workflow execution engine from registry metadata (not hardcoded per workflow).
 *
 * agentsam_workflows.metadata_json.execution_engine:
 *   - "sse"     — in-Worker graph walk + SSE (default, fast/interactive)
 *   - "durable" — Cloudflare Workflows via iam-workflows
 *   - "auto"    — durable when requires_approval, high risk, or large graphs
 */

function parseMetadata(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  try {
    const o = JSON.parse(String(raw || '{}'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function normalizeEngine(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'durable' || v === 'cf' || v === 'workflows' || v === 'cloudflare') return 'durable';
  if (v === 'auto' || v === 'smart') return 'auto';
  return 'sse';
}

function autoPickDurable(workflowRow, nodeCount) {
  const requiresApproval = Number(workflowRow?.requires_approval) === 1;
  const risk = String(workflowRow?.risk_level || 'low').toLowerCase();
  if (requiresApproval || risk === 'high' || risk === 'critical') return 'durable';
  if (Number(nodeCount) > 10) return 'durable';
  return 'sse';
}

/**
 * @param {Record<string, unknown>|null} workflowRow
 * @param {{ override?: string, nodeCount?: number }} [opts]
 * @returns {'sse'|'durable'}
 */
export function resolveWorkflowExecutionEngine(workflowRow, opts = {}) {
  const overrideRaw = opts.override != null ? String(opts.override).trim() : '';
  if (overrideRaw) {
    const normalized = normalizeEngine(overrideRaw);
    if (normalized === 'auto') return autoPickDurable(workflowRow, opts.nodeCount);
    return normalized;
  }

  const meta = parseMetadata(workflowRow?.metadata_json);
  const explicit = meta.execution_engine ?? meta.executionEngine ?? null;
  if (!explicit) return 'sse';

  const engine = normalizeEngine(explicit);
  if (engine === 'auto') return autoPickDurable(workflowRow, opts.nodeCount);
  return engine;
}

export function parseWorkflowMetadata(raw) {
  return parseMetadata(raw);
}
