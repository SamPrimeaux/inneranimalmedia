# AgentSam Commands Catalog

Generated from remote D1 table `agentsam_commands`.

Source command:
`npx wrangler d1 execute inneranimalmedia-business --remote --json --command "SELECT ... FROM agentsam_commands ..."`

Purpose:
- Command IDs/slugs reference
- Command governance review
- Backfilling `agentsam_command_run.selected_command_id`
- Cursor/Agent Sam context for command execution safety

---

# AgentSam Commands

## browser

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_browser_create` | `/browser-create` | `low` | `no` | `npx wrangler browser create` |
| `cmd_browser_create_lab` | `/browser-create-lab` | `medium` | `yes` | `npx wrangler browser create --lab` |
| `cmd_browser_create_json` | `/browser-create-json` | `low` | `no` | `npx wrangler browser create --json` |
| `cmd_browser_create_keepalive` | `/browser-create-keepalive` | `low` | `no` | `npx wrangler browser create --keepAlive {SECONDS}` |
| `cmd_browser_list` | `/browser-list` | `low` | `no` | `npx wrangler browser list` |
| `cmd_browser_view` | `/browser-view` | `low` | `no` | `npx wrangler browser view {SESSIONID}` |
| `cmd_browser_view_target` | `/browser-view-target` | `low` | `no` | `npx wrangler browser view {SESSIONID} --target {TARGET}` |
| `cmd_browser_close` | `/browser-close` | `medium` | `yes` | `npx wrangler browser close {SESSIONID}` |

## ci_cd

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_builds_latest` | `/builds-latest` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/builds/builds/latest` |
| `cmd_builds_list` | `/builds-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/builds/builds` |
| `cmd_builds_limits` | `/builds-limits` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/builds/account/limits` |
| `cmd_build_get` | `/build-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/builds/builds/{build_uuid}` |
| `cmd_build_cancel` | `/build-cancel` | `high` | `yes` | `API_CALL: PUT /accounts/{account_id}/builds/builds/{build_uuid}/cancel` |
| `cmd_build_logs` | `/build-logs` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/builds/builds/{build_uuid}/logs` |
| `cmd_trigger_list` | `/build-triggers-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/builds/workers/{external_script_id}/triggers` |
| `cmd_trigger_create` | `/build-trigger-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/builds/triggers` |
| `cmd_trigger_update` | `/build-trigger-update` | `medium` | `yes` | `API_CALL: PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}` |
| `cmd_trigger_delete` | `/build-trigger-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/builds/triggers/{trigger_uuid}` |
| `cmd_trigger_build` | `/build-trigger-run` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/builds/triggers/{trigger_uuid}/builds` |
| `cmd_trigger_cache_purge` | `/build-cache-purge` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/builds/triggers/{trigger_uuid}/purge_build_cache` |

## cloudflare

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_cf_images_list` | `/cf-images-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/images/v1` |
| `cmd_cf_images_get` | `/cf-images-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/images/v1/{image_id}` |
| `cmd_cf_images_upload` | `/cf-images-upload` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/images/v1` |
| `cmd_cf_images_delete` | `/cf-images-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/images/v1/{image_id}` |
| `cmd_cf_images_update` | `/cf-images-update` | `medium` | `yes` | `API_CALL: PATCH /accounts/{account_id}/images/v1/{image_id}` |
| `cmd_cf_images_variants_list` | `/cf-images-variants-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/images/v1/variants` |
| `cmd_cf_images_variant_create` | `/cf-images-variant-create` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/images/v1/variants` |
| `cmd_cf_images_variant_delete` | `/cf-images-variant-delete` | `high` | `yes` | `API_CALL: DELETE /accounts/{account_id}/images/v1/variants/{variant_id}` |
| `cmd_cf_images_stats` | `/cf-images-stats` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/images/v1/stats` |
| `cmd_cf_healthcheck_list` | `/cf-healthcheck-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/healthchecks` |
| `cmd_cf_healthcheck_get` | `/cf-healthcheck-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/healthchecks/{id}` |
| `cmd_cf_healthcheck_create` | `/cf-healthcheck-create` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/healthchecks` |
| `cmd_cf_healthcheck_update` | `/cf-healthcheck-update` | `medium` | `yes` | `API_CALL: PUT /accounts/{account_id}/healthchecks/{id}` |
| `cmd_cf_healthcheck_delete` | `/cf-healthcheck-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/healthchecks/{id}` |
| `cmd_cf_healthcheck_preview` | `/cf-healthcheck-preview` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/healthchecks/preview` |
| `cmd_cf_healthcheck_events` | `/cf-healthcheck-events` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/healthchecks/events` |
| `cmd_cf_realtime_sessions_list` | `/cf-realtime-sessions-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/sessions` |
| `cmd_cf_realtime_session_get` | `/cf-realtime-session-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/sessions/{session_id}` |
| `cmd_cf_realtime_session_create` | `/cf-realtime-session-create` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/realtime/sessions` |
| `cmd_cf_realtime_session_delete` | `/cf-realtime-session-delete` | `high` | `yes` | `API_CALL: DELETE /accounts/{account_id}/realtime/sessions/{session_id}` |
| `cmd_cf_realtime_events` | `/cf-realtime-events` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/events` |
| `cmd_cf_realtime_broadcast` | `/cf-realtime-broadcast` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/realtime/broadcast` |

## cms

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_cms_theme_batch` | `cms-theme-batch` | `low` | `no` | `wf_cms_theme_batch` |
| `cmd_cms_theme_verify` | `cms-theme-verify` | `low` | `no` | `scr_cms_theme_curl` |
| `cmd_cms_theme_audit` | `cms-theme-audit` | `low` | `no` | `scr_cms_theme_audit` |
| `cmd_cms_theme_status` | `cms-theme-status` | `low` | `no` | `agentsam_memory` |

## d1

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_d1_create` | `/d1-create` | `medium` | `yes` | `npx wrangler d1 create {NAME}` |
| `cmd_d1_info` | `/d1-info` | `low` | `no` | `npx wrangler d1 info {NAME}` |
| `cmd_d1_list` | `/d1-list` | `low` | `no` | `npx wrangler d1 list` |
| `cmd_d1_delete` | `/d1-delete` | `critical` | `yes` | `npx wrangler d1 delete {NAME}` |
| `cmd_d1_execute_command` | `/d1-execute-command` | `high` | `yes` | `npx wrangler d1 execute {DATABASE} --remote --command "{SQL}"` |
| `cmd_d1_execute_file` | `/d1-execute-file` | `high` | `yes` | `npx wrangler d1 execute {DATABASE} --remote --file {FILE}` |
| `cmd_d1_export` | `/d1-export` | `low` | `no` | `npx wrangler d1 export {NAME} --remote --output {OUTPUT}` |
| `cmd_d1_export_schema` | `/d1-export-schema` | `low` | `no` | `npx wrangler d1 export {NAME} --remote --no-data --output {OUTPUT}` |
| `cmd_d1_export_data` | `/d1-export-data` | `medium` | `yes` | `npx wrangler d1 export {NAME} --remote --no-schema --output {OUTPUT}` |
| `cmd_d1_time_travel_info` | `/d1-time-travel-info` | `low` | `no` | `npx wrangler d1 time-travel info {DATABASE} --timestamp {TIMESTAMP}` |
| `cmd_d1_time_travel_restore` | `/d1-time-travel-restore` | `critical` | `yes` | `npx wrangler d1 time-travel restore {DATABASE} --bookmark {BOOKMARK}` |
| `cmd_d1_migrations_create` | `/d1-migration-create` | `low` | `no` | `npx wrangler d1 migrations create {DATABASE} "{MESSAGE}"` |
| `cmd_d1_migrations_list` | `/d1-migrations-list` | `low` | `no` | `npx wrangler d1 migrations list {DATABASE} --remote` |
| `cmd_d1_migrations_apply` | `/d1-migrations-apply` | `high` | `yes` | `npx wrangler d1 migrations apply {DATABASE} --remote` |
| `cmd_d1_insights` | `/d1-insights` | `low` | `no` | `npx wrangler d1 insights {NAME}` |

## designstudio

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_designstudio_blueprint_create` | `designstudio:blueprint-create` | `low` | `no` | `designstudio_blueprint_create` |
| `cmd_designstudio_sketch` | `designstudio:sketch` | `low` | `no` | `designstudio_excalidraw_sketch` |
| `cmd_designstudio_openscad_generate` | `designstudio:openscad-generate` | `medium` | `yes` | `designstudio_openscad_generate` |
| `cmd_designstudio_export_stl` | `designstudio:export-stl` | `medium` | `yes` | `designstudio_openscad_export_stl` |
| `cmd_designstudio_convert_glb` | `designstudio:convert-glb` | `medium` | `yes` | `designstudio_blender_convert_glb` |
| `cmd_designstudio_freecad` | `designstudio:freecad` | `high` | `yes` | `designstudio_freecad_script` |
| `cmd_designstudio_register_asset` | `designstudio:register-asset` | `medium` | `no` | `designstudio_asset_register` |

## durable_object

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_do_rpc_invocation` | `/do-rpc-invocation` | `medium` | `no` | `IMPLEMENTATION_GUIDE: durable_object_rpc_invocation` |
| `cmd_do_fetch_invocation` | `/do-fetch-invocation` | `medium` | `no` | `IMPLEMENTATION_GUIDE: durable_object_fetch_invocation` |
| `cmd_do_retryable_errors` | `/do-retryable-errors` | `high` | `yes` | `IMPLEMENTATION_GUIDE: durable_object_retryable_errors` |
| `cmd_do_stub_recreation` | `/do-stub-recreation` | `medium` | `no` | `IMPLEMENTATION_GUIDE: durable_object_stub_recreation` |
| `cmd_do_sqlite_storage` | `/do-sqlite-storage` | `medium` | `no` | `IMPLEMENTATION_GUIDE: durable_object_sqlite_storage` |
| `cmd_do_kv_storage` | `/do-kv-storage` | `medium` | `no` | `IMPLEMENTATION_GUIDE: durable_object_kv_storage` |
| `cmd_do_websocket_hibernation` | `/do-websocket-hibernation` | `medium` | `no` | `IMPLEMENTATION_GUIDE: durable_object_websocket_hibernation` |
| `cmd_do_websocket_standard` | `/do-websocket-standard` | `medium` | `no` | `IMPLEMENTATION_GUIDE: durable_object_standard_websocket` |
| `cmd_do_clear_storage` | `/do-clear-storage` | `critical` | `yes` | `IMPLEMENTATION_GUIDE: durable_object_clear_storage` |
| `cmd_do_sql_indexes` | `/do-sql-indexes` | `low` | `no` | `IMPLEMENTATION_GUIDE: durable_object_sql_indexes` |

## hyperdrive

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_hyperdrive_create` | `/hyperdrive-create` | `high` | `yes` | `npx wrangler hyperdrive create {NAME}` |
| `cmd_hyperdrive_delete` | `/hyperdrive-delete` | `critical` | `yes` | `npx wrangler hyperdrive delete {ID}` |
| `cmd_hyperdrive_get` | `/hyperdrive-get` | `low` | `no` | `npx wrangler hyperdrive get {ID}` |
| `cmd_hyperdrive_list` | `/hyperdrive-list` | `low` | `no` | `npx wrangler hyperdrive list` |
| `cmd_hyperdrive_update` | `/hyperdrive-update` | `high` | `yes` | `npx wrangler hyperdrive update {ID}` |

## kv

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_kv_namespace_create` | `/kv-namespace-create` | `medium` | `yes` | `npx wrangler kv namespace create {NAMESPACE}` |
| `cmd_kv_namespace_list` | `/kv-namespace-list` | `low` | `no` | `npx wrangler kv namespace list` |
| `cmd_kv_namespace_delete` | `/kv-namespace-delete` | `critical` | `yes` | `npx wrangler kv namespace delete {NAMESPACE}` |
| `cmd_kv_namespace_rename` | `/kv-namespace-rename` | `high` | `yes` | `npx wrangler kv namespace rename {OLD_NAME} --new-name {NEW_NAME}` |
| `cmd_kv_key_put` | `/kv-key-put` | `medium` | `yes` | `npx wrangler kv key put {KEY} {VALUE} --binding {BINDING} --remote` |
| `cmd_kv_key_list` | `/kv-key-list` | `low` | `no` | `npx wrangler kv key list --binding {BINDING} --remote` |
| `cmd_kv_key_get` | `/kv-key-get` | `low` | `no` | `npx wrangler kv key get {KEY} --binding {BINDING} --remote --text` |
| `cmd_kv_key_delete` | `/kv-key-delete` | `high` | `yes` | `npx wrangler kv key delete {KEY} --binding {BINDING} --remote` |
| `cmd_kv_bulk_get` | `/kv-bulk-get` | `low` | `no` | `npx wrangler kv bulk get {FILENAME} --binding {BINDING} --remote` |
| `cmd_kv_bulk_put` | `/kv-bulk-put` | `high` | `yes` | `npx wrangler kv bulk put {FILENAME} --binding {BINDING} --remote` |
| `cmd_kv_bulk_delete` | `/kv-bulk-delete` | `critical` | `yes` | `npx wrangler kv bulk delete {FILENAME} --binding {BINDING} --remote` |

## meauxcad

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_3d_create` | `3d:create` | `medium` | `yes` | `meauxcad_design_brief_create` |
| `cmd_3d_sketch` | `3d:sketch` | `low` | `no` | `meauxcad_excalidraw_sketch_create` |
| `cmd_3d_openscad` | `3d:openscad` | `medium` | `yes` | `meauxcad_openscad_generate` |
| `cmd_3d_export_stl` | `3d:export-stl` | `medium` | `yes` | `meauxcad_openscad_export_stl` |
| `cmd_3d_convert_glb` | `3d:convert-glb` | `medium` | `yes` | `meauxcad_blender_stl_to_glb` |
| `cmd_3d_trace` | `3d:trace` | `low` | `no` | `meauxcad_run_trace_log` |

## pages

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_pages_dev` | `/pages-dev` | `low` | `no` | `npx wrangler pages dev {DIRECTORY}` |
| `cmd_pages_functions_build` | `/pages-functions-build` | `low` | `no` | `npx wrangler pages functions build {DIRECTORY}` |
| `cmd_pages_project_list` | `/pages-project-list` | `low` | `no` | `npx wrangler pages project list` |
| `cmd_pages_project_create` | `/pages-project-create` | `medium` | `yes` | `npx wrangler pages project create {PROJECT_NAME}` |
| `cmd_pages_project_delete` | `/pages-project-delete` | `critical` | `yes` | `npx wrangler pages project delete {PROJECT_NAME}` |
| `cmd_pages_deployment_list` | `/pages-deployment-list` | `low` | `no` | `npx wrangler pages deployment list --project-name {PROJECT_NAME}` |
| `cmd_pages_deployment_tail` | `/pages-deployment-tail` | `low` | `no` | `npx wrangler pages deployment tail {DEPLOYMENT} --project-name {PROJECT_NAME}` |
| `cmd_pages_deployment_delete` | `/pages-deployment-delete` | `critical` | `yes` | `npx wrangler pages deployment delete {DEPLOYMENT_ID} --project-name {PROJECT_NAME}` |
| `cmd_pages_deploy` | `/pages-deploy` | `high` | `yes` | `npx wrangler pages deploy {DIRECTORY} --project-name {PROJECT_NAME}` |
| `cmd_pages_secret_put` | `/pages-secret-put` | `high` | `yes` | `npx wrangler pages secret put {KEY} --project-name {PROJECT_NAME}` |
| `cmd_pages_secret_bulk` | `/pages-secret-bulk` | `high` | `yes` | `npx wrangler pages secret bulk {FILE} --project-name {PROJECT_NAME}` |
| `cmd_pages_secret_delete` | `/pages-secret-delete` | `high` | `yes` | `npx wrangler pages secret delete {KEY} --project-name {PROJECT_NAME}` |
| `cmd_pages_secret_list` | `/pages-secret-list` | `low` | `no` | `npx wrangler pages secret list --project-name {PROJECT_NAME}` |
| `cmd_pages_download_config` | `/pages-download-config` | `low` | `no` | `npx wrangler pages download config {PROJECTNAME}` |

## queues

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_queues_list` | `/queues-list` | `low` | `no` | `npx wrangler queues list` |
| `cmd_queues_create` | `/queues-create` | `medium` | `yes` | `npx wrangler queues create {NAME}` |
| `cmd_queues_update` | `/queues-update` | `high` | `yes` | `npx wrangler queues update {NAME}` |
| `cmd_queues_delete` | `/queues-delete` | `critical` | `yes` | `npx wrangler queues delete {NAME}` |
| `cmd_queues_info` | `/queues-info` | `low` | `no` | `npx wrangler queues info {NAME}` |
| `cmd_queues_consumer_add` | `/queues-consumer-add` | `high` | `yes` | `npx wrangler queues consumer add {QUEUE_NAME} {SCRIPT_NAME}` |
| `cmd_queues_consumer_remove` | `/queues-consumer-remove` | `high` | `yes` | `npx wrangler queues consumer remove {QUEUE_NAME} {SCRIPT_NAME}` |
| `cmd_queues_consumer_http_add` | `/queues-consumer-http-add` | `high` | `yes` | `npx wrangler queues consumer http add {QUEUE_NAME}` |
| `cmd_queues_consumer_http_remove` | `/queues-consumer-http-remove` | `high` | `yes` | `npx wrangler queues consumer http remove {QUEUE_NAME}` |
| `cmd_queues_consumer_worker_add` | `/queues-consumer-worker-add` | `high` | `yes` | `npx wrangler queues consumer worker add {QUEUE_NAME} {SCRIPT_NAME}` |
| `cmd_queues_consumer_worker_remove` | `/queues-consumer-worker-remove` | `high` | `yes` | `npx wrangler queues consumer worker remove {QUEUE_NAME} {SCRIPT_NAME}` |
| `cmd_queues_pause_delivery` | `/queues-pause-delivery` | `high` | `yes` | `npx wrangler queues pause-delivery {NAME}` |
| `cmd_queues_resume_delivery` | `/queues-resume-delivery` | `medium` | `yes` | `npx wrangler queues resume-delivery {NAME}` |
| `cmd_queues_purge` | `/queues-purge` | `critical` | `yes` | `npx wrangler queues purge {NAME}` |
| `cmd_queues_subscription_create` | `/queues-subscription-create` | `high` | `yes` | `npx wrangler queues subscription create {QUEUE} --source {SOURCE} --events {EVENTS}` |
| `cmd_queues_subscription_list` | `/queues-subscription-list` | `low` | `no` | `npx wrangler queues subscription list {QUEUE}` |
| `cmd_queues_subscription_get` | `/queues-subscription-get` | `low` | `no` | `npx wrangler queues subscription get {QUEUE} --id {ID}` |
| `cmd_queues_subscription_delete` | `/queues-subscription-delete` | `high` | `yes` | `npx wrangler queues subscription delete {QUEUE} --id {ID}` |
| `cmd_queues_subscription_update` | `/queues-subscription-update` | `high` | `yes` | `npx wrangler queues subscription update {QUEUE} --id {ID}` |

## r2

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_r2_bucket_create` | `/r2-bucket-create` | `medium` | `yes` | `npx wrangler r2 bucket create {NAME}` |
| `cmd_r2_bucket_info` | `/r2-bucket-info` | `low` | `no` | `npx wrangler r2 bucket info {BUCKET}` |
| `cmd_r2_bucket_list` | `/r2-bucket-list` | `low` | `no` | `npx wrangler r2 bucket list` |
| `cmd_r2_bucket_delete` | `/r2-bucket-delete` | `critical` | `yes` | `npx wrangler r2 bucket delete {BUCKET}` |
| `cmd_r2_catalog_enable` | `/r2-catalog-enable` | `medium` | `yes` | `npx wrangler r2 bucket catalog enable {BUCKET}` |
| `cmd_r2_catalog_disable` | `/r2-catalog-disable` | `high` | `yes` | `npx wrangler r2 bucket catalog disable {BUCKET}` |
| `cmd_r2_catalog_get` | `/r2-catalog-get` | `low` | `no` | `npx wrangler r2 bucket catalog get {BUCKET}` |
| `cmd_r2_catalog_compaction_enable` | `/r2-catalog-compaction-enable` | `medium` | `yes` | `npx wrangler r2 bucket catalog compaction enable {BUCKET} {NAMESPACE} {TABLE}` |
| `cmd_r2_catalog_compaction_disable` | `/r2-catalog-compaction-disable` | `medium` | `yes` | `npx wrangler r2 bucket catalog compaction disable {BUCKET} {NAMESPACE} {TABLE}` |
| `cmd_r2_catalog_snapshot_enable` | `/r2-catalog-snapshot-enable` | `medium` | `yes` | `npx wrangler r2 bucket catalog snapshot-expiration enable {BUCKET} {NAMESPACE} {TABLE}` |
| `cmd_r2_catalog_snapshot_disable` | `/r2-catalog-snapshot-disable` | `medium` | `yes` | `npx wrangler r2 bucket catalog snapshot-expiration disable {BUCKET} {NAMESPACE} {TABLE}` |
| `cmd_r2_cors_set` | `/r2-cors-set` | `medium` | `yes` | `npx wrangler r2 bucket cors set {BUCKET} --file {FILE}` |
| `cmd_r2_cors_delete` | `/r2-cors-delete` | `high` | `yes` | `npx wrangler r2 bucket cors delete {BUCKET}` |
| `cmd_r2_cors_list` | `/r2-cors-list` | `low` | `no` | `npx wrangler r2 bucket cors list {BUCKET}` |
| `cmd_r2_dev_url_enable` | `/r2-dev-url-enable` | `high` | `yes` | `npx wrangler r2 bucket dev-url enable {BUCKET}` |
| `cmd_r2_dev_url_disable` | `/r2-dev-url-disable` | `medium` | `yes` | `npx wrangler r2 bucket dev-url disable {BUCKET}` |
| `cmd_r2_dev_url_get` | `/r2-dev-url-get` | `low` | `no` | `npx wrangler r2 bucket dev-url get {BUCKET}` |
| `cmd_r2_domain_add` | `/r2-domain-add` | `high` | `yes` | `npx wrangler r2 bucket domain add {BUCKET} --domain {DOMAIN} --zone-id {ZONE_ID}` |
| `cmd_r2_domain_remove` | `/r2-domain-remove` | `high` | `yes` | `npx wrangler r2 bucket domain remove {BUCKET} --domain {DOMAIN}` |
| `cmd_r2_domain_update` | `/r2-domain-update` | `medium` | `yes` | `npx wrangler r2 bucket domain update {BUCKET} --domain {DOMAIN}` |
| `cmd_r2_domain_get` | `/r2-domain-get` | `low` | `no` | `npx wrangler r2 bucket domain get {BUCKET} --domain {DOMAIN}` |
| `cmd_r2_domain_list` | `/r2-domain-list` | `low` | `no` | `npx wrangler r2 bucket domain list {BUCKET}` |
| `cmd_r2_lifecycle_add` | `/r2-lifecycle-add` | `medium` | `yes` | `npx wrangler r2 bucket lifecycle add {BUCKET} {NAME} {PREFIX}` |
| `cmd_r2_lifecycle_remove` | `/r2-lifecycle-remove` | `high` | `yes` | `npx wrangler r2 bucket lifecycle remove {BUCKET} --name {NAME}` |
| `cmd_r2_lifecycle_list` | `/r2-lifecycle-list` | `low` | `no` | `npx wrangler r2 bucket lifecycle list {BUCKET}` |
| `cmd_r2_lifecycle_set` | `/r2-lifecycle-set` | `high` | `yes` | `npx wrangler r2 bucket lifecycle set {BUCKET} --file {FILE}` |
| `cmd_r2_lock_add` | `/r2-lock-add` | `high` | `yes` | `npx wrangler r2 bucket lock add {BUCKET} {NAME} {PREFIX}` |
| `cmd_r2_lock_remove` | `/r2-lock-remove` | `high` | `yes` | `npx wrangler r2 bucket lock remove {BUCKET} --name {NAME}` |
| `cmd_r2_lock_list` | `/r2-lock-list` | `low` | `no` | `npx wrangler r2 bucket lock list {BUCKET}` |
| `cmd_r2_lock_set` | `/r2-lock-set` | `high` | `yes` | `npx wrangler r2 bucket lock set {BUCKET} --file {FILE}` |
| `cmd_r2_notification_create` | `/r2-notification-create` | `medium` | `yes` | `npx wrangler r2 bucket notification create {BUCKET} --event-types {EVENT_TYPES} --queue {QUEUE}` |
| `cmd_r2_notification_delete` | `/r2-notification-delete` | `high` | `yes` | `npx wrangler r2 bucket notification delete {BUCKET} --queue {QUEUE}` |
| `cmd_r2_notification_list` | `/r2-notification-list` | `low` | `no` | `npx wrangler r2 bucket notification list {BUCKET}` |
| `cmd_r2_sippy_enable` | `/r2-sippy-enable` | `high` | `yes` | `npx wrangler r2 bucket sippy enable {NAME}` |
| `cmd_r2_sippy_disable` | `/r2-sippy-disable` | `medium` | `yes` | `npx wrangler r2 bucket sippy disable {NAME}` |
| `cmd_r2_sippy_get` | `/r2-sippy-get` | `low` | `no` | `npx wrangler r2 bucket sippy get {NAME}` |
| `cmd_r2_object_get` | `/r2-object-get` | `low` | `no` | `npx wrangler r2 object get {OBJECTPATH}` |

## realtime_kit

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_rt_meetings_list` | `/rt-meetings-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/meetings` |
| `cmd_rt_meeting_create` | `/rt-meeting-create` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/meetings` |
| `cmd_rt_meeting_get` | `/rt-meeting-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}` |
| `cmd_rt_meeting_update` | `/rt-meeting-update` | `medium` | `yes` | `API_CALL: PATCH /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}` |
| `cmd_rt_meeting_replace` | `/rt-meeting-replace` | `high` | `yes` | `API_CALL: PUT /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}` |
| `cmd_rt_meeting_participants_list` | `/rt-meeting-participants-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants` |
| `cmd_rt_meeting_participant_add` | `/rt-meeting-participant-add` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants` |
| `cmd_rt_meeting_participant_get` | `/rt-meeting-participant-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants/{participant_id}` |
| `cmd_rt_meeting_participant_edit` | `/rt-meeting-participant-edit` | `medium` | `yes` | `API_CALL: PATCH /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants/{participant_id}` |
| `cmd_rt_meeting_participant_delete` | `/rt-meeting-participant-delete` | `high` | `yes` | `API_CALL: DELETE /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants/{participant_id}` |
| `cmd_rt_meeting_participant_token_refresh` | `/rt-meeting-participant-token-refresh` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/participants/{participant_id}/token` |
| `cmd_rt_webhooks_list` | `/rt-webhooks-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/webhooks` |
| `cmd_rt_webhook_create` | `/rt-webhook-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/webhooks` |
| `cmd_rt_webhook_get` | `/rt-webhook-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/webhooks/{webhook_id}` |
| `cmd_rt_webhook_replace` | `/rt-webhook-replace` | `high` | `yes` | `API_CALL: PUT /accounts/{account_id}/realtime/kit/{app_id}/webhooks/{webhook_id}` |
| `cmd_rt_webhook_edit` | `/rt-webhook-edit` | `medium` | `yes` | `API_CALL: PATCH /accounts/{account_id}/realtime/kit/{app_id}/webhooks/{webhook_id}` |
| `cmd_rt_webhook_delete` | `/rt-webhook-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/realtime/kit/{app_id}/webhooks/{webhook_id}` |
| `cmd_rt_livestream_create_independent` | `/rt-livestream-create` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/livestreams` |
| `cmd_rt_livestreams_list` | `/rt-livestreams-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/livestreams` |
| `cmd_rt_meeting_livestream_start` | `/rt-meeting-livestream-start` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/livestreams` |
| `cmd_rt_meeting_livestream_stop` | `/rt-meeting-livestream-stop` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/active-livestream/stop` |
| `cmd_rt_livestream_analytics_overall` | `/rt-livestream-analytics-overall` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/analytics/livestreams/overall` |
| `cmd_rt_livestream_analytics_daywise` | `/rt-livestream-analytics-daywise` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/analytics/daywise` |
| `cmd_rt_meeting_active_livestream_get` | `/rt-meeting-active-livestream-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/meetings/{meeting_id}/active-livestream` |
| `cmd_rt_livestream_session_get` | `/rt-livestream-session-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/livestreams/sessions/{livestream_session_id}` |
| `cmd_rt_livestream_active_session_get` | `/rt-livestream-active-session-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/livestreams/{livestream_id}/active-livestream-session` |
| `cmd_rt_livestream_get` | `/rt-livestream-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/realtime/kit/{app_id}/livestreams/{livestream_id}` |

## resource_sharing

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_share_list` | `/share-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/shares` |
| `cmd_share_get` | `/share-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/shares/{share_id}` |
| `cmd_share_create` | `/share-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/shares` |
| `cmd_share_update` | `/share-update` | `high` | `yes` | `API_CALL: PUT /accounts/{account_id}/shares/{share_id}` |
| `cmd_share_delete` | `/share-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/shares/{share_id}` |
| `cmd_share_recipients_list` | `/share-recipients-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/shares/{share_id}/recipients` |
| `cmd_share_recipient_get` | `/share-recipient-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/shares/{share_id}/recipients/{recipient_id}` |
| `cmd_share_recipient_create` | `/share-recipient-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/shares/{share_id}/recipients` |
| `cmd_share_recipient_delete` | `/share-recipient-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/shares/{share_id}/recipients/{recipient_id}` |
| `cmd_share_resources_list` | `/share-resources-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/shares/{share_id}/resources` |
| `cmd_share_resource_get` | `/share-resource-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/shares/{share_id}/resources/{resource_id}` |
| `cmd_share_resource_create` | `/share-resource-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/shares/{share_id}/resources` |
| `cmd_share_resource_update` | `/share-resource-update` | `high` | `yes` | `API_CALL: PUT /accounts/{account_id}/shares/{share_id}/resources/{resource_id}` |
| `cmd_share_resource_delete` | `/share-resource-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/shares/{share_id}/resources/{resource_id}` |

## security

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_urlscanner_scan_create` | `/url-scan-create` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/urlscanner/v2/scan` |
| `cmd_urlscanner_scan_bulk` | `/url-scan-bulk` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/urlscanner/v2/bulk` |
| `cmd_urlscanner_scan_search` | `/url-scan-search` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/urlscanner/v2/search` |
| `cmd_urlscanner_scan_get` | `/url-scan-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/urlscanner/v2/result/{scan_id}` |
| `cmd_urlscanner_dom_get` | `/url-scan-dom` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/urlscanner/v2/dom/{scan_id}` |
| `cmd_urlscanner_har_get` | `/url-scan-har` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/urlscanner/v2/har/{scan_id}` |
| `cmd_urlscanner_screenshot` | `/url-scan-screenshot` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/urlscanner/v2/screenshots/{scan_id}.png` |
| `cmd_urlscanner_response_get` | `/url-scan-response` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/urlscanner/v2/responses/{response_id}` |
| `cmd_vuln_env_list` | `/vuln-env-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/vuln_scanner/target_environments` |
| `cmd_vuln_env_create` | `/vuln-env-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/vuln_scanner/target_environments` |
| `cmd_vuln_env_get` | `/vuln-env-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/vuln_scanner/target_environments/{target_environment_id}` |
| `cmd_vuln_env_update` | `/vuln-env-update` | `medium` | `yes` | `API_CALL: PUT /accounts/{account_id}/vuln_scanner/target_environments/{target_environment_id}` |
| `cmd_vuln_env_delete` | `/vuln-env-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/vuln_scanner/target_environments/{target_environment_id}` |
| `cmd_vuln_creds_list` | `/vuln-creds-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/vuln_scanner/credential_sets` |
| `cmd_vuln_creds_create` | `/vuln-creds-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/vuln_scanner/credential_sets` |
| `cmd_vuln_creds_delete` | `/vuln-creds-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/vuln_scanner/credential_sets/{credential_set_id}` |
| `cmd_vuln_scans_list` | `/vuln-scans-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/vuln_scanner/scans` |
| `cmd_vuln_scan_create` | `/vuln-scan-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/vuln_scanner/scans` |
| `cmd_vuln_scan_get` | `/vuln-scan-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/vuln_scanner/scans/{scan_id}` |
| `cmd_token_config_list` | `/token-config-list` | `low` | `no` | `API_CALL: GET /zones/{zone_id}/token_validation/config` |
| `cmd_token_config_get` | `/token-config-get` | `low` | `no` | `API_CALL: GET /zones/{zone_id}/token_validation/config/{config_id}` |
| `cmd_token_config_create` | `/token-config-create` | `high` | `yes` | `API_CALL: POST /zones/{zone_id}/token_validation/config` |
| `cmd_token_config_edit` | `/token-config-edit` | `high` | `yes` | `API_CALL: PATCH /zones/{zone_id}/token_validation/config/{config_id}` |
| `cmd_token_config_delete` | `/token-config-delete` | `critical` | `yes` | `API_CALL: DELETE /zones/{zone_id}/token_validation/config/{config_id}` |
| `cmd_token_config_credentials_update` | `/token-config-credentials-update` | `critical` | `yes` | `API_CALL: PUT /zones/{zone_id}/token_validation/config/{config_id}/credentials` |
| `cmd_token_rules_list` | `/token-rules-list` | `low` | `no` | `API_CALL: GET /zones/{zone_id}/token_validation/rules` |
| `cmd_token_rule_create` | `/token-rule-create` | `high` | `yes` | `API_CALL: POST /zones/{zone_id}/token_validation/rules` |
| `cmd_token_rules_bulk_create` | `/token-rules-bulk-create` | `high` | `yes` | `API_CALL: POST /zones/{zone_id}/token_validation/rules/bulk` |
| `cmd_token_rules_bulk_edit` | `/token-rules-bulk-edit` | `high` | `yes` | `API_CALL: PATCH /zones/{zone_id}/token_validation/rules/bulk` |
| `cmd_token_rule_get` | `/token-rule-get` | `low` | `no` | `API_CALL: GET /zones/{zone_id}/token_validation/rules/{rule_id}` |
| `cmd_token_rule_edit` | `/token-rule-edit` | `high` | `yes` | `API_CALL: PATCH /zones/{zone_id}/token_validation/rules/{rule_id}` |
| `cmd_token_rule_delete` | `/token-rule-delete` | `critical` | `yes` | `API_CALL: DELETE /zones/{zone_id}/token_validation/rules/{rule_id}` |
| `cmd_securitytxt_get` | `/securitytxt-get` | `low` | `no` | `API_CALL: GET /zones/{zone_id}/security-center/securitytxt` |
| `cmd_securitytxt_update` | `/securitytxt-update` | `medium` | `yes` | `API_CALL: PUT /zones/{zone_id}/security-center/securitytxt` |
| `cmd_securitytxt_delete` | `/securitytxt-delete` | `high` | `yes` | `API_CALL: DELETE /zones/{zone_id}/security-center/securitytxt` |

## ssl_tls

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_keyless_certs_list` | `/keyless-certs-list` | `low` | `no` | `API_CALL: GET /zones/{zone_id}/keyless_certificates` |
| `cmd_keyless_cert_get` | `/keyless-cert-get` | `low` | `no` | `API_CALL: GET /zones/{zone_id}/keyless_certificates/{keyless_certificate_id}` |
| `cmd_keyless_cert_create` | `/keyless-cert-create` | `critical` | `yes` | `API_CALL: POST /zones/{zone_id}/keyless_certificates` |
| `cmd_keyless_cert_edit` | `/keyless-cert-edit` | `critical` | `yes` | `API_CALL: PATCH /zones/{zone_id}/keyless_certificates/{keyless_certificate_id}` |
| `cmd_keyless_cert_delete` | `/keyless-cert-delete` | `critical` | `yes` | `API_CALL: DELETE /zones/{zone_id}/keyless_certificates/{keyless_certificate_id}` |

## system

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_docs` | `/wrangler-docs` | `low` | `no` | `npx wrangler docs {SEARCH}` |
| `cmd_login` | `/wrangler-login` | `medium` | `yes` | `npx wrangler login` |
| `cmd_logout` | `/wrangler-logout` | `medium` | `yes` | `npx wrangler logout` |
| `cmd_auth_token` | `/wrangler-auth-token` | `high` | `yes` | `npx wrangler auth token --json` |
| `cmd_whoami` | `/wrangler-whoami` | `low` | `no` | `npx wrangler whoami` |
| `cmd_telemetry_disable` | `/telemetry-disable` | `low` | `no` | `npx wrangler telemetry disable` |
| `cmd_telemetry_enable` | `/telemetry-enable` | `low` | `no` | `npx wrangler telemetry enable` |
| `cmd_telemetry_status` | `/telemetry-status` | `low` | `no` | `npx wrangler telemetry status` |
| `cmd_complete` | `/wrangler-complete` | `low` | `no` | `npx wrangler complete {SHELL}` |

## tunnel

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_tunnel_create` | `/tunnel-create` | `medium` | `yes` | `npx wrangler tunnel create {NAME}` |
| `cmd_tunnel_delete` | `/tunnel-delete` | `critical` | `yes` | `npx wrangler tunnel delete {TUNNEL}` |
| `cmd_tunnel_info` | `/tunnel-info` | `low` | `no` | `npx wrangler tunnel info {TUNNEL}` |
| `cmd_tunnel_list` | `/tunnel-list` | `low` | `no` | `npx wrangler tunnel list` |
| `cmd_tunnel_run` | `/tunnel-run` | `medium` | `yes` | `npx wrangler tunnel run {TUNNEL}` |
| `cmd_tunnel_quick_start` | `/tunnel-quick-start` | `medium` | `yes` | `npx wrangler tunnel quick-start {URL}` |

## vpc

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_vpc_service_create` | `/vpc-service-create` | `high` | `yes` | `npx wrangler vpc service create {NAME} --type {TYPE} --tunnel-id {TUNNEL_ID}` |
| `cmd_vpc_service_delete` | `/vpc-service-delete` | `critical` | `yes` | `npx wrangler vpc service delete {SERVICE_ID}` |
| `cmd_vpc_service_get` | `/vpc-service-get` | `low` | `no` | `npx wrangler vpc service get {SERVICE_ID}` |
| `cmd_vpc_service_list` | `/vpc-service-list` | `low` | `no` | `npx wrangler vpc service list` |
| `cmd_vpc_service_update` | `/vpc-service-update` | `high` | `yes` | `npx wrangler vpc service update {SERVICE_ID} --name {NAME} --type {TYPE} --tunnel-id {TUNNEL_ID}` |

## worker

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_workers_init` | `/wrangler-init` | `low` | `no` | `npx wrangler init {NAME}` |
| `cmd_workers_dev` | `/wrangler-dev` | `low` | `no` | `npx wrangler dev` |
| `cmd_workers_deploy` | `/wrangler-deploy` | `high` | `yes` | `npx wrangler deploy` |
| `cmd_workers_delete` | `/wrangler-delete` | `critical` | `yes` | `npx wrangler delete {SCRIPT}` |
| `cmd_workers_setup` | `/wrangler-setup` | `medium` | `yes` | `npx wrangler setup` |
| `cmd_workers_tail` | `/wrangler-tail` | `low` | `no` | `npx wrangler tail {WORKER}` |
| `cmd_secret_put` | `/secret-put` | `high` | `yes` | `npx wrangler secret put {KEY}` |
| `cmd_secret_delete` | `/secret-delete` | `high` | `yes` | `npx wrangler secret delete {KEY}` |
| `cmd_secret_list` | `/secret-list` | `low` | `no` | `npx wrangler secret list` |
| `cmd_secret_bulk` | `/secret-bulk` | `high` | `yes` | `npx wrangler secret bulk {FILE}` |
| `cmd_versions_upload` | `/versions-upload` | `medium` | `yes` | `npx wrangler versions upload {SCRIPT}` |
| `cmd_versions_deploy` | `/versions-deploy` | `high` | `yes` | `npx wrangler versions deploy {VERSION_SPECS} -y` |
| `cmd_versions_list` | `/versions-list` | `low` | `no` | `npx wrangler versions list` |
| `cmd_versions_view` | `/versions-view` | `low` | `no` | `npx wrangler versions view {VERSION_ID}` |
| `cmd_versions_secret_put` | `/versions-secret-put` | `high` | `yes` | `npx wrangler versions secret put {KEY}` |
| `cmd_versions_secret_delete` | `/versions-secret-delete` | `high` | `yes` | `npx wrangler versions secret delete {KEY}` |
| `cmd_versions_secret_bulk` | `/versions-secret-bulk` | `high` | `yes` | `npx wrangler versions secret bulk {FILE}` |
| `cmd_triggers_deploy` | `/triggers-deploy` | `medium` | `yes` | `npx wrangler triggers deploy` |
| `cmd_deployments_list` | `/deployments-list` | `low` | `no` | `npx wrangler deployments list` |
| `cmd_deployments_status` | `/deployments-status` | `low` | `no` | `npx wrangler deployments status` |
| `cmd_rollback` | `/rollback` | `critical` | `yes` | `npx wrangler rollback {VERSION_ID}` |

## workers_ai

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_ai_run_model` | `/ai-run-model` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/ai/run/{model_name}` |
| `cmd_ai_finetunes_list` | `/ai-finetunes-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/ai/finetunes` |
| `cmd_ai_finetune_create` | `/ai-finetune-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/ai/finetunes` |
| `cmd_ai_finetune_asset_upload` | `/ai-finetune-asset-upload` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/ai/finetunes/{finetune_id}/finetune-assets` |
| `cmd_ai_finetunes_public_list` | `/ai-finetunes-public-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/ai/finetunes/public` |
| `cmd_ai_authors_search` | `/ai-authors-search` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/ai/authors/search` |
| `cmd_ai_tasks_search` | `/ai-tasks-search` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/ai/tasks/search` |
| `cmd_ai_models_search` | `/ai-models-search` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/ai/models/search` |
| `cmd_ai_model_schema_get` | `/ai-model-schema-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/ai/models/schema` |
| `cmd_ai_tomarkdown_convert` | `/ai-tomarkdown-convert` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/ai/tomarkdown` |
| `cmd_ai_tomarkdown_supported` | `/ai-tomarkdown-supported` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/ai/tomarkdown/supported` |

## workflow

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_daily_summary` | `daily-summary` | `low` | `no` | `generate_daily_summary_email` |

## zero_trust

| id | slug | risk | approval | mapped_command |
|---|---|---|---|---|
| `cmd_zt_devices_list` | `/zt-devices-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/devices/physical-devices` |
| `cmd_zt_devices_get` | `/zt-device-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/devices/physical-devices/{device_id}` |
| `cmd_zt_devices_delete` | `/zt-device-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/devices/physical-devices/{device_id}` |
| `cmd_zt_devices_revoke` | `/zt-device-revoke` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/devices/physical-devices/{device_id}/revoke` |
| `cmd_zt_registrations_list` | `/zt-registrations-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/devices/registrations` |
| `cmd_zt_registration_get` | `/zt-registration-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/devices/registrations/{registration_id}` |
| `cmd_zt_registration_delete` | `/zt-registration-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/devices/registrations/{registration_id}` |
| `cmd_zt_registrations_revoke` | `/zt-registrations-revoke` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/devices/registrations/revoke` |
| `cmd_zt_registrations_unrevoke` | `/zt-registrations-unrevoke` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/devices/registrations/unrevoke` |
| `cmd_zt_warp_override_get` | `/zt-warp-override-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/devices/resilience/disconnect` |
| `cmd_zt_warp_override_set` | `/zt-warp-override-set` | `critical` | `yes` | `API_CALL: POST /accounts/{account_id}/devices/resilience/disconnect` |
| `cmd_zt_dex_tests_list` | `/zt-dex-tests-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/dex/devices/dex_tests` |
| `cmd_zt_dex_test_get` | `/zt-dex-test-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/dex/devices/dex_tests/{dex_test_id}` |
| `cmd_zt_dex_test_create` | `/zt-dex-test-create` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/dex/devices/dex_tests` |
| `cmd_zt_dex_test_update` | `/zt-dex-test-update` | `medium` | `yes` | `API_CALL: PUT /accounts/{account_id}/dex/devices/dex_tests/{dex_test_id}` |
| `cmd_zt_dex_test_delete` | `/zt-dex-test-delete` | `high` | `yes` | `API_CALL: DELETE /accounts/{account_id}/dex/devices/dex_tests/{dex_test_id}` |
| `cmd_zt_fleet_status_live` | `/zt-fleet-status-live` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/dex/devices/{device_id}/fleet-status/live` |
| `cmd_zt_default_policy_get` | `/zt-default-policy-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/devices/policy` |
| `cmd_zt_default_policy_update` | `/zt-default-policy-update` | `high` | `yes` | `API_CALL: PATCH /accounts/{account_id}/devices/policy` |
| `cmd_zt_policies_list` | `/zt-policies-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/devices/policies` |
| `cmd_zt_policy_get` | `/zt-policy-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/devices/policy/{policy_id}` |
| `cmd_zt_policy_create` | `/zt-policy-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/devices/policy` |
| `cmd_zt_policy_update` | `/zt-policy-update` | `high` | `yes` | `API_CALL: PATCH /accounts/{account_id}/devices/policy/{policy_id}` |
| `cmd_zt_policy_delete` | `/zt-policy-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/devices/policy/{policy_id}` |
| `cmd_zt_posture_list` | `/zt-posture-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/devices/posture` |
| `cmd_zt_posture_get` | `/zt-posture-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/devices/posture/{rule_id}` |
| `cmd_zt_posture_create` | `/zt-posture-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/devices/posture` |
| `cmd_zt_posture_update` | `/zt-posture-update` | `high` | `yes` | `API_CALL: PUT /accounts/{account_id}/devices/posture/{rule_id}` |
| `cmd_zt_posture_delete` | `/zt-posture-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/devices/posture/{rule_id}` |
| `cmd_zt_idp_list` | `/zt-idp-list` | `low` | `no` | `API_CALL: GET /{accounts_or_zones}/{account_or_zone_id}/access/identity_providers` |
| `cmd_zt_idp_create` | `/zt-idp-create` | `high` | `yes` | `API_CALL: POST /{accounts_or_zones}/{account_or_zone_id}/access/identity_providers` |
| `cmd_zt_idp_update` | `/zt-idp-update` | `high` | `yes` | `API_CALL: PUT /{accounts_or_zones}/{account_or_zone_id}/access/identity_providers/{identity_provider_id}` |
| `cmd_zt_idp_delete` | `/zt-idp-delete` | `critical` | `yes` | `API_CALL: DELETE /{accounts_or_zones}/{account_or_zone_id}/access/identity_providers/{identity_provider_id}` |
| `cmd_zt_org_get` | `/zt-org-get` | `low` | `no` | `API_CALL: GET /{accounts_or_zones}/{account_or_zone_id}/access/organizations` |
| `cmd_zt_org_update` | `/zt-org-update` | `high` | `yes` | `API_CALL: PUT /{accounts_or_zones}/{account_or_zone_id}/access/organizations` |
| `cmd_zt_org_revoke_user` | `/zt-org-revoke-user` | `high` | `yes` | `API_CALL: POST /{accounts_or_zones}/{account_or_zone_id}/access/organizations/revoke_user` |
| `cmd_zt_access_apps_list` | `/zt-access-apps-list` | `low` | `no` | `API_CALL: GET /{accounts_or_zones}/{account_or_zone_id}/access/apps` |
| `cmd_zt_access_app_get` | `/zt-access-app-get` | `low` | `no` | `API_CALL: GET /{accounts_or_zones}/{account_or_zone_id}/access/apps/{app_id}` |
| `cmd_zt_access_app_create` | `/zt-access-app-create` | `high` | `yes` | `API_CALL: POST /{accounts_or_zones}/{account_or_zone_id}/access/apps` |
| `cmd_zt_access_app_update` | `/zt-access-app-update` | `high` | `yes` | `API_CALL: PUT /{accounts_or_zones}/{account_or_zone_id}/access/apps/{app_id}` |
| `cmd_zt_access_app_delete` | `/zt-access-app-delete` | `critical` | `yes` | `API_CALL: DELETE /{accounts_or_zones}/{account_or_zone_id}/access/apps/{app_id}` |
| `cmd_zt_access_app_revoke_tokens` | `/zt-access-app-revoke-tokens` | `high` | `yes` | `API_CALL: POST /{accounts_or_zones}/{account_or_zone_id}/access/apps/{app_id}/revoke_tokens` |
| `cmd_zt_mcp_portals_list` | `/zt-mcp-portals-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/access/ai-controls/mcp/portals` |
| `cmd_zt_mcp_portal_create` | `/zt-mcp-portal-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/access/ai-controls/mcp/portals` |
| `cmd_zt_mcp_portal_update` | `/zt-mcp-portal-update` | `high` | `yes` | `API_CALL: PUT /accounts/{account_id}/access/ai-controls/mcp/portals/{id}` |
| `cmd_zt_mcp_portal_delete` | `/zt-mcp-portal-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/access/ai-controls/mcp/portals/{id}` |
| `cmd_zt_mcp_servers_list` | `/zt-mcp-servers-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/access/ai-controls/mcp/servers` |
| `cmd_zt_mcp_server_create` | `/zt-mcp-server-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/access/ai-controls/mcp/servers` |
| `cmd_zt_mcp_server_sync` | `/zt-mcp-server-sync` | `medium` | `yes` | `API_CALL: POST /accounts/{account_id}/access/ai-controls/mcp/servers/{id}/sync` |
| `cmd_zt_tunnel_connections_list` | `/zt-tunnel-connections-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/cfd_tunnel/{tunnel_id}/connections` |
| `cmd_zt_tunnel_connections_cleanup` | `/zt-tunnel-connections-cleanup` | `high` | `yes` | `API_CALL: DELETE /accounts/{account_id}/cfd_tunnel/{tunnel_id}/connections` |
| `cmd_zt_tunnel_token_get` | `/zt-tunnel-token-get` | `high` | `yes` | `API_CALL: GET /accounts/{account_id}/cfd_tunnel/{tunnel_id}/token` |
| `cmd_zt_warp_connector_list` | `/zt-warp-connector-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/warp_connector` |
| `cmd_zt_warp_connector_create` | `/zt-warp-connector-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/warp_connector` |
| `cmd_zt_warp_connector_delete` | `/zt-warp-connector-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/warp_connector/{tunnel_id}` |
| `cmd_zt_dlp_datasets_list` | `/zt-dlp-datasets-list` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/dlp/datasets` |
| `cmd_zt_dlp_dataset_create` | `/zt-dlp-dataset-create` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/dlp/datasets` |
| `cmd_zt_dlp_dataset_delete` | `/zt-dlp-dataset-delete` | `critical` | `yes` | `API_CALL: DELETE /accounts/{account_id}/dlp/datasets/{dataset_id}` |
| `cmd_zt_dlp_settings_get` | `/zt-dlp-settings-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/dlp/settings` |
| `cmd_zt_dlp_settings_update` | `/zt-dlp-settings-update` | `high` | `yes` | `API_CALL: PATCH /accounts/{account_id}/dlp/settings` |
| `cmd_zt_dlp_patterns_validate` | `/zt-dlp-patterns-validate` | `low` | `no` | `API_CALL: POST /accounts/{account_id}/dlp/patterns/validate` |
| `cmd_zt_service_tokens_list` | `/zt-service-tokens-list` | `low` | `no` | `API_CALL: GET /{accounts_or_zones}/{account_or_zone_id}/access/service_tokens` |
| `cmd_zt_service_token_create` | `/zt-service-token-create` | `high` | `yes` | `API_CALL: POST /{accounts_or_zones}/{account_or_zone_id}/access/service_tokens` |
| `cmd_zt_service_token_rotate` | `/zt-service-token-rotate` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/access/service_tokens/{service_token_id}/rotate` |
| `cmd_zt_service_token_delete` | `/zt-service-token-delete` | `critical` | `yes` | `API_CALL: DELETE /{accounts_or_zones}/{account_or_zone_id}/access/service_tokens/{service_token_id}` |
| `cmd_zt_access_keys_get` | `/zt-access-keys-get` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/access/keys` |
| `cmd_zt_access_keys_rotate` | `/zt-access-keys-rotate` | `high` | `yes` | `API_CALL: POST /accounts/{account_id}/access/keys/rotate` |
| `cmd_zt_access_logs_requests` | `/zt-access-logs-requests` | `low` | `no` | `API_CALL: GET /accounts/{account_id}/access/logs/access_requests` |
