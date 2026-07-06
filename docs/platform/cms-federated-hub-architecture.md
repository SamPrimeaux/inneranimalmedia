# CMS federated hub architecture

> **Operator workspace:** `ws_inneranimalmedia` · **Hub URL:** `/dashboard/cms`  
> **Shipped shell:** commit `0e266246` — one IAM CMS UI, no client login embeds.

---

## Principle (non-negotiable)

**Do not copy every client’s CMS into IAM D1.**

Each site keeps its own runtime: Worker, D1, R2, KV, and bindings. **Companions** and **Fuel** are already built, stored, and served separately with **full in-app CMS APIs** on their workers. The IAM platform job is **seamless access** across those builds from one dashboard shell — not centralizing client content in `inneranimalmedia-business`.

| Plane | Where it lives | What it holds |
|-------|----------------|---------------|
| **Control / registry** | IAM D1 (`inneranimalmedia-business`) | Hub tiles, `cms_tenants`, `agentsam_project_context`, bootstrap `cms_project_slug`, workspace metadata, bridge routing config |
| **Runtime / content** | Per-client Worker + bindings | `cms_pages`, sections, drafts, assets, publish HTML — **client D1 + client R2** |
| **Shell / UX** | IAM dashboard (`CmsStudioEditor`) | One editor GUI; `?site=` selects which backend to talk to |

Empty IAM `cms_pages` count for a client slug (e.g. `companionscpas: 0`) is **expected**, not a bug to fix by bulk-importing client data into IAM.

---

## What the hub is

```
https://inneranimalmedia.com/dashboard/cms
  └─ CmsSiteLauncherGrid (app icons)
       └─ click site → /dashboard/cms/pages?site=<slug>
            └─ CmsStudioEditor (same IAM shell for every site)
                 └─ API layer routes by slug + api_profile
```

Featured hub slugs (`src/core/cms-hub-sites.js`):

| Slug | Domain | Runtime workspace | Storage |
|------|--------|-------------------|---------|
| `inneranimalmedia` | inneranimalmedia.com | `ws_inneranimalmedia` | IAM platform D1 + R2 |
| `companionscpas` | companionsofcaddo.org | `ws_companionscpas` | Client D1 `companionscpas`, R2 `WEBSITE_ASSETS` |
| `fuelnfreetime` | fuelnfreetime.com | `ws_fuelnfreetime` | Client D1 `fuelnfreetime`, R2, DO `CMS_EDITOR` |
| `meauxbility` | meauxbility.org | `ws_meauxbility` | Runtime D1 `meauxbilityorg` + R2 `meauxbilityv2` (BYO) |

Operator stays on `ws_inneranimalmedia` when picking tiles — no workspace switch, no iframe embed to client admin login.

---

## API routing (federated, not duplicated)

### Platform site (`inneranimalmedia`)

Use IAM routes directly:

- `GET/POST /api/cms/pages`, `/api/cms/sections/*`, publish, bootstrap, etc.
- Data in IAM D1 + platform R2.

### Client sites (`companionscpas`, `fuelnfreetime`, …)

Use **bridge proxy** — IAM worker forwards to client worker CMS API with trusted headers (`AGENTSAM_BRIDGE_KEY`):

| IAM prefix | Client path | Profile |
|------------|-------------|---------|
| `/api/cms/bridge/cms/*` | `/api/cms/*` | `cpas_fragment` (Companions, Meauxbility) |
| `/api/cms/bridge/admin/cms/*` | `/api/admin/cms/*` | `fuel_admin` (Fuel) |

Implementation: `src/core/cms-client-bridge.js` → `proxyCmsBridgeRequest`.

Client workers already expose editing APIs (publish, section save, assets, etc.). See:

- `docs/clients/companionscpas/runbook.md` — bridge map
- `docs/clients/companionscpas/AGENTSAM.md`
- `docs/clients/fuelnfreetime/AGENTSAM.md`

**Anti-pattern:** Syncing all client `cms_pages` into IAM D1 so platform PrimeTech routes “just work.”  
**Correct pattern:** Unified shell + workspace-context returns `api_profile`, `bridge_supported`, `client_runtime_workspace_id`; editor/API client calls bridge (or a thin facade that auto-selects bridge vs platform per slug).

---

## Site config resolution

`resolveCmsSiteConfig` (`src/core/cms-site-config.js`):

- **Operator hub pick** (`ws_inneranimalmedia` + hub slug): `cms_shell: iam_unified`, `client_runtime_workspace_id` → real client WS, `bridge_supported: true` for non-IAM slugs.
- **`api_profile`:** `primetch` (IAM), `cpas_fragment` (Companions/Meaux), `fuel_admin` (Fuel).
- **`worker_base_url`:** client production domain / worker URL for bridge target.

Hub merge: `mergeOperatorHubSites` — registry rows only; `cms_hosting: platform` on tiles means **IAM shell**, not “content lives in IAM D1.”

---

## Template evaluation (next agent)

Compare **three semi-setup client stacks** for best drag/drop + publish UX to standardize **patterns**, not to merge databases:

1. **Companions** — sectional HTML, R2, `cpas_fragment`, nonprofit live site  
2. **Fuel** — admin SPA, commerce, DO `CMS_EDITOR`, `fuel_admin`  
3. **Meauxbility** — BYO runtime, dual DB (IAM control + `meauxbilityorg`)

**IAM (`inneranimalmedia`, 28 platform pages)** is the reference **shell** (PrimeTech / AgentSam editor), not a fourth competing content store.

Evaluation criteria:

- Seamless edit from hub without leaving IAM UI  
- Publish path on **client bindings** (not IAM D1 copy)  
- Bridge compatibility from operator hub  
- Agent assist (AGENTSAM.md, tools, live collab where wired)  
- Reuse for the next client site  

---

## Legacy (do not revive)

- `ClientWorkerCmsStudio` — client login iframe embed  
- `POST /api/cms/bridge/embed-session` — optional; not required for federated editing if bridge REST + unified shell suffice  
- Treating “0 IAM cms_pages” as signal to import client DB into platform  

---

## Key files

| File | Role |
|------|------|
| `dashboard/pages/cms/CmsPage.tsx` | Hub vs editor routing |
| `src/core/cms-hub-sites.js` | Hub slugs, brand defaults |
| `src/core/cms-site-config.js` | Per-slug bridge metadata |
| `src/core/cms-client-bridge.js` | IAM → client worker proxy |
| `src/api/cms.js` | Platform CMS + `/api/cms/bridge/*` |
| `src/dashboard/cms/CmsStudioEditor.tsx` | Unified editor shell |
