# Work page — scroll globe scene (handoff)

**Live:** [inneranimalmedia.com/work](https://inneranimalmedia.com/work)  
**Product reference:** [moviemode.inneranimalmedia.com](https://moviemode.inneranimalmedia.com/) (same scene + optional **Tweaks** panel for preview)

## What shipped (2026-06-12)

The first three CMS sections on `/work` (hero, case-study-one, case-study-two, case-study-three) were replaced by one scroll-controlled **globe scene**. Case-study-four through portfolio-close remain as editable CMS blocks.

| Public `/work` | `moviemode.inneranimalmedia.com` |
|----------------|----------------------------------|
| No tweaks toggle | Tweaks panel (glass, tint, motion) |
| Work-specific hero + card copy | MovieMode studio CTA |
| Assets on main worker ASSETS | Assets on moviemode-service `public/` |

## File map (inneranimalmedia monorepo)

| Path | Role |
|------|------|
| `static/pages/work/index.html` | R2 key `pages/work/index.html` — page shell + CMS sections |
| `static/assets/scenes/work-globe/work-globe.css` | Scoped styles under `#globe-section` |
| `static/assets/scenes/work-globe/globe.js` | Three.js procedural globe (`window.GlobeScene`) |
| `static/assets/scenes/work-globe/scroll.js` | Scroll choreography; skips tweaks if `#tweak-toggle` absent |
| `static/assets/scenes/work-globe/charts.js` | SVG mini-charts on cards |
| `scripts/upload-work-page.sh` | Upload page + scene assets to R2 (**no worker redeploy**); scene R2 keys are `scenes/work-globe/*` (not `assets/scenes/…`) |
| `src/index.js` | `ASSET_ROUTES['/work']` → `pages/work/index.html` + iam-header/footer inject |

Worker serves scene JS/CSS via `/assets/*` passthrough (`ASSETS.get(key)`). Paths under `/assets/scenes/*` are listed in `PUBLIC_OAUTH_PATHS` (`src/core/public-oauth-paths.js`) so unauthenticated visitors are not blocked with `SESSION_MISSING` (401).

**CSS note:** `#globe-section` and `.stage-wrap` are the **same element** — scroll height (`380svh`) must be on `#globe-section`, not a descendant selector.

## Deploy (public page only)

```bash
./scripts/upload-work-page.sh
```

Verify:

```bash
curl -sS 'https://inneranimalmedia.com/work' | rg 'globe-section|tweak-toggle'
# expect globe-section, no tweak-toggle
```

## CMS structure (`data-cms-section`)

| Section id | Visible on public `/work` | Notes |
|------------|---------------------------|--------|
| `work-globe-scene` | Yes (replaces 3 sections) | Scroll scene; editor preview can mount tweaks later |
| `case-study-four` | Yes | Light section; header switches to light chrome via IntersectionObserver |
| `approach` | Yes | |
| `outcomes` | Yes | |
| `portfolio-close` | Yes | |

HTML comment at top of globe block documents replacement mapping for CMS tooling.

**Next build target:** `/dashboard/agent` (or dedicated CMS editor) hydrates `cms_page_sections` for route `/work` and writes back to `pages/work/index.html` in R2 — same pattern as `/contact` (`loadPublishedCmsSectionsByRoute`).

## moviemode-service (subdomain / `/globe` proxy)

- **Repo:** [github.com/SamPrimeaux/moviemode-service](https://github.com/SamPrimeaux/moviemode-service) · mirror: `services/moviemode-service/`
- **Deploy:** `cd services/moviemode-service && npx wrangler deploy -c wrangler.toml` (always `-c wrangler.toml`)
- **Slim worker:** landing `public/` + legacy `/meaux*` only; encode APIs stay on main worker
- **Main worker:** `MOVIEMODE_SERVICE` binding · `GET /globe` → proxy (`src/core/moviemode-service-proxy.js`)

Sync monorepo → product repo:

```bash
cd services/moviemode-service && IAM_ROOT=../.. npm run sync
```

## MovieMode PTY / render lane

Remotion export runs on PTY, not in the Worker:

1. Dashboard/API queues job → `moviemode_render_jobs`
2. `src/api/moviemode-api.js` → `execOnPtyHost` → `scripts/moviemode-remotion-render.mjs`
3. Script POSTs to `/api/moviemode/ingest` → ARTIFACTS R2 + D1

**Terminal resolution (D1 `terminal_connections`):** `is_default DESC, target_priority ASC` per `user_id` + `workspace_id`. Sam primary: `conn_mac_local` → `wss://localpty.inneranimalmedia.com`; fallback: `conn_mac_shell2` → GCP VM.

See `.cursor/rules/iam-terminal-connections.mdc` and `docs/MOVIEMODE.md`.

## Tomorrow — efficient pickup

1. **CMS editor:** wire `/work` sections to D1 + R2 write path (contact hydrate pattern).
2. **Editor preview:** load same globe assets with `#tweak-toggle` for internal tuning only.
3. **MovieMode utilisation:** trigger render from `/dashboard/moviemode`; confirm PTY repo validation (`validateMoviemodeRepoOnPty`).
4. **Optional:** `npm run build:all` on moviemode-service for `/studio/` on subdomain.
