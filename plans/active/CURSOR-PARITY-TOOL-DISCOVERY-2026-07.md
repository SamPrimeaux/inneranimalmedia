# Cursor-parity tool discovery (revised) — do not ship three static menus

**Date:** 2026-07-21  
**Ticket:** `tkt_23052e89c7b44e45`  
**Status:** Proposal / decision needed — **paused** three-profile migration (`composer_agent` / `composer_debug` / `composer_multitask` as curated allowlists)

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
| `agentsam_search_tools` (active, oauth_visible) | Catalog discovery tool — seed for progressive load | `tool_search` |
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

### Capabilties stay policy, not discovery

`write_policy_json` + approval continue to gate **execution**. Discovery can surface `agentsam_worker_deploy`; policy still requires approval. That’s Cursor Run Mode energy, not “Debug profile forgot deploy.”

---

## Decision options (pick one before more profile migrations)

### Option A — Smaller stopgap now, honest framing

- **One** Agent-class ceiling (keep CF/deploy/R2 — Cursor doesn’t strip those).
- Point **Debug** (and keep Multitask) at that ceiling **or** keep distinct `profile_key`s that **share the same `tool_keys_json`** so menus don’t diverge.
- Fix “Debug isn’t Debug” via **autonomy**: system prompt, confirm-before-mutate, lower `max_tool_calls` / checkpoint cadence — **not** a 14-tool wall.
- Schedule progressive discovery as Phase 2.

**Pros:** Fast; stops Fake-Debug branding; no three-way drift.  
**Cons:** Token bloat remains until Phase 2.

### Option B — Skip stopgap kits; build progressive discovery

- Reuse `agentsam_prompt_routes` + `agentsam_search_tools` as the per-turn filter on **one** sane ceiling.
- Wire in-app Agent compile path to hydrate schemas on demand (MCP `tool_search` pattern).
- Modes only change autonomy / policy / budgets.

**Pros:** Matches Cursor + industry direction; one menu to maintain.  
**Cons:** Larger build; needs careful SSE / tool-loop UX.

**Recommendation:** Prefer **B** as the destination; if a ship this week is required, **A** only as labeled stopgap — **do not** ship three different curated allowlists.

---

## Explicitly out of scope / do not do

- Migration that sets Debug to a reduced tool list and Agent to a different list “for Cursor parity.”
- Treating `composer_agent` / `composer_debug` / `composer_multitask` as three forever-synced hand-authored menus.
- Stripping CF/deploy from Agent “because Debug shouldn’t have them” — wrong axis.

---

## Already shipped that still fits

- **974 `composer_multitask`:** Multitask has its own key with **Agent-class tools** — correct for Cursor “parent inherits tools”; children still scope via RWS/subagent profiles.
- **Ask / Plan** profiles: acceptable as read/research defaults; long-term token story is still progressive load, not more hand menus.

---

## Next (after operator chooses A or B)

1. Record decision on `tkt_23052e89c7b44e45`.
2. If A: Debug binding → shared ceiling + autonomy patch (prompt / max_tool_calls / confirm).
3. If B: design hydrate protocol for `agentsam_search_tools` in `compileModeProfile` / tool loop; prove with one trivial turn (schemas ≪ 29) and one deploy turn (deploy schema appears after discovery).
