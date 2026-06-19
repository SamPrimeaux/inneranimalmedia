---
title: Pattern — Agent Sam Phase 2 tool picker playbook
doc_type: platform_pattern
topic: agentsam_phase2
lane_key: docs_knowledge_search
pattern_key: agentsam_phase2_tool_picker
tags:
  - agentsam
  - tools
  - approval-queue
  - workflows
updated: 2026-06-19
---

# Pattern — Agent Sam Phase 2 tool picker playbook

After baseline chat (`POST /api/agentsam/chat`) and PrimeTech tools (`POST /api/agentsam/tools/*`), ship **staff-facing** tool execution with roles and approvals.

## Baseline (usually already shipped)

| Surface | Path |
|---|---|
| Chat SSE | `POST /api/agentsam/chat` |
| Run history | `GET /api/agentsam/runs` |
| Developer tools | `POST /api/agentsam/tools/*` |

Registry: `agentsam_tools` + `agentsam_workflows` tables (not legacy `agentsam_mcp_*`).

## Phase 2 deliverables

1. **Tool picker UI** — categories, params form, submit
2. **Generic runner** — `POST /api/agentsam/run` with `tool_key`, role check, `is_enabled`
3. **Approval queue** — `agentsam_approval_queue` for `requires_approval = 1`
4. **Approve endpoint** — owner/admin executes queued call
5. **Session history panel** — last N runs from `agentsam_sessions`

## Suggested sprint order

| Sprint | Scope |
|---|---|
| 1 | `/api/agentsam/run` no-approval tools; highest-value tool wired in UI (e.g. bio generation) |
| 2 | Approval queue table + UI; draft email/response tools |
| 3 | Campaign copy tool; wire Overview stats to live D1 (kill mock) |
| 4 | Browser/Playwright tools (external service required) |

## High-value staff tools (nonprofit vertical)

- Generate animal bio from profile data
- Draft foster application response email
- Medical-due alerts from `care_tasks` / profile notes
- Fundraising campaign copy

## Vectorization notes

**Synonyms:** Agent Sam tools, approval queue, tool picker, staff AI workflows, generate bio, draft application response, Phase 2 AI buildout.
