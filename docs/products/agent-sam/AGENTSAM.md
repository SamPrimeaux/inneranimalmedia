# Agent Sam — platform compass

**Status:** Canonical for Agent Sam product scope  
**Scope:** Platform-level agent behavior — not product-specific Create/CMS rules

---

## What Agent Sam is

The branded intelligence and execution layer for Inner Animal Media:

- Runtime spine (`/api/agent/chat`)
- Model routing and mode profiles
- Tool catalog execution
- MCP, SDK, terminal, scaffold
- Embedded agents on product routes

## What Agent Sam is not

- The Workspace (`/dashboard/*` shell)
- The entire Inner Animal Media platform
- Only the chat page at `/dashboard/agent`

---

## Default agent entry for Create/CAD

```txt
illustration_create
  schema: iam.illustration.v1
  engine: auto | excalidraw | openscad | freecad | blender | meshy
```

Product-specific Create rules: [../create/AGENTSAM.md](../create/AGENTSAM.md), [../design-studio/AGENTSAM.md](../design-studio/AGENTSAM.md)

---

## Runtime contract sync

Project-scoped instructions: `AGENTSAM.md` → `agentsam_rules_document`  
See [../../platform/project-runtime-contracts.md](../../platform/project-runtime-contracts.md)

---

## Ship and identity

Operational locks: `.cursor/rules/iam-core.mdc` — not duplicated here.

---

## Proposed agent portfolio (platform)

| Agent slug | Lane | Primary | Purpose |
|---|---|---|---|
| `platform_architect` | L4 | Sol | Cross-service architecture |
| `agent_architect` | L4 | Sonnet 5 | Agent specs, workflows |
| `implementation_engineer` | L2 | Codex | Worker/D1/terminal |
| `code_navigator` | L3 | Sonnet 5 + DeepSeek flash | search_code |
| `daily_operator` | L1 | Terra | Chat, tool orchestration |
| `volume_scribe` | L1 | Luna | Drafts, bounded workers |

Lanes: [`plans/active/AGENTSAM-CONCEPTUAL-LANES-2026-07.md`](../../plans/active/AGENTSAM-CONCEPTUAL-LANES-2026-07.md)  
Full roster: [`plans/active/AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md`](../../plans/active/AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md)

---

## Related

- [../../shared/AGENT_RUNTIME.md](../../shared/AGENT_RUNTIME.md)
- [PRODUCT_PRINCIPLES.md](./PRODUCT_PRINCIPLES.md)
