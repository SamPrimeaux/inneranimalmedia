# Gemini 3.6 Flash + 3.5 Flash-Lite GA

**Date:** 2026-07-21  
**Status:** Catalog `977` live · generateContent client migrated for GA API rules

## Models

| `model_key` | Role | Pricing (paid / 1M tok) | Default thinking |
|---|---|---|---|
| `gemini-3.6-flash` | Primary Flash / agentic | $1.50 in / $7.50 out | medium |
| `gemini-3.5-flash-lite` | Cheap / high-throughput lite | $0.30 in / $2.50 out | minimal |

## D1

1. **`agentsam_model_catalog`** — both rows active (`gemini_api`, tools/vision/streaming/reasoning/code-exec).
2. **`agentsam_ai`** — picker rows under Google / Gemini.
3. **`agentsam_routing_arms`** — Auto flash → `gemini-3.6-flash`; cheap lanes → `gemini-3.5-flash-lite`.

## Client migration (`src/integrations/gemini.js`)

Per Google GA guide (applies to these models + future Gemini releases):

- **Omit** `temperature` / `topP` / `topK` on Gemini 3.x generation configs.
- **Flash-Lite thinking:** `minimal` for ask/cheap; `medium`/`high` for agentic tool/subagent work.
- **Strip trailing `role=model` turns** before `generateContent` (prefill → HTTP 400).
- **`functionResponse.id`** mirrors `functionCall.id` / `tool_use_id`.

Lane constants: `GOOGLE_MODEL_ROUTES.agenticCodingDefault` → `gemini-3.6-flash`, `cheapFast` → `gemini-3.5-flash-lite`.

## Manual check

- Composer picker shows both new models.
- Agent turn on Auto resolves to `gemini-3.6-flash` without 400 on sampling/prefill.
- Cheap classifier / intent lanes resolve to `gemini-3.5-flash-lite` with minimal thinking.
