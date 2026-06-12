# PrimeTech CMS Studio (M3)

PrimeTech Studio is the Inner Animal Media CMS live editor: view published pages, inspect section structure, autosave drafts (KV→D1), publish with promotion gates, and redeploy via Agent Sam (`cms_edit` tools).

## URLs

| Route | Purpose |
|-------|---------|
| `/dashboard/cms/{project}/pages` | Project pages list (iframe studio) |
| `/dashboard/cms/{project}/pages/{pageId}` | Live edit studio for one page |
| `/dashboard/cms/{project}/imports` | Same studio, Assets tab (`?panel=imports`) |
| Iframe shell | `/static/dashboard/app/cms/designstudiocmslite.html?project=…&page=…&workspace_id=…` |

## Live edit loop (view → draft → publish → redeploy)

1. **View** — Studio Preview tab loads `GET /api/cms/pages/:id` (`content_url` presigned R2 published HTML, or `preview_html` section tree).
2. **Inspect** — File tree mirrors `cms_page_sections` + components from `GET /api/cms/bootstrap`.
3. **Edit** — Section changes via Agent Sam `agentsam_cms_write` or API `PUT /api/cms/sections/:id`; drafts autosave to KV (`cms:draft:{page}:{user}`) and flush to D1 `cms_page_drafts`. Draft HTML is written to R2 `cms/{workspace}/{project}/{slug}/draft.html`.
4. **Draft preview** — Click **Draft** then **Refresh** (`GET /api/cms/pages/:id?draft=1`).
5. **Publish** — Topbar **Deploy**: draft flush → overrides → snapshot → `POST /api/cms/pages/:id/publish` (M3 gates + R2 draft→published copy + bootstrap KV bust).
6. **Redeploy** — **Agent redeploy** opens Agent Sam with `page_id`, `r2_key`, `live_url`. Agent uses `cms_write` then you **Deploy** (or agent guides publish).

## Agent Sam integration

| Tool | Role |
|------|------|
| `agentsam_cms_read` | List/read pages and sections |
| `agentsam_cms_write` | Update section_data, stage KV draft, write R2 draft.html |
| `agentsam_cms_publish` | Run promotion gates (complete publish via API Deploy) |

Compose from studio posts `iam-agent-chat-new-thread` with `task_type: cms_edit`, `page_id`, `collab_room: cms:{pageId}`.

Long CMS turns (≥3) trigger `agentsam_spawn_session` handoff via `cms-spawn-bridge` (agent loop + optional `POST /api/cms/spawn-handoff`).

## Shopify theme `.tar.gz` import

### UI path

1. Open `/dashboard/cms/{project}/pages/{pageId}` (or `/imports`).
2. **Assets** tab → drag-drop or browse `.tar.gz` / `.zip` / `.tgz`.
3. Watch **Theme imports** list for `pending` → `processing` → `completed`.
4. Click **Apply to page** → Agent Sam scaffold prompt (maps `cms_liquid_sections` → `cms_page_sections`).

### API path

```bash
# 1) Upload archive to R2 (session cookie required)
curl -b cookies.txt -X POST https://inneranimalmedia.com/api/r2/upload \
  -F file=@theme.tar.gz \
  -F bucket=inneranimalmedia \
  -F key=cms/liquid-imports/$(date +%s)-theme.tar.gz

# 2) Enqueue import
curl -b cookies.txt -X POST https://inneranimalmedia.com/api/cms/liquid-imports \
  -H 'Content-Type: application/json' \
  -d '{"import_name":"My Theme","source_type":"shopify_tar_gz","r2_key":"cms/liquid-imports/…","r2_bucket":"inneranimalmedia","project_id":"inneranimalmedia"}'

# 3) Poll status
curl -b cookies.txt https://inneranimalmedia.com/api/cms/liquid-imports
```

Queue worker extracts archive → R2 `cms/liquid-imports/{id}/extracted/` → D1 `cms_liquid_sections` (when import row exists). CDP screenshots deferred without `BROWSER_SESSION`.

## Bindings (Worker)

| Binding | CMS use |
|---------|---------|
| `DB` (D1) | `cms_pages`, sections, drafts, overrides, imports, live sessions |
| `ASSETS` / `R2` | Page HTML draft/published, theme archives, staged extracts |
| `SESSION_CACHE` (KV) | `cms:bootstrap`, `cms:draft`, `cms:live-session`, publish lock |
| `IAM_COLLAB` (DO) | Collab room `cms:{pageId}` |
| `MY_QUEUE` | `cms_liquid_import` jobs |

## API summary

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/cms/bootstrap` | Project shell + sections tree |
| GET | `/api/cms/pages/:id` | `?draft=1` for draft-aware preview |
| PUT | `/api/cms/pages/:id/draft` | KV stage; `flush:true` → D1 + R2 draft.html |
| POST | `/api/cms/pages/:id/publish` | Gates + R2 promote |
| PUT | `/api/cms/sections/:id` | Section edit + draft R2 refresh |
| GET | `/api/cms/studio-status` | Live session + patch session poll |
| POST | `/api/cms/liquid-imports` | Enqueue theme extract |
| GET | `/api/cms/assets` | DAM list |
| GET | `/api/cms/collection-assets` | Collection join |
| POST | `/api/cms/live-session/join` | Studio presence |

## Manual smoke checklist

Run authenticated steps in browser after deploy; curl samples need session cookie.

- [ ] `GET /api/cms/bootstrap?project_slug=inneranimalmedia` returns pages + sections
- [ ] Studio preview shows `preview_html` or published `content_url`
- [ ] `PUT /api/cms/pages/{id}/draft` with `flush:true` → response includes `r2_draft_key`
- [ ] **Deploy** succeeds (or shows gate errors: `seo_title`, `meta_description`)
- [ ] After publish, **Refresh** loads updated R2 content
- [ ] Assets tab: upload `.tar.gz` → import row → `completed` with `sections_found > 0`
- [ ] Agent Sam **Agent redeploy** receives page context
- [ ] `GET /api/cms/studio-status?page_id=…` shows `live_session.is_active`

```bash
# Health (no auth)
curl -s https://inneranimalmedia.com/api/health | head -c 200
```

## Deploy commands

```bash
cd /Users/samprimeaux/inneranimalmedia

# Validate touched Worker JS
node --check src/core/cms-edit-safety.js
node --check src/core/cms-theme-archive.js
node --check src/api/cms.js
node --check src/queue/handlers/cms-liquid-import.js
node --check src/tools/builtin/cms.js
node --check src/core/agent-tool-loop.js

npm run guard:identity

git add -A && git commit -m "…" && git push origin main

npm run deploy:full
```

Auth HTML (if studio static changed): `./scripts/upload-auth-pages.sh` is not required for `dashboard/public/cms/*` — those ship with dashboard build in `deploy:full`.
