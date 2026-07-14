# CLOSED-LOOP — Catalog-driven live compact + durable session summarize

**Ticket:** `tkt_closed_loop_auto_compact_memory_2026_07_14`  
**Status:** `active` · **Priority:** P1  
**Project:** `inneranimalmedia` · **Subsystem:** `context`  
**Tags:** `closed-loop`, `compaction`, `memory`, `session-summarize`, `model-catalog`  
**Required passes:** 2 (dual-pass E2E before `shipped`)

## Doctrine (one line)

**Compact so the model can keep working; summarize so the platform can remember.**  
Do not conflate live prompt shrink with durable `conversation_summary` writes.

## Layers (do not merge)

| Layer | Job | Trigger | Writes |
|-------|-----|---------|--------|
| **A. Live context** | Fit / sharpen next model call | ~60–70% of *usable* budget (catalog `context_max_tokens` − system − tools − RAG − output reserve) | In-prompt digest + last ~N turns; optional R2 digest |
| **B. Durable memory** | Cross-session recall | After successful A, session close/idle, `/summarize` | R2 `messages.jsonl` → `/api/internal/summarize-session` → model catalog → `agentsam_memory` (`conversation_summary`) → `memory_oai3large_1536` |
| **C. Provider compact** | Claude-native shrink | Catalog `supports_compaction` | Provider SSE + `agentsam_compaction_events`; optional atom distill |

Existing footholds: `conversation-compaction.js` (session-type thresholds), `maybeCompactChatSession` → `maybeSummarizeSessionAfterCompaction`, Wave-2 `agentsam-session-summarize.js`, Anthropic compact beta.

## Outcome (when done)

1. **Catalog-driven A:** Threshold from model row usable budget (not only hardcoded 45k–100k by session type). Session-type multipliers may remain as modifiers.
2. **Hysteresis:** No compact every turn after breach — cooldown / “grew another N tokens since last compact.”
3. **Fail soft:** Summarize-model failure → retain tail + crude truncate; never block user reply.
4. **A → B side effect:** Successful live compact enqueues durable summarize (idempotent `conversation_summary:{sessionId}`); session close/idle always runs B even if A never fired.
5. **Ledger:** Compaction events land in `agentsam_compaction_events` with tokens before/after + strategy.
6. **Proof (dual-pass):** Long thread auto-compacts mid-chat with hot tail preserved; second pass shows memory row + vector lane for same session after close or compact.

## Non-goals

- Summarizing every message to Supabase.
- Nightly `one_am_compaction_pipeline` table hygiene (different problem).
- Replacing Anthropic compact — optional accelerator for Claude arms only.

## Anti-patterns

- Message-*count*-only gates (tool dumps vs short chatty turns).
- Waiting only for session close for B on never-closed long threads.
- Treating R2 digest dump as sufficient without LLM summarize for B.

## Related

- Wave 2 summarize path (shipped)
- `docs/platform/context-embedding-compaction-map-2026-06.md`
- `tkt_closed_loop_feedback_blindspots_2026_07_14` (telemetry read path — parallel)

## Dual-pass close

```bash
npm run record:ticket-e2e-pass -- --ticket=tkt_closed_loop_auto_compact_memory_2026_07_14 --detail='PASS1: live compact at usable-budget % …'
npm run record:ticket-e2e-pass -- --ticket=tkt_closed_loop_auto_compact_memory_2026_07_14 --detail='PASS2: durable summary + memory lane …'
npm run assert:ticket-shippable -- --ticket=tkt_closed_loop_auto_compact_memory_2026_07_14 --set-shipped
```
