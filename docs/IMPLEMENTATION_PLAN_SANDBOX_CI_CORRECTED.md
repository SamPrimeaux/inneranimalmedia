# Implementation plan — Sandbox alignment and CI/CD (corrected)

## Scope and repository

- **Canonical codebase:** the Inner Animal Media monorepo (`SamPrimeaux/inneranimalmedia-agentsam-dashboard`, same tree as `march1st-inneranimalmedia`).
- **Do not** drive `inneranimal-dashboard` deploys from a standalone MeauxCAD repository. MeauxCAD UI may live under `agent-dashboard/`, but **Worker + Wrangler + deploy scripts** are owned by this monorepo.

## User review

**IMPORTANT**

- The production Worker entry is **`worker.js`** at the **repo root**, not a replacement **`worker.ts`** from MeauxCAD. Align **`wrangler.jsonc`** `main` to **`worker.js`**.

**WARNING**

- Sandbox R2 bucket **`agent-sam-sandbox-cicd`** is retired in favor of **`agent-sam-sandbox-cicd`**. Confirm no external automation still targets **`cicd`**.

---

## Configuration and Worker alignment

### `worker.js` (repo root)

- Keep the canonical IAM `worker.js`. Do not swap in an unrelated Worker unless Sam approves a full migration.
- Runtime **`env`** bindings must match **`wrangler.jsonc`**, including **`ASSETS`**, **`DASHBOARD`**, **`AUTORAG_BUCKET`**, **`DOCS_BUCKET`**, **`R2`**, **`DB`**, **`IAM_COLLAB`**, **`CHESS_SESSION`**, **`AGENT_SESSION`**, **`AI`**, **`VECTORIZE`**, **`VECTORIZE_INDEX`**, **`MYBROWSER`**, **`WAE`**, **`KV`**, **`SESSION_CACHE`** (plus any others declared in Wrangler).
- **Do not** add **`MCAD_SESSION`** / **`MeauxCADSession`** unless `worker.js` exports that class.

### `wrangler.jsonc` (repo root)

- **`name`:** `inneranimal-dashboard`
- **`main`:** `worker.js`
- **`assets.directory`:** `agent-dashboard/dist`
- **`build.command`:** `""` if CI runs `npm run build` at repo root separately.

**Durable Objects**

- **`IAM_COLLAB`** → `IAMCollaborationSession`
- **`CHESS_SESSION`** → `ChessRoom`
- **`AGENT_SESSION`** → `AgentChatSqlV1`
- Remove **`MCAD_SESSION`** / **`MeauxCADSession`** if present.

**Migrations**

- Align with IAM tags (e.g. **`v4`** / **`IAMAgentSession`**, **`v5`** / **`AgentChatSqlV1`**).

**R2 (sandbox `inneranimal-dashboard`)**

- **`ASSETS`** and **`DASHBOARD`** → **`agent-sam-sandbox-cicd`**
- **`AUTORAG_BUCKET`** → bucket **`autorag`** (not `iam-platform`)
- **`DOCS_BUCKET`** → **`iam-docs`**
- **`R2`** → **`iam-platform`**
- **`CAD_ASSETS`** / **`splineicons`:** phased out on the Worker; do not re-bind unless Sam restores it.

---

## Deployment scripts (this repo)

| Script | Sandbox bucket |
|--------|----------------|
| `scripts/deploy-sandbox.sh` | **`agent-sam-sandbox-cicd`** (default; override: `SANDBOX_BUCKET`) |
| `scripts/promote-to-prod.sh` | reads from same default when pulling sandbox build |
| `scripts/upload-repo-to-r2-sandbox.sh` | default **`agent-sam-sandbox-cicd`** via `SANDBOX_BUCKET` |
| `scripts/r2-clone-agent-sam-to-sandbox.sh` | destination **`agent-sam-sandbox-cicd`** (override: `DST_BUCKET`) |

---

## Package scripts and CI/CD

### Root `package.json`

- **`"build": "cd agent-dashboard && npm run build"`** (or equivalent) so Cloudflare root **`npm run build`** succeeds.
- **`"build:vite-only": "npm run build"`** if `deploy-sandbox.sh` still calls **`build:vite-only`**.

### `agent-dashboard/package.json`

- **`build`** outputs to **`agent-dashboard/dist`**, matching **`wrangler.jsonc`** `assets.directory`.
- Commit **`package-lock.json`** for reproducible **`npm ci`**.

---

## Verification

### Automated

- Push to **`main`** on the monorepo used by Workers Builds.
- Build runs Vite under **`agent-dashboard`**; deploy finds **`agent-dashboard/dist`**; **`wrangler deploy -c wrangler.jsonc`** succeeds.

### Manual

- **`https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent`**
- Workers → **`inneranimal-dashboard`** → Settings: bindings match **`wrangler.jsonc`** on the same commit (**`AUTORAG_BUCKET` → `autorag`**, sandbox **`ASSETS`/`DASHBOARD` → `cicd`**, no stray **`MCAD_SESSION`**).

---

## Common mistakes (do not repeat)

| Wrong | Correct |
|-------|---------|
| Replace **`worker.ts`** as main entry | **`worker.js`** at repo root |
| **`Env`** includes **`MCAD_SESSION`** | **`IAM_COLLAB`**, **`CHESS_SESSION`**, **`AGENT_SESSION`** |
| **`AUTORAG_BUCKET` → `iam-platform`** | **`AUTORAG_BUCKET` → `autorag`**; **`R2` → `iam-platform`** |
| **`CAD_ASSETS` → `splineicons`** | Phased out; use **`AUTORAG_BUCKET`** for agreed paths |
| “Align **meauxcad** repository” | Align **monorepo**; MeauxCAD app under **`agent-dashboard/`** only |

---

*Last updated: 2026-04-02*
