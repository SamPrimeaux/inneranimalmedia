---
title: "Dashboard Agent Audit — Series Conventions"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Series conventions

**Live surface:** `https://inneranimalmedia.com/dashboard/agent`  
**Canonical bundle:** R2 `inneranimalmedia` → `static/dashboard/app/*` (Vite `base` in `dashboard/vite.config.ts`)  
**SPA host:** `dashboard/App.tsx` when `isAgentShellPath()` (`dashboard/lib/agentRoutes.ts`)

## Scope rule

Every claim must trace to code that serves `/dashboard/agent`. No D1 dumps, no full `agentsam_commands` catalogs, no speculative platform plans.

## Chunk tiers

| Tier | Files | Target size |
|------|-------|-------------|
| **Deep** | 07, 09, 10, 12, 13, 14, 16, 02, 22 | End-to-end UI → API → Worker → D1/tool |
| **Foundational** | 00–03 | Shell, deploy, mobile |
| **Reference** | 04–06, 08, 11, 15, 17–20 | 2–5 KB route/component pointers only |
| **Intelligence** | 21–25 | Routing, memory, workflows, validation, backlog |

## Trace format (deep chunks)

1. **Entry** — React component + route  
2. **Request** — method, path, headers, body fields  
3. **Worker** — `src/api/agent.js` or `production-dispatch.js` handler  
4. **Data** — D1 tables (columns that affect behavior only)  
5. **SSE/events** — event `type` strings both sides  
6. **Failure modes** — production blockers  
7. **Cursor gap** — one paragraph vs target UX  

## Validation (repo)

Run before marking audit work done:

```bash
rg "BrowserView|iam-browser|browser_navigate" dashboard src docs
rg "workspace_state|active_file|openInEditor" dashboard src
rg "tool_start|tool_done|EventSource|SSE" dashboard src
rg "ToolApprovalModal|requires_approval|tool_blocked" dashboard src
rg "MYBROWSER|browser-cdp|api/browser/invoke" dashboard src
rg "XTermShell|runInTerminal|pty" dashboard src
rg "agentsam_tools|agentsam_mcp_tools|agentsam_tool_call_log" src docs
cd dashboard && npm run build
```

`npm run lint` / `npm run typecheck` are **not** defined at repo root (2026-05-28); use `dashboard` build + Playwright spec below.

## R2 mirror (AutoRAG)

Copy completed `.md` to bucket **`inneranimalmedia-autorag`**, prefix:

`knowledge/agentsam/dashboard-agent-audit/<filename>`

See `r2-upload-manifest.json` and `r2-upload-notes.md` in this folder.

## Product bar

**Cursor-quality orchestration:** ask → execute → visible progress → read-only tools without noisy approval → dependable PTY fallback → honest cost/model visibility.
