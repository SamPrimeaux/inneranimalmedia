# Movie Mode — Agent Sam compass

- Route workbench: `moviemode` tab when on `/dashboard/moviemode`
- Tools: render, conversion, media vector search
- **Gap:** Add `route_key` to `dashboardRouteContext.ts` for quick actions.

Human editors own timeline; agent handles batch render, asset search, and generation lanes.

---

## Proposed agent portfolio (L6 + L5)

| Agent slug | Lane | Primary | Purpose |
|---|---|---|---|
| `media_pipeline_ops` | L1 | Terra | Batch render, queue coordination |
| `asset_search` | L3 | DeepSeek flash + media vector | RAG over media index |
| `render_planner` | L4 | Sonnet 5 | Timeline-adjacent batch plans |
| `visual_qa` | L5 | Gemini 3.5 Flash | Frame/still inspection |

Full roster: [`plans/active/AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md`](../../plans/active/AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md)
