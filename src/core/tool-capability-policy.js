function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function resolveToolOperation(input = {}) {
  return String(
    input.operation ?? input.op ?? input.sub_operation ?? input.action ?? input.mode ?? '',
  ).trim().toLowerCase();
}

export async function loadToolCapabilities(env, toolRow, input = {}) {
  if (!env?.DB || !toolRow?.id) return [];
  const { results } = await env.DB.prepare(
    `SELECT tc.capability_key, tc.requirement_type, tc.is_primary, tc.operations_json,
            c.domain, c.verb, c.is_mutating
     FROM agentsam_tool_capabilities tc
     JOIN agentsam_capabilities c ON c.capability_key = tc.capability_key
     WHERE tc.tool_id = ? AND COALESCE(c.is_active,1)=1
     ORDER BY tc.is_primary DESC, tc.capability_key`,
  )
    .bind(String(toolRow.id))
    .all()
    .catch(() => ({ results: [] }));

  const operation = resolveToolOperation(input);
  const applicable = (results || []).filter((row) => {
    const operations = parseJsonArray(row.operations_json);
    return operations.length === 0 || (operation && operations.includes(operation));
  });
  if (applicable.length > 0) return applicable;

  const legacy = String(toolRow.capability_key || '').trim();
  const legacyVerb = legacy.split('.').slice(-1)[0];
  return legacy
    ? [{
        capability_key: legacy,
        requirement_type: 'required',
        is_primary: 1,
        operations_json: null,
        domain: legacy.split('.')[0],
        verb: legacy.split('.').slice(1).join('.'),
        is_mutating: ['read', 'search', 'status', 'audit'].includes(legacyVerb) ? 0 : 1,
      }]
    : [];
}

const LEGACY_MUTATING_CAPABILITIES = Object.freeze({
  can_edit_files: ['file.write', 'github.write', 'git.commit'],
  can_terminal: ['terminal.execute', 'container.execute', 'python.execute', 'git.commit', 'git.push'],
  can_d1_write: ['d1.write', 'd1.migrate'],
  can_postgres_write: ['supabase.write', 'supabase.vector.write'],
  can_postgres_migrate: ['supabase.migrate'],
  can_deploy: ['cloudflare.deploy', 'git.push'],
  can_browser_automation: ['browser.navigate', 'browser.execute'],
  can_memory_write: ['memory.write', 'memory.delete'],
  can_send_email: ['email.draft', 'email.modify', 'email.send'],
});

export function normalizeCapabilityPolicy(rawPolicy) {
  const raw = rawPolicy && typeof rawPolicy === 'object' ? rawPolicy : {};
  if (Number(raw.version) === 2) {
    return {
      version: 2,
      deny_capabilities: parseJsonArray(raw.deny_capabilities),
      allow_mutating_capabilities: parseJsonArray(raw.allow_mutating_capabilities),
      require_approval_capabilities: parseJsonArray(raw.require_approval_capabilities),
      source: 'v2',
    };
  }

  const allowed = [];
  for (const [flag, capabilities] of Object.entries(LEGACY_MUTATING_CAPABILITIES)) {
    if (raw[flag] === true) allowed.push(...capabilities);
  }
  return {
    version: 2,
    deny_capabilities: [],
    allow_mutating_capabilities: [...new Set(allowed)],
    require_approval_capabilities: [],
    source: 'legacy_compat',
  };
}

export function evaluateToolCapabilities({
  toolRow,
  capabilities,
  writePolicy,
  productionAllowed = true,
}) {
  const policy = normalizeCapabilityPolicy(writePolicy);
  const keys = capabilities.map((row) => String(row.capability_key)).filter(Boolean);
  const mutating = capabilities
    .filter((row) => Number(row.is_mutating) === 1)
    .map((row) => String(row.capability_key));
  const unclassified = keys.length === 0;
  const unclassifiedMutation =
    unclassified &&
    (Number(toolRow?.requires_approval || 0) === 1 ||
      ['medium', 'high', 'critical'].includes(String(toolRow?.risk_level || '').toLowerCase()));

  let decision = 'allow';
  let reason = 'read_capabilities_allowed_by_selected_menu';
  if (unclassifiedMutation) {
    decision = 'deny';
    reason = 'unclassified_mutation';
  } else if (unclassified) {
    decision = 'allow';
    reason = 'unclassified_read_compat';
  } else if (keys.some((key) => policy.deny_capabilities.includes(key))) {
    decision = 'deny';
    reason = 'capability_explicitly_denied';
  } else if (mutating.some((key) => !policy.allow_mutating_capabilities.includes(key))) {
    decision = 'deny';
    reason = 'mutating_capability_not_allowed';
  }

  const requiresApproval = keys.some((key) =>
    policy.require_approval_capabilities.includes(key),
  );
  return {
    schema_version: 1,
    decision,
    reason,
    capabilities: keys,
    mutating_capabilities: mutating,
    requires_approval: requiresApproval,
    unclassified,
    unclassified_mutation: unclassifiedMutation,
    policy_source: policy.source,
    legacy_decision: productionAllowed ? 'allow' : 'deny',
    agreement: (decision === 'allow') === productionAllowed ? 'match' : 'mismatch',
  };
}
