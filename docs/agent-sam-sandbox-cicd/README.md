# inneranimalmedia.com — Sandbox CI/CD R2 registry

Bucket **`agent-sam-sandbox-cicd`** is the **canonical production–sandbox registry** for the Inner Animal Media application suite (historically also referred to in MeauxCAD-era tooling). It is a durable, versioned mirror of the application lifecycle: auditable source snapshots, CI build output, and runtime assets served by the **sandbox worker** `inneranimal-dashboard` at `https://inneranimal-dashboard.meauxbility.workers.dev/`.

**Bindings (this repo):** `wrangler.jsonc` sets **`ASSETS`** and **`DASHBOARD`** to **`agent-sam-sandbox-cicd`**. `scripts/deploy-sandbox.sh` uploads the Vite build and dashboard HTML to this bucket, then deploys the worker.

**Promote:** `scripts/promote-to-prod.sh` pulls dashboard artifacts **from** `agent-sam-sandbox-cicd` **into** production bucket **`agent-sam`** (must stay in sync with `deploy-sandbox.sh`).

**Production worker:** Live `inneranimalmedia.com` dashboard delivery normally uses R2 bucket **`agent-sam`** for the `DASHBOARD` binding. If your Cloudflare dashboard or `wrangler.production.toml` differs, reconcile there before promoting (do not assume this doc overrides locked prod config).

---

## Bucket mapping and structure

| Prefix | Content | Role |
| :--- | :--- | :--- |
| `source/` | Mirror of the repository (secrets redacted). | Audit and restoration |
| `static/` | Production build artifacts (Vite `dist/` output, dashboard HTML, auth pages). | UI delivery (CI/CD) |
| `voxel/` | 3D voxel engine assets (Three.js, Cannon-es, loaders) | Runtime assets |
| `excalidraw/` | Excalidraw libraries and styles | Runtime assets |
| `integration/` | Integration surfaces (e.g. Playwright console, MCP panels) | Integration layer |
| `MANIFEST.json` | Hash catalog for the build (when published at bucket root or prefix). | Registry index |

### IAM dashboard keys (what the worker actually serves)

The sandbox worker resolves dashboard URLs from **`static/dashboard/`** (see `worker.js`):

- **`https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent`** → `static/dashboard/agent.html` plus **`static/dashboard/agent/*`** (JS/CSS bundle).
- **Auth:** `static/auth-signin.html`, with fallback **`static/static_auth-signin.html`** for uploads that use that filename.
- **Workspace shell (when uploaded by deploy script):** `static/dashboard/iam-workspace-shell.html`, `static/dashboard/shell.css`.

Other prefixes (`voxel/`, `excalidraw/`, `integration/`) are served only if the worker is given routes or the client loads them by URL under **`/static/...`** (generic R2 passthrough) or via explicit paths you add later.

---

## Deployment workflow

### 1. Source redaction

Every object under **`source/`** should be stripped of secrets (`GEMINI_API_KEY`, `INTERNAL_API_SECRET`, etc.) so a public or shared bucket does not leak credentials.

### 2. Static delivery

The **`static/`** prefix mirrors the Vite production build. **`deploy-sandbox.sh`** uploads:

- `agent-dashboard/dist/*` → `static/dashboard/agent/`
- `dashboard/agent.html` → `static/dashboard/agent.html`
- plus IAM workspace shell assets when present in the repo.

Then the worker is deployed so the new objects are read from the **`DASHBOARD`** binding.

### 3. Runtime engines

Large third-party libraries under **`voxel/`** and **`excalidraw/`** keep versions pinned and reduce reliance on public CDNs for core behavior.

---

## Public access

| Kind | URL |
|------|-----|
| S3-compatible API (account bucket) | `https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/agent-sam-sandbox-cicd` |
| Public dev URL (bucket) | `https://pub-0d103dec19f84813ab2d58b17153a95f.r2.dev` |

Use Wrangler or the Cloudflare dashboard for uploads. Do not commit secrets.

---

## Related (this monorepo)

- **Sandbox deploy:** `scripts/deploy-sandbox.sh` (writes **`agent-sam-sandbox-cicd`**, deploys **`inneranimal-dashboard`**).
- **Prod promote:** `scripts/promote-to-prod.sh` (reads **`agent-sam-sandbox-cicd`**, writes **`agent-sam`**).
- **Lab vs CICD flow:** `docs/AITESTSUITE_IAM_STACK_INTEGRATION.md`.
- **Older bucket name:** Some historical docs and scripts use **`agent-sam-sandbox-cicd`**. The **current** sandbox pipeline in this repo targets **`agent-sam-sandbox-cicd`** — keep scripts and bindings aligned.

---

## MeauxCAD v1 layout on **tools** (optional)

Product bundles under **`tools/code/meauxcad/v1/`** (with **`dist/`**, **`source/`**, **`worker/`**, etc.) are a **separate** delivery model from the IAM **`static/dashboard/...`** contract. Prefer **`tools`** for large CAD/editor bundles; keep **`agent-sam-sandbox-cicd`** focused on IAM dashboard + registry layout above unless you explicitly add worker routes for extra prefixes.

---

*Last updated: 2026-04-01. Registry narrative aligned with `wrangler.jsonc` + deploy/promote scripts.*
