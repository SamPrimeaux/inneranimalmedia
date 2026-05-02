# Current State Audit — Inner Animal Media / Agent Sam

**Date:** 2026-05-01  
**Purpose:** Single snapshot of how production is wired today, what changed recently, and where docs live. Factual only; not a roadmap.

---

## 1. Executive summary

- **Worker entry (production):** `src/index.js` is **`main`** in `wrangler.production.toml`. Modular routes handle many `/api/*` paths first; anything not matched delegates to the legacy **`worker.js`** export (`legacyWorker.fetch`). Scheduled crons run from **`src/index.js`** (not the duplicate `worker.scheduled` block at the bottom of `worker.js`, which is unused when `main = src/index.js`).
- **Legacy monolith:** `worker.js` (~34k lines) remains the bulk of routing, agent chat SSE, OAuth (locked handlers), D1, R2, MCP proxy behavior, and scheduled logic definitions inside the file — but **cron execution** for the deployed worker is driven by **`src/index.js`**.
- **Dashboard assets (prod R2):** Bindings **`ASSETS`** and **`DASHBOARD`** both use bucket **`inneranimalmedia`** (see `wrangler.production.toml`). Sandbox staging for promotes defaults to **`agent-sam-sandbox-cicd`** (`promote-to-prod.sh` source bucket). Older docs that say “dashboard lives only in agent-sam” are outdated for **current wrangler config**.
- **Database:** D1 **`inneranimalmedia-business`** (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`), binding **`DB`**.
- **Docs in repo:** Root **`README.md`** is the entrypoint for the repo. **`docs/runbooks/`** holds operational procedures (deploy dashboard, R2 structure; add-user/rollback are stubs).
- **Docs mirror (R2):** Script **`scripts/sync-docs-to-r2.sh`** uploads **`docs/`** to **`inneranimalmedia/docs/...`** (235 files in the last full successful sync on 2026-05-01).
- **Agent memory (D1):** Table **`agentsam_memory`** is loaded into the agent chat system prompt (up to 20 rows per resolution path) via **`src/core/memory.js`**; **`recall_count` / `last_recalled_at`** update when rows are injected. Decay job **`runAgentsamMemoryDecay`** runs on cron **`0 1 * * *`** from **`src/index.js`** (soft decay + `expires_at` when `decay_score` hits zero; rows are not deleted).
- **Git / CI:** Development work has been pushed to **`production`** on **`origin`** (SamPrimeaux/inneranimalmedia-agentsam-dashboard) to trigger Workers Builds for that branch.

---

## 2. Live URLs (canonical)

| Surface | URL |
|--------|-----|
| Dashboard overview | https://inneranimalmedia.com/dashboard/overview |
| Agent | https://inneranimalmedia.com/dashboard/agent |
| Learn | https://inneranimalmedia.com/dashboard/learn |
| Design Studio | https://inneranimalmedia.com/dashboard/designstudio |
| Storage | https://inneranimalmedia.com/dashboard/storage |
| Integrations | https://inneranimalmedia.com/dashboard/integrations |
| MCP UI | https://inneranimalmedia.com/dashboard/mcp |
| Database UI | https://inneranimalmedia.com/dashboard/database |
| Meet | https://inneranimalmedia.com/dashboard/meet |
| Images | https://inneranimalmedia.com/dashboard/images |
| Mail | https://inneranimalmedia.com/dashboard/mail |
| Settings | https://inneranimalmedia.com/dashboard/settings |
| API | https://inneranimalmedia.com/api/* |
| MCP server | https://mcp.inneranimalmedia.com/mcp |
| Terminal hostname | https://terminal.inneranimalmedia.com |

---

## 3. Deploy and promote (operator-facing)

| Action | Command / note |
|--------|----------------|
| Production promote (R2 pull from sandbox → prod R2 → worker deploy) | `./scripts/promote-to-prod.sh` from repo root; uses **`wrangler.production.toml`**. Optional **`--worker-only`**. Sources **`.env.cloudflare`** when present. |
| Cloudflare Workers Builds | Dashboard pipeline runs **`scripts/deploy-cf-builds.sh`** (see script); branch/trigger configured in Cloudflare. |
| Wrangler prod wrapper | `./scripts/with-cloudflare-env.sh npx wrangler ... -c wrangler.production.toml` |
| Sandbox worker | **`wrangler.jsonc`** / **`scripts/deploy-sandbox.sh`** (separate from prod worker name) |

Do **not** use bare `npx wrangler deploy` at repo root for production without **`-c wrangler.production.toml`** — project rules require the explicit config so the correct worker (**`inneranimalmedia`**) deploys.

---

## 4. R2 layout (high level)

| Bucket (wrangler) | Binding(s) | Role |
|-------------------|------------|------|
| **inneranimalmedia** | **ASSETS**, **DASHBOARD** | Public/marketing and dashboard static bundle keys (e.g. `static/dashboard/agent/`, `static/dashboard/agent.html`). |
| **inneranimalmedia-autorag** | **AUTORAG_BUCKET** | Autorag / knowledge sources. |
| **iam-docs** | **DOCS_BUCKET** | Docs bucket (public docs host in AGENTS.md). |
| **iam-platform** | **R2** | Platform memory / logs (private). |
| **tools** | **TOOLS** | Monaco/tools payloads, etc. |
| **inneranimalmedia-email-archive** | **EMAIL** | Email archive. |

Optional mirrors under **`inneranimalmedia/docs/`** and **`inneranimalmedia/scripts/`** from **`sync-docs-to-r2.sh`** and **`sync-scripts-to-r2.sh`** for off-repo reference (not a substitute for git as source of truth).

---

## 5. Locked / high-risk (unchanged policy)

- **OAuth:** **`handleGoogleOAuthCallback`** and **`handleGitHubOAuthCallback`** — do not modify without explicit approval and full code review (see `.cursorrules`).
- **`wrangler.production.toml`** — bindings/secrets: no casual edits.
- **Secrets:** never commit `.env.cloudflare`, tokens, or vault material.

---

## 6. Recent changes (through 2026-05-01)

- Root **`README.md`** added as repo entry documentation.
- **`docs/runbooks/`** added (`deploy-dashboard.md`, `r2-structure.md`, stubs for add-user/rollback).
- **`scripts/sync-scripts-to-r2.sh`**, **`scripts/sync-docs-to-r2.sh`** for R2 mirrors.
- **`src/core/memory.js`**: **`loadAgentMemory`**, **`runAgentsamMemoryDecay`**, **`upsertAgentsamMemory`** (upsert available for future callers; not auto-fired on every chat turn).
- **`worker.js`**: imports **`loadAgentMemory`**; SSE system prompt builder injects memory for authenticated tenant chat; cache path uses **`skipMemory`** to avoid double-counting recalls when refreshing tools from cache.
- **`src/index.js`**: **`runAgentsamMemoryDecay`** on **`0 1 * * *`** so decay runs in production.

---

## 7. Known platform notes (from project docs / AGENTS.md — verify periodically)

- **`r2_write` MCP tool** has had degraded reliability in metrics; confirm current **`mcp_registered_tools`** / mode exclusions before relying on it for automation.
- **Anthropic streaming**, **Gemini SSE quirks**, and **AI Search** deprecation status — see **`AGENTS.md`** / **`CLAUDE.md`** for current P0/P1 notes; do not assume this audit replaces those.

---

## 8. Related docs

| Doc | Role |
|-----|------|
| `README.md` (repo root) | Quick orientation, URLs, deploy pointers |
| `docs/runbooks/deploy-dashboard.md` | Promote procedure and verification commands |
| `docs/runbooks/r2-structure.md` | `inneranimalmedia` prefix conventions |
| `AGENTS.md` / `CLAUDE.md` | Infrastructure reference (bindings, secrets names, deploy ethics) |
| `.cursorrules` | Non-negotiable deploy and OAuth locks |

---

**Audit complete for 2026-05-01.** Replace or supersede with a new dated file when architecture or go-live assumptions change materially.
