# Agent full capabilities, AI Gateway, and MCP — master plan

**Goal:** Dashboard that is fully functional from Mac or iPhone: one place to start/stop work, run commands, call APIs, and use AI (Gemini, Claude, OpenAI, Workers AI, AI Gateway) and MCP — without hunting for API keys or repos. Optimal memory/indexing, suggest commands/SQL/workflows, and Accept/Stop so the agent either runs the needed functions or stops and waits.

---

## 1. Current state (what’s working vs gaps)

| Area | Status | Gap |
|------|--------|-----|
| **Terminal** | ✅ Working | Terminal panel is separate from chat. Agent cannot run commands in it; user types in terminal manually. |
| **Agent chat** | ✅ Working | Uses D1, R2 schema, sessions, messages. Calls Anthropic / OpenAI / Google / Workers AI **directly** (no AI Gateway). |
| **AI Gateway** | ❌ Not connected | Worker calls providers directly; your $10 AI Gateway budget is unused. No single endpoint, no gateway analytics/cache. |
| **Preview panel** | ⚠️ Partial | Agent outputs `OPEN_IN_PREVIEW: <url>`; dashboard puts URL in iframe. **Cloudflare (and many auth UIs) block embedding** (X-Frame-Options), so dash.cloudflare.com shows broken/blank. |
| **R2 from agent** | ❌ No API | No `/api/r2/list` or similar. Agent says “if backend had an R2 list endpoint I could call it” — we don’t. |
| **MCP** | ⚠️ List only | Boot and `/api/agent/mcp` return MCP services from D1. **No invocation** of MCP tools from the dashboard (no JSON-RPC/SSE to MCP servers). |
| **Accept / Stop** | ❌ Not wired | No “Accept” to run a suggested command/API, or “Stop” to cancel. Agent only suggests; user must copy/paste or use terminal by hand. |
| **Memory / indexing** | ⚠️ Partial | Schema + bootstrap from R2 in system prompt; optional RAG seed on trigger phrases. **No automatic RAG** before every turn; no “suggest SQL/command” UI that runs on Accept. |

---

## 2. AI Gateway — connect and use your $10 budget

**Why:** One endpoint, unified analytics/cache, and your existing AI Gateway budget gets used.

**Current:** Worker uses:
- `https://api.anthropic.com/...` + `ANTHROPIC_API_KEY`
- `https://api.openai.com/...` + `OPENAI_API_KEY`
- `generativelanguage.googleapis.com` + `GOOGLE_AI_API_KEY`
- `env.AI.run('@cf/meta/llama-3.1-8b-instruct', ...)` for Workers AI

**Target:** Route OpenAI and Anthropic (and optionally Google) through Cloudflare AI Gateway so all LLM traffic goes through the gateway.

**Implemented (optional):** The worker supports **optional** AI Gateway via the OpenAI-compat endpoint. You do **not** need to route all traffic through it.

- Set **AI_GATEWAY_BASE_URL** (var or secret) to the compat base URL (e.g. `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/compat`) with no trailing slash. When set, **only** OpenAI and Anthropic chat requests are sent to the gateway; Google and Workers AI still use direct APIs.
- **No token required** for the standard gateway URL (keys are configured in the gateway). If you enable Authenticated Gateway later, set the **AI_GATEWAY_TOKEN** or **CF_AIG_TOKEN** secret; the worker sends `Authorization: Bearer <token>` when either is set. You do not need both; use one. Reset or rotate only if you switch to Authenticated Gateway and need to match the new token.
- No dynamic routes: the worker POSTs to `{AI_GATEWAY_BASE_URL}/chat/completions` with OpenAI-format body; model names are `openai/gpt-4o`, `anthropic/claude-sonnet-4-5-20251022`, etc.
- **Full flexibility:** Only OpenAI and Anthropic **chat** are ever routed through the gateway when the URL is set. All other usage is unchanged: Google/Gemini, Vertex, Workers AI, RAG/embeddings, D1, R2, MCP, terminal, and every other API/tool stay direct. To force direct for a single chat request (e.g. to compare or bypass gateway), send `use_ai_gateway: false` in the request body; omit or `true` to use gateway when configured.

**Steps:**
1. **Create an AI Gateway** in Cloudflare Dashboard (AI Gateway / Zero Trust area). Add providers (OpenAI, Anthropic, etc.) and attach your API keys there.
2. **Add AI Gateway binding** in `wrangler.production.toml` (see [Cloudflare AI Gateway Worker binding](https://developers.cloudflare.com/ai-gateway/integrations/worker-binding-methods)):
   - e.g. `[ai]` with gateway name so the Worker can call `env.AI.gateway("your-gateway").getUrl("openai")` etc.
3. **Change `/api/agent/chat`** so that for OpenAI and Anthropic it:
   - Uses the **gateway URL** (from the binding) instead of `api.openai.com` / `api.anthropic.com`.
   - Sends the same request bodies; gateway proxies to the provider.
4. **Keep Workers AI** as today (direct `env.AI.run`); optionally also route through gateway if you add Workers AI to the gateway.
5. **Leave API keys** in the gateway config; Worker only needs the gateway binding (no need to duplicate keys in Worker secrets for those providers).

**Outcome:** All proxied LLM calls count against AI Gateway; you get one place for logs/cache and your $10 budget is used.

---

## 3. Agent ↔ Terminal: “Accept” runs command, “Stop” stops

**Idea:** When the agent suggests a command (e.g. `wrangler r2 object list agent-sam`), the UI shows **Accept** / **Stop**. Accept sends the command to the **existing terminal WebSocket**; Stop cancels or does nothing and waits for the next message.

**Steps:**
1. **Structured “suggestion” from agent:** Extend system prompt so the agent can output a single line like:
   - `RUN_IN_TERMINAL: wrangler r2 object list agent-sam`
   - (or a small JSON block the dashboard can parse).
2. **Dashboard:** When the assistant message contains `RUN_IN_TERMINAL: <command>`:
   - Show the command in a small chip or block with **[Accept]** and **[Stop]**.
   - **Accept:** Send `<command>\n` to the terminal WebSocket (same connection used by the xterm panel). So the terminal runs it; user sees output in the terminal panel.
   - **Stop:** Don’t send; optionally show “Stopped. Awaiting your next message.”
3. **Terminal panel:** Already has `terminalWsRef` and sends input via `ws.send`. You need one shared ref or a small “command runner” that uses the same WebSocket to inject the accepted command.
4. **Safety:** Only allow “Accept” for commands the agent suggested (parsed from the message). Optionally allowlist prefixes (`wrangler`, `npx`, `npm`, etc.) if you want to restrict.

**Outcome:** User can click Accept and have the command run in the terminal without leaving the dashboard or copying/pasting.

---

## 4. R2 list (and similar) API so the agent can “list R2”

**Steps:**
1. Add **GET `/api/agent/r2/buckets`** (or `/api/r2/buckets`): Worker uses R2 binding to list buckets (if supported) or return a fixed list from config.
2. Add **GET `/api/agent/r2/objects?bucket=X&prefix=Y`**: Worker uses `env.R2.list({ bucket, prefix })` (or equivalent) and returns keys/metadata. Protect with auth/session so only your dashboard can call.
3. Document in the agent system prompt: “You can list R2 buckets and objects by asking the user to use the dashboard, or by having them call GET /api/agent/r2/objects?bucket=agent-sam (the backend will return a list).” If you later add a “tool” layer, the agent can call these endpoints itself.
4. **Short term:** Add a **CLI command** in the dashboard (like `ls-r2` or `r2-list agent-sam`) that the frontend maps to a fetch to `/api/agent/r2/objects?bucket=agent-sam` and displays the result. Then the agent can say “Run `r2-list agent-sam` in the CLI” and the user gets a one-click or Accept flow once 3 is done.

**Outcome:** Agent doesn’t say “I can’t list R2”; either the agent calls the API (when you add tool-calling) or the user runs a dashboard command that uses the API.

---

## 5. Preview panel: auth URLs that block iframe

**Issue:** Cloudflare (and many OAuth/login pages) send `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`, so the iframe shows blank/broken.

**Options:**
- **A. Open in new tab:** When the agent outputs `OPEN_IN_PREVIEW: https://dash.cloudflare.com/...`, the dashboard could open that URL in a **new tab** (or a popup) instead of the iframe, and show a short message: “Opened Cloudflare dashboard in a new tab; complete login there and return here.”
- **B. Keep iframe for non-auth URLs:** Keep OPEN_IN_PREVIEW for links that are embeddable (e.g. your own pages, public docs). For known auth domains (dash.cloudflare.com, cloudflare.com, accounts.google.com, etc.), use “open in new tab” automatically.
- **C. Document:** In the system prompt, say: “For Cloudflare dashboard or OAuth, output OPEN_IN_PREVIEW: <url>; the dashboard will open it in a new tab so the user can complete login.”

**Implementation:** In `AgentDashboard.jsx`, when you set `previewUrl`, if the hostname is in a list of “auth hosts,” call `window.open(url, '_blank')` and set a user-visible message instead of putting it in the iframe.

**Outcome:** “Open wrangler login / Cloudflare dashboard” works from the agent without a broken iframe.

---

## 6. MCP — from “list only” to “invoke tools”

**Current:** MCP services are stored in D1 (`mcp_services`); `/api/agent/boot` and `/api/agent/mcp` return the list. The dashboard shows them and the agent can say “these MCPs are registered.” There is **no** call from the dashboard or the Worker to MCP servers (no JSON-RPC over HTTP/SSE).

**Target:** “100% solidify MCP connectivity” so the dashboard can invoke MCP tools and the agent can suggest or run them.

**Options:**
- **A. Worker as MCP client:** Add a Worker endpoint, e.g. **POST `/api/agent/mcp/invoke`** with `{ service_id, tool_name, arguments }`. The Worker looks up the MCP server URL from D1, then calls the MCP server (HTTP/SSE transport) and returns the result. The dashboard (or agent flow) calls this when the user clicks “Run” on an MCP tool or when the agent decides to call a tool.
- **B. Dashboard ↔ MCP directly:** Dashboard opens a connection to the MCP server URL (from boot) and sends JSON-RPC requests from the browser. This can run into CORS; many MCP servers are not in the same origin. So usually the Worker (same origin as the dashboard) is the one that talks to MCP.
- **C. Tool-calling in the agent:** When the LLM returns a “tool call” (e.g. OpenAI/Anthropic tool_use), the Worker resolves which tool is an “MCP tool,” calls the MCP server (or your `/api/agent/mcp/invoke`), and sends the result back to the LLM. That gives “agent decides to use MCP” in one flow.

**Recommended order:** (1) Implement **A** so you have one place (Worker) that can invoke any registered MCP tool; (2) add UI in the dashboard to pick an MCP service + tool + params and call `/api/agent/mcp/invoke`; (3) optionally add **C** so the chat model can request MCP tool calls and the Worker executes them.

**Outcome:** MCP is not just a list; the dashboard (and optionally the agent) can run MCP tools reliably from the UI.

---

## 7. Accept / Stop and “suggest then run”

**Unified flow:**
- Agent suggests an **action** (e.g. “Run: `wrangler r2 object list agent-sam`” or “Call: GET /api/agent/r2/objects?bucket=agent-sam” or “MCP: list_projects”).
- UI shows **[Accept]** and **[Stop]**.
- **Accept:** Backend or dashboard runs the action (terminal command, API call, or MCP invoke) and shows the result in chat or in the terminal panel.
- **Stop:** No execution; agent waits for the next user message.

**Implementation sketch:**
- Define a small **action schema** in the agent’s reply (e.g. a single line or a code block with a label like `ACTION: terminal:wrangler r2 object list agent-sam` or `ACTION: api:GET /api/agent/r2/objects?bucket=agent-sam`).
- Dashboard parses the last assistant message for `ACTION: ...`; if present, show Accept/Stop.
- On Accept:
  - `terminal:<command>` → send command to terminal WebSocket.
  - `api:GET ...` or `api:POST ...` → dashboard `fetch()` and append result to chat or a “Result” block.
  - `mcp:service_id,tool_name,...` → call `/api/agent/mcp/invoke` and show result.

**Outcome:** One consistent “suggest → Accept/Stop → run or wait” behavior for terminal, API, and MCP.

---

## 8. Memory / indexing and “suggest SQL/commands”

**Already in place:**
- Schema + bootstrap from R2 in system prompt.
- Optional RAG seed when user says “seed RAG” etc.
- D1 tables and API list in the agent’s “help” / system context.

**Improvements:**
- **Pre-query RAG:** Before each `/api/agent/chat` call, optionally call **POST `/api/agent/rag/query`** with the last user message; inject top 1–3 matches into the system prompt so the agent can cite docs and suggest SQL/commands from your indexed content.
- **“Suggest SQL” in UI:** When the agent outputs a SQL block or a command block, parse it and show **[Run]** (with “Run in D1” or “Run in terminal” depending on type). Run = call an allowed API (e.g. D1 execute with approval) or send to terminal on Accept.
- **Index more:** Use **POST `/api/agent/rag/insert`** to index key docs (memory/daily/*.md, schema-and-records, API list) so RAG suggestions are better.

**Outcome:** Agent has better context and can suggest SQL/commands that the user can run with one click (Accept) under your safety rules.

---

## 9. Checklist — what to do first

| Priority | Item | Notes |
|----------|------|--------|
| 1 | **AI Gateway** | Add binding; route OpenAI/Anthropic (and optionally Google) through gateway in `/api/agent/chat` so your $10 budget is used. |
| 2 | **Preview: open auth URLs in new tab** | If `OPEN_IN_PREVIEW` URL is Cloudflare/auth, open in `_blank` and show message; keep iframe for other URLs. |
| 3 | **R2 list API** | Add GET `/api/agent/r2/objects?bucket=...` (and optionally buckets); document in system prompt; add CLI command or tool so agent/user can list R2. |
| 4 | **Accept/Stop + RUN_IN_TERMINAL** | Parse agent suggestion; show Accept/Stop; Accept sends command to terminal WebSocket. |
| 5 | **MCP invoke** | Add POST `/api/agent/mcp/invoke`; Worker calls MCP server; add UI to call it. |
| 6 | **Pre-query RAG** | Optionally run RAG before each chat and inject matches into system prompt. |
| 7 | **Structured actions** | Extend to `ACTION: api:...` and `ACTION: mcp:...` so Accept runs API or MCP, not only terminal. |

---

## 10. Why the agent said “I don’t have direct terminal access”

The **chat** agent does not execute code in your Mac’s terminal. The **Terminal panel** in the dashboard is a separate feature: it’s an xterm.js client that talks to your terminal server over the tunnel. So:

- **Today:** Agent suggests commands; you run them yourself in the Terminal panel or locally.
- **After 4 & 7:** Agent suggests a command; you click **Accept** and the dashboard sends that command to the same terminal WebSocket, so it runs in the Terminal panel without you typing it.

That is “direct terminal capability” from the UI’s point of view (one click to run), even though the execution still happens in your terminal server process.

---

*Doc created 2026-03-03. Use this as the single reference to solidify agent + AI Gateway + MCP + terminal + R2 and get to “full capabilities” from the dashboard.*
