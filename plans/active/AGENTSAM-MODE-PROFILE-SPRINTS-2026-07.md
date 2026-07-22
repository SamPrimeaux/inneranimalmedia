# Agent Sam — mode/profile Cursor-parity sprints

**D1 ticket:** sync via `npm run sync:active-plan-tickets -- --apply` (id TBD until apply)  
**Status:** `active` · **Priority:** P0-adjacent (after/with spine E2E) · **Subsystem:** `agent_spine`  
**SSOT detail:** [`agentsamrefine.md`](../../agentsamrefine.md) (updated 2026-07-22)  
**Sibling P0:** [`AGENTSAM-SPINE-E2E-CURSOR-PARITY-2026-07.md`](./AGENTSAM-SPINE-E2E-CURSOR-PARITY-2026-07.md) — vision + thread + tools  
**Tool menus:** [`CURSOR-PARITY-TOOL-DISCOVERY-2026-07.md`](./CURSOR-PARITY-TOOL-DISCOVERY-2026-07.md)  
**Law:** dual-pass E2E before `shipped`. Deploy ≠ pass.

---

## Product outcome

In-app Agent Sam mode picker behaves like Cursor:

- **Ask** never mutates  
- **Plan** designs without building  
- **Agent** executes  
- **Debug** is evidence-first  
- **Multitask** fans out and synthesizes  

Mode is one orchestration profile per turn — not a label on a maze.

---

## Baseline (2026-07-22)

Already on `main`:

- Live `resolveRuntimeProfile` / `compileModeProfile`
- `executeAgentChatSpine` → five mode controllers
- Shift+Tab mode cycle
- SSE `runtime_context` with `profile_id` / `profile_hash`

Gaps: Multitask often = Agent loop; Debug thin; Ask/Plan/Agent **unit** contracts green (S2) — live dual-pass SSE still open; no `agentsam_mode_profiles` table.

---

## Sprint board

| Sprint | Name | Est. | Depends | Exit |
|--------|------|------|---------|------|
| **S0** | Doc truth | done | — | `agentsamrefine.md` matches `main` |
| **S1** | Hygiene | **done 2026-07-22** | — | Single `mode` POST; tests green; dead handler gone; `guard:agent-mode` |
| **S2** | Mode contracts | **done 2026-07-22 (unit)** | S1 | Acceptance #1–#3 unit proofs; live dual-pass before ticket `shipped` |
| **S3** | Debug rigor | 2–3d | S2 | Acceptance #4 dual-pass |
| **S4** | Multitask fan-out | 5–8d | S2 | Acceptance #5 dual-pass |
| **S5** | Materialize profiles | 2–3d | S2 | Optional; compile script + D1 table |

**Parallel:** P0 spine E2E (vision/thread/tools) — required for “replace Cursor,” independent of S3/S4 polish.

---

## S2 shipped notes (2026-07-22)

- `src/core/mode-write-gate.js` — seal Ask/Plan write_policy; name + capability mutate deny
- Wired into `compileModeProfile` + `validateToolCall` (before CODEMODE allow)
- Proofs: `node --test tests/unit/mode-write-contracts.test.mjs` (Acceptance #1–#3)

Live composer Ask/Plan/Agent SSE dual-pass is still required before marking the D1 ticket `shipped`.

---

## Acceptance tests (copy from SSOT)

1. Plan → plan artifact; no writes  
2. Ask → read-only; `write_policy` false  
3. Agent → edit allowed  
4. Debug → evidence-first  
5. Multitask → ≥2 subagent SSE + synthesis  

Record:

```bash
npm run record:ticket-e2e-pass -- --ticket=tkt_… --detail='PASS1: …'
npm run record:ticket-e2e-pass -- --ticket=tkt_… --detail='PASS2: …'
npm run assert:ticket-shippable -- --ticket=tkt_… --set-shipped
```

---

## Do / don’t

**Do:** branch on `profile.execution_kind` / `write_policy` only.  
**Don’t:** add new `requestedMode ===` mazes in `agent.js`.  
**Don’t:** ship three static Debug/Agent/Multitask tool menus — progressive discovery is the Cursor axis.  
**Don’t:** mark shipped after one happy path.
