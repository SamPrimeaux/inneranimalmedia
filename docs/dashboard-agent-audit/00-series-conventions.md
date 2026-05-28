# Chunk 00 — Series conventions

**Status:** Live-code verified

## Purpose

Define how this series documents **only** the live `/dashboard/agent` workbench served from **`dashboard/`** at **inneranimalmedia.com/dashboard/agent**.

## Live production scope

Every chunk answers: *What does a user hitting `/dashboard/agent` actually load, and what APIs does that page call?*

## Existing live code paths

| Layer | Path |
|-------|------|
| UI package | `dashboard/` (`dashboard/package.json` → `inneranimalmedia-dashboard`) |
| SPA entry | `dashboard/App.tsx` |
| Agent routes | `dashboard/lib/agentRoutes.ts` |
| Build output | `dashboard/dist/` |
| Production R2 | `static/dashboard/app/` via `scripts/deploy-frontend.sh` |
| Worker static resolver | `src/core/dashboard-r2-assets.js` |
| Worker entry | `src/index.js` → `src/core/production-dispatch.js` |
| E2E | `tests/e2e/dashboard-agent-workbench.spec.ts` |

## What is ALREADY engineered

- Single SPA serves `/dashboard/agent` with eager-loaded agent shell (not a separate `agent-dashboard` bundle).
- Production frontend deploy pipeline: `npm run deploy:frontend`.
- Worker aliases legacy `/static/dashboard/agent/*` asset URLs to canonical `app/` keys.
- Documented canonical reference: `docs/AGENT_DASHBOARD.md`.

## What is PARTIALLY engineered

- Series coverage: chunks 01, 03, 22, 25 verified; others Draft until `rg` pass.
- Cross-chunk repair tracking depends on chunk 25 staying current.

## What is BROKEN

- **Documentation drift:** Older `docs/**` files may still mention `agent-dashboard/` — use banner + this series, not those paths for repair work.

## UX reality today

Operators use one URL: `/dashboard/agent`. Desktop = IDE layout; mobile = constrained (see chunk 03). This series does not describe any other product surface unless the agent SPA imports it on that route.

## Data / event / execution flow

```text
GET /dashboard/agent
  → Worker: getDashboardSpaHtmlShell (R2)
  → Browser loads /static/dashboard/app/*.js (dashboard/dist)
  → React: isAgentShellPath → App.tsx agent layout
  → User actions → fetch /api/* (per chunk)
```

## Validation commands

```bash
test -d dashboard && test ! -d agent-dashboard && echo OK
rg -n "isAgentShellPath|AGENT_HOME_PATH" dashboard/lib/agentRoutes.ts dashboard/App.tsx
rg -n "DASHBOARD_STATIC_APP_PREFIX" src/core/dashboard-r2-assets.js
head -5 scripts/deploy-frontend.sh | rg -n "DIST|PREFIX" || rg -n "^DIST=|^PREFIX=" scripts/deploy-frontend.sh
cd dashboard && npm run build
```

## Acceptance criteria

- [ ] Reader can name the only UI source directory (`dashboard/`).
- [ ] Reader can name production R2 prefix (`static/dashboard/app/`).
- [ ] Reader knows `agent-dashboard/` is not served.
- [ ] Every other chunk links back to this scope rule.

## Repair backlog IDs

| ID | Title | Paths | Expected | Validation |
|----|-------|-------|----------|------------|
| B00-001 | Deprecate agent-dashboard paths in active runbooks | `docs/**` | All active deploy docs point at `dashboard/` | `rg agent-dashboard docs --glob '*.md' \| wc -l` trending down |

## Immediate next implementation step

Read chunk **01** (shell), then chunk **03** (mobile) before any mobile or browser UX change.
