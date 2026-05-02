# Runbook: Deploy Dashboard

**Last updated:** 2026-05-01  
**Owner:** Sam Primeaux  
**Estimated time:** 5–10 minutes

## When to use this

Use when promoting a dashboard build from the sandbox staging bucket to production: pull assets, push to prod R2, deploy the worker, verify, and confirm D1 rows.

## Prerequisites

- Wrangler authenticated: `./scripts/with-cloudflare-env.sh npx wrangler whoami`
- Repo root `.env.cloudflare` loaded (script sources it automatically) with `RESEND_API_KEY`, `INTERNAL_API_SECRET`, and Cloudflare API credentials as you normally use for Wrangler
- A fresh sandbox upload exists in `agent-sam-sandbox-cicd` (see `scripts/deploy-sandbox.sh` / CI) so `.deploy-manifest` and chunk files are current

## Step 1 — Verify sandbox manifest

```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 object get \
  agent-sam-sandbox-cicd/static/dashboard/agent/.deploy-manifest \
  --remote -c wrangler.production.toml --file /tmp/manifest
head -20 /tmp/manifest
```

Expected: non-empty list of asset filenames (JS, CSS, fonts, chunks). If this fails, upload a new sandbox build before promoting.

## Step 2 — Run promote

```bash
./scripts/promote-to-prod.sh
```

This script:

1. Pulls the dashboard bundle from source R2 (`agent-sam-sandbox-cicd` by default; override with `SOURCE_ASSETS_BUCKET`)
2. Pushes files to production R2 bucket `inneranimalmedia`
3. Deploys the `inneranimalmedia` worker using `-c wrangler.production.toml`
4. Runs an HTTP check against `https://inneranimalmedia.com/dashboard/agent` (override with `PROD_HEALTH_URL`; skip with `CICD_SKIP_HEALTH_CURL=1`)
5. Writes CI/CD related rows (via `scripts/lib/cicd-d1-log.sh` and related inserts)
6. Sends a Resend notification when the script completes successfully (see script tail)

## Step 3 — Verify

```bash
curl -s https://inneranimalmedia.com/dashboard/agent | grep -oE 'dashboard-v:[0-9]+|\?v=[0-9]+' | head -5
```

```bash
./scripts/with-cloudflare-env.sh npx wrangler deployments list \
  -c wrangler.production.toml | head -8
```

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command="SELECT id, status, cf_health_status, total_duration_ms, queued_at FROM cicd_runs ORDER BY queued_at DESC LIMIT 1"
```

## Step 4 — If health check fails

```bash
./scripts/with-cloudflare-env.sh npx wrangler tail \
  -c wrangler.production.toml --format pretty
```

Rollback to a previous Worker version if needed:

```bash
./scripts/with-cloudflare-env.sh npx wrangler rollback \
  -c wrangler.production.toml
```

## Step 5 — Worker-only deploy

When only server-side code changed and dashboard assets did not:

```bash
./scripts/promote-to-prod.sh --worker-only
```

## Notifications

Resend: `promote-to-prod.sh` sends an email via Resend when the promote script finishes successfully (subject/body include deploy metadata). On failure paths (early `exit`), notification behavior depends on where the script stopped; check terminal output and `cicd_*` logging.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Cannot fetch `.deploy-manifest` | No recent sandbox deploy | Run sandbox deploy / CI, then retry |
| Dashboard shows old bundle after promote | Browser cache | Hard reload; confirm new `dashboard-v` / `?v=` in HTML |
| Health check non-2xx | Origin or routing issue | Tail worker logs; confirm custom domain routes |
| Resend errors | Missing or invalid `RESEND_API_KEY` | Verify key in `.env.cloudflare` |
