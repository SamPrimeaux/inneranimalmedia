# Streaming + Tools Architecture (Agent Sam)

**Status:** Planned (not yet implemented).  
**Goal:** Allow streaming responses while still supporting tool calls (e.g. r2_write, d1_query, knowledge_search) so the agent can stream text and run tools in the same conversation.

---

## Current Limitation

- **worker.js ~3405-3408:** `useTools = supportsTools && !wantStream`. When the client sends `stream: true`, tools are disabled for all providers.
- **worker.js ~3482-3530:** For Anthropic we call `chatWithToolsAnthropic(..., { stream: true })`, but that function does a **blocking** request (no `stream: true` in the Claude API body). So we never actually stream tokens while using tools.

---

## Desired Behavior

1. Client sends `stream: true` and a message that may require tools.
2. Worker sends a request to Claude (or OpenAI) with `stream: true` and `tools` in the body.
3. Worker streams SSE events: `text` (content deltas), `tool_start` (tool_use block), `tool_result`, then more `text` if the model continues, until `message_stop` or no more tool_use.
4. On each `tool_use` block: pause streaming, run tool (with approval if required), append tool result to messages, send follow-up request with `stream: true` again; repeat until the model returns no tool_use or hits max iterations.
5. Frontend shows streaming text and, when a tool runs, shows "Tool: r2_write" (or similar) and then continues streaming.

---

## Pseudocode (Anthropic)

```
function streamChatWithToolsAnthropic(env, system, messages, model, conversationId, agent_id, ctx):
  tools = loadToolDefinitions(env)
  iter = 0
  while iter < MAX_ITER:
    body = { model, max_tokens, system, messages, tools, stream: true }
    resp = fetch(ANTHROPIC_MESSAGES_URL, { body: JSON.stringify(body) })
    reader = resp.body.getReader()
    decoder = new TextDecoder()
    buffer = ''
    currentText = ''
    toolUseBlocks = []

    while true:
      { done, value } = await reader.read()
      if done: break
      buffer += decoder.decode(value)
      for each SSE line in buffer:
        if data.type === 'content_block_delta' and data.delta?.text:
          currentText += data.delta.text
          enqueue(controller, { type: 'text', text: data.delta.text })
        if data.type === 'content_block_start' and data.content_block?.type === 'tool_use':
          toolUseBlocks.push(data.content_block)
        if data.type === 'message_stop':
          break

    if toolUseBlocks.length === 0:
      enqueue(controller, { type: 'done', ... })
      break

    toolResults = []
    for block in toolUseBlocks:
      result = await runTool(env, block.name, block.input, conversationId, approval)
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      enqueue(controller, { type: 'tool_result', tool_name: block.name, result })

    messages.push(assistantMessageWithToolUse(toolUseBlocks))
    messages.push({ role: 'user', content: toolResults })
    iter++
```

---

## SSE Event Contract (existing + additions)

- `data: {"type":"state","state":"THINKING"}` — optional
- `data: {"type":"text","text":"..."}` — streamed content delta
- `data: {"type":"tool_start","tool_name":"r2_write",...}` — when a tool_use block starts (optional; can be inferred from tool_result)
- `data: {"type":"tool_result","tool_name":"r2_write","result":"..."}` — after tool execution (for UI)
- `data: {"type":"done","input_tokens":...,"output_tokens":...,"cost_usd":...,"conversation_id":"..."}`
- `data: {"type":"error","error":"..."}`

---

## Approval Flow When Streaming

- When a tool that requires approval (e.g. r2_write) is requested during streaming, the worker should either:
  - (A) Pause the stream, emit `tool_start` with a pending id, and wait for the client to send "approve" for that id before running the tool and continuing; or
  - (B) Run in "Ask mode" by default when streaming: emit tool_start with params, do not run until client sends approval (same as current non-streaming approval).
- Current non-streaming flow: tool_calls are returned in the response; dashboard shows "Approve & Execute"; on approve, worker runs tool and continues. Same semantics should apply when streaming: emit tool_use to frontend, frontend shows Approve, on approve send approval to worker, worker runs tool and continues streaming.

---

## Files to Create/Modify

- **worker.js:** New `streamChatWithToolsAnthropic`; in the main chat handler, when `wantStream && canStreamAnthropic`, call it instead of the plain streaming path. Later: `streamChatWithToolsOpenAI` if OpenAI supports streaming + tool_calls.
- **agent-dashboard:** Handle new SSE types `tool_start` / `tool_result` in the stream handler so the UI can show "Running: r2_write" and then the result without breaking the stream.

---

## References

- worker.js: 3405-3410 (useTools vs wantStream), 3482-3532 (streaming branch), 4809+ (chatWithToolsAnthropic).
- Anthropic API: Messages with stream: true and content_block_delta / tool_use.
- OpenAI: Chat Completions with stream: true and tool_calls in delta (if supported).
