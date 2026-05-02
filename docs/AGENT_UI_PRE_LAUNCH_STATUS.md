# Agent UI — Pre-launch: What It Can Do and What’s Not Set Up

**One-line:** You can brainstorm in chat, run terminal commands (including deploy) and see output in chat, open URLs in the preview panel, and use the Terminal tab—all without leaving the agent screen. Using “your” agents and models depends on D1 being populated. Live screenshot preview (Playwright) is backend-ready but not wired in the chat UI.

---

## What the agent UI is capable of today

### 1. Chat (brainstorming, planning, code suggestions)
- **Fully working.** You type; the assistant replies using the selected model (Anthropic, OpenAI, Google, Workers AI, or AI Gateway when configured).
- System prompt includes: D1/RAG/schema hints, risky-command rules, and **OPEN_IN_PREVIEW** so the agent can tell the dashboard to open a URL in the preview panel.
- Sessions and messages are stored in D1 (`agent_sessions`, `agent_messages`). Token usage is logged to `agent_telemetry`.

### 2. Run terminal commands from chat (no redirect)
- **Fully working.** When the agent suggests a command in a ` ```bash ` / ` ```sh ` block, you get:
  - **Run in terminal** — Runs the command via your terminal server (WebSocket), buffers output, and appends it **in the chat** (no tab switch).
  - **Open in Terminal tab** — Switches to the Terminal tab and runs there (full PTY).
- Commands are logged to `agent_command_executions`, `terminal_history`, `agent_command_proposals`. Deploys (`wrangler deploy`) also write to `cloudflare_deployments` and you can Mark complete/failed.
- **Requires:** Terminal server running, Cloudflare Tunnel route to it, and worker secrets `TERMINAL_WS_URL` + `TERMINAL_SECRET`.

### 3. Deploy (worker + dashboard to R2) without leaving the agent screen
- **Fully working.** In chat you can:
  1. Ask the agent to deploy (e.g. “deploy the worker”).
  2. Agent suggests `wrangler deploy` (and optionally dashboard upload) in a code block.
  3. You click **Run in terminal**; command runs and output appears in the chat.
  4. If you used the Terminal tab, you can click **Mark complete** / **Mark failed** so `cloudflare_deployments` and `agent_command_executions` are updated.
- So: **brainstorm → suggest deploy command → run in terminal (in chat) → see result** all on the same screen. No need to leave the agent view.

### 4. Live preview panel (URLs and iframe)
- **Working for URLs.** You can:
  - Open the **Preview** panel (or the Preview tab) and paste any URL to view it in the iframe.
  - Have the agent output `OPEN_IN_PREVIEW: https://...`; the dashboard parses that and opens the URL in the preview panel automatically.
- Use case: agent suggests “log in here” or “check this page” and opens the link in the panel so you don’t leave the agent screen.

### 5. Terminal tab (full PTY)
- **Working** when terminal server + tunnel + secrets are set. Shows a real shell (wrangler, git, npm, cloudflared, etc.) with a clear “Connected” state in the header. Optional for users who prefer the chat-only flow.

### 6. CLI tab (in-dashboard commands)
- **Working.** Ref/list-commands, ls-agents, ls-models, ls-tables, etc. come from the worker (and D1 where applicable). Wrangler/git/npm are directed to the Terminal tab.

### 7. RAG / memory
- **Backend working.** Vectorize is used for RAG insert/query; the chat system prompt can include knowledge-base and high-importance memory. Seeding and querying are available via API; the agent can refer to seeded content when replying.

---

## What’s not fully set up or wired

### 1. “Your” agents and models (D1)
- **Agents** and **models** in the UI come from **GET /api/agent/boot**, which reads D1: `agent_ai_sam`, `ai_models`, `mcp_services`, etc.
- If those tables are **empty**, the dashboard keeps the **initial mock** lists (e.g. Agent Sam, Claude Opus 4.6, GPT-5.2). Chat still works and uses the selected model; the backend doesn’t care if the agent row exists unless it updates `agent_ai_sam.total_runs`.
- **To use “your” agents and models:** Ensure D1 has rows in `agent_ai_sam` and `ai_models` (and optionally `mcp_services`). Migration 116 has minimal seeds for `ai_models`; you can add more and set `is_active=1`. Then boot will return them and the pickers will show your list.

### 2. Playwright / screenshot “live preview”
- **Backend:** POST `/api/agent/playwright` creates a job in `playwright_jobs` and sends a message to **MY_QUEUE**. The worker’s **queue consumer** runs Puppeteer, takes a full-page screenshot, uploads it to R2 (DASHBOARD bucket), and updates the job with `result_url`.
- **Gap:** The **chat UI never calls** POST `/api/agent/playwright` or polls GET `/api/agent/playwright/:jobId`. So the agent can’t yet “take a screenshot and show it in the preview” from the current UI. To make that work you’d add: (a) agent instruction to suggest a screenshot when useful, (b) a way to trigger the request (e.g. “Preview screenshot” button or auto when the agent outputs a special line), and (c) polling or SSE to show `result_url` in the preview panel.

### 3. Preview panel: “live build” of a local or staging site
- The preview panel is an **iframe** to a **URL**. It does not run `npm run dev` or `wrangler dev` for you. So “live preview of my app” means: you (or the agent) provide a URL that already serves the app (e.g. production, staging, or a tunnel to your local dev server). The agent can open that URL via OPEN_IN_PREVIEW. True “run dev server and show it” would require either running the dev server in the terminal and then opening `http://localhost:...` (or tunnel URL) in the preview, or a separate “run and capture” flow.

### 4. MCP / CICD in the chat flow
- **MCP** and **CICD** are loaded from boot and shown in the UI; the **chat API** does not yet call MCP tools or CICD workflows during the conversation. So the agent can’t execute MCP or CICD steps from the chat automatically. That would require wiring tool calls or workflow triggers into the chat request.

---

## Can you go from brainstorming → live preview → deployed site without leaving the agent screen?

| Step | Possible in agent screen? | How |
|------|---------------------------|-----|
| **Brainstorm / plan** | Yes | Chat; agent suggests architecture, commands, next steps. |
| **See a live URL (e.g. your site)** | Yes | Agent outputs OPEN_IN_PREVIEW: https://... or you paste URL in preview panel. |
| **Run build/deploy commands** | Yes | Agent suggests `npm run build` / `wrangler deploy` in a code block; you click **Run in terminal** and see output in chat. |
| **Mark deploy complete** | Yes | If you ran deploy from the Terminal tab, use **Mark complete** / **Mark failed**; otherwise run-from-chat already completes the execution record. |
| **Screenshot of a page in preview** | Backend only | Playwright queue and consumer work; UI does not trigger or display the screenshot yet. |
| **“Your” agents/models** | Depends on D1 | Populate `agent_ai_sam` and `ai_models` so boot returns them; otherwise you still have working chat with mock list. |

**Bottom line:** You can go from **brainstorming → commands (build/deploy) → output in chat**, and open **any live URL** in the preview panel, without leaving the agent screen. The main missing piece for a Cursor-like “approve and see result” flow is wiring Playwright screenshot into the chat UI (trigger + show `result_url` in preview). Everything else needed for “agent suggests → you approve → run in terminal → see output” is in place.
