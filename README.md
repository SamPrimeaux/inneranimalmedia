# Inner Animal Media

This is the canonical Inner Animal Media platform repo. It contains the Cloudflare Worker/API layer, the Dashboard Vite app, deploy scripts, migrations, and operational docs for Agent Sam / InnerAnimalMedia.

## Current Architecture

- `src/index.js` is the production Worker entrypoint via `wrangler.production.toml`.
- `src/` is the modular Worker/API source.
- `dashboard/` is the canonical Vite dashboard app.
- `dashboard/components/` is the dashboard React component source of truth.
- `worker.js` is still present as a legacy fallback only.
- Worker bundle/upload remains large until `src/index.js` no longer imports `worker.js`.
- Public marketing pages are served from R2 ASSETS, generally under `pages/*`.
- Public shared header/footer live in R2 at:
  - `src/components/iam-header.html`
  - `src/components/iam-footer.html`
  
  Mirror these down locally before editing; deploy paths depend on R2 layout.

| Path | Purpose | Notes |
|------|---------|--------|
| `src/` | Modular Worker/API implementation | Domain handlers, durable-object wiring, core utilities |
| `src/index.js` | Production Worker `fetch` / scheduled entry | Imports modular routers; may delegate to legacy worker |
| `src/api/` | HTTP route handlers by domain | OAuth, agent, settings, integrations, etc. |
| `src/core/` | Shared Worker internals | Auth/session helpers, crypto, legacy annotations |
| `worker.js` | Legacy monolithic Worker | Fallback until modular parity is complete |
| `dashboard/` | Canonical Vite dashboard app | Primary frontend source |
| `dashboard/components/` | Dashboard React components | Source of truth for UI composition |
| `dashboard/dist/` | Vite build output | Generated; do not commit |
| `scripts/` | Deploy, ingest, smoke, and ops scripts | Includes `with-cloudflare-env.sh` |
| `docs/` | Operational and migration docs | Includes OAuth parity map |
| `db/` | Database-related artifacts | Schema notes / helpers as used by the project |
| `migrations/` | D1 SQL migrations | Apply per project runbooks |
| `wrangler.production.toml` | Production Worker config | Bindings, routes, compatibility date |

## Source of Truth Rules

- Use this repo only: `SamPrimeaux/inneranimalmedia`.
- Use local root only: `/Users/samprimeaux/Downloads/inneranimalmedia`.
- Dashboard work happens in `dashboard/`, not `agent-dashboard`.
- Dashboard React components live in `dashboard/components/`.
- Do not treat R2 `dashboard/source/components/` as canonical; it is a mirror/reference.
- Do not recreate `agent-dashboard`.
- Do not delete `worker.js` until no `legacyWorker.fetch` or `legacyWorker.queue` calls remain.
- Do not commit `.env.cloudflare`, `.dev.vars`, secrets, `node_modules`, `.wrangler`, or `dashboard/dist`.

Do not use these as canonical paths or roots:

- `agent-dashboard/`
- `inneranimalmedia-agentsam-dashboard/`
- `inneranimalmedia-main-repo/`
- `gorilla-mode/`
- `source/components/README`

## Common Commands

Install root deps:

```bash
npm install
```

Install dashboard deps:

```bash
npm --prefix dashboard install
```

Build dashboard from root:

```bash
npm run build:vite-only
```

Run dashboard dev:

```bash
npm run dev:dashboard
```

Preview dashboard:

```bash
npm run preview:dashboard
```

Analyze dashboard bundle:

```bash
cd dashboard
npm run build:analyze
open dist/bundle-stats.html
```

Use `NODE_ENV=development` when installing dashboard deps if your shell forces production mode (otherwise devDependencies such as Vite may be skipped).

### Production deploy (canonical)

Pick the smallest command that matches what you changed. **Wrong choice wastes time:** frontend edits not uploaded to R2 look “deployed” locally but users still see the old bundle.

| Command | When to use |
|---------|-------------|
| `npm run deploy:full` | **Anything under `dashboard/`** (Vite build → R2 upload `static/dashboard/agent/*` → Worker deploy via `scripts/deploy-frontend.sh`). This is the default for UI work. |
| `npm run deploy` | **Worker/API only** — changes under `src/`, `worker.js`, or backend-only assets. **No** dashboard build or R2 static sync. |
| `npm run deploy:ingest` | Regenerate route map + D1 schema doc + doc/memory ingest, then Worker deploy. Not a substitute for `deploy:full` when you only changed React/CSS. |

Equivalent Wrangler one-liner for worker-only (same as `npm run deploy`):

```bash
./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml
```

`deploy:full` loads `.env.cloudflare` when present, runs `npm run build:vite-only`, uploads `dashboard/dist` to bucket `inneranimalmedia`, deploys with `wrangler.production.toml`, writes a build manifest under `analytics/app-builds/`, and may notify via email if configured.

**GitHub:** pushing to `main` triggers your connected Cloudflare / CI deploy; still run **`deploy:full`** locally when you need the dashboard bundle on R2 immediately or outside that pipeline.

A separate **Cloudflare Workers Builds** path may call `scripts/deploy-cf-builds-prod.sh` (different Wrangler config / branch). Do not confuse it with `npm run deploy:full` above.

If terminal PATH breaks, use absolute system tools:

| Tool |
|------|
| `/usr/bin/git` |
| `/usr/bin/curl` |
| `/usr/bin/grep` |
| `/bin/date` |
| `/bin/zsh` |

## Environment and Secrets

- `.env.cloudflare` is local-only.
- Never commit real Cloudflare tokens or secrets.
- `with-cloudflare-env.sh` is used to load deployment environment for Wrangler and related scripts.
- Worker secrets should be managed via Wrangler/Cloudflare, not README copy-paste.
- PTY/terminal auth keys must stay aligned across:
  - `iam-pty`
  - `inneranimalmedia`
  - `inneranimalmedia-mcp-server`

## Worker Modularization Status

### Current verified modular routes

| Route | Notes |
|-------|--------|
| `/api/health` | |
| `/auth/login` | |
| `/auth/signup` | |
| `/auth/reset` | |
| `/auth/nope` | Returns modular 404 |
| `/api/oauth/google/start` | |
| `/api/oauth/github/start` | |
| `/auth/callback/google` | Missing-state path |
| `/auth/callback/github` | Missing-state path |
| `/api/oauth/google/callback` | Missing-state path |
| `/api/oauth/github/callback` | Missing-state path |

### OAuth status

- OAuth start routes are modular and verified with no `X-IAM-Legacy-*` headers.
- OAuth callback missing-state routes are modular and verified with no `X-IAM-Legacy-*` headers.
- Real browser Google/GitHub login parity still needs final validation before removing fallback safety.

### Remaining legacy surface

- Real OAuth browser callback parity needs validation.
- Generic `/api/*` legacy fallback remains.
- `queue(batch, env, ctx)` still calls `legacyWorker.queue`.
- `import legacyWorker from '../worker.js'` remains until all calls are gone.

### Retirement order

1. Run real browser Google/GitHub login tests.
2. Confirm session/cookie/KV/DB/token parity.
3. Audit and remove generic `/api/*` legacy fallback.
4. Move queue handling into modular `src/`.
5. Remove `import legacyWorker from '../worker.js'`.
6. Archive/delete `worker.js` from the deploy graph only after bundle/build/deploy passes.

## OAuth Migration Notes

Parity reference: `docs/oauth-callback-parity-map.md`

- Start from §5 Modular conflicts and §3–4 behavior tables if OAuth work resumes.

**Google callback routes**

- `/api/oauth/google/callback`
- `/auth/callback/google`
- State key: `oauth_state_<state>`

**GitHub callback routes**

- `/api/oauth/github/callback`
- `/auth/callback/github`
- Login state key: `oauth_state_github_<state>`
- Integration state key: `oauth_state_<state>`

**Preserve**

- `auth_users`, `auth_sessions`, `SESSION_CACHE`
- `provisionNewUser`, `resolveTenantAtLogin`, `writeIamSessionToKv`
- `user_oauth_tokens`
- Google `connectDrive`, GitHub `connectGitHub`, GitHub `autoStartWorkSession`
- Redirects, cookies, error behavior

## Dashboard Bundle Notes

- The dashboard bundle is currently large.
- Analyzer output: `dashboard/dist/bundle-stats.html`
- Do not lazy-load blindly: open the treemap and identify top contributors first.

Likely candidates to inspect:

- Monaco
- Excalidraw
- Mermaid / Cytoscape / Wardley
- KaTeX
- GLB / 3D tools
- DesignStudio
- Finance
- Learn modules

## R2 and Public Pages

- Public routes are served through Worker + R2 ASSETS.
- Sitemap, terms, privacy, home, work, about, services, contact, pricing, games live under `pages/*` in R2.
- Shared public header/footer are injected from R2 components:
  - `src/components/iam-header.html`
  - `src/components/iam-footer.html`
- Light-top pages can use the `iam-light-header` / forced light header behavior.

## Database / Memory Notes

Relevant D1 tables for project memory and launch tracking:

| Table |
|-------|
| `agentsam_todo` |
| `agentsam_bootstrap` |
| `agentsam_workspace` |
| `agentsam_workspace_state` |
| `agentsam_code_index_job` |
| `launch_tracker` |
| `launch_milestones` |
| `project_memory` |
| `plan_checklist_items` |

| Field | Value |
|-------|--------|
| Current tracker | `launch_inneranimalmedia_saas_2026` |
| Current major launch milestone set | OAuth callbacks; Remove generic API catchall; Modular queue handler; Remove legacyWorker import / archive worker.js |
| Current project id | `inneranimalmedia` |
| Current tenant id | `tenant_sam_primeaux` |

## Verification Commands

### Auth shell checks

```bash
for path in /auth/login /auth/signup /auth/reset /auth/nope; do
  echo ""
  echo "== $path =="
  /usr/bin/curl -sD - -o /tmp/iam-auth-check.html "https://inneranimalmedia.meauxbility.workers.dev${path}?v=$(/bin/date +%s)" \
    | /usr/bin/grep -Ei 'http/|content-type|x-iam-route-source|x-iam-legacy' || true
done
```

### OAuth start checks

```bash
/usr/bin/curl -sD - -o /tmp/iam-google-start.html \
  "https://inneranimalmedia.com/api/oauth/google/start?v=$(/bin/date +%s)" \
  | /usr/bin/grep -Ei 'http/|location|x-iam-route-source|x-iam-legacy|content-type' || true

/usr/bin/curl -sD - -o /tmp/iam-github-start.html \
  "https://inneranimalmedia.com/api/oauth/github/start?v=$(/bin/date +%s)" \
  | /usr/bin/grep -Ei 'http/|location|x-iam-route-source|x-iam-legacy|content-type' || true
```

### OAuth callback missing-state checks

```bash
for path in /auth/callback/google /auth/callback/github /api/oauth/google/callback /api/oauth/github/callback; do
  echo ""
  echo "== $path =="
  /usr/bin/curl -sD - -o /tmp/iam-callback-check.html \
    "https://inneranimalmedia.meauxbility.workers.dev${path}?v=$(/bin/date +%s)" \
    | /usr/bin/grep -Ei 'http/|location|content-type|x-iam-route-source|x-iam-legacy' || true
done
```

**Expected**

- No `X-IAM-Legacy-*` headers on verified modular routes.
- Missing callback routes redirect to `/auth/login?error=missing`.

## Current Next Steps

- [ ] Run real browser Google OAuth login test.
- [ ] Run real browser GitHub OAuth login test.
- [ ] Confirm callback DB/KV/session/token parity.
- [ ] Confirm GitHub login `oauth_state_github_*` vs integration `oauth_state_*` dispatch.
- [ ] Mark OAuth callback milestone complete after browser parity passes.
- [ ] Audit generic `/api/*` legacy fallback.
- [ ] Replace `legacyWorker.queue`.
- [ ] Remove `legacyWorker` import.
- [ ] Rebuild/deploy and confirm Worker upload size drops.
- [ ] Open `dashboard/dist/bundle-stats.html` and document top 10 bundle contributors before lazy-load refactors.

## Contributing / Safety Rules

- Do not commit secrets.
- Do not force-push over working production history without explicit approval.
- Do not delete `worker.js` until the legacy import is gone and deploy passes.
- Do not rename dashboard paths.
- Prefer small, verifiable commits.
- Every Worker migration should include route/header verification.
- Every dashboard bundle optimization should include before/after build numbers.

After editing this README, sanity-read the markdown, then commit and push:

```bash
git add README.md
git commit -m "docs: update canonical repo operating plan"
git push origin main
```

---

**Cursor one-liner:** Update `README.md` into a practical operating plan for the canonical Inner Animal Media repo. Use `/Users/samprimeaux/Downloads/inneranimalmedia` as root, `dashboard/` as the Vite app, `src/index.js` as Worker entry, `worker.js` as legacy fallback only, and document current OAuth modularization status, remaining legacy retirement order, commands, source-of-truth rules, D1/memory tables, R2 public page structure, verification curls, and next checklist. Do not mention obsolete `agent-dashboard` paths except in “do not use” warnings.
