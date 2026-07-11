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

Platform work index: `agentsam_tickets` + append-only `agentsam_ticket_events`.

- Prose SSOT stays in `plans/active|backlog/*.md` via `doc_path` — do not duplicate body into D1.
- Status enum enforced in code; `status_reason` required for `blocked` / `abandoned`.
- API: `GET/POST /api/tickets`, `PATCH /api/tickets/:id`, `POST /api/tickets/:id/status`, events.
- Does **not** replace kanban, `agentsam_todo`, or `project_issues`.
- UI: fold into Projects / Collaborate later — backend only until instructed.
