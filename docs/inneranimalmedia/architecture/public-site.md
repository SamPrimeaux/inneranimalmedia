# Public site architecture

Inner Animal Media marketing and public pages served from the Worker and R2.

## Sources of truth

- Version-controlled HTML under `static/pages/` (uploaded to R2 **ASSETS**), e.g. `static/pages/work/index.html` → `pages/work/index.html`.
- Scene assets under `static/assets/` (e.g. `static/assets/scenes/work-globe/` for `/work` scroll globe).
- Worker `ASSET_ROUTES` in `src/index.js` maps paths to R2 keys; injects `iam-header.html` / `iam-footer.html` via HTMLRewriter.
- Upload scripts: `scripts/upload-work-page.sh`, `scripts/upload-contact-page.sh`, etc. — R2 only, no worker redeploy.

See **`docs/platform/work-globe-scene.md`** for `/work` globe + CMS handoff.

## Flow

1. Browser requests `GET /` or marketing path.
2. Worker resolves to static HTML (R2 or bundled path) with caching rules per content type.

## Related

- `deployment.md` for promote and build pipeline.
- `r2-structure.md` for bucket keys vs URLs.
