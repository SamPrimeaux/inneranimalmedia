/**
 * Serialize agentsam_guardrails rows for Supabase public.documents (source d1:guardrails).
 * Canonical D1 table: agentsam_guardrails (not ai_guardrails).
 */

/** @param {Record<string, unknown>} r */
export function serializeAgentsamGuardrailContent(r) {
  const pick = (label, val) => {
    if (val === undefined || val === null) return null;
    const s = typeof val === 'string' ? val.trim() : String(val);
    if (s === '') return null;
    return `${label}: ${s}`;
  };
  const lines = [];
  const ordered = [
    pick('Title', r.title),
    pick('Description', r.description),
    pick('Category', r.category),
    pick('Severity', r.severity),
    pick('Action', r.action),
    pick('Scope', r.scope),
    pick('Applies to', r.applies_to),
    pick('Matcher JSON', r.matcher_json),
    pick('Policy JSON', r.policy_json),
    pick('Metadata JSON', r.metadata_json),
  ].filter(Boolean);
  return ordered.length ? ordered.join('\n') : '(empty guardrail body)';
}

/**
 * @param {Record<string, unknown>} r
 * @param {{ tenantId: string, workspaceId: string, projectId: string }} scope document row scope for Supabase (match_documents)
 */
export function guardrailDocumentMetadata(r, scope) {
  return {
    d1_table: 'agentsam_guardrails',
    d1_row_id: r.id != null ? String(r.id) : null,
    d1_tenant_id: r.tenant_id != null && String(r.tenant_id) !== '' ? String(r.tenant_id) : null,
    d1_workspace_id:
      r.workspace_id != null && String(r.workspace_id) !== '' ? String(r.workspace_id) : null,
    guardrail_key: r.guardrail_key != null ? String(r.guardrail_key) : null,
    scope: r.scope != null ? String(r.scope) : null,
    applies_to: r.applies_to != null ? String(r.applies_to) : null,
    document_tenant_id: scope.tenantId,
    document_workspace_id: scope.workspaceId,
    document_project_id: scope.projectId,
  };
}
