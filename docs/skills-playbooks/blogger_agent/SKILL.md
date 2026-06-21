# Blogger Agent

**Skill key:** `blogger_agent`  
**Slash trigger:** `/blog`  
**Scope:** workspace  
**Task types:** `agent`, `plan`

## Purpose

Turns a topic into a published technical blog post: outline with approval gate, full draft in `content_items` / `content_revisions`, optional surgical edits via `blog_editor`, social teasers, and R2 markdown export at `content/{workspace_id}/{slug}.md`. Every sub-agent is a real `agentsam_subagent_profile` row. State lives in `agentsam_spawn_job.merged_output`.

## Orchestration sequence

1. **Parent run** — User invokes `/blog` with topic. Create parent `agentsam_agent_run` + `agentsam_spawn_job`:
   - `master_agent_slug` = `blogger_agent`
   - `subagent_slug` = `blog_planner`
   - `merged_output.topic` = stripped slash message
   - `status` = `pending`

2. **blog_planner** — Outline with approval gate:
   - Query `AGENTSAM_VECTORIZE_CODE` + `AGENTSAM_VECTORIZE_DOCUMENTS` for codebase and docs context
   - Optional web search for current references
   - Write markdown outline → `merged_output.outline`
   - Set `pending_approval` = `outline`, `phase` = `outline_review`
   - **STOP** — user replies **approve** to continue (unless `pause_for_outline_approval` = false)

3. **blog_writer** — Full draft:
   - Input: approved `outline`
   - Write markdown to `content_items` (type=blog_post) + `content_revisions`
   - Patch `merged_output.content_item_id`
   - Set `phase` = `draft_review`; optional second approval gate before social/export

4. **blog_editor** (on-demand) — Surgical revisions:
   - Activated on edit feedback or `resume_mode` = `blog_editor`
   - Reads `content_items.body_raw`, applies user feedback
   - Inserts new `content_revisions` row; increments `revision_number`

5. **blog_social_writer** — Platform teasers (parallelizable):
   - LinkedIn, X, dev.to teasers from draft excerpt
   - Writes to `cms_content` via `agentsam_cms_write`
   - Patch `merged_output.social_content_ids[]`

6. **blog_exporter** — Publish to R2:
   - Writes `content/{workspace_id}/{slug}.md` via `agentsam_r2_put`
   - Updates `content_items` status to published
   - Patch `merged_output.r2_key`; `status` = `completed`

## Loop state (`agentsam_spawn_job`)

| Field | Usage |
|-------|--------|
| `master_run_id` | Parent `agentsam_agent_run.id` |
| `master_agent_slug` | `blogger_agent` |
| `subagent_slug` | Current step slug |
| `merged_output` | JSON handoff (see below) |
| `status` | `pending` → `running` → `awaiting_approval` → `completed` / `partial` |
| `total_cost_usd` | Planning + writing + export cost |

### `merged_output` shape

```json
{
  "phase": "completed",
  "topic": "Building stateful agents on Cloudflare Workers",
  "outline": "# Outline\n\n## Introduction\n...",
  "content_item_id": "ci_blog_abc123",
  "revision_number": 1,
  "pending_approval": null,
  "social_content_ids": ["cms_content_li_001", "cms_content_x_002"],
  "r2_key": "content/ws_inneranimalmedia/building-stateful-agents.md"
}
```

## D1 tables

| Table | Role |
|-------|------|
| `agentsam_spawn_job` | Pipeline state, outline, content_item_id, r2_key |
| `content_items` | Blog post record (title, slug, body_raw, status) |
| `content_revisions` | Version history per edit pass |
| `cms_content` | Social teaser artifacts (LinkedIn, X, dev.to) |

## Vector lanes

| Step | Lane | Filter |
|------|------|--------|
| Planner | CODE | relevant source files and patterns for technical accuracy |
| Planner | DOCUMENTS | `source_type IN ('knowledge','workflows','clients')` |
| Writer | CODE + DOCUMENTS | same lanes for draft enrichment |
| Writer | EXTERNAL | web search for citations and current facts |

**Not used:** MEDIA lane unless post embeds generated images.

## Sub-agent slugs

- `blog_planner`
- `blog_writer`
- `blog_editor`
- `blog_social_writer` (parallelizable)
- `blog_exporter`

## Config (D1 only — no .env)

| Setting | Location | Key / field |
|---------|----------|-------------|
| Outline approval | `agentsam_skill.metadata_json` | `pause_for_outline_approval` (default **true**) |
| Max plan iterations | `agentsam_skill.metadata_json` | `max_plan_iterations` (default **3**) |
| Max write iterations | `agentsam_skill.metadata_json` | `max_write_iterations` (default **3**) |
| Export format | `agentsam_skill.metadata_json` | `export_format`: `markdown` |
| Pipeline | `agentsam_skill.metadata_json` | `pipeline` — 5 slugs above |
| R2 path | orchestrator convention | `content/{workspace_id}/{slug}.md` |

## Verification

```bash
# Skill row
# D1: SELECT metadata_json FROM agentsam_skill WHERE id = 'skill_blogger_agent';

# Sub-agent profiles
# D1: SELECT slug, is_parallelizable FROM agentsam_subagent_profile WHERE slug LIKE 'blog_%';

# Content item from last run
# D1: SELECT id, title, status FROM content_items WHERE id = '<content_item_id from merged_output>';

# R2 export key
# D1: SELECT merged_output FROM agentsam_spawn_job WHERE master_agent_slug = 'blogger_agent' ORDER BY created_at DESC LIMIT 1;

# Revision history
# D1: SELECT revision_number, created_at FROM content_revisions WHERE content_item_id = '<id>' ORDER BY revision_number DESC;
```
