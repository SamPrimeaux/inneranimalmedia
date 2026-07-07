-- 785: Wireframe requests must use Excalidraw tools, not ASCII text in chat/files.
-- Pin illustration_create on plan route; add agent rule.
-- Note: route row id=route_plan, route_key=plan (not route_key='route_plan').

UPDATE agentsam_prompt_routes
SET
  tool_keys = '["agentsam_autorag","agentsam_d1_query","generate_execution_plan","excalidraw_open","illustration_create","excalidraw_add_elements","excalidraw_load_library"]'
WHERE id = 'route_plan';

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
  trigger_type,
  sort_order,
  notes,
  source_stored
) VALUES (
  'rule_excalidraw_wireframe_deliverable',
  '',
  '',
  'Wireframes render on Excalidraw canvas',
  'When the user asks for a wireframe, lo-fi sketch, UI flow, or diagram: call **illustration_create** (iam.illustration.v1, intent=wireframe, engine=excalidraw) or **excalidraw_add_elements** with real Excalidraw JSON. Do **not** reply with ASCII art, monospace text layouts, or agent_output.text previews — open /dashboard/draw with the artifact.',
  1,
  1,
  unixepoch(),
  unixepoch(),
  'always',
  'behavior',
  'wireframe',
  85,
  'P0 draw libraries + illustration_create; never ASCII wireframes in chat.',
  'migration_785'
);
