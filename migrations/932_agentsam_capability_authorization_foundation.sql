-- 932: Capability-owned authorization foundation.
-- Tool keys remain executable identities; capabilities are reusable authority boundaries.

CREATE TABLE IF NOT EXISTS agentsam_capabilities (
  capability_key TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  verb TEXT NOT NULL,
  description TEXT NOT NULL,
  is_mutating INTEGER NOT NULL DEFAULT 0 CHECK (is_mutating IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS agentsam_tool_capabilities (
  tool_id TEXT NOT NULL REFERENCES agentsam_tools(id) ON DELETE CASCADE,
  capability_key TEXT NOT NULL REFERENCES agentsam_capabilities(capability_key),
  requirement_type TEXT NOT NULL DEFAULT 'required' CHECK (requirement_type = 'required'),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  operations_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (tool_id, capability_key)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_tool_capabilities_tool
  ON agentsam_tool_capabilities(tool_id);
CREATE INDEX IF NOT EXISTS idx_agentsam_tool_capabilities_capability
  ON agentsam_tool_capabilities(capability_key);

INSERT OR REPLACE INTO agentsam_capabilities
  (capability_key, domain, verb, description, is_mutating, is_active, created_at, updated_at)
VALUES
  ('agent.read','agent','read','Read registered agent definitions.',0,1,unixepoch(),unixepoch()),
  ('agent.execute','agent','execute','Execute a registered agent.',1,1,unixepoch(),unixepoch()),
  ('agent.spawn','agent','spawn','Create or spawn an agent session.',1,1,unixepoch(),unixepoch()),
  ('workflow.read','workflow','read','Read workflow definitions and state.',0,1,unixepoch(),unixepoch()),
  ('workflow.execute','workflow','execute','Execute a workflow.',1,1,unixepoch(),unixepoch()),
  ('workflow.manage','workflow','manage','Create or mutate workflow definitions.',1,1,unixepoch(),unixepoch()),
  ('ticket.read','ticket','read','Read tickets and notes.',0,1,unixepoch(),unixepoch()),
  ('ticket.write','ticket','write','Create tickets or notes.',1,1,unixepoch(),unixepoch()),
  ('ticket.status','ticket','status','Change ticket lifecycle state.',1,1,unixepoch(),unixepoch()),
  ('memory.read','memory','read','Search, list, or read scoped memory.',0,1,unixepoch(),unixepoch()),
  ('memory.write','memory','write','Create or update scoped memory.',1,1,unixepoch(),unixepoch()),
  ('memory.delete','memory','delete','Delete or resolve scoped memory.',1,1,unixepoch(),unixepoch()),
  ('file.read','file','read','Read workspace files.',0,1,unixepoch(),unixepoch()),
  ('file.search','file','search','Search workspace files.',0,1,unixepoch(),unixepoch()),
  ('file.write','file','write','Create or mutate workspace files.',1,1,unixepoch(),unixepoch()),
  ('git.read','git','read','Read Git status, diff, and history.',0,1,unixepoch(),unixepoch()),
  ('git.commit','git','commit','Create a Git commit.',1,1,unixepoch(),unixepoch()),
  ('git.push','git','push','Push Git refs to a remote.',1,1,unixepoch(),unixepoch()),
  ('github.read','github','read','Read GitHub resources.',0,1,unixepoch(),unixepoch()),
  ('github.write','github','write','Mutate GitHub resources.',1,1,unixepoch(),unixepoch()),
  ('github.admin','github','admin','Administer GitHub repositories or organizations.',1,1,unixepoch(),unixepoch()),
  ('github.security.read','github.security','read','Read GitHub security findings.',0,1,unixepoch(),unixepoch()),
  ('github.workflow.execute','github.workflow','execute','Trigger GitHub Actions workflows.',1,1,unixepoch(),unixepoch()),
  ('terminal.execute','terminal','execute','Execute a workspace terminal command.',1,1,unixepoch(),unixepoch()),
  ('container.execute','container','execute','Execute a command in an isolated container.',1,1,unixepoch(),unixepoch()),
  ('python.execute','python','execute','Execute Python code.',1,1,unixepoch(),unixepoch()),
  ('d1.read','d1','read','Read Cloudflare D1 data or schema.',0,1,unixepoch(),unixepoch()),
  ('d1.write','d1','write','Mutate Cloudflare D1 data.',1,1,unixepoch(),unixepoch()),
  ('d1.migrate','d1','migrate','Apply Cloudflare D1 schema migrations.',1,1,unixepoch(),unixepoch()),
  ('supabase.read','supabase','read','Read scoped Supabase/Postgres data.',0,1,unixepoch(),unixepoch()),
  ('supabase.write','supabase','write','Mutate scoped Supabase/Postgres data.',1,1,unixepoch(),unixepoch()),
  ('supabase.migrate','supabase','migrate','Apply Supabase/Postgres schema migrations.',1,1,unixepoch(),unixepoch()),
  ('supabase.vector.read','supabase.vector','read','Query Supabase vector data.',0,1,unixepoch(),unixepoch()),
  ('supabase.vector.write','supabase.vector','write','Mutate Supabase vector data.',1,1,unixepoch(),unixepoch()),
  ('kv.read','kv','read','Read Cloudflare KV.',0,1,unixepoch(),unixepoch()),
  ('kv.write','kv','write','Write Cloudflare KV.',1,1,unixepoch(),unixepoch()),
  ('kv.delete','kv','delete','Delete Cloudflare KV values.',1,1,unixepoch(),unixepoch()),
  ('r2.read','r2','read','List or read R2 objects.',0,1,unixepoch(),unixepoch()),
  ('r2.write','r2','write','Write R2 objects.',1,1,unixepoch(),unixepoch()),
  ('r2.delete','r2','delete','Delete R2 objects.',1,1,unixepoch(),unixepoch()),
  ('vector.read','vector','read','Query Vectorize indexes.',0,1,unixepoch(),unixepoch()),
  ('vector.write','vector','write','Mutate Vectorize indexes.',1,1,unixepoch(),unixepoch()),
  ('images.read','images','read','Read image assets and metadata.',0,1,unixepoch(),unixepoch()),
  ('images.write','images','write','Upload or mutate image assets.',1,1,unixepoch(),unixepoch()),
  ('cloudflare.read','cloudflare','read','Read Cloudflare resource metadata.',0,1,unixepoch(),unixepoch()),
  ('cloudflare.execute','cloudflare','execute','Execute a scoped Cloudflare operation.',1,1,unixepoch(),unixepoch()),
  ('cloudflare.deploy','cloudflare','deploy','Deploy a Cloudflare Worker or stack.',1,1,unixepoch(),unixepoch()),
  ('browser.read','browser','read','Inspect browser content.',0,1,unixepoch(),unixepoch()),
  ('browser.navigate','browser','navigate','Navigate a browser session.',1,1,unixepoch(),unixepoch()),
  ('browser.execute','browser','execute','Execute browser automation or script.',1,1,unixepoch(),unixepoch()),
  ('browser.capture','browser','capture','Capture a browser screenshot or snapshot.',0,1,unixepoch(),unixepoch()),
  ('web.search','web','search','Search the public web.',0,1,unixepoch(),unixepoch()),
  ('web.fetch','web','fetch','Fetch public web content.',0,1,unixepoch(),unixepoch()),
  ('email.read','email','read','Read mail and labels.',0,1,unixepoch(),unixepoch()),
  ('email.draft','email','draft','Create or mutate an email draft.',1,1,unixepoch(),unixepoch()),
  ('email.modify','email','modify','Modify mail state or labels.',1,1,unixepoch(),unixepoch()),
  ('email.send','email','send','Send email.',1,1,unixepoch(),unixepoch()),
  ('cms.read','cms','read','Read CMS content and state.',0,1,unixepoch(),unixepoch()),
  ('cms.write','cms','write','Mutate CMS drafts and content.',1,1,unixepoch(),unixepoch()),
  ('cms.publish','cms','publish','Publish CMS content.',1,1,unixepoch(),unixepoch()),
  ('media.generate','media','generate','Generate image, video, or 3D media.',1,1,unixepoch(),unixepoch()),
  ('media.transform','media','transform','Transform an existing media asset.',1,1,unixepoch(),unixepoch()),
  ('media.render','media','render','Render a media project.',1,1,unixepoch(),unixepoch()),
  ('media.export','media','export','Export a media project or asset.',1,1,unixepoch(),unixepoch()),
  ('media.status','media','status','Read media task status.',0,1,unixepoch(),unixepoch()),
  ('media.manage','media','manage','Cancel or delete an owned media task.',1,1,unixepoch(),unixepoch()),
  ('design.read','design','read','Read design or canvas state.',0,1,unixepoch(),unixepoch()),
  ('design.write','design','write','Mutate design or canvas state.',1,1,unixepoch(),unixepoch()),
  ('design.export','design','export','Export a design artifact.',1,1,unixepoch(),unixepoch()),
  ('drive.read','drive','read','Read connected drive content.',0,1,unixepoch(),unixepoch()),
  ('drive.write','drive','write','Mutate connected drive content.',1,1,unixepoch(),unixepoch()),
  ('platform.read','platform','read','Read platform health and metadata.',0,1,unixepoch(),unixepoch()),
  ('platform.audit','platform','audit','Read platform audit evidence.',0,1,unixepoch(),unixepoch()),
  ('platform.telemetry','platform','telemetry','Write platform telemetry.',1,1,unixepoch(),unixepoch());

-- Explicitly normalized primary capability. Categories were audited against
-- handler_type, handler_config, schemas, risk, and implementation behavior.
WITH primary_map(tool_key, capability_key) AS (
  SELECT tool_key,
    CASE
      WHEN tool_key IN ('agentsam_get_agent','agentsam_list_agents') THEN 'agent.read'
      WHEN tool_key IN ('agentsam_spawn_profile','agentsam_create_subagent') THEN 'agent.spawn'
      WHEN tool_key IN ('agentsam_run_agent','ai_complete') THEN 'agent.execute'
      WHEN tool_key = 'agentsam_workflow_trigger' THEN 'workflow.execute'
      WHEN tool_key IN ('agentsam_ticket_get','agentsam_ticket_list') THEN 'ticket.read'
      WHEN tool_key IN ('agentsam_ticket_create','agentsam_ticket_add_note') THEN 'ticket.write'
      WHEN tool_key = 'agentsam_ticket_set_status' THEN 'ticket.status'
      WHEN tool_key = 'agentsam_memory_manager' THEN 'memory.read'
      WHEN tool_key = 'fs_read_file' THEN 'file.read'
      WHEN tool_key IN ('fs_search_files','agentsam_workspace_search') THEN 'file.search'
      WHEN tool_key IN ('fs_write_file','fs_edit_file','agentsam_codebase_scan_fix') THEN 'file.write'
      WHEN tool_key IN ('pty_git_status','pty_git_diff','pty_git_log') THEN 'git.read'
      WHEN tool_key = 'pty_git_commit' THEN 'git.commit'
      WHEN tool_key = 'pty_git_push' THEN 'git.push'
      WHEN tool_key = 'agentsam_github_mcp_actions_run_trigger' THEN 'github.workflow.execute'
      WHEN tool_category = 'github.security' THEN 'github.security.read'
      WHEN tool_key LIKE '%_write' OR tool_key LIKE '%_create_gist'
        OR tool_key LIKE '%_update_gist' OR tool_key LIKE '%_star_repository'
        OR tool_key LIKE '%_unstar_repository' OR tool_key LIKE '%_dismiss_notification'
        OR tool_key LIKE '%_mark_all_notifications_read'
        OR tool_key IN ('agentsam_github_issue','agentsam_github_pr','agentsam_github_patch','agentsam_github_write',
                        'agentsam_github_mcp_assign_copilot_to_issue','agentsam_github_mcp_request_copilot_review',
                        'agentsam_github_mcp_manage_notification_subscription',
                        'agentsam_github_mcp_manage_repository_notification_subscription')
        THEN 'github.write'
      WHEN tool_category LIKE 'github.%' THEN 'github.read'
      WHEN tool_key IN ('agentsam_terminal_local','agentsam_terminal_remote','agentsam_terminal_sandbox') THEN 'terminal.execute'
      WHEN tool_key = 'agentsam_container_exec' THEN 'container.execute'
      WHEN tool_key = 'agentsam_code_interpreter' THEN 'python.execute'
      WHEN tool_key IN ('agentsam_d1_query','agentsam_cf_d1_list') THEN 'd1.read'
      WHEN tool_key IN ('agentsam_d1_write','agentsam_d1_delete') THEN 'd1.write'
      WHEN tool_key = 'agentsam_d1_migrate' THEN 'd1.migrate'
      WHEN tool_key = 'agentsam_supabase_query' THEN 'supabase.read'
      WHEN tool_key = 'agentsam_supabase_write' THEN 'supabase.write'
      WHEN tool_key = 'agentsam_supabase_vector' THEN 'supabase.vector.read'
      WHEN tool_key = 'agentsam_cf_kv_list' THEN 'kv.read'
      WHEN tool_key = 'agentsam_kv_manage' THEN 'kv.write'
      WHEN tool_key IN ('agentsam_cf_r2_buckets','agentsam_r2_list','agentsam_r2_get') THEN 'r2.read'
      WHEN tool_key = 'agentsam_r2_put' THEN 'r2.write'
      WHEN tool_key = 'agentsam_r2_delete' THEN 'r2.delete'
      WHEN tool_key = 'agentsam_cf_vectorize' THEN 'vector.write'
      WHEN tool_key IN ('agentsam_cf_images_upload','agentsam_cf_image_upload') THEN 'images.write'
      WHEN tool_key IN ('agentsam_cf_workers_list','agentsam_cf_worker_get','agentsam_cf_worker_code',
                        'search_cloudflare_documentation','migrate_pages_to_workers_guide') THEN 'cloudflare.read'
      WHEN tool_key = 'cloudflare_command_registry' THEN 'cloudflare.execute'
      WHEN tool_key IN ('agentsam_worker_deploy','agentsam_stack_deploy') THEN 'cloudflare.deploy'
      WHEN tool_key IN ('browser_content','browser_run_content','browser_run_links','browser_run_crawl') THEN 'browser.read'
      WHEN tool_key = 'browser_navigate' THEN 'browser.navigate'
      WHEN tool_key IN ('agentsam_playwright','cdt_evaluate_script','browser_run_json',
                        'browser_run_markdown','browser_run_pdf','browser_run_scrape') THEN 'browser.execute'
      WHEN tool_key IN ('cdt_take_screenshot','browser_run_screenshot','browser_run_snapshot') THEN 'browser.capture'
      WHEN tool_key = 'search_web' THEN 'web.search'
      WHEN tool_key = 'web_fetch' THEN 'web.fetch'
      WHEN tool_key IN ('gmail_list_inbox','gmail_get_message','agentsam_gmail_mcp_get_thread',
                        'agentsam_gmail_mcp_search_threads','agentsam_gmail_mcp_list_drafts',
                        'agentsam_gmail_mcp_list_labels') THEN 'email.read'
      WHEN tool_key IN ('agentsam_gmail_mcp_create_draft','agentsam_gmail_mcp_create_label') THEN 'email.draft'
      WHEN tool_key = 'gmail_send' OR tool_key = 'agentsam_send_email' THEN 'email.send'
      WHEN tool_category IN ('gmail','gmail.official') THEN 'email.modify'
      WHEN tool_key = 'agentsam_cms_read' OR tool_key = 'agentsam_cms_verify_live' THEN 'cms.read'
      WHEN tool_key LIKE 'agentsam_cms_publish%' THEN 'cms.publish'
      WHEN tool_category = 'cms.execute' THEN 'cms.write'
      WHEN tool_key IN ('imgx_generate_image','veo_generate_video','illustration_create',
                        'meshyai_text_to_3d','meshyai_image_to_3d') THEN 'media.generate'
      WHEN tool_key = 'meshyai_get_task' THEN 'media.status'
      WHEN tool_key LIKE 'meshyai_%' OR tool_key = 'agentsam_video_embed' THEN 'media.transform'
      WHEN tool_key = 'moviemode_render' THEN 'media.render'
      WHEN tool_key = 'moviemode_export' THEN 'media.export'
      WHEN tool_key IN ('agentsam_excalidraw','excalidraw_load_library') THEN 'design.read'
      WHEN tool_key = 'excalidraw_plan_map_create' THEN 'design.write'
      WHEN tool_key = 'excalidraw_export' THEN 'design.export'
      WHEN tool_key = 'agentsam_gdrive' THEN 'drive.read'
      WHEN tool_key IN ('agentsam_mcp_audit','agentsam_spawn_tree') THEN 'platform.audit'
      WHEN tool_key = 'agentsam_ping' THEN 'platform.read'
      ELSE NULL
    END
  FROM agentsam_tools
  WHERE COALESCE(is_active,1)=1
)
INSERT OR IGNORE INTO agentsam_tool_capabilities
  (tool_id, capability_key, requirement_type, is_primary, created_at)
SELECT t.id, pm.capability_key, 'required', 1, unixepoch()
FROM primary_map pm
JOIN agentsam_tools t ON t.tool_key = pm.tool_key
WHERE pm.capability_key IS NOT NULL;

-- Composite authority requirements, including operation-sensitive memory lanes.
INSERT OR IGNORE INTO agentsam_tool_capabilities
  (tool_id, capability_key, requirement_type, is_primary, operations_json, created_at)
SELECT t.id, x.capability_key, 'required', 0, x.operations_json, unixepoch()
FROM agentsam_tools t
JOIN (
  SELECT 'agentsam_memory_manager' tool_key, 'memory.write' capability_key,
         '["write","upsert","save","memory_write"]' operations_json
  UNION ALL SELECT 'agentsam_memory_manager','memory.delete','["delete","resolve","close","memory_delete","memory_resolve"]'
  UNION ALL SELECT 'agentsam_codebase_scan_fix','file.read',NULL
  UNION ALL SELECT 'agentsam_codebase_scan_fix','github.write','["fix_and_pr","fix_and_deploy"]'
  UNION ALL SELECT 'agentsam_codebase_scan_fix','cloudflare.deploy','["fix_and_deploy"]'
  UNION ALL SELECT 'illustration_create','design.write',NULL
  UNION ALL SELECT 'agentsam_cf_vectorize','vector.read','["query","search"]'
  UNION ALL SELECT 'agentsam_gdrive','drive.write','["write","create","update","delete"]'
) x ON x.tool_key = t.tool_key;

-- Preserve the legacy primary column as a temporary mirror of the new primary relation.
UPDATE agentsam_tools
SET capability_key = (
      SELECT tc.capability_key
      FROM agentsam_tool_capabilities tc
      WHERE tc.tool_id = agentsam_tools.id AND tc.is_primary = 1
      LIMIT 1
    ),
    updated_at = unixepoch()
WHERE id IN (SELECT tool_id FROM agentsam_tool_capabilities WHERE is_primary = 1);

UPDATE agentsam_tool_capabilities
SET operations_json = '["upsert","delete"]'
WHERE tool_id = (SELECT id FROM agentsam_tools WHERE tool_key = 'agentsam_cf_vectorize')
  AND capability_key = 'vector.write';

-- Versioned capability policies. The selected profile remains the menu allowlist.
UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":[],"require_approval_capabilities":[]}',
    updated_at = unixepoch()
WHERE profile_key IN ('ask','inspect','d1_read','supabase_read','supabase_vector');

UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["file.write","github.write","terminal.execute","memory.write","memory.delete"],"require_approval_capabilities":["github.write"]}',
    updated_at = unixepoch()
WHERE profile_key = 'code_develop';

UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["d1.write","supabase.write","memory.write","memory.delete"],"require_approval_capabilities":["supabase.write"]}',
    updated_at = unixepoch()
WHERE profile_key = 'database_engineer';

UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["media.generate","media.transform","media.manage","design.write","design.export","memory.write","memory.delete"],"require_approval_capabilities":["media.manage"]}',
    updated_at = unixepoch()
WHERE profile_key IN ('design_studio','cad_generation','design_visualization','visual_canvas');

UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["email.modify","email.draft","email.send"],"require_approval_capabilities":["email.send"]}',
    updated_at = unixepoch()
WHERE profile_key IN ('mail','mail_triage','mail_sweep','mail_compose');

UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["supabase.write","supabase.migrate","memory.write"],"require_approval_capabilities":["supabase.migrate"]}',
    updated_at = unixepoch()
WHERE profile_key IN ('supabase_write','supabase_migration');

UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["cms.write","cms.publish","r2.write","d1.write","github.write","browser.navigate","memory.write"],"require_approval_capabilities":["cms.publish","github.write"]}',
    updated_at = unixepoch()
WHERE profile_key = 'cms_edit';

UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["d1.write","file.write","github.write","terminal.execute","container.execute","python.execute","git.commit","git.push","memory.write","memory.delete","cloudflare.execute","cloudflare.deploy","r2.write","r2.delete","kv.write","kv.delete","vector.write","images.write","browser.navigate","browser.execute","email.modify","email.draft","email.send","cms.write","cms.publish","media.generate","media.transform","media.render","media.export","media.manage","design.write","design.export","workflow.execute","workflow.manage","ticket.write","ticket.status","agent.execute","agent.spawn","drive.write","platform.telemetry"],"require_approval_capabilities":["git.commit","git.push","cloudflare.deploy","email.send","cms.publish","media.manage"]}',
    updated_at = unixepoch()
WHERE profile_key IN ('in_app_agent_cf_github','default_route','design_intake');
