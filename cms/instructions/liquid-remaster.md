# Liquid → Inner Animal CMS remaster

## Honest capability map

| Shopify | Our CMS |
|---------|---------|
| Live Liquid render | **No** — store Liquid, render HTML sections |
| Auto pages from templates/*.json | Homepage from `index.json`; others via scaffold plan |
| Theme settings UI | Partial theme editor |
| Snippets runtime | Not executed |

## Recommended remaster path

1. **Import zip** — Dashboard → CMS → Imports, or `POST /api/cms/liquid-imports/upload`
2. **Inventory** — wait for `inventory_ready`; review `sections_found`
3. **Audit** — Python pipeline writes `cms/liquid-imports/{id}/audit/report.json`
4. **Scaffold plan** — map each `templates/*.json` to proposed `cms_pages` + sections
5. **Convert** — `cms_pipeline_liquid_to_html` or `cms_pipeline_prototype` per section
6. **Persist** — `agentsam_cms_save_injected` or `agentsam_cms_save_page_html`
7. **Publish** — `agentsam_cms_publish` + `agentsam_cms_verify_live`

## R2 layout after import

```
cms/liquid-imports/uploads/{importId}/{filename}.zip
cms/liquid-imports/{importId}/extracted/sections/*.liquid
cms/liquid-imports/{importId}/audit/report.json
```

## Site package proceed

```json
POST /api/cms/site-packages/{import_id}/proceed
{
  "template": "index",
  "sections": ["header", "footer"],
  "db_target": "platform",
  "r2_target": "shared",
  "worker_target": "shared"
}
```

## Gallery / resale

Theme audit scores `gallery_candidates` (`premium` / `standard` / `raw`) for future template marketplace.

Full doc: `docs/cms/SHOPIFY_THEME_IMPORT.md`
