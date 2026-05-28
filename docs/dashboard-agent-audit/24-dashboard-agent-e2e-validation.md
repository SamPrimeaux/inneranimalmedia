# Chunk 24 — E2E validation

**Status:** Draft

## Purpose
How we prove /dashboard/agent works after deploy — not health-only.

## Live production scope
tests/e2e/dashboard-agent-workbench.spec.ts + deploy rules. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- tests/e2e/dashboard-agent-workbench.spec.ts
- dashboard/components/ChatAssistant/streamDebug.ts
- .cursor/rules agentsam-d1-cursor-session-sync — HEALTH_ONLY_FALSE_SUCCESS

## What is ALREADY engineered
Live test: session cookie, composer, SSE debug global.

## What is PARTIALLY engineered
No mobile viewport E2E in repo.

## What is BROKEN
CI may skip without IAM_SESSION.

## UX reality today
QA needs session secret for live run.

## Data / event / execution flow
deploy:frontend → playwright → stream debug JSON

## Validation commands
```bash
cat tests/e2e/dashboard-agent-workbench.spec.ts
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
Add chunk URL 200 check script post-deploy.
