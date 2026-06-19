---
title: IAM Platform Patterns
doc_type: platform_pattern_index
topic: iam_platform_patterns
lane_key: docs_knowledge_search
project_key: inneranimalmedia
updated: 2026-06-19
---

# IAM platform patterns

Reusable architecture and ops playbooks extracted from client workers (nonprofit CMS, dashboard, Agent Sam). **Not client-specific** — use with `docs/clients/{slug}/project-brief.md` for binding IDs and live status.

## Pattern catalog

| Pattern | File | Use when |
|---|---|---|
| Feature doc shape | [feature-doc-template.md](feature-doc-template.md) | Authoring vectorization-ready docs for any client |
| CMS fragment publish | [cms-fragment-publish-pipeline.md](cms-fragment-publish-pipeline.md) | D1 → R2 sections → KV public pages |
| Email workspace | [email-resend-gmail-workspace.md](email-resend-gmail-workspace.md) | Resend inbound + per-user Gmail |
| Social Lane A / B | [social-lane-a-embed-lane-b-publish.md](social-lane-a-embed-lane-b-publish.md) | Embed live; Meta publish stubbed until approval |
| Worker session gate | [worker-session-gate-dashboard.md](worker-session-gate-dashboard.md) | Auth at Worker before dashboard SPA |
| Agent Sam client policy | [agentsam-client-ai-policy.md](agentsam-client-ai-policy.md) | BYOK, caps, who pays for inference |
| Agent Sam Phase 2 | [agentsam-phase2-tool-picker-playbook.md](agentsam-phase2-tool-picker-playbook.md) | Tool picker, approval queue, staff workflows |
| D1 legacy hygiene | [client-d1-legacy-table-hygiene.md](client-d1-legacy-table-hygiene.md) | Drop vs defer vs canonical tables |

## Ingest

Listed in `docs/platform/iam-platform-docs.manifest.json`. Re-ingest:

```bash
npm run run:ingest_platform_snapshot
```

## Vectorization

- **Lane:** `docs_knowledge_search`
- **Chunk on:** `##` headings
- **Do not duplicate** full client briefs here — client lane uses `client_project_semantic_search`
