# MCP: What’s Working vs What’s Needed for Agent Sam

## Currently working

| Layer | What works |
|-------|------------|
| **Cursor ↔ MCP** | Cursor uses `.cursor/mcp.json` to talk to `mcp.inneranimalmedia.com` with Bearer token. No consent popups when token is set. |
| **Worker → MCP server** | `MCP_AUTH_TOKEN` on worker; `POST /api/mcp/invoke` calls `https://mcp.inneranimalmedia.com/mcp` with `Authorization: Bearer <token>`. |
| **MCP invoke API** | `POST /api/mcp/invoke` with `{ tool_name, params }` runs the tool (including `terminal_execute` for `/run <cmd>`), returns result. |
| **Agent chat → terminal** | User types `/run <cmd>` → dashboard calls `/api/mcp/invoke` with `tool_name: "terminal_execute"`, result shown in chat. |
| **MCP dashboard** | `/dashboard/mcp` can list services, tools, dispatch to agents. |
| **System prompt** | Chat gets an `mcpBlurb` in compiled context listing active MCP services so the model *knows* tools exist (but cannot yet *call* them in-stream). |

So: **single tool calls** (e.g. from UI or `/run`) work. **Cursor** can use MCP tools when you chat in the IDE. What’s missing is **Agent Sam chat** using tools in a loop during a turn.

---

## What’s missing for “fully functional” MCP in Agent Sam chat

For Agent Sam (browser dashboard) to **reliably handle MCP workflows** in normal chat (not only `/run`), you need:

### 1. Send tools to the model (backend)

- **Today:** Chat request to Anthropic/OpenAI/Google/Workers AI has **no `tools` array**. The model only sees text in the system prompt (“these tools exist”).
- **Needed:** When building the chat request, add a `tools` array derived from `mcp_registered_tools` (or a curated allowlist), in the format each provider expects (e.g. Anthropic `tool_use` schema, OpenAI `function`/`tool_choice`). That lets the model return **tool_calls** in its response.

### 2. Tool-call loop (backend)

- **Today:** Worker streams the model reply and returns it. There is **no** handling of `tool_calls` in the response.
- **Needed:** After each model response (or after buffering a streamed turn):
  - If the response contains `tool_calls`: for each call, invoke the tool via existing logic (e.g. same path as `/api/mcp/invoke`: call MCP server or internal Playwright), get the result.
  - Append an assistant message with `tool_use` + a user (or tool) message with the tool results.
  - Call the model again with the updated message list.
  - Repeat until the model returns no tool_calls or a max iteration count (e.g. 5) is reached.
- **Streaming:** Either run the loop in a non-streaming way for that turn, or buffer the stream, parse tool_calls, run tools, then stream the final reply (or a summary). Non-streaming is simpler to implement first.

### 3. UI for tool calls and results (frontend)

- **Today:** Chat shows assistant text and terminal output for `/run`. No generic “Agent Sam called tool X” or tool result blocks.
- **Needed:** When the backend returns tool_calls and results (e.g. in a structured field or in message content), render them in the message bubble: e.g. “Called `list_clients`” with an expandable or inline result (or “Called `terminal_execute`: …”). So the user sees that MCP was used and what it returned.

### 4. Optional but recommended

- **Approval for sensitive tools:** Use `requires_approval` in `mcp_registered_tools` and have the UI show “Agent wants to run X. Allow?” before the worker calls `/api/mcp/invoke` for that tool.
- **Rate / timeout:** Limit tool calls per turn (e.g. 10) and per request (e.g. 30s total) so one turn doesn’t hang or run forever.
- **Errors:** If a tool fails, append the error as tool result and let the model see it so it can retry or explain.

---

## Summary

| Goal | Status |
|------|--------|
| Cursor uses Inner Animal MCP without consent prompts | ✅ Done |
| Worker can call MCP (invoke) with auth | ✅ Done |
| `/run <cmd>` in Agent Sam uses MCP terminal | ✅ Done |
| Model receives **tools** in chat and can return **tool_calls** | ❌ Not implemented |
| Worker runs tool_calls and feeds results back to the model | ❌ Not implemented |
| Dashboard shows “called tool X” and result in chat | ❌ Not implemented |

Implementing **1 + 2 + 3** above will make Agent Sam’s chat “fully functional” for MCP workflows: the model can choose and use MCP tools during a conversation, and the user sees what was called and what it returned.
