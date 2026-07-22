# Gemini Interactions transport adapter (later sprint)

**D1 ticket:** `tkt_gemini_interactions_transport`  
**Status:** backlog (do not start until generateContent path is stable + OpenAI WS dual-pass fleet is green enough to copy patterns)  
**Dual-pass:** `required_pass_count = 2`

## Goal

Add a **feature-flagged** Gemini transport that uses the Interactions API while keeping the **same** Agent Sam tool loop, history, and dashboard SSE contract as today’s `generateContent` / `streamGenerateContent` path.

This is an **adapter** sprint — not a naive swap that forks history/tools/streaming into a second product spine.

## Feature flag (locked shape)

| Key | Values | Default |
|---|---|---|
| `gemini_transport` | `generate_content` \| `interactions` | `generate_content` |

- Default stays **generateContent until Interactions is green** (Sam allowlist soak first, then widen).
- Flag resolution: same pattern as `openai_responses_ws` (D1 / user allowlist / workspace override — no hardcoded `au_*` in hot paths).
- Emit transport on every turn (`X-IAM-Gemini-Transport` or existing provider_transport SSE field) for proof.

## Architecture (must preserve one spine)

```
Gemini Interactions steps  ↔  IAM message / tool-call shape  ↔  existing SSE + tool executor
```

| Direction | Contract |
|---|---|
| Inbound | Interaction steps (`model_output`, `function_call`, `function_result`, thoughts) → existing conversation / tool-call items |
| Outbound | Catalog tools + results → Interactions `tools` / `function_result` |
| Streaming | Interaction events → same SSE the dashboard already consumes |
| State | Prefer IAM DO/history as SSOT (`store=false` if available) **or** document `previous_interaction_id` resume with exact-order replay |

Mirror the OpenAI Responses WS adapter pattern (`src/integrations/openai-responses-ws.js` + DO holder) — do not invent a second agent controller.

## Acceptance criteria

1. **Flag dual-path**  
   - `gemini_transport=generate_content` (default) unchanged behavior.  
   - `gemini_transport=interactions` routes through the new adapter only when allowlisted.

2. **Parity with current loop**  
   - Multi-turn history hydrates.  
   - Progressive tool discovery + named catalog pin still work.  
   - Tool execute → result → next model turn without dropping SSE `done`.

3. **Hard edges covered (or explicitly deferred with ticket notes)**  
   - Thought / thinking signatures  
   - Multimodal / vision attachments (ephemeral attach law)  
   - Background / long-running interactions (if used)  
   - Mid-turn disconnect → loud fallback to `generate_content` (like OpenAI WS → HTTP)

4. **Dual-pass E2E before `shipped`**  
   - PASS1: Sam allowlist, Interactions transport, ≥1 real tool round, SSE complete.  
   - PASS2: separate session later; kill/reconnect or flag flip proves fallback + no silent tool loss.  
   - Record via `npm run record:ticket-e2e-pass`.

5. **No default cutover** until both passes green and status_reason cites proof event ids.

## Non-goals (this ticket)

- Replacing Anthropic / OpenAI transports.
- Making Interactions the only Gemini path.
- Expanding model catalog rows beyond transport plumbing.

## Related

- Live path today: `src/integrations/gemini.js` (`generateContent` / `streamGenerateContent`).
- OpenAI analogue: `tkt_oai_responses_ws`, `tkt_oai_ws_do_holder` (shipped holder dual-pass).
- Schema hygiene already shipped for Gemini tool decls: `8023c2f1` (partial `anyOf` fix).

## Sequencing

1. Stay on generateContent for production default.  
2. Implement adapter behind flag.  
3. Sam soak → dual-pass → only then consider default flip (separate decision / follow-up ticket).
