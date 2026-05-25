-- 416: Canonical Cursor + Agent Sam rule — no hardcoded identity/auth in live code.
-- Platform rule row only (empty user_id / workspace_id). Operator ids belong in D1 via runtime, not SQL seeds.

INSERT OR IGNORE INTO agentsam_rules_document (
  id,
  user_id,
  workspace_id,
  title,
  body_markdown,
  version,
  is_active,
  created_at_epoch,
  updated_at_epoch,
  apply_mode,
  rule_type,
  notes,
  source_stored
) VALUES (
  'rule_no_hardcoded_identity_auth_protocol',
  '',
  '',
  'LOCKED: No hardcoded identity or auth protocol',
  '## RULE: No hardcoded identity or auth protocol (LOCKED)
**ID:** rule_no_hardcoded_identity_auth_protocol | **Priority:** ALWAYS

Never hardcode au_*, ws_*, tenant_* in src/, dashboard/, or MCP server request paths.
OAuth/MCP allowlists and external clients (chatgpt, claude) are D1-driven.
User client allowlist rows are written at OAuth consent from session — not migration-seeded operator ids.
Run: ./scripts/guard-no-hardcoded-identity.sh before ship.
Quality flag: HARDCODED_IDENTITY.',
  1,
  1,
  unixepoch(),
  unixepoch(),
  'always',
  'security',
  'Locked after repeated au_/ws_ hardcoding in MCP OAuth paths',
  'd1:agentsam_rules_document:rule_no_hardcoded_identity_auth_protocol'
);

UPDATE agentsam_rules_document
SET
  is_active = 1,
  updated_at_epoch = unixepoch()
WHERE id = 'rule_no_hardcoded_identity_auth_protocol';
