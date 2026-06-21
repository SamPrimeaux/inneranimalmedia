---
title: Inner Animal Media — GenMedia Brand Policy
source_type: policy
workspace_id: ws_inneranimalmedia
---

# GenMedia brand policy

Authoritative scoring rubric and generation constraints for the **on_brand_genmedia** skill. Ingest into `agentsam_documents_oai3large_1536` with `source_type = policy`.

## Brand identity (must preserve)

- **Wordmark:** Inner Animal Media — use approved wordmark assets only; never distort, recolor outside palette, or add drop shadows on logo marks.
- **Voice:** Professional, confident, builder-forward. No hype slang, no emoji in deliverables, no stock-photo clichés.
- **Themes:** Dashboard themes (Meaux Storm Gray, Meaux Glass Blue) use CSS variables — generated UI mock imagery should respect cool gray + electric blue accents, not random neon palettes.

## Color palette (generation guidance)

| Token | Hex | Usage |
|-------|-----|--------|
| Storm gray base | `#1a1d24` | Backgrounds, depth |
| Glass blue accent | `#3b82f6` | Primary CTAs, highlights |
| Soft white | `#f4f6f8` | Text on dark |
| Muted border | `#2d3340` | Cards, dividers |

Generated images should use **at most one** dominant accent (glass blue). Avoid rainbow gradients unless explicitly requested.

## Composition rules

1. **Layout:** Clear focal subject; generous negative space; no cluttered collage unless user asks for mood board.
2. **Typography in image:** Prefer none. If text is required, sans-serif, high contrast, ≤8 words.
3. **Photography style:** Modern SaaS / creative agency — not consumer meme, not uncanny AI faces unless stylized illustration.
4. **Aspect ratio:** Default 16:9 for hero; 1:1 only when user specifies social square.

## Scoring rubric (0–100)

Score each generated image against **all** categories. **Pass threshold:** 75 (override via `agentsam_memory` key `brand_score_threshold`).

| Category | Weight | Pass (≥) | Fail signals |
|----------|--------|----------|--------------|
| Palette compliance | 25 | 18 | Off-brand colors, clashing accents, neon overload |
| Logo / wordmark integrity | 20 | 15 | Distorted logo, wrong name spelling, unapproved mark |
| Composition & clarity | 20 | 15 | Busy layout, muddy focal point, illegible text |
| Tone & audience fit | 20 | 15 | Playful/meme tone, emoji, off-brand humor |
| Technical quality | 15 | 10 | Obvious artifacts, broken anatomy, watermarks |

**passed:** weighted total ≥ threshold AND no category zeroed by critical fail (logo misspelling, slur, competitor impersonation → auto fail).

## Iteration feedback format

When score < threshold, return actionable feedback for the image generator:

```
Palette: shift background toward #1a1d24; reduce purple cast.
Composition: simplify — single subject, more negative space.
Tone: remove casual emoji-style elements; professional SaaS aesthetic.
```

## R2 output conventions

- Prefix: workspace `brand_r2_prefix` memory key or `agentsam_workspace.r2_assets_prefix` (default `brand/genmedia/`).
- Accepted finals may be embedded to `AGENTSAM_VECTORIZE_MEDIA` after pass.

## Policy chunks for retrieval

Scoring sub-agent filters: `source_type = policy` AND `source_ref` prefix `brand/inneranimalmedia/genmedia-brand-policy`.
