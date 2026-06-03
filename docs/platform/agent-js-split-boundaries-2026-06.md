# Agent.js Modular Split — Boundaries (doc 28 / P0-D)

**Status:** Tranche 1 shipped (`classify-intent.js`). Main handler remains `src/api/agent.js` until tranche 2–4.

Related: [Agent layer snapshot](./agent-layer-snapshot-p0-rag-2026-06.md) · [Platform baseline](./platform-baseline-2026-06-03.md)

---

## Target layout

```
src/api/agent/
  index.js              — re-exports modular surface (barrel)
  classify-intent.js    — ✅ shipped: inferIntentHeuristically, classifyIntent
  build-system-prompt.js — buildSystemPrompt, layer assembly, KV cache (tranche 2)
  session.js            — bootstrap, resolved context, session CRUD (tranche 2)
  stream.js             — agentChatSseHandler, SSE emit, runAgentToolLoop (tranche 3)
  dispatch.js           — tool loop dispatch, catalog integration (tranche 3)
  tool-result.js        — tool result normalization, approval gates (tranche 3)
  handler.js            — handleAgentRequest, handleAgentApi route table (tranche 4)
```

**Already external (do not duplicate):**

| Concern | Module |
|---|---|
| Lane context injection | `src/core/agent-chat-lane-context.js` |
| Execution lane routing | `src/core/agent-lane-router.js` |
| Semantic retrieval | `src/core/semantic-retrieval-dispatch.js` |
| Chat spine | `src/api/agent-chat-spine.js` |
| Mode controllers | `src/core/mode-controllers/agent-controller.js` |

---

## Import rules (no cycles)

```
production-dispatch.js → agent.js (handleAgentRequest)
agent-controller.js    → dynamic import agent.js (buildSystemPrompt, runAgentToolLoop)
agent.js               → agent/classify-intent.js
agent/classify-intent.js → core/* only (never agent.js)
```

`agent-controller.js` must **not** import from `agent/index.js` if that eventually re-imports controller paths.

---

## RAG chunking

After tranche 1, `scripts/agentsam_codebase_reindex.mjs`:

- **Chunks:** `src/api/agent/*.js`, core RAG hot paths (`agent-lane-router`, `catalog-tool-executor`, `semantic-retrieval-dispatch`, `rag-lanes`)
- **Skips:** `src/api/agent.js` monolith (389KB — do not embed until tranche 4 completes)

Run ingest only after split tranche 2+ or accept dashboard-only coverage until then.

---

## Tranche checklist

| Tranche | Module | Lines (approx) | Blocker for |
|---|---|---:|---|
| 1 ✅ | `classify-intent.js` | ~200 | P0-A wire + RAG chunk of intent logic |
| 2 | `build-system-prompt.js` | ~200 | Prompt layer RAG |
| 2 | `session.js` | ~400 | — |
| 3 | `stream.js` + `dispatch.js` | ~2500 | Tool loop RAG |
| 4 | `handler.js` + slim `agent.js` barrel | remainder | Full monolith retirement |

---

## Changelog

| date | change |
|---|---|
| 2026-06-03 | Tranche 1: classify-intent extraction + index barrel + shouldChunkFile allowlist |
