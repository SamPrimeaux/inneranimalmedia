# Deploy runbook (Inner Animal Media)

All commands assume repo root: `march1st-inneranimalmedia/`. Load Cloudflare credentials via `./scripts/with-cloudflare-env.sh` (reads `.env.cloudflare` / `HOME/IAM_SECRETS.env` as used elsewhere in this repo).

## Production worker (inneranimalmedia)

**Canonical command:**

```bash
./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml
```

**Do not** run bare `npx wrangler deploy` at repo root (picks wrong config).

**npm alias (same):**

```bash
npm run deploy
```

### Deploy with timing + D1 `deployments` row

`./scripts/deploy-with-record.sh` (default): bumps `dashboard/agent.html` `?v=`, uploads agent dashboard JS/CSS/HTML to **agent-sam**, optional incremental `docs/**/*.md` to `agent-sam/source/`, uploads `worker.js` + sources, runs wrangler deploy, then `./scripts/post-deploy-record.sh` with `DEPLOY_SECONDS` and `CLOUDFLARE_VERSION_ID` parsed from wrangler output.

**Worker-only (no dashboard bump / no agent R2):**

```bash
TRIGGERED_BY=agent DEPLOYMENT_NOTES='description' ./scripts/deploy-with-record.sh --worker-only --skip-docs
```

### Post-deploy D1 insert only

After a **manual** wrangler deploy, record the worker version ID from the CLI output (`Current Version ID: ...`) and run:

```bash
export CLOUDFLARE_VERSION_ID='<uuid-from-wrangler-output>'
export DEPLOY_SECONDS='<seconds>'
export TRIGGERED_BY='docs-bucket-screenshot-routing'
export DEPLOYMENT_NOTES='DOCS_BUCKET=iam-docs, AUTORAG_BUCKET=autorag, screenshots on docs host'
./scripts/post-deploy-record.sh
```

`post-deploy-record.sh` executes:

`wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --command "INSERT INTO deployments (...)"`

Verify in Overview or: `SELECT * FROM deployments ORDER BY datetime(timestamp) DESC LIMIT 5`.

### D1 verification

- Wrangler prints `last_row_id` after `d1 execute` when rows are written.
- `deployments.id` should match **Cloudflare Worker version ID** when `CLOUDFLARE_VERSION_ID` is exported before `post-deploy-record.sh`.

## Asset-only deploy (dashboard HTML/JS/CSS to R2)

If you change files under `dashboard/` that are served from R2, upload **before** the next worker deploy so production does not serve stale HTML.

**Example (auth page):**

```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/auth-signin.html \
  --file=dashboard/auth-signin.html --content-type=text/html --remote -c wrangler.production.toml
```

**Agent dashboard (when not using deploy-with-record):** keys under `agent-sam/static/dashboard/agent/` and `agent-sam/static/dashboard/agent.html` per `scripts/deploy-with-record.sh`.

## Cache bust (`?v=`)

- `dashboard/agent.html` references `/static/dashboard/agent/agent-dashboard.js?v=N` and `.css?v=N`.
- `deploy-with-record.sh` increments **N** automatically before R2 upload.
- D1 table `dashboard_versions` logs hashes/sizes per deploy when using that script.

## Sandbox worker (inneranimal-dashboard)

**Canonical:**

```bash
npm run deploy:sandbox
```

Which runs: `npx wrangler deploy ./worker.js -c ./wrangler.jsonc` (explicit entry + config — required for Workers Builds; see `docs/SANDBOX_WORKERS_BUILDS.md`).

With env wrapper:

```bash
./scripts/with-cloudflare-env.sh npx wrangler deploy ./worker.js -c wrangler.jsonc
```

Sandbox uses R2 bucket `agent-sam-sandbox-cicd` for ASSETS/DASHBOARD per `wrangler.jsonc` comments.

## Tail logs

- **Wrangler:** `npx wrangler tail inneranimalmedia -c wrangler.production.toml` (with env as needed).
- **Dashboard:** Cloudflare Workers observability for `inneranimalmedia` (logs/traces enabled in `wrangler.production.toml`).

## Rollback

Use Wrangler versions API:

```bash
./scripts/with-cloudflare-env.sh npx wrangler rollback -c wrangler.production.toml
```

Or deploy a known-good git revision after `git checkout <sha>` and run production deploy.

## Baseline references (git — verify with `git log` / `grep ?v=`)

- **Agent HTML cache bust:** `dashboard/agent.html` — search `?v=` (e.g. v136 in repo at time of `docs/iam-docs` authoring).
- **Git HEAD (example):** run `git rev-parse --short HEAD` for current short hash; worker version IDs come from wrangler output per deploy, not from git alone.
- **Documented worker version (AI Search URL fix):** `a0e5a6f7-1455-41a5-a268-71107e6f05e5` per `docs/autorag-knowledge/sessions/2026-03-23-session-summary.md` (historical; newer deploys supersede).
