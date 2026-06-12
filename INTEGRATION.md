# IAM CMS Phase 2 — Integration guide
# This replaces the Phase 1 patch entirely. Drop Phase 1 first.

────────────────────────────────────────────────────────────
## STEP 1 — Backend: replace Phase 1 API patch in src/api/cms.js
────────────────────────────────────────────────────────────

1. Open src/api/cms.js
2. Remove any Phase 1 patch blocks you added previously
3. Find the final line:
      return jsonResponse({ error: 'CMS route not found' }, 404);
4. Paste the entire contents of cms-v2-api-patch.js BEFORE that line
5. The existing routes (pages CRUD, sections PUT, pages/:id/publish) stay untouched

NOTE on the pageIdMatch conflict:
  The existing handler has:
    const pageIdMatch = path.match(/^\/api\/cms\/pages\/([^/]+)$/);
  Our PUT /api/cms/pages/:id metadata handler checks `!('content' in body)` to
  avoid conflict with the existing content-update PUT. Both coexist cleanly.


────────────────────────────────────────────────────────────
## STEP 2 — Frontend: install CmsRoot.jsx
────────────────────────────────────────────────────────────

Copy CmsRoot.jsx to:
  src/dashboard/cms/CmsRoot.jsx

In your dashboard router (App.jsx or router.tsx):
  import { CmsRoot } from './cms/CmsRoot.jsx';

  // Pass workspaceId if your auth context exposes it:
  <Route path="/dashboard/cms/*" element={<CmsRoot workspaceId={user?.workspace_id} />} />

  // Or omit — the component reads window.__IAM_USER.active_workspace_id automatically


────────────────────────────────────────────────────────────
## STEP 3 — Left nav entry
────────────────────────────────────────────────────────────

Between Design Studio and Images:
  { label: 'CMS', href: '/dashboard/cms/websites', icon: 'layout-grid' }


────────────────────────────────────────────────────────────
## STEP 4 — Verify end to end
────────────────────────────────────────────────────────────

API smoke tests (authenticated session):

  GET  /api/cms/websites
       → { websites: [{ slug, domain, page_count, ... }] }

  GET  /api/cms/bootstrap?project_slug=inneranimalmedia
       → { pages, sections_by_page, active_theme, themes, liquid_imports, ... }

  GET  /api/cms/templates
       → { templates: [...24 rows...] }

  GET  /api/cms/assets?category=image
       → { assets: [...] }

  GET  /api/cms/liquid-imports
       → { imports: [] }

  POST /api/cms/sections/reorder
       { order: [{ id, sort_order }] }
       → { success: true, updated: N }

  POST /api/cms/pages/:id/snapshot
       → { success: true, id: 'rb_...' }

  GET  /api/cms/pages/:id/rollbacks
       → { rollbacks: [] }  (empty until first publish)

  GET  /api/cms/activity?page_id=:id
       → { activity: [] }  (empty until mutations)

  POST /api/cms/themes/activate
       { theme_id, theme_slug, project_slug }
       → { success: true }


────────────────────────────────────────────────────────────
## STEP 5 — What works immediately after install
────────────────────────────────────────────────────────────

/dashboard/cms/websites
  - Lists all 12 cms_tenants with live page counts
  - "Open editor" navigates to /dashboard/cms/editor?project={slug}

/dashboard/cms/editor?project=inneranimalmedia
  - Loads 13 IAM pages from cms_pages
  - Loads all 51 sections grouped by page_id
  - Left panel: page list, section list (drag to reorder), theme pill, import badge
  - Canvas: section cards with section_data preview, click to select
  - Right panel tabs:
      Fields    — live autosave on 1.2s debounce to PUT /api/cms/sections/:id
      Theme     — all 110 themes, activate via POST /api/cms/themes/activate
      Meta      — title, seo_title, meta_description, robots editor
      Agent     — streaming chat to /api/agent/chat with CMS context injected
                  (applies JSON from <section_data>...</section_data> tags back to section)
      Log       — cms_activity_log for the current page
      History   — cms_live_rollbacks, restore with one click
  - Presence dots via IAM_COLLAB DO WebSocket at /api/collab/room/cms:{pageId}
  - Dirty page indicator (amber dot) on unsaved changes
  - Publish button: snapshot → publish, clears dirty state
  - Asset picker: browse cms_assets, upload to R2 via POST /api/r2/upload
  - Theme CSS preview: fetches compiled CSS from R2, scopes to .cms-canvas-preview

/dashboard/cms/templates
  - 24 templates from cms_component_templates
  - Category filter tabs
  - "Add to page" wired when navigated from editor via ?add_to_page={page_id}
  - POST /api/cms/sections creates the section with template_data as initial section_data

/dashboard/cms/imports
  - Drag/drop or browse .zip / .tar.gz
  - Real R2 upload via POST /api/r2/upload (multipart form)
  - POST /api/cms/liquid-imports creates D1 record, enqueues MY_QUEUE message
  - Lists existing imports with section counts and parse status


────────────────────────────────────────────────────────────
## STEP 6 — DO responsibilities (all four wired)
────────────────────────────────────────────────────────────

AGENT_SESSION (AgentChatSqlV1)
  Used by: Agent tab in right panel
  How: POST /api/agent/chat with cms_context { page_id, section_id, section_type }
       Streams SSE response, parses <section_data>...</section_data> from output,
       applies JSON diff back to section_data without full page reload.
  Key: no new DO methods needed — uses existing /api/agent/chat which already
       routes to the DO per workspace.

IAM_COLLAB (IAMCollaborationSession)
  Used by: presence dots in editor topbar
  How: WebSocket to /api/collab/room/cms:{pageId}?workspace_id={workspaceId}
       Already wired in src/index.js at the /api/collab/room/ match.
       Sends presence_join on open, reads presence_state on message.
       Server broadcasts presence to all editors of the same page.
  Note: presence state is stored in the DO — no D1 writes needed for presence.
        cms_live_edit_sessions D1 writes happen on connect (add if desired for audit).

BROWSER_SESSION (AgentBrowserLiveV1)
  Used by: liquid import pipeline
  How: MY_QUEUE consumer receives { type: 'cms_liquid_import', import_id }
       Queue handler calls BROWSER_SESSION DO to drive headless browser,
       render each .liquid section, take screenshot, write PNG to R2.
       Updates cms_liquid_sections.parse_status and cms_liquid_imports.status.
  Status: queue message is sent (Step 5 above), consumer needs to be wired
          in src/queue/dispatcher.js (pattern already exists for other queue types).

CHESS_SESSION (ChessRoom)
  Not used by CMS.


────────────────────────────────────────────────────────────
## STEP 7 — What is deferred to phase 3
────────────────────────────────────────────────────────────

- BROWSER_SESSION queue consumer for liquid section screenshots
  (1 file: src/queue/handlers/cms-liquid-import.js + dispatcher entry)

- cms_activity_log writes on DELETE (section delete endpoint not yet in CMS editor)

- cms_live_edit_sessions D1 writes on COLLAB join/leave (audit trail for presence)

- New page creation UI (/dashboard/cms/editor — "New page" button → POST /api/cms/pages)

- Liquid section → template mapping UI (the right panel for /dashboard/cms/imports)

- cms_collections / cms_folders DAM (asset picker shows flat list today)

- Page slug rewrite (route_path editor in Meta tab — needs /api/cms/pages/:id/rename)


────────────────────────────────────────────────────────────
## STEP 8 — KV namespaces used
────────────────────────────────────────────────────────────

SESSION_CACHE binding:
  cms:bootstrap:{workspaceId}:{projectSlug}   TTL 300s
  (busted on theme activate, section create, section delete, page meta update)

MCP_TOKENS binding: NOT touched.
