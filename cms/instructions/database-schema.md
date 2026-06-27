# CMS D1 database schema (agent reference)

**Database:** `inneranimalmedia-business` (binding `DB`)

## Core tables

### `cms_pages`
Page metadata + routing. Content HTML lives in R2, not D1.

| Column | Notes |
|--------|-------|
| `id` | UUID — use in all agent tools |
| `tenant_id`, `workspace_id`, `person_uuid` | Scope — required on INSERT |
| `project_slug`, `project_id` | Site slug (e.g. `inneranimalmedia`) |
| `slug`, `route_path`, `path` | URL segments |
| `title`, `seo_title`, `meta_description` | SEO |
| `status` | `draft` \| `published` \| `archived` |
| `r2_key`, `r2_bucket` | Points to `published.html` when live |
| `content_size_bytes` | Last published size |

### `cms_page_sections`
Structured sections for editor + render tree.

| Column | Notes |
|--------|-------|
| `id`, `page_id` | FK to page |
| `section_type`, `section_name` | e.g. `hero`, `main-hero` |
| `section_data` | JSON blob |
| `sort_order`, `is_visible` | Layout |

### `cms_page_drafts`
Per-user draft JSON (sections overlay).

### `cms_component_templates`
Reusable page/section templates.

| Column | Notes |
|--------|-------|
| `id` | e.g. `tpl_blank_canvas_v1` |
| `slug`, `source_html_r2_key` | R2 path on `cms` bucket |
| `template_type`, `category` | UI grouping |

### `cms_tenants`
Site domain map: `slug` → `domain` (e.g. `inneranimalmedia` → `inneranimalmedia.com`).

### `cms_liquid_imports`
Shopify theme zip imports. Status: `inventory_ready` → `completed`.

### `agentsam_skill`
Skill playbooks. CMS edit: `id = skill_iam_cms_edit`, `route_keys_json` includes `cms_edit`.

## Key relationships

```
cms_tenants.slug = cms_pages.project_slug
cms_page_sections.page_id = cms_pages.id
cms_pages.r2_key → R2 cms/{workspace_id}/{project_id}/{slug}/published.html
```

## Migrations (recent CMS)

- `719_cms_agent_primetech_loop.sql` — agent tools
- `720_cms_edit_skill_playbook.sql` — skill injection
- `721_cms_default_page_templates.sql` — blank + starter templates
