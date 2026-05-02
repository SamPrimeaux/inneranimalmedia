# Anthropic (Claude) — IAM reference

## Real usage (`spend_ledger`)

| Model | Calls | Spend (USD) |
|-------|------:|-------------:|
| `claude-haiku-4-5-20251001` | 338 | $2.50 |
| `claude-sonnet-4-6` | 113 | $4.58 |
| `claude-sonnet-4-20250514` | 58 | $1.24 |
| `claude-opus-4-20250514` | 4 | $0.25 |

- **Primary stack** for agent/chat: Haiku leads volume; Sonnet and Opus for heavier reasoning.
- **Auto mode:** `classifyIntent` uses Haiku JSON; **`INTENT_TO_TIER`** maps `sql` / `shell` / standard workloads toward **Haiku-class** rows when tier + `ai_models` resolve that way (`worker.js` ~266–331, ~4600+).

## Models in `worker.js`

### `MODEL_COST_TIERS` (~223–259)

| `model_key` | Tier label | Provider |
|-------------|------------|----------|
| `claude-haiku-4-5-20251001` | standard | anthropic |
| `claude-sonnet-4-20250514` | premium | anthropic |
| `claude-opus-4-6` | max | anthropic |

### UI labels (`AgentDashboard.jsx` `MODEL_LABELS` ~74–79)

- `claude-haiku-4-5-20251001` → "Haiku 4.5"
- `claude-sonnet-4-6` → "Sonnet 4.6" (display; routing may use `claude-sonnet-4-20250514` from DB)
- `claude-opus-4-6` → "Opus 4.6"

### `resolveAnthropicModelKey` / `MODEL_MAP` (~4153–4157)

Maps short keys like `claude_haiku_4_5` → API model id. Default fallback: **`claude-sonnet-4-20250514`** if key unknown (~4157).

---

## API

- **Endpoint:** `https://api.anthropic.com/v1/messages` (`runToolLoop` ~4963, `classifyIntent` ~4626, `chatWithToolsAnthropic` ~11989, `singleRoundNoTools` ~4650).
- **Auth:** HTTP header **`x-api-key: env.ANTHROPIC_API_KEY`** (not Bearer in these paths).
- **Version:** `anthropic-version: 2023-06-01` (~4631, 4967, 11994).

## `chatWithToolsAnthropic` (~11904+)

- Loads tools from **`mcp_registered_tools`** `WHERE enabled = 1` (~11909), maps to Anthropic **`tools`** array with `name`, `description`, `input_schema` (~11931–11936).
- **`max_tokens`:** 8192 (~11978).
- **`MCP_CHAT_TOOL_LOOP_MAX`:** **10** iterations (~11880, 11974) — not 8 (8 is **`runToolLoop`** `MAX_ROUNDS` ~4924).
- Each round: POST messages → if `tool_use` blocks → **`invokeMcpToolFromChat`** → append assistant `content` + user `tool_result` messages (~12111–12112).
- **Streaming:** optional SSE (`opts.stream`); emits `text`, `done`, tool approval in **ask** mode for action tools (~12013+).

## `runToolLoop` (Anthropic)

- **MAX_ROUNDS = 8** (~4924).
- Request body: `tools` from `toolDefinitions` with `input_schema` (~4974–4978).
- Parses **`content`** blocks: `type === 'text'` vs `type === 'tool_use'` (~5034–5039).

## Tool format

Anthropic native: **`tool_use`** with `name`, `id`, `input`; results as **`tool_result`** with `tool_use_id` (~12107–12112 in chat path).

## Streaming vs non-streaming

- **Streaming:** `chatWithToolsAnthropic` with `stream: true` returns **SSE** (`text/event-stream`) (~12018+).
- **Non-streaming:** JSON responses from same function when `stream: false` (~12065+).
- **`/api/agent/chat`** chooses streaming when provider is anthropic and gates pass (~7683+).

## Max tokens / context

- **`classifyIntent`:** `max_tokens: 512` (~4622).
- **`runToolLoop`:** `max_tokens: 4096` (~4971).
- **`chatWithToolsAnthropic`:** `max_tokens: 8192` (~11978).
- **Context window** per model is **not** hardcoded in IAM; follow Anthropic’s current docs for each model id.

## Vision

Image handling for Claude is implemented in **`/api/agent/chat`** and gateway paths where **`buildAnthropicParts`** / image attachments exist — search **`images`** and **`image`** in `worker.js` for the latest branch.

## Cost (reference vs ledger)

- **Tier table:** USD per 1M input/output in **`MODEL_COST_TIERS`** (~223–259).
- **`calculateCost`** uses model key and token counts (~4172+ patterns).
- **Observed totals:** see **Real usage** section above (`spend_ledger`).

## IAM integration

- **Secret:** `ANTHROPIC_API_KEY` (wrangler secret).
- **Used by:** `classifyIntent`, `selectAutoModel` (via Haiku + DB), `runToolLoop`, `chatWithToolsAnthropic`, `singleRoundNoTools`, streaming chat, optional gateway headers (~6012).

## Learning resources (external)

- https://docs.anthropic.com/en/api
- Messages API, tool use, streaming — see Anthropic’s current docs for **tool_use** and **tool_result** message shapes.
