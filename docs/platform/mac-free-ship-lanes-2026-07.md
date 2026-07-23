# Mac-free ship lanes (LOCKED)

**Cursor rule (always on):** `.cursor/rules/iam-ship-lanes.mdc`  
**D1 rule:** `agentsam_rules_document.id = rule_mac_free_ship_lanes`  
**Scripts:** `scripts/ship-remote.sh` · `scripts/deploy-fast.sh` · `scripts/smart-build.mjs`

When the Mac is asleep or the agent is on GCP **`iam-tunnel`**, **do not** run `npm run deploy:full` (Vite + rclone OOMs the ~1GB box).

## Pick by host (decision table)

| You are on… | Run this | Do **not** run |
|-------------|----------|----------------|
| **Mac** (operator desk) | `npm run deploy:full` **or** `npm run deploy:fast` | bare `npm run deploy` for SPA/PWA |
| **GCP iam-tunnel** / phone / remote PTY | `npm run ship:remote` | `deploy:full`, `deploy:fast`, Vite, rclone |
| **Cloudflare Workers Builds** | Build: `node scripts/smart-build.mjs` · Deploy: `DEPLOY_FAST_SKIP_BUILD=1 npm run deploy:fast` | wrangler-per-file R2 × N |
| Emergency worker-only (any) | `npm run ship:remote -- --worker-only` | Expect dashboard/PWA unchanged |

## Lanes explained

| Lane | Host | Command | What ships |
|------|------|---------|------------|
| **Remote (default when Mac asleep)** | VM / phone / any git | `npm run ship:remote` | Push → CF Builds: Vite + R2 delta + wrangler (+ SW ingest if `PUSH_SERVICE_TOKEN`) |
| **Fast (operator)** | Mac or CI with RAM | `npm run deploy:fast` | Critical path only (no email/GCP/memory hooks) |
| **Full (operator)** | Mac preferred | `npm run deploy:full` | Fast path + blocking post-hooks |
| **Emergency worker** | VM | `npm run ship:remote -- --worker-only` | Wrangler only — SPA/PWA unchanged |

## Why Claude fails on the VM

Agents still see older rules that say “always `deploy:full`”. On `iam-tunnel` that:

1. Runs Vite (OOM / killed).
2. Or runs long rclone / wrangler-per-file R2 (timeout / crash).
3. Leaves production unchanged while the agent retries.

**Correct remote path:** commit → `npm run ship:remote` → wait for CF Builds → verify `https://inneranimalmedia.com/pwa-build-meta.json` (`git_sha`, `cache_bust`).

## Cloudflare Builds requirements

1. **Build command:** `node scripts/smart-build.mjs` (Vite + bump-cache; skips CMS vendor npm install)
2. **Deploy command (main):** `DEPLOY_FAST_SKIP_BUILD=1 npm run deploy:fast` (opt-in skip after smart-build; R2 delta via **CF API token** or S3 keys + wrangler — no zsh). Do **not** hardcode skip in `package.json`.
3. **Auth:** Builds injects `CLOUDFLARE_API_TOKEN`. Account id from `wrangler.production.toml` if unset. Optional: `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` Build secrets (S3 backend).
4. **PWA control plane:** set **`PUSH_SERVICE_TOKEN`** as a Build secret so `post-services-sw-manifest-ingest` runs (otherwise SW/`cache_bust` can drift).
5. **Deploy notify + Supabase ledger:** run `./scripts/cf-builds-sync-secrets.sh` once (from Mac with `.env.cloudflare`) so the main trigger has `INTERNAL_API_SECRET` / `AGENTSAM_BRIDGE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IAM_SUPABASE_WORKSPACE_ID`, `IAM_SUPABASE_USER_ID`. Without these, CF `deploy:fast` cannot fire push or write `agentsam_deploy_events`.
6. **Watch paths:** must **not** exclude `dashboard/**`
7. Sync triggers: `./scripts/cf-builds-sync.sh`

## npm scripts (package.json)

| Script | Role |
|--------|------|
| `ship:remote` | Mac-free ship — push → CF Builds |
| `deploy:fast` | Vite → R2 delta → wrangler (Mac/CI) |
| `deploy:fast:cf` | Alias of `deploy:fast` (no hardcoded skip). CF Builds passes `DEPLOY_FAST_SKIP_BUILD=1` only after smart-build |
| `deploy:full` | Full operator pipeline (Mac) |
| `r2:delta-sync` | Content-hash R2 dashboard sync only |

## Proof

```bash
curl -sS https://inneranimalmedia.com/pwa-build-meta.json | head -c 400
./scripts/deploy-trail-gate.sh "$(git rev-parse HEAD)"
```

Expect `git_sha` matching the commit you pushed **and** trail gate exit 0.

## Deploy trail law (LOCKED — 2026-07-22)

Every production lane that ships SPA/worker must complete a **blocking** trail:

1. `scripts/post-deploy-record.sh` — full-column `deployments` + `dashboard_versions` (3 active pages) + `agentsam_deployment_health`
2. `scripts/deploy-trail-gate.sh` — hard fail if any required column is null, `changed_files` is `[]`/missing, or ship trio incomplete

| Lane | Trail |
|------|-------|
| `deploy:fast` / `deploy:fast:cf` | blocking post-deploy-record → deploy-trail-gate (exit propagates) |
| `deploy:full` (`deploy-frontend.sh`) | same at end of pipeline |
| `ship:remote` | push → CF Builds runs smart-build + `DEPLOY_FAST_SKIP_BUILD=1 npm run deploy:fast` (gate on Builds) |

- `deployments.git_hash` / run_group / session_tag / version slug = **full 40-char** SHA only (`post-deploy-record.sh` hard-fails otherwise; `GIT_SHORT` abolished).
- `changed_files: []` = failure (no INSERT). Tip-commit resolve for shallow CF Builds.
- `SKIP_DEPLOY_RECORD=1` / `SKIP_DASHBOARD_VERSIONS=1` = **hard failure** unless `ALLOW_SKIP_DEPLOY_TRAIL=1` (logged via `notify-ops.mjs`).
- Worker-only / R2-only paths are **not** full ships and do not claim trail complete.

## Bloat / failures killed (2026-07-11)

| Waste / failure | Fix |
|-----------------|-----|
| wrangler CLI × N R2 puts (~5 min) | Parallel CF R2 REST / S3 |
| `with-cloudflare-env.sh` (zsh) | Direct `npx wrangler` on Builds |
| CMS vendor npm install (~19s) | Skipped on CI |
| Root `npm ci` only → `vite: not found` | `npm ci --prefix dashboard` in smart-build |
| Vite OOM ~2GB heap | `NODE_OPTIONS=--max-old-space-size=8192` |
| Fallback retry×3 on OOM + exit 0 | Bypass fallback; force non-zero exit |
| `deploy:fast` skipped SW ingest | Wired ingest; needs `PUSH_SERVICE_TOKEN` on Builds |
