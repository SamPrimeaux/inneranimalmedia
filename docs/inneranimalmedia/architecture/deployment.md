# Deployment architecture

## Cloudflare Builds (production branch)

- Deploy command: `bash scripts/deploy-cf-builds-prod.sh`
- Worker: `npx wrangler deploy -c wrangler.jsonc`
- Vite build + sync to R2 `inneranimalmedia` under `dashboard/app/`

## Promote / sandbox

- Sandbox and promote scripts in `scripts/`; follow `AGENTS.md` and `.cursorrules` (no ad-hoc prod deploy without approval).

## Verification

- After deploy, load primary dashboard URL and confirm asset version query params if used.
