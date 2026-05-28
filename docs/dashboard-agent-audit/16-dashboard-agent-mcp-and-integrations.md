---
title: "Dashboard Agent — MCP and Integrations"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# MCP and integrations (agent workbench)

## Two surfaces (do not conflate)

| Surface | API | Registry |
|---------|-----|----------|
| **MCPPanel** (sidebar) | `GET /api/mcp/tools`, `POST /api/mcp/invoke` | `agentsam_tools` lane `develop` |
| **Agent chat tools** | `POST /api/agent/chat` SSE | `agentsam_tools` via `listAgentsamToolsForContext` / `validateToolCall` |

Remote MCP execution: `agentsam_tools.mcp_service_url` or `linked_mcp_tool_id` → `executeMcpCatalogRow` → `agentsam_mcp_tools` row.

## Execution ledger

`src/core/mcp-tool-execution.js` → **`agentsam_mcp_tool_execution`** (status, `requires_approval`, `agent_run_id`, `conversation_id`).

Requires **`MCP_AUTH_TOKEN`** for `POST /api/mcp/invoke` — 503 if unset.

## Scoped MCP lookup

`src/core/agentsam-mcp-tools.js` — `enabled=1`, `is_active=1`, tenant/workspace scope.

Branded catalog: `mcp-tools-branded.js` / view `v_agentsam_mcp_tools_branded` when present.

## OAuth integrations (workbench context)

| Integration | UI | Start URL |
|-------------|-----|-----------|
| GitHub | `GitHubExplorer.tsx` | `/api/oauth/github/start?return_to=/dashboard/agent` |
| Google Drive | `GoogleDriveExplorer.tsx` | `/api/oauth/google/start?connectDrive=1&return_to=...` |

Used for explorer saves and tool auth — not the same as MCP bearer tokens.

## Production blockers

| Blocker | Impact |
|---------|--------|
| MCPPanel ≠ chat catalog | Tool works in panel but not in chat (missing `agentsam_tools` row) |
| `MCP_AUTH_TOKEN` missing | Manual MCP invoke 503 |
| Degraded MCP rows | Excluded from scoped select |
| Ledger best-effort | Failures only in logs |

## Cursor gap

Chat should treat MCP tools like local tools with **one dispatch path** and visible execution log; today panel and chat are **split registries**.

## Files

`MCPPanel.tsx`, `mcp-tool-execution.js`, `catalog-tool-executor.js`, `dispatch-by-tool-code.js`, `src/api/mcp.js`
