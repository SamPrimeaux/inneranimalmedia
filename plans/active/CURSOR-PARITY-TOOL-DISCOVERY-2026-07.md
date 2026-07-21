# Cursor-parity tool discovery (revised) — do not ship three static menus

**Date:** 2026-07-21  
**Ticket:** `tkt_23052e89c7b44e45`  
**Status:** Destination = progressive discovery (Option B). **P0–P2 implemented** (validator bypass + core compile + search hydrate). Three-profile curated menus remain paused.

---

## What we almost built (wrong reference)

Plan: three admin-curated D1 menus — Debug gets ~14 read/patch tools, Agent ~16 execute tools (CF/deploy stripped or reduced), Multitask coordinator-lean or Agent-clone.

**Why it felt right:** token bloat from `tool_allowlist_count: 29`; Ask/Plan already look “mode-curated.”

**Why it’s the wrong Cursor parity:** Cursor does **not** gate native tool *availability* by mode label.

---

## What Cursor actually does

| Cursor axis | Behavior |
|-------------|----------|
| **Modes (Agent / Ask / Plan / Debug)** | Differ in **autonomy, prompting, checkpointing** — not a hard “Debug can’t see terminal” schema wall for native tools |
| **Tool-call budget** | Autonomy knob (e.g. ~25 calls/turn standard vs higher in Max) — hit cap → checkpoint / continue |
| **MCP bloat** | Flat ceiling (~40 tools total across MCP) — operators toggle **servers / groups** on/off, not engineers authoring Debug=14 / Agent=16 forever |
| **Direction (dynamic / progressive tools)** | Small **discovery** surface → model decides → **load schemas on demand** (same shape as MCP `tool_search`) |

**Implication:** Stripping CF/deploy from an “Agent kit” and maintaining three static allowlists copies a pattern Cursor isn’t using. It’s the same brittleness as Debug silently cloning Agent — three menus to babysit instead of one.

---

## What IAM already has (keep / reuse)

| Piece | Role | Cursor analogue |
|-------|------|-----------------|
| `agentsam_tools` catalog (~198 active, ~113 oauth_visible) | Tool + `input_schema` + `capability_key` | Native + MCP catalog |
| `agentsam_tool_profiles` + bindings | **Ceiling** / session menu (Ask/Plan already tight; Agent/Multitask ~29) | Not “three Debug menus” — one sane max + behavior |
| `write_policy_json` | Mutate allow / require approval | Run Modes / approval |
| `agentsam_prompt_routes` | Intent → tight `tool_keys` + `token_budget` | Progressive / per-turn relevance |
| `agentsam_search_tools` (active, oauth_visible) | Keyword catalog discovery + hydrate (not MCP `tools/list`) | `tool_search` |
| Progressive core (JS) | Turn-0 schemas: search_tools, fs_*, codebase, memory, search_web — **no** `agentsam_d1_query` (ceiling via profile) | Small discovery surface |
| `composer_multitask` (974) | Multitask → own profile key, **Agent-class tools** (Cursor-aligned parent) | Multitask inherits parent tools |
| Ask / Plan profiles | Read vs research ceilings | OK to keep as **behavior + lighter default menus** if desired; not the long-term bloat fix alone |

---

## Proposed Cursor parity (target architecture)

```text
                    ┌─────────────────────────────┐
                    │  ONE Agent-class ceiling     │
                    │  (CF / deploy / R2 / GH /    │
                    │   terminal / d1 — available) │
                    │  Soft max ≈ 32–40 schemas    │
                    └──────────────┬──────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
   Mode = autonomy            Discovery tool           Write policy
   (prompt + confirm +        agentsam_search_tools    allow / approve
    tool-call budget /        (+ optional prompt_      mutate
    checkpoint cadence)       routes intersect)
          │                        │
          └────────────┬───────────┘
                       ▼
              Per-turn loaded schemas
              (only what the model pulled
               or route scored as needed)
```

### Modes (behavior, not schema walls)

| Mode | Tool schemas | Autonomy |
|------|--------------|----------|
| **Ask** | Prefer read-heavy default; policy deny mutate | Answer / explore |
| **Plan** | Research + memory; deny deploy/edit by policy | Design / decompose |
| **Agent** | Full ceiling available via discovery + policy | Execute; N tool calls / checkpoint |
| **Debug** | **Same ceiling** — differ by **prompt + confirm-before-mutate + evidence-first** | Inspect → prove → fix |
| **Multitask** | Same ceiling (already `composer_multitask`); children scope via subagent profiles | Fan-out / coordinate |

Do **not** maintain separate Debug/Agent tool allowlists as the primary design.

### Progressive loading (the real token fix)

1. Turn 0 / cold start: ship a **small core** (identity + discovery + maybe 4–8 always-useful reads) **or** one ceiling name-list without full schemas where the provider supports deferred tools.
2. Model calls `agentsam_search_tools` (or route-scored hydrate) → worker injects **full schemas** for matched keys into the next tool round.
3. Optional: intersect with `agentsam_prompt_routes.tool_keys` + `token_budget` when a route fires — **dynamic filter**, not a third static menu table.
4. Soft cap ~40 hydrated schemas (Cursor MCP-shaped ceiling); prefer toggle groups later (CF / GitHub / mail) over per-mode hand lists.

### Capabilities stay policy, not discovery

`write_policy_json` + approval continue to gate **execution**. Discovery can surface `agentsam_worker_deploy`; policy still requires approval. That’s Cursor Run Mode energy, not “Debug profile forgot deploy.”

---

## Double-gate (must fix first or hydrate silently fails)

Two independent gates today:

| Gate | Where | What it checks |
|------|-------|----------------|
| **Discovery / schemas** | `activeTools` in tool loop | What the model can *see* and call by name |
| **Execution allowlist** | `validateToolCall` → `runtimeProfile.tool_policy.allowlist` | Baked at **compile** from the same `toolAllowlist` as schemas |

```js
// agent-tool-validator.js — runs BEFORE capability/write_policy
if (compiledToolPolicy?.allowlist?.length && !allowlistHasTool(name, compiledToolPolicy.allowlist)) {
  return { allowed: false, reason: 'not in profile tool_policy allowlist', ... };
}
```

`compileModeProfile` sets `tool_policy.allowlist = toolAllowlist` (the compiled menu). If hydrate only grows `activeTools` but compile shrunk allowlist to the core set, discovered tools die at execution.

**Nuance:** If allowlist stays the **full Agent-class ceiling** (profile `tool_keys_json`) while `activeTools` starts as core-only, in-ceiling hydrate works without validator change. It breaks as soon as discovery can pull **outside** that ceiling, or if allowlist is naively tied to “schemas on the wire.”

### Fix (default = law-aligned)

**Law:** menu = discovery, policy = safety.

| Option | Change | When |
|--------|--------|------|
| **(a) Preferred** | For Agent / Debug / Multitask: do **not** enforce restrictive `tool_policy.allowlist` (empty / skip check). Rely on **denylist** + **write_policy / capability** + approval. | Matches stated law; simplest |
| **(b) Alternate** | Keep allowlist as ceiling; discovery also appends keys into session/`mcpRuntimeContext` (or mutates `profile.tool_policy.allowlist` + `tool_allowlist`) so `allowlistHasTool` sees them | If a hard ceiling allowlist must stay load-bearing |

**Sequence (do not reverse):**

1. **Validator / allowlist gate** — (a) or (b) so discovered keys can execute  
2. **`activeTools` grow-path** — after `agentsam_search_tools` (or route hydrate), append full schemas for next model round  
3. **Provider wiring** — uniform core+search→hydrate for **all** providers; Anthropic `defer_loading`/BM25 is **additive** (context-side), not primary (still uploads schemas on the wire today)

---

## Core always-on set (schemas on turn 0)

Small and boring — everything else discoverable (including CF/deploy/R2/github write/terminal/`d1_write`):

- `agentsam_search_tools` (required)
- `fs_read_file`, `fs_search_files`
- `agentsam_codebase_retrieve`
- `agentsam_memory_search`
- `agentsam_d1_query`
- `search_web`

Ceiling for *what may be discovered* remains Agent-class (profile / oauth catalog intersection) — **not** stripped by mode.

---

## Decision

**Destination: Option B** (progressive discovery). Option A (shared ceiling + Debug-as-behavior only) remains a possible labeled stopgap if needed mid-build — **not** three curated allowlists.

---

## Explicitly out of scope / do not do

- Migration that sets Debug to a reduced tool list and Agent to a different list “for Cursor parity.”
- Treating `composer_agent` / `composer_debug` / `composer_multitask` as three forever-synced hand-authored menus.
- Stripping CF/deploy from Agent “because Debug shouldn’t have them” — wrong axis.
- Building hydrate/`activeTools.push` **before** fixing the allowlist execution gate.

---

## Already shipped that still fits

- **974 `composer_multitask`:** Multitask has its own key with **Agent-class tools** — correct for Cursor “parent inherits tools”; children still scope via RWS/subagent profiles.
- **Ask / Plan** profiles: acceptable as read/research defaults; long-term token story is still progressive load, not more hand menus.
- **Anthropic** `buildAnthropicMessagesTools`: `defer_loading` + BM25 — keep as additive optimization after uniform hydrate works.

---

## Build order (Option B)

1. **P0 — Double-gate:** Agent/Debug/Multitask skip restrictive allowlist (a), or sync discovery into allowlist (b). Prove: tool not in initial `activeTools` but in ceiling/policy can still execute when forced.
2. **P1 — Core compile:** Agent/Debug/Multitask turn 0 schemas = core set above; ceiling keys remain discoverable.
3. **P2 — Hydrate path:** `agentsam_search_tools` result → resolve schemas from `agentsam_tools` → grow `activeTools` (+ allowlist if b).
4. **P3 — Prove:** trivial turn (schemas ≪ 29); deploy turn (`agentsam_worker_deploy` appears after search, executes under write_policy approval).
5. **P4 — Optional:** Anthropic defer/BM25 on top; prompt_routes intersect as scorer.
