-- 938: Versioned capability policies. Tool profiles remain menu allowlists.
UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":[],"require_approval_capabilities":[]}', updated_at = unixepoch()
WHERE profile_key IN ('ask','inspect','d1_read','supabase_read','supabase_vector');
UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["file.write","github.write","terminal.execute","memory.write","memory.delete"],"require_approval_capabilities":["github.write"]}', updated_at = unixepoch()
WHERE profile_key = 'code_develop';
UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["d1.write","supabase.write","memory.write","memory.delete"],"require_approval_capabilities":["supabase.write"]}', updated_at = unixepoch()
WHERE profile_key = 'database_engineer';
UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["media.generate","media.transform","media.manage","design.write","design.export","memory.write","memory.delete"],"require_approval_capabilities":["media.manage"]}', updated_at = unixepoch()
WHERE profile_key IN ('design_studio','cad_generation','design_visualization','visual_canvas');
UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["email.modify","email.draft","email.send"],"require_approval_capabilities":["email.send"]}', updated_at = unixepoch()
WHERE profile_key IN ('mail','mail_triage','mail_sweep','mail_compose');
UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["supabase.write","supabase.migrate","memory.write"],"require_approval_capabilities":["supabase.migrate"]}', updated_at = unixepoch()
WHERE profile_key IN ('supabase_write','supabase_migration');
UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["cms.write","cms.publish","r2.write","d1.write","github.write","browser.navigate","memory.write"],"require_approval_capabilities":["cms.publish","github.write"]}', updated_at = unixepoch()
WHERE profile_key = 'cms_edit';
UPDATE agentsam_tool_profiles
SET write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["d1.write","file.write","github.write","terminal.execute","container.execute","python.execute","git.commit","git.push","memory.write","memory.delete","cloudflare.execute","cloudflare.deploy","r2.write","r2.delete","kv.write","kv.delete","vector.write","images.write","browser.navigate","browser.execute","email.modify","email.draft","email.send","cms.write","cms.publish","media.generate","media.transform","media.render","media.export","media.manage","design.write","design.export","workflow.execute","workflow.manage","ticket.write","ticket.status","agent.execute","agent.spawn","drive.write","platform.telemetry"],"require_approval_capabilities":["git.commit","git.push","cloudflare.deploy","email.send","cms.publish","media.manage"]}', updated_at = unixepoch()
WHERE profile_key IN ('in_app_agent_cf_github','default_route','design_intake');
