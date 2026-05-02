# Production deploy checklist (Inner Animal Media / `inneranimalmedia` worker)

Use this before any production deploy. Do not skip steps; Sam must type **deploy approved** before commands that ship to Cloudflare.

## 1. Preconditions

- [ ] Scope is explicit (which files may change; no scope creep).
- [ ] **OAuth:** Do not modify `handleGoogleOAuthCallback` or `handleGitHubOAuthCallback` in `worker.js` without line-by-line approval.
- [ ] **Locked config:** Do not change `wrangler.production.toml` without Sam confirming.
- [ ] **MCP worker:** Only deploy from `inneranimalmedia-mcp-server/` with `npx wrangler deploy -c wrangler.toml` (never bare `wrangler deploy` at repo root).

## 2. D1 / schema (when migrations exist)

- [ ] Run any new SQL on the correct D1 database (e.g. `migrations/167_worker_analytics_errors.sql` for `worker_analytics_errors`).
- [ ] Confirm no forbidden resource creation (new Workers, D1, R2, secrets) without explicit Sam approval.

## 3. Dashboard HTML served from R2

If you changed anything under `dashboard/` that is served as `static/dashboard/*.html` on **agent-sam**:

- [ ] For each changed file:  
  `./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/<file>.html --file=dashboard/<file>.html --content-type=text/html --remote -c wrangler.production.toml`

## 4. Agent dashboard Vite bundle (when `agent-dashboard/src` changed)

- [ ] `npm run build --prefix agent-dashboard` (or project’s canonical build command).
- [ ] Upload built `agent-dashboard.js` / `agent-dashboard.css` to R2 at the keys your shell uses (see prior session logs; often `agent-sam/static/dashboard/agent/`). **Do not** overwrite `agent-dashboard.js` except from Vite output per project rules.

## 5. Main worker

- [ ] Deploy only with: `./scripts/with-cloudflare-env.sh` + project’s **`npm run deploy`** (not bare `wrangler deploy` at root unless that is explicitly your canonical script).
- [ ] Optional: set `TRIGGERED_BY=agent` and `DEPLOYMENT_NOTES` when using deploy scripts that record to D1.

## 6. After deploy

- [ ] Note Worker version ID if needed for support.
- [ ] Append `docs/cursor-session-log.md` (files, lines, deploy status).
- [ ] Smoke-test: login, `/dashboard/agent`, one API you touched.

## 7. Explicitly forbidden without approval

- New Cloudflare Workers, D1 databases, R2 buckets.
- `wrangler secret put` or changing secrets.
- Deploying workers other than **`inneranimalmedia`** or **`inneranimalmedia-mcp-server`**.

## References

- `.cursorrules` — deploy and MCP paths.
- `docs/LOCATIONS_AND_DEPLOY_AUDIT.md` — R2 keys and source layout.
- `.cursor/rules/dashboard-r2-before-deploy.mdc` — dashboard HTML + R2 before worker deploy.
