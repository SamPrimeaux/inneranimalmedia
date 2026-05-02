# Locations & Deploy Audit (up to date)

**Generated:** 2026-03-08  
**Purpose:** Single reference for all worker/dashboard source locations, R2 keys, and production build/deploy scripts.

---

# DEPLOY & SOURCE ARCHITECTURE — LOCKED. DO NOT DEVIATE.

## PULL worker source

```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 object get \
  agent-sam/source/worker-source.js \
  --remote --file /tmp/worker-source.js -c wrangler.production.toml
```

## PUSH worker source

```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 object put \
  agent-sam/source/worker-source.js \
  --file /tmp/worker-source.js \
  --content-type=application/javascript --remote -c wrangler.production.toml
```

## DEPLOY (after copying `/tmp/worker-source.js` → `worker.js` in repo root)

```bash
npm run deploy
```

## UPLOAD single dashboard HTML

```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 object put \
  agent-sam/static/dashboard/<file>.html \
  --file=dashboard/<file>.html \
  --content-type=text/html --remote -c wrangler.production.toml
```

## RULES

- **NEVER** use `wrangler deploy` directly — always `npm run deploy`
- **NEVER** skip `./scripts/with-cloudflare-env.sh` — it loads the API token
- **NEVER** edit **iam-platform** for worker or dashboard — that bucket is memory/logs only
- **ALWAYS** upload dashboard files to R2 **before** running `npm run deploy`
- The R2 copy (`agent-sam/source/worker-source.js`) is **backup only** — repo root `worker.js` is what deploys

---

## 1. Worker source code

| Location | Type | Path / Key | Notes |
|----------|------|-------------|--------|
| **Repo (deployed)** | File | `worker.js` (repo root) | Entry point for production. Wrangler bundles this; `main` in `wrangler.production.toml`. |
| **R2 remote copy** | R2 object | **Bucket:** `agent-sam` · **Key:** `source/worker-source.js` | Canonical remote backup. Same bucket as dashboard. Download: `wrangler r2 object get agent-sam/source/worker-source.js --remote --file /tmp/worker-source.js -c wrangler.production.toml`. Upload: `wrangler r2 object put agent-sam/source/worker-source.js --file <file> --content-type=application/javascript --remote -c wrangler.production.toml`. |
| **Legacy / other** | R2 object | **Bucket:** `iam-platform` · **Key:** `source/worker-source.js` | Previously used; current canonical is **agent-sam** above. |

**Production build:** Worker is not “built” separately; `wrangler deploy` bundles `worker.js` from the repo. The R2 copy is for backup/remote editing only and is **not** used at runtime.

---

## 2. Production deploy script

| What | Where | Command |
|------|--------|--------|
| **Production deploy** | `./scripts/deploy-with-record.sh` | `npm run deploy` (from repo root) |
| **Config** | `wrangler.production.toml` | Referenced by deploy script |
| **Credentials** | `.env.cloudflare` (gitignored) or `~/.zshrc` | Loaded via `./scripts/with-cloudflare-env.sh`; must set `CLOUDFLARE_API_TOKEN` (and optionally `CLOUDFLARE_ACCOUNT_ID`). |

**Deploy flow:**
1. `npm run deploy` → `./scripts/deploy-with-record.sh`
2. Script sources `.env.cloudflare`, then runs `./scripts/with-cloudflare-env.sh wrangler deploy --config wrangler.production.toml`
3. After deploy, runs `./scripts/post-deploy-record.sh` to record the deploy in D1

**Important:** If you changed any file under `dashboard/`, upload it to R2 **before** running deploy (see §4 and `.cursor/rules/dashboard-r2-before-deploy.mdc`).

---

## 3. R2 buckets (wrangler.production.toml)

| Binding | Bucket name | Purpose |
|---------|-------------|---------|
| **ASSETS** | `inneranimalmedia-assets` | Public homepage / static assets |
| **CAD_ASSETS** | `splineicons` | CAD/icons assets |
| **DASHBOARD** | **agent-sam** | Dashboard HTML/JS/CSS, shell, agent app, **and** worker source backup (`source/worker-source.js`) |
| **R2** | **iam-platform** | Memory, docs, platform data (e.g. `memory/schema-and-records.md`, `memory/daily/YYYY-MM-DD.md`) |

Worker code references these by binding (`env.DASHBOARD`, `env.R2`) or by name in R2 API (`agent-sam`, `iam-platform`).

---

## 4. Dashboard files: repo vs R2

Dashboard HTML is served from R2 bucket **agent-sam**. Worker looks up keys `static/dashboard/<name>.html` or `dashboard/<name>.html`.

| Repo path | R2 key (agent-sam) | Served at |
|-----------|---------------------|-----------|
| `dashboard/overview.html` | `static/dashboard/overview.html` | `/dashboard/overview` |
| `dashboard/agent.html` | `static/dashboard/agent.html` | `/dashboard/agent` |
| `dashboard/chats.html` | `static/dashboard/chats.html` | `/dashboard/chats` |
| `dashboard/cloud.html` | `static/dashboard/cloud.html` | `/dashboard/cloud` |
| `dashboard/finance.html` | `static/dashboard/finance.html` | `/dashboard/finance` |
| `dashboard/time-tracking.html` | `static/dashboard/time-tracking.html` | `/dashboard/time-tracking` |
| `dashboard/mcp.html` | `static/dashboard/mcp.html` | `/dashboard/mcp` |
| `static/dashboard/draw.html` | (as used by app) | — |

**Upload command (per file):**
```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/<filename> --file=dashboard/<filename> --content-type=text/html --remote -c wrangler.production.toml
```

**Bulk dashboard + agent build:** `./agent-dashboard/deploy-to-r2.sh` (from repo root) builds agent-dashboard, overview-dashboard, time-tracking-dashboard and uploads HTML + JS/CSS to **agent-sam** under `static/dashboard/` (see script for exact keys).

---

## 5. Other R2 key locations (agent-sam)

| Key / prefix | Content |
|--------------|--------|
| `source/worker-source.js` | Worker source backup (see §1) |
| `static/dashboard/*.html` | Dashboard pages (see §4) |
| `static/dashboard/agent/*.js`, `*.css` | Agent dashboard bundle and chunks |
| `static/dashboard/overview/` | Overview dashboard JS |
| `static/dashboard/time-tracking/` | Time-tracking dashboard JS |
| `static/dashboard/shell.css` | Shell styles |
| `static/auth-signin.html` | Auth/sign-in page |
| `dashboard/<name>.html` | Alt keys for some dashboard pages |

---

## 6. Other R2 key locations (iam-platform)

| Key / prefix | Content |
|--------------|--------|
| `memory/schema-and-records.md` | Bootstrap/schema memory for Agent Sam |
| `memory/daily/YYYY-MM-DD.md` | Daily memory logs (e.g. `./scripts/upload-daily-log-to-r2.sh`) |

---

## 7. Credentials and env

| Item | Location | Notes |
|------|----------|--------|
| **CLOUDFLARE_API_TOKEN** | `.env.cloudflare` or `~/.zshrc` | Required for deploy and R2; loaded by `./scripts/with-cloudflare-env.sh` |
| **CLOUDFLARE_ACCOUNT_ID** | Optional in env; also in `wrangler.production.toml` [vars] | Used by wrangler |
| **.env.cloudflare** | Repo root, gitignored | Copy from `.env.cloudflare.example`; never commit |

---

## 8. Quick reference commands

```bash
# Production deploy (worker only; upload dashboard files first if changed)
npm run deploy

# Upload single dashboard file to R2
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/<file>.html --file=dashboard/<file>.html --content-type=text/html --remote -c wrangler.production.toml

# Full dashboard + agent build and upload
./agent-dashboard/deploy-to-r2.sh

# Download remote worker source
./scripts/with-cloudflare-env.sh npx wrangler r2 object get agent-sam/source/worker-source.js --remote --file /tmp/worker-source.js -c wrangler.production.toml

# Upload worker source to R2 (after editing /tmp/worker-source.js or local copy)
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/source/worker-source.js --file /tmp/worker-source.js --content-type=application/javascript --remote -c wrangler.production.toml
```

---

## 9. Exact location of remotely stored worker source

- **Bucket:** `agent-sam`
- **Key:** `source/worker-source.js`
- **Path form:** `agent-sam/source/worker-source.js`

This is the single canonical remote copy of the worker source, stored with the rest of the dashboard in the **agent-sam** R2 bucket.
