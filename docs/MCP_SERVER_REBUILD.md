# MCP Server Rebuild

## 1. Do you have MCP server source code?

**Yes.** It lives in this repo at:

```
~/Downloads/march1st-inneranimalmedia/mcp-server/
```

- **Entry:** `mcp-server/src/index.js` (single file, ~66k lines)
- **Config:** `mcp-server/wrangler.jsonc` — route `mcp.inneranimalmedia.com`, D1 `DB`, R2 `ASSETS` (inneranimalmedia-assets)
- The current `index.js` is a **bundled** build (comment inside says `// src/index.ts`), so the original source was likely TypeScript built from another repo (e.g. MeauxAppLibrary).

**What the current bundle implements:**

- **Auth:** Bearer token via `env.MCP_AUTH_TOKEN`; `validateBearer()` returns 401 if missing or invalid.
- **Tools (6 only):** `hello`, `list_clients`, `get_worker_services`, `get_worker_env_metadata`, `get_deploy_command`, `terminal_execute`.
- **Missing:** `r2_write`, `r2_read`, `r2_list`, `d1_query`, `d1_write`, `knowledge_search`, and the rest of the 23 tools in `mcp_registered_tools`.

**Important:** The main worker (`worker.js`) implements **r2_read**, **r2_list**, **d1_query**, **d1_write**, **terminal_execute**, **knowledge_search**, **generate_execution_plan**, and Playwright tools **inside the main worker**. It only forwards to the MCP server when the tool is in `mcp_registered_tools` and **not** in that builtin list. So the only one of your “core” tools that is actually sent to MCP today is **r2_write**. The deployed MCP server must implement at least **r2_write** for “Approve & Execute” to work; the rest are optional on MCP if you keep them as builtins in the main worker.

---

## 2. If you don’t have the code — build from scratch

You **do** have the code in this repo; the issue is the **deployed** worker is built from the **wrong** repo (MeauxAppLibrary) or an old build. To “build from scratch” you can:

- **Option A:** Use the **minimal MCP skeleton** in this doc (see section 4). It implements the JSON-RPC MCP protocol (initialize, tools/list, tools/call) with Bearer auth and the tools you need (including r2_write). Replace `mcp-server/src/index.js` with that (or point `main` to the new file) and deploy from this repo.
- **Option B:** Rebuild the current bundle from its original TypeScript source (if you have or restore MeauxAppLibrary or the TS source) and add the missing tools (e.g. r2_write) there, then redeploy from the correct repo.

The **23 tools** in `mcp_registered_tools` (from your D1 query) are:

- browser_screenshot, d1_query, d1_write, generate_execution_plan, get_deploy_command, get_worker_services, human_context_add, human_context_list, knowledge_search, list_clients, list_workers, platform_info, playwright_screenshot, r2_bucket_summary, r2_list, r2_read, **r2_write**, telemetry_log, telemetry_query, telemetry_stats, terminal_execute, worker_deploy

The main worker already handles many of these internally; MCP must implement at least those that are **forwarded** (currently **r2_write**, and any others you add to the “remote MCP” path in the future).

---

## 3. What GitHub repo should the MCP server be connected to?

- **Current (wrong):** InnerAnimal/MeauxAppLibrary — so the live worker at `mcp.inneranimalmedia.com` is built from that repo.
- **Correct:** The repo that **actually contains** the MCP server source — i.e. the repo that contains the `mcp-server/` folder.

That is **this** repo. If this repo is:

- **SamPrimeaux/inneranimalmedia** (or similar) — connect the Cloudflare Worker “mcp-server” (mcp.inneranimalmedia.com) to **SamPrimeaux/inneranimalmedia**, with the build output directory/path set to the MCP worker (e.g. `mcp-server` or `mcp-server/src/index.js` depending on how you build).
- If the monorepo has another name (e.g. **march1st-inneranimalmedia**), connect the Worker to that repo.

So: **MCP server should be connected to the same repo that contains `mcp-server/`** — not MeauxAppLibrary. The code **does** live in the main repo; the fix is deploying from here and fixing the GitHub connection in the Cloudflare dashboard.

---

## 4. Minimal MCP server skeleton with proper authentication

The main worker expects:

- **URL:** `https://mcp.inneranimalmedia.com/mcp`
- **Method:** POST
- **Headers:** `Content-Type: application/json`, `Accept: application/json, text/event-stream`, `Authorization: Bearer <token>`
- **Body:** JSON-RPC 2.0 — `initialize`, `tools/list`, or `tools/call` with `params: { name, arguments }`
- **Response:** SSE-style line `data: <JSON>` where the JSON has `result` (e.g. `result.content` for tools/call as array of `{ type: 'text', text: '...' }`).

A minimal skeleton that does auth and implements **r2_write** (plus stubs for r2_read, r2_list, d1_query, d1_write, terminal_execute, knowledge_search) is in **`docs/MCP_SERVER_MINIMAL_SKELETON.js`**. Use it as the new `mcp-server` entrypoint (e.g. replace `src/index.js` or point `main` to it), add the R2 binding in wrangler (e.g. `"binding": "R2", "bucket_name": "iam-platform"` in `r2_buckets`), set `MCP_AUTH_TOKEN` secret to match the main worker’s token, and deploy from this repo.

After deploy, “Approve & Execute” for r2_write will hit your MCP server and succeed if the skeleton’s r2_write implementation and bucket binding are correct.

---

## Quick reference: main worker vs MCP

| Tool                 | Handled in main worker | Sent to MCP |
|----------------------|------------------------|-------------|
| r2_read, r2_list     | Yes                    | No          |
| r2_write             | No                     | Yes         |
| d1_query, d1_write   | Yes                    | No          |
| terminal_execute     | Yes                    | No          |
| knowledge_search     | Yes                    | No          |
| generate_execution_plan | Yes                 | No          |
| playwright/browser_* | Yes                    | No          |
| list_clients, get_worker_services, etc. | No | Yes (if in mcp_registered_tools) |

So the critical missing piece on the **deployed** MCP server is **r2_write**. The minimal skeleton adds it.
