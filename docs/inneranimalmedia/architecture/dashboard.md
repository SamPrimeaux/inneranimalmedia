# Dashboard architecture

> **Source path (2026-05-28):** Canonical Agent UI is **`dashboard/`** (`dashboard/App.tsx`), not `agent-dashboard/`. Deploy: `npm run deploy:frontend` → `dashboard/dist` → R2 `static/dashboard/app/`. See **[AGENT_DASHBOARD.md](./AGENT_DASHBOARD.md)**. Content below may reference retired paths.

---

Unified Agent Sam dashboard SPA with React Router.

## Shell and bundle

- HTML: R2 `dashboard/app/agent.html` (or `static/dashboard/agent.html` fallback); Worker `SPA_ROUTES` selects shell per segment.
- JS/CSS: `/static/dashboard/agent/agent-dashboard.js` and `.css` from Vite build in `agent-dashboard/agent-dashboard/`.

## Routing

- Client routes in `App.tsx` (`/dashboard/overview`, `/dashboard/agent`, `/dashboard/meet`, etc.).
- Session required for `/dashboard/*` HTML; unauthenticated users redirect to `/auth/login`.

## See also

- `docs/dashboard/README.md` in repo (route-to-file map).
