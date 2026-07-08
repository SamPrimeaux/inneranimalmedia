---
title: Project runtime contracts (agentsam_rules_document)
project_key: inneranimalmedia
topic: agent_prompt
updated: 2026-07-07
status: canonical
---

# Project runtime contracts

Each project gets a D1 row that mirrors **project instructions** — the Agent Sam equivalent of `.cursorrules` / `AGENTSAM.md`.

## Convention

| Field | Value |
|-------|--------|
| `rule_key` | `rule_{project_slug}_runtimecontract` |
| `id` | same as `rule_key` (stable) |
| `workspace_id` | execution workspace (`ws_*`) when known |
| `project_id` | dashboard `projects.id` when linked |
| `source_stored` | `repo:path/to/AGENTSAM.md` or R2 vector key |
| `rule_type` | `runtime_contract` |

## Layering

| Layer | Source | Holds |
|-------|--------|-------|
| Platform law | global rows (`workspace_id` empty) | identity, MCP OAuth, table namespace |
| Workflow order | `rule_agent_delivery_workflow` | implement → validate → commit → deploy (no repo paths) |
| **Project contract** | `rule_{slug}_runtimecontract` | AGENTSAM.md + dashboard Instructions |

## Sync pipeline (reliable)

```
AGENTSAM.md (human SSOT)
    ├─► POST /api/projects/:id/runtime-contract/sync  (CLI: npm run sync:project-runtime-contract)
    ├─► PATCH /api/projects/:id/memory (instructions) → auto-sync on save
    └─► ingest.manifest.json → Vectorize (semantic search, separate lane)
         ↓
agentsam_rules_document.body_markdown
         ↓
fetchTriggeredRulesForSystemPrompt (project-scoped chat)
```

Code: `src/core/project-runtime-contract-sync.js` · `src/core/project-runtime-contract.js`

### CLI (after editing AGENTSAM.md)

```bash
export IAM_SYNC_BEARER='…'   # or rely on session cookie when run from authenticated context
npm run sync:project-runtime-contract -- \
  --project proj_companions_cpas_web \
  --file docs/clients/companionscpas/AGENTSAM.md
```

### Dashboard (additive rules)

Project detail → **Instructions** → save. Merges into the D1 row under `### Dashboard instructions`. Full AGENTSAM.md body comes from CLI sync or prior sync.

## Runtime injection

1. User selects project in chat → `sessionProjectRef` passed to `buildSystemPrompt`
2. `fetchTriggeredRulesForSystemPrompt` loads `rule_{slug}_runtimecontract`
3. Session block keeps **bindings + memory** only (instructions omitted when D1 rule exists — no duplicate)

## AGENTSAM.md template

Root `AGENTSAM.md` includes frontmatter hints and a **Runtime contract sync** section. Client copies: `docs/clients/{slug}/AGENTSAM.md`.

Optional frontmatter:

```yaml
---
project_slug: companionscpas
project_id: proj_companions_cpas_web
workspace_id: ws_companionscpas
agentsam_md: docs/clients/companionscpas/AGENTSAM.md
---
```

## Seeds (migration 800)

- `rule_inneranimalmedia_runtimecontract`
- `rule_inneranimalmedia_mcp_runtimecontract`

Apply migration 800 before sync API works (`rule_key` column required).
