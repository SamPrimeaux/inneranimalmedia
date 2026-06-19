---
title: Pattern — Agent Sam client AI policy
doc_type: platform_pattern
topic: agentsam_client_policy
lane_key: docs_knowledge_search
pattern_key: agentsam_client_ai_policy
tags:
  - agentsam
  - ai
  - billing
  - byok
updated: 2026-06-19
---

# Pattern — Agent Sam client AI policy

Policy framework before expanding AI drafting on **client production** workers after agency handoff.

## Decision matrix (pick one before expanded use)

1. **Client BYOK** — client provides provider API key; stored via IAM `user_api_keys` / Worker secrets.
2. **Disabled** — chat UI limited or off; no inference on agency accounts.
3. **Managed plan** — explicit monthly included usage in contract.
4. **Capped agency run** — hard token cap + visible usage in dashboard admin.

**Never** silently run client production AI drafting on Inner Animal platform accounts after handoff without contract.

## Planned config shape (client Workers)

```bash
AI_PROVIDER_MODE = disabled | client_key | managed
AI_MONTHLY_TOKEN_CAP = <number>
AI_USAGE_VISIBLE_TO_ADMIN = true
```

## Usage SSOT

Track in `agentsam_usage_events` and daily rollups — **not** hardcoded dashboard report seeds. Reports AI tab must read real `/api/agentsam/runs` or rollups API.

## Known failure modes

- Provider capacity errors (Workers AI / routed models) — surface clearly in chat UI.
- Mock metrics in Reports → misleads clients — label or wire live data.

## IAM vs client D1

- **IAM** `client_project_semantic_search` for briefs and policy docs.
- **Client D1** for runtime sessions, messages, usage on that worker.
- Do not patch client runtime detail into `ctx_inneranimalmedia`.

## Vectorization notes

**Synonyms:** AI cost ownership, BYOK, inference billing, token cap, who pays for AI, Agent Sam policy, managed AI plan.
