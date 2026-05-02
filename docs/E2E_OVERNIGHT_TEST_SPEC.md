# End-to-end overnight test (IAM) — definition

**What “E2E” means here:** one orchestrated run proves **(1)** API + internal auth, **(2)** a real paid chat with **verifiable token + cost rows in D1**, **(3)** a **production build artifact on TOOLS R2** with a **public URL you can open**.

The old `overnight-api-suite.mjs` alone is **smoke + D1 snapshots**, not this full bar.

---

## Gates (all must pass)

| Gate | Proof |
|------|--------|
| **G1 Health** | Sandbox `GET /api/health` and `GET /` return 200. |
| **G2 Internal auth** | `POST /api/internal/post-deploy` with `Authorization: Bearer INTERNAL_API_SECRET` and `dry_run: true` returns not 401/403. |
| **G3 Chat canary** | `POST /api/agent/chat` (sandbox or prod per env) returns 200 and completes. |
| **G4 Telemetry (hard)** | D1 `agent_telemetry` row for the **canary chat** has **`input_tokens` and `output_tokens` both > 0** (and cost present). **Note:** column `session_id` is the **conversation id**, not the cookie UUID — the orchestrator selects the latest matching row in a short time window (default 5 min) after the suite, optionally filtered by model. If no row or tokens invalid → **FAIL**. |
| **G5 TOOLS R2** | Vite build exists; default **`E2E_TOOLS_MODE=full`**: set **`E2E_TOOLS_VITE_BASE`** to the TOOLS public URL so **dynamic imports** resolve to the same prefix; upload **entire** `agent-dashboard/dist/` (chunks + assets) to **`tools`** under `code/e2e-nightly/<run_id>/`, plus **`manifest.json`** and **`preview.html`** (from `dashboard/agent.html` with bundle + `shell.css` URLs rewritten). **`curl -I`** to entry `.../agent-dashboard.js` returns **200**. `E2E_TOOLS_MODE=entry` uploads only the entry bundle (legacy fast path; no preview). |
| **G6 Budget** | Per-provider ceiling: **`OVERNIGHT_CAP_USD_PER_PROVIDER`** (default 5 USD **per** anthropic / openai / google / workers_ai bucket), enforced in the Node suite. |

---

## Orchestrator

**Script:** `scripts/e2e-overnight.sh`

**Env (never commit values):**

- `CLOUDFLARE_API_TOKEN` — Wrangler (or loaded via `with-cloudflare-env.sh` + `.env.cloudflare`)
- `INTERNAL_API_SECRET` — same as Worker secret on `inneranimalmedia`
- `SESSION_COOKIE` — `session=<uuid>` for sandbox (or prod if you target prod canary)
- Optional: `E2E_SKIP_BUILD=1` — skip Vite build (dev only)
- Optional: `E2E_SKIP_TOOLS=1` — skip TOOLS upload (API-only check)
- Optional: `E2E_TOOLS_MODE=full` (default) or `entry` — full dist vs single `agent-dashboard.js`
- Optional: `E2E_COPY_DASHBOARD_HTML=1` — also put `dashboard/agent.html` at `.../shell/agent.html` under the same run prefix

**Order:** preflight → `npm run build:vite-only` → upload TOOLS (full dist or entry) → write `reports/<run_id>-tools-manifest.json` and (full mode) upload `manifest.json` to TOOLS → verify entry URL → print `wall_seconds` → `node scripts/overnight-api-suite.mjs` → **D1 SELECT** latest row in `E2E_TELEMETRY_WINDOW_SEC` (default 300) with `model_used` containing `E2E_CANARY_MODEL_SUBSTR` (default `haiku`) → exit 1 if `input_tokens`/`output_tokens` missing or not &gt; 0.

**Run:**

```bash
cd /path/to/march1st-inneranimalmedia
./scripts/e2e-overnight.sh
```

Requires `export` lines in `.env.cloudflare` for token, internal secret, and session cookie (never commit).

---

## What this is not

- Not invoice reconciliation with Anthropic/OpenAI dashboards (D1 `computed_cost_usd` is worker pricing).
- Not a replacement for `./scripts/benchmark-full.sh` before promote.
- Not MCP/workflow full matrix unless you extend the suite.

---

## Rotate secrets

If `INTERNAL_API_SECRET` was ever pasted into chat or logs, **rotate** it and update `.env.cloudflare` only on your machine.

---

## Why it felt “too fast” + what “full buildout” means

**What the first version did:** one Vite build, **one** file (`agent-dashboard.js`) to TOOLS, then the HTTP canary suite (most tiers are sub-second; only the chat canary is multi-second). That is intentionally **minutes of wall time**, not a 30-minute pipeline.

**Zero-risk rule (your model):** E2E artifacts live only under bucket **`tools`**, prefix `code/e2e-nightly/<run_id>/`. **We do not** overwrite **`agent-sam`** or **`agent-sam-sandbox-cicd`**. Worst case you ignore the TOOLS prefix; “rollback” is **do nothing** — production and sandbox R2 stays as-is until you explicitly promote or change worker/R2 bindings.

**Full buildout mode (`E2E_TOOLS_MODE=full`, default in `e2e-overnight.sh`):** before `npm run build:vite-only`, export **`E2E_TOOLS_VITE_BASE=https://tools.inneranimalmedia.com/code/e2e-nightly/<run_id>/`** so the built `agent-dashboard.js` loads chunks from TOOLS (otherwise imports would still target `/static/dashboard/agent/`). After build, upload **every file under `agent-dashboard/dist/`** (JS, CSS, chunks, source maps if present) to `tools/code/e2e-nightly/<run_id>/…`, generate **`manifest.json`** (local + TOOLS), generate **`preview.html`** (local `reports/` + TOOLS), then verify the **entry** URL. Open **`https://tools.inneranimalmedia.com/code/e2e-nightly/<run_id>/preview.html`** for a **live shell + bundle** (banner explains that same-origin `/api/` on the tools host may fail; use sandbox for full stack).

**After an E2E full run:** `agent-dashboard/dist/` was built for TOOLS URLs. Run **`npm run build:vite-only`** again **without** `E2E_TOOLS_VITE_BASE` before uploading the bundle to **`agent-sam`** / promoting.

**Optional:** `E2E_COPY_DASHBOARD_HTML=1` also uploads `dashboard/agent.html` to the same run prefix as `shell/agent.html` so you can open a **frozen HTML shell** that points at the same run’s JS URL (manual script `src` edit still required for a real side-by-side test — document only unless we add a small templated shell later).

**Not included (by design):** promoting to sandbox R2 (`agent-sam-sandbox-cicd`) or prod (`agent-sam`). That remains **`deploy-sandbox.sh` / `promote-to-prod.sh`** with Sam approval.
