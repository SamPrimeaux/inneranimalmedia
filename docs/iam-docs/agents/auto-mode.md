# Auto model selection — IAM reference

## Alignment with `spend_ledger` (observed)

Production usage shows **Haiku** and **Gemini 2.5 Flash** dominating volume and cost mix:

- **`claude-haiku-4-5-20251001`:** 338 calls, **$2.50** — aligns with **`classifyIntent`** (Haiku JSON) plus heavy **`sql` / `shell` / standard** tier routing.
- **`gemini-2.5-flash`:** 104 calls, **$0.009** — aligns with **`question` → budget** tier and cheapest-model selection in tier (`worker.js` ~267–303).
- **`claude-sonnet-4-6`:** 113 calls, **$4.58** — premium / explicit or DB-selected Sonnet rows.

Use **`spend_ledger`** + **`ai_models`** as the source of truth for “what actually ran”; this doc describes **code intent**.

## `classifyIntent(env, lastUserContent)` (~4600–4644)

- **Model:** Anthropic **`claude_haiku_4_5`** via **`resolveAnthropicModelKey`** (~4606).
- **Prompt:** Return **JSON only** with **`intent`** ∈ **`sql` | `shell` | `question` | `mixed`** (~4614–4618).
- **Heuristic:** If message looks like SQL or shell, short-circuit without API (~4588–4598).

## `INTENT_TO_TIER` (~266–276)

| Intent | Tier |
|--------|------|
| `question` | budget |
| `sql` | standard |
| `shell` | standard |
| `mixed` | standard |

**Note:** The JSON schema in the prompt lists the four intents above.

## `selectAutoModel(env, lastUserContent)` (~281–331)

1. **`classifyIntent`** → intent string.
2. **`INTENT_TO_TIER[intent]`** → tier (default **standard** ~278).
3. **`MODEL_COST_TIERS`** filtered to that tier (~291–293).
4. **Cheapest** by average **(input_usd_per_million + output_usd_per_million) / 2** (~295–303).
5. **`SELECT * FROM ai_models WHERE model_key = ? AND is_active = 1`** (~312–314).
6. If no row → fallback **`claude-haiku-4-5-20251001`** row (~316–320).

## Tier → typical models (from `MODEL_COST_TIERS`)

| Tier | Example keys in code |
|------|----------------------|
| **budget** | `gemini-2.5-flash`, `gpt-4o-mini` |
| **standard** | `claude-haiku-4-5-20251001`, `gpt-4o` |
| **premium** | `claude-sonnet-4-20250514` |
| **max** | `claude-opus-4-6` |

Winner is **lowest $/M average** among keys in that tier, then **must exist** in **`ai_models`**.

## Modes (`filterToolsByMode` ~4558–4567)

| Mode | Tools |
|------|-------|
| **`plan`** | **No tools** (empty array) |
| **`debug`** | Small allowlist: `read_file`, `list_dir`, `get_file_tree`, `search_code`, `get_context_bundle`, `query`, `terminal_*` |
| **`ask` / `agent`** | Full MCP tool list (subject to other filters) |

**Auto mode** does **not** change this table — it only picks **which model** runs.

## Cost optimization (behavioral)

- **`plan`:** no tool spend from MCP — still pays for the **classification** Haiku call if auto runs.
- **`ask`:** fewer tool rounds than **`agent`** when user does not need execution.
- **Explicit model:** choosing a model in the UI **bypasses** `selectAutoModel` when the API path uses the user’s `model_id` / `model_key` instead of auto.

## Observed tail behavior (non-binding)

Production logs may show **`[Auto Mode] Selected model: gemini-2.5-flash`** for **`question`** → **budget**. **Verify** with your own `wrangler tail`.
