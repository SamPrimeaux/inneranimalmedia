# R2 structure (inneranimalmedia bucket)

> **Source path (2026-05-28):** Canonical Agent UI is **`dashboard/`** (`dashboard/App.tsx`), not `agent-dashboard/`. Deploy: `npm run deploy:frontend` → `dashboard/dist` → R2 `static/dashboard/app/`. See **[AGENT_DASHBOARD.md](./AGENT_DASHBOARD.md)**. Content below may reference retired paths.

---

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
