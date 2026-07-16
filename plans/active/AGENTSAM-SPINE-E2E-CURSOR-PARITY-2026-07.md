# Agent Sam spine E2E — Cursor parity (vision + thread + tools)

**D1 ticket:** `tkt_agentsam_spine_e2e_20260716`  
**Status:** `active` · **Priority:** P0 · **Project:** `inneranimalmedia` · **Subsystem:** `agent_spine`  
**Law:** dual-pass E2E before `shipped` (`required_pass_count = 2`). Deploy ≠ pass.

## Product outcome (pass/fail for the company)

In-app Agent Sam on `inneranimalmedia.com/dashboard/agent` must be able to replace Cursor for operator daily work on this stack. If it cannot, the project is canceled.

**Must be true end-to-end (user-proven, not agent-claimed):**

1. **Vision** — drop/paste an image in the composer; the model *sees* it (describes UI/screenshot content). Not Scratchpad theater. Not backlogable.
2. **Thread memory** — turn N can reference turn N−1 without “first exchange.”
3. **Tools execute** — model invokes real tools; results return; not chatbot with a 100-tool menu.
4. **Infra reach** — D1 query/write (scoped), CF (R2/KV/Workers as cataloged), GitHub read/write paths, **local FS via FSA bridge** when folder connected.
5. **Auto stays Auto** — routing from D1 catalog/arms; no “pin Sonnet to pretend it works.” Vision turns constrain to vision-capable catalog rows.

## Why previous attempts failed (evidence, 2026-07-16)

| Attempt | Result | Root cause |
|---------|--------|------------|
| Dump ~103 oauth_visible tools into DO session context | Tool *list* worked; agent still amnesiac / blind / non-executing | Tools ≠ thread ≠ vision ≠ tool *dispatch* |
| Session DO `session_agent_context` | cache_hit 102 tools + `fsa_root` | Did not hydrate chat history into model messages |
| UI shows image + Scratchpad | “No image file arrived” | Compaction `normalizeMessages` **JSON.stringifies** `content[]` after vision apply; multipart/vision path still fragile |
| Auto | Lottery: mini → haiku → sonnet → Qwen → nano | Spaceless mush from Workers AI `reasoning_content` as SSE tokens |
| FSA bridge shipped | Untested — model never issued `fs_*` | Blocked by thread/tool-execution failure |

**Non-goal for this ticket:** more tool-count theater, more parallel DO tables that ignore the Messages API payload.

## Architecture target (Cursor / Claude Messages parity)

```text
Composer turn
  → multipart: message + images[] (bytes)
  → hydrate prior turns from AgentChatSqlV1 DO / R2 (SSOT transcript)
  → append current user message
  → if images: content = [ {type:text}, {type:image, source:{type:base64,...}} ]
  → NEVER stringify content arrays in compaction normalize
  → Auto: if image parts present → candidates where catalog.supports_vision = 1
  → model + tool loop
  → tools actually dispatch (D1 / CF / GitHub / fs_*→FSA fulfill)
  → append assistant (+ tool) turns to DO
```

Claude/Anthropic contract: image is native message content (`content[]`), not a side channel. Cursor same law for attach-on-prompt.

## Workstreams (ordered — do not skip)

### WS0 — Stop the lie (instrumentation) — 1 day

- Log once per turn: `history_hydrate { prior_count, source }`, `vision { files, blocks, content_is_array }`, `model { key, supports_vision }`, `tools_invoked[]`.
- Fail closed in logs when UI had attachment but `content_is_array=false` or `blocks=0`.

**Exit:** one chat turn produces those four log lines; you can see the break without guessing.

### WS1 — Vision input (P0, no backlog) — must ship first

1. Fix [`normalizeMessagesForCompaction`](../../src/core/conversation-compaction.js): preserve multimodal `content` arrays; do not `JSON.stringify` image parts.
2. Ensure order: vision apply → any compact path → provider still sees arrays on current turn.
3. Composer: real bytes on FormData `images` (rehydrate from previewUrl if `file.size===0`).
4. Auto: when turn has image blocks, Thompson only vision-capable catalog/arms (D1 flags — no hardcoded model id). Fail closed if none.
5. Workers AI: do not emit raw `reasoning_content` as user-visible chat tokens (strip/think gate) — separate from vision but stops Auto from looking “broken.”

**Acceptance (you):** drop PNG → “what’s in this image?” → accurate description. No `NO_IMAGE_FILE_IN_REQUEST` when bubble shows attach. Dual-pass later.

### WS2 — Conversational thread SSOT

1. Server-authoritative hydrate: `getChatMessages(env, conversationId)` → normalize roles → append current user turn (dedupe last user if needed).
2. Client may send `messages` JSON as hint; **DO wins** when non-empty.
3. Persist user+assistant (and tool summaries as needed) every turn so hydrate works on turn 2+.
4. Compaction: summarize only when over budget; retained recent turns keep structure; image parts on *current* turn never stringified.

**Acceptance (you):** turn 1 lists tools/count; turn 2 answers count + calls a real read-only tool with `tool_start`/`tool_done`.

### WS3 — Agentic spine: execute, don’t dump

Dumping 103 tools helped listing, not agency. Fix the loop:

1. **Profiled tool surface** — session may cache catalog, but each turn’s *active* tools should be a coherent working set (route/capability/allowlist from D1 — not “all oauth_visible forever” as the only strategy). Prefer: full catalog available to dispatcher + model sees a bounded, relevant set OR true long-context tool use with proven invoke rate.
2. **Force proof of invoke** — acceptance requires ≥1 real `tool_call` ledger row per capability lane (below).
3. **Kill paths that fake results** — no “I searched and found 3 tools” without `dispatchToolCallWithBudget`.
4. **Hang budget** — Worker “hung / never generate response” after first_token must be traced (open await / DO wait / tool budget); chat must `done` or `error`, not cancel silently.

**Acceptance (you):** Network shows tool SSE; D1 `agentsam_tool_call_log` has rows for the turn.

### WS4 — Infra lanes (Cursor replacement checklist)

Each lane needs one golden prompt + proof IDs (tool_call_log / fulfill / D1 receipt):

| Lane | Golden (example) | Proof |
|------|------------------|-------|
| D1 read | `agentsam_d1_query` count on a known table | tool_call_log + result |
| D1 write | scoped write + verify | tool_call_log |
| R2 | list/get a known key | tool_call_log |
| GitHub | `agentsam_github_list_commits` or tree on connected repo | tool_call_log |
| Local FSA | `fs_read_file` / write `_iam_proof.txt` with folder connected | SSE `client_fs_request` + `POST /api/agent/fs/fulfill` + disk |

FSA code exists; prove after WS1–WS3 so the model actually calls `fs_*`.

### WS5 — Dual-pass E2E → ship

- PASS1: vision + thread + one D1 + one GitHub tool in one conversation.
- PASS2: later session / hard refresh: hydrate still works; FSA read/write; no Auto-to-blind-model on image turn.
- `npm run record:ticket-e2e-pass` ×2 → `assert:ticket-shippable --set-shipped`.

## Explicit anti-patterns (do not)

- Claiming “session fixed” because tool cache hit.
- Hardcoding `model = sonnet` for images.
- Adding another DO table for “bootstrap” that isn’t the Messages payload.
- Shipping after deploy without your two E2E passes.
- Expanding tool count without invoke-rate proof.

## Key files

- Vision / compaction: `src/core/chat-composer-attachments.js`, `src/core/conversation-compaction.js`, `src/core/mode-controllers/agent-controller.js`
- Thread: `src/core/agentsam-chat-sessions.js` (`getChatMessages`), agent-controller message build
- Spine: `src/api/agent-chat-spine.js`, `src/core/agent-tool-loop.js`, `src/core/agent-session-context.js`
- Auto/vision gate: `src/core/resolveModel.js` / routing arms + `agentsam_model_catalog`
- FSA: `src/core/agent-tool-loop.js` (`client_fs_request`), `src/api/agent.js` (`/api/agent/fs/fulfill`), `dashboard/src/lib/library/clientFsFulfill.ts`
- Workers AI mush: `src/core/provider.js` (`extractWorkersAiContent` / `reasoning_content`)

## Definition of done (project-level)

Operator can: attach screenshot → agent sees it → continue conversation with memory → edit/query D1 → touch GitHub → read/write local folder — without opening Cursor. Two recorded E2E passes. Ticket `shipped` only via assert.
