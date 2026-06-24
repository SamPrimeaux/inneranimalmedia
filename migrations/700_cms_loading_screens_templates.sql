-- 700: Loading Screens CMS template catalog (labs, offline game, inline progress presets)

INSERT INTO cms_component_templates (
  id, template_name, template_type, category,
  is_system, slug, source_html_r2_key, r2_key,
  template_data, preview_image_url, source_liquid_file
) VALUES
(
  'tpl_loading_states_lab_v1',
  'Agent Sam Loading States Lab',
  'loading_screen',
  'Loading Screens',
  1,
  'loading-states-lab',
  'static/templates/ui/agent-sam-loading-states-lab/index.html',
  'cms/motion/iam-motion-system-v1/agent_sam_loading_states_lab.html',
  '{"title":"Agent Sam Loading States Lab","description":"Animated presence icons, skeleton shimmer, and lab shell. Synced with dashboard/features/agent-presence.","stack":["SVG","CSS motion","presenceIcons.ts"],"preview_url":"https://assets.inneranimalmedia.com/cms/motion/iam-motion-system-v1/agent_sam_loading_states_lab.html"}',
  NULL,
  NULL
),
(
  'tpl_loading_states_clean_lab',
  'AgentSam Loading States — Clean Lab',
  'loading_screen',
  'Loading Screens',
  1,
  'loading-states-clean-lab',
  'static/templates/ui/agent-sam-loading-states-clean-lab/index.html',
  'cms/motion/iam-motion-system-v1/agent_sam_loading_states_clean_lab.html',
  '{"title":"AgentSam Loading States — Clean Lab","description":"Meshy-style inline progress, themed loaders, simulate pipeline, compact presence rows.","stack":["InlineJobProgress","presenceIcons","CSS variables"],"inline_component":"dashboard/components/designstudio/shared/InlineJobProgress.tsx"}',
  NULL,
  NULL
),
(
  'tpl_iam_offline_runner',
  'IAM Offline Runner',
  'loading_screen',
  'Loading Screens',
  1,
  'iam-offline-runner',
  'static/templates/ui/iam-offline-runner/index.html',
  'static/templates/ui/iam-offline-runner/index.html',
  '{"title":"IAM Offline Runner","description":"Offline empty-state mini game while network reconnects. Tap or space to jump.","stack":["SVG","CSS animation","localStorage high score"],"use_case":"offline_fallback"}',
  NULL,
  NULL
),
(
  'tpl_inline_meshy_progress',
  'Inline Meshy Job Progress',
  'loading_state',
  'Loading Screens',
  1,
  'inline-meshy-progress',
  NULL,
  NULL,
  '{"title":"Inline Meshy Job Progress","description":"Design Studio viewport inline progress using branded presence icons.","component":"InlineJobProgress","phases":["agent-spark","pixel","path","files","skeleton-plan","done-bloom","error-signal"],"css_class":"inline-job-progress"}',
  NULL,
  NULL
),
(
  'tpl_inline_terminal_progress',
  'Inline Terminal CAD Progress',
  'loading_state',
  'Loading Screens',
  1,
  'inline-terminal-progress',
  NULL,
  NULL,
  '{"title":"Inline Terminal CAD Progress","description":"OpenSCAD / Blender / FreeCAD runner jobs with terminal + filing icons.","component":"InlineJobProgress","phases":["agent-spark","terminal","files"]}',
  NULL,
  NULL
),
(
  'tpl_inline_offline_signal',
  'Offline Signal Wait',
  'loading_state',
  'Loading Screens',
  1,
  'inline-offline-signal',
  NULL,
  NULL,
  '{"title":"Offline Signal Wait","description":"Presence state for network paused — pair with IAM Offline Runner template.","icon":"error-signal","presence_state":"offline"}',
  NULL,
  NULL
)
ON CONFLICT(id) DO UPDATE SET
  template_name = excluded.template_name,
  template_type = excluded.template_type,
  category = excluded.category,
  is_system = excluded.is_system,
  slug = excluded.slug,
  source_html_r2_key = excluded.source_html_r2_key,
  r2_key = excluded.r2_key,
  template_data = excluded.template_data,
  updated_at = datetime('now');

-- Meshy / CAD loading copy for GET /api/loading-states
INSERT OR IGNORE INTO ui_loading_states (id, context, personality_tone, message, sort_order, is_active) VALUES
  ('uls_meshy_1', 'meshy_generating', NULL, 'Creating your model…', 10, 1),
  ('uls_meshy_2', 'meshy_generating', NULL, 'Sculpting geometry from prompt…', 20, 1),
  ('uls_meshy_3', 'meshy_generating', NULL, 'Applying textures…', 30, 1),
  ('uls_meshy_4', 'meshy_upload', NULL, 'Saving to your library…', 10, 1),
  ('uls_meshy_5', 'meshy_polish', NULL, 'Optimizing mesh…', 10, 1),
  ('uls_offline_1', 'offline', NULL, 'Network paused — Agent Sam will resume when you reconnect.', 10, 1);
