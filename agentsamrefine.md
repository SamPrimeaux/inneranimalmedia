# Agent Sam Refine — 5 Modes. 1 Spine.

**Last updated:** 2026-07-22  
**File:** `agentsamrefine.md` (living SSOT for mode → profile → loop parity)  
**Related P0:** [`plans/active/AGENTSAM-SPINE-E2E-CURSOR-PARITY-2026-07.md`](plans/active/AGENTSAM-SPINE-E2E-CURSOR-PARITY-2026-07.md) (`tkt_agentsam_spine_e2e_20260716` — vision + thread + tools)  
**Related:** [`plans/active/CURSOR-PARITY-TOOL-DISCOVERY-2026-07.md`](plans/active/CURSOR-PARITY-TOOL-DISCOVERY-2026-07.md) · [`plans/active/AGENTSAM-MODE-PROFILE-SPRINTS-2026-07.md`](plans/active/AGENTSAM-MODE-PROFILE-SPRINTS-2026-07.md)

**Thesis:** Cursor’s simplicity is not fewer capabilities — it is **one user-facing enum** that compiles to **one orchestration profile** consumed by **one execution loop**. Agent Sam now has the compile step **and** live controllers; remaining gaps are **UI contract hygiene**, **hard write guarantees**, **true Multitask fan-out**, and the separate **vision/thread hot-path** P0.

---

## Status snapshot (2026-07-22 — verified against `main`)

| Phase | Status | Notes |
|-------|--------|-------|
| **0 — Schema + contract** | **Shipped** | `src/core/agent-mode.js`, `runtime-profile.types.js`, `RUNTIME_PROFILE_VERSION` |
| **1 — Compiler** | **Shipped (live)** | `compileModeProfile` / `resolveRuntimeProfile`; chat uses `compile_lane: 'live'` via `agent-chat-spine.js`. Shadow helper still exists for diagnostics |
| **1b — Materialized profiles** | **Not started** | No `agentsam_mode_profiles` table / compile script |
| **2 — Thin handler** | **Shipped (chat path)** | `executeAgentChatSpine` (~385 LOC) → mode controllers. `agent.js` still ~5.6k (auth, surface, workflow, legacy); chat no longer runs the old maze |
| **2b — Mode controllers** | **Shipped (thin)** | `ask` / `plan` / `agent` / `debug` / `multitask` under `src/core/mode-controllers/` |
| **3 — Dashboard parity** | **Partial** | Shift+Tab cycles modes (`nextAgentMode`). POST still sends **three** fields: `mode`, `agent_mode`, `runtime_intent_mode` |
| **4 — Multitask fan-out** | **Partial** | Controller exists; RWS fan-out only when `allow_subagent_spawn`; else falls back to Agent-class single loop. No Cursor-grade parallel SSE UX |
| **5 — Acceptance gates** | **Open** | Five mode E2E tests below not dual-pass recorded |

**Module map (live):**

```text
POST /api/agent/chat
  → agent.js (auth / body / preflight)
  → executeAgentChatSpine
  → resolveRuntimeProfile | compileUserAppRuntimeProfile  (compile_lane: live)
  → resolveModelForTask (Thompson / pin)
  → mode_controller switch
       ask | plan | agent | debug | multitask
  → runSharedProfileToolLoop / plan pipeline / RWS fanout
```

---

## Current vs Cursor — gap matrix

| Cursor contract | Agent Sam today | Gap severity | Sprint |
|-----------------|-----------------|--------------|--------|
| One mode enum → one profile | **Yes** — `RuntimeProfile` compiled per turn | — | Done |
| Ask = hard no-writes | Soft: write_policy + regex mutation gate + `validateToolCall` | Medium — need proof + no escape hatches | S2 |
| Plan = research then approve, no build | `plan-controller` + plan pipeline | Medium — prove no terminal/file writes | S2 |
| Agent = full write + tool loop | `agent-controller` + shared loop | Low — depends on spine E2E (vision/thread) | P0 + S2 |
| Debug = evidence-first | Thin `debug-controller` (mostly shared loop + prompt) | Medium — force instrument/read-first contract | S3 |
| Multitask = parallel subagents + merge | Controller + optional RWS; often single loop | High | S4 |
| Shift+Tab mode cycle | **Yes** in composer | — | Done |
| Single POST `mode` field | Still triple-send compat fields | Low (debt) | S1 |
| Rules ambient / mode = autonomy | Rules in D1 + Cursor rules; mode sets write/tool caps | Low | Ongoing |
| Progressive tool discovery | P0–P2 in tool-discovery plan; not mode-static menus | Medium | Align w/ S2 |
| Fresh chat on mode change | Not enforced (Cursor recommends) | Low | S1 optional UX |
| Model picker orthogonal | Yes | — | Done |
| Vision + intact thread history | Separate P0 spine ticket | **Blocker for “replace Cursor”** | P0 spine |

**Honest % (mode/profile spine only):** ~65–70% of Cursor’s *mode orchestration* shape.  
**Honest % (replace Cursor for daily work):** gated by P0 spine E2E (vision + thread + real tools) — do not claim parity until that ticket dual-passes.

---

## Part 1 — Cursor’s mode simplicity (reference)

When the user switches mode, Cursor does not merely change a label. It swaps an **orchestration profile** — a bundled contract that downstream systems read as one unit:

```mermaid
flowchart LR
  subgraph UserLayer["User layer"]
    M[Mode selection]
    Msg[Message + @context]
  end

  subgraph Profile["Orchestration profile (compiled once per turn)"]
    SP[system_instructions]
    TP[tool_policy]
    WP[write_policy]
    CP[context_policy]
    PP[parallel_policy]
  end

  subgraph Exec["Execution"]
    Loop[Agent loop]
    Sub[Subagents optional]
  end

  M --> Profile
  Msg --> Profile
  Profile --> Loop
  PP --> Sub
  Sub --> Loop
```

**Profile fields (conceptual):**

- **system_instructions** — mode-specific behavior
- **tool_policy** — tools available / approval
- **write_policy** — edit / terminal / deploy
- **context_policy** — fresh vs continue
- **parallel_policy** — Multitask fan-out

**Shared across modes (not modes themselves):** Rules, Skills, Subagents, Model picker, Checkpoints, Cloud/browser agents.

| Mode | User intent | Hard contract |
|------|-------------|---------------|
| **Agent** | Do the work | Full write + tool loop |
| **Ask** | Understand | No side effects |
| **Plan** | Design first | No build until approved |
| **Debug** | Root-cause | Runtime evidence before patch |
| **Multitask** | Parallel workstreams | `parallel_policy = fan_out` |

Cursor docs: *“Project rules, user rules, and team rules apply in Agent, Ask, Plan, and Debug modes.”* Rules are ambient; modes are **autonomy sliders**.

---

## Part 2 — IAM spine today (not the May shadow draft)

### What exists (shipped)

| Piece | Path | Role |
|-------|------|------|
| Mode enum (UI) | `dashboard/components/ChatAssistant/types.ts` | `ask \| plan \| agent \| debug \| multitask` |
| Mode normalize | `src/core/agent-mode.js` | Server slug |
| Profile schema | `src/core/runtime-profile.types.js` | `RuntimeProfile` |
| Compiler | `src/core/runtime-profile.js` | D1 routes + requirements → flat profile |
| Spine | `src/api/agent-chat-spine.js` | Compile → model → `mode_controller` switch |
| Controllers | `src/core/mode-controllers/*` | Per-mode entry |
| Tool safety | `src/core/agent-tool-validator.js` | Enforces `write_policy` / denylist |
| SSE proof | `runtime-context.js` | Emits `profile_id`, `profile_hash`, `execution_kind` |
| Shift+Tab | `ChatAssistant.tsx` + `plan-mode-utils.ts` | Cycles `AGENT_MODES` |

### What still fights Cursor simplicity

| Anti-pattern | Where | Target |
|--------------|-------|--------|
| Triple mode form fields | `ChatAssistant.tsx` ~3133–3135 | Send `mode` only (Phase 3 / S1) |
| `agent.js` still huge | ~5618 LOC | Keep as edge/auth; no new mode branches |
| Ask mutation gate is regex | `ask-controller.js` | Keep as UX hint; **validator** is law — prove with E2E |
| Multitask ≈ Agent | `multitask-controller.js` | Always-on fan-out when policy allows; SSE lifecycle + UI chips |
| Debug is thin | `debug-controller.js` | Prompt + phase gates (read → instrument → fix) |
| Materialized profile table | missing | Optional S5 — faster cold start / audit |
| Unit tests broken locally | `tests/unit/runtime-profile.test.mjs` | Fix `auth` dir-import (S1) |
| Legacy `agentChatDirectSseHandler` | still in `agent.js` | Delete or thin-wrap (S1) |

### Cost-responsible contract (unchanged goal)

| Step | What happens | Cost control |
|------|----------------|--------------|
| 1. Login | Session → user + workspace | — |
| 2. Pick mode | UI sends **`mode` only** (S1) | Mode sets write_policy + tool ceiling |
| 3. Compile | `resolveRuntimeProfile` — one batch | Flat allow/deny; no scatter |
| 4. Model | Auto → `resolveModelForTask` | One Thompson sample |
| 5. Execute | Controller → shared tool loop | Ask/plan skip mutate tools |

---

## Part 3 — End-to-end sprints (close the gaps)

**Law:** dual-pass E2E before ticket `shipped`. Deploy ≠ pass.  
**Ordering:** Do **not** claim “Cursor parity” until **P0 spine E2E** (vision/thread/tools) and **S2 mode contracts** both dual-pass.

```mermaid
flowchart LR
  P0[P0 Spine E2E parallel]
  S1[S1 Hygiene]
  S2[S2 Mode contracts]
  S3[S3 Debug rigor]
  S4[S4 Multitask]
  S5[S5 Materialize optional]
  P0 --> S2
  S1 --> S2
  S2 --> S3
  S2 --> S4
  S4 --> S5
```

### Sprint S0 — Doc + baseline (this update)

**Outcome:** Living SSOT matches `main`; sprint ticket filed.  
**Done when:** This file + `plans/active/AGENTSAM-MODE-PROFILE-SPRINTS-2026-07.md` committed; status table above accurate.

---

### Sprint S1 — Dashboard + API contract hygiene (1–2 days)

**Outcome:** Mode is one wire field; dead code trimmed; tests green.

| # | Task | Proof |
|---|------|-------|
| S1.1 | POST only `mode` (keep reading legacy fields server-side 1 release) | Network tab shows single field |
| S1.2 | Mode-specific composer placeholder | Visual |
| S1.3 | Optional: toast “new chat recommended” on mode change | UX note |
| S1.4 | Fix `runtime-profile` unit tests (auth import) | `node --test tests/unit/runtime-profile.test.mjs` green |
| S1.5 | Delete or quarantine `agentChatDirectSseHandler` | `grep` clean / comment DEAD |
| S1.6 | CI guard: dashboard `AgentMode` ↔ `normalizeAgentRuntimeMode` | Script in `npm run guard:*` |

**Exit:** S1 checklist dual-pass (composer + unit tests).

---

### Sprint S2 — Hard mode contracts (3–5 days) — **core Cursor feel**

**Outcome:** Ask/Plan cannot mutate; Agent can; progressive discovery respected.

| # | Task | Proof |
|---|------|-------|
| S2.1 | Ask E2E: data question → read tools only; `write_policy.* === false` in SSE `runtime_context` | Acceptance #2 |
| S2.2 | Plan E2E: “plan auth refactor” → plan artifact; zero terminal/file writes | Acceptance #1 |
| S2.3 | Agent E2E: small edit path; file tools allowed | Acceptance #3 |
| S2.4 | Ensure `validateToolCall` is sole mutate gate (no controller bypass) | Code review + fail tool attempt in Ask |
| S2.5 | Align tool menus with progressive discovery plan (no new static Debug=14 kits) | See tool-discovery ticket |

**Exit:** Acceptance tests 1–3 dual-pass recorded on D1 ticket.

---

### Sprint S3 — Debug evidence-first (2–3 days)

**Outcome:** Debug feels like Cursor Debug, not Agent with a different label.

| # | Task | Proof |
|---|------|-------|
| S3.1 | System prompt + `debug_policy` phases: explore → instrument → reproduce → fix → cleanup | SSE / routing audit |
| S3.2 | Prefer read/search tools before write in first N turns | Tool manifest order / validator soft gate |
| S3.3 | Acceptance #4 dual-pass | Ticket events |

---

### Sprint S4 — Multitask fan-out (5–8 days)

**Outcome:** Multitask ≠ Agent clone.

| # | Task | Proof |
|---|------|-------|
| S4.1 | When `parallel_policy.enabled`, always decompose (cap `max_subagents`) | ≥2 child profiles |
| S4.2 | Child `resolveRuntimeProfile` with mode overlay + write_policy subset | Audit rows |
| S4.3 | SSE: `subagent_started` / `subagent_done` / synthesis | Client events |
| S4.4 | Dashboard chips / progress (reuse WorkflowRunBoard patterns) | UI |
| S4.5 | Acceptance #5 dual-pass | Ticket events |

**Defer:** `/worktree` isolation (separate ticket).

---

### Sprint S5 — Materialized profiles (optional, 2–3 days)

**Outcome:** Registry compile at deploy/ops time; request path is one SELECT or one function.

| # | Task | Proof |
|---|------|-------|
| S5.1 | Migration `agentsam_mode_profiles` | Remote apply |
| S5.2 | `scripts/compile-mode-profiles.js --dry-run` then apply | Diff report |
| S5.3 | Runtime prefers materialized row; falls back to live compile | Shadow log |

---

### Parallel P0 (does not replace S1–S4)

[`AGENTSAM-SPINE-E2E-CURSOR-PARITY-2026-07.md`](plans/active/AGENTSAM-SPINE-E2E-CURSOR-PARITY-2026-07.md):

1. Vision (images intact on hot path)  
2. Thread memory (no destructive normalize before provider)  
3. Tools actually execute (D1 / CF / GitHub / FSA)  

Without P0, mode parity is cosmetics.

---

## Success metrics — 5 runtime acceptance tests

| # | Test | Pass criteria |
|---|------|---------------|
| **1** | Plan + work intent | Plan artifact / tasks; no terminal; no file writes; profile `execution_kind=plan_pipeline` |
| **2** | Ask + data question | Read evidence or clear refusal; `can_d1_write === false`; no deploy/terminal in manifest |
| **3** | Agent + simple edit | `can_edit_files=true`; file tools used; no plan-pipeline hijack |
| **4** | Debug + bug report | `profile.mode=debug`; read/search before write; debug contract in prompt |
| **5** | Multitask + parallel | ≥2 subagent SSE events; parent synthesis; child write_policy ⊆ parent |

**Registry metric:** Adding a tool key on a prompt route appears in compiled `tool_allowlist` after compile — **no Worker code change** (S5 makes this a deploy-time artifact).

---

## File map

| File | Role | Status |
|------|------|--------|
| `src/core/agent-mode.js` | Mode enum + normalize | Live |
| `src/core/runtime-profile.types.js` | Schema | Live |
| `src/core/runtime-profile.js` | Compile + resolve | Live |
| `src/api/agent-chat-spine.js` | Chat spine | Live |
| `src/core/mode-controllers/*` | Per-mode entry | Live (thin) |
| `src/api/agent.js` | Auth / edge / legacy surface | Live (still large) |
| `dashboard/.../ChatAssistant.tsx` | Composer + Shift+Tab | Partial (triple mode fields) |
| `tests/unit/runtime-profile.test.mjs` | Compiler tests | Needs fix |
| `scripts/compile-mode-profiles.js` | S5 | Missing |
| `migrations/*_agentsam_mode_profiles.sql` | S5 | Missing |
| `src/core/multitask-orchestrator.js` | Early name; fan-out lives in `rws-spawn-fanout.js` + controller | Partial |

---

## Closing thesis

The May draft said *“shadow compile only; maze owns runtime.”* That is **no longer true**.

Today: **mode → live `RuntimeProfile` → controller → shared tool loop**.  

Still missing for Cursor *feel*: **hard Ask/Plan proofs**, **real Multitask parallelism**, **Debug discipline**, **single `mode` wire**, and the **P0 vision/thread** foundation.

**Next execution order:** S1 hygiene → S2 mode contracts (with P0 spine in parallel) → S3 Debug → S4 Multitask → S5 materialize.
