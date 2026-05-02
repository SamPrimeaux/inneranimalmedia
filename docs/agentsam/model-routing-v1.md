# Agent Sam — Model routing V1 (spec)

Last updated: 2026-05-02

This document defines production-intent routing policy and constraints. Application code and D1 seeds must stay aligned with it.

## Canonical catalog and legacy registry

- **`ai_models`** is the **canonical** production catalog: routing, picker exposure, dispatch metadata, billing math, and tool/vision flags.
- **`agent_model_registry`** is **legacy / staging / enrichment only**. Do not use it for production routing, picker, dispatch, billing, or `agentsam_routing_arms` seeding.

## GPT-5.5 — API access not verified (hard constraint)

The OpenAI/API project used for production traffic **does not currently have access** to `gpt-5.5` (confirmed via API error: project does not have access to model gpt-5.5).

Until access is verified end-to-end with a successful smoke call in the production credential context:

- **Do not** seed **`agentsam_routing_arms`** with `gpt-5.5` or **`gpt-5.5-pro`** (or any alias that resolves to unavailable GPT-5.5 SKUs).
- **Do not** make GPT-5.5 the default for Tier 2 (or any tier).
- **Do not** add GPT-5.5 as fallback or escalation in production routing.
- **Do not** reference GPT-5.5 in **`ai_models`** for active routing unless the row is explicitly **`is_active = 0`** and/or labeled **`access_pending`** / unavailable — prefer omitting or inactive rows until verified.
- **Do not** let **AUTO** routing choose GPT-5.5.
- **Do not** expose GPT-5.5 in the picker until access is verified.

**Tier 2 “senior review” (future):** GPT-5.5 is **reserved** for when API project access is confirmed; document any SKU names (`gpt-5.5`, `gpt-5.5-pro`, etc.) here when live.

## Temporary V1 tiers (live policy — verified models only)

Routing must use **only** models that exist in **`ai_models`**, are active, credential-backed, and smoke-verified as described in [Routing arms eligibility](#routing-arms-eligibility-agentsam_routing_arms).

### Tier 0 — cheap / fast

Use for: simple questions, summaries, small SQL, grep-style analysis.

Eligible examples (when present and verified in `ai_models`):

- GPT-5.4 **mini** / **nano** if available and verified  
- Gemini **Flash** / **Lite**  
- Local **Qwen** / **Ollama**  

**Granite:** never Tier 0 default for normal AUTO chat; Granite stays **fallback-only** (see below).

### Tier 1 — standard coding

Use for: normal repo edits, MCP tools, D1 work, dashboard fixes.

Eligible examples:

- **GPT-5.4** (and family keys as seeded when verified)  
- **Claude Sonnet**  
- **Gemini Pro**  
- Any **`supports_tools = 1`** model with valid provider credentials and verified access, matching task tool requirements  

### Tier 2 — senior review (current-access fallback)

Until GPT-5.5 is available:

- Use the **best verified** alternative among **GPT-5.4**, **Claude Opus or Sonnet**, **Gemini Pro** — constrained by smoke verification and task tier policy.  
- **GPT-5.5 is not eligible** until API access is confirmed.

### Tier 3 — emergency / final boss

- **Leave unseeded** or **`access_pending` only** in documentation / catalog flags.  
- **Do not** route here automatically in V1 until models and policy are explicitly approved.

## Workers AI / Granite

- **Granite** (`@cf/ibm-granite/granite-4.0-h-micro` or successors) is **fallback / micro-cost only**, not normal Agent Sam AUTO chat.
- Production AUTO routing must **not** select Granite when **non–Workers-AI external** providers remain available (see application routing logic).
- Granite must remain **`show_in_picker = 0`** / **`picker_eligible = 0`** for normal product flows unless explicitly changed after review.

## Routing arms eligibility (`agentsam_routing_arms`)

A model may **only** be seeded as an eligible arm when **all** of the following hold:

1. It **exists** in **`ai_models`** (canonical row).
2. **`is_active = 1`** for that row.
3. **Provider credentials** are configured for that provider in the deployment environment (BYOK or platform keys as applicable).
4. **Model access** has been verified by a **successful smoke call** (same credential path as production chat).
5. **`supports_tools`** matches the **task requirements** (e.g. tool-required modes must use tool-capable models).
6. The row is **not** blocked for normal routing: not **`access_pending`** for production, not **`fallback_only`** for normal paths, and not **`picker_eligible = 0`** when the intent is “normal product picker” routing — interpret together with task type (fallback arms may still exist with explicit flags if documented).

Additionally:

- **Do not** deploy or seed routing arms that reference **unavailable** model keys (including GPT-5.5 until verified).
- **Do not deploy** `agentsam_routing_arms` rows that point at **`gpt-5.5`** or **`gpt-5.5-pro`** until this document is updated with verification evidence.

## References

- Runtime routing implementation: `src/api/agent.js` (`agentChatSseHandler`), `src/core/routing.js`, `src/core/provider.js`.
- Catalog audit helper: `scripts/audit-model-catalog.sh`.
- Conservative catalog SQL (review before apply): `scripts/repair-model-catalog-safe.sql`.
