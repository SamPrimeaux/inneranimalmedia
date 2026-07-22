# Agent Sam CMS — next-agent handoff (cream shell + real data)

**Status:** active handoff · **Owner lane:** Mac `deploy:full` / `deploy:fast` (never Vite on GCP iam-tunnel)  
**Live refs (2026-07-22):** hub stable at `/dashboard/cms`; Studio editor at `/dashboard/cms/pages?site=…` via isolated iframe (`studio-cms.js`)  
**Git baseline:** merge landed; isolation fix `21717127` (+ later main tip). Do **not** set `D1_APPLY_PENDING=apply` for the 800–979 ledger gap.

---

## Product outcome

Ship **Agent Sam CMS** as one coherent product package:

| Surface | Role | Visual |
|---------|------|--------|
| **Pt.1 Hub** | Site overview, Open CMS, media/structure/settings cards | Shopify-cream (`#F9F7F2` / white cards / teal CTAs) — **keep as SSOT vibe** |
| **Pt.2 Studio** | Pages / sections / theme / templates / imports / CRM | Must **match hub cream**, not the current dark `#09090b` shell |
| **Reference** | `studio-cms-editor/` in-repo | Temporary; remove only after **explicit live approval** |
| **Standalone repo** | `SamPrimeaux/studio-cms-editor` | Untouched / resale |

End state: operator opens hub → Open CMS → cream Studio with **real** pages/sections/theme/CRM → clear path back to hub → publish works → no mock-only rails.

---

## Current architecture (do not regress)

```
/dashboard/cms                          → CmsHubPage (cream) inside IAM dashboard shell
/dashboard/cms/pages?site=X             → StudioCmsHost iframe
/dashboard/cms/online-store?site=X      → Studio panel=sections
/dashboard/cms/theme-editor?site=X      → Studio panel=theme
/dashboard/cms/templates?site=X         → Studio panel=templates
/dashboard/cms/imports?site=X           → Studio panel=imports

StudioCmsHost
  → /static/dashboard/app/cms/studio-cms-shell.html?site=&panel=&page=&workspace=
  → /static/dashboard/app/cms/studio-cms.js   (React INLINED — never share vendor-react.js)

Entry:     dashboard/studio-cms/main.tsx
Vite:      dashboard/studio-cms/vite.config.ts
Build:     dashboard/package.json → `vite build --config studio-cms/vite.config.ts`
API map:   dashboard/pages/cms/studio/iamApi.ts → /api/cms/*
UI source: studio-cms-editor/app/page.tsx + globals.css
```

**Why iframe:** Mac `deploy:full` vs Cloudflare Builds were racing shared `vendor-react.js` export maps → `does not provide an export named 'n'`. Isolation is intentional. Prefer fixing cream + data **inside** the iframe bundle; do not re-import Studio into `CmsPage.js` / shared vendor chunks.

**Known crash already fixed:** `siteCatalog` must never replace sites with `pages: []` before bootstrap (empty `page.sections` threw after first paint). Keep those null-guards.

---

## Priority 1 — Clean return path to Pt.1 hub

### Problem
Studio top chrome has site switcher + breadcrumbs but **no explicit “back to CMS overview”** control. Operators feel trapped in the editor.

### Required UX
1. Always-visible control: **← Sites** or **CMS overview** (label: “Sites” / “Overview”).
2. Destination: `https://inneranimalmedia.com/dashboard/cms` (optionally preserve `?site=` only if hub needs it — prefer **bare hub** so Pt.1 launcher stays clean: use `buildCmsHubPath()` / `/dashboard/cms`).
3. Must work inside the iframe (parent owns React Router).

### Implementation sketch
1. In `studio-cms-editor/app/page.tsx` topbar (near site trigger): add button `Sites` / `Overview`.
2. On click, `postMessage` to parent:
   ```js
   window.parent.postMessage(
     { type: 'iam-studio-cms-navigate', path: '/dashboard/cms' },
     window.location.origin,
   );
   ```
3. In `StudioCmsHost.tsx`, extend the existing `message` listener (already handles `iam-studio-cms-site`) to handle `iam-studio-cms-navigate` and call parent `navigate(path)` via a new prop `onNavigatePath` from `CmsPage.tsx` (`cmsNavigatePath` already exists).
4. Also map IAM sidebar “Sites” → hub (already true when not inside Studio). When Studio is fullscreen iframe, **do not** rely on IAM sidebar alone — iframe covers it.
5. Optional: Escape / `⌘.` shortcut → same hub navigation (document in shortcuts modal).

### Acceptance
- From `/dashboard/cms/pages?site=inneranimalmedia`, one click returns to cream hub without login bounce.
- Site switcher still changes site **within** Studio; Overview always exits to hub.

---

## Priority 2 — Cream shell (align Studio with hub)

### SSOT vibe (from live hub)
- Canvas / page bg: `#F9F7F2` / `#faf8f4`
- Cards / panels: `#ffffff`, soft stone borders `rgba(43,39,31,.1)`
- Primary CTA teal: hub uses ~`#1e6a6f` (“Open CMS”) — prefer hub teal for product chrome; keep **site** brand purple (`#6358ff`) for **published site preview / theme vars**, not for the entire editor chrome
- Text: near-black `#1a1a1a` / muted `#64748b`
- Avoid purple-on-white AI cliché for **shell**; purple OK as site brand accent inside canvas preview

### Files to revise
| File | Change |
|------|--------|
| `studio-cms-editor/app/globals.css` | Replace dark `:root` tokens (`--shell-bg:#09090b`, etc.) with cream/light tokens; restyle topbar/rail/sidebar/inspector/modals/toasts |
| `dashboard/pages/cms/studio/StudioCmsHost.tsx` | Host wrapper `bg-[#09090b]` → cream `#F9F7F2` |
| `dashboard/public/cms/studio-cms-shell.html` | Boot splash dark → cream |
| `studio-cms-editor/app/page.tsx` | Inline dark fallbacks (loading screen `#09090b`); canvas **device frame** stays white (preview of live site) |

### Acceptance
- Editor chrome reads as same family as `/dashboard/cms` hub.
- Device preview iframe content can stay site-themed (dark hero OK if page content is dark).
- Rebuild `studio-cms.js` after CSS changes (`npm --prefix dashboard run build` or at least studio-cms vite config).

---

## Priority 3 — Real CMS + CRM logic (finish the revision)

### Truth vs theater

| Area | Today | Target |
|------|-------|--------|
| Pages list | Bootstrap maps real D1 pages (good) | Keep; status dots = published/draft from API |
| Canvas | Often empty / wireframe / weak `srcDoc` for non-Hero types | Render real section HTML from `section_data` + templates; fall back to structured preview, not blank blocks |
| Content inspector | Real fields when bootstrap maps them | Save → `PUT /api/cms/sections/:id` (already wired); show dirty/saved from API truth |
| Theme tab | `PATCH /api/cms/theme-vars` + migration `980` | Load `active_theme.css_vars` from bootstrap; persist; preview updates |
| Publish | `POST .../publish` | Confirm toast + page status refresh from API |
| Media rail | `/api/cms/assets` | Real thumbnails/URLs; empty state if zero |
| Templates / Components | `/api/cms/templates` | Real names; “Add section” creates via API |
| CRM rail + Crm tab | `getContacts()` — verify endpoint + shape | Real contacts list, drawer detail, export only if API supports; **no fake SP/AC collab avatars** unless presence is real |
| Collab “2 others editing” | Mock | Remove or gate behind real presence |
| Demo `initialSites` / `makeSections()` | Still seeded as fallback | Use **only** until bootstrap resolves; never show demo “Cinematic Hero” when live site has different sections |

### API surface (already in `iamApi.ts`)

Prefer extending these rather than inventing parallel clients:

- `getBootstrap(projectSlug, pageId?)`
- `saveSection` / `renameSection` / `reorderSections` / `setSectionVisibility` / `createSection`
- `createPage` / `savePageMeta` / `publishPage`
- `saveThemeVars` / `activateTheme`
- `getAssets` / `getTemplates` / `getContacts`

If CRM endpoint is weak/missing: query D1 (`agentsam_*` / CMS contacts tables via existing `/api/cms/*`) — **do not** invent unprefixed tables; check registry before new SQL.

### Canvas quality bar (critical)
Demo v1 “felt working” because every section type had a visible preview. Current live canvas often shows empty “Section” outlines. Next agent should:

1. Map common `section_type` values (hero, nav, footer, feature, cta, gallery, …) to preview HTML (expand `frameHtml` in `page.tsx`).
2. Prefer server-provided HTML/CSS if bootstrap or section payload includes it.
3. Keep click-to-select (`cms:section-click`) working.
4. Never leave a selected section with an empty blue box when `fields` has title/body.

### Remove product theater
- Fake collab avatars / “2 others editing”
- Hardcoded “Saved 2 minutes ago” / “286 words” unless computed
- Demo sites Fuel/Companions in switcher when catalog is IAM-only — switcher = `siteCatalog` / bootstrap only

---

## Priority 4 — Product packaging (Agent Sam CMS)

Treat as one named product in UI copy (no client PII; hub already uses “AGENTSAM - CMS”):

1. Studio modal kicker / document title: **Agent Sam CMS** (shell HTML `<title>`).
2. Hub “Open CMS” → Studio pages route (already).
3. Sidebar CMS Suite items stay; Studio is the body for those five routes.
4. After cream + real data + exit path: ask operator for **explicit live approval**, then separate PR to remove `studio-cms-editor/` reference tree (keep standalone GitHub repo).

---

## Suggested work order (next agent)

1. **Exit path** (`postMessage` + `StudioCmsHost` + topbar button) — small, unblocks UX immediately.  
2. **Cream token pass** on `globals.css` + shell/host backgrounds — visual product lock.  
3. **Kill mock theater** (collab, fake metrics, demo seed after bootstrap).  
4. **Canvas section renderers** for real `section_data`.  
5. **CRM rail** against real `getContacts` / fix API gaps.  
6. **Media + templates** empty/error states that match cream hub.  
7. Manual QA matrix below → `deploy:full` on Mac (**no** bulk D1 apply) → dual-pass E2E if ticketed.

---

## QA matrix (before calling it done)

| # | Check |
|---|--------|
| 1 | Hub `/dashboard/cms` cream, unchanged |
| 2 | Open CMS → Studio loads without vendor-react export errors |
| 3 | Overview / Sites returns to hub in one click |
| 4 | Real page list for `?site=inneranimalmedia` (24 pages class of data) |
| 5 | Select section → inspector fields match D1; Save persists; reload shows values |
| 6 | Theme save persists (`cms_site_theme_overrides` / theme-vars) |
| 7 | Publish updates status |
| 8 | CRM shows real contacts or honest empty state |
| 9 | Hard refresh + SW update: Studio still loads (`studio-cms.js` size ≈ isolated build, not a tiny overwritten stub) |
| 10 | Mobile viewport of Studio still usable |

---

## Deploy / race warnings (LOCKED)

- **Mac:** `npm run deploy:full` or `deploy:fast`. Never `D1_APPLY_PENDING=apply` for full 800–979 pending set.
- **CF Builds** can overwrite R2 mid-flight (seen: `studio-cms.js` shrunk after Mac upload). After ship, verify:
  - `https://inneranimalmedia.com/pwa-build-meta.json` → `git_sha`
  - `Content-Length` of `/static/dashboard/app/cms/studio-cms.js` matches local `dashboard/dist/cms/studio-cms.js`
- If mismatch: force `wrangler r2 object put` for `studio-cms.js` + shell, bump-cache, `npm run r2:delta-sync`.
- Do not re-bundle Studio into `CmsPage` / `vendor-react`.

---

## Out of scope (unless operator asks)

- Deleting `studio-cms-editor/` (needs explicit live approval first)
- Changing standalone `SamPrimeaux/studio-cms-editor` repo
- Replacing hub Pt.1 with Studio
- Bulk applying pending D1 migrations 800–979

---

## File cheat sheet

```
dashboard/pages/cms/CmsPage.tsx              # routes hub vs StudioCmsHost
dashboard/pages/cms/studio/StudioCmsHost.tsx # iframe + postMessage
dashboard/pages/cms/studio/iamApi.ts         # real API adapter
dashboard/studio-cms/main.tsx                # iframe entry
dashboard/studio-cms/vite.config.ts
dashboard/public/cms/studio-cms-shell.html
studio-cms-editor/app/page.tsx               # Studio UI + frameHtml
studio-cms-editor/app/globals.css            # THEME TOKENS (cream pass)
src/api/cms.js                               # bootstrap, sections, theme-vars, …
migrations/980_cms_site_theme_overrides.sql  # already applied
```

---

## One-line brief for the next agent

> Keep the isolated Studio iframe; add a postMessage exit to `/dashboard/cms`; restyle `globals.css` to hub cream; replace mock collab/metrics/demo seeds with bootstrap+iamApi truth and richer section previews so Agent Sam CMS feels like one Shopify-cream product from hub through editor.
