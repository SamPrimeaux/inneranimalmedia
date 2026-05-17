# Dashboard R2 Asset Deploy Tactics

## Incident pattern

The Worker can be healthy while the dashboard is broken.

A dashboard blank screen with JavaScript bundle 404s does not mean the Worker is down. During this incident, `/health` returned HTTP 200 the whole time. The dashboard failed because R2 did not contain the JavaScript bundles referenced by the dashboard HTML.

## Root cause

`git push origin main` triggers Cloudflare Builds for the Worker. That updates Worker/API code, but it does not necessarily upload `dashboard/dist` assets to R2.

This creates a split-brain deployment:

- Worker/API: healthy
- HTML shell: may reference new JS/CSS chunks
- R2 static assets: missing or stale
- Browser result: blank dashboard and console 404s for bundles such as `vendor-react.js`, `agent-core.js`, and other Vite chunks

## Diagnostic rule

If `/health` is 200 but `/dashboard/*` is blank, check browser console and Network tab for missing dashboard chunks.

Common symptom:

```text
/static/dashboard/app/vendor-react.js 404
/static/dashboard/app/agent-core.js 404
/static/dashboard/app/*.js 404
```

This means the fix is frontend asset deployment, not Worker rollback.

## Correct fix

From repo root:

```bash
cd /Users/samprimeaux/inneranimalmedia
npm run deploy:frontend
```

This pipeline runs:

1. `npm run build:vite-only`
2. `node scripts/bump-cache.js`
3. R2 sync to `inneranimalmedia` bucket under `static/dashboard/app/`
4. Worker deploy using `wrangler.production.toml`

After it completes, hard refresh the dashboard (`Cmd+Shift+R`), then reload:

`https://inneranimalmedia.com/dashboard/overview`

## Deploy command meanings

| Command | What it does | When to use |
|---------|--------------|-------------|
| `npm run deploy:frontend` | Vite build, cache bump, R2 sync, Worker deploy | Dashboard/UI broken or any frontend change |
| `npm run deploy` | Worker/API deploy only, no R2 dashboard assets | Backend-only changes with no dashboard asset changes |
| `npm run deploy:full` | Route map, D1 memory ingest, docs ingest, frontend deploy, codebase index, eval, hooks | Default full production ship after meaningful releases |
| `./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml` | Raw Worker deploy only | Emergency Worker-only deploy |

## Rule of thumb after `git push main`

If the change is Worker/backend only, Cloudflare Builds may be enough. Confirm `/health`.

If the dashboard is blank or JS/CSS chunks return 404, run:

```bash
npm run deploy:frontend
```

If the release includes meaningful frontend, docs, routing, memory, or index changes, prefer:

```bash
npm run deploy:full
```

## Agent Sam operational takeaway

Agent Sam should not treat `/health = 200` as proof that the dashboard is healthy.

Dashboard health requires:

1. Worker `/health` returns 200
2. Dashboard HTML loads
3. Referenced Vite JS/CSS assets exist in R2
4. Core bundles return HTTP 200
5. Browser console has no module-load 404s

When dashboard chunk 404s are detected, Agent Sam should recommend or run the frontend deployment path, not a Worker-only deploy.

## Future automation

`scripts/verify_dashboard_asset_integrity.py` (planned):

- Fetch `/dashboard/overview` HTML
- Extract JS/CSS asset URLs
- HEAD/GET each asset
- Fail if any return 404
- Recommend `npm run deploy:frontend`
