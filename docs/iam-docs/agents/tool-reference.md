# Agent Sam tool reference — 73 tools by category

**Source:** D1 `mcp_registered_tools` where **`enabled = 1`**. **73 tools** in **21** `tool_category` values (grouped below for readability). Dispatch: **`invokeMcpToolFromChat`** in `worker.js` — builtins first, then remote MCP JSON-RPC to **`https://mcp.inneranimalmedia.com/mcp`** unless overridden per row.

---

## 3D Generation (3)

- `meshyai_get_task` — Poll Meshy AI task by ID; status and URLs when complete.
- `meshyai_image_to_3d` — 3D model from image URL (Meshy AI).
- `meshyai_text_to_3d` — 3D model from text prompt (GLB/OBJ/FBX).

## Browser — Screenshot (2)

- `browser_screenshot` — Cached / faster path via browser rendering.
- `playwright_screenshot` — Full Playwright screenshot.

## Browser — Control / CDT (8)

- `cdt_click` — Click element by CSS selector.
- `cdt_drag` — Drag between positions.
- `cdt_fill` — Fill one input.
- `cdt_fill_form` — Fill multiple fields.
- `cdt_handle_dialog` — Accept/dismiss alert/confirm/prompt.
- `cdt_hover` — Hover for hover-state UI.
- `cdt_press_key` — Key press (Enter, Tab, Escape, etc.).
- `cdt_upload_file` — File input upload.

## Browser — Debug (5)

- `cdt_evaluate_script` — Run JS in page context; return result.
- `cdt_get_console_message` — Console message by index.
- `cdt_list_console_messages` — List console messages.
- `cdt_take_screenshot` — Screenshot including JS-rendered content.
- `cdt_take_snapshot` — DOM / accessibility snapshot.

## Browser — Emulation (2)

- `cdt_emulate` — Device or viewport emulation.
- `cdt_resize_page` — Set viewport size.

## Browser — Navigation (6)

- `cdt_close_page` — Close tab.
- `cdt_list_pages` — List tabs.
- `cdt_navigate_page` — Navigate to URL.
- `cdt_new_page` — New tab.
- `cdt_select_page` — Focus tab.
- `cdt_wait_for` — Wait for selector / navigation / idle.

## Browser — Network (2)

- `cdt_get_network_request` — Full request/response detail.
- `cdt_list_network_requests` — List network requests.

## Browser — Performance (3)

- `cdt_performance_analyze_insight` — Analyze trace insight (LCP, CLS, INP, etc.).
- `cdt_performance_start_trace` — Start DevTools performance trace.
- `cdt_performance_stop_trace` — Stop trace; return data.

## Context (8)

- `context_chunk` — Chunk large text with size limit.
- `context_extract_structure` — Structure / outline hints.
- `context_optimize` — Stub: directs to `knowledge_search` / retrieval (claims 99% token reduction in registry copy).
- `context_progressive_disclosure` — Truncate by disclosure level.
- `context_search` — Search `agent_memory_index` (LIKE).
- `context_summarize_code` — Stub: fetch via R2 / knowledge first.
- `human_context_add` — Insert/update `agent_memory_index` key/value.
- `human_context_list` — List memory rows.

## Database (2)

- `d1_query` — **SELECT only** via D1.
- `d1_write` — INSERT/UPDATE/DELETE; dangerous DDL blocked.

## Execute (1)

- `generate_execution_plan` — Persist plan to `agent_execution_plans` for UI approve/reject.

## File conversion (2)

- `cloudconvert_create_job` — Start CloudConvert job.
- `cloudconvert_get_job` — Poll job status and output URL.

## Image (3)

- `imgx_edit_image` — Edit image from URL + instructions.
- `imgx_generate_image` — Text-to-image via configured providers (OpenAI / Gemini paths in worker).
- `imgx_list_providers` — List image backends.

## Integrations (7)

- `cf_images_delete` — Delete Cloudflare Images asset.
- `cf_images_list` — List Images account.
- `cf_images_upload` — Upload by URL.
- `gdrive_fetch` — Read Drive file by id.
- `gdrive_list` — List Drive files/folders.
- `github_file` — Repo file content.
- `github_repos` — List repos for connected user.

## Ops (1)

- `generate_daily_summary_email` — Daily HTML email via Anthropic Haiku + Resend (`RESEND_API_KEY`).

## Platform (6)

- `get_deploy_command` — Deploy command string (remote MCP / worker).
- `get_worker_services` — Worker bindings (remote MCP).
- `list_clients` — Client list (remote MCP).
- `list_workers` — Builtin: `agent_roles` query.
- `platform_info` — Builtin: account/tenant hints.
- `worker_deploy` — Builtin: returns guidance string (not live deploy).

## Quality / A11y (2)

- `a11y_audit_webpage` — Playwright-based heuristic audit.
- `a11y_get_summary` — Placeholder / stub response.

## Query / RAG (1)

- `knowledge_search` — IAM knowledge search (`runKnowledgeSearchMerged`: D1 + AI Search).

## Storage / R2 (5)

- `r2_bucket_summary` — Object count sample.
- `r2_list` — List by prefix.
- `r2_read` — Read object body as text.
- `r2_search` — Prefix search / list.
- `r2_write` — Write object.

## Telemetry (3)

- `telemetry_log` — Write `agent_audit_log` row.
- `telemetry_query` — Recent audit rows.
- `telemetry_stats` — Counts by `event_type`.

## Terminal (1)

- `terminal_execute` — Run shell command via **`TERMINAL_WS_URL`** (remote executor / http-exec path in worker). **Real execution** — treat as privileged.

---

## Related

- Full dispatch notes: `README.md` in this folder (provider overview).
- **`invokeMcpToolFromChat`** ~10681+ in `worker.js` for builtin vs MCP routing.
