-- 722: GCP iam-tunnel operator repo root (GitHub clone @ ~/inneranimalmedia).
-- Mac workspace_root stays for localpty; vm_* fields are used for platform_vm / Linux exec.

UPDATE workspace_settings
SET settings_json = json_set(
  COALESCE(settings_json, '{}'),
  '$.vm_workspace_root', '/home/samprimeaux/inneranimalmedia',
  '$.vm_workspace_cd_command', 'cd /home/samprimeaux/inneranimalmedia',
  '$.repo.github_url', 'https://github.com/SamPrimeaux/inneranimalmedia',
  '$.repo.vm_path', '/home/samprimeaux/inneranimalmedia'
)
WHERE workspace_id = 'ws_inneranimalmedia';
