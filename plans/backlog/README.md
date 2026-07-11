# Backlog — not in active product-readiness sprint

Items moved out of the surface audit so they do not steal focus from the three
proven loops in `plans/active/`.

**Rule:** Do not automatically repair the 18 missing routes. Do not wire all 34
agent gaps. Promote items here only after WORKSPACE-001, CMS-001, and
DESIGNSTUDIO-001 pass acceptance.

---

## SPRINT-4 — Product-aware Agent Sam (deferred)

**Goal:** Agent behavior changes by product — only surfaces being proven.

Wire **only**:

- Projects  
- CMS (done partially in CMS-001)  
- Design Studio  
- Draw  
- Images  

Generic `dashboard` fallback remains acceptable for Mail, Meet, Learn, Movie Mode,
Workflows polish, Settings, Analytics, etc.

| Surface | Suggested route_key | Severity now |
|---------|---------------------|--------------|
| Projects | `projects` / `project_detail` | B2 until loops exist |
| Images | `images_library` | B2 |
| Draw | `draw` / `sam_sketch` | B1 after DESIGNSTUDIO-001 |
| Design Studio | already `design_studio` | verify after DS-001 |
| CMS | already `cms_edit` | verify in CMS-001 |

**Non-scope:** Do not batch-wire 34 gaps.

---

## SPRINT-5 — Cleanup and consolidation (deferred)

Only after the three loops work:

| Item | Action | Severity |
|------|--------|----------|
| `/dashboard/drive` orphan | Hide or remove | B2 |
| `/dashboard/overview`, `/finance`, `/analytics`, `/tasks` | Decide keep/hide | B2 |
| Duplicate Agent Systems (`/agent/systems` vs `?tab=systems`) | Resolve one entry | B2 |
| Launch Desk drift (`/launch-desk` redirect + `/api/launch-desk` hardcoded model) | Scrape UI refs; decide API fate | B2 |
| Create navigation | Design Studio + Draw as one progressive lane? | B3 |
| Draw remains lane vs product | Decision after DS-001 | B3 |
| Sidebar clean + visual consistency | Polish | B3 |
| CMS tabs crowded | UX | B2 |
| Template marketplace | Expansion | B3 |
| Database Connor onboarding | Expansion | B3 |
| Movie Mode aspirations | Expansion | B3 |
| Artifacts / Images remaster | Polish | B3 |
| Workspace iOS icons remaster | Polish | B3 |

---

## Surface audit leftovers (discovery only)

From `artifacts/surface_audit/` — **not auto-repair**:

### Missing from operator list (18)

Redirects / aliases (scrape candidates):

- `/dashboard/launch-desk` → collaborate  
- `/dashboard/calendar`, `/library`, `/docs`, `/storage`, `/health/*`  

Hidden / orphan:

- `/dashboard/overview`, `/finance`, `/analytics`, `/tasks`, `/book/:slug`  
- `/dashboard/drive` (orphan page)  
- `/dashboard/cms/imports`, `/cms/media`  
- `/dashboard/moviemode/{templates,ai-studio,projects}`  
- `/api/launch-desk`  

### Agent wiring gaps (34) — generic fallback OK

Do not open 34 tickets. Fold needed ones into SPRINT-4 after loops.

### Hardcoded models / zeroed telemetry

Track under WORKSPACE-001 when they block the repo loop (e.g. tool log
`costUsd: 0` on success). Broader codebase audit stays backlog:

- `scripts/agentsam_codebase_audit.py`  
- Launch Desk `gpt-4.1` / GET probe `gpt-5.5` mismatch  

---

## How to promote

1. Active ticket passes acceptance + completion evidence.  
2. Copy a new `plans/active/*-00N-*.md` using the task template.  
3. Leave a one-line pointer here (“promoted to ACTIVE-… on DATE”).
