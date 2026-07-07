# Companions of Caddo — Project Status Overview

**Purpose:** SSOT handoff for IAM project dashboard (`proj_companions_cpas_web`), Agent Sam memory, and time-tracking reconciliation.  
**As-of:** Monday, July 6, 2026 · ~7:21 PM CDT (clock-off)  
**Live site:** [companionsofcaddo.org](https://companionsofcaddo.org)  
**Client repo:** [github.com/SamPrimeaux/companionscpas](https://github.com/SamPrimeaux/companionscpas) · `main` @ `6355e1d`

---

## Identity spine (do not drift)

| Field | Value |
|-------|-------|
| **Project ID** | `proj_companions_cpas_web` |
| **Client ID** | `client_companions_cpas` |
| **IAM workspace (tasks/time)** | `ws_inneranimalmedia` |
| **Client worker workspace** | `ws_companionscpas` |
| **Tenant (client D1)** | `tenant_companionscpas` |
| **Time project key** | `companionscpas` → links to `proj_companions_cpas_web` |
| **Worker** | `companionscpas` |
| **Public domain** | `https://companionsofcaddo.org` |
| **Admin route** | `admin.companionsofcaddo.org/*` |
| **Client D1** | `companionscpas` (`fd6dd6fb-156b-4b6a-8ff0-505422652391`) |
| **R2 bucket** | `companionscpas` |
| **KV cache** | `companionscpas-cache` (`0b410337a8494fc982ea04c5bde1eab4`) |
| **Deploy command** | `npm run deploy:full` from `/Users/samprimeaux/companionscpas` only |

**Human SSOT (wins over DB):** `docs/clients/companionscpas/AGENTSAM.md` · mirror in `companionscpas/AGENTSAM.md`

**Dashboard routes:**
- Project: `/dashboard/projects/proj_companions_cpas_web`
- Tasks: `/dashboard/collaborate?seg=tasks&client=client_companions_cpas`

---

## Time reconciliation (for burn tracking)

> **Dashboard timer showed 0m today** — work was done in Cursor/terminal, not via in-app Start. Use this block to backfill or validate.

### Session A — Repo fixes (pre-redesign)

| Window (CDT) | Evidence | Work |
|--------------|----------|------|
| **~12:58 PM – ~2:48 PM** | Git commits `a23fc45` → `fbd40fe` | Contact page script fix, shell CSS canonical path, salvage/light surface, donate v2 CSS, finance JSX fix, AGENTSAM sync |

**Estimated:** ~2–3 hours (intermittent; includes deploy cycles)

### Session B — PM spine (IAM platform)

| Window | Evidence | Work |
|--------|----------|------|
| **Morning Jul 6, 2026** | Migrations `741`, `750`, `751`, `752`, `780`, `781` | Project merge → `proj_companions_cpas_web`, Lori/Michelle task seed (18 todos), task spine + `time_projects` burn link, dashboard Instructions/Memory seeds |

**Estimated:** ~1–2 hours (platform/D1; separate from client deploy)

### Session C — Visual redesign + ship (Cursor agent)

| Window (CDT) | Evidence | Work |
|--------------|----------|------|
| **5:16 PM** | Agent transcript msg #1 timestamp | CMS architecture audit; header/hero discovery |
| **5:30 – 5:52 PM** | Transcript + commit `8c96392` (5:23 PM) | Global header: logo 2×, plum glass, logo-only, `/contact` nav visibility |
| **5:52 – 6:36 PM** | Transcript + commit `ce5dd59` (6:36 PM) | Home hero watercolor v2, theme tokens, badge removal, motion removal, scroll morph |
| **6:41 – 6:48 PM** | Commit `72dae72` | Live campaigns from `fundraising_campaigns`, newsletter → Resend + welcome template |
| **6:51 – 6:56 PM** | Commit `41480e2` | Plum-glass header globally on all public routes |
| **7:01 – 7:18 PM** | Commit `6355e1d` | Contact page theme + split 16:9 hero, social CTAs, unified Resend contact pipeline |
| **7:18 – 7:21 PM** | Deploy + status report | Full deploy, git push, clock-off |

**Estimated Session C:** **~2h 5m** (5:16 PM → 7:21 PM)

### Suggested time entry (if backfilling)

| Label | Duration | Notes |
|-------|----------|-------|
| Companions — site fixes (AM) | 2h 30m | Shell/contact/finance salvage |
| Companions — PM spine setup | 1h 30m | Migrations 750–781, project merge |
| Companions — prototype redesign (PM) | 2h 05m | Header, hero, campaigns, contact; 4 deploys |
| **Total Jul 6 (approx.)** | **~6h 05m** | Not yet captured in-app |

---

## What we accomplished today (shipped to production)

### 1. Project management spine (IAM)

- Merged duplicate project rows → canonical **`proj_companions_cpas_web`**
- Seeded **18 collaborate tasks** from Lori + Michelle feedback (`migration 750`)
- Linked `time_projects.companionscpas` → project + client for burn tracking (`752`)
- Seeded dashboard **Instructions** + **Memory** from AGENTSAM.md (`780`, `781`)

### 2. Theme & global header (`theme-plum-glass`)

- New CMS theme: `plum_glass` in D1 (`cms_pages.theme`)
- Dark wine/plum glassmorphic header with scroll → magenta morph
- Logo-only header (no text), **2× logo size** within fixed header height
- Pill Donate CTA matching semi-rectangular shape
- **Global:** all public routes use `render_site_nav.js` header (not stale static HTML)
- Revert-safe CSS tokens on `.theme-plum-glass` (`--tg-*`)

**Key files:** `static/global/cpas-shell.css`, `src/api/render_site_nav.js`, `migrations/20260707_plum_glass_global_header.sql`

### 3. Homepage hero (prototype for client approval)

- Watercolor/cream gradient hero with seamless section blends
- Headline: **"Every dog deserves a brighter tomorrow."** (accent weight 800)
- Removed rotating seal badge and all background motion
- Hero extends under fixed header (`.hero-header-bridge`)
- Primary CTA → Contact Us (modal)
- CMS-driven via D1 → R2 fragments → `render_home_section.js`

**Key files:** `static/global/cpas-hero-watercolor.css`, `src/api/render_home_section.js`, `static/pages/home/hero.html` (R2 fragment)

### 4. Home campaigns + newsletter

- Campaigns section reads **live `fundraising_campaigns`** from client dashboard (not static CMS seeds)
- Newsletter subscribe → admin alert + **`newsletter_welcome`** branded template via Resend
- `ADMIN_EMAIL` = `companionsCPAS@gmail.com`

**Key files:** `src/api/campaign_public.js`, `src/api/render_home_section.js` (campaigns), `migrations/20260707_home_campaigns_newsletter_email.sql`

### 5. Contact page (`/contact`)

- Converted from stale static page → **dynamic assembly** (`render_contact_page.js`)
- Plum-glass theme + global header/footer
- Split hero: copy left, **16:9 framed team photo** right (no gradient scrim, no full-bleed)
- Facebook / Instagram as **pill CTA buttons** (primary + ghost)
- Contact form + modals unified on **`contact_requests_v2`** + Resend + `email_logs` + dashboard notification
- Removed legacy duplicate `/api/contact` path in `payments_email.js`

**Key files:** `src/api/render_contact_page.js`, `static/global/cpas-contact.css`, `src/api/contact_api.js`

### 6. Git / deploy proof

| Commit | Time (CDT) | Summary |
|--------|------------|---------|
| `ce5dd59` | 6:36 PM | Home hero watercolor v2 |
| `72dae72` | 6:48 PM | Campaigns + newsletter email |
| `41480e2` | 6:56 PM | Global plum-glass header |
| `6355e1d` | 7:18 PM | Contact page + Resend pipeline |

All pushed to `origin/main`. Last worker deploy: **`ccd4ad51`**. CSS bust: **`contact-hero-16x9-20260707`**.

---

## Waiting on client approval (do not mark tasks done without sign-off)

| Item | Status | Notes |
|------|--------|-------|
| **Plum-glass theme direction** | 🟡 Prototype live | Client may love it or ask revert — tokens make rollback easy |
| **Home hero layout + copy** | 🟡 Prototype live | Send link tonight for approval; headline changed from "way out" |
| **Contact page layout** | 🟡 Prototype live | Split hero per wireframe; confirm photo crop at 16:9 |
| **Community nav visibility** | 🟡 Config-driven | Hidden on some routes via D1 `nav_visible` — confirm with client |
| **Logo final asset** | 🟡 Open question | Using CFI avatar; Lori to confirm final logo file |
| **Mission statement copy** | 🔴 Blocked | Task `todo_cpas_site_mission_statement` — awaiting official text |
| **Social handles list** | 🟡 Partial | FB + IG wired; full list TBD |
| **Stripe live keys** | 🔴 Blocked | Test mode; passkey reset follow-up (`todo_cpas_site_stripe_passkey_reset`) |
| **Newsletter welcome copy** | 🟡 Review | Template live; client may want tone tweaks |

**Suggested client message:**

> The site header and home/contact pages are live with the new plum theme prototype. Contact form messages go to companionsCPAS@gmail.com with auto-confirmations. Please review the home hero and contact layout when you have a moment and share any copy or photo tweaks.

---

## Task board reconciliation (migration 750 → dashboard)

Map open dashboard tasks to actual status:

| Task ID | Title | Dashboard status | Actual status (Jul 6 PM) |
|---------|-------|-------------------|--------------------------|
| `todo_cpas_site_logo_homepage` | Logo on homepage | Open | **Partial** — logo 2× in plum header; confirm final asset with Lori |
| `todo_cpas_site_admin_login_relocate` | Relocate admin login | Open | **Partial** — footer "Admin login" (small); review visibility |
| `todo_cpas_site_color_scheme` | Color scheme overhaul | Open | **Prototype shipped** — plum-glass; awaiting client approval |
| `todo_cpas_site_contact_us` | Add Contact Us | Open | **Done** — `/contact` live with form + Resend |
| `todo_cpas_site_mission_statement` | Mission statement | Open | **Blocked** — need client copy |
| `todo_cpas_site_social_links` | Social media links | Open | **Partial** — FB/IG on contact + footer |
| `todo_cpas_site_remove_chopper_foster` | Remove Chopper listing | Open | **Not verified tonight** |
| `todo_cpas_site_remove_foster_dogs_section` | Remove foster dogs section | Open | **Not verified tonight** |
| `todo_cpas_site_remove_transport_driver` | Remove Transport Driver | Open | **Not verified tonight** |
| `todo_cpas_site_remove_foster_coordinator` | Remove Foster Coordinator | Open | **Not verified tonight** |
| `todo_cpas_site_foster_apps_to_email` | Foster apps → Amanda email | Open | **Not verified tonight** |
| `todo_cpas_site_stripe_passkey_reset` | Stripe passkey reset | Open | **Blocked** — client action |
| `todo_cpas_oq_*` | Open questions (4) | Open | **Still open** — send to Lori/Michelle |

**Recommended:** Close or update tasks in Collaborate after client review; add new tasks for remaining pages (`/adopt`, `/community` theme alignment).

---

## CMS contract (non-negotiable — did we pass?)

**Rule:** Client must be able to edit sections/content in **their dashboard CMS** without developer shortcuts.

| Route | CMS path | Editable in dashboard? | Notes |
|-------|----------|------------------------|-------|
| `/` home | D1 `cms_page_sections` → R2 fragments | ✅ Yes | Hero, mission, campaigns, newsletter sections |
| `/about` | Fragment CMS | ✅ Yes | Standard section sync |
| `/contact` | **Static renderer** (exception) | ⚠️ Partial | HTML from `render_contact_page.js`; not yet section-by-section CMS. Styles in `cpas-contact.css`. **Gap to close.** |
| `/adopt`, `/donate`, etc. | Mixed | ⚠️ Varies | Header now global; page bodies may still need theme pass |

**Hero CTA gap:** Dashboard CTA href fields may not drive hero buttons — `config_json.cta_action` is SSOT for hero CTAs today.

**Section-by-section refinement path (next sessions):**
1. Edit in `/dashboard/cms/pages/{route}` on companionsofcaddo.org
2. Save → D1 → `home_cms_sync.js` / page registry → R2 fragment
3. `salvage-resync.mjs` or publish endpoint → KV bust
4. Verify live route

---

## Architecture quick reference

### Publish pipeline

```
D1 (cms_pages, cms_page_sections, cms_page_content_blocks)
  → sync scripts / CMS API save
  → R2 fragments (static/pages/{route}/sections/*.html)
  → assembleHomeFromFragments / assembleAboutFromFragments / render_contact_page
  → KV page:{route} cache
  → Worker servePublicPage()
  → companionsofcaddo.org
```

### Global header (live SSOT)

- **Renderer:** `src/api/render_site_nav.js` → `renderSiteHeader()`
- **Not** `static/global/cpas-header.html` for assembled pages (legacy R2 artifact may exist)
- Nav visibility: D1 `cms_pages.nav_visible` per route

### Contact email pipeline (live SSOT)

```
POST /api/contact  OR  POST /api/contact/request
  → contact_api.js → contact_requests_v2 (D1)
  → sendResend (confirmation to submitter)
  → sendTemplateEmail contact_request_notify (admin)
  → notifyContactRequest → dashboard_notifications
  → email_logs row
```

### Theme resolution

- `resolveRouteTheme()` in `render_page.js` — default `plum_glass`
- Body class: `theme-plum-glass` via `themeClassName()`

---

## Progress snapshot

```
Public visual refresh:     ████████████████░░░░  ~80%
CMS editability (contact): ████████░░░░░░░░░░░░  ~40%
Client content approval:   ████░░░░░░░░░░░░░░░░  ~20%
Community page cleanup:    ██░░░░░░░░░░░░░░░░░░  ~10%
Stripe production:         ░░░░░░░░░░░░░░░░░░░░   0% (blocked)
```

---

## Next session priorities (ordered)

1. **Client prototype review** — home hero + contact + plum theme (email Lori/Michelle link)
2. **Update collaborate tasks** — close done items; add `/adopt` theme alignment task
3. **Contact → CMS fragments** — move contact hero/body into `cms_page_sections` for dashboard editing
4. **Community page** — execute Lori tasks (Chopper removal, foster section removal, Amanda email)
5. **Start in-app timer** — use project dashboard Start on `proj_companions_cpas_web` for accurate burn
6. **Optional:** ingest this doc → `client_project_semantic_search` after edit freeze

---

## How to use this doc in the project dashboard

1. **Memory** — paste the Identity spine + Progress snapshot + Waiting on client approval sections
2. **Instructions** — keep AGENTSAM.md pointer + "read PROJECT_STATUS before continuing redesign"
3. **Files** — attach or ingest this file: `docs/clients/companionscpas/PROJECT_STATUS_2026-07-06.md`
4. **Tasks** — bulk-update `agentsam_todo` rows per Task board reconciliation table above

---

## Related docs

| Doc | Path |
|-----|------|
| Agent rules SSOT | `docs/clients/companionscpas/AGENTSAM.md` |
| Project brief | `docs/clients/companionscpas/project-brief.md` |
| Operations runbook | `docs/clients/companionscpas/runbook.md` |
| CMS publish pattern | `docs/patterns/cms-fragment-publish-pipeline.md` |
| Client repo HANDOFF | `companionscpas/docs/HANDOFF.md` |

---

*Generated for IAM project `proj_companions_cpas_web` · Inner Animal Media · Jul 6, 2026 7:21 PM CDT*
