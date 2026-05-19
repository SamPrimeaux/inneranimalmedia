-- monaco_edit → r2_write for plan file delivery; browser_capture → http_fetch for URL preview reads
INSERT OR REPLACE INTO agentsam_capability_aliases (
  id,
  abstract_capability,
  match_kind,
  match_value,
  capability_lane,
  priority,
  requires_approval,
  is_mutation,
  rationale,
  is_active
)
VALUES
  (
    'capalias_monaco_edit_write',
    'monaco_edit',
    'tool_key',
    'r2_write',
    'develop',
    10,
    1,
    1,
    'monaco_edit file tasks write via R2. Confirmation required.',
    1
  ),
  (
    'capalias_monaco_edit_read',
    'monaco_edit',
    'tool_key',
    'r2_read',
    'develop',
    20,
    0,
    0,
    'monaco_edit read tasks read from R2.',
    1
  ),
  (
    'capalias_browser_capture_fetch',
    'browser_capture',
    'tool_key',
    'http_fetch',
    'develop',
    10,
    0,
    0,
    'browser_capture uses http_fetch for live URL preview only.',
    1
  );
