-- Backfill vm_workspace_root for known Mac remotes (fail-loud GCP cwd).
-- VM verify 2026-07-21: only ~/inneranimalmedia + ~/ExecOS exist on iam-tunnel;
-- these four dirs are MISSING until cloned — backfill still preferred so unset
-- cannot silently fall into the operator repo (ENOENT > wrong-repo).

UPDATE workspace_settings
SET settings_json = json_patch(COALESCE(settings_json, '{}'), '{"vm_workspace_root":"/home/samprimeaux/meauxbility"}'),
    updated_at = unixepoch()
WHERE workspace_id = 'ws_meauxbility';

UPDATE workspace_settings
SET settings_json = json_patch(COALESCE(settings_json, '{}'), '{"vm_workspace_root":"/home/samprimeaux/fuelnfreetime"}'),
    updated_at = unixepoch()
WHERE workspace_id = 'ws_fuelnfreetime';

UPDATE workspace_settings
SET settings_json = json_patch(COALESCE(settings_json, '{}'), '{"vm_workspace_root":"/home/samprimeaux/companionscpas"}'),
    updated_at = unixepoch()
WHERE workspace_id = 'ws_companionscpas';

UPDATE workspace_settings
SET settings_json = json_patch(COALESCE(settings_json, '{}'), '{"vm_workspace_root":"/home/samprimeaux/inneranimalmedia-mcp-server"}'),
    updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia_mcp';
