# Image Generation Model Benchmark
**Date:** 2026-07-08  
**Context:** Design Studio / Sam Sketch house pipeline evaluation  
**Prompt domain:** Architectural — barndominium/shophouse, single-story, blueprints + renders

---

## Task 1: Blueprint Draft (2D floor plan, blue lines on white)

**Prompt:** Single story barndominium/shophouse, 110ft x 60ft footprint, 3-car garage wing 38x42ft, master suite, 2 bedrooms, great room, kitchen, dining, covered porches — all rooms labeled with dimensions, north arrow, scale bar, vaulted ceiling dashes.

| Model | Provider | Grade | Spatial Accuracy | Labels/Dims | Tokens In | Tokens Out | Total Tokens | Est. Cost | Latency |
|---|---|---|---|---|---|---|---|---|---|
| gemini-3.1-flash-image | Google | **A** | A | A+ | 302 | 1,592 | 1,894 | ~$0.02 | ~8s |
| gemini-3-pro-image | Google | A- | B+ | A | 302 | 1,992 | 2,710 | ~$0.13 | ~10s |
| gpt-image-2 (simple) | OpenAI | B+ | B | B+ | 44 | 1,756 | 1,800 | ~$0.04 | ~60s |

**Winner: `gemini-3.1-flash-image`**
- Best spatial accuracy — footprint proportions correct, garage doors on correct wall, all rooms properly zoned
- Best dimension callouts — outer dimension strings on all 4 sides
- 6.5x cheaper than Pro, marginally faster
- Missing: title header (Pro had it), kitchen island not drawn

**Thompson Sampling seed (arm_imgx_blueprint_flash):**
- `avg_quality_score`: 0.93
- `cost_mean`: $0.02
- `latency_mean`: 8s
- `intent_slug`: `image_blueprint_draft`

---

## Task 2: Exterior Photorealistic Render

**Prompt:** Modern barndominium exterior, black metal siding, timber posts, gable roof, covered porch, photorealistic architectural render.

| Model | Provider | Grade | Style | Tokens | Est. Cost | Latency |
|---|---|---|---|---|---|---|
| gemini-3-pro-image | Google | **A+** | Photorealistic — passes as real listing photo. Texas hill country, dusk, natural materials | ~2,710 | ~$0.13 | ~10s |
| gemini-3.1-flash-image | Google | **A+** | Polished CGI render — evening golden hour, visible garage, lit interior through glass | ~1,894 | ~$0.02 | ~8s |

**Both models produced stunning renders.** Difference is stylistic:
- Pro → real photograph feel, organic landscape
- Flash → CGI/sales brochure feel, cleaner lines, more dramatic lighting

**Thompson Sampling seed (arm_imgx_render_pro):**
- `avg_quality_score`: 0.90
- `cost_mean`: $0.13
- `latency_mean`: 10s
- `intent_slug`: `image_render_quality`

---

## Task 3: Full Architectural Presentation Sheet

**Prompt:** Complete builder concept board — exterior render + dimensioned floor plan + features bullet list + square footage breakdown + north arrow + scale bar + disclaimer. Barndominium starter template, warm off-white paper feel.

| Model | Provider | Grade | Output Description | Tokens In | Tokens Out | Total | Est. Cost | Latency |
|---|---|---|---|---|---|---|---|---|
| gpt-image-2 (high quality) | OpenAI | **A+** | Complete professional builder concept board — photorealistic exterior + full floor plan + features box + sq footage table + scale bar + north arrow + footnote disclaimer. Every element correct. | 231 | 5,488 | 5,719 | ~$0.21 | 139s |

**Winner: `gpt-image-2` — only model capable of this output format.**  
No other model tested produced combined render + floor plan + text boxes in a single call.

**Thompson Sampling seed (arm_imgx_presentation_gpt2):**
- `avg_quality_score`: 0.97
- `cost_mean`: $0.21
- `latency_mean`: 139s
- `intent_slug`: `image_presentation_sheet`

---

## Routing Recommendation for Thompson Sampling

| Intent Slug | Model | Rationale |
|---|---|---|
| `image_blueprint_draft` | `gemini-3.1-flash-image` | Fastest, cheapest, best spatial accuracy |
| `image_render_quality` | `gemini-3-pro-image` | Most photorealistic output |
| `image_render_fast` | `gemini-3.1-flash-image` | Acceptable quality at 85% cost savings |
| `image_presentation_sheet` | `gpt-image-2` | Only model that handles combined render+plan+text layout |

---

## Notes on Prompt Strategy

**No hardcoded prompt injection needed.** The LLM should construct the prompt from the user's conversation context — this is what produced the A+ results above. Pre-injecting a fixed prompt would give every user the same barndominium mockup regardless of their actual design intent.

The correct approach:
1. User describes their house in conversation
2. Agent extracts: style, materials, rooms, dimensions, features
3. Agent constructs a tailored architectural prompt from those extracted elements
4. Route to correct model tier based on intent (blueprint vs render vs full sheet)

The prompt *structure* (what to include, how to phrase architectural details) should live in the agent's system prompt or cookbook — not as a hardcoded user-visible prompt.
