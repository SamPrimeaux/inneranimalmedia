# Token-Efficiency Refactor — Full Code Review (Pre-Deploy)

**Date:** 2026-03-18  
**Scope:** worker.js token-efficiency changes only (diff includes other features; this review focuses on caps, mode builders, rolling summary, tool filtering, audit).

---

## PART 1: CODE REVIEW

### 1.1 Full diff of worker.js (critical sections)

The full diff is large (812 insertions, 45 deletions). Below are the **token-efficiency-specific** sections.

#### PROMPT_CAPS object (all new constants)

**File:** `worker.js`  
**Lines:** 1410–1421 (current)

```javascript
const PROMPT_CAPS = {
  DAILY_MEMORY_MAX_CHARS: 2000,
  FILE_CONTEXT_MAX_CHARS: 4000,
  MEMORY_INDEX_MAX_CHARS: 4000,
  KNOWLEDGE_BLURB_MAX_CHARS: 2000,
  SCHEMA_BLURB_MAX_CHARS: 4000,
  MCP_BLURB_MAX_CHARS: 800,
  RAG_CONTEXT_MAX_CHARS: 3000,
  TRUNCATION_MARKER: '\n\n[... truncated]',
  SESSION_SUMMARY_MAX_CHARS: 1500,
  LAST_N_VERBATIM_TURNS: 6,
};
```

#### buildModeContext() — complete

**Lines:** 1511–1516

```javascript
function buildModeContext(mode, sections, compiledContextBlob, ragContext, fileContext, model) {
  if (mode === 'ask') return buildAskContext(sections, ragContext, fileContext, model);
  if (mode === 'plan') return buildPlanContext(sections, ragContext, fileContext, model);
  if (mode === 'debug') return buildDebugContext(sections, ragContext, fileContext, model);
  return buildAgentContext(sections, ragContext, fileContext, model, compiledContextBlob);
}
```

#### filterToolsByMode() — complete

**Lines:** 1519–1526

```javascript
function filterToolsByMode(mode, toolDefinitions) {
  if (!Array.isArray(toolDefinitions)) return [];
  if (mode === 'ask' || mode === 'plan') return [];
  if (mode === 'debug') {
    const debugToolNames = new Set(['terminal_execute', 'd1_query', 'r2_read', 'r2_list', 'knowledge_search']);
    return toolDefinitions.filter((t) => t && debugToolNames.has(t.name));
  }
  return toolDefinitions;
}
```

#### buildAskContext / buildPlanContext / buildAgentContext / buildDebugContext — complete

**Lines:** 1472–1508

```javascript
function buildAskContext(sections, ragContext, fileContext, model) {
  let core = (sections && sections.core) || '';
  if (!core && sections && typeof sections.full === 'string') core = capWithMarker(sections.full, 2500);
  const memory = (sections && sections.memory) ? capWithMarker(sections.memory, 1500) : '';
  const fileBlock = fileContext ? capWithMarker(fileContext, 2000) : '';
  let out = core + memory;
  if (ragContext) out += '\n\nRelevant platform context:\n' + capWithMarker(ragContext, 1500);
  out += (fileBlock ? '\n\n' + fileBlock : '');
  return out;
}

function buildPlanContext(sections, ragContext, fileContext, model) {
  let core = (sections && sections.core) || '';
  if (!core && sections && typeof sections.full === 'string') core = capWithMarker(sections.full, 4000);
  const memory = (sections && sections.memory) || '';
  const daily = (sections && sections.daily) || '';
  const fileBlock = fileContext ? capWithMarker(fileContext, PROMPT_CAPS.FILE_CONTEXT_MAX_CHARS) : '';
  let out = core + memory + daily;
  if (ragContext) out += '\n\nRelevant platform context:\n' + ragContext;
  out += (fileBlock ? '\n\n' + fileBlock : '');
  return out;
}

function buildAgentContext(sections, ragContext, fileContext, model, compiledContextBlob) {
  const full = (sections && typeof sections.full === 'string') ? sections.full : (compiledContextBlob && typeof compiledContextBlob === 'string') ? compiledContextBlob : (sections ? [sections.core, sections.memory, sections.kb, sections.mcp, sections.schema, sections.daily].filter(Boolean).join('') : '');
  let out = full;
  if (ragContext) out = 'Relevant platform context:\n' + ragContext + '\n\n' + out;
  out += (fileContext ? '\n\n' + fileContext : '');
  return out;
}

function buildDebugContext(sections, ragContext, fileContext, model) {
  let core = (sections && sections.core) || '';
  if (!core && sections && typeof sections.full === 'string') core = capWithMarker(sections.full, 3000);
  const schema = (sections && sections.schema) || '';
  const fileBlock = fileContext || '';
  return core + schema + (fileBlock ? '\n\n' + fileBlock : '');
}
```

#### Chat handler: buildModeContext call and system assembly (lines ~3886–3910)

```javascript
const systemWithBlurb = coreSystemPrefix + buildModeContext(chatMode, resolvedSections, compiledContext, ragContext, fileBlock, model);
let finalSystem = systemWithBlurb;

if (session_id && apiMessages.length > PROMPT_CAPS.LAST_N_VERBATIM_TURNS && env.R2) {
  try {
    const sumObj = await env.R2.get('knowledge/conversations/' + session_id + '-summary.md');
    if (sumObj) {
      const summaryText = await sumObj.text();
      const summaryBlock = capWithMarker(summaryText, PROMPT_CAPS.SESSION_SUMMARY_MAX_CHARS);
      finalSystem += '\n\n[Previous session summary]:\n' + summaryBlock;
      apiMessages = apiMessages.slice(-PROMPT_CAPS.LAST_N_VERBATIM_TURNS);
    }
  } catch (_) {}
}
```

#### Rolling summary logic (when it loads, what it does)

- **When:** Only when `session_id` is set, `apiMessages.length > 6`, and `env.R2` exists (lines 3901–3911).
- **Load:** `env.R2.get('knowledge/conversations/' + session_id + '-summary.md')`.
- **If file exists:** Summary text is capped at 1500 chars, appended to `finalSystem` as `[Previous session summary]:\n...`, and `apiMessages` is replaced with **only the last 6 turns** (`apiMessages.slice(-PROMPT_CAPS.LAST_N_VERBATIM_TURNS)`).
- **If file does not exist or error:** `sumObj` is falsy or `sumObj.text()` throws; the `try/catch` swallows it, so no summary is added and **history is NOT sliced** (all messages stay).

So: **replace ALL history with summary + last 6** only when the summary file exists; otherwise keep full history.

#### Tool filtering call

**Line:** 3955

```javascript
toolDefinitions = filterToolsByMode(chatMode, toolDefinitions);
```

Called after tool definitions are loaded from DB and before telemetry/streaming or tool loop.

#### Audit report assembly

**Non-streaming (tool loop) response** — lines 4248–4255:

```javascript
if (auditReport) {
  const outText = (content && content[0] && content[0].text) ? content[0].text : (typeof finalText === 'string' ? finalText : '');
  auditReport.output_tokens = charsToTokens(outText.length);
  auditReport.latency_ms = Date.now() - chatStartTime;
  toolLoopRes.audit = auditReport;
}
return jsonResponse(toolLoopRes);
```

**Initial audit object** (when `bodyAudit` is true) — lines 3982–3998:

```javascript
auditReport = {
  section_tokens: {
    core_system: charsToTokens(telemetryPayload.coreSystemChars),
    compiled_context: charsToTokens(telemetryPayload.compiledContextChars),
    rag_context: charsToTokens(telemetryPayload.ragContextChars),
    file_context: charsToTokens(telemetryPayload.fileContextChars),
    conversation_history: charsToTokens(telemetryPayload.historyChars),
    tool_definitions: charsToTokens(telemetryPayload.toolDefChars),
  },
  total_input_tokens_est: charsToTokens(telemetryPayload.totalAssembledChars),
  mode: chatMode,
  tools_included: (toolDefinitions?.length ?? 0) > 0,
  message_count: apiMessages.length,
  output_tokens: null,
  latency_ms: null,
};
```

---

### 1.2 Cache compatibility logic

- **Where cache is read:** Chat path reads `compiled_context` from `ai_compiled_context_cache` (lines 3741–3757). Same column is used for both old and new format.
- **Old cache entries (plain blob):** Stored as a single string (full system blob). When read:
  - `compiledContext` = that string.
  - `builtSections` is null (only set when we build from scratch).
  - Then: `resolvedSections = builtSections` → null; `if (!resolvedSections && compiledContext)` → `resolvedSections = JSON.parse(compiledContext)` → **throws** (plain text is not JSON) → `resolvedSections = null`.
  - Then: `if (resolvedSections === null && compiledContext)` → `resolvedSections = { full: compiledContext }`.
  - So old cache is treated as **`{ full: <entire blob> }`**. All mode builders accept `sections.full` and use it (with caps where applicable). **No error; behavior is correct.**
- **New cache entries (JSON sections):** On cache miss we build `builtSections = { core, memory, kb, mcp, schema, daily, full }` and store `JSON.stringify(builtSections)` in `compiled_context`. On hit we either have `builtSections` (same request) or we read and `JSON.parse(compiledContext)` → `resolvedSections` is the sections object.
- **Will existing cache cause errors or just miss?** **No errors.** Old entries are plain text; `JSON.parse` fails and we fall back to `{ full: compiledContext }`. So existing cache continues to work; new writes use JSON and get section-level behavior. No migration required.

---

### 1.3 Streaming vs non-streaming paths

- **Same optimizations:** Yes. `finalSystem` is built once (with `buildModeContext`, rolling summary, capped file context, etc.) and passed to:
  - `streamOpenAI(env, finalSystem, apiMessages, ...)`
  - `streamGoogle(env, finalSystem, apiMessages, ...)`
  - `streamWorkersAI(env, finalSystem, apiMessages, ...)`
  - Anthropic streaming branch (`system: finalSystem` / `chatWithToolsAnthropic(..., finalSystem, ...)`)
  - Non-streaming tool loop and gateway/non-tool calls also use `finalSystem`.
- **Where audit is added in streaming:** In the Anthropic streaming branch, when the stream emits a `done` event (lines 4169–4172):

```javascript
const donePayload = { type: 'done', input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: amountUsd, conversation_id: conversationIdRef };
if (bodyAudit) donePayload.audit = { input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: Date.now() - chatStartTime, mode: chatMode, tools_included: false };
controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(donePayload) + '\n\n'));
```

So streaming **does** get the audit object on `done` when `body.audit` was true. Non-streaming tool-loop response gets the full `auditReport` (including `section_tokens`) at lines 4249–4255.

---

## PART 2: LOGIC VERIFICATION

### 2.1 Mode behaviors (actual code)

| Mode | What it gets | Code reference |
|------|----------------|----------------|
| **Ask** | Core (capped 2500 if from full), memory (capped 1500), optional RAG (capped 1500), file (capped 2000). **NO tools.** RAG is **not** run for Ask (see below). | buildAskContext; filterToolsByMode returns []; runRag is agent-only |
| **Plan** | Core (capped 4000 if from full), memory (uncapped in builder), daily, optional RAG, file (capped FILE_CONTEXT_MAX_CHARS). **NO tools.** RAG is **not** run for Plan. | buildPlanContext; filterToolsByMode returns [] |
| **Debug** | Core (capped 3000 if from full), schema (uncapped), file (full, no extra cap in builder). **Only** tools in `debugToolNames`: terminal_execute, d1_query, r2_read, r2_list, knowledge_search. | buildDebugContext; filterToolsByMode (debug branch) |
| **Agent** | Full context (or compiled blob), RAG when query length >= 10 words, file context (capped in assembly). **ALL tools.** RAG **is** run only when `chatMode === 'agent'`. | buildAgentContext; filterToolsByMode returns all; runRag = (chatMode === 'agent') && ... |

**RAG condition (line 3708):**

```javascript
const runRag = (chatMode === 'agent') && env.AI && lastUserContent && lastUserContent.split(' ').length >= RAG_MIN_QUERY_WORDS;
```

So **Ask and Plan never get RAG** in the current implementation.

---

### 2.2 Backwards compatibility

- **mode undefined:** Line 3643: `const chatMode = (bodyMode === 'ask' || bodyMode === 'plan' || bodyMode === 'debug' || bodyMode === 'agent') ? bodyMode : 'agent';` So undefined (or any other value) becomes **'agent'**. Safe.
- **Session summary missing in R2:** `env.R2.get(...)` returns undefined/null; `if (sumObj)` fails; we do not append summary and do not slice messages. Graceful.
- **fileContext has no startLine/endLine:** Lines 3888–3893: `if (typeof startLine === 'number' && typeof endLine === 'number' && endLine >= startLine)` — only then do we slice by lines. Otherwise we use full `content` and still apply maxChars truncation. Safe.

---

### 2.3 Rolling summary logic — summary

- **When does it load from R2?** When `session_id` is set, `apiMessages.length > 6`, and `env.R2` exists; then we `get('knowledge/conversations/' + session_id + '-summary.md')`.
- **Fallback if file doesn't exist?** Yes. No summary appended, history not sliced.
- **Replace all history or keep last 6?** When summary **exists**: we **replace** the visible conversation with summary + **last 6 turns** only. When summary **does not** exist: we keep **all** messages (no slice).

---

## PART 3: POTENTIAL ISSUES

### 3.1 Specific risks

**a) RAG in Ask mode for "search my knowledge"**  
- **Current behavior:** RAG runs only when `chatMode === 'agent'`. In Ask mode, `ragContext` is always empty. So "search my knowledge" in Ask mode will **not** get RAG. If you want RAG in Ask for knowledge search, you’d need to either run RAG for Ask when the query looks like a knowledge search, or document that knowledge search should use Agent mode.

**b) Plan mode enough context for good plans?**  
- Plan gets core (4k cap), memory, daily, optional RAG (but RAG is not run for Plan), and file context. So Plan has no RAG currently. If plans need platform/knowledge context, consider enabling RAG for Plan or adding a separate knowledge fetch for Plan.

**c) Existing conversations / cache format change?**  
- Old cache entries are plain blob; they are handled as `{ full: compiledContext }`. No errors; no breaking change.

**d) Race condition in session summary loading?**  
- Single async `R2.get` then use; no shared mutable state. No race.

**e) File context when Monaco has a file open?**  
- Yes. `bodyFileContext?.filename` and `bodyFileContext?.content != null` trigger the block. If `startLine`/`endLine` are numbers we slice that range; else we use full content. All capped at FILE_CONTEXT_MAX_CHARS (4000). Works.

---

### 3.2 Where things are logged

- **prompt_telemetry:** `console.log('[agent/chat] prompt_telemetry', JSON.stringify({ mode, provider, stream, tool_count, message_count, core_system_chars, core_system_tokens, compiled_context_chars, compiled_context_tokens, rag_context_chars, rag_context_tokens, file_context_chars, file_context_tokens, conversation_history_chars, conversation_history_tokens, tool_definitions_chars, tool_definitions_tokens, total_assembled_chars, total_assembled_tokens_est }));` — line 1445. Single line JSON.
- **Audit report:** Not logged to console; only added to HTTP response when `body.audit` is true. Streaming: `donePayload.audit = { input_tokens, output_tokens, latency_ms, mode, tools_included: false }`. Non-streaming tool loop: `toolLoopRes.audit = auditReport` with section_tokens, total_input_tokens_est, mode, tools_included, message_count, output_tokens, latency_ms.
- **Other console.logs added (in diff):** e.g. `[agent/chat] model_id`, Auto mode logs, `[singleRoundNoTools] modelKey`, `[singleRoundNoTools] Google request body`, `[runToolLoop] round`, `[runToolLoop] Google fetch resp.status`, etc. These are from the broader diff (Auto mode, Google path), not only token-efficiency.

---

## PART 4: TEST SCENARIOS

### 4.1 Ask mode — "What's 2+2?"

- **Assembled prompt:** core system (capped 2500) + memory (capped 1500) + no RAG + no tools. If summary exists and messages > 6: summary (capped 1500) + last 6 turns. File block only if `bodyFileContext` sent (capped 2000 in Ask).
- **Estimate:** Core ~600, memory ~400, history (e.g. 2 turns) ~100 → ~1.1k input tokens (rough).

### 4.2 Plan mode — "Plan how to rebuild the homepage"

- **Assembled prompt:** core (capped 4000) + memory + daily + no tools. **No RAG** (RAG not run for Plan). If summary exists: summary + last 6 turns.
- **Estimate:** Core ~1k, memory + daily ~1k, history ~200 → ~2.2k input tokens (rough).

### 4.3 Agent mode — "List files in R2 and create a summary doc"

- **Assembled prompt:** full context (all sections), RAG if query length >= 10 words (capped 3000), file context if sent (capped 4000), **all tools**.
- **Estimate:** Full system can be 10k+ chars (~2.5k tokens), RAG ~750 tokens, file ~1k tokens, history variable → e.g. 4k–8k input tokens depending on history.

### 4.4 Debug mode — "Why is this SQL query failing?"

- **Assembled prompt:** core (capped 3000) + schema + file (full in builder, but file block still truncated at 4000 in assembly). Only debug tools: terminal_execute, d1_query, r2_read, r2_list, knowledge_search.
- **Estimate:** Core ~750, schema ~1k, file ~1k → ~2.75k input tokens (rough).

### 4.5 Token savings (order-of-magnitude)

- **Old (no caps):** Full blob + unbounded RAG + unbounded file + full history → e.g. 15k–30k+ input tokens in heavy cases.
- **New (with caps):** Same scenarios with caps (e.g. RAG 3k, file 4k, daily 2k, memory 4k, schema 4k, summary 1.5k, last 6 turns) → e.g. 6k–15k input tokens.
- **Savings:** Highly scenario-dependent; **roughly 30–50%** in typical mixed usage when caps kick in.

---

## PART 5: DEPLOY READINESS

### 5.1 Confirmed NOT changed

- **OAuth handlers:** `handleGoogleOAuthCallback` and `handleGitHubOAuthCallback` do **not** appear in the worker.js diff (grep on diff file: no matches). Safe.
- **agent.html:** Not in the diff (diff is worker.js only).
- **FloatingPreviewPanel.jsx:** Not in the diff.
- **wrangler.production.toml:** Not in the diff.

### 5.2 Line count (worker.js only)

- **From `git diff --stat worker.js`:**
  - **Lines added:** 812  
  - **Lines removed:** 45  
  - **Net change:** +767 lines  

Note: This counts the entire worker.js diff (Auto mode, trigger-workflow, public routes, Google gateway, gdrive/github/cf_images tools, screenshots/images API, etc.). The token-efficiency refactor is a subset of these changes (PROMPT_CAPS, mode builders, cache JSON, rolling summary, tool filter, audit, caps on blurb/sections).

---

## Summary

- **Cache:** Old plain-blob cache is treated as `{ full: blob }`; no errors, no migration needed.
- **Streaming:** Uses same `finalSystem` and gets audit on `done` when `body.audit` is true.
- **Modes:** Ask/Plan get no tools and **no RAG**; Debug gets debug-only tools; Agent gets full context and RAG.
- **Backwards compat:** mode undefined → agent; missing summary or fileContext fields handled safely.
- **Risks:** RAG in Ask/Plan is currently off; consider enabling for “knowledge” queries in Ask or Plan if desired.
- **Protected files:** OAuth, agent.html, FloatingPreviewPanel.jsx, wrangler.production.toml are unchanged.

Do **not** deploy until you say **deploy approved**.
