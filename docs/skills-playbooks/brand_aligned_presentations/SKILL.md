# Brand-Aligned Presentations Agent

**Skill key:** `brand_aligned_presentations`  
**Slash trigger:** `/deck`  
**Scope:** workspace  
**Task types:** `plan`, `agent`

## Purpose

Research → outline → approval gates → slide render → optional surgical edits. Builds a cited, brand-aligned deck from internal Vectorize knowledge plus web search. Outline and research phases pause for explicit user approval. Final PPTX lands in R2 at `presentations/{workspace_id}/{spawn_job_id}/deck.pptx` with a `cms_assets` row. Post-render edits route through `deck_editor` without re-running research.

## Orchestration sequence

1. **Parent run** — User invokes `/deck` with topic and optional slide count. Create parent `agentsam_agent_run` + `agentsam_spawn_job`:
   - `master_agent_slug` = `brand_aligned_presentations`
   - `subagent_slug` = `deck_researcher`
   - `merged_output.topic` = stripped slash message
   - `merged_output.slide_count` = default **10** (override from message if parsed)
   - `status` = `pending`

2. **deck_researcher** — Research brief with approval gate:
   - Parallel retrieval: `AGENTSAM_VECTORIZE_DOCUMENTS` (`source_type IN knowledge,roadmap,clients,recipes`) + web search
   - Optional `AGENTSAM_VECTORIZE_CODE` for technical topics
   - Synthesize `research_brief` JSON → patch `merged_output`
   - Insert `agentsam_approval_queue` row (`gate`: `research_approval`)
   - **STOP** — `status` = `awaiting_approval`, `pending_approval` = `research`
   - User replies **approve** (or approval queue polled) to continue

3. **deck_outline_writer** — DeckSpec with approval gate:
   - Input: approved `research_brief` (read-only anchor — never re-research)
   - Generate `deck_spec[]`: slide_num, title, layout_hint, bullet_points, speaker_notes, needs_image, image_prompt, source_citations
   - Insert approval queue (`gate`: `outline_approval`)
   - **STOP** — `pending_approval` = `outline`
   - Revisions patch DeckSpec only; research brief stays frozen

4. **deck_slide_renderer** — Image gen + PPTX render:
   - For `needs_image` slides: `agentsam_cf_images_upload` → patch `image_r2_key` per slide
   - Load `brand_assets` pptx_template or `designstudio_design_blueprints` default
   - Render PPTX → R2 `presentations/{workspace_id}/{spawn_job_id}/deck.pptx`
   - Insert `cms_assets` (file_type=pptx, metadata includes deck_spec summary)
   - Patch `merged_output.pptx_r2_key`; `status` = `completed`

5. **deck_editor** (on-demand) — Activated when user says "change slide N" on a completed job:
   - Resumes completed spawn job via `findResumableSkillSpawnJob`
   - Surgical DeckSpec patch + selective re-render
   - Overwrites same R2 key; updates `cms_assets.updated_at`

## Loop state (`agentsam_spawn_job`)

| Field | Usage |
|-------|--------|
| `master_run_id` | Parent `agentsam_agent_run.id` |
| `master_agent_slug` | `brand_aligned_presentations` |
| `subagent_slug` | Current step slug |
| `merged_output` | JSON handoff (see below) |
| `status` | `pending` → `running` → `awaiting_approval` → `completed` / `partial` |
| `total_cost_usd` | Research + image + render cost |

### `merged_output` shape

```json
{
  "phase": "outline_review",
  "topic": "Q3 Product Roadmap",
  "slide_count": 12,
  "research_brief": {
    "topic": "Q3 Product Roadmap",
    "key_findings": [{ "theme": "...", "detail": "...", "source": "internal|web", "url": "..." }],
    "internal_refs": ["doc title or path"],
    "external_sources": [{ "title": "...", "url": "...", "snippet": "..." }],
    "slide_themes": ["Theme 1", "Theme 2"],
    "recommended_slide_count": 12
  },
  "deck_spec": [
    {
      "slide_num": 1,
      "title": "Q3 Roadmap",
      "layout_hint": "title_slide",
      "bullet_points": [],
      "speaker_notes": "...",
      "needs_image": false,
      "source_citations": []
    }
  ],
  "pptx_r2_key": "presentations/ws_inneranimalmedia/job_abc123/deck.pptx",
  "pending_approval": "outline",
  "approval_id": "aq_xyz789"
}
```

## D1 tables

| Table | Role |
|-------|------|
| `agentsam_spawn_job` | Pipeline state, DeckSpec, research brief |
| `agentsam_approval_queue` | Research and outline approval gates |
| `cms_assets` | PPTX asset row pointing to R2 key |
| `designstudio_design_blueprints` | Fallback slide layouts when no pptx_template |
| `brand_assets` | pptx_template, brand colors/fonts for render |
| `brand_config` | Workspace typography and color palette |

## Vector lanes

| Step | Lane | Filter |
|------|------|--------|
| Research | DOCUMENTS | `source_type IN ('knowledge','roadmap','clients','recipes')` |
| Research (technical) | CODE | relevant implementation patterns |
| Research | EXTERNAL | web search via `agentsam_autorag` external lane |
| Slide images | MEDIA | generated slide art uploaded to R2 |

**Not used:** COURSES lane unless topic explicitly references training content.

## Sub-agent slugs

- `deck_researcher`
- `deck_outline_writer`
- `deck_slide_renderer`
- `deck_editor`

## Config (D1 only — no .env)

| Setting | Location | Key / field |
|---------|----------|-------------|
| Pause for approval | `agentsam_skill.metadata_json` | `pause_for_approval` (default **true**) |
| Max slides | `agentsam_skill.metadata_json` | `max_slides` (default **20**) |
| Render model | `agentsam_skill.metadata_json` | `model_key` (e.g. `gemini-3.5-flash`) |
| Pipeline | `agentsam_skill.metadata_json` | `pipeline` — 4 slugs above |
| R2 output path | orchestrator convention | `presentations/{workspace_id}/{spawn_job_id}/deck.pptx` |
| Approval replies | orchestrator | `approve`, `yes`, `proceed`, `lgtm`, etc. |

## Verification

```bash
# Skill + metadata
# D1: SELECT metadata_json FROM agentsam_skill WHERE id = 'skill_brand_aligned_presentations';

# Sub-agent profiles
# D1: SELECT slug FROM agentsam_subagent_profile WHERE slug LIKE 'deck_%';

# Paused job awaiting approval
# D1: SELECT status, merged_output FROM agentsam_spawn_job WHERE status = 'awaiting_approval' AND master_agent_slug = 'brand_aligned_presentations';

# Approval queue
# D1: SELECT gate, status FROM agentsam_approval_queue WHERE skill_id = 'skill_brand_aligned_presentations' ORDER BY created_at DESC LIMIT 5;

# Completed deck asset
# D1: SELECT r2_key, file_type FROM cms_assets WHERE r2_key LIKE 'presentations/%/deck.pptx' ORDER BY created_at DESC LIMIT 1;
```
