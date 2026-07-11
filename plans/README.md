# Planning law — product readiness

Pinned beside the surface audit.

## Principle

A surface is not functional because its route, page, API, and agent panel exist.
It is functional when **one meaningful user outcome** completes end to end,
survives refresh, reports failure honestly, and can be verified.

## Severity labels

| Label | Meaning | In active sprint? |
|-------|---------|-------------------|
| **B0** | Prevents the loop from completing | Yes |
| **B1** | Completes unreliably | Yes |
| **B2** | Confusing but usable | No — backlog |
| **B3** | Polish or expansion | No — backlog |

## Active vs backlog

- `plans/active/` — only the three vertical loops below, worked in order.
- `plans/backlog/` — everything else from the surface audit (18 missing routes,
  34 agent wiring gaps, Launch Desk scrape, UI remasters, etc.).

**Do not automatically repair the 18 missing routes.**

## Sprint order (product readiness)

1. **WORKSPACE-001** — Agent Sam repo edit loop  
2. **CMS-001** — edit + publish one page on `inneranimalmedia`  
3. **DESIGNSTUDIO-001** — Sam Sketch idea → persistent model artifact  

Then (later, only after loops work):

4. Product-aware Agent Sam (Projects, CMS, Design Studio, Draw, Images only)  
5. Cleanup / consolidation (orphans, duplicate Systems, Launch Desk, Create nav)

## Cursor operating rule (every vertical slice)

Investigate the complete path first.

Do not begin by changing the first visible component.

Trace:

```
route → page → state → API → service/tool → database/storage → response → UI state → verification
```

Identify the first broken boundary.

Propose the smallest coherent fix that completes the user outcome.

Do not add new navigation, panels, abstractions, or product features unless
required by the acceptance criteria.

Stop after presenting:

1. verified current path  
2. first broken boundary  
3. proposed files  
4. acceptance test  
5. rollback plan  

**Wait for approval before editing.**

## Task template

Every implementation ticket uses the template in the active `*-001-*.md` files.

## agentsam_tickets (D1 index)

Platform engineering work index: `agentsam_tickets` + append-only `agentsam_ticket_events`.

### Domain boundary (LOCKED)

| System | Domain | Examples |
|--------|--------|----------|
| **`agentsam_tickets`** | Platform / infra / Agent Sam engineering | TELEMETRY-002, Finding #3, image-gen regressions, ledger ownership |
| **Collaborate tasks** (`agentsam_todo` / project issues / kanban) | Client & operational delivery | “Revamp /about page”, nondiscrimination policy, client checklists |
| **`agentsam_plans` / `plans/*.md`** | Prose SSOT for platform tickets | Linked via ticket `doc_path` — not a third task list |

This split is deliberate. Do **not** merge Collaborate client tasks into `agentsam_tickets` (or vice versa) without an explicit product decision. Tickets **index** markdown plans; they do not replace Collaborate.

### Contract

- Prose SSOT stays in `plans/active|backlog/*.md` via `doc_path` — do not duplicate body into D1.
- Status enum enforced in code; `status_reason` required for `blocked` / `abandoned`.
- API: `GET/POST /api/tickets`, `GET /api/tickets/analytics`, `PATCH /api/tickets/:id`, `POST /api/tickets/:id/status`, events.
- Does **not** replace kanban, `agentsam_todo`, or `project_issues`.
- UI: Work sidebar → **Tickets** (`/dashboard/artifacts` rail) for CRUD list of platform tickets.
- **New plan file → ticket same session** (never leave an active plan without a queryable ticket).
- Events carry `actor_type` / `actor_id` (dashboard_user | claude_mcp | chatgpt_mcp | agent_sam).
- Create supports `dedup_key` (unique) so MCP/agent retries do not double-insert.
- Standing Cursor rule: any time you say follow-up / later / backlog / not in scope — create the ticket via API in the same turn.
