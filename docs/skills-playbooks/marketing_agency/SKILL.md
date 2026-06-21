# Marketing Agency Launch Agent

**Skill key:** `marketing_agency`  
**Slash trigger:** `/launch`  
**Scope:** workspace  
**Task types:** `agent`, `plan`

## Purpose

End-to-end product or website launch: domain selection against D1 inventory, CMS website pages, marketing copy, and logo generation. Every sub-agent is a real `agentsam_subagent_profile` row. Handoff state lives in `agentsam_spawn_job.merged_output`. Domain and website run sequentially; marketing copy and logo generation run in parallel after the site is drafted.

## Orchestration sequence

1. **Parent run** — User invokes `/launch` with brand description or keywords. Create parent `agentsam_agent_run` + `agentsam_spawn_job`:
   - `master_agent_slug` = `marketing_agency`
   - `subagent_slug` = `launch_domain_advisor` (first step)
   - `merged_output` = empty launch shape (below)
   - `status` = `pending`

2. **launch_domain_advisor** (sequential) — Domain candidate research:
   - Query `domains` via `agentsam_d1_query` (keyword LIKE filters per tenant)
   - Query `cloudflare_zones` for active zone status
   - Generate 8–10 ranked candidates; user confirms one (never auto-select)
   - Patch `merged_output`: `chosen_domain`, `keywords[]`, `brand_brief`
   - Set `phase` = `website`, append `domain` to `phases_completed`

3. **launch_website_builder** (sequential) — CMS site draft:
   - Input: `chosen_domain`, `brand_brief`, `keywords`
   - Retrieve CMS patterns from `AGENTSAM_VECTORIZE_DOCUMENTS` (`source_type=workflows`)
   - Load `brand_config` + `brand_assets` for palette/fonts
   - Create 4 draft pages via `agentsam_cms_write`: homepage, about, product/service, contact
   - Optional R2 HTML via `agentsam_r2_put`
   - Patch `merged_output.page_ids[]`; set `phase` = `marketing`

4. **launch_marketing_writer** + **launch_logo_gen** (parallel) — After website step succeeds, both run via `Promise.all`:
   - **Marketing:** email, X, LinkedIn, press release, product description → `cms_content` (draft)
   - **Logo:** 3 variants via `agentsam_cf_images_upload` → `brand_assets` (type=logo) + R2
   - Patch `merged_output.content_ids[]` and `merged_output.logo_r2_key`
   - On logo completion: `agentsam_spawn_job.status` = `completed` (or `partial` if logo missing)

5. **Completion** — Parent run marked complete. SSE summary includes domain, page count, marketing artifact count, logo R2 key.

## Loop state (`agentsam_spawn_job`)

| Field | Usage |
|-------|--------|
| `master_run_id` | Parent `agentsam_agent_run.id` |
| `master_agent_slug` | `marketing_agency` |
| `subagent_slug` | Current active sub-agent (or `launch_marketing_writer+launch_logo_gen` during parallel) |
| `subagents_spawned` | Step counter |
| `merged_output` | JSON handoff (see below) |
| `status` | `pending` → `running` → `completed` / `partial` / `failed` |
| `total_cost_usd` | Accumulated LLM + image gen cost |

### `merged_output` shape

```json
{
  "phase": "marketing",
  "brand_brief": "2-3 sentence brand summary",
  "keywords": ["keyword1", "keyword2"],
  "chosen_domain": "example.com",
  "page_ids": ["cms_page_abc", "cms_page_def"],
  "content_ids": ["cms_content_001", "cms_content_002"],
  "logo_r2_key": "brand/ws_inneranimalmedia/logos/variant-1.png",
  "phases_completed": ["domain", "website", "marketing", "logo"]
}
```

## D1 tables

| Table | Role |
|-------|------|
| `agentsam_spawn_job` | Pipeline state, `merged_output` handoffs |
| `agentsam_agent_run` | Parent + child run rows (spawn tree) |
| `domains` | Existing domain inventory; availability filter |
| `cloudflare_zones` | Zone status for candidate validation |
| `brand_config` | Workspace palette, fonts, style constraints |
| `brand_assets` | Logo variants (type=logo), existing brand files |
| `cms_pages` | Draft website pages (homepage, about, product, contact) |
| `cms_content` | Marketing copy artifacts (email, social, press release) |

## Vector lanes

| Step | Lane | Filter |
|------|------|--------|
| Website builder | DOCUMENTS | `source_type = 'workflows'` — CMS page patterns |
| Marketing writer | DOCUMENTS | `source_type IN ('knowledge','clients')` — brand voice |
| Logo gen | MEMORY | workspace brand aesthetic preferences |
| Logo gen (post-accept) | MEDIA | embed best variant via `agentsam_cf_vectorize` |

**Not used:** COURSES, CODE, SCHEMA lanes (unless user topic is technical).

## Sub-agent slugs

- `launch_domain_advisor`
- `launch_website_builder`
- `launch_marketing_writer` (parallelizable)
- `launch_logo_gen`

## Config (D1 only — no .env)

| Setting | Location | Key / field |
|---------|----------|-------------|
| Pipeline order | `agentsam_skill.metadata_json` | `pipeline` — default 4 slugs above |
| Max iterations | `agentsam_skill.metadata_json` | `max_iterations` (default **1**) |
| Phases | `agentsam_skill.metadata_json` | `phases`: `["domain","website","marketing","logo"]` |
| Master slug | `agentsam_skill.metadata_json` | `master_agent_slug`: `marketing_agency` |
| CMS project slug | spawn job | `chosen_domain` passed to `agentsam_cms_write` |
| Logo count | sub-agent instructions | 3 variants per run |

## Verification

```bash
# Skill row
# D1: SELECT slash_trigger, metadata_json FROM agentsam_skill WHERE id = 'skill_marketing_agency';

# Sub-agent profiles
# D1: SELECT slug, is_parallelizable FROM agentsam_subagent_profile WHERE slug LIKE 'launch_%';

# After a /launch run — spawn job state
# D1: SELECT status, merged_output FROM agentsam_spawn_job WHERE master_agent_slug = 'marketing_agency' ORDER BY created_at DESC LIMIT 1;

# CMS pages created
# D1: SELECT id, title, status FROM cms_pages WHERE id IN (<page_ids from merged_output>);

# MCP spawn tree
# agentsam_spawn_tree { "run_id": "<parent_ar_id>" }
```
