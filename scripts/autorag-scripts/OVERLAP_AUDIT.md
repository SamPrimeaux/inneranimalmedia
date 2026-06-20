# agentsam_scripts overlap & stale audit

Generated: 2026-06-20T05:18:00.704490+00:00

## Summary

- Total registry rows: **384**
- Uploaded this run: **384**
- Already on autorag (skipped): **0**
- Inactive (`is_active=0`): **7**
- Notes flagged stale/risky: **4**

## Duplicate paths (same `path`, multiple slugs)

These are prime consolidation candidates — pick one canonical slug per path.

- `scripts/deploy/deploy-cf-builds-prod.sh` → `adeploy_cf_builds_prod`, `deploy_cf_builds`
- `scripts/deploy/deploy-sandbox.sh` → `adeploy_sandbox`, `deploy_sandbox`
- `scripts/deploy/d1-dump-deploy-metrics-last2.sh` → `d1_dump_deploy_metrics_last2`, `d1_dump_deploy_metrics_last2`

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

