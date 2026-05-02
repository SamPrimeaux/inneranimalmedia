# OpenAI — IAM reference

## Real usage (`spend_ledger`)

| Model | Calls | Spend (USD) |
|-------|------:|-------------:|
| `gpt-4.1` | 8 | $0.11 |
| `gpt-4o-mini` | 6 | $0.003 |

- **Primary roles:** image generation path (`imgx_generate_image` and related), and OpenAI chat branches when **`ai_models`** selects an OpenAI row.
- **`imgx_generate_image`** uses OpenAI **`gpt-image-1`** in `runImgxBuiltinTool` (`worker.js` ~10890+ region); **`listImgxProviders`** exposes OpenAI when **`OPENAI_API_KEY`** is set.

## Models in `worker.js`

### `MODEL_COST_TIERS` (~223–259)

| `model_key` | Tier | Provider |
|-------------|------|----------|
| `gpt-4o-mini` | budget | openai |
| `gpt-4o` | standard | openai |

### Other references

- **`runToolLoop` / chat:** `modelKey` defaults **`gpt-4o`** when using OpenAI (~5742, ~8064).
- **`MODEL_LABELS` in UI:** `gpt-4o` → "GPT-4o" (`AgentDashboard.jsx` ~79).
- **`gpt-4.1`:** appears in **`spend_ledger`**; routing depends on **`ai_models`** rows and request paths, not only `MODEL_COST_TIERS`.

## API

- **Endpoint:** `https://api.openai.com/v1/chat/completions` (`runToolLoop` ~4981, `singleRoundNoTools` ~4669).
- **Auth:** `Authorization: Bearer ${env.OPENAI_API_KEY}`.

## Tool format (`runToolLoop`)

OpenAI Chat Completions style:

- **`tools`:** array of `{ type: 'function', function: { name, description, parameters: input_schema } }` (~4989–4996).
- **Response:** `choices[0].message.tool_calls` (~5050–5056).
- **Difference from Anthropic:** OpenAI uses **`tool_calls`** with **`function.name`** / **`arguments`** string; Anthropic uses **`tool_use`** blocks in **`content`**.

## Streaming

- Paths exist for streaming when provider is OpenAI and gateway flags allow (~7684); implementation parallels Anthropic branch in the same handler region.

## JSON mode / structured outputs

Not documented as a dedicated flag in the core `runToolLoop` snippet; imgx and other tools use JSON **request bodies** to provider APIs where applicable.

## Image generation (`imgx_*`)

- **`runImgxBuiltinTool`** (~11590+): **`imgx_generate_image`** calls **`https://api.openai.com/v1/images/generations`** with model **`gpt-image-1`** where that path is selected.
- **`listImgxProviders`** returns OpenAI when **`OPENAI_API_KEY`** set (~11621–11622).
- **Gemini imgx** path uses **`GEMINI_API_KEY`** and a Gemini model in provider list (~11623) — separate from chat Gemini keys.

## Images in chat UI

- **`AgentDashboard.jsx`** splits message text on image URLs (`splitTextWithImageUrls` ~133+) for inline rendering — not OpenAI-specific.
- **`OPEN_IN_PREVIEW:`** appears in **system** instructions for URLs (~7574+) — general preview panel, not only OpenAI.

## Cost

- **Reference** $/M tokens: `MODEL_COST_TIERS` for `gpt-4o` and `gpt-4o-mini`.
- **Observed totals:** see **Real usage** (`spend_ledger`) above.

## IAM integration

- **Secret:** `OPENAI_API_KEY`.
- **Used by:** OpenAI branches in `runToolLoop`, `singleRoundNoTools`, imgx OpenAI path, optional **AI Gateway** OpenAI base URL (`callGatewayChat` ~6003+).

## Learning resources (external)

- https://platform.openai.com/docs
- Chat Completions, function calling, images API
