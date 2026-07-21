# Gemini 3.6 Flash + 3.5 Flash-Lite GA

**Date:** 2026-07-21  
**Status:** Migration `977` applied to prod D1

## Models

| `model_key` | Role | Pricing (paid / 1M tok) |
|---|---|---|
| `gemini-3.6-flash` | Primary Flash / agentic | $1.50 in / $7.50 out |
| `gemini-3.5-flash-lite` | Cheap / high-throughput lite | $0.30 in / $2.50 out |

## What changed

1. **`agentsam_model_catalog`** — both rows active (`gemini_api`, tools/vision/streaming/reasoning/code-exec).
2. **`agentsam_ai`** — picker rows under Google / Gemini (`sort_order` 345 / 335).
3. **`agentsam_routing_arms`** — active `gemini-3.5-flash` → `gemini-3.6-flash`; unpaused `gemini-3.1-flash-lite` → `gemini-3.5-flash-lite`.
4. **Worker JS** — no dispatch change required (`isGemini3ModelId` already matches `gemini-3*`).

## Manual check

- Composer picker shows both new models.
- Auto arm on chat/agent resolves to `gemini-3.6-flash`.
- Intent/summary cheap lanes resolve to `gemini-3.5-flash-lite`.
