# [Telemetry] Paid tool usage + cost (image gen first)

## Product
Agent Sam

## Status
**In progress** — image tools (`imgx_generate_image`, `imgx_edit_image`) first spine.

## Problem

TELEMETRY-001 fixed chat-path **structure** (single writer, honest extractor on free tools). Paid tools still hard-zero because handlers never attach `usage` / `cost_usd` to `execResult`, so `extractToolExecUsage` in the loop returns 0.

Before metrics: **0 / 430** rows with nonzero `cost_usd` in prod.

## Scope (this ticket)

### In scope

1. **Bubble usage from image handlers** — `runImageGenerationForTool` / `streamImageGenerationSse` return shape includes `usage`, `model`, `provider`, `cost_usd` (or computable token fields).
2. **Gemini image** — always send explicit `generationConfig.imageConfig.imageSize` + `aspectRatio`; capture `usageMetadata` via `parseGeminiUsageMetadata`.
3. **gpt-image-2** — `quality` normalized to `low|medium|high|auto`; cost from quality×size matrix when API returns no usage.
4. **Extractor SSOT** — `extractToolExecUsage` accepts top-level `usageMetadata` and Gemini token aliases.
5. **Pricing spine** — token path via `estimateModelRunCostUsd` when tokens present; per-image fallback tables in `image-generation-telemetry.js`.

### Out of scope (follow-ups)

- Model attribution **columns** on `agentsam_tool_call_log` → `plans/backlog/TELEMETRY-MODEL-ATTRIBUTION-tool-call-log.md`
- Meshy / video / other paid catalog tools (same pattern, separate tranche)
- D1 `agentsam_model_pricing` matrix rows for every quality×size combo (code table first; migrate later if needed)
- TELEMETRY-003 alias / `mcp_proxy` rename

## Billing notes (research captured)

| Provider | Cost driver |
|----------|-------------|
| Gemini (`gemini-3-pro-image`, `gemini-3.1-flash-image`) | `imageConfig.imageSize` (1k/2k/4k) — no separate quality tier; always send explicit size |
| OpenAI `gpt-image-2` | `quality × size`; tiers `low/medium/high` (not `standard/hd`) |
| Workers AI Flux | `ai_models.cost_per_unit` per_image when available |

## Files

- `src/core/image-generation-telemetry.js` (new) — imageSize resolution, cost estimates, `buildImageToolExecUsage`
- `src/tools/image_generation.js` — Gemini `imageConfig`, attach usage on returns
- `src/core/tool-exec-telemetry.js` — Gemini / usageMetadata aliases

## Verification

1. `node --check` on touched `.js`
2. Unit-less gate: one imgx chat turn → `agentsam_tool_call_log.cost_usd > 0` for success row (after deploy)
3. Gemini request logs include explicit `imageSize` in outbound body

## Sequencing

Blocks nothing in TELEMETRY-001. Runs before model-attribution migration (002 produces `modelUsed` on exec result; attribution ticket persists it).
