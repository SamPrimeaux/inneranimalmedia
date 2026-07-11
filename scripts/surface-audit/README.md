# IAM Dashboard Surface Audit

Investigation + sprint proposal project for mapping every `/dashboard/*` route to
code, APIs, D1 tables, and Agent Sam wiring — then ranking refinement sprints.

## Quick start

```bash
# Static audit (no API keys needed)
python3 scripts/surface-audit/run_surface_audit.py

# With AI triage on top P0/P1 surfaces
export OPENAI_API_KEY=...
python3 scripts/surface-audit/run_surface_audit.py --ai-triage

# Or Anthropic Sonnet as project guide
export ANTHROPIC_API_KEY=...
export AUDIT_AI_PROVIDER=anthropic
export AUDIT_AI_MODEL=claude-sonnet-4-6
python3 scripts/surface-audit/run_surface_audit.py --ai-triage --ai-limit 8
```

Reports land in `artifacts/surface_audit/` as JSON + Markdown.

## What it does

| Step | Module | Output |
|------|--------|--------|
| 1. Discover routes | `lib/route_discovery.py` | All paths from `shellNav.ts`, `App.tsx`, `agentRoutes.ts`, CMS/MovieMode parsers |
| 2. Compare baseline | `config/user_routes.json` | Routes you listed vs repo — missing / orphan / legacy |
| 3. Map wiring | `lib/route_mapper.py` | Page TSX, `/api/*` handlers, `agentsam_*` table refs, hardcoded models, zeroed telemetry |
| 4. Agent context | `dashboardRouteContext.ts` keys | Which surfaces pass `route_key` to `/api/agent/chat` |
| 5. Score + sprints | `lib/scoring.py` | P0–P3 tiers — **functionality first**, then UX |
| 6. AI triage (opt) | `lib/ai_triage.py` | Sonnet / GPT mini verdicts on top gaps |

## Routes you listed vs repo

Your list is saved in `config/user_routes.json`. Re-run after editing that file.

### Likely missing from your list (discovered in repo)

| Route | Status |
|-------|--------|
| `/dashboard/launch-desk` | **Redirect → `/dashboard/collaborate`** — scrape UI references |
| `/dashboard/overview` | Hidden auth landing — not in sidebar |
| `/dashboard/finance` | Hidden — overview quick link only |
| `/dashboard/analytics` | Hidden — health/* redirects here |
| `/dashboard/tasks` | Hidden task board |
| `/dashboard/chats` | Route exists; sidebar uses **action** not link |
| `/dashboard/book/:slug` | Booking surface |
| `/dashboard/database/:databaseName` | Studio deep link |
| `/dashboard/agent/quickstart` | Agent shell hidden path |
| `/dashboard/agent/:conversationId` | Thread deep links |
| `/dashboard/agent?tab=recent` | Workspace tab (you listed workspaces variant) |
| `/dashboard/cms/imports` | CMS sidebar — you didn't list |
| `/dashboard/cms/media` | Parsed but **not in sidebar** |
| `/dashboard/moviemode/templates` | In-app tab |
| `/dashboard/moviemode/ai-studio` | In-app tab |
| `/dashboard/moviemode/projects` | In-app tab |
| `/dashboard/drive` | **ORPHAN** — `DrivePage.tsx` exists, no router |
| `/api/launch-desk` | Backend only — Launch Desk agent (hardcoded model) |

### Legacy redirects (safe to scrape from nav copy)

- `/dashboard/library` → `/dashboard/artifacts`
- `/dashboard/calendar` → `/dashboard/collaborate`
- `/dashboard/docs` → `/dashboard/settings/docs`
- `/dashboard/integrations` → `/dashboard/settings/integrations`
- `/dashboard/storage` → `/dashboard/settings/storage`
- `/dashboard/health/*` → `/dashboard/analytics`

## Agent wiring today

`dashboard/lib/dashboardRouteContext.ts` is the SSOT for route-aware Agent Sam context.

**Wired (route_key set):** CMS, Design Studio, Database, Workflows, Mail, Collaborate, Agent tabs (partial).

**Not wired (generic `dashboard` context):** Projects, Artifacts/Work, Images, Draw, Movie Mode, Home, most Settings pages.

That matches “agent panel looks the same everywhere but tools don't match the surface.”

## Sprint philosophy (from your priorities)

1. **P0 — Truth in core paths:** Agent chat + tool loop cost logging, CMS publish path, Monaco/editor git sync.
2. **P1 — Route agent wiring:** Pass `route_key` for Projects, Images, Draw, Design Studio tool surfaces (not prompt injections).
3. **P2 — Create pipeline merge:** Design Studio + Draw → one progressive idea→sketch→plan→3D lane.
4. **P3 — Polish:** Images tagging, Artifacts revamp, Movie Mode, Database onboarding for Connor.

## 2D canvas alternatives (for Draw merge)

| Option | Fit | Notes |
|--------|-----|-------|
| **Excalidraw** (current) | Good for whiteboard | Already integrated `/api/draw/*`; disconnected UX |
| **tldraw** | Strong React embed | Similar to Excalidraw; better programmatic sync |
| **Fabric.js / Konva** | Custom IAM canvas | More work; full control for CMS section builder |
| **Penpot** (self-host) | Design tool | Heavier; probably overkill |
| **Figma embed** | External | Not agent-native |

Recommendation: keep Excalidraw engine short-term but **one shell** with Design Studio — shared project artifact spine, not two nav entries.

## Related audits

- `scripts/agentsam_codebase_audit.py` — hardcoded models, legacy fallbacks
- `scripts/plan04_tool_loop_catalog_audit.py` — tool loop + D1 catalog
- `scripts/iam_dashboard_audit.py` — embed + GPT analysis (older, narrower file list)

## Updating your route baseline

Edit `config/user_routes.json` and re-run. The compare step is deterministic; AI triage is optional.
