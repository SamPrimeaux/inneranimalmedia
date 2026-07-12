# ROUTING-TOOL-SSOT — End-to-end fix + gate harness

**Status:** Phase 0 **implemented** — gate harness + D1 proof ledger; product SSOT (Phase 1+) waits until gate green ×2  
**D1 ticket:** `tkt_routing_tool_ssot`  
**Owner:** Agent Sam / Cursor  
**Why:** Weekend burn from JS pin profiles fighting oauth dump. Stop symptom patches. One SSOT path + a gate that fails the ship if we regress.

---

## Verification law (this ticket)

| Claim | Allowed? |
|-------|----------|
| `deploy:fast` exited 0 | **Not** a pass |
| One lucky chat in the UI | **Not** enough |
| `npm run gate:agent-routing` green **twice** + receipt + `agentsam_gate_runs` | Required before `shipped` |
| `npm run assert:ticket-shippable -- --ticket=tkt_routing_tool_ssot` | Must exit 0 before `--set-shipped` |

```bash
npm run gate:agent-routing
npm run gate:agent-routing:twice
npm run sync:active-plan-tickets -- --apply
npm run assert:ticket-shippable -- --ticket=tkt_routing_tool_ssot
```

Receipts: `tmp/gate-agent-routing/<ts>.json`  
D1: `agentsam_gate_runs`, ticket `consecutive_pass_count` / `required_pass_count`

---

## Law (non-negotiable)

```
message
  → resolveTurnDecision → TaskSpec
  → agentsam_route_requirements / agentsam_prompt_routes.tool_keys (D1)
  → compileModeProfile (no JS CORE_PINNED on hot path)
  → resolveModelForTask (arms only)
  → runAgentToolLoop
```

**Default deny tools.** OAuth dump is never the IAM agent fallback.

---

## Phase 0 — Gate harness (in progress → done when live receipt exists)

- `scripts/gate-agent-routing.mjs`
- `migrations/840_gate_proof_and_routing_tickets.sql`
- `scripts/sync-active-plans-tickets.mjs`
- `scripts/assert-ticket-shippable.mjs`

### Golden matrix

| ID | Check |
|----|--------|
| G-pty-status | D1 `command_template` on `pty_git_status` |
| G-ask-repo | no Gemini x-enum / no terminal-requires-command |
| G-inspect | inspect-ish TaskSpec; no gmail schema errors |
| G-d1 | not image_generation |
| G-image | image_generation / fastPath |

## Phase 1+ (blocked on gate green ×2)

D1 owns tool profiles; oauth default deny; demote JS pin modules to cold-start only.  
**No new `*-tool-profile.js` files.**

---

## Success

1. Gate green twice on `main` after routing changes  
2. New profile = migration, not JS  
3. Tickets stay open until proof counters say otherwise
