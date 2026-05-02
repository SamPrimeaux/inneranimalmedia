# R2 bucket map (Inner Animal Media)

Bindings from **`wrangler.production.toml`** (production). Sandbox **`wrangler.jsonc`** mirrors most bindings but uses **`agent-sam-sandbox-cicd`** for ASSETS/DASHBOARD instead of split buckets below.

| Binding | Bucket name | Purpose |
|---------|-------------|---------|
| **ASSETS** | `inneranimalmedia-assets` | Public marketing / site static assets |
| **CAD_ASSETS** | `splineicons` | CAD / 3D asset library |
| **DASHBOARD** | **`agent-sam`** | Dashboard HTML/JS/CSS, `static/dashboard/*`, worker source mirrors under `source/`, legacy `screenshots/*.png` when `DOCS_BUCKET` absent, `reports/screenshots/*` for overnight pipeline |
| **AUTORAG_BUCKET** | **`autorag`** | AutoRAG / AI Search **ingest** (e.g. knowledge prefix used by sync APIs) |
| **DOCS_BUCKET** | **`iam-docs`** | Documentation markdown (this tree), **`screenshots/agent/*`** for new agent screenshots (`putAgentBrowserScreenshotToR2`) |
| **R2** | **`iam-platform`** | Platform memory, knowledge markdown, digests — **not** dashboard shell |

## Key conventions

### `agent-sam` (DASHBOARD)

- `static/dashboard/<page>.html` — dashboard routes `/dashboard/<segment>` resolve here.
- `static/auth-signin.html` — `/auth/signin`, `/auth/signup`, `/auth/login`.
- `static/dashboard/agent/agent-dashboard.js` / `.css` — built Vite bundle.
- `source/worker.js`, `source/agent-dashboard/src/*`, `source/docs/*` — AI indexing / backup (see `deploy-with-record.sh`).
- `screenshots/` — legacy screenshot keys; **`/api/screenshots`** lists `screenshots/` prefix from **DASHBOARD** bucket only.

### `iam-platform` (R2 binding)

- `memory/*`, `knowledge/*`, `reports/*` style paths — long-form markdown and ops content.
- **Do not** put dashboard HTML here for production shell (use `agent-sam`).

### `autorag` (AUTORAG_BUCKET)

- Ingest for Cloudflare AI Search instance **`iam-autorag`**; worker lists `autorag-knowledge/` prefix in AutoRAG admin routes (see `/api/agentsam/autorag/files` in `worker.js` ~9816+).

### `iam-docs` (DOCS_BUCKET)

- Canonical copy of **`docs/iam-docs/**`** in repo (optional mirror).
- **`screenshots/agent/{timestamp}-{uuid}.png`** — browser tool captures when binding present.
- Public URLs use host **`https://docs.inneranimalmedia.com/`** + object key (R2 custom domain; not Worker `fetch`).

### `agent-sam-sandbox-cicd` (sandbox only)

- Replaces both ASSETS and DASHBOARD bucket names in **`wrangler.jsonc`** for the **`inneranimal-dashboard`** worker.

## What never goes where

- **Never** store production worker-only secrets in R2 objects.
- **Never** put dashboard user-facing HTML only under `iam-platform` if the worker expects it in **`agent-sam`** (`static/dashboard/...`).
- **`iam-platform`** bucket (`R2` binding) is not the same as **`iam-docs`** — do not confuse memory/knowledge paths with public docs site.
