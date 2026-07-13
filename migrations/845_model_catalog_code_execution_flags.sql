-- Align providers for native / routing code-execution.
-- supports_code_execution gates:
--   Anthropic: inject code_execution_20260120 (Sonnet 5 / 4.5+) via features
--   Gemini: inject built-in { code_execution: {} }
--   Routing: prefer these arms when needCodeExec / builder tool-required
-- In-app agentsam_code_interpreter remains the cross-provider PTY crunch tool.

UPDATE agentsam_model_catalog
SET supports_code_execution = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE model_key IN (
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-opus-4-8',
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.1-pro-preview-customtools',
  'gemini-3.1-flash-lite',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna'
);
