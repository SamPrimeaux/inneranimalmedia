---
title: "Dashboard Agent — E2E Validation"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# E2E validation

## Playwright (live production)

**Spec:** `tests/e2e/dashboard-agent-workbench.spec.ts`

```bash
export IAM_SESSION='<raw session cookie value>'
export IAM_BASE_URL='https://inneranimalmedia.com'
npx playwright test tests/e2e/dashboard-agent-workbench.spec.ts
```

Checks:

1. `/dashboard/agent` loads (<500)  
2. Composer `Message Agent Sam...` visible  
3. Send `hello` → `window.__IAM_AGENT_LAST_STREAM_DEBUG.done_received`  
4. Stream debug metadata (`streamDebug.ts`)

Failure artifact: `reports/ai-smoke/dashboard-agent-browser-workbench-failure.png`

## Python smoke

`scripts/smoke_dashboard_agent_browser_workbench.py` — companion for CI-style reports.

## Deploy validation (mandatory for ship)

1. `curl /health` — necessary, **not sufficient**  
2. Fetch `/dashboard/agent` HTML → extract `/static/dashboard/app/*.js` → each **200**  
3. Playwright screenshot + **console** free of `ReferenceError` / import 404  
4. Body contains agent shell markers (composer, workbench chrome)

Quality flags: `HEALTH_ONLY_FALSE_SUCCESS`, `R2_CHUNK_404`, `BLANK_SCREEN`, `CONSOLE_RUNTIME_ERROR`, `MISSING_PLAYWRIGHT_PROOF`.

## Build validation (2026-05-28 run)

```bash
cd dashboard && npm install && npm run build
```

**Result:** `vite build` succeeded (~17s); output under `dashboard/dist/` (`dashboard.js` ~1.15 MB).

Repo has **no** `npm run lint` or `npm run typecheck` scripts at root (`package.json` / `dashboard/package.json`).

## Grep regression pack

Documented in `00-series-conventions.md` — run after touching chat, browser, terminal, or tools.

## Cursor gap

E2E proves **one happy chat**; does not cover approvals, browser MYBROWSER, PTY WS, or save matrix — extend spec incrementally, not bloated audit docs.
