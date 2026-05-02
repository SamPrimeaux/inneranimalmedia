# AI providers — Inner Animal Media platform

Grounded in `worker.js` (model routing, `runToolLoop`, `chatWithToolsAnthropic`, `selectAutoModel`, `classifyIntent`), `wrangler.production.toml` (`[ai]`, bindings), and `agent-dashboard/src/AgentDashboard.jsx` (model labels, mode state).

## Real spend (`spend_ledger` — production snapshot)

| Provider / model | Calls | Spend (USD) | Notes |
|------------------|------:|------------:|--------|
| `anthropic/claude-haiku-4-5-20251001` | 338 | $2.50 | Most-used agent model |
| `anthropic/claude-sonnet-4-6` | 113 | $4.58 | |
| `google/gemini-2.5-flash` | 104 | $0.009 | Cheapest viable model |
| `anthropic/claude-opus-4` | 4 | $0.25 | |
| `openai/gpt-4.1` | 8 | $0.11 | |
| **Cursor IDE (total)** | — | **~$450+** | Largest line item (IDE usage, not Worker API) |

See `anthropic.md`, `openai.md`, `google-gemini.md`, `workers-ai.md` for per-provider detail and code paths.

## Which providers are active

| Provider | Secret / binding | Used when |
|----------|------------------|-----------|
| **Anthropic** | `ANTHROPIC_API_KEY` | Claude chat, `classifyIntent` (Haiku JSON), `chatWithToolsAnthropic`, `runToolLoop` (anthropic branch), streaming SSE |
| **OpenAI** | `OPENAI_API_KEY` | `runToolLoop` (openai branch), `singleRoundNoTools`, `imgx_*` image tools (OpenAI path), optional gateway |
| **Google (Gemini)** | `GOOGLE_AI_API_KEY` | `runToolLoop` (google branch), `singleRoundNoTools` for Gemini REST, auto-mode budget tier |
| **Google (imgx alt)** | `GEMINI_API_KEY` | `listImgxProviders` / imgx Gemini path when configured (`worker.js` ~11622+) |
| **Cloudflare Workers AI** | `env.AI` (`[ai]` in wrangler) | Embeddings (`@cf/baai/bge-large-en-v1.5`, `@cf/baai/bge-base-en-v1.5`), Llama completions (`@cf/meta/llama-3.1-8b-instruct`) |

If a secret is missing, branches that need it return errors or fall back (e.g. auto mode falls back to Haiku in DB if selected model row missing).

## Auto mode (`selectAutoModel`)

1. **`classifyIntent(env, lastUserContent)`** calls **Anthropic Messages API** with **`claude_haiku_4_5`** resolved model (`resolveAnthropicModelKey`) — JSON intent: `sql` | `shell` | `question` | `mixed` (`worker.js` ~4600–4643).
2. **`INTENT_TO_TIER`** maps intent to tier: `budget` | `standard` | `premium` | `max` (~266–276).
3. **`MODEL_COST_TIERS`** (~223–260) lists candidate `model_key` strings per tier; **lowest average of (input+output)/2** among models **in that tier** wins (~295–303).
4. Loaded row from **`ai_models`** WHERE `model_key = ? AND is_active = 1` (~312–314). If missing → fallback **Haiku** (~316–320).

So **auto mode depends on Anthropic for classification** and **D1 `ai_models`** for the resolved model row.

## Cost tier breakdown (reference USD per 1M tokens in `MODEL_COST_TIERS`)

| Tier (label) | Example `model_key` in code | Notes |
|----------------|----------------------------|--------|
| **budget** | `gemini-2.5-flash`, `gpt-4o-mini` | Cheapest average cost in tier wins |
| **standard** | `claude-haiku-4-5-20251001`, `gpt-4o` | |
| **premium** | `claude-sonnet-4-20250514` | |
| **max** | `claude-opus-4-6` | Highest $/M in table |

Reference tiers complement **actual** `spend_ledger` totals above.

## When to use each provider

- **Anthropic:** Default for **tool loops** with native `tool_use` (`runToolLoop` anthropic path ~4962+), and for **`chatWithToolsAnthropic`** (dashboard SSE).
- **OpenAI:** When **`ai_models.provider === 'openai'`** for the selected row; OpenAI tool format uses `tools` + `tool_calls` (~4980–5056).
- **Google:** When **`ai_models.provider === 'google'`**; Gemini uses `function_declarations` (~5014–5018).
- **Workers AI:** Embeddings and lightweight `env.AI.run` calls — see `workers-ai.md` for `spend_ledger` near-zero completion costs.

## Model strings in `worker.js` (non-exhaustive)

- **Anthropic:** `claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514`, `claude-opus-4-6`; aliases via `MODEL_MAP` / `resolveAnthropicModelKey` (~4153–4157).
- **Google:** `gemini-2.5-flash` (default in several branches ~5816, ~8085+).
- **OpenAI:** `gpt-4o`, `gpt-4o-mini` in cost tiers; chat defaults `gpt-4o` in places (~5742, ~8064).
- **Workers AI:** `@cf/baai/bge-large-en-v1.5`, `@cf/baai/bge-base-en-v1.5`, `@cf/meta/llama-3.1-8b-instruct`.

Full picker list comes from **D1 `ai_models`** via API used by the dashboard (`/api/ai/models` and agent init).

## Rate limits

**Not** codified in this repo. Provider quotas and 429 behavior depend on Anthropic/OpenAI/Google accounts. **Tail** `wrangler tail` / Cloudflare observability for live errors.

## Switching models in Agent Sam UI

1. **Model dropdown** — populated from **`GET`** init that returns `models` + `default_model_id` (`AgentDashboard.jsx` ~1080–1090). User picks a row; **`activeModel`** state drives **`model_id` / `model_key`** sent to **`POST /api/agent/chat`**.
2. **Mode** — `ask` | `agent` | `plan` | `debug` (`useState("ask")` ~944). **`filterToolsByMode`** (~4558–4567): **plan** → no tools; **debug** → small allowlist; **ask/agent** → full list subject to panel policy.
3. **Auto** — if the API sends **`auto: true`** / uses `selectAutoModel` (~7352), classification + D1 row pick the model (see `auto-mode.md` in this folder).

## Related docs

- `anthropic.md`, `openai.md`, `google-gemini.md`, `workers-ai.md`, `auto-mode.md`, `tool-reference.md`
