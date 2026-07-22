# Work shell: drive rail clip + Notes panel 500

**Ticket:** `tkt_work_rail_notes_ui`  
**Status:** backlog · **Priority:** P1 · **Continue:** 2026-07-23  
**Surface:** `/dashboard/artifacts/tickets` (+ any ArtifactsDriveShell view)

## Problem (reproduced 2026-07-22)

Two defects in the Work / Artifacts shell when chrome is dense (Agent Sam open + Notes rail panel open):

### 1. Right icon rail still clips

- Icons (calendar / keep / notes / contacts) are still cut off against the right edge when Agent Sam is open and/or Notes slide-out is open.
- Prior attempts (grid `max-content`, `@container` hide at 720px, Collaborate-style `flex: 0 0` on `drive-body`) did **not** fully clear the bug in production.
- Suspect interaction with **App-level** Agent Sam right-rail width + parent `overflow: hidden`, not only `.drive-rail-stack` internals.

**Acceptance**

- With Agent Sam open (~360px+) and Notes panel open: rail icons are either **fully visible** or the **entire rail+panel stack is hidden** — never mid-glyph clip.
- Same with Agent Sam closed + Notes open, and Agent Sam open + Notes closed.

### 2. Notes panel: Internal Server Error

- Opening Notes (LibrarySideRail → Notes) shows red **Internal Server Error** + Retry.
- Ticket Activity “Add note” path (`POST /api/tickets/:id/events`) is separate; this failure is the **Collaborate/Keep Notes** rail panel API, not `agentsam_ticket_events`.

**Acceptance**

- Notes panel loads without 500; empty state OK; Retry clears.
- Identify failing endpoint from network tab / worker logs and fix.

## Context / breadcrumbs

- Shell: `dashboard/src/components/library/ArtifactsDriveShell.tsx` (`drive-body` flex row)
- Styles: `dashboard/src/styles/library.css` (`.drive-rail-stack`, `.drive-rail`, `.lib-rail-panel`)
- Rail UI: `dashboard/src/components/library/LibrarySideRail.tsx` + `CollaborateRailPanels`
- Compare working pattern: `dashboard/src/components/collaborate/collaborate-work-layout.css` (`flex: 0 0 var(--rail)`)
- Recent commits: `d4edb7c4` (flex body), `9902658a` (button/rail polish), `b303a0e4` (Queue tickets redesign)

## Suggested tomorrow approach

1. Capture Network + CF observability for the Notes 500 (fast win).
2. For rail: measure live widths (shell / `drive-body` / Agent Sam) — if App flex sibling is crushing Artifacts shell below rail+panel min, hide `drive-rail-stack` via **JS** when `drive-body.clientWidth < threshold`, not container-query on shell alone.
3. Optionally hide LibrarySideRail entirely on ticket detail routes when Agent Sam is open (product call).

## Out of scope for this ticket

- Queue/Board ticket CRUD (already shipped).
- Hard delete / 90d retention UX (already shipped).
