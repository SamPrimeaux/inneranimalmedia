# Qualification test gate — sign-off before rebuild (2026-07-11)

**Rule:** Programmatic scripts may **propose** frontend style reworks and backend logic changes. **No rebuild/deploy of proposed changes** until architectural audit + operator sign-off.

---

## Flow

```text
1. SCRIPT / AGENT  →  proposal artifact (diff plan, lane impact, cost estimate)
2. ARCHITECT AUDIT  →  Sol or Sonnet 5 reviews (different provider from author when possible)
3. OPERATOR SIGN-OFF  →  Sam explicit approve on proposal id
4. IMPLEMENT  →  scoped commit + deploy
5. METRICS  →  fixture run logged to eval sheet
```

---

## Proposal artifact (required fields)

| Field | Description |
|---|---|
| `proposal_id` | e.g. `prop-2026-07-11-editor-css` |
| `lane` | L0–L7 or B from conceptual lanes |
| `surface` | route, API, migration, script |
| `models_used` | catalog keys only |
| `risk` | low / medium / high |
| `rollback` | how to revert |
| `eval_fixture` | M1–M8, C1–C3, S1–S5 id |
| `status` | `draft` → `audited` → `approved` → `shipped` |

**Blocked statuses for implement:** `draft`, `audited` (needs approve), `rejected`

---

## Script lanes (safe / strategic / dynamic)

| Mode | Scripts | Allowed without sign-off |
|---|---|---|
| **Safe** | read-only D1 queries, curl smokes, eval runners | yes |
| **Strategic** | arm pause/priority migrations, catalog patches | proposal + sign-off |
| **Dynamic** | frontend CSS/component rewrites, worker hot-path logic | proposal + audit + sign-off |

---

## Sign-off phrase

Operator reply: **`APPROVE prop-{id}`** in chat or ticket comment.

Until then: scripts output proposals only; no `deploy:full` for that scope.

---

## Related

- [`AGENTSAM-CONCEPTUAL-LANES-2026-07.md`](./AGENTSAM-CONCEPTUAL-LANES-2026-07.md)
- [`MODEL-ARMS-KEEP-KILL-MATRIX-2026-07.md`](./MODEL-ARMS-KEEP-KILL-MATRIX-2026-07.md)
- [`AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md`](./AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md)
