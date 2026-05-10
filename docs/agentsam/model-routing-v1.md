# Agent Sam — Model routing V1 (spec)

Last updated: 2026-05-02

This document defines production-intent routing policy and constraints. Application code and D1 seeds must stay aligned with it.

## Canonical catalog and legacy registry

- **`ai_models`** is the **canonical** production catalog: routing, picker exposure, dispatch metadata, billing math, and tool/vision flags.
- **`agent_model_registry`** is **legacy / staging / enrichment only**. Do not use it for production routing, picker, dispatch, billing, or `agentsam_routing_arms` seeding.

## GPT-5.5 family — base vs pro (hard constraint on base)

The OpenAI/API project used for production traffic **does not have access to the base SKU** `gpt-5.5` (API error: project does not have access to model `gpt-5.5`). Runtime routing **always excludes** that exact `model_key`.

**`gpt-5.5-pro`** is a **distinct catalog SKU**: it may be present in **`agentsam_model_catalog` / `agentsam_ai`** for visibility, but it must stay **`is_active = 0`** (and off routing arms) until a **successful smoke call** in the production credential path and an intentional decision to enable it.

Until then:

- **Do not** seed **`agentsam_routing_arms`** with **`gpt-5.5`** (base).
- **Do not** activate **`gpt-5.5-pro`** for AUTO routing or picker until smoke-verified; keep catalog inactive until then.
- **Do not** make either SKU the default for any tier until policy and verification say otherwise.
- **Do not** let **AUTO** routing choose **`gpt-5.5`** (enforced in code). **`gpt-5.5-pro`** is gated only by **`is_active`** and arm seeds.

**Tier 2 “senior review” (future):** Prefer **`gpt-5.5-pro`** after smoke verification, not the base `gpt-5.5` key.

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

Until **`gpt-5.5-pro`** is smoke-verified and intentionally activated:

- Use the **best verified** alternative among **GPT-5.4**, **Claude Opus or Sonnet**, **Gemini Pro** — constrained by smoke verification and task tier policy.  
- **`gpt-5.5` (base) is never eligible** (no API access). **`gpt-5.5-pro`** is not eligible until catalog + routing arms are explicitly enabled after smoke tests.

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

- **Do not** deploy routing arms for **`gpt-5.5`** (base); it is blocked in code.
- **Do not deploy** `agentsam_routing_arms` rows for **`gpt-5.5-pro`** until smoke verification and this document are updated with evidence.

## References

- Runtime routing implementation: `src/api/agent.js` (`agentChatSseHandler`), `src/core/routing.js`, `src/core/provider.js`.
- Catalog audit helper: `scripts/audit-model-catalog.sh`.
- Conservative catalog SQL (review before apply): `scripts/repair-model-catalog-safe.sql`.
