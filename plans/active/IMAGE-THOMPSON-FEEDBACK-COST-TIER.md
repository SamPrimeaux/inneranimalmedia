# Image Thompson — cost, content tier, thumbs

**Status:** shipping with migration `813_image_thompson_feedback_cost_tier.sql`

## Flux (context)

Flux = Cloudflare Workers AI Black Forest Labs models (`@cf/black-forest-labs/flux-…`). Catalog/lane prefs may list it; live Thompson pool for `ws_inneranimalmedia` is the paid trio: `gemini-3.1-flash-image`, `gemini-3-pro-image`, `gpt-image-2` (unpaused in 813).

## Content tiers (organize cost ≠ quality)

Prompt classifier `classifyImageTier` → learning key via `contentTierFromImageTier`:

| Prompt tier | `content_tier` | Intent |
|---|---|---|
| `draft` | `draft_mockup` | low-fi mockup / wireframe / quick sketch |
| `standard` | `standard_render` | default |
| `quality` | `presentation_quality` | investor/client/final/high-res |

Stored on `image_generation_drafts.content_tier` + feedback rows. Tier also biases model eligibility (`TIER_MODEL_KEYS`) and OpenAI quality/size defaults.

## Cost capture

On generate: `attachImageGenerationUsage` → `cost_usd` on draft + `agentsam_tool_call_log` (fast path / loop). Thompson `cost_mean` / `cost_n` updated in `recordImageModelOutcome` when cost present.

## Human signal

`POST /api/images/rate` `{ generation_id, rating: 1|-1 }` → `image_generation_feedback` append + draft `user_rating`. First rating bumps arm `success_alpha`/`success_beta` + `avg_quality_score` / `quality_n`.

## Save path

`POST /api/images/save` only (no `/commit` alias). Body may include `category`, `tags`, `project_id`. Response includes `width`, `height`, `size_bytes`, `size_label` (e.g. `1536×1024`). Attach later: `POST /api/images/:id/project`. List filters: `?project_id=` `?category=`.
