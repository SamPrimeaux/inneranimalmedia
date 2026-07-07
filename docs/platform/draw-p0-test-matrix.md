# Draw P0 — test matrix (Agent Sam / Excalidraw)

Run each prompt in **Draw** (`/dashboard/draw`) or via Agent Sam with `excalidraw_load_library` + `excalidraw_add_elements` / `illustration_create`.  
P0 libraries must be uploaded (`node scripts/publish-draw-p0-libraries.mjs`) and migration **783** applied first.

## Auto-load wireframe set (default canvas)

`lofi-wireframe`, `mobile-kit`, `apple-devices-frames`, `universal-ui-kit`, `web-kit`, `agentsam-forms`, `agentsam-system-design`

---

## One prompt per category

### Wireframe — client case studies UI/UX flow *(primary UX test)*

```
Sketch a lo-fi wireframe flow for Inner Animal Media client case studies:
1) Case studies index — hero, filter chips (industry / service), grid of cards with logo + one-line outcome
2) Case study detail — split hero (client logo + headline metric), problem / approach / results sections, testimonial quote block, related cases row
3) Mobile variant — stacked cards and sticky "Start a project" CTA

Use web-kit + universal-ui-kit frames. Label each screen. Connect with arrows showing index → detail → contact CTA.
Keep it grayscale lo-fi; no copywriting polish — placeholders only.
```

### Wireframe — forms / lead capture

```
Wireframe a 3-step lead form wizard: (1) contact info, (2) project type + budget range, (3) timeline + file upload.
Show validation error state on step 2 and success confirmation on step 4.
Use agentsam-forms components. Desktop width ~1200px.
```

### Architecture — system diagram

```
Draw a system-design diagram: browser → Cloudflare Worker → D1 + R2 + Vectorize, with MCP OAuth path to external clients.
Label data flows for chat, draw library fetch, and image generation.
Use agentsam-system-design template styling.
```

### Planning — Gantt

```
Create a 6-week project Gantt for a nonprofit website redesign: discovery, design, build, content, QA, launch.
Include milestone diamonds for client sign-off and go-live.
```

### Presentation — slide deck storyboard

```
Storyboard 5 slides for an IAM capabilities pitch: title, problem, platform overview, agent + MCP differentiator, CTA.
Use awesome-slides frames; one slide per row with speaker notes as small text below each frame.
```

### Mobile — app shell

```
Wireframe 3 mobile screens for a donor app: home feed, donation checkout, receipt/history.
Use mobile-kit + apple-devices-frames (iPhone 15 Pro). Portrait only.
```

---

## Spatial / floorplan test — shophouse *(illustration_create or Draw)*

Use when validating non-UI sketch generation (floor plans, dimensions, room labels).

```
Generate a labeled floor plan for a Vietnamese-American shophouse (narrow lot, ~20ft × 80ft):
Ground floor: retail storefront fronting street, small office, bathroom, rear kitchen/storage.
Second floor: 2 bedrooms, shared bath, balcony over storefront.
Show dimensions, door swings, stairs location, and north arrow.
Style: clean architectural sketch — black lines on white, not photorealistic.
If using Excalidraw: use lo-fi boxes + dimension lines; if using image generation: architectural blueprint style.
```

---

## Image routing smoke (gpt-image-2 fix)

After deploy of `NULLIF(ai.api_platform,'unknown')` patch + migration **784**:

```
Generate a simple hero illustration for a CPA nonprofit website: abstract plum watercolor texture, 16:9, no text.
```

**Expect:** routes to OpenAI `gpt-image-2`, not Workers AI 5007. Check worker logs for `resolved_platform: openai`.

---

## Quick verification checklist

| Check | Command / URL |
|-------|----------------|
| R2 object | `curl -I https://tools.inneranimalmedia.com/draw/web-kit.excalidrawlib` |
| D1 catalog | `SELECT slug, item_count, auto_load FROM draw_libraries WHERE slug LIKE '%web%' OR slug LIKE 'agentsam%'` |
| API list | `GET /api/draw/libraries` (auth) |
| Library hydrate | `POST /api/draw/library` `{ "slug": "lofi-wireframe" }` |
