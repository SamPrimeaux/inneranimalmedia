# [CMS] Edit and publish homepage on inneranimalmedia

## Product
CMS

## User outcome
On site `inneranimalmedia`, the user can open the homepage (`page_home`), edit a section (or draft HTML), save a draft, publish, and verify the live site reflects the change. Agent Sam on the CMS route uses `route_key: cms_edit` with CMS tools.

**One page on one site — edited and published reliably.**

## Current failure
Documented / code-mapped risks:

- Dual R2 layouts (`pages/home/index.html` storefront vs legacy `cms/{ws}/…`) can diverge  
- Bootstrap KV key skew (`cms:bootstrap:v2:…` vs `cms:bootstrap:…`) → stale sections  
- Iframe `/studio/editor` marked unstable in product docs  
- Save ≠ live — easy to think draft is published  
- Hydrate path may skip full HTML copy on publish  
- Federated `client_worker` differences exist; platform path must work first  

## Severity triage (this ticket)

| Issue | Severity |
|-------|----------|
| Sections fail to load / bootstrap empty for `page_home` | **B0** |
| Edit/save does not write draft R2 or D1 | **B0** |
| Publish does not update live `pages/home/index.html` (or hydrate) | **B0** |
| Publish sometimes returns stale / KV not busted | **B1** |
| Agent on CMS route lacks `cms_edit` tools / context | **B1** |
| CMS tabs feel crowded | **B2** — backlog |
| Template marketplace incomplete | **B3** — backlog |
| Federated client_worker parity | **B3** for this ticket — **record only** |

Only **B0** and **B1** belong in this ticket.

## Verified path

```
route:     /dashboard/cms?site=inneranimalmedia
           /dashboard/cms/pages?site=inneranimalmedia
           /dashboard/cms/pages/page_home?site=inneranimalmedia
page:      dashboard/pages/cms/CmsPage.tsx
           → useCmsWorkspaceContext → CmsStudioEditor iframe
           → dashboard/public/cms/cms-editor-core.js
state:     workspace-context + bootstrap sections_by_page[page_home]
API:       GET  /api/cms/workspace-context
           GET  /api/cms/bootstrap?project_slug=inneranimalmedia
           PUT  /api/cms/sections/:id   (or PUT /api/cms/pages/page_home)
           POST /api/cms/pages/page_home/publish
service:   src/api/cms.js
           src/core/cms-agent-publish.ts (executeCmsPagePublish)
           src/core/iam-storefront-assets.js (pages/home/index.html)
storage:   D1: cms_pages, cms_page_sections, cms_page_drafts, cms_tenants
           R2 ASSETS: pages/.draft/home/index.html → pages/home/index.html
           KV: cms:bootstrap:v2:{ws}:inneranimalmedia , publish-lock
agent:     dashboardRouteContext → route_key cms_edit
           src/tools/builtin/cms.js (read → save → publish → verify)
```

Canonical identity:

- Site slug: `inneranimalmedia`  
- Page id: `page_home`  
- Live route: `/`  
- Live R2 key: `pages/home/index.html`  

## Scope

1. Choose canonical test site/page: **`inneranimalmedia` / `page_home`**.  
2. Trace section bootstrap end to end; fix B0 if sections do not load.  
3. Repair edit/save path so a section (or draft HTML) persists.  
4. Repair publish path so live storefront HTML (or hydrate) updates.  
5. Add live verification (fetch homepage HTML or a known string after publish).  
6. Confirm Agent Sam on CMS route gets `cms_edit` product context + tools.  
7. **Record** known federated / client_worker differences in this file — do not fix all of them.

## Non-scope

- Do not redesign CMS Suite nav, theme-editor UX, or template marketplace  
- Do not fix all federated sites  
- Do not remaster Agent Systems / Workspace UI  
- Do not merge Draw / Design Studio  
- Do not scrape Launch Desk routes  

## Acceptance criteria

- [ ] Open `/dashboard/cms/pages/page_home?site=inneranimalmedia` — sections (or HTML) load without empty bootstrap  
- [ ] Change one visible string / section field — Save succeeds (draft R2 or D1 section updated)  
- [ ] Publish succeeds (HTTP 200, no stale gate false-negative without reason)  
- [ ] Live `https://inneranimalmedia.com/` (or ASSETS fetch of `pages/home/index.html`) contains the new string within TTL/cache expectations  
- [ ] Refresh dashboard — draft/published status honest  
- [ ] From CMS route, Agent Sam chat request includes `route_key: cms_edit` and can list pages / describe publish path without falling back to generic dashboard tools only  
- [ ] Federated differences documented under “Known federated differences” below  

## Verification

1. Bootstrap:  
   `GET /api/cms/bootstrap?project_slug=inneranimalmedia` — `home_page` / `page_home` present; sections non-empty.  
2. Edit: mutate one section via UI or `PUT /api/cms/sections/:id`.  
3. Publish: `POST /api/cms/pages/page_home/publish`.  
4. Live check: curl homepage (or R2 get) for marker string.  
5. D1:  
   ```sql
   SELECT id, slug, status, r2_key, updated_at FROM cms_pages WHERE id = 'page_home';
   SELECT id, page_id, updated_at FROM cms_page_sections WHERE page_id = 'page_home' LIMIT 10;
   ```  
6. Agent: open CMS route → Network tab on `/api/agent/chat` — body includes `route_key: cms_edit`.  
7. Rollback: publish previous snapshot or restore prior section content.

## Documentation updates

- This file: mark status + federated notes  
- `docs/products/cms/` only if publish contract semantics change  
- Product registry if CMS status moves from Unstable → Usable for homepage path  

## Completion evidence

1. Before/after screenshot of homepage (or HTML snippet)  
2. Publish API response JSON  
3. D1 rows for page + section timestamps  
4. Agent chat request showing `cms_edit`  
5. Note of first broken boundary fixed  

## Known federated differences (record — do not fix all)

| Topic | Platform (`inneranimalmedia`) | Client worker |
|-------|-------------------------------|---------------|
| Hosting | `cms_hosting: platform` | `client_worker` |
| APIs | Direct `/api/cms/*` | Bridge `/api/cms/bridge/…` or 409 `CMS_CLIENT_WORKER_MODE` |
| Agent route | `cms_edit` | `cms_client_worker` / `fuel_cms_admin` |
| Embed | `CmsStudioEditor` → PrimeTech iframe | `ClientWorkerCmsStudio` exists but not branched in primary `CmsPage.tsx` |

Doc: `docs/platform/cms-federated-hub-architecture.md`

## Cursor operating rule

Investigate the complete path first. Do not begin by changing the first visible component.

Trace: route → page → state → API → service/tool → database/storage → response → UI state → verification.

Identify the first broken boundary. Propose the smallest coherent fix.

Stop after presenting: (1) verified current path, (2) first broken boundary, (3) proposed files, (4) acceptance test, (5) rollback plan.

**Wait for approval before editing.**
