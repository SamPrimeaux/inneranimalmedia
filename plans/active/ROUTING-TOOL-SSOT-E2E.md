# ROUTING-TOOL-SSOT — End-to-end fix + gate harness

**Status:** Phase 1 **implemented** — D1 `agentsam_tool_profiles` + default-deny oauth; gate green ×2 required for `shipped`  
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
| G-d1 | `task_type=d1_query` **and** `d1_query`/`agentsam_d1_*` in SSE or `agentsam_tool_call_log` |
| G-image | **opt-in** (`--include-image`) — image fast path skips tool loop; proven elsewhere |

## Phase 1 — D1 tool profiles (implemented)

- `migrations/841_agentsam_tool_profiles_ssot.sql` — `agentsam_tool_profiles` SSOT
- `migrations/842_tool_profile_task_bindings.sql` — **task_type → profile_key** (new case = D1 row, not deploy)
- `src/core/d1-tool-profile.js` — bindings-first resolve; apply `write_policy_json`; JS cold-start only
- **Default deny oauth** — never from `toolProfile=oauth_parity`
- Gate `G-tool-profiles` — every `tool_keys_json` key must resolve to live `agentsam_tools`

**Diagnostic law:** new task_type → `INSERT agentsam_tool_profile_bindings`. New tools → `UPDATE tool_keys_json`. If you edit `resolveD1ToolProfileKey` / inspect regex for a new case, you failed the diagnostic.

## Phase 2+ (future)

Demote remaining JS message heuristics (`isRepoInspectIntent`) — DELETE-BY on this ticket when unused.

---

## Success

1. Gate green twice on `main` after routing changes  
2. New profile = migration, not JS  
3. Tickets stay open until proof counters say otherwise
