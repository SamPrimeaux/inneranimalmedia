# Session summary: 2026-03-23 through 2026-03-24 (shell, RAG, deploys)

Executive snapshot for the next working session.

## Starting point

- Agent dashboard shell existed with topbar and sidenav; need in-app navigation for non-agent pages without losing chat context.
- Pre-prompt RAG for Agent Sam was wired to an incorrect Cloudflare AI Search REST path (`ai-search/indexes/.../query`), producing 404.
- `knowledge_search` tool path could still retrieve via binding + D1.
- `context_search_log` schema missing columns used by worker (`scope`, `query_snippet` per session log).

## Shipped or completed (bullets)

- **Shell navigation:** Desktop intercept on sidenav/footer/settings links dispatches `iam_shell_nav` with `embedded=1` on target URLs (`dashboard/agent.html`).
- **React:** `AgentDashboard.jsx` listens for `iam_shell_nav`, opens preview on Browser tab, sets `shellNavActive`.
- **FloatingPreviewPanel:** Hides browser URL bar when `shellNavActive` is true.
- **Worker:** `respondWithDashboardHtml` injects `body.embedded` script for `?embedded=1` on dashboard HTML from R2 (`worker.js` ~3963-3978).
- **CSS:** `static/dashboard/shell.css` rules for `body.embedded` hide topbar/sidenav/footer chrome.
- **Dashboard versions:** Cache bust progression **v129 to v133** documented in `docs/cursor-session-log.md`.
- **D1:** Remote migrations for `context_search_log` columns; deployment rows for each asset/worker drop.
- **Agent core:** LIVE DATA RULE added to compiled system context (`agentSamSystemCore`); deployed.
- **Pre-prompt RAG:** Switched to AutoRAG REST then corrected to **AI Search instances API** `POST .../ai-search/instances/iam-autorag/search` with `messages` + `ai_search_options.retrieval.max_num_results`, parsing **`result.chunks`**. Same for `autoragAiSearchQuery` REST fallback. `RAG_MIN_QUERY_WORDS` lowered to **4**.
- **Git:** Pushed commits listed below.

## Worker version IDs (recent)

| Deploy theme | Version ID |
|--------------|------------|
| Embedded nav + shell v131 | `f96977ff-b3b0-412b-9011-eeb969345511` |
| Shell nav fixes v133 | `141fd76c-f8df-447f-9e89-f91dee3770aa` |
| LIVE DATA RULE | `75d2ca4d-9d14-43bc-839e-4a8c1a4fa86e` |
| AutoRAG REST pre-prompt | `d50fea8e-ec07-4cb6-8ae8-1838b0359e75` |
| AI Search instances URL fix | `a0e5a6f7-1455-41a5-a268-71107e6f05e5` |

## Known issues / watch

- Confirm **`AI_SEARCH_TOKEN`** and **`CLOUDFLARE_API_TOKEN`** have **AI Search Run** (or equivalent) permissions; tail `/api/agent/chat` for 403/401 on RAG fetch.
- MCP-dependent tools (`cdt_*`, etc.) need healthy MCP server; worker-native tools work independently.
- **`browser_navigate` / `browser_content`** appear in `BUILTIN_TOOLS` set in worker but are not in the 73-row D1 list — treat as edge cases if schemas reference them.

## Next session priorities (suggested)

- Tail production after RAG URL fix; confirm `rag_context_chars` telemetry non-zero on long user queries.
- Optional: refresh AutoRAG index after uploading new `autorag/knowledge/*` markdown (dashboard or `wrangler ai-search` if available).
- Review `deploy-with-record.sh` vs asset-only flows when changing only `agent.html`.

## Git commits (2026-03-22 to 2026-03-25 window)

```
947975d fix: AutoRAG correct API endpoints, instances not indexes
f64f09b fix: agent/chat pre-prompt RAG via AutoRAG REST (AI_SEARCH_TOKEN, 4-word gate)
a1bb996 fix: LIVE DATA RULE in agentSamSystemCore, context_search_log migration
29b1524 docs: session log v133 shell-nav deploy
5730212 fix: draw href, embedded pages handler, URL bar suppression, gear to header
7a7ee3b feat: sidenav shell restructure — Claude/Cursor hybrid layout
ec95987 deploy: embedded dashboard HTML + shell v131 + worker respondWithDashboardHtml
c64bcbf feat: topbar trim, sidenav footer, iam_shell_nav intercept
2a13f77 docs: session log — wrangler.jsonc push note
abe028c chore(wrangler): inneranimal-dashboard sandbox config (R2 sandbox bucket, full bindings, no routes/queues)
2b2afbd Worker: agentsam API routing and CICD cicd follow-ups; MCP health; dashboard and docs sync
```

## This knowledge upload

Five markdown objects under `autorag` bucket prefix `knowledge/` document shell architecture, Agent Sam tools, platform stack, worker routing, and this summary for AI Search re-indexing.
