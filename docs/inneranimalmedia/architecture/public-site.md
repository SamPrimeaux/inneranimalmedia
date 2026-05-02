# Public site architecture

Inner Animal Media marketing and public pages served from the Worker and R2.

## Sources of truth

- Repo HTML under `pages/` (home, about, services, etc.) and `public-homepage/` where applicable.
- Worker maps paths to R2 **ASSETS** / public keys; see `worker.js` and routing docs.

## Flow

1. Browser requests `GET /` or marketing path.
2. Worker resolves to static HTML (R2 or bundled path) with caching rules per content type.

## Related

- `deployment.md` for promote and build pipeline.
- `r2-structure.md` for bucket keys vs URLs.
