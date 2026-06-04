# agentsam_scripts overlap & stale audit

Generated: 2026-06-04T19:04:29.975658+00:00

## Summary

- Total registry rows: **373**
- Uploaded this run: **343**
- Already on autorag (skipped): **30**
- Inactive (`is_active=0`): **6**
- Notes flagged stale/risky: **4**

## Duplicate paths (same `path`, multiple slugs)

These are prime consolidation candidates — pick one canonical slug per path.

- `scripts/dev-deploy.sh` → `dev-deploy-auto`, `dev-deploy-front`, `dev-deploy-full`, `dev-deploy-worker`, `pty-health`
- `scripts/verify-cloudflare-cli.sh` → `r2_verify`, `verify_cf_cli`, `wf_r2_verify_bindings`
- `scripts/benchmark-providers.sh` → `abenchmark_providers`, `benchmark`
- `scripts/deploy/deploy-cf-builds-prod.sh` → `adeploy_cf_builds_prod`, `deploy_cf_builds`
- `package.json` → `build-vite-only`, `wrangler-tail`
- `scripts/cms/theme-r2-upload.sh` → `cms_theme_r2_upload`, `wf_cms_live_editor_r2`
- `scripts/sync-scripts-to-r2.sh` → `r2_sync_scripts`, `r2_sync_skills`
- `scripts/upload-frontend-prod.sh` → `r2_upload_frontend`, `upload_frontend`
- `npm run deploy` → `script_connor_deploy_worker`, `script_learning_os_worker_deploy`

## Deploy slug clusters (likely overlap)

- **deploy**: `deploy`, `deploy_frontend`, `deploy_full`, `npm_deploy`, `npm_deploy_full`
- **deploy_cf_builds**: `adeploy_cf_builds`, `adeploy_cf_builds_prod`, `deploy_cf_builds`
- **deploy_sandbox**: `adeploy_sandbox`, `deploy_sandbox`
- **d1_dump_deploy_metrics_last2**: `d1_dump_deploy_metrics_last2`, `d1_dump_deploy_metrics_last2`
- **connor_deploy**: `script_connor_deploy_full`, `script_connor_deploy_worker`

## Stale / quality-flagged (from notes)

- `agentsam_e2e_build_deploy`
- `deploy_cf_builds`
- `deploy_cms_editor_live`
- `r2_upload_assets`

## Recommended keep (tier-1 canonical — already on autorag)

- `deploy_gate`
- `deploy_full`
- `deploy_frontend`
- `deploy_with_record`
- `with_cloudflare_env`
- `d1_apply_pending`
- `guard_no_hardcoded_identity`
- `verify_supabase_pg`
- `d1_bloat_audit`
- `upload_agentsam_scripts_r2`

## Likely trash / archive candidates

- `adeploy_cf_builds` — duplicate dev/legacy deploy alias
- `adeploy_cf_builds_prod` — duplicate dev/legacy deploy alias
- `adeploy_sandbox` — duplicate dev/legacy deploy alias
- `dev-deploy-auto` — duplicate dev/legacy deploy alias
- `dev-deploy-front` — duplicate dev/legacy deploy alias
- `dev-deploy-full` — duplicate dev/legacy deploy alias
- `dev-deploy-worker` — duplicate dev/legacy deploy alias
- `scr_e2e_20260514072852` — duplicate dev/legacy deploy alias
- `script_connor_build` — duplicate dev/legacy deploy alias
- `script_connor_deploy_full` — duplicate dev/legacy deploy alias
- `script_connor_deploy_worker` — duplicate dev/legacy deploy alias
- `script_connor_github_actions_deploy` — duplicate dev/legacy deploy alias
- `script_connor_r2_publish` — duplicate dev/legacy deploy alias

## Largest D1 bodies moved this run

- `iam_agentsam_audit` — 68,778 bytes
- `agentsam_full_mirrored_eval_series` — 49,871 bytes
- `agentsam_benchmark_v3` — 49,274 bytes
- `agentsam_execution_fabric_designer` — 48,597 bytes
- `agentsam_command_workflow_designer` — 44,044 bytes
- `agentsam_true_e2e_workflow_runner` — 43,091 bytes
- `agentsam_mcp_tool_e2e_sprint` — 41,850 bytes
- `seed_real_agentsam_workflows` — 41,188 bytes
- `agentsam_e2e_workflow_runner` — 40,116 bytes
- `agentsam_planner_challenge` — 39,773 bytes
- `agentsam_benchmark_flood_v2` — 39,302 bytes
- `smoke_todo_fix` — 38,211 bytes
- `cicd_d1_log` — 37,073 bytes
- `d1_schema_audit` — 36,894 bytes
- `agentsam_route_tool_alignment_e2e` — 36,711 bytes
- `smoke_agentsam_latency` — 36,146 bytes
- `iam_cms_agentsam_structure_audit` — 33,379 bytes
- `agentsam_workflows_frontend_runtime_planner` — 33,031 bytes
- `agentsam_capability_fabric_planner` — 32,717 bytes
- `agentsam_agent_chat_plan_workflow` — 31,685 bytes
