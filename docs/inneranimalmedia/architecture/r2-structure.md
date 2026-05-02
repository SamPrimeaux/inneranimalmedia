# R2 structure (inneranimalmedia bucket)

Canonical keys used by the main Worker and CI.

## Dashboard app

- `dashboard/app/agent.html` — SPA shell (Vite `dist/index.html` upload).
- `dashboard/app/*` — built assets (`agent-dashboard.js`, `agent-dashboard.css`, chunk files).

## Docs (this tree)

- `docs/**` — internal documentation objects (markdown). Public access may be enabled on the bucket; do not store secrets here.

## Other prefixes

- Align with `worker.js` static paths: `static/dashboard/*` legacy keys where still referenced.
- Marketing assets: see ASSETS binding usage vs `inneranimalmedia-assets` for public site (separate bucket).

## Upload discipline

- See `runbooks/r2-upload-rules.md`.
