# Agent Sam Platform — Sprint Log
**Started:** 2026-07-06  
**Owner:** Sam Primeaux  
**Repo:** SamPrimeaux/inneranimalmedia

---

## Active Blockers (must ship before anything else)

- [ ] **GCP VM PM2 crash loop** — ExecOS dies after every `pm2 restart`, `token_set` drops back to false. Root fix: `pm2 startup && pm2 save` so it survives reboots. SSH to `iam-tunnel` and run once.
- [ ] **Deploy pending commits** — Two commits on `main` undeployed: `2e19aa27` (CAD auto-execute) and `506e389b` (illustration_create ctx + identity fix). Run `npm run deploy:full` from Mac after VM is stable.
- [ ] **Install OpenPySCAD on GCP VM** — `pip install openpyscad --break-system-packages` after SSH in.

---

## Tomorrow Checklist

### Phase 1 — Stabilize Infrastructure (do first, nothing else works without this)

- [ ] SSH to GCP VM, run `pm2 startup && pm2 save`, verify `token_set: true` holds across 10 min
- [ ] `npm run deploy:full` from Mac — confirm exit 0
- [ ] Verify `https://terminal.inneranimalmedia.com/health` shows `token_set: true, uptime > 60s`
- [ ] Confirm `https://inneranimalmedia.com/api/health` returns ok
- [ ] Install OpenPySCAD: `pip install openpyscad --break-system-packages`
- [ ] Test: type "make me a chair" in Design Studio → confirm `illustration_create` tool fires (not prose response)

### Phase 2 — CAD Pipeline Proof (the actual goal)

- [ ] Confirm chair job row appears in D1 `agentsam_cad_jobs` with `status: running` after agent turn
- [ ] Confirm GCP runner picks it up and produces GLB (check R2 `cad/exports/...`)
- [ ] Confirm SSE `cad_glb_ready` fires and model loads in viewport
- [ ] Test Meshy path: "make me a chess piece" → Meshy job → GLB in viewer
- [ ] Test Excalidraw path: "sketch a floor plan" → Draw tab opens with elements

### Phase 3 — CAD Bucket Separation

- [ ] Add `CAD_BUCKET` binding to `wrangler.jsonc` pointing at existing `cad` R2 bucket
- [ ] Update `cad-job-scope.js` and `cad-job-runner.mjs` to write to `env.CAD_BUCKET` not `env.ASSETS`
- [ ] Deploy, verify new jobs land in `cad` bucket not `inneranimalmedia`

### Phase 4 — OpenPySCAD Integration

- [ ] Update `cadEngineSystemPrompt('openscad')` in `src/api/cad.js` to use OpenPySCAD Python syntax
- [ ] Update `cad-job-runner.mjs` openscad pipeline: `python3 script.py` → generates `output.scad` → `openscad -o output.stl output.scad`
- [ ] Write skill doc to D1 `agentsam_cookbook` so agent knows OpenPySCAD API
- [ ] Test end-to-end: agent generates Python → runner executes → GLB in viewer

### Phase 5 — Chat Tab UX Fix

- [ ] Add close (×) button to each chat tab in Design Studio header
- [ ] Wire close to `DELETE /api/agent/sessions/:id` or equivalent session cleanup
- [ ] Reset tab state without requiring full logout/login
- [ ] Cap visible tabs at 5, add overflow indicator or scrollable tab row
- [ ] Persist tab close across page refresh (don't re-open closed sessions)

### Phase 6 — Meshy Asset Migration

- [ ] Run inventory query: all `agentsam_cad_jobs` where `engine=meshy AND status=done`
- [ ] Identify rows where `result_url` is still Meshy CDN (expiring) vs already on R2
- [ ] Write backfill script: download GLB → optimize → R2 → patch D1 row
- [ ] Run batch tag pass: vision model on each GLB thumbnail → category/tags → `cms_assets`
- [ ] Verify all Meshy assets visible in Design Studio asset library with correct thumbnails

### Phase 7 — Excalidraw Library Intelligence

- [ ] Batch tag all library items via Claude vision → store in `agent_tags` column (already in D1 schema)
- [ ] Wire agent retrieval: when user says "add a kitchen" → D1 query on tags → inject shapes directly
- [ ] Replace scrollable dump panel with search/filter UI backed by tag index
- [ ] Test: "add a bathroom" → correct shapes appear without user scrolling

---

## Known Issues Log

| Issue | Root Cause | Status |
|-------|-----------|--------|
| `illustration_create` returning empty envelope | `ctx: null` passed, identity not pulled from `resolvedContext` | Fixed in `506e389b`, pending deploy |
| Agent chatting instead of tool-calling in Design Studio | `design_studio` route had empty `tool_keys` | Fixed in D1, pending deploy to flush |
| OpenSCAD script generated but not executed | `routeIllustrationCad` stopped at `script_ready`, no auto-execute | Fixed in `2e19aa27`, pending deploy |
| PTY `token_set: false` after PM2 restart | `PTY_AUTH_TOKEN` in `.env.cloudflare` not readable by dotenvx, needed in plain `.env` | Fixed manually, not persistent across VM reset |
| `wrangler secret put` fails on `wrangler.jsonc` | Invalid container Dockerfile path + pipelines binding format | Workaround: CF REST API. Needs `wrangler.jsonc` cleanup |
| Chat tabs — no close button, max 5, no reset | Frontend-only: no close handler wired, session state not cleared | Not started |
| `.scad` files appearing in Code editor as binary | Extension not registered as text in Monaco | Not started |
| Agent system prompt leaking into visible chat messages | `run whoami` context block surfacing in Design Studio chat | Not started |
| Excalidraw never producing valid sketches | `buildIllustrationExcalidrawScene` generates empty/garbage elements | Not started |

---

## Infrastructure Inventory (what exists vs what's wired)

| Component | Exists | Wired | Notes |
|-----------|--------|-------|-------|
| GCP ExecOS / iam-tunnel | ✅ | ✅ | Unstable — PM2 crash loop |
| OpenSCAD on GCP | ✅ | ✅ | `/usr/bin/openscad 2021.01` |
| FreeCAD on GCP | ✅ | ✅ | `/usr/local/bin/FreeCADCmd` |
| Blender on GCP | ✅ | ✅ | `/usr/bin/blender 3.4.1` |
| OpenPySCAD | ❌ | ❌ | Install pending |
| `cad` R2 bucket | ✅ | ❌ | Exists, not bound in wrangler |
| `IamCadWorkerContainer` DO | ✅ | ❌ | Class + Dockerfile exist, never used |
| `illustration_create` tool | ✅ | ⚠️ | Wired but broken — deploy pending |
| `design_studio` prompt route | ✅ | ⚠️ | Tool keys fixed in D1 |
| Meshy GLB optimizer | ✅ | ⚠️ | Runs for recent jobs, backfill not done |
| Excalidraw tag retrieval | ✅ schema | ❌ | `agent_tags` column exists, never written |
| CAD auto-execute | ✅ | ⚠️ | Patched, pending deploy |
| Chat tab close | ❌ | ❌ | Not built |
| PM2 startup persistence | ❌ | ❌ | Needs `pm2 startup && pm2 save` |

---

## Commits Pending Deploy

| SHA | Description |
|-----|-------------|
| `2e19aa27` | feat: auto-execute CAD jobs after script_ready in illustration router |
| `506e389b` | fix: illustration_create — pass ctx for waitUntil, pull identity from resolvedContext |

---

## Notes

- Deploy command is always `npm run deploy:full` — never `npm run deploy` alone
- Two repos must never be mixed in Cursor: `/Users/samprimeaux/inneranimalmedia` and `/Users/samprimeaux/inneranimalmedia-mcp-server`
- `wrangler.jsonc` has two validation errors blocking `wrangler secret put` CLI: invalid container Dockerfile path and pipelines binding format. Use CF REST API for secret updates until fixed.
- CAD bucket (`cad` R2) should be bound as `CAD_BUCKET` binding — keeps GLB artifacts separate from main site assets
