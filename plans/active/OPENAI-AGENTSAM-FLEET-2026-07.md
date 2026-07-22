# OpenAI Agent Sam Fleet (2026-07)

SSOT for the OpenAI Agent Sam capability fleet. Cursor plan mirror: `.cursor/plans/openai_agent_sam_fleet_*.plan.md`.

## Product purposes

| Job | Who | Capabilities |
|---|---|---|
| Platform desk | Sam | Responses WS, apply_patch, IAM terminal remote, PTC reads, multi-agent review |
| Client delivery | Agency | Allowlisted clones, retrieve, patch — no tenant GCP desk |
| In-app coding agent | Power users | WS latency, PTC, shell hybrid, compaction |
| Voice operator | Sam | Realtime voice + IAM tools (Meet stays video) |
| Scoped client Sam | Tenants | Same stack, tight allowlists |
| Media / a11y assist | MeauxMedia | STT/TTS/translate lanes |
| Fleet self-build | Agent Sam | Implements own tickets on remote VM |

## Phase order (locked)

1. **Responses WebSocket + DO holder** — execute now  
2. Realtime voice  
3a. apply_patch / hosted shell (**blocked on REPAIR-REMOTE-TERMINAL**)  
3b. Programmatic Tool Calling (**blocked on `tkt_oai_ws_do_holder` dual-pass**)  
4. Multi-agent + compaction  
5. Background / ops

## Phase 1 — shipped surface (this sprint)

- DO `OpenAiResponsesWsV1` binding `OPENAI_RESPONSES_WS` — outbound WS to OpenAI Responses  
- Adapter [`src/integrations/openai-responses-ws.js`](../../src/integrations/openai-responses-ws.js) → SSE compatible with existing consumer  
- Flag `openai_responses_ws` (Sam user allowlist first; HTTP fallback always)  
- Safety header: hashed `OpenAI-Safety-Identifier`  
- Headers: `X-IAM-OpenAI-Transport: websocket|http`

### Tickets

| ID | Status gate |
|---|---|
| `tkt_oai_responses_ws` | Flag on; tool loop works; HTTP fallback on WS fail |
| `tkt_oai_ws_do_holder` | DO survives multi tool-round; reconnect + `previous_response_not_found` → HTTP full-input fallback; **dual-pass E2E required before PTC** |

## Phase 3b — PTC (ticket-ready ACs — do not build until WS DO dual-pass)

**Execution locus (explicit):** OpenAI runs generated JavaScript in their **hosted isolated V8** runtime. IAM does **not** execute program JS. Client-owned `function_call` items (with `caller.type=program`) are executed by IAM tool executor; results return as `function_call_output` with **`caller` copied verbatim**. Nested calls are callbacks into IAM — treat as the same authz surface as direct tools (plus egress/logging). This is **not** the same as `openai_hosted_shell` containers, but it is still an OpenAI-hosted compute surface that can invoke our tools.

### Acceptance criteria (must be on tickets)

1. **`agentsam_tools.caller_policy` SSOT (fail-closed)**  
   - Column exists (migration 985).  
   - NULL / missing ⇒ `["direct"]` only.  
   - When building Responses `tools[]`, set `allowed_callers` from `caller_policy` — never invent open defaults.  
   - Tool executor **re-checks** classification at invocation time (even if model somehow requests programmatic on a write tool).  
   - Writes / approvals / terminal mutations stay `["direct"]` only.

2. **Exact-order full replay on resume**  
   - With `store:false`, replay every `program`, reasoning, `function_call`, `function_call_output`, `program_output` item in original order.  
   - Dual-pass E2E: kill connection mid multi-pause program; assert `caller` integrity **and** exact-order replay; loud failure if mangled (never silent).

3. **Defer-loading vs programmatic**  
   - Any tool with programmatic in `caller_policy` is excluded from `defer_loading`, **or** intent/filter always preloads the full programmatic-eligible set when `openai_ptc=1`.  
   - Documented on `tkt_oai_ptc_schemas`.

4. **Sequencing**  
   - `tkt_oai_ptc` / `tkt_oai_ptc_schemas` must not start until `tkt_oai_ws_do_holder` has **two** recorded E2E passes.

### Runtime ticket (`tkt_oai_ptc`)

| Piece | Behavior |
|---|---|
| Flag `openai_ptc` | Sam allowlisted; injects `{type:"programmatic_tool_calling"}`; sets `store:false` |
| Caller preserve | SSE slots → pendingToolCalls → tool_result → `function_call_output.caller` verbatim |
| Exact-order replay | Accumulate `sentInput + response.output + function_call_output*` across turns; no `previous_response_id` while PTC active |
| Loud integrity | Missing `caller` on programmatic pause → emit error + throw (never silent) |


| Piece | Where |
|---|---|
| Parse / fail-closed helpers | [`src/core/openai-caller-policy.js`](../../src/core/openai-caller-policy.js) |
| Responses `allowed_callers` | [`toOpenAIResponsesTools`](../../src/integrations/openai.js) — strips `defer_loading` when programmatic allowed |
| Catalog propagate | spine / oauth parity / progressive / branded SELECT + tool loader map `caller_policy` |
| Invoke re-check | `validateToolCall` denies `caller.type=program` when policy lacks programmatic |
| Seed | migration `988_openai_ptc_caller_policy_seed.sql` — read/search opt-in; writes/terminal/approval → `["direct"]` |
| Flag | `openai_ptc` stays **off** until `tkt_oai_ptc` runtime; with flag off wire always emits `["direct"]` even if D1 allows programmatic |

**Defer-loading law:** OpenAI programs cannot invoke tool search. If a tool is programmatic-eligible, never mark it `defer_loading:true` on the Responses wire (`applyDeferLoadingLaw`). When OpenAI hosted `tool_search` is added later, either exclude programmatic tools from deferral or preload the full programmatic-eligible set whenever `openai_ptc=1`.
## Phase 3a blockers

- **REPAIR-REMOTE-TERMINAL** ([docs/ops/REPAIR-REMOTE-TERMINAL.md](../../docs/ops/REPAIR-REMOTE-TERMINAL.md)): hybrid default routes platform work through `agentsam_terminal_remote`. Fix before Phase 3a. Does **not** block Phase 1/2.  
- Hosted shell egress: org allowlist must be set in OpenAI dashboard before `openai_hosted_shell=1` can use network_policy (request can only further restrict).  
- `apply_patch`: confirm catalog model capability before wiring (GPT-5.1+ / catalog row — no hardcoded model ids).

## Feature flags

| Key | Default |
|---|---|
| `openai_responses_ws` | off globally; Sam user allowlisted for soak |
| `openai_ptc` | off; depends on WS DO dual-pass |

## Dual-pass law

All fleet tickets: `required_pass_count=2`. Deploy ≠ pass.
