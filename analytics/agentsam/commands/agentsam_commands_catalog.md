# Agent Sam Command Catalog

Total active commands: 372

## Summary

- `browser/session` task=tool_use risk=low confirm=0 approval=0 mode=agent count=6
- `browser/session` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=2
- `ci_cd/builds` task=deploy risk=high confirm=1 approval=1 mode=agent count=1
- `ci_cd/builds` task=deploy risk=low confirm=0 approval=0 mode=agent count=5
- `ci_cd/triggers` task=deploy risk=critical confirm=1 approval=1 mode=agent count=1
- `ci_cd/triggers` task=deploy risk=high confirm=1 approval=1 mode=agent count=1
- `ci_cd/triggers` task=deploy risk=low confirm=0 approval=0 mode=agent count=1
- `ci_cd/triggers` task=deploy risk=medium confirm=1 approval=0 mode=agent count=3
- `cloudflare/healthchecks` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `cloudflare/healthchecks` task=tool_use risk=low confirm=0 approval=0 mode=agent count=4
- `cloudflare/healthchecks` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=2
- `cloudflare/images` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `cloudflare/images` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `cloudflare/images` task=tool_use risk=low confirm=0 approval=0 mode=agent count=4
- `cloudflare/images` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=3
- `cloudflare/realtime` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `cloudflare/realtime` task=tool_use risk=low confirm=0 approval=0 mode=agent count=3
- `cloudflare/realtime` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=2
- `cms/themes` task=tool_use risk=low confirm=0 approval=0 mode=agent count=4
- `d1/backup` task=sql_d1_generation risk=low confirm=0 approval=0 mode=agent count=2
- `d1/backup` task=sql_d1_generation risk=medium confirm=1 approval=0 mode=agent count=1
- `d1/database` task=sql_d1_generation risk=critical confirm=1 approval=1 mode=agent count=1
- `d1/database` task=sql_d1_generation risk=low confirm=0 approval=0 mode=agent count=2
- `d1/database` task=sql_d1_generation risk=medium confirm=1 approval=0 mode=agent count=1
- `d1/execute` task=sql_d1_generation risk=high confirm=1 approval=1 mode=agent count=2
- `d1/insights` task=sql_d1_generation risk=low confirm=0 approval=0 mode=agent count=1
- `d1/migrations` task=sql_d1_generation risk=high confirm=1 approval=1 mode=agent count=1
- `d1/migrations` task=sql_d1_generation risk=low confirm=0 approval=0 mode=agent count=2
- `d1/restore` task=sql_d1_generation risk=critical confirm=1 approval=1 mode=agent count=1
- `d1/restore` task=sql_d1_generation risk=low confirm=0 approval=0 mode=agent count=1
- `designstudio/asset` task=plan risk=medium confirm=0 approval=0 mode=agent count=1
- `designstudio/blueprint` task=plan risk=low confirm=0 approval=0 mode=agent count=1
- `designstudio/openscad` task=plan risk=medium confirm=1 approval=0 mode=agent count=1
- `designstudio/sketch` task=plan risk=low confirm=0 approval=0 mode=agent count=1
- `designstudio/terminal` task=plan risk=high confirm=1 approval=1 mode=agent count=1
- `designstudio/terminal` task=plan risk=medium confirm=1 approval=0 mode=agent count=2
- `durable_object/errors` task=code risk=high confirm=0 approval=1 mode=agent count=1
- `durable_object/errors` task=code risk=medium confirm=0 approval=0 mode=agent count=1
- `durable_object/fetch` task=code risk=medium confirm=0 approval=0 mode=agent count=1
- `durable_object/rpc` task=code risk=medium confirm=0 approval=0 mode=agent count=1
- `durable_object/storage` task=code risk=critical confirm=1 approval=1 mode=agent count=1
- `durable_object/storage` task=code risk=low confirm=0 approval=0 mode=agent count=1
- `durable_object/storage` task=code risk=medium confirm=0 approval=0 mode=agent count=2
- `durable_object/websocket` task=code risk=medium confirm=0 approval=0 mode=agent count=2
- `hyperdrive/config` task=code risk=critical confirm=1 approval=1 mode=agent count=1
- `hyperdrive/config` task=code risk=high confirm=1 approval=1 mode=agent count=2
- `hyperdrive/config` task=code risk=low confirm=0 approval=0 mode=agent count=2
- `kv/bulk` task=code risk=critical confirm=1 approval=1 mode=agent count=1
- `kv/bulk` task=code risk=high confirm=1 approval=1 mode=agent count=1
- `kv/bulk` task=code risk=low confirm=0 approval=0 mode=agent count=1
- `kv/key` task=code risk=high confirm=1 approval=1 mode=agent count=1
- `kv/key` task=code risk=low confirm=0 approval=0 mode=agent count=2
- `kv/key` task=code risk=medium confirm=1 approval=0 mode=agent count=1
- `kv/namespace` task=code risk=critical confirm=1 approval=1 mode=agent count=1
- `kv/namespace` task=code risk=high confirm=1 approval=1 mode=agent count=1
- `kv/namespace` task=code risk=low confirm=0 approval=0 mode=agent count=1
- `kv/namespace` task=code risk=medium confirm=1 approval=0 mode=agent count=1
- `meauxcad/analytics` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `meauxcad/cad-code` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `meauxcad/concept` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `meauxcad/export` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=2
- `meauxcad/generation` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `pages/config` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `pages/deploy` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `pages/deployment` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `pages/deployment` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `pages/dev` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `pages/functions` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `pages/project` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `pages/project` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `pages/project` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `pages/secrets` task=tool_use risk=high confirm=1 approval=1 mode=agent count=3
- `pages/secrets` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `queues/consumer` task=code risk=high confirm=1 approval=1 mode=agent count=2
- `queues/consumer-http` task=code risk=high confirm=1 approval=1 mode=agent count=2
- `queues/consumer-worker` task=code risk=high confirm=1 approval=1 mode=agent count=2
- `queues/delivery` task=code risk=critical confirm=1 approval=1 mode=agent count=1
- `queues/delivery` task=code risk=high confirm=1 approval=1 mode=agent count=1
- `queues/delivery` task=code risk=medium confirm=1 approval=0 mode=agent count=1
- `queues/queue` task=code risk=critical confirm=1 approval=1 mode=agent count=1
- `queues/queue` task=code risk=high confirm=1 approval=1 mode=agent count=1
- `queues/queue` task=code risk=low confirm=0 approval=0 mode=agent count=2
- `queues/queue` task=code risk=medium confirm=1 approval=0 mode=agent count=1
- `queues/subscription` task=code risk=high confirm=1 approval=1 mode=agent count=3
- `queues/subscription` task=code risk=low confirm=0 approval=0 mode=agent count=2
- `r2/bucket` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `r2/bucket` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `r2/bucket` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `r2/catalog` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `r2/catalog` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `r2/catalog` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=5
- `r2/cors` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `r2/cors` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `r2/cors` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `r2/domain` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `r2/domain` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `r2/domain` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `r2/lifecycle` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `r2/lifecycle` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `r2/lifecycle` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `r2/lock` task=tool_use risk=high confirm=1 approval=1 mode=agent count=3
- `r2/lock` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `r2/notification` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `r2/notification` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `r2/notification` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `r2/object` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `r2/public-access` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `r2/public-access` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `r2/public-access` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `r2/sippy` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `r2/sippy` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `r2/sippy` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `realtime_kit/livestream_analytics` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `realtime_kit/livestreams` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `realtime_kit/livestreams` task=tool_use risk=low confirm=0 approval=0 mode=agent count=5
- `realtime_kit/livestreams` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `realtime_kit/meetings` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `realtime_kit/meetings` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `realtime_kit/meetings` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=2
- `realtime_kit/participants` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `realtime_kit/participants` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `realtime_kit/participants` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=3
- `realtime_kit/webhooks` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `realtime_kit/webhooks` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `realtime_kit/webhooks` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `realtime_kit/webhooks` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `resource_sharing/recipients` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `resource_sharing/recipients` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `resource_sharing/recipients` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `resource_sharing/resources` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `resource_sharing/resources` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `resource_sharing/resources` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `resource_sharing/shares` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `resource_sharing/shares` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `resource_sharing/shares` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `security/securitytxt` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `security/securitytxt` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `security/securitytxt` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `security/token_validation_config` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=2
- `security/token_validation_config` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `security/token_validation_config` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `security/token_validation_rules` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `security/token_validation_rules` task=tool_use risk=high confirm=1 approval=1 mode=agent count=4
- `security/token_validation_rules` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `security/url_scanner` task=tool_use risk=low confirm=0 approval=0 mode=agent count=6
- `security/url_scanner` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=2
- `security/vuln_scanner` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `security/vuln_scanner` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `security/vuln_scanner_creds` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `security/vuln_scanner_creds` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `security/vuln_scanner_creds` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `security/vuln_scanner_env` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `security/vuln_scanner_env` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `security/vuln_scanner_env` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `security/vuln_scanner_env` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `ssl_tls/keyless_certificates` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=3
- `ssl_tls/keyless_certificates` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `system/auth` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `system/auth` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `system/auth` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=2
- `system/docs` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `system/shell` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `system/telemetry` task=tool_use risk=low confirm=0 approval=0 mode=agent count=3
- `tunnel/core` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `tunnel/core` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `tunnel/core` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `tunnel/runtime` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=2
- `vpc/service` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `vpc/service` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `vpc/service` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `worker/deploy` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `worker/deploy` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `worker/deployments` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `worker/deployments` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `worker/dev` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `worker/logs` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `worker/project` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `worker/project` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `worker/secrets` task=tool_use risk=high confirm=1 approval=1 mode=agent count=3
- `worker/secrets` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `worker/triggers` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `worker/versions` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `worker/versions` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `worker/versions` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `worker/versions-secrets` task=tool_use risk=high confirm=1 approval=1 mode=agent count=3
- `workers_ai/discovery` task=tool_use risk=low confirm=0 approval=0 mode=agent count=4
- `workers_ai/finetunes` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `workers_ai/finetunes` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `workers_ai/inference` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `workers_ai/tomarkdown` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `workers_ai/tomarkdown` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `workflow/general` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `zero_trust/access_apps` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `zero_trust/access_apps` task=tool_use risk=high confirm=1 approval=1 mode=agent count=3
- `zero_trust/access_apps` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `zero_trust/device_policy` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `zero_trust/device_policy` task=tool_use risk=high confirm=1 approval=1 mode=agent count=3
- `zero_trust/device_policy` task=tool_use risk=low confirm=0 approval=0 mode=agent count=3
- `zero_trust/devices` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `zero_trust/devices` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `zero_trust/devices` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `zero_trust/dex_tests` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `zero_trust/dex_tests` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `zero_trust/dex_tests` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=2
- `zero_trust/dlp` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `zero_trust/dlp` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `zero_trust/dlp` task=tool_use risk=low confirm=0 approval=0 mode=agent count=3
- `zero_trust/fleet_status` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `zero_trust/identity_providers` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `zero_trust/identity_providers` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `zero_trust/identity_providers` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `zero_trust/keys` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `zero_trust/keys` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `zero_trust/logs` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `zero_trust/mcp_portals` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `zero_trust/mcp_portals` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `zero_trust/mcp_portals` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `zero_trust/mcp_servers` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `zero_trust/mcp_servers` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `zero_trust/mcp_servers` task=tool_use risk=medium confirm=1 approval=0 mode=agent count=1
- `zero_trust/organization` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `zero_trust/organization` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `zero_trust/posture` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `zero_trust/posture` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `zero_trust/posture` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `zero_trust/registrations` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `zero_trust/registrations` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `zero_trust/registrations` task=tool_use risk=low confirm=0 approval=0 mode=agent count=2
- `zero_trust/resilience` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `zero_trust/resilience` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `zero_trust/service_tokens` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `zero_trust/service_tokens` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `zero_trust/service_tokens` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `zero_trust/tunnels` task=tool_use risk=high confirm=1 approval=1 mode=agent count=2
- `zero_trust/tunnels` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1
- `zero_trust/warp_connector` task=tool_use risk=critical confirm=1 approval=1 mode=agent count=1
- `zero_trust/warp_connector` task=tool_use risk=high confirm=1 approval=1 mode=agent count=1
- `zero_trust/warp_connector` task=tool_use risk=low confirm=0 approval=0 mode=agent count=1

## Commands by Group


### browser/session

#### /browser-create — Browser Create
- id: `cmd_browser_create`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler browser create`
- description: Create a Browser Run rendering session

#### /browser-create-json — Browser Create JSON
- id: `cmd_browser_create_json`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler browser create --json`
- description: Create browser session and return JSON

#### /browser-create-keepalive — Browser Create KeepAlive
- id: `cmd_browser_create_keepalive`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler browser create --keepAlive {SECONDS}`
- description: Create browser session with keepAlive seconds

#### /browser-list — Browser List
- id: `cmd_browser_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler browser list`
- description: List active browser sessions

#### /browser-view — Browser View
- id: `cmd_browser_view`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler browser view {SESSIONID}`
- description: View live browser session

#### /browser-view-target — Browser View Target
- id: `cmd_browser_view_target`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler browser view {SESSIONID} --target {TARGET}`
- description: View browser target by selector/url/title

#### /browser-close — Browser Close
- id: `cmd_browser_close`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler browser close {SESSIONID}`
- description: Close browser session

#### /browser-create-lab — Browser Create Lab
- id: `cmd_browser_create_lab`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler browser create --lab`
- description: Create Browser Run session with lab/WebMCP features


### ci_cd/builds

#### /build-cancel — Workers Build Cancel
- id: `cmd_build_cancel`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `300s` retry: `once`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: PUT /accounts/{account_id}/builds/builds/{build_uuid}/cancel`
- description: Cancel build

#### /build-get — Workers Build Get
- id: `cmd_build_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `300s` retry: `twice`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/builds/builds/{build_uuid}`
- description: Get build by UUID

#### /build-logs — Workers Build Logs
- id: `cmd_build_logs`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `300s` retry: `twice`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/builds/builds/{build_uuid}/logs`
- description: Get build logs

#### /builds-latest — Workers Builds Latest
- id: `cmd_builds_latest`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `300s` retry: `twice`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/builds/builds/latest`
- description: Get latest builds

#### /builds-limits — Workers Builds Limits
- id: `cmd_builds_limits`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `300s` retry: `twice`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/builds/account/limits`
- description: Get account limits

#### /builds-list — Workers Builds List
- id: `cmd_builds_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `300s` retry: `twice`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/builds/builds`
- description: Get builds by version


### ci_cd/triggers

#### /build-trigger-delete — Build Trigger Delete
- id: `cmd_trigger_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `300s` retry: `none`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/builds/triggers/{trigger_uuid}`
- description: Delete trigger

#### /build-trigger-create — Build Trigger Create
- id: `cmd_trigger_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `300s` retry: `once`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/builds/triggers`
- description: Create trigger

#### /build-triggers-list — Build Triggers List
- id: `cmd_trigger_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `300s` retry: `twice`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/builds/workers/{external_script_id}/triggers`
- description: List triggers

#### /build-cache-purge — Build Cache Purge
- id: `cmd_trigger_cache_purge`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `300s` retry: `twice`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/builds/triggers/{trigger_uuid}/purge_build_cache`
- description: Purge build cache

#### /build-trigger-run — Build Trigger Run
- id: `cmd_trigger_build`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `300s` retry: `twice`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/builds/triggers/{trigger_uuid}/builds`
- description: Run manual build

#### /build-trigger-update — Build Trigger Update
- id: `cmd_trigger_update`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `300s` retry: `twice`
- task_type: `deploy` route_key: `deploy`
- mapped_command: `API_CALL: PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}`
- description: Update trigger


### cloudflare/healthchecks

#### /cf-healthcheck-delete — Healthcheck Delete
- id: `cmd_cf_healthcheck_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/healthchecks/{id}`
- description: Delete healthcheck

#### /cf-healthcheck-events — Healthcheck Events
- id: `cmd_cf_healthcheck_events`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/healthchecks/events`
- description: Get healthcheck events

#### /cf-healthcheck-get — Healthcheck Get
- id: `cmd_cf_healthcheck_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/healthchecks/{id}`
- description: Get healthcheck details

#### /cf-healthcheck-list — Healthchecks List
- id: `cmd_cf_healthcheck_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/healthchecks`
- description: List healthchecks

#### /cf-healthcheck-preview — Healthcheck Preview
- id: `cmd_cf_healthcheck_preview`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/healthchecks/preview`
- description: Preview healthcheck result

#### /cf-healthcheck-create — Healthcheck Create
- id: `cmd_cf_healthcheck_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: POST /accounts/{account_id}/healthchecks`
- description: Create healthcheck

#### /cf-healthcheck-update — Healthcheck Update
- id: `cmd_cf_healthcheck_update`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: PUT /accounts/{account_id}/healthchecks/{id}`
- description: Update healthcheck


### cloudflare/images

#### /cf-images-delete — Cloudflare Image Delete
- id: `cmd_cf_images_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/images/v1/{image_id}`
- description: Delete image

#### /cf-images-variant-delete — Cloudflare Image Variant Delete
- id: `cmd_cf_images_variant_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/images/v1/variants/{variant_id}`
- description: Delete image variant

#### /cf-images-get — Cloudflare Image Get
- id: `cmd_cf_images_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/images/v1/{image_id}`
- description: Get image details

#### /cf-images-list — Cloudflare Images List
- id: `cmd_cf_images_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/images/v1`
- description: List images

#### /cf-images-stats — Cloudflare Images Stats
- id: `cmd_cf_images_stats`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/images/v1/stats`
- description: Get image usage stats

#### /cf-images-variants-list — Cloudflare Image Variants List
- id: `cmd_cf_images_variants_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/images/v1/variants`
- description: List image variants

#### /cf-images-update — Cloudflare Image Update
- id: `cmd_cf_images_update`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: PATCH /accounts/{account_id}/images/v1/{image_id}`
- description: Update image metadata

#### /cf-images-upload — Cloudflare Image Upload
- id: `cmd_cf_images_upload`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: POST /accounts/{account_id}/images/v1`
- description: Upload image

#### /cf-images-variant-create — Cloudflare Image Variant Create
- id: `cmd_cf_images_variant_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: POST /accounts/{account_id}/images/v1/variants`
- description: Create image variant


### cloudflare/realtime

#### /cf-realtime-session-delete — Realtime Session Delete
- id: `cmd_cf_realtime_session_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/realtime/sessions/{session_id}`
- description: Delete realtime session

#### /cf-realtime-events — Realtime Events
- id: `cmd_cf_realtime_events`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/events`
- description: Get realtime events

#### /cf-realtime-session-get — Realtime Session Get
- id: `cmd_cf_realtime_session_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/sessions/{session_id}`
- description: Get realtime session

#### /cf-realtime-sessions-list — Realtime Sessions List
- id: `cmd_cf_realtime_sessions_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/sessions`
- description: List realtime sessions

#### /cf-realtime-broadcast — Realtime Broadcast
- id: `cmd_cf_realtime_broadcast`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: POST /accounts/{account_id}/realtime/broadcast`
- description: Broadcast realtime message

#### /cf-realtime-session-create — Realtime Session Create
- id: `cmd_cf_realtime_session_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: POST /accounts/{account_id}/realtime/sessions`
- description: Create realtime session


### cms/themes

#### cms-theme-audit — CMS Theme Audit
- id: `cmd_cms_theme_audit`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `cms_edit`
- mapped_command: `scr_cms_theme_audit`
- description: Run D1 audit query for given slugs. Checks monaco drift, hash length, JSON validity.

#### cms-theme-batch — CMS Theme Batch
- id: `cmd_cms_theme_batch`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `cms_edit`
- mapped_command: `wf_cms_theme_batch`
- description: Process next 3 CMS themes from D1 into R2 + D1 production packages. Pass offset number.

#### cms-theme-status — CMS Theme Status
- id: `cmd_cms_theme_status`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `cms_edit`
- mapped_command: `agentsam_memory`
- description: Show current batch progress: completed slugs, next offset, rename log, protocol state.

#### cms-theme-verify — CMS Theme Verify
- id: `cmd_cms_theme_verify`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `cms_edit`
- mapped_command: `scr_cms_theme_curl`
- description: Curl verify public R2 CSS URLs for given slugs. Pass space-separated slugs.


### d1/backup

#### /d1-export — D1 Export
- id: `cmd_d1_export`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `60s` retry: `twice`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 export {NAME} --remote --output {OUTPUT}`
- description: Export D1 database

#### /d1-export-schema — D1 Export Schema
- id: `cmd_d1_export_schema`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `60s` retry: `twice`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 export {NAME} --remote --no-data --output {OUTPUT}`
- description: Export schema only

#### /d1-export-data — D1 Export Data
- id: `cmd_d1_export_data`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `60s` retry: `twice`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 export {NAME} --remote --no-schema --output {OUTPUT}`
- description: Export data only


### d1/database

#### /d1-delete — D1 Delete
- id: `cmd_d1_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `60s` retry: `none`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 delete {NAME}`
- description: Delete D1 database

#### /d1-info — D1 Info
- id: `cmd_d1_info`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `60s` retry: `twice`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 info {NAME}`
- description: Get D1 database info

#### /d1-list — D1 List
- id: `cmd_d1_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `60s` retry: `twice`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 list`
- description: List D1 databases

#### /d1-create — D1 Create
- id: `cmd_d1_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `60s` retry: `twice`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 create {NAME}`
- description: Create a D1 database


### d1/execute

#### /d1-execute-command — D1 Execute Command
- id: `cmd_d1_execute_command`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `60s` retry: `once`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 execute {DATABASE} --remote --command "{SQL}"`
- description: Execute SQL against D1

#### /d1-execute-file — D1 Execute File
- id: `cmd_d1_execute_file`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `60s` retry: `once`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 execute {DATABASE} --remote --file {FILE}`
- description: Execute SQL file against D1


### d1/insights

#### /d1-insights — D1 Insights
- id: `cmd_d1_insights`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `60s` retry: `twice`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 insights {NAME}`
- description: Get D1 query insights


### d1/migrations

#### /d1-migrations-apply — D1 Migrations Apply
- id: `cmd_d1_migrations_apply`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `60s` retry: `once`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 migrations apply {DATABASE} --remote`
- description: Apply D1 migrations

#### /d1-migration-create — D1 Migration Create
- id: `cmd_d1_migrations_create`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `60s` retry: `twice`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 migrations create {DATABASE} "{MESSAGE}"`
- description: Create D1 migration file

#### /d1-migrations-list — D1 Migrations List
- id: `cmd_d1_migrations_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `60s` retry: `twice`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 migrations list {DATABASE} --remote`
- description: List unapplied D1 migrations


### d1/restore

#### /d1-time-travel-restore — D1 Time Travel Restore
- id: `cmd_d1_time_travel_restore`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `60s` retry: `none`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 time-travel restore {DATABASE} --bookmark {BOOKMARK}`
- description: Restore D1 database to bookmark/timestamp

#### /d1-time-travel-info — D1 Time Travel Info
- id: `cmd_d1_time_travel_info`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `60s` retry: `twice`
- task_type: `sql_d1_generation` route_key: `db_query`
- mapped_command: `npx wrangler d1 time-travel info {DATABASE} --timestamp {TIMESTAMP}`
- description: Get time travel bookmark info


### designstudio/asset

#### designstudio:register-asset — Register DesignStudio Asset
- id: `cmd_designstudio_register_asset`
- risk: `medium`
- approval: `0` confirmation: `0`
- timeout: `180s` retry: `twice`
- task_type: `plan` route_key: `cms_edit`
- mapped_command: `designstudio_asset_register`
- description: Register generated SCAD/STL/GLB/sketch/preview artifacts into tracking tables.


### designstudio/blueprint

#### designstudio:blueprint-create — Create DesignStudio Blueprint
- id: `cmd_designstudio_blueprint_create`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `180s` retry: `twice`
- task_type: `plan` route_key: `cms_edit`
- mapped_command: `designstudio_blueprint_create`
- description: Create a structured design blueprint from a rough user idea.


### designstudio/openscad

#### designstudio:openscad-generate — Generate OpenSCAD
- id: `cmd_designstudio_openscad_generate`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `180s` retry: `twice`
- task_type: `plan` route_key: `cms_edit`
- mapped_command: `designstudio_openscad_generate`
- description: Generate OpenSCAD from a structured DesignStudio blueprint.


### designstudio/sketch

#### designstudio:sketch — Create DesignStudio Sketch
- id: `cmd_designstudio_sketch`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `180s` retry: `twice`
- task_type: `plan` route_key: `cms_edit`
- mapped_command: `designstudio_excalidraw_sketch`
- description: Create an Excalidraw concept sketch for a DesignStudio blueprint.


### designstudio/terminal

#### designstudio:freecad — Run FreeCAD Script
- id: `cmd_designstudio_freecad`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `180s` retry: `once`
- task_type: `plan` route_key: `cms_edit`
- mapped_command: `designstudio_freecad_script`
- description: Prepare or run FreeCAD Python automation for advanced CAD workflows.

#### designstudio:convert-glb — Convert to GLB
- id: `cmd_designstudio_convert_glb`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `180s` retry: `twice`
- task_type: `plan` route_key: `cms_edit`
- mapped_command: `designstudio_blender_convert_glb`
- description: Run Blender locally to convert STL or scene data into GLB.

#### designstudio:export-stl — Export STL
- id: `cmd_designstudio_export_stl`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `180s` retry: `twice`
- task_type: `plan` route_key: `cms_edit`
- mapped_command: `designstudio_openscad_export_stl`
- description: Run OpenSCAD locally to export STL from .scad.


### durable_object/errors

#### /do-retryable-errors — Durable Object Retryable Errors
- id: `cmd_do_retryable_errors`
- risk: `high`
- approval: `1` confirmation: `0`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `IMPLEMENTATION_GUIDE: durable_object_retryable_errors`
- description: Guide Agent Sam to handle retryable Durable Object exceptions safely

#### /do-stub-recreation — Durable Object Stub Recreation
- id: `cmd_do_stub_recreation`
- risk: `medium`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `IMPLEMENTATION_GUIDE: durable_object_stub_recreation`
- description: Guide Agent Sam to recreate DurableObjectStub after thrown exceptions


### durable_object/fetch

#### /do-fetch-invocation — Durable Object Fetch Invocation
- id: `cmd_do_fetch_invocation`
- risk: `medium`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `IMPLEMENTATION_GUIDE: durable_object_fetch_invocation`
- description: Guide Agent Sam to invoke a Durable Object fetch handler for HTTP/WebSocket style flows


### durable_object/rpc

#### /do-rpc-invocation — Durable Object RPC Invocation
- id: `cmd_do_rpc_invocation`
- risk: `medium`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `IMPLEMENTATION_GUIDE: durable_object_rpc_invocation`
- description: Guide Agent Sam to invoke public RPC methods on Durable Object stubs


### durable_object/storage

#### /do-clear-storage — Durable Object Clear Storage
- id: `cmd_do_clear_storage`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `code` route_key: `deploy`
- mapped_command: `IMPLEMENTATION_GUIDE: durable_object_clear_storage`
- description: Guide Agent Sam to clear Durable Object storage safely

#### /do-sql-indexes — Durable Object SQL Indexes
- id: `cmd_do_sql_indexes`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `IMPLEMENTATION_GUIDE: durable_object_sql_indexes`
- description: Guide Agent Sam to create indexes for queried SQLite-backed Durable Object tables

#### /do-kv-storage — Durable Object KV Storage
- id: `cmd_do_kv_storage`
- risk: `medium`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `IMPLEMENTATION_GUIDE: durable_object_kv_storage`
- description: Guide Agent Sam to use Durable Object storage key-value APIs

#### /do-sqlite-storage — Durable Object SQLite Storage
- id: `cmd_do_sqlite_storage`
- risk: `medium`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `IMPLEMENTATION_GUIDE: durable_object_sqlite_storage`
- description: Guide Agent Sam to use SQLite-backed Durable Object storage


### durable_object/websocket

#### /do-websocket-hibernation — Durable Object WebSocket Hibernation
- id: `cmd_do_websocket_hibernation`
- risk: `medium`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `IMPLEMENTATION_GUIDE: durable_object_websocket_hibernation`
- description: Guide Agent Sam to build hibernatable WebSocket Durable Objects

#### /do-websocket-standard — Durable Object Standard WebSocket
- id: `cmd_do_websocket_standard`
- risk: `medium`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `IMPLEMENTATION_GUIDE: durable_object_standard_websocket`
- description: Guide Agent Sam to build standard WebSocket Durable Object handlers


### hyperdrive/config

#### /hyperdrive-delete — Hyperdrive Delete
- id: `cmd_hyperdrive_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `code` route_key: `db_query`
- mapped_command: `npx wrangler hyperdrive delete {ID}`
- description: Delete Hyperdrive config

#### /hyperdrive-create — Hyperdrive Create
- id: `cmd_hyperdrive_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `db_query`
- mapped_command: `npx wrangler hyperdrive create {NAME}`
- description: Create Hyperdrive config

#### /hyperdrive-update — Hyperdrive Update
- id: `cmd_hyperdrive_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `db_query`
- mapped_command: `npx wrangler hyperdrive update {ID}`
- description: Update Hyperdrive config

#### /hyperdrive-get — Hyperdrive Get
- id: `cmd_hyperdrive_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `db_query`
- mapped_command: `npx wrangler hyperdrive get {ID}`
- description: Get Hyperdrive config

#### /hyperdrive-list — Hyperdrive List
- id: `cmd_hyperdrive_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `db_query`
- mapped_command: `npx wrangler hyperdrive list`
- description: List Hyperdrive configs


### kv/bulk

#### /kv-bulk-delete — KV Bulk Delete
- id: `cmd_kv_bulk_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `code` route_key: `r2_ops`
- mapped_command: `npx wrangler kv bulk delete {FILENAME} --binding {BINDING} --remote`
- description: Bulk delete KV keys

#### /kv-bulk-put — KV Bulk Put
- id: `cmd_kv_bulk_put`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `r2_ops`
- mapped_command: `npx wrangler kv bulk put {FILENAME} --binding {BINDING} --remote`
- description: Bulk upload KV keys

#### /kv-bulk-get — KV Bulk Get
- id: `cmd_kv_bulk_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `r2_ops`
- mapped_command: `npx wrangler kv bulk get {FILENAME} --binding {BINDING} --remote`
- description: Bulk get KV keys


### kv/key

#### /kv-key-delete — KV Key Delete
- id: `cmd_kv_key_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `r2_ops`
- mapped_command: `npx wrangler kv key delete {KEY} --binding {BINDING} --remote`
- description: Delete KV key

#### /kv-key-get — KV Key Get
- id: `cmd_kv_key_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `r2_ops`
- mapped_command: `npx wrangler kv key get {KEY} --binding {BINDING} --remote --text`
- description: Read KV key

#### /kv-key-list — KV Key List
- id: `cmd_kv_key_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `r2_ops`
- mapped_command: `npx wrangler kv key list --binding {BINDING} --remote`
- description: List KV keys

#### /kv-key-put — KV Key Put
- id: `cmd_kv_key_put`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `r2_ops`
- mapped_command: `npx wrangler kv key put {KEY} {VALUE} --binding {BINDING} --remote`
- description: Write KV key


### kv/namespace

#### /kv-namespace-delete — KV Namespace Delete
- id: `cmd_kv_namespace_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `code` route_key: `r2_ops`
- mapped_command: `npx wrangler kv namespace delete {NAMESPACE}`
- description: Delete KV namespace

#### /kv-namespace-rename — KV Namespace Rename
- id: `cmd_kv_namespace_rename`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `r2_ops`
- mapped_command: `npx wrangler kv namespace rename {OLD_NAME} --new-name {NEW_NAME}`
- description: Rename KV namespace

#### /kv-namespace-list — KV Namespace List
- id: `cmd_kv_namespace_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `r2_ops`
- mapped_command: `npx wrangler kv namespace list`
- description: List KV namespaces

#### /kv-namespace-create — KV Namespace Create
- id: `cmd_kv_namespace_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `r2_ops`
- mapped_command: `npx wrangler kv namespace create {NAMESPACE}`
- description: Create KV namespace


### meauxcad/analytics

#### 3d:trace — Log MeauxCAD Trace
- id: `cmd_3d_trace`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `cms_edit`
- mapped_command: `meauxcad_run_trace_log`
- description: Log tokens, cost, run status, tool output, and model generation metrics.


### meauxcad/cad-code

#### 3d:openscad — Generate OpenSCAD
- id: `cmd_3d_openscad`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `cms_edit`
- mapped_command: `meauxcad_openscad_generate`
- description: Generate parametric OpenSCAD code from a structured design brief.


### meauxcad/concept

#### 3d:sketch — Create 3D Design Sketch
- id: `cmd_3d_sketch`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `cms_edit`
- mapped_command: `meauxcad_excalidraw_sketch_create`
- description: Create an Excalidraw concept sketch from a prompt or design brief.


### meauxcad/export

#### 3d:convert-glb — Convert STL to GLB
- id: `cmd_3d_convert_glb`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `cms_edit`
- mapped_command: `meauxcad_blender_stl_to_glb`
- description: Convert STL into GLB using Blender headless automation.

#### 3d:export-stl — Export STL
- id: `cmd_3d_export_stl`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `cms_edit`
- mapped_command: `meauxcad_openscad_export_stl`
- description: Compile OpenSCAD to STL using the local OpenSCAD binary.


### meauxcad/generation

#### 3d:create — Create 3D Model
- id: `cmd_3d_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `cms_edit`
- mapped_command: `meauxcad_design_brief_create`
- description: Start a full MeauxCAD idea-to-model workflow.


### pages/config

#### /pages-download-config — Pages Download Config
- id: `cmd_pages_download_config`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages download config {PROJECTNAME}`
- description: Download Pages config


### pages/deploy

#### /pages-deploy — Pages Deploy
- id: `cmd_pages_deploy`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages deploy {DIRECTORY} --project-name {PROJECT_NAME}`
- description: Deploy Pages directory


### pages/deployment

#### /pages-deployment-delete — Pages Deployment Delete
- id: `cmd_pages_deployment_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages deployment delete {DEPLOYMENT_ID} --project-name {PROJECT_NAME}`
- description: Delete Pages deployment

#### /pages-deployment-list — Pages Deployment List
- id: `cmd_pages_deployment_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages deployment list --project-name {PROJECT_NAME}`
- description: List Pages deployments

#### /pages-deployment-tail — Pages Deployment Tail
- id: `cmd_pages_deployment_tail`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages deployment tail {DEPLOYMENT} --project-name {PROJECT_NAME}`
- description: Tail Pages deployment logs


### pages/dev

#### /pages-dev — Pages Dev
- id: `cmd_pages_dev`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages dev {DIRECTORY}`
- description: Develop Pages app locally


### pages/functions

#### /pages-functions-build — Pages Functions Build
- id: `cmd_pages_functions_build`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages functions build {DIRECTORY}`
- description: Build Pages Functions


### pages/project

#### /pages-project-delete — Pages Project Delete
- id: `cmd_pages_project_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages project delete {PROJECT_NAME}`
- description: Delete Pages project

#### /pages-project-list — Pages Project List
- id: `cmd_pages_project_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages project list`
- description: List Pages projects

#### /pages-project-create — Pages Project Create
- id: `cmd_pages_project_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages project create {PROJECT_NAME}`
- description: Create Pages project


### pages/secrets

#### /pages-secret-bulk — Pages Secret Bulk
- id: `cmd_pages_secret_bulk`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages secret bulk {FILE} --project-name {PROJECT_NAME}`
- description: Bulk upload Pages secrets

#### /pages-secret-delete — Pages Secret Delete
- id: `cmd_pages_secret_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages secret delete {KEY} --project-name {PROJECT_NAME}`
- description: Delete Pages secret

#### /pages-secret-put — Pages Secret Put
- id: `cmd_pages_secret_put`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages secret put {KEY} --project-name {PROJECT_NAME}`
- description: Create/update Pages secret

#### /pages-secret-list — Pages Secret List
- id: `cmd_pages_secret_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler pages secret list --project-name {PROJECT_NAME}`
- description: List Pages secrets


### queues/consumer

#### /queues-consumer-add — Queues Consumer Add
- id: `cmd_queues_consumer_add`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues consumer add {QUEUE_NAME} {SCRIPT_NAME}`
- description: Add Queue Worker consumer

#### /queues-consumer-remove — Queues Consumer Remove
- id: `cmd_queues_consumer_remove`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues consumer remove {QUEUE_NAME} {SCRIPT_NAME}`
- description: Remove Queue Worker consumer


### queues/consumer-http

#### /queues-consumer-http-add — Queues HTTP Consumer Add
- id: `cmd_queues_consumer_http_add`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues consumer http add {QUEUE_NAME}`
- description: Add HTTP Pull consumer

#### /queues-consumer-http-remove — Queues HTTP Consumer Remove
- id: `cmd_queues_consumer_http_remove`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues consumer http remove {QUEUE_NAME}`
- description: Remove HTTP Pull consumer


### queues/consumer-worker

#### /queues-consumer-worker-add — Queues Worker Consumer Add
- id: `cmd_queues_consumer_worker_add`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues consumer worker add {QUEUE_NAME} {SCRIPT_NAME}`
- description: Add Worker consumer

#### /queues-consumer-worker-remove — Queues Worker Consumer Remove
- id: `cmd_queues_consumer_worker_remove`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues consumer worker remove {QUEUE_NAME} {SCRIPT_NAME}`
- description: Remove Worker consumer


### queues/delivery

#### /queues-purge — Queues Purge
- id: `cmd_queues_purge`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues purge {NAME}`
- description: Purge queue messages

#### /queues-pause-delivery — Queues Pause Delivery
- id: `cmd_queues_pause_delivery`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues pause-delivery {NAME}`
- description: Pause queue delivery

#### /queues-resume-delivery — Queues Resume Delivery
- id: `cmd_queues_resume_delivery`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues resume-delivery {NAME}`
- description: Resume queue delivery


### queues/queue

#### /queues-delete — Queues Delete
- id: `cmd_queues_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues delete {NAME}`
- description: Delete queue

#### /queues-update — Queues Update
- id: `cmd_queues_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues update {NAME}`
- description: Update queue

#### /queues-info — Queues Info
- id: `cmd_queues_info`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues info {NAME}`
- description: Get queue info

#### /queues-list — Queues List
- id: `cmd_queues_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues list`
- description: List queues

#### /queues-create — Queues Create
- id: `cmd_queues_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues create {NAME}`
- description: Create queue


### queues/subscription

#### /queues-subscription-create — Queues Subscription Create
- id: `cmd_queues_subscription_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues subscription create {QUEUE} --source {SOURCE} --events {EVENTS}`
- description: Create event subscription

#### /queues-subscription-delete — Queues Subscription Delete
- id: `cmd_queues_subscription_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues subscription delete {QUEUE} --id {ID}`
- description: Delete event subscription

#### /queues-subscription-update — Queues Subscription Update
- id: `cmd_queues_subscription_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues subscription update {QUEUE} --id {ID}`
- description: Update event subscription

#### /queues-subscription-get — Queues Subscription Get
- id: `cmd_queues_subscription_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues subscription get {QUEUE} --id {ID}`
- description: Get event subscription

#### /queues-subscription-list — Queues Subscription List
- id: `cmd_queues_subscription_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `code` route_key: `deploy`
- mapped_command: `npx wrangler queues subscription list {QUEUE}`
- description: List event subscriptions


### r2/bucket

#### /r2-bucket-delete — R2 Bucket Delete
- id: `cmd_r2_bucket_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket delete {BUCKET}`
- description: Delete R2 bucket

#### /r2-bucket-info — R2 Bucket Info
- id: `cmd_r2_bucket_info`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket info {BUCKET}`
- description: Get R2 bucket info

#### /r2-bucket-list — R2 Bucket List
- id: `cmd_r2_bucket_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket list`
- description: List R2 buckets

#### /r2-bucket-create — R2 Bucket Create
- id: `cmd_r2_bucket_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket create {NAME}`
- description: Create R2 bucket


### r2/catalog

#### /r2-catalog-disable — R2 Catalog Disable
- id: `cmd_r2_catalog_disable`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket catalog disable {BUCKET}`
- description: Disable R2 data catalog

#### /r2-catalog-get — R2 Catalog Get
- id: `cmd_r2_catalog_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket catalog get {BUCKET}`
- description: Get R2 catalog status

#### /r2-catalog-compaction-disable — R2 Catalog Compaction Disable
- id: `cmd_r2_catalog_compaction_disable`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket catalog compaction disable {BUCKET} {NAMESPACE} {TABLE}`
- description: Disable catalog/table compaction

#### /r2-catalog-compaction-enable — R2 Catalog Compaction Enable
- id: `cmd_r2_catalog_compaction_enable`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket catalog compaction enable {BUCKET} {NAMESPACE} {TABLE}`
- description: Enable catalog/table compaction

#### /r2-catalog-enable — R2 Catalog Enable
- id: `cmd_r2_catalog_enable`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket catalog enable {BUCKET}`
- description: Enable R2 data catalog

#### /r2-catalog-snapshot-disable — R2 Snapshot Expiration Disable
- id: `cmd_r2_catalog_snapshot_disable`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket catalog snapshot-expiration disable {BUCKET} {NAMESPACE} {TABLE}`
- description: Disable snapshot expiration

#### /r2-catalog-snapshot-enable — R2 Snapshot Expiration Enable
- id: `cmd_r2_catalog_snapshot_enable`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket catalog snapshot-expiration enable {BUCKET} {NAMESPACE} {TABLE}`
- description: Enable snapshot expiration


### r2/cors

#### /r2-cors-delete — R2 CORS Delete
- id: `cmd_r2_cors_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket cors delete {BUCKET}`
- description: Delete CORS config

#### /r2-cors-list — R2 CORS List
- id: `cmd_r2_cors_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket cors list {BUCKET}`
- description: List CORS rules

#### /r2-cors-set — R2 CORS Set
- id: `cmd_r2_cors_set`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket cors set {BUCKET} --file {FILE}`
- description: Set CORS config from file


### r2/domain

#### /r2-domain-add — R2 Domain Add
- id: `cmd_r2_domain_add`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket domain add {BUCKET} --domain {DOMAIN} --zone-id {ZONE_ID}`
- description: Connect custom domain

#### /r2-domain-remove — R2 Domain Remove
- id: `cmd_r2_domain_remove`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket domain remove {BUCKET} --domain {DOMAIN}`
- description: Remove custom domain

#### /r2-domain-get — R2 Domain Get
- id: `cmd_r2_domain_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket domain get {BUCKET} --domain {DOMAIN}`
- description: Get custom domain info

#### /r2-domain-list — R2 Domain List
- id: `cmd_r2_domain_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket domain list {BUCKET}`
- description: List custom domains

#### /r2-domain-update — R2 Domain Update
- id: `cmd_r2_domain_update`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket domain update {BUCKET} --domain {DOMAIN}`
- description: Update custom domain settings


### r2/lifecycle

#### /r2-lifecycle-remove — R2 Lifecycle Remove
- id: `cmd_r2_lifecycle_remove`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket lifecycle remove {BUCKET} --name {NAME}`
- description: Remove lifecycle rule

#### /r2-lifecycle-set — R2 Lifecycle Set
- id: `cmd_r2_lifecycle_set`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket lifecycle set {BUCKET} --file {FILE}`
- description: Set lifecycle config from file

#### /r2-lifecycle-list — R2 Lifecycle List
- id: `cmd_r2_lifecycle_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket lifecycle list {BUCKET}`
- description: List lifecycle rules

#### /r2-lifecycle-add — R2 Lifecycle Add
- id: `cmd_r2_lifecycle_add`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket lifecycle add {BUCKET} {NAME} {PREFIX}`
- description: Add lifecycle rule


### r2/lock

#### /r2-lock-add — R2 Lock Add
- id: `cmd_r2_lock_add`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket lock add {BUCKET} {NAME} {PREFIX}`
- description: Add bucket lock rule

#### /r2-lock-remove — R2 Lock Remove
- id: `cmd_r2_lock_remove`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket lock remove {BUCKET} --name {NAME}`
- description: Remove bucket lock rule

#### /r2-lock-set — R2 Lock Set
- id: `cmd_r2_lock_set`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket lock set {BUCKET} --file {FILE}`
- description: Set bucket lock config from file

#### /r2-lock-list — R2 Lock List
- id: `cmd_r2_lock_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket lock list {BUCKET}`
- description: List bucket lock rules


### r2/notification

#### /r2-notification-delete — R2 Notification Delete
- id: `cmd_r2_notification_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket notification delete {BUCKET} --queue {QUEUE}`
- description: Delete R2 event notification

#### /r2-notification-list — R2 Notification List
- id: `cmd_r2_notification_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket notification list {BUCKET}`
- description: List R2 event notifications

#### /r2-notification-create — R2 Notification Create
- id: `cmd_r2_notification_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket notification create {BUCKET} --event-types {EVENT_TYPES} --queue {QUEUE}`
- description: Create R2 event notification


### r2/object

#### /r2-object-get — R2 Object Get
- id: `cmd_r2_object_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 object get {OBJECTPATH}`
- description: Fetch object from R2


### r2/public-access

#### /r2-dev-url-enable — R2 Dev URL Enable
- id: `cmd_r2_dev_url_enable`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket dev-url enable {BUCKET}`
- description: Enable r2.dev public URL

#### /r2-dev-url-get — R2 Dev URL Get
- id: `cmd_r2_dev_url_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket dev-url get {BUCKET}`
- description: Get r2.dev status

#### /r2-dev-url-disable — R2 Dev URL Disable
- id: `cmd_r2_dev_url_disable`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket dev-url disable {BUCKET}`
- description: Disable r2.dev public URL


### r2/sippy

#### /r2-sippy-enable — R2 Sippy Enable
- id: `cmd_r2_sippy_enable`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket sippy enable {NAME}`
- description: Enable Sippy migration

#### /r2-sippy-get — R2 Sippy Get
- id: `cmd_r2_sippy_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket sippy get {NAME}`
- description: Get Sippy status

#### /r2-sippy-disable — R2 Sippy Disable
- id: `cmd_r2_sippy_disable`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `r2_ops`
- mapped_command: `npx wrangler r2 bucket sippy disable {NAME}`
- description: Disable Sippy


### realtime_kit/livestream_analytics

#### /rt-livestream-analytics-daywise — Realtime Kit Analytics Daywise
- id: `cmd_rt_livestream_analytics_daywise`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/analytics/daywise`
- description: Fetch day-wise session and recording analytics

#### /rt-livestream-analytics-overall — Realtime Kit Livestream Analytics Overall
- id: `cmd_rt_livestream_analytics_overall`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/analytics/livestreams/overall`
- description: Fetch complete analytics data for livestreams


### realtime_kit/livestreams

#### /rt-meeting-livestream-start — Realtime Kit Meeting Livestream Start
- id: `cmd_rt_meeting_livestream_start`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/livestreams`
- description: Start livestreaming a meeting

#### /rt-meeting-livestream-stop — Realtime Kit Meeting Livestream Stop
- id: `cmd_rt_meeting_livestream_stop`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/active-livestream/stop`
- description: Stop livestreaming a meeting

#### /rt-livestream-active-session-get — Realtime Kit Active Livestream Session Get
- id: `cmd_rt_livestream_active_session_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/livestreams/{livestream_id}/active-livestream-session`
- description: Fetch active livestream session details

#### /rt-livestream-get — Realtime Kit Livestream Get
- id: `cmd_rt_livestream_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/livestreams/{livestream_id}`
- description: Fetch livestream details using livestream ID

#### /rt-livestream-session-get — Realtime Kit Livestream Session Get
- id: `cmd_rt_livestream_session_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/livestreams/sessions/{livestream_session_id}`
- description: Fetch livestream session details using session ID

#### /rt-livestreams-list — Realtime Kit Livestreams List
- id: `cmd_rt_livestreams_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/livestreams`
- description: Fetch all livestreams

#### /rt-meeting-active-livestream-get — Realtime Kit Active Livestream Get
- id: `cmd_rt_meeting_active_livestream_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/active-livestream`
- description: Fetch active livestreams for a meeting

#### /rt-livestream-create — Realtime Kit Livestream Create
- id: `cmd_rt_livestream_create_independent`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/livestreams`
- description: Create an independent livestream


### realtime_kit/meetings

#### /rt-meeting-replace — Realtime Kit Meeting Replace
- id: `cmd_rt_meeting_replace`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: PUT /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}`
- description: Replace a meeting

#### /rt-meeting-get — Realtime Kit Meeting Get
- id: `cmd_rt_meeting_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}`
- description: Fetch a meeting for an App

#### /rt-meetings-list — Realtime Kit Meetings List
- id: `cmd_rt_meetings_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/meetings`
- description: Fetch all meetings for an App

#### /rt-meeting-create — Realtime Kit Meeting Create
- id: `cmd_rt_meeting_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/meetings`
- description: Create a meeting

#### /rt-meeting-update — Realtime Kit Meeting Update
- id: `cmd_rt_meeting_update`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: PATCH /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}`
- description: Update a meeting


### realtime_kit/participants

#### /rt-meeting-participant-delete — Realtime Kit Meeting Participant Delete
- id: `cmd_rt_meeting_participant_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants/{participant_id}`
- description: Delete participant

#### /rt-meeting-participant-get — Realtime Kit Meeting Participant Get
- id: `cmd_rt_meeting_participant_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants/{participant_id}`
- description: Fetch participant detail

#### /rt-meeting-participants-list — Realtime Kit Meeting Participants List
- id: `cmd_rt_meeting_participants_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants`
- description: Fetch all participants of a meeting

#### /rt-meeting-participant-add — Realtime Kit Meeting Participant Add
- id: `cmd_rt_meeting_participant_add`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants`
- description: Add a participant

#### /rt-meeting-participant-edit — Realtime Kit Meeting Participant Edit
- id: `cmd_rt_meeting_participant_edit`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: PATCH /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants/{participant_id}`
- description: Edit participant detail

#### /rt-meeting-participant-token-refresh — Realtime Kit Participant Token Refresh
- id: `cmd_rt_meeting_participant_token_refresh`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants/{participant_id}/token`
- description: Refresh participant authentication token


### realtime_kit/webhooks

#### /rt-webhook-delete — Realtime Kit Webhook Delete
- id: `cmd_rt_webhook_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/realtime/kit/{app_id}/webhooks/{webhook_id}`
- description: Delete a webhook

#### /rt-webhook-create — Realtime Kit Webhook Create
- id: `cmd_rt_webhook_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/webhooks`
- description: Add a webhook

#### /rt-webhook-replace — Realtime Kit Webhook Replace
- id: `cmd_rt_webhook_replace`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: PUT /accounts/{account_id}/realtime/kit/{app_id}/webhooks/{webhook_id}`
- description: Replace a webhook

#### /rt-webhook-get — Realtime Kit Webhook Get
- id: `cmd_rt_webhook_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/webhooks/{webhook_id}`
- description: Fetch webhook details

#### /rt-webhooks-list — Realtime Kit Webhooks List
- id: `cmd_rt_webhooks_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/webhooks`
- description: Fetch all webhook details

#### /rt-webhook-edit — Realtime Kit Webhook Edit
- id: `cmd_rt_webhook_edit`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: PATCH /accounts/{account_id}/realtime/kit/{app_id}/webhooks/{webhook_id}`
- description: Edit a webhook


### resource_sharing/recipients

#### /share-recipient-delete — Share Recipient Delete
- id: `cmd_share_recipient_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/shares/{share_id}/recipients/{recipient_id}`
- description: Delete a share recipient

#### /share-recipient-create — Share Recipient Create
- id: `cmd_share_recipient_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: POST /accounts/{account_id}/shares/{share_id}/recipients`
- description: Create a new share recipient

#### /share-recipient-get — Share Recipient Get
- id: `cmd_share_recipient_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/shares/{share_id}/recipients/{recipient_id}`
- description: Get share recipient by ID

#### /share-recipients-list — Share Recipients List
- id: `cmd_share_recipients_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/shares/{share_id}/recipients`
- description: List share recipients by share ID


### resource_sharing/resources

#### /share-resource-delete — Share Resource Delete
- id: `cmd_share_resource_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/shares/{share_id}/resources/{resource_id}`
- description: Delete a share resource

#### /share-resource-create — Share Resource Create
- id: `cmd_share_resource_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: POST /accounts/{account_id}/shares/{share_id}/resources`
- description: Create a new share resource

#### /share-resource-update — Share Resource Update
- id: `cmd_share_resource_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: PUT /accounts/{account_id}/shares/{share_id}/resources/{resource_id}`
- description: Update a share resource

#### /share-resource-get — Share Resource Get
- id: `cmd_share_resource_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/shares/{share_id}/resources/{resource_id}`
- description: Get share resource by ID

#### /share-resources-list — Share Resources List
- id: `cmd_share_resources_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/shares/{share_id}/resources`
- description: List share resources by share ID


### resource_sharing/shares

#### /share-delete — Resource Share Delete
- id: `cmd_share_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/shares/{share_id}`
- description: Delete a share

#### /share-create — Resource Share Create
- id: `cmd_share_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: POST /accounts/{account_id}/shares`
- description: Create a new share

#### /share-update — Resource Share Update
- id: `cmd_share_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: PUT /accounts/{account_id}/shares/{share_id}`
- description: Update a share

#### /share-get — Resource Share Get
- id: `cmd_share_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/shares/{share_id}`
- description: Get account share by ID

#### /share-list — Resource Shares List
- id: `cmd_share_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `API_CALL: GET /accounts/{account_id}/shares`
- description: List account shares


### security/securitytxt

#### /securitytxt-delete — Security TXT Delete
- id: `cmd_securitytxt_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /zones/{zone_id}/security-center/securitytxt`
- description: Delete security.txt

#### /securitytxt-get — Security TXT Get
- id: `cmd_securitytxt_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /zones/{zone_id}/security-center/securitytxt`
- description: Retrieve security.txt

#### /securitytxt-update — Security TXT Update
- id: `cmd_securitytxt_update`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PUT /zones/{zone_id}/security-center/securitytxt`
- description: Update security.txt


### security/token_validation_config

#### /token-config-credentials-update — Token Validation Credentials Update
- id: `cmd_token_config_credentials_update`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PUT /zones/{zone_id}/token_validation/config/{config_id}/credentials`
- description: Update token configuration credentials

#### /token-config-delete — Token Validation Config Delete
- id: `cmd_token_config_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /zones/{zone_id}/token_validation/config/{config_id}`
- description: Delete token validation configuration

#### /token-config-create — Token Validation Config Create
- id: `cmd_token_config_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /zones/{zone_id}/token_validation/config`
- description: Create token validation configuration

#### /token-config-edit — Token Validation Config Edit
- id: `cmd_token_config_edit`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PATCH /zones/{zone_id}/token_validation/config/{config_id}`
- description: Edit token validation configuration

#### /token-config-get — Token Validation Config Get
- id: `cmd_token_config_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /zones/{zone_id}/token_validation/config/{config_id}`
- description: Get token validation configuration

#### /token-config-list — Token Validation Config List
- id: `cmd_token_config_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /zones/{zone_id}/token_validation/config`
- description: List token validation configurations


### security/token_validation_rules

#### /token-rule-delete — Token Validation Rule Delete
- id: `cmd_token_rule_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /zones/{zone_id}/token_validation/rules/{rule_id}`
- description: Delete token validation rule

#### /token-rule-create — Token Validation Rule Create
- id: `cmd_token_rule_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /zones/{zone_id}/token_validation/rules`
- description: Create token validation rule

#### /token-rule-edit — Token Validation Rule Edit
- id: `cmd_token_rule_edit`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PATCH /zones/{zone_id}/token_validation/rules/{rule_id}`
- description: Edit token validation rule

#### /token-rules-bulk-create — Token Validation Rules Bulk Create
- id: `cmd_token_rules_bulk_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /zones/{zone_id}/token_validation/rules/bulk`
- description: Bulk create token validation rules

#### /token-rules-bulk-edit — Token Validation Rules Bulk Edit
- id: `cmd_token_rules_bulk_edit`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PATCH /zones/{zone_id}/token_validation/rules/bulk`
- description: Bulk edit token validation rules

#### /token-rule-get — Token Validation Rule Get
- id: `cmd_token_rule_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /zones/{zone_id}/token_validation/rules/{rule_id}`
- description: Get token validation rule

#### /token-rules-list — Token Validation Rules List
- id: `cmd_token_rules_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /zones/{zone_id}/token_validation/rules`
- description: List token validation rules


### security/url_scanner

#### /url-scan-dom — URL Scan DOM
- id: `cmd_urlscanner_dom_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/urlscanner/v2/dom/{scan_id}`
- description: Get scanned DOM

#### /url-scan-get — URL Scan Get
- id: `cmd_urlscanner_scan_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/urlscanner/v2/result/{scan_id}`
- description: Get URL scan result

#### /url-scan-har — URL Scan HAR
- id: `cmd_urlscanner_har_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/urlscanner/v2/har/{scan_id}`
- description: Get HAR file

#### /url-scan-response — URL Scan Raw Response
- id: `cmd_urlscanner_response_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/urlscanner/v2/responses/{response_id}`
- description: Get raw response

#### /url-scan-screenshot — URL Scan Screenshot
- id: `cmd_urlscanner_screenshot`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/urlscanner/v2/screenshots/{scan_id}.png`
- description: Get screenshot

#### /url-scan-search — URL Scan Search
- id: `cmd_urlscanner_scan_search`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/urlscanner/v2/search`
- description: Search URL scans

#### /url-scan-bulk — URL Scan Bulk
- id: `cmd_urlscanner_scan_bulk`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/urlscanner/v2/bulk`
- description: Bulk create URL scans

#### /url-scan-create — URL Scan Create
- id: `cmd_urlscanner_scan_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/urlscanner/v2/scan`
- description: Create URL scan


### security/vuln_scanner

#### /vuln-scan-create — Vulnerability Scan Create
- id: `cmd_vuln_scan_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/vuln_scanner/scans`
- description: Create vulnerability scan

#### /vuln-scan-get — Vulnerability Scan Get
- id: `cmd_vuln_scan_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/vuln_scanner/scans/{scan_id}`
- description: Get vulnerability scan

#### /vuln-scans-list — Vulnerability Scans List
- id: `cmd_vuln_scans_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/vuln_scanner/scans`
- description: List vulnerability scans


### security/vuln_scanner_creds

#### /vuln-creds-delete — Credential Set Delete
- id: `cmd_vuln_creds_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/vuln_scanner/credential_sets/{credential_set_id}`
- description: Delete credential set

#### /vuln-creds-create — Credential Set Create
- id: `cmd_vuln_creds_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/vuln_scanner/credential_sets`
- description: Create credential set

#### /vuln-creds-list — Credential Sets List
- id: `cmd_vuln_creds_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/vuln_scanner/credential_sets`
- description: List credential sets


### security/vuln_scanner_env

#### /vuln-env-delete — Target Environment Delete
- id: `cmd_vuln_env_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/vuln_scanner/target_environments/{target_environment_id}`
- description: Delete environment

#### /vuln-env-create — Target Environment Create
- id: `cmd_vuln_env_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `30s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/vuln_scanner/target_environments`
- description: Create environment

#### /vuln-env-get — Target Environment Get
- id: `cmd_vuln_env_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/vuln_scanner/target_environments/{target_environment_id}`
- description: Get environment

#### /vuln-env-list — Target Environments List
- id: `cmd_vuln_env_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/vuln_scanner/target_environments`
- description: List environments

#### /vuln-env-update — Target Environment Update
- id: `cmd_vuln_env_update`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `30s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PUT /accounts/{account_id}/vuln_scanner/target_environments/{target_environment_id}`
- description: Update environment


### ssl_tls/keyless_certificates

#### /keyless-cert-create — Keyless Certificate Create
- id: `cmd_keyless_cert_create`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /zones/{zone_id}/keyless_certificates`
- description: Create Keyless SSL configuration

#### /keyless-cert-delete — Keyless Certificate Delete
- id: `cmd_keyless_cert_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /zones/{zone_id}/keyless_certificates/{keyless_certificate_id}`
- description: Delete Keyless SSL configuration

#### /keyless-cert-edit — Keyless Certificate Edit
- id: `cmd_keyless_cert_edit`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PATCH /zones/{zone_id}/keyless_certificates/{keyless_certificate_id}`
- description: Edit Keyless SSL configuration

#### /keyless-cert-get — Keyless Certificate Get
- id: `cmd_keyless_cert_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /zones/{zone_id}/keyless_certificates/{keyless_certificate_id}`
- description: Get Keyless SSL configuration

#### /keyless-certs-list — Keyless Certificates List
- id: `cmd_keyless_certs_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /zones/{zone_id}/keyless_certificates`
- description: List Keyless SSL configurations


### system/auth

#### /wrangler-auth-token — Wrangler Auth Token
- id: `cmd_auth_token`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler auth token --json`
- description: Retrieve current auth token

#### /wrangler-whoami — Wrangler Whoami
- id: `cmd_whoami`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler whoami`
- description: Show current Wrangler user

#### /wrangler-login — Wrangler Login
- id: `cmd_login`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler login`
- description: Authorize Wrangler

#### /wrangler-logout — Wrangler Logout
- id: `cmd_logout`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler logout`
- description: Remove Wrangler auth


### system/docs

#### /wrangler-docs — Wrangler Docs
- id: `cmd_docs`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler docs {SEARCH}`
- description: Open/search Wrangler docs


### system/shell

#### /wrangler-complete — Wrangler Complete
- id: `cmd_complete`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler complete {SHELL}`
- description: Generate shell completions


### system/telemetry

#### /telemetry-disable — Telemetry Disable
- id: `cmd_telemetry_disable`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler telemetry disable`
- description: Disable Wrangler telemetry

#### /telemetry-enable — Telemetry Enable
- id: `cmd_telemetry_enable`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler telemetry enable`
- description: Enable Wrangler telemetry

#### /telemetry-status — Telemetry Status
- id: `cmd_telemetry_status`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `npx wrangler telemetry status`
- description: Check Wrangler telemetry status


### tunnel/core

#### /tunnel-delete — Tunnel Delete
- id: `cmd_tunnel_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler tunnel delete {TUNNEL}`
- description: Delete Cloudflare Tunnel

#### /tunnel-info — Tunnel Info
- id: `cmd_tunnel_info`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler tunnel info {TUNNEL}`
- description: Get tunnel info

#### /tunnel-list — Tunnel List
- id: `cmd_tunnel_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler tunnel list`
- description: List tunnels

#### /tunnel-create — Tunnel Create
- id: `cmd_tunnel_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler tunnel create {NAME}`
- description: Create Cloudflare Tunnel


### tunnel/runtime

#### /tunnel-quick-start — Tunnel Quick Start
- id: `cmd_tunnel_quick_start`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler tunnel quick-start {URL}`
- description: Start temporary quick tunnel

#### /tunnel-run — Tunnel Run
- id: `cmd_tunnel_run`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler tunnel run {TUNNEL}`
- description: Run tunnel


### vpc/service

#### /vpc-service-delete — VPC Service Delete
- id: `cmd_vpc_service_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `npx wrangler vpc service delete {SERVICE_ID}`
- description: Delete VPC service

#### /vpc-service-create — VPC Service Create
- id: `cmd_vpc_service_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `npx wrangler vpc service create {NAME} --type {TYPE} --tunnel-id {TUNNEL_ID}`
- description: Create VPC service

#### /vpc-service-update — VPC Service Update
- id: `cmd_vpc_service_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `npx wrangler vpc service update {SERVICE_ID} --name {NAME} --type {TYPE} --tunnel-id {TUNNEL_ID}`
- description: Update VPC service

#### /vpc-service-get — VPC Service Get
- id: `cmd_vpc_service_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `npx wrangler vpc service get {SERVICE_ID}`
- description: Get VPC service

#### /vpc-service-list — VPC Service List
- id: `cmd_vpc_service_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `npx wrangler vpc service list`
- description: List VPC services


### worker/deploy

#### /wrangler-delete — Wrangler Delete
- id: `cmd_workers_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler delete {SCRIPT}`
- description: Delete Worker

#### /wrangler-deploy — Wrangler Deploy
- id: `cmd_workers_deploy`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler deploy`
- description: Deploy Worker


### worker/deployments

#### /rollback — Rollback
- id: `cmd_rollback`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler rollback {VERSION_ID}`
- description: Rollback Worker deployment

#### /deployments-list — Deployments List
- id: `cmd_deployments_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler deployments list`
- description: List Worker deployments

#### /deployments-status — Deployments Status
- id: `cmd_deployments_status`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler deployments status`
- description: View production deployment status


### worker/dev

#### /wrangler-dev — Wrangler Dev
- id: `cmd_workers_dev`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler dev`
- description: Start local Worker dev server


### worker/logs

#### /wrangler-tail — Wrangler Tail
- id: `cmd_workers_tail`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler tail {WORKER}`
- description: Tail Worker logs


### worker/project

#### /wrangler-init — Wrangler Init
- id: `cmd_workers_init`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler init {NAME}`
- description: Create new Cloudflare Worker project

#### /wrangler-setup — Wrangler Setup
- id: `cmd_workers_setup`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler setup`
- description: Configure project for Cloudflare


### worker/secrets

#### /secret-bulk — Secret Bulk
- id: `cmd_secret_bulk`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler secret bulk {FILE}`
- description: Bulk upload Worker secrets

#### /secret-delete — Secret Delete
- id: `cmd_secret_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler secret delete {KEY}`
- description: Delete Worker secret

#### /secret-put — Secret Put
- id: `cmd_secret_put`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler secret put {KEY}`
- description: Create/update Worker secret

#### /secret-list — Secret List
- id: `cmd_secret_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler secret list`
- description: List Worker secrets


### worker/triggers

#### /triggers-deploy — Triggers Deploy
- id: `cmd_triggers_deploy`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler triggers deploy`
- description: Deploy Worker triggers


### worker/versions

#### /versions-deploy — Versions Deploy
- id: `cmd_versions_deploy`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler versions deploy {VERSION_SPECS} -y`
- description: Deploy Worker version split

#### /versions-list — Versions List
- id: `cmd_versions_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler versions list`
- description: List Worker versions

#### /versions-view — Versions View
- id: `cmd_versions_view`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler versions view {VERSION_ID}`
- description: View Worker version

#### /versions-upload — Versions Upload
- id: `cmd_versions_upload`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler versions upload {SCRIPT}`
- description: Upload Worker version


### worker/versions-secrets

#### /versions-secret-bulk — Versions Secret Bulk
- id: `cmd_versions_secret_bulk`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler versions secret bulk {FILE}`
- description: Bulk secrets for Worker version

#### /versions-secret-delete — Versions Secret Delete
- id: `cmd_versions_secret_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler versions secret delete {KEY}`
- description: Delete secret on Worker version

#### /versions-secret-put — Versions Secret Put
- id: `cmd_versions_secret_put`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `npx wrangler versions secret put {KEY}`
- description: Create/update secret on Worker version


### workers_ai/discovery

#### /ai-authors-search — AI Authors Search
- id: `cmd_ai_authors_search`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/ai/authors/search`
- description: Search AI authors

#### /ai-model-schema-get — AI Model Schema Get
- id: `cmd_ai_model_schema_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/ai/models/schema`
- description: Get model schema

#### /ai-models-search — AI Models Search
- id: `cmd_ai_models_search`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/ai/models/search`
- description: Search AI models

#### /ai-tasks-search — AI Tasks Search
- id: `cmd_ai_tasks_search`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/ai/tasks/search`
- description: Search AI tasks


### workers_ai/finetunes

#### /ai-finetune-asset-upload — AI Finetune Asset Upload
- id: `cmd_ai_finetune_asset_upload`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/ai/finetunes/{finetune_id}/finetune-assets`
- description: Upload finetune asset

#### /ai-finetune-create — AI Finetune Create
- id: `cmd_ai_finetune_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/ai/finetunes`
- description: Create a new finetune

#### /ai-finetunes-list — AI Finetunes List
- id: `cmd_ai_finetunes_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/ai/finetunes`
- description: List finetunes

#### /ai-finetunes-public-list — AI Public Finetunes List
- id: `cmd_ai_finetunes_public_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/ai/finetunes/public`
- description: List public finetunes


### workers_ai/inference

#### /ai-run-model — Workers AI Run Model
- id: `cmd_ai_run_model`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/ai/run/{model_name}`
- description: Execute AI model


### workers_ai/tomarkdown

#### /ai-tomarkdown-supported — AI To Markdown Supported
- id: `cmd_ai_tomarkdown_supported`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: GET /accounts/{account_id}/ai/tomarkdown/supported`
- description: Get supported conversion formats

#### /ai-tomarkdown-convert — AI To Markdown Convert
- id: `cmd_ai_tomarkdown_convert`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `deploy`
- mapped_command: `API_CALL: POST /accounts/{account_id}/ai/tomarkdown`
- description: Convert files into Markdown


### workflow/general

#### daily-summary — Daily Summary Email
- id: `cmd_daily_summary`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `general`
- mapped_command: `generate_daily_summary_email`
- description: Generate and send the Agent Sam daily ops summary email — covers AI usage, tool calls, MCP activity, and deployments. Model resolved from agentsam_ai.


### zero_trust/access_apps

#### /zt-access-app-delete — Zero Trust Access App Delete
- id: `cmd_zt_access_app_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /{accounts_or_zones}/{account_or_zone_id}/access/apps/{app_id}`
- description: Delete Access application

#### /zt-access-app-create — Zero Trust Access App Create
- id: `cmd_zt_access_app_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /{accounts_or_zones}/{account_or_zone_id}/access/apps`
- description: Add Access application

#### /zt-access-app-revoke-tokens — Zero Trust Access App Revoke Tokens
- id: `cmd_zt_access_app_revoke_tokens`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /{accounts_or_zones}/{account_or_zone_id}/access/apps/{app_id}/revoke_tokens`
- description: Revoke application tokens

#### /zt-access-app-update — Zero Trust Access App Update
- id: `cmd_zt_access_app_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PUT /{accounts_or_zones}/{account_or_zone_id}/access/apps/{app_id}`
- description: Update Access application

#### /zt-access-app-get — Zero Trust Access App Get
- id: `cmd_zt_access_app_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /{accounts_or_zones}/{account_or_zone_id}/access/apps/{app_id}`
- description: Get Access application

#### /zt-access-apps-list — Zero Trust Access Apps List
- id: `cmd_zt_access_apps_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /{accounts_or_zones}/{account_or_zone_id}/access/apps`
- description: List Access applications


### zero_trust/device_policy

#### /zt-policy-delete — Zero Trust Policy Delete
- id: `cmd_zt_policy_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/devices/policy/{policy_id}`
- description: Delete device settings profile

#### /zt-default-policy-update — Zero Trust Default Policy Update
- id: `cmd_zt_default_policy_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PATCH /accounts/{account_id}/devices/policy`
- description: Update default device settings profile

#### /zt-policy-create — Zero Trust Policy Create
- id: `cmd_zt_policy_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/devices/policy`
- description: Create device settings profile

#### /zt-policy-update — Zero Trust Policy Update
- id: `cmd_zt_policy_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PATCH /accounts/{account_id}/devices/policy/{policy_id}`
- description: Update device settings profile

#### /zt-default-policy-get — Zero Trust Default Policy Get
- id: `cmd_zt_default_policy_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/devices/policy`
- description: Get default device settings profile

#### /zt-policies-list — Zero Trust Policies List
- id: `cmd_zt_policies_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/devices/policies`
- description: List custom device settings profiles

#### /zt-policy-get — Zero Trust Policy Get
- id: `cmd_zt_policy_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/devices/policy/{policy_id}`
- description: Get device settings profile


### zero_trust/devices

#### /zt-device-delete — Zero Trust Device Delete
- id: `cmd_zt_devices_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/devices/physical-devices/{device_id}`
- description: Delete WARP physical device

#### /zt-device-revoke — Zero Trust Device Revoke
- id: `cmd_zt_devices_revoke`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/devices/physical-devices/{device_id}/revoke`
- description: Revoke WARP device registrations

#### /zt-device-get — Zero Trust Device Get
- id: `cmd_zt_devices_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/devices/physical-devices/{device_id}`
- description: Get WARP physical device

#### /zt-devices-list — Zero Trust Devices List
- id: `cmd_zt_devices_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/devices/physical-devices`
- description: List WARP physical devices


### zero_trust/dex_tests

#### /zt-dex-test-delete — Zero Trust DEX Test Delete
- id: `cmd_zt_dex_test_delete`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/dex/devices/dex_tests/{dex_test_id}`
- description: Delete Device DEX test

#### /zt-dex-test-get — Zero Trust DEX Test Get
- id: `cmd_zt_dex_test_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/dex/devices/dex_tests/{dex_test_id}`
- description: Get Device DEX test

#### /zt-dex-tests-list — Zero Trust DEX Tests List
- id: `cmd_zt_dex_tests_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/dex/devices/dex_tests`
- description: List Device DEX tests

#### /zt-dex-test-create — Zero Trust DEX Test Create
- id: `cmd_zt_dex_test_create`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/dex/devices/dex_tests`
- description: Create Device DEX test

#### /zt-dex-test-update — Zero Trust DEX Test Update
- id: `cmd_zt_dex_test_update`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PUT /accounts/{account_id}/dex/devices/dex_tests/{dex_test_id}`
- description: Update Device DEX test


### zero_trust/dlp

#### /zt-dlp-dataset-delete — Zero Trust DLP Dataset Delete
- id: `cmd_zt_dlp_dataset_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/dlp/datasets/{dataset_id}`
- description: Delete DLP dataset

#### /zt-dlp-dataset-create — Zero Trust DLP Dataset Create
- id: `cmd_zt_dlp_dataset_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/dlp/datasets`
- description: Create DLP dataset

#### /zt-dlp-settings-update — Zero Trust DLP Settings Update
- id: `cmd_zt_dlp_settings_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PATCH /accounts/{account_id}/dlp/settings`
- description: Update DLP account settings

#### /zt-dlp-datasets-list — Zero Trust DLP Datasets List
- id: `cmd_zt_dlp_datasets_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/dlp/datasets`
- description: List DLP datasets

#### /zt-dlp-patterns-validate — Zero Trust DLP Pattern Validate
- id: `cmd_zt_dlp_patterns_validate`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/dlp/patterns/validate`
- description: Validate DLP regex pattern

#### /zt-dlp-settings-get — Zero Trust DLP Settings Get
- id: `cmd_zt_dlp_settings_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/dlp/settings`
- description: Get DLP account settings


### zero_trust/fleet_status

#### /zt-fleet-status-live — Zero Trust Fleet Status Live
- id: `cmd_zt_fleet_status_live`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/dex/devices/{device_id}/fleet-status/live`
- description: Get live status of latest device


### zero_trust/identity_providers

#### /zt-idp-delete — Zero Trust Identity Provider Delete
- id: `cmd_zt_idp_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /{accounts_or_zones}/{account_or_zone_id}/access/identity_providers/{identity_provider_id}`
- description: Delete Access identity provider

#### /zt-idp-create — Zero Trust Identity Provider Create
- id: `cmd_zt_idp_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /{accounts_or_zones}/{account_or_zone_id}/access/identity_providers`
- description: Add Access identity provider

#### /zt-idp-update — Zero Trust Identity Provider Update
- id: `cmd_zt_idp_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PUT /{accounts_or_zones}/{account_or_zone_id}/access/identity_providers/{identity_provider_id}`
- description: Update Access identity provider

#### /zt-idp-list — Zero Trust Identity Providers List
- id: `cmd_zt_idp_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /{accounts_or_zones}/{account_or_zone_id}/access/identity_providers`
- description: List Access identity providers


### zero_trust/keys

#### /zt-access-keys-rotate — Zero Trust Access Keys Rotate
- id: `cmd_zt_access_keys_rotate`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/access/keys/rotate`
- description: Rotate Access keys

#### /zt-access-keys-get — Zero Trust Access Keys Get
- id: `cmd_zt_access_keys_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/access/keys`
- description: Get Access key configuration


### zero_trust/logs

#### /zt-access-logs-requests — Zero Trust Access Logs Requests
- id: `cmd_zt_access_logs_requests`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/access/logs/access_requests`
- description: Get Access authentication logs


### zero_trust/mcp_portals

#### /zt-mcp-portal-delete — Zero Trust MCP Portal Delete
- id: `cmd_zt_mcp_portal_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/access/ai-controls/mcp/portals/{id}`
- description: Delete MCP portal

#### /zt-mcp-portal-create — Zero Trust MCP Portal Create
- id: `cmd_zt_mcp_portal_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/access/ai-controls/mcp/portals`
- description: Create MCP portal

#### /zt-mcp-portal-update — Zero Trust MCP Portal Update
- id: `cmd_zt_mcp_portal_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PUT /accounts/{account_id}/access/ai-controls/mcp/portals/{id}`
- description: Update MCP portal

#### /zt-mcp-portals-list — Zero Trust MCP Portals List
- id: `cmd_zt_mcp_portals_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/access/ai-controls/mcp/portals`
- description: List MCP portals


### zero_trust/mcp_servers

#### /zt-mcp-server-create — Zero Trust MCP Server Create
- id: `cmd_zt_mcp_server_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/access/ai-controls/mcp/servers`
- description: Create MCP server

#### /zt-mcp-servers-list — Zero Trust MCP Servers List
- id: `cmd_zt_mcp_servers_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/access/ai-controls/mcp/servers`
- description: List MCP servers

#### /zt-mcp-server-sync — Zero Trust MCP Server Sync
- id: `cmd_zt_mcp_server_sync`
- risk: `medium`
- approval: `0` confirmation: `1`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/access/ai-controls/mcp/servers/{id}/sync`
- description: Sync MCP server capabilities


### zero_trust/organization

#### /zt-org-revoke-user — Zero Trust Organization Revoke User
- id: `cmd_zt_org_revoke_user`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /{accounts_or_zones}/{account_or_zone_id}/access/organizations/revoke_user`
- description: Revoke all Access tokens for user

#### /zt-org-update — Zero Trust Organization Update
- id: `cmd_zt_org_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PUT /{accounts_or_zones}/{account_or_zone_id}/access/organizations`
- description: Update Zero Trust organization

#### /zt-org-get — Zero Trust Organization Get
- id: `cmd_zt_org_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /{accounts_or_zones}/{account_or_zone_id}/access/organizations`
- description: Get Zero Trust organization


### zero_trust/posture

#### /zt-posture-delete — Zero Trust Posture Delete
- id: `cmd_zt_posture_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/devices/posture/{rule_id}`
- description: Delete device posture rule

#### /zt-posture-create — Zero Trust Posture Create
- id: `cmd_zt_posture_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/devices/posture`
- description: Create device posture rule

#### /zt-posture-update — Zero Trust Posture Update
- id: `cmd_zt_posture_update`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: PUT /accounts/{account_id}/devices/posture/{rule_id}`
- description: Update device posture rule

#### /zt-posture-get — Zero Trust Posture Get
- id: `cmd_zt_posture_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/devices/posture/{rule_id}`
- description: Get device posture rule

#### /zt-posture-list — Zero Trust Posture List
- id: `cmd_zt_posture_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/devices/posture`
- description: List device posture rules


### zero_trust/registrations

#### /zt-registration-delete — Zero Trust Registration Delete
- id: `cmd_zt_registration_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/devices/registrations/{registration_id}`
- description: Delete WARP registration

#### /zt-registrations-revoke — Zero Trust Registrations Revoke
- id: `cmd_zt_registrations_revoke`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/devices/registrations/revoke`
- description: Bulk revoke WARP registrations

#### /zt-registrations-unrevoke — Zero Trust Registrations Unrevoke
- id: `cmd_zt_registrations_unrevoke`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/devices/registrations/unrevoke`
- description: Bulk unrevoke WARP registrations

#### /zt-registration-get — Zero Trust Registration Get
- id: `cmd_zt_registration_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/devices/registrations/{registration_id}`
- description: Get WARP registration

#### /zt-registrations-list — Zero Trust Registrations List
- id: `cmd_zt_registrations_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/devices/registrations`
- description: List WARP registrations


### zero_trust/resilience

#### /zt-warp-override-set — Zero Trust WARP Override Set
- id: `cmd_zt_warp_override_set`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/devices/resilience/disconnect`
- description: Set Global WARP override disconnect state

#### /zt-warp-override-get — Zero Trust WARP Override Get
- id: `cmd_zt_warp_override_get`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/devices/resilience/disconnect`
- description: Retrieve Global WARP override state


### zero_trust/service_tokens

#### /zt-service-token-delete — Zero Trust Service Token Delete
- id: `cmd_zt_service_token_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /{accounts_or_zones}/{account_or_zone_id}/access/service_tokens/{service_token_id}`
- description: Delete Access service token

#### /zt-service-token-create — Zero Trust Service Token Create
- id: `cmd_zt_service_token_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /{accounts_or_zones}/{account_or_zone_id}/access/service_tokens`
- description: Create Access service token

#### /zt-service-token-rotate — Zero Trust Service Token Rotate
- id: `cmd_zt_service_token_rotate`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/access/service_tokens/{service_token_id}/rotate`
- description: Rotate Access service token

#### /zt-service-tokens-list — Zero Trust Service Tokens List
- id: `cmd_zt_service_tokens_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /{accounts_or_zones}/{account_or_zone_id}/access/service_tokens`
- description: List Access service tokens


### zero_trust/tunnels

#### /zt-tunnel-connections-cleanup — Zero Trust Tunnel Connections Cleanup
- id: `cmd_zt_tunnel_connections_cleanup`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/cfd_tunnel/{tunnel_id}/connections`
- description: Clean up Cloudflare Tunnel connections

#### /zt-tunnel-token-get — Zero Trust Tunnel Token Get
- id: `cmd_zt_tunnel_token_get`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/cfd_tunnel/{tunnel_id}/token`
- description: Get Cloudflare Tunnel token

#### /zt-tunnel-connections-list — Zero Trust Tunnel Connections List
- id: `cmd_zt_tunnel_connections_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/cfd_tunnel/{tunnel_id}/connections`
- description: List Cloudflare Tunnel connections


### zero_trust/warp_connector

#### /zt-warp-connector-delete — Zero Trust WARP Connector Delete
- id: `cmd_zt_warp_connector_delete`
- risk: `critical`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `none`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: DELETE /accounts/{account_id}/warp_connector/{tunnel_id}`
- description: Delete WARP Connector tunnel

#### /zt-warp-connector-create — Zero Trust WARP Connector Create
- id: `cmd_zt_warp_connector_create`
- risk: `high`
- approval: `1` confirmation: `1`
- timeout: `120s` retry: `once`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: POST /accounts/{account_id}/warp_connector`
- description: Create WARP Connector tunnel

#### /zt-warp-connector-list — Zero Trust WARP Connector List
- id: `cmd_zt_warp_connector_list`
- risk: `low`
- approval: `0` confirmation: `0`
- timeout: `120s` retry: `twice`
- task_type: `tool_use` route_key: `security_audit`
- mapped_command: `API_CALL: GET /accounts/{account_id}/warp_connector`
- description: List WARP Connector tunnels
