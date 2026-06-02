# Open-web search — `agentsam_tools.handler_type` strategy

## Two distinct surfaces (do not mix)

| Surface | `handler_type` | Binding / secret | Tools |
|---------|----------------|------------------|-------|
| Browser / DOM / MYBROWSER | `mybrowser` | `env.MYBROWSER` | `browser_navigate`, `cdt_*`, `playwright_screenshot`, … |
| Open web (Tavily + fetch) | `websearch` | `env.TAVILY_API_KEY` (+ Worker `fetch` for URLs) | `search_web`, `web_fetch` |

Executor: `catalog-tool-executor.js` — `case 'websearch'` → `open-web-catalog-dispatch.js` → `web.js` (never MCP, never MYBROWSER).

Dashboard BrowserView uses `mybrowser` tools via `POST /api/browser/invoke` only for DevTools/picker/screenshots — not for passive iframe browsing.

## Canonical D1 rows (migration 501+)

| Field | `search_web` | `web_fetch` |
|--------|----------------|-------------|
| `handler_type` | `websearch` | `websearch` |
| `tool_category` | `research.web` | `research.web` |
| `execution_lane` (in `handler_config`) | `open_web_search` | `web_fetch` |
| `dispatch_target` | `search_web` | `web_fetch` |
| `web_backend` | `tavily` | — |
| `not_browser` | `true` | `true` |

## Legacy (pre-501)

Rows used `handler_type = ai` with `execution_lane` in `handler_config`. Executor still accepts `ai` + open-web metadata for backward compatibility.

## Inspect constraint

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command "
SELECT sql FROM sqlite_master WHERE type='table' AND name='agentsam_tools';
"
```

Verify rows:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command "
SELECT tool_name, handler_type, json_extract(handler_config, '$.execution_lane') AS lane
FROM agentsam_tools WHERE tool_name IN ('search_web','web_fetch');
"
```
