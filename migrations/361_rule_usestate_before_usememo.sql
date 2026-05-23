-- Idempotent: React hook order — useState before useMemo that references it.
-- Triggered by dashboard/App.tsx TDZ (browserUrl after agentWorkspaceContext useMemo).

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
  person_uuid,
  apply_mode,
  globs,
  os_platform,
  trigger_type,
  trigger_condition_json,
  sort_order,
  input_prompt_json,
  execution_template,
  rule_type,
  notes,
  source_stored,
  source_url
) VALUES (
  'rule_usestate_before_usememo',
  '',
  'ws_inneranimalmedia',
  'Declare useState before useMemo/useCallback that references it',
  '## RULE: useState declarations before useMemo that references them
**ID:** rule_usestate_before_usememo

Always declare useState variables BEFORE any useMemo or useCallback that references
them in its dependency array or body. Declaring useState after a hook that reads it
causes a temporal dead zone crash at runtime — same class of error as circular imports.

```ts
// ❌ NEVER
const context = useMemo(() => ({ url: browserUrl }), [browserUrl])
const [browserUrl, setBrowserUrl] = useState('''')

// ✅ ALWAYS — declare state first
const [browserUrl, setBrowserUrl] = useState('''')
const context = useMemo(() => ({ url: browserUrl }), [browserUrl])
```',
  1,
  1,
  unixepoch(),
  unixepoch(),
  '',
  'always',
  'dashboard/**/*.tsx,dashboard/**/*.ts',
  'any',
  'manual',
  '{}',
  11,
  '{}',
  '',
  'instruction',
  'Triggered by ReferenceError: Cannot access browserUrl before initialization — browserUrl useState declared after agentWorkspaceContext useMemo in dashboard/App.tsx.',
  'd1:agentsam_rules_document:rule_usestate_before_usememo',
  ''
);
