-- 215: project_memory (dashboard UI context) + roadmap_steps (completed milestones) + CIDI JSON bucket name fix
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/215_project_memory_agent_dashboard_ui_20260402.sql

-- Align CIDI_THREE_STEP_SYSTEM JSON with current sandbox bucket (was agent-sam-sandbox-cidi in migration 204)
UPDATE project_memory
SET
  value = REPLACE(value, 'agent-sam-sandbox-cidi', 'agent-sam-sandbox-cicd'),
  updated_at = unixepoch()
WHERE project_id = 'inneranimalmedia'
  AND key = 'CIDI_THREE_STEP_SYSTEM';

INSERT OR REPLACE INTO project_memory (
  id,
  project_id,
  tenant_id,
  memory_type,
  key,
  value,
  importance_score,
  confidence_score,
  created_by,
  created_at,
  updated_at
) VALUES (
  'pmem_agent_dashboard_ui_20260402',
  'inneranimalmedia',
  'tenant_sam_primeaux',
  'workflow',
  'AGENT_DASHBOARD_UI_CONTEXT',
  '{"version":"1","updated":"2026-04-02","repo":{"name":"inneranimalmedia-agentsam-dashboard","local_cd":"cd ~/Downloads/inneranimalmedia/inneranimalmedia-agentsam-dashboard"},"sandbox":{"npm_script":"deploy:sandbox","script_path":"scripts/deploy-sandbox.sh","bucket":"agent-sam-sandbox-cicd","worker":"inneranimal-dashboard","urls":{"agent":"https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent"}},"monaco_agent":{"activeFile_lifted_in":"App.tsx","chat_props":["activeFile","activeFileContent","activeFileName","editorCursorLine","editorCursorColumn"],"mention_injection":["@file","@monaco","@r2:bucket","@d1","@filename from picker matches basename"],"tool_routing_block":"formatAgentToolRouting"},"worker_r2_read":"optional bucket param; resolveAgentR2BucketBinding for DASHBOARD agent-sam keys","html_preview":{"tab_bar_button":"Preview","browser_tab":"blob URL via BrowserView normalizeNavigate blob/data passthrough"},"commits":["4ff5ebb feat batch","2e9accb fix @filename + HTML preview"]}',
  0.95,
  1.0,
  'cursor_agent',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO roadmap_steps (
  id,
  plan_id,
  tenant_id,
  title,
  description,
  status,
  order_index,
  created_at,
  updated_at
) VALUES
(
  'step_dashboard_mention_activefile_20260402',
  'plan_iam_dashboard_v1',
  'tenant_sam_primeaux',
  'Agent chat: @filename / @file / @monaco + activeFile tool routing',
  'ChatAssistant buildMentionContext: fileNameMentionedInMessage for picker labels (e.g. @cms.html); formatAgentToolRouting with r2_read/r2_write bucket+key; App passes activeFile to ChatAssistant. Worker: resolveAgentR2BucketBinding for r2_read/r2_write.',
  'completed',
  96,
  datetime('now'),
  datetime('now')
),
(
  'step_dashboard_html_preview_blob_20260402',
  'plan_iam_dashboard_v1',
  'tenant_sam_primeaux',
  'HTML Preview button → Browser tab (blob URL)',
  'App openHtmlPreview: Blob text/html; BrowserView accepts blob:/data: without https prefix; Preview in tab bar when .html/.htm open.',
  'completed',
  97,
  datetime('now'),
  datetime('now')
);
