# Shopify theme import — honest capability map

## What works today

1. **Dashboard → CMS → Imports** — drag-and-drop or choose `.zip` / `.tar.gz` (up to 80MB)
2. **Upload** → `cms` R2 bucket → queue extracts archive
3. **Parser** finds `sections/*.liquid`, stages files under `cms/liquid-imports/{id}/extracted/`
4. **D1** rows in `cms_liquid_sections` with liquid source text
5. **Studio editor** — Shopify-like chrome for **HTML sections** (`data-cms-section`), draft preview, publish

## What does not work yet (Shopify parity)

| Shopify | Our CMS |
|---------|---------|
| Live Liquid render | Liquid stored; editor uses HTML sections |
| Auto-create pages from `templates/*.json` | Manual / Agent Sam mapping |
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
curl -X POST "https://inneranimalmedia.com/api/cms/liquid-imports/upload?project_slug=YOUR_SITE" \
  -H "Cookie: …" \
  -F "file=@theme.zip" \
  -F "import_name=My Shopify Theme"
```

## Next build targets (product repo)

- Liquid → HTML section converter (Python pipeline)
- Auto-map `templates/index.json` → cms_pages
- Import review UI (section picker → page assignment)
