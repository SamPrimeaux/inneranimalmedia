# Worker modularization status (2026-05-02)

**Repo:** `https://github.com/SamPrimeaux/inneranimalmedia` (branch `main`)  
**Canonical root:** `/Users/samprimeaux/Downloads/inneranimalmedia`  
**Production entry:** `src/index.js`  
**Legacy monolith:** `worker.js` (~34.5k lines) imported as `legacyWorker` — **do not delete** until fallbacks are eliminated and parity verified.

Prior audit (symbols/routes) suggests large overlap; treat numbers as **signals to trace**, not automatic deletes.

---

## 1. `legacyWorker.fetch` call sites in `src/index.js`

| # | Route / condition | Tag (`annotateLegacyWorkerResponse`) | Route family | Why fallback exists | Modular replacement target | Safe to remove now? |
|---|-------------------|--------------------------------------|--------------|---------------------|------------------------------|---------------------|
| A | `GET /api/auth/google/start` or `GET /api/auth/github/start` | `oauth-alias-google-github-start` | OAuth API aliases | Clients/docs still hit legacy paths; modular stack uses `/api/oauth/google|github/start` | Keep redirects in `src/index.js` **without** legacy by forwarding entirely inside `handleOAuthApi` or thin redirects to canonical paths only | **Medium risk** — parity test OAuth flows after swap |
| B | `/api/oauth/*` when `handleOAuthApi` returns **404** | `oauth-after-modular-404` | OAuth | Modular OAuth incomplete vs `worker.js` (callbacks, providers, edge cases) | Extend `src/api/oauth.js` until **no** `/api/oauth/` reaches legacy in staging logs | **No** until zero legacy hits |
| C | `/auth/*` (all methods) | `auth-html-passthrough` | Auth HTML + callbacks | Session/HTML flows and callback URLs live in monolith; `.cursorrules` lock risk on Google/GitHub callbacks | Gradually port routes to `src/api/auth.js` + templates; **never** move locked callbacks without approval | **No** — high blast radius |
| D | Any `/api/*` not handled earlier (catch‑all) | `api-catchall-modular-missed` | Entire API surface | Anything without a modular handler delegates to monolith | Migrate route families into `src/api/*`; use **`X-IAM-Legacy-Fallback`** access logs to prioritize | **No** until modular returns non‑404 for required APIs |

---

## 2. `legacyWorker.queue`

| Call site | Behavior | Route family | Why | Replacement | Safe to remove? |
|-----------|-----------|--------------|-----|-------------|-----------------|
| `src/index.js` `queue()` handler | Delegates entire batch to `legacyWorker.queue` | Queue consumers | R2 doc indexing, pipelines, etc. still implemented in monolith | Implement modular `queue()` that dispatches same message shapes or split handlers | **No** until consumer parity |

Console: `[legacyWorker:fallback] queue <n> messages`.

---

## 3. Observability (implemented)

For every **`legacyWorker.fetch`** response that returns to the client:

- Log: `[legacyWorker:fallback] <tag> <METHOD> <path>`
- Headers: `X-IAM-Route-Source: legacy-worker`, `X-IAM-Legacy-Fallback: 1`

Helper: `src/core/legacy-worker-annotate.js` (`annotateLegacyWorkerResponse`).

**Note:** The modular JSON 404 (`Route not found in modular router or legacy worker`) is **not** legacy-sourced — no legacy headers there.

---

## 4. Route-by-route removal checklist (ordered)

Use logs / headers to prove **zero** legacy traffic before removing each row.

### OAuth

- [ ] **B1:** Staging: all `/api/oauth/*` succeed via `handleOAuthApi` (no `oauth-after-modular-404`).
- [ ] **A1:** Replace legacy-only aliases with modular redirects only **after** B1 green; retest Google/GitHub login.

### Auth HTML

- [ ] **C1:** Inventory `/auth/*` responses from legacy (HTML vs redirects).
- [ ] **C2:** Port non-locked routes to modular shell.
- [ ] **C3:** For locked OAuth callbacks — **explicit approval** before moving (`handleGoogleOAuthCallback`, etc.).

### API catch‑all

- [ ] **D1:** Export production sample of paths with `X-IAM-Legacy-Fallback: 1` (30 days).
- [ ] **D2:** For each top path prefix, add modular handler in `src/api/*`.
- [ ] **D3:** When staging legacy rate → 0 for a prefix, remove monolith routes **only after** prod confirmation.

### Queue

- [ ] **Q1:** Document message shapes consumed by `legacyWorker.queue`.
- [ ] **Q2:** Implement modular consumer + shadow compare.
- [ ] **Q3:** Cut over traffic; stop delegating to legacy.

### Final

- [ ] **F1:** Confirm `legacyWorker.fetch` **never** returns for prod traffic (or only approved exceptions).
- [ ] **F2:** Remove `import legacyWorker` and delete **only after** Sam approval + archive plan for `worker.js`.

---

## 5. Dashboard bundle size (`agent-dashboard.js` ~6.95MB)

**Inspect:** `rollup-plugin-visualizer` is wired when **`ANALYZE=1`**:

```bash
cd dashboard && npm run build:analyze
open dist/stats.html   # treemap of Rollup output
```

Config: `dashboard/vite.config.ts`. **No lazy-loading changes** in this pass per project direction.

**Likely contributors (hypotheses until treemap confirms):**

- Single entry bundles **Excalidraw**, **Monaco**, **Recharts**, **Three/cannon**, **xterm**, **Mermaid** (if imported broadly).
- `minify: false` in Vite — production deploy often still minifies elsewhere or ships huge readable bundle (verify promote pipeline).

**Next steps after treemap:** optional code-splitting / dynamic `import()` — **not started** here.

---

## 6. Files touched (this session)

| File | Change |
|------|--------|
| `src/core/legacy-worker-annotate.js` | New helper |
| `src/index.js` | Wrap all `legacyWorker.fetch` returns + queue log |
| `dashboard/vite.config.ts` | Conditional `rollup-plugin-visualizer` |
| `dashboard/package.json` | Script `build:analyze` |

---

## 7. Verification commands

```bash
# Worker types / lint (from repo root)
npm run lint 2>/dev/null || true

# Legacy headers on a route that still misses modular API (example — adjust path)
curl -sI "https://inneranimalmedia.com/api/<legacy-only-route>" | rg -i 'x-iam-route-source|x-iam-legacy-fallback'

# Bundle analysis
cd dashboard && npm run build:analyze && ls -la dist/stats.html dist/agent-dashboard.js
```
