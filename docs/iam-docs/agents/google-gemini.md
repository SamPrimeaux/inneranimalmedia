# Google Gemini — IAM reference

## Real usage (`spend_ledger`)

| Model | Calls | Spend (USD) |
|-------|------:|-------------:|
| `gemini-2.5-flash` | 104 | $0.009 |
| `gemini-2.5-flash-preview-04-17` | 15 | $0 |

- **Cheapest viable model** in the stack for high-volume, budget-tier routing.
- **Auto mode:** `INTENT_TO_TIER['question']` → **budget** → **`gemini-2.5-flash`** when that row wins cost sort and exists in **`ai_models`** (`worker.js` ~267–314).
- **Auth fix (IAM):** use HTTP header **`x-goog-api-key`** with **`GOOGLE_AI_API_KEY`** for `generativelanguage.googleapis.com` — **not** `?key=` query string (see `runToolLoop` / `singleRoundNoTools` ~5001, ~4716).

## Models in `worker.js`

### `MODEL_COST_TIERS`

- **`gemini-2.5-flash`:** budget tier, provider `google` (~224–228).

### Defaults in code

- **`runToolLoop` / fallback:** `modelKey` often **`gemini-2.5-flash`** (~5816, ~8085–8092).
- **UI label:** `MODEL_LABELS['gemini-2.5-flash']` = "Gemini 2.5" (`AgentDashboard.jsx` ~78).

### `gemini-2.5-pro` / preview rows

Preview or alternate slugs may appear in **`ai_models`** or **`spend_ledger`** without being in `MODEL_COST_TIERS`; treat D1 + ledger as source of truth for production traffic.

## API

- **REST (worker):** `https://generativelanguage.googleapis.com/v1beta/models/${modelKey}:generateContent` (`runToolLoop` ~5000, `singleRoundNoTools` ~4713).
- **Auth:** Header **`x-goog-api-key: env.GOOGLE_AI_API_KEY`** (~5001, ~4716) — **not** query-parameter key in these code paths.

## Request shape (`runToolLoop`)

- **`system_instruction.parts`** + **`contents`** with roles mapped user/model (~5008–5013).
- **`tools`:** `[{ function_declarations: [...] }]` with `stripAdditionalProperties(input_schema)` (~5014–5018).
- **Logging:** Google responses logged on fetch (~5026–5028).

## `singleRoundNoTools` (Google)

- **`tool_config: { function_calling_config: { mode: 'NONE' } }`** (~4710) to force text-only when no tools.
- Optional **AI Gateway** path first if `AI_GATEWAY_BASE_URL` + `getGatewayModel` (~4681–4689).

## Tool results in loop

- Tool calls appear as **`functionCall`** in parts; args normalized (~5076–5094) including Gemini-specific **`args`** wrapper handling (~5089–5094).

## `thoughtSignature`

If Gemini 2.5 returns thinking metadata, check latest `worker.js` for handling of **`thought`** / **`thinking`** fields.

## Cost

- **Reference:** `MODEL_COST_TIERS` input/output $/M for `gemini-2.5-flash`.
- **Observed totals:** see **Real usage** above.

## Secrets

- **`GOOGLE_AI_API_KEY`:** primary for `generativelanguage.googleapis.com` chat paths.
- **`GEMINI_API_KEY`:** used in **imgx** provider list and Gemini imgx branch (`runImgxBuiltinTool` region ~11622–11637) — can differ from chat key in deployment.

## IAM integration

- Auto mode selects Gemini row from **`ai_models`** when tier resolves to **`gemini-2.5-flash`** (~312–314).

## Learning resources (external)

- https://ai.google.dev/docs
- Gemini API generateContent, function calling
