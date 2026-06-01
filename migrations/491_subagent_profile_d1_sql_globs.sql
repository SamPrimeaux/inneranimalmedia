-- Allow D1/SQL catalog tools for implementation subagents (code-editor, sam-builder).
-- filterToolsForSubagentProfile maps glob tokens d1/sql via toolMatchesSubagentGlob.

UPDATE agentsam_subagent_profile
SET
  allowed_tool_globs = '["read","write","glob","grep","terminal","d1","sql"]',
  updated_at = datetime('now')
WHERE slug IN ('code-editor', 'sam-builder')
  AND allowed_tool_globs NOT LIKE '%"d1"%';
