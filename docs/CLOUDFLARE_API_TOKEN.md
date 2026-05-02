# Cloudflare API token (reliable MCP / API connection)

## Where it’s stored

- **File:** `.env.cloudflare` (repo root, **gitignored** — never commit).
- **Variables:** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and optionally `DEPLOY_HOOK_SECRET` (for deploy hooks; also set in Cloudflare Worker env).

## How it’s used

- **`npm run deploy`** — Runs via `./scripts/with-cloudflare-env.sh`, which sources `.env.cloudflare` so `wrangler deploy` and `post-deploy-record.sh` have the token.
- **`./agent-dashboard/deploy-to-r2.sh`** — Sources `.env.cloudflare` at the start so all `wrangler r2 object put` commands use the token.
- **`./scripts/post-deploy-record.sh`** — Sources `.env.cloudflare` when run standalone so D1 execute has the token.
- **Arbitrary wrangler / MCP:** Run any command with env loaded:
  ```bash
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --command "SELECT 1"
  ```
  Or in a terminal where you’ll run multiple commands:
  ```bash
  source .env.cloudflare
  npx wrangler ...
  ```

## Rolling the token after workflow

1. Cloudflare Dashboard → **My Profile** → **API Tokens** → create a new token (or edit/scoped as needed).
2. Replace `CLOUDFLARE_API_TOKEN` in `.env.cloudflare` with the new value.
3. No code changes needed; next deploy or R2 upload will use the new token.

## If the token was exposed

Replace it in `.env.cloudflare` and roll the token in the Cloudflare dashboard as above. All scripts and `npm run deploy` will use the updated value on the next run.

## Reset / verify API connectivity

If the API connection is lost (e.g. wrangler or MCP fails with auth errors like "Invalid access token [9109]"):

1. **Use a Cloudflare API token (not a Worker secret).** Create it at **Cloudflare Dashboard -> My Profile -> API Tokens** (not Workers -> Settings -> Secrets). The token must have permissions such as Account Read, Workers Scripts Edit, etc., so wrangler can deploy and access D1/R2.
2. **Set it locally** in one place:
   - **Preferred:** In the **repo root**, edit `.env.cloudflare` (create from `.env.cloudflare.example` if needed) and set:
     ```bash
     CLOUDFLARE_ACCOUNT_ID=ede6590ac0d2fb7daf155b35653457b2
     CLOUDFLARE_API_TOKEN=<paste your token here>
     ```
   - **Alternative:** In `~/.zshrc`: `export CLOUDFLARE_API_TOKEN=...` and `export CLOUDFLARE_ACCOUNT_ID=...`.
3. **Clear any stale wrangler login** (optional): Run `npx wrangler logout` so wrangler does not use an old cached token.
4. **Verify** (must run from **repo root** so the script finds `.env.cloudflare`):
   ```bash
   cd /path/to/march1st-inneranimalmedia
   ./scripts/verify-cloudflare-cli.sh
   ```
   Or manually:
   ```bash
   ./scripts/with-cloudflare-env.sh sh -c 'curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify | jq'
   ```
   You should see `"status": "active"`. If you see an error, the token is wrong or expired — create a new token in My Profile -> API Tokens and update `.env.cloudflare` again.
5. **Use the wrapper for all Cloudflare commands** so they see the same token:
   ```bash
   ./scripts/with-cloudflare-env.sh npx wrangler whoami
   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command "SELECT 1"
   ```
   Do **not** run `wrangler whoami` from your home directory without the wrapper — then wrangler may use a different or missing token.

## MCP / Cursor

Cloudflare MCP tools and API calls that use Wrangler or the Cloudflare API expect `CLOUDFLARE_API_TOKEN` in the **environment**. From this repo:

- Run commands in the repo root and have sourced `.env.cloudflare` in that shell, or
- Use `./scripts/with-cloudflare-env.sh <command>` so the token is loaded for that run.

---

## Last noted deployment (from D1)

As of 2026-03-03, the most recent row in `cloudflare_deployments` (worker `inneranimalmedia`):

- **deployment_id:** `AC8C8081-3259-4809-908A-AA0094A0CE70`
- **deployed_at:** 2026-03-03 03:41:55

Query again: `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --command "SELECT deployment_id, worker_name, deployed_at FROM cloudflare_deployments ORDER BY deployed_at DESC LIMIT 1"`

---

## Other secrets (Worker + local + GitHub)

- **DEPLOY_HOOK_SECRET** — Set in Cloudflare Worker env (Dashboard -> Workers -> inneranimalmedia -> Settings -> Variables and Secrets). Add the same value to `.env.cloudflare` so scripts that call deploy hooks can use it; `./scripts/with-cloudflare-env.sh` will expose it. For GitHub Actions, add as a repository secret (`DEPLOY_HOOK_SECRET`) so workflows can pass it when calling deploy or post-deploy endpoints.
- **INTERNAL_API_SECRET** — Used by `POST /api/internal/post-deploy`. Set via `wrangler secret put INTERNAL_API_SECRET` (or Worker Dashboard). Optional in `.env.cloudflare` if you call that endpoint from scripts.

