# Chunk 13 — Browser tools backend (MYBROWSER)

**Status:** Draft

## Purpose
Worker-side browser automation distinct from BrowserView iframe.

## Live production scope
POST /api/browser/invoke, runBrowserBuiltinTool, sessions. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- src/integrations/browser-cdp.js
- src/integrations/playwright.js
- src/integrations/browser-session.js
- src/tools/builtin/web.js
- wrangler.production.toml MYBROWSER

## What is ALREADY engineered
invoke, screenshots to R2, run-scoped sessions, trusted origin check.

## What is PARTIALLY engineered
Automation should be intentional — chat sets automation flag.

## What is BROKEN
B13-001 navigate failures; 503 if MYBROWSER unbound.

## UX reality today
Operators see screenshot overlay not live DOM when agent automates.

## Data / event / execution flow
Chat tool → invoke → MYBROWSER → screenshot_url → SSE → BrowserView overlay

## Validation commands
```bash
rg runBrowserBuiltinTool src/integrations
rg MYBROWSER wrangler.production.toml
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
| ID | Title | Paths | Expected | Validation |
|----|-------|-------|----------|------------|
| B13-001 | browser_navigate failure triage | browser-cdp.js | Actionable errors | tool trace |

## Immediate next implementation step
Log taxonomy for browser_navigate errors in D1 agentsam_error_events.
