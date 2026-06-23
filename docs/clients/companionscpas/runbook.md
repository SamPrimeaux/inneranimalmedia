---
title: CompanionsCPAS — IAM Operations Runbook
doc_type: client_runbook
client: Companions of CPAS
project_key: companionscpas
tenant_id: tenant_companionscpas
workspace_id: ws_companionscpas
lane_key: client_project_semantic_search
tags: [companionscpas, runbook, client-worker, cms, deploy]
updated_at: 2026-06-22
---

# CompanionsCPAS — maintain from Inner Animal Media

Use this runbook when working on **Companions of CPAS** from the IAM dashboard (`inneranimalmedia.com`) without guessing bindings, repos, or publish paths.

## Two-repo rule (non-negotiable)

| Repo | Path | What you change here |
|------|------|----------------------|
| **inneranimalmedia** | `/Users/samprimeaux/inneranimalmedia` | Registry, Agent Sam compass, CMS bridge proxy, deploy hooks, client briefs |
| **companionscpas** | `/Users/samprimeaux/companionscpas` | Worker code, client D1 schema, R2 content, Stripe/email/CMS APIs |

**Never** patch companionscpas runtime from the IAM Worker. **Never** run IAM migrations against client D1 `companionscpas`.

---

## Identity card (verified IAM D1 2026-06-22)

| Field | Value |
|-------|-------|
| Client | Companions of CPAS (nonprofit dog rescue, Caddo Parish LA) |
| Public site | https://companionsofcaddo.org |
| Assets CDN | https://assets.companionsofcaddo.org |
| Worker | `companionscpas` |
| Worker URL | https://companionscpas.meauxbility.workers.dev |
| GitHub | SamPrimeaux/companionscpas (branch `main`) |
| CF account | `ede6590ac0d2fb7daf155b35653457b2` |
| IAM tenant | `tenant_companionscpas` |
| IAM workspace | `ws_companionscpas` (**active** in `agentsam_workspace`) |
| CMS mode | `client_worker` / profile `cpas_fragment` |
| Studio path (client) | `/dashboard/cms/website` |

---

## Cloudflare bindings (client worker — dashboard SSOT)

Matches Workers & Pages → **companionscpas** → Bindings:

| Binding | Type | Cloudflare name / ID |
|---------|------|----------------------|
| `DB` | D1 | `companionscpas` — `fd6dd6fb-156b-4b6a-8ff0-505422652391` |
| `WEBSITE_ASSETS` | R2 | `companionscpas` |
| `CMS_CACHE` | KV | `companionscpas-cache` — `0b410337a8494fc982ea04c5bde1eab4` |
| `AGENTSAM_WAI` | Workers AI | Catalog |

IAM does **not** bind client D1 in wrangler. Database work uses **client repo migrations** or D1 REST with platform token.

---

## Secrets & vars checklist

### Must be set on **companionscpas** worker

| Name | Type | Purpose |
|------|------|---------|
| `AGENTSAM_BRIDGE_KEY` | Secret | IAM CMS bridge + `/_internal/publish` + telemetry ingest auth |
| `IAM_TELEMETRY_URL` | Secret | `https://inneranimalmedia.com/api/agentsam/telemetry/ingest` |
| `INTERNAL_PUBLISH_KEY` | Secret | Fallback internal publish |
| `STRIPE_*` | Secret | Donations (test mode until client live keys) |
| `RESEND_API_KEY` | Secret | Email |
| `OPENAI_API_KEY` | Secret | Agent Sam |
| `GOOGLE_CLIENT_*` | Secret | OAuth / Gmail |

Plaintext vars (dashboard): `APP_DOMAIN=companionsofcaddo.org`, `ALLOWED_ORIGINS=https://companionsofcaddo.org`, `ADMIN_EMAIL`, Resend from addresses.

### Must match on **inneranimalmedia** worker

| Name | Purpose |
|------|---------|
| `AGENTSAM_BRIDGE_KEY` | Same value as client — bridge trust |

**Gap (2026-06-22):** `META_APP_ID` / `META_APP_SECRET` empty on client worker — Lane B social blocked until filled.

**Telemetry:** If `IAM_TELEMETRY_URL` is missing on client, ETO sync to IAM silently no-ops.

---

## Work from IAM dashboard

### 1. Switch workspace

In IAM dashboard, set active workspace to **`ws_companionscpas`**. Collab ship slug `companionscpas` is in IAM delivery workflow rules.

R2 file picker scopes to bucket **`companionscpas`** when this workspace is active.

### 2. Edit CMS content

**Path A — Client studio (today):**

Open directly (iframe embed pending):

https://companionscpas.meauxbility.workers.dev/dashboard/cms/website

**Path B — IAM bridge proxy:**

IAM routes `/api/cms/bridge/cms/*` → client `/api/cms/*` with `AGENTSAM_BRIDGE_KEY` + identity headers.

Platform PrimeTech routes (`/api/cms/pages`, etc.) return **409 CMS_CLIENT_WORKER_MODE** for this workspace — by design.

**Publish contract:** D1 → R2 fragments (`static/pages/{route}/`) → KV bust `page:{route}` → verify https://companionsofcaddo.org/{route}

### 3. Deploy client worker

| Method | Command / action |
|--------|------------------|
| **Git push** | Push to `main` on SamPrimeaux/companionscpas — Workers Builds runs `npx wrangler deploy` |
| **Deploy hook** | `POST` hook `73b9a4da-28a1-4f6c-9f82-ffca946f9b6f` (registered in IAM as `hook_deploy_companionscpas`) |
| **IAM internal** | `POST /api/internal/trigger-workers-build` with `{ "workspace_id": "ws_companionscpas" }` |
| **Local** | `cd /Users/samprimeaux/companionscpas && npm run deploy:full` |

Post-deploy smoke:

1. https://companionsofcaddo.org/ loads
2. One CMS publish on a test section → public page updates
3. `POST /api/donations/checkout` still returns session (Stripe test)

### 4. Agent Sam compass (IAM)

```bash
cd ~/inneranimalmedia
npm run run:ingest_client_companionscpas
```

Context IDs:

| ID | Workspace | Role |
|----|-----------|------|
| `ctx_companionscpas` | `ws_inneranimalmedia` | Platform Agent Sam client dossier |
| `ctx_cms_companionscpas` | `ws_companionscpas` | CMS site registry row |

Memory key: `companionscpas_non_negotiable_change_sync_contract`

---

## IAM ↔ client integration map

```
IAM dashboard (ws_companionscpas)
  ├─ GET  /api/cms/workspace-context     → cms_hosting: client_worker
  ├─ POST /api/cms/bridge/embed-session  → client /_internal/cms-embed-session (NOT SHIPPED)
  ├─ *    /api/cms/bridge/cms/*          → client /api/cms/*
  ├─ POST /api/internal/trigger-workers-build → deploy hook
  └─ POST /api/agentsam/telemetry/ingest ← client syncToIAM()

companionscpas worker
  ├─ Public: /, /about, /adopt, /donate, /services, …
  ├─ Dashboard: /dashboard/*
  ├─ CMS API: /api/cms/publish, /section/save, /assets/*, …
  ├─ POST /_internal/publish (bridge key)
  └─ Cron: 0 6 * * * (daily 6am UTC)
```

---

## D1 discipline

| Database | ID | Migrations live in |
|----------|-----|-------------------|
| IAM registry | `inneranimalmedia-business` | `inneranimalmedia/migrations/` (670, 671, 674, …) |
| Client SSOT | `companionscpas` | `companionscpas/db/migrations/` |

Apply client D1:

```bash
cd ~/companionscpas
npx wrangler d1 execute companionscpas --remote --file=db/migrations/<file>.sql
```

---

## Observability (enable first on incidents)

Dashboard shows **Logs disabled** on companionscpas worker. Before debugging production issues:

1. Cloudflare → companionscpas → Observability → enable **Logs**
2. Optionally connect tail worker (`inneranimalmedia-tail` pattern from platform worker)

---

## Open gaps (prioritized)

| P | Gap | Fix |
|---|-----|-----|
| P1 | `/_internal/cms-embed-session` missing on client | Ship handler in companionscpas repo; accept bridge key + IAM headers |
| P1 | Worker logs disabled | Enable in CF dashboard |
| P2 | Deploy hook never triggered | Test via IAM trigger or manual hook POST after next client push |
| P2 | `IAM_TELEMETRY_URL` not documented on client | Set to `https://inneranimalmedia.com/api/agentsam/telemetry/ingest` |
| P2 | Meta OAuth vars empty | Client approval + fill META_* secrets |
| P2 | Stripe test mode | Live keys after client sign-off |
| P3 | IAM portfolio case study copy wrong | Migration 687 describes CPA firm — not dog rescue |

---

## Quick commands

```bash
# Re-ingest client docs into Agent Sam
npm run run:ingest_client_companionscpas

# Verify IAM registry row
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command "SELECT id, status, worker_name, json_extract(metadata_json,'$.public_domain') FROM agentsam_workspace WHERE id='ws_companionscpas'"

# Client deploy (from client repo)
cd ~/companionscpas && npm run deploy:full
```

---

## Related docs

| Doc | Path |
|-----|------|
| Project brief | `docs/clients/companionscpas/project-brief.md` |
| Feature overlay | `docs/clients/companionscpas/features-overlay.md` |
| CMS publish pattern | `docs/patterns/cms-fragment-publish-pipeline.md` |
| Handoff milestone | `docs/milestones/2026-06-19-companionscpas-handoff.md` |
| Client architecture | `/Users/samprimeaux/companionscpas/ARCHITECTURE.md` |
