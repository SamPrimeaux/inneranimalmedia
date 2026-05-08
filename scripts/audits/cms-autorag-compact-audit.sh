#!/usr/bin/env bash
set -euo pipefail

DB="inneranimalmedia-business"
CONFIG="wrangler.production.toml"
RUN="./scripts/with-cloudflare-env.sh npx wrangler d1 execute $DB --remote -c $CONFIG"

MD="/tmp/cms-autorag-compact-audit.md"
JSONL="/tmp/cms-autorag-compact-audit.jsonl"

TABLES=(
  cms_pages
  cms_site_pages
  cms_page_sections
  cms_section_components
  cms_component_templates
  cms_themes
  cms_theme_preferences
  cms_global_settings
  cms_navigation_menus
  cms_tenants
  cms_assets
  cms_collections
  cms_content
  cms_page_drafts
  cms_page_overrides
  cms_override_versions
  cms_live_edit_sessions
  cms_live_rollbacks
  cms_activity_log
  cms_collection_assets
  cms_liquid_imports
  cms_liquid_sections
  cms_conversion_jobs
  cms_conversions
)

recommend_use() {
  case "$1" in
    cms_pages) echo "Canonical route/page registry. Use for /dashboard/analytics page identity, route_path, auth flags, tenant/workspace/project targeting, and page-level config_json/analytics_json." ;;
    cms_site_pages) echo "Older/simple page registry. Useful for compatibility, but likely overlaps with cms_pages. Prefer cms_pages for richer dashboard/CMS routing." ;;
    cms_page_sections) echo "Section layout layer. Use as the analytics dashboard section system: KPI grid, warning strip, agent section, model section, deploy section, RAG section, codebase section." ;;
    cms_section_components) echo "Widget/component instance layer. Use as analytics widgets inside sections with component_type, component_data, sort_order, visibility, tenant/project scoping." ;;
    cms_component_templates) echo "Reusable section/widget template registry. Use for MetricCard, ChartCard, DataTable, WarningStrip, ModelLeaderboard, DeployTimeline, ToolWaterfall templates." ;;
    cms_themes) echo "Primary theme/token source. Use tokens_json, css_vars_json, brand_json, layout_json, typography_json, components_json, motion_json for dashboard styling." ;;
    cms_theme_preferences) echo "Theme assignment layer. Use to resolve active theme by user, tenant, workspace, project, or page scope." ;;
    cms_global_settings) echo "Global project/site defaults. Use for logo, site name, analytics ID, SEO defaults, scripts, and broad dashboard settings." ;;
    cms_navigation_menus) echo "Navigation/menu config. Use for dashboard sidebar/topbar groups if menu_type supports dashboard/app navigation." ;;
    cms_tenants) echo "Tenant registry. Use for tenant-specific CMS/dashboard scoping." ;;
    cms_assets) echo "Asset registry. Use for logos, preview images, chart thumbnails, page assets, and dashboard media." ;;
    cms_collections) echo "Structured content collection registry. Use for reusable content datasets, not raw telemetry." ;;
    cms_content) echo "Structured content entries. Use for static/managed CMS content, not metrics." ;;
    cms_page_drafts) echo "Draft state for page editing. Use for analytics dashboard draft layout changes before publish." ;;
    cms_page_overrides) echo "Override layer for page-level customization. Use for workspace/client-specific analytics dashboard overrides." ;;
    cms_override_versions) echo "Version history for overrides. Use for rollback/comparison of dashboard layout changes." ;;
    cms_live_edit_sessions) echo "Live editing session state. Use for collaborative dashboard/CMS editing." ;;
    cms_live_rollbacks) echo "Rollback records. Use for restoring previous dashboard layouts." ;;
    cms_activity_log) echo "Audit log for CMS changes. Use for tracking dashboard config edits." ;;
    cms_collection_assets) echo "Join table for collection assets. Empty capability table; use later if collections need asset relationships." ;;
    cms_liquid_imports) echo "Shopify/Liquid import tracking. Empty capability table; use later for Liquid migration workflows." ;;
    cms_liquid_sections) echo "Imported Liquid section registry. Empty capability table; use later for Shopify-style section conversion." ;;
    cms_conversion_jobs) echo "Conversion job queue/status. Empty capability table; use later for import/export/conversion pipelines." ;;
    cms_conversions) echo "Conversion output/history. Empty capability table; use later for CMS transformation records." ;;
    *) echo "CMS capability table. Inspect schema and decide role." ;;
  esac
}

analytics_use() {
  case "$1" in
    cms_pages|cms_page_sections|cms_section_components|cms_component_templates|cms_themes|cms_theme_preferences|cms_global_settings|cms_navigation_menus|cms_tenants|cms_assets|cms_page_drafts|cms_page_overrides|cms_override_versions|cms_live_edit_sessions|cms_live_rollbacks|cms_activity_log) echo "true" ;;
    *) echo "false" ;;
  esac
}

run_json() {
  local sql="$1"
  $RUN --json --command "$sql" 2>/dev/null || true
}

run_plain() {
  local sql="$1"
  $RUN --command "$sql" 2>/dev/null || true
}

json_escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

sample_sql_for_table() {
  local t="$1"
  case "$t" in
    cms_pages)
      echo "SELECT * FROM $t ORDER BY CASE WHEN route_path IN ('/dashboard/analytics','/dashboard/overview','/dashboard/health') THEN 0 WHEN page_type='dashboard' THEN 1 WHEN project_slug='inneranimalmedia' THEN 2 ELSE 9 END, updated_at DESC LIMIT 1;"
      ;;
    cms_page_sections)
      echo "SELECT * FROM $t ORDER BY CASE WHEN page_id LIKE '%dashboard%' OR page_id LIKE '%analytics%' OR page_id LIKE '%health%' THEN 0 ELSE 1 END, sort_order ASC, updated_at DESC LIMIT 1;"
      ;;
    cms_section_components)
      echo "SELECT * FROM $t ORDER BY CASE WHEN component_type LIKE '%metric%' OR component_type LIKE '%chart%' OR component_type LIKE '%card%' OR component_type LIKE '%widget%' THEN 0 ELSE 1 END, sort_order ASC, updated_at DESC LIMIT 1;"
      ;;
    cms_themes)
      echo "SELECT * FROM $t ORDER BY CASE WHEN slug LIKE '%iam%' OR slug LIKE '%dark%' OR slug LIKE '%tide%' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1;"
      ;;
    *)
      echo "SELECT * FROM $t ORDER BY rowid DESC LIMIT 1;"
      ;;
  esac
}

: > "$MD"
: > "$JSONL"

{
  echo "# CMS AutoRAG Compact Capability Audit"
  echo
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo
  echo "Purpose: one compact row per cms_* table for AutoRAG-friendly chunking."
  echo
  echo "Rule: raw metrics stay in telemetry tables; cms_* only controls layout, sections, widgets, themes, visibility, drafts, overrides, and navigation."
  echo
} >> "$MD"

for t in "${TABLES[@]}"; do
  row_count_raw="$(run_json "SELECT COUNT(*) AS rows FROM $t;")"
  row_count="$(python3 - <<PY
import json,sys
raw = '''$row_count_raw'''
try:
    data=json.loads(raw)
    print(data[0]["results"][0]["rows"])
except Exception:
    print(0)
PY
)"

  schema_raw="$(run_json "SELECT sql FROM sqlite_master WHERE type='table' AND name='$t';")"
  schema_sql="$(python3 - <<PY
import json,sys
raw = '''$schema_raw'''
try:
    data=json.loads(raw)
    print(data[0]["results"][0].get("sql",""))
except Exception:
    print("")
PY
)"

  sample_sql="$(sample_sql_for_table "$t")"
  sample_raw="$(run_json "$sample_sql")"

  json_cols_raw="$(run_json "
    SELECT name
    FROM pragma_table_info('$t')
    WHERE lower(name) LIKE '%json%'
       OR lower(name) LIKE '%config%'
       OR lower(name) LIKE '%metadata%'
       OR lower(name) LIKE '%tokens%'
       OR lower(name) LIKE '%theme%'
       OR lower(name) LIKE '%data%'
       OR lower(name) LIKE '%schema%'
       OR lower(name) LIKE '%settings%'
    ORDER BY cid;
  ")"

  json_cols="$(python3 - <<PY
import json,sys
raw = '''$json_cols_raw'''
try:
    data=json.loads(raw)
    print(json.dumps([r["name"] for r in data[0]["results"]]))
except Exception:
    print("[]")
PY
)"

  sample_json="$(python3 - <<PY
import json,sys
raw = '''$sample_raw'''
try:
    data=json.loads(raw)
    rows=data[0].get("results",[])
    print(json.dumps(rows[0] if rows else None, ensure_ascii=False))
except Exception:
    print("null")
PY
)"

  schema_json="$(printf "%s" "$schema_sql" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
  rec_use="$(recommend_use "$t")"
  rec_use_json="$(printf "%s" "$rec_use" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
  analytics_bool="$(analytics_use "$t")"

  if [ "$row_count" = "0" ]; then
    underused_status="empty_capability_table"
  elif [ "$row_count" -lt 5 ]; then
    underused_status="seeded_lightly"
  else
    underused_status="active_but_underused"
  fi

  cat >> "$JSONL" <<JSON
{"kind":"cms_table_capability","table":"$t","row_count":$row_count,"schema_sql":$schema_json,"sample_row":$sample_json,"json_columns":$json_cols,"relationship_notes":"Inspect foreign keys from CREATE TABLE SQL and page_id/section_id/theme_id references.","recommended_use":$rec_use_json,"analytics_dashboard_use":$analytics_bool,"underused_status":"$underused_status"}
JSON

  {
    echo
    echo "## $t"
    echo
    echo "- rows: $row_count"
    echo "- analytics_dashboard_use: $analytics_bool"
    echo "- underused_status: $underused_status"
    echo "- recommended_use: $rec_use"
    echo "- json_columns: $json_cols"
    echo
    echo "### Schema"
    echo '```sql'
    echo "$schema_sql"
    echo '```'
    echo
    echo "### One representative row"
    echo '```json'
    echo "$sample_json" | python3 -m json.tool 2>/dev/null || echo "$sample_json"
    echo '```'
  } >> "$MD"
done

echo "Wrote $MD"
echo "Wrote $JSONL"
