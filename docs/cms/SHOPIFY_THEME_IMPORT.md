# Shopify theme import — honest capability map

## What works today

1. **Site Package flow** — upload zip → `inventory_ready` (full manifest, no live pages) → user Proceed → `completed`
2. **Dashboard wizard** — Site → Inventory → Proceed (DB / R2 / worker picker)
3. **Parser** finds `sections/*.liquid`, stages under `cms/liquid-imports/{id}/extracted/`
4. **Agent Sam tools** — `agentsam_site_package_inventory`, `agentsam_site_package_proceed`, `agentsam_site_package_proceed_targets`
5. **BYO D1** — Proceed with `db_target: workspace` uses `resolveCmsDatabase()` → remote D1 adapter

## What does not work yet (Shopify parity)

| Shopify | Our CMS |
|---------|---------|
| Live Liquid render | Liquid stored; editor uses HTML sections |
| Auto-create pages from `templates/*.json` | Homepage v1 from `index.json`; other templates manual |
| Theme settings schema UI | Theme editor partial |
| App blocks / snippets runtime | Not executed |
| One-click “theme matches preview” | Requires mapping + HTML conversion |

## Recommended path for your downloaded Shopify zip

1. Create CMS project / site in dashboard
2. **Imports** → drop your theme zip → wait for `status: completed`
3. Open **Imports** list — note `sections_found` count
4. Agent Sam or manual: map liquid sections → `cms_page_sections` + convert hero sections to HTML (pipeline `cms_pipeline_prototype` helps)
5. **Studio** (`/studio/editor?project=…`) — edit sections, preview draft on real route, publish

## API

```bash
# Upload (Phase A — inventory only)
curl -X POST "https://inneranimalmedia.com/api/cms/liquid-imports/upload?project_slug=YOUR_SITE" \
  -H "Cookie: …" -F "file=@theme.zip" -F "import_name=My Theme"

# Poll inventory
curl "https://inneranimalmedia.com/api/cms/site-packages/{import_id}/inventory" -H "Cookie: …"

# Proceed (Phase B — materialize to chosen D1/R2)
curl -X POST "https://inneranimalmedia.com/api/cms/site-packages/{import_id}/proceed" \
  -H "Cookie: …" -H "Content-Type: application/json" \
  -d '{"template":"index","sections":["header","footer"],"db_target":"platform","r2_target":"shared","worker_target":"shared"}'
```

## Next build targets (product repo)

- ~~Liquid → HTML section converter (Python pipeline)~~ **v1 shipped** — `/pipeline/theme-audit`, `/pipeline/theme-scaffold-plan`, `/pipeline/liquid-to-html`
- Import review UI (section picker → page assignment for non-index templates)
- Template gallery marketplace (persist `gallery_candidates` → sellable section library)

## Python theme audit (automatic on inventory)

After zip/tar unpack, the JS Worker calls **iam-cms-pipeline** (Python) to:

1. Parse each `sections/*.liquid` `{% schema %}` block
2. Emit **findings** (missing schema, snippet deps, asset hints)
3. Build **proposed_scaffold** — every `templates/*.json` mapped to `cms_pages` + `cms_page_sections`
4. Score **gallery_candidates** for reusable resale sections (`premium` / `standard` / `raw`)

Results merge into `result_json` and R2 `cms/liquid-imports/{id}/audit/report.json`.

```bash
# Re-run audit on existing package
curl -X POST "https://inneranimalmedia.com/api/cms/site-packages/{import_id}/audit" -H "Cookie: …"
```

Agent Sam: `agentsam_site_package_audit`, `cms_pipeline_theme_audit`, `cms_pipeline_liquid_to_html`
