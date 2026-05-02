# Agent Sam capabilities (inneranimalmedia worker)

## Tool inventory (73 from D1)

Tools are loaded at `/api/agent/chat` from `mcp_registered_tools` where `enabled = 1` (`worker.js` approximately line 7656). Remote D1 count: **73 rows** (verified via `wrangler d1 execute` on `inneranimalmedia-business`).

Runtime addition: when the user attaches **binary** files, the worker may append **`attached_file_content`** (not in D1) so the model can request base64 payload by filename.

### Alphabetical list (tool_name, tool_category)

| Tool | Category |
|------|----------|
| a11y_audit_webpage | quality |
| a11y_get_summary | quality |
| browser_screenshot | browser |
| cdt_click | browser_control |
| cdt_close_page | browser_navigation |
| cdt_drag | browser_control |
| cdt_emulate | browser_emulation |
| cdt_evaluate_script | browser_debug |
| cdt_fill | browser_control |
| cdt_fill_form | browser_control |
| cdt_get_console_message | browser_debug |
| cdt_get_network_request | browser_network |
| cdt_handle_dialog | browser_control |
| cdt_hover | browser_control |
| cdt_list_console_messages | browser_debug |
| cdt_list_network_requests | browser_network |
| cdt_list_pages | browser_navigation |
| cdt_navigate_page | browser_navigation |
| cdt_new_page | browser_navigation |
| cdt_performance_analyze_insight | browser_performance |
| cdt_performance_start_trace | browser_performance |
| cdt_performance_stop_trace | browser_performance |
| cdt_press_key | browser_control |
| cdt_resize_page | browser_emulation |
| cdt_select_page | browser_navigation |
| cdt_take_screenshot | browser_debug |
| cdt_take_snapshot | browser_debug |
| cdt_upload_file | browser_control |
| cdt_wait_for | browser_navigation |
| cf_images_delete | integrations |
| cf_images_list | integrations |
| cf_images_upload | integrations |
| cloudconvert_create_job | file_conversion |
| cloudconvert_get_job | file_conversion |
| context_chunk | context |
| context_extract_structure | context |
| context_optimize | context |
| context_progressive_disclosure | context |
| context_search | context |
| context_summarize_code | context |
| d1_query | database |
| d1_write | database |
| gdrive_fetch | integrations |
| gdrive_list | integrations |
| generate_daily_summary_email | ops |
| generate_execution_plan | execute |
| get_deploy_command | platform |
| get_worker_services | platform |
| github_file | integrations |
| github_repos | integrations |
| human_context_add | context |
| human_context_list | context |
| imgx_edit_image | image |
| imgx_generate_image | image |
| imgx_list_providers | image |
| knowledge_search | query |
| list_clients | platform |
| list_workers | platform |
| meshyai_get_task | ai_3d_generation |
| meshyai_image_to_3d | ai_3d_generation |
| meshyai_text_to_3d | ai_3d_generation |
| platform_info | platform |
| playwright_screenshot | browser |
| r2_bucket_summary | storage |
| r2_list | storage |
| r2_read | storage |
| r2_search | storage |
| r2_write | storage |
| telemetry_log | telemetry |
| telemetry_query | telemetry |
| telemetry_stats | telemetry |
| terminal_execute | terminal |
| worker_deploy | platform |

## Real vs dependency-heavy tools

**Worker-native / direct bindings (typical path in `runToolLoop`):**

- Storage: `r2_*`, D1: `d1_query`, `d1_write`.
- Terminal: `terminal_execute` (HTTP exec fallback — see below).
- Browser screenshots: `playwright_screenshot`, `browser_screenshot` when `MYBROWSER` and `DASHBOARD` are bound.
- Google Drive / GitHub file tools when user OAuth tokens exist.
- `knowledge_search` merges D1 KB with `autoragAiSearchQuery` (AI_SEARCH binding or REST fallback).
- `generate_execution_plan`, various `context_*`, `telemetry_*`, `platform_info`, `list_workers`, `worker_deploy`, `get_deploy_command`, `get_worker_services`, `list_clients`, Cloudflare Images, imgx, meshy (approval-gated), daily summary email — implemented in worker branches with env/DB checks.

**MCP-routed (`cdt_*` and others):** Routed through MCP invocation paths; require MCP server health and tokens. If MCP is down, these return errors.

**Debug chat mode:** `filterToolsByMode` can restrict to a small allowlist (`terminal_execute`, `d1_query`, `r2_read`, `r2_list`, `knowledge_search`) when mode is `debug` (`worker.js` approximately lines 4521-4528).

## Tool loop

- Function: `runToolLoop` (`worker.js` approximately line 4880).
- **`MAX_ROUNDS = 8`** tool iterations per chat completion.
- Providers with tools: `anthropic`, `openai`, `google` (`supportsTools` check).
- Intent classification (Anthropic): `classifyIntent` runs before rounds; logged to `agent_execution_plans` / intent tables when DB available.

## Auto mode model routing

- **`selectAutoModel`** (`worker.js` approximately lines 250-300): calls `classifyIntent`, maps intent to tier via **`INTENT_TO_TIER`** (`question` or `simple_query` to budget, `sql`/`shell`/`action`/`mixed` to standard, `code_generation`/`planning` to premium, `architecture` to max).
- Picks cheapest model in tier from **`MODEL_COST_TIERS`** (keys include `gemini-2.5-flash`, `gpt-4o-mini`, `claude-haiku-4-5-20251001`, `gpt-4o`, `claude-sonnet-4-20250514`, `claude-opus-4-6`).
- Resolves row from **`ai_models`** in D1; falls back to Haiku if missing.

## RAG pipeline

1. **Pre-prompt RAG (agent mode only):** Before the model call, if `chatMode === 'agent'`, `env.AI_SEARCH_TOKEN` set, and last user message has at least **4 words**, worker POSTs to Cloudflare AI Search:
   - URL pattern: `https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai-search/instances/iam-autorag/search`
   - Body: `messages: [{ role: 'user', content }]` and `ai_search_options.retrieval.max_num_results: 5`
   - Parses **`result.chunks`** and joins `chunk.text` into `ragContext` (capped by `PROMPT_CAPS.RAG_CONTEXT_MAX_CHARS`).
2. **Tool-driven RAG:** `knowledge_search` tool uses D1 plus `autoragAiSearchQuery` (binding `env.AI_SEARCH.search` preferred; REST uses same instances URL with `CLOUDFLARE_API_TOKEN`).
3. **Vectorize:** Separate index `VECTORIZE` / `VECTORIZE_INDEX` in wrangler; manual Vectorize upsert into AutoRAG index is **disabled** in admin vectorize-kb path to avoid corrupting the shared AI Search index.

## Terminal execution (`http-exec`)

- Tool name: `terminal_execute`.
- Worker uses **`runTerminalCommand`** (`worker.js` references around 5537-5585): posts to configured HTTP exec service; logs `[runTerminalCommand] http-exec ok` on success; handles 401 retry with alternate bearer.
- Also used by `POST /api/agent/terminal/run`.

## Browser / screenshot pipeline

- **`/api/browser/*`:** `handleBrowserRequest` — Playwright via `@cloudflare/playwright` and `MYBROWSER` (screenshot GET with KV cache).
- **Playwright jobs:** Queue consumer processes jobs; results stored in D1 / R2 per job type.
- **Tools:** `playwright_screenshot`, `browser_screenshot` call `runInternalPlaywrightTool` when bindings exist.

## AI Search instance name

- Wrangler: `[[ai_search]]` binding `AI_SEARCH`, **`search_name = "iam-autorag"`** in `wrangler.production.toml`.
