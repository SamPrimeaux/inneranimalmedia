# CMS AutoRAG Compact Capability Audit

Generated: 2026-05-08T05:24:31Z

Purpose: one compact row per cms_* table for AutoRAG-friendly chunking.

Rule: raw metrics stay in telemetry tables; cms_* only controls layout, sections, widgets, themes, visibility, drafts, overrides, and navigation.


## cms_pages

- rows: 17
- analytics_dashboard_use: true
- underused_status: active_but_underused
- recommended_use: Canonical route/page registry. Use for /dashboard/analytics page identity, route_path, auth flags, tenant/workspace/project targeting, and page-level config_json/analytics_json.
- json_columns: ["config_json", "seo_json", "analytics_json", "metadata_json"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_site_pages

- rows: 49
- analytics_dashboard_use: false
- underused_status: active_but_underused
- recommended_use: Older/simple page registry. Useful for compatibility, but likely overlaps with cms_pages. Prefer cms_pages for richer dashboard/CMS routing.
- json_columns: ["metadata_json"]

### Schema
```sql

```

### One representative row
```json
{
    "id": "af58e855706a79cc",
    "project_id": "proj_connor_leadership_legacy",
    "project_slug": "leadership-legacy",
    "path": "/learn",
    "title": "Learn | AI Insights & Case Studies by Connor McNeely",
    "description": null,
    "is_active": 1,
    "sort_order": 0,
    "page_type": "page",
    "created_at": "2026-05-03T17:09:59.930368Z",
    "updated_at": "2026-05-03T17:09:59.930371Z",
    "tenant_id": "tenant_connor_mcneely",
    "workspace_id": "ws_connor_mcneely",
    "worker_id": null,
    "person_uuid": null,
    "seo_title": null,
    "canonical_url": null,
    "robots": "index,follow",
    "r2_bucket": "leadership-legacy",
    "r2_key": "pages/learn.html",
    "r2_url": "https://pub-d426ded97b90451886c5cc7870ae9f17.r2.dev/pages/learn.html",
    "content_type": "text/html",
    "status": "published",
    "published_at": "2026-05-03T17:09:59.930355Z",
    "metadata_json": "{}"
}
```

## cms_page_sections

- rows: 46
- analytics_dashboard_use: true
- underused_status: active_but_underused
- recommended_use: Section layout layer. Use as the analytics dashboard section system: KPI grid, warning strip, agent section, model section, deploy section, RAG section, codebase section.
- json_columns: ["section_data"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_section_components

- rows: 93
- analytics_dashboard_use: true
- underused_status: active_but_underused
- recommended_use: Widget/component instance layer. Use as analytics widgets inside sections with component_type, component_data, sort_order, visibility, tenant/project scoping.
- json_columns: ["component_data"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_component_templates

- rows: 24
- analytics_dashboard_use: true
- underused_status: active_but_underused
- recommended_use: Reusable section/widget template registry. Use for MetricCard, ChartCard, DataTable, WarningStrip, ModelLeaderboard, DeployTimeline, ToolWaterfall templates.
- json_columns: ["template_data"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_themes

- rows: 108
- analytics_dashboard_use: true
- underused_status: active_but_underused
- recommended_use: Primary theme/token source. Use tokens_json, css_vars_json, brand_json, layout_json, typography_json, components_json, motion_json for dashboard styling.
- json_columns: ["config", "theme_family", "monaco_theme", "monaco_theme_data", "tokens_json", "css_vars_json", "brand_json", "layout_json", "typography_json", "components_json", "motion_json", "alias_of_theme_id"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_theme_preferences

- rows: 4
- analytics_dashboard_use: true
- underused_status: seeded_lightly
- recommended_use: Theme assignment layer. Use to resolve active theme by user, tenant, workspace, project, or page scope.
- json_columns: ["theme_id", "theme_slug"]

### Schema
```sql

```

### One representative row
```json
{
    "id": "ctp_workspace_ws_connor_mcneely",
    "tenant_id": "tenant_connor_mcneely",
    "user_id": null,
    "workspace_id": "ws_connor_mcneely",
    "project_id": null,
    "page_id": null,
    "theme_id": "theme_iam_engineer_blue",
    "theme_slug": "iam-engineer-blue",
    "scope": "workspace",
    "is_active": 1,
    "created_at": "2026-05-05 22:55:53",
    "updated_at": "2026-05-05 22:55:53"
}
```

## cms_global_settings

- rows: 5
- analytics_dashboard_use: true
- underused_status: active_but_underused
- recommended_use: Global project/site defaults. Use for logo, site name, analytics ID, SEO defaults, scripts, and broad dashboard settings.
- json_columns: ["settings_json"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_navigation_menus

- rows: 3
- analytics_dashboard_use: true
- underused_status: seeded_lightly
- recommended_use: Navigation/menu config. Use for dashboard sidebar/topbar groups if menu_type supports dashboard/app navigation.
- json_columns: []

### Schema
```sql

```

### One representative row
```json
null
```

## cms_tenants

- rows: 12
- analytics_dashboard_use: true
- underused_status: active_but_underused
- recommended_use: Tenant registry. Use for tenant-specific CMS/dashboard scoping.
- json_columns: ["theme", "settings"]

### Schema
```sql

```

### One representative row
```json
{
    "id": "tenant_inneranimalmedia",
    "name": "Inner Animal Media",
    "slug": "inneranimalmedia-tenant",
    "logo_url": "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar",
    "primary_color": "#1a73e8",
    "secondary_color": "#174ea6",
    "theme": "light",
    "created_at": "2026-04-25 04:21:35",
    "updated_at": "2026-04-25 04:21:35",
    "domain": "inneranimalmedia.com",
    "settings": null,
    "is_active": 1,
    "tenant_ref_id": null
}
```

## cms_assets

- rows: 100
- analytics_dashboard_use: true
- underused_status: active_but_underused
- recommended_use: Asset registry. Use for logos, preview images, chart thumbnails, page assets, and dashboard media.
- json_columns: ["metadata"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_collections

- rows: 5
- analytics_dashboard_use: false
- underused_status: active_but_underused
- recommended_use: Structured content collection registry. Use for reusable content datasets, not raw telemetry.
- json_columns: []

### Schema
```sql

```

### One representative row
```json
{
    "id": "col_sb_pages",
    "tenant_id": "swampbloodgatorguides",
    "name": "Pages",
    "description": "Site pages and content",
    "thumbnail_url": null,
    "is_public": 1,
    "created_by": null,
    "created_at": 1771577080,
    "updated_at": 1771577080
}
```

## cms_content

- rows: 4
- analytics_dashboard_use: false
- underused_status: seeded_lightly
- recommended_use: Structured content entries. Use for static/managed CMS content, not metrics.
- json_columns: []

### Schema
```sql

```

### One representative row
```json
null
```

## cms_page_drafts

- rows: 0
- analytics_dashboard_use: true
- underused_status: empty_capability_table
- recommended_use: Draft state for page editing. Use for analytics dashboard draft layout changes before publish.
- json_columns: ["draft_data"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_page_overrides

- rows: 0
- analytics_dashboard_use: true
- underused_status: empty_capability_table
- recommended_use: Override layer for page-level customization. Use for workspace/client-specific analytics dashboard overrides.
- json_columns: ["overrides_json"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_override_versions

- rows: 0
- analytics_dashboard_use: true
- underused_status: empty_capability_table
- recommended_use: Version history for overrides. Use for rollback/comparison of dashboard layout changes.
- json_columns: ["overrides_json"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_live_edit_sessions

- rows: 0
- analytics_dashboard_use: true
- underused_status: empty_capability_table
- recommended_use: Live editing session state. Use for collaborative dashboard/CMS editing.
- json_columns: []

### Schema
```sql

```

### One representative row
```json
null
```

## cms_live_rollbacks

- rows: 0
- analytics_dashboard_use: true
- underused_status: empty_capability_table
- recommended_use: Rollback records. Use for restoring previous dashboard layouts.
- json_columns: []

### Schema
```sql

```

### One representative row
```json
null
```

## cms_activity_log

- rows: 1
- analytics_dashboard_use: true
- underused_status: seeded_lightly
- recommended_use: Audit log for CMS changes. Use for tracking dashboard config edits.
- json_columns: []

### Schema
```sql

```

### One representative row
```json
null
```

## cms_collection_assets

- rows: 0
- analytics_dashboard_use: false
- underused_status: empty_capability_table
- recommended_use: Join table for collection assets. Empty capability table; use later if collections need asset relationships.
- json_columns: []

### Schema
```sql

```

### One representative row
```json
null
```

## cms_liquid_imports

- rows: 0
- analytics_dashboard_use: false
- underused_status: empty_capability_table
- recommended_use: Shopify/Liquid import tracking. Empty capability table; use later for Liquid migration workflows.
- json_columns: ["theme_name"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_liquid_sections

- rows: 0
- analytics_dashboard_use: false
- underused_status: empty_capability_table
- recommended_use: Imported Liquid section registry. Empty capability table; use later for Shopify-style section conversion.
- json_columns: ["schema_json", "settings_map_json"]

### Schema
```sql

```

### One representative row
```json
null
```

## cms_conversion_jobs

- rows: 0
- analytics_dashboard_use: false
- underused_status: empty_capability_table
- recommended_use: Conversion job queue/status. Empty capability table; use later for import/export/conversion pipelines.
- json_columns: []

### Schema
```sql

```

### One representative row
```json
null
```

## cms_conversions

- rows: 0
- analytics_dashboard_use: false
- underused_status: empty_capability_table
- recommended_use: Conversion output/history. Empty capability table; use later for CMS transformation records.
- json_columns: []

### Schema
```sql

```

### One representative row
```json
null
```
