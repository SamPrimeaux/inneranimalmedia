# Python CMS pipeline (`iam-cms-pipeline`)

**Service binding:** `CMS_PIPELINE` · **Deploy:** `vendor/inneranimalmedia-cms/services/cms-pipeline-service`

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/pipeline/bootstrap` | Project tree from D1 |
| POST | `/agent/prototype` | AI HTML section proposal from goal + page context |
| POST | `/pipeline/extract-sections` | Parse HTML → section candidates |
| POST | `/pipeline/inject` | Merge section HTML into shell |
| POST | `/pipeline/theme-audit` | Shopify zip section/schema audit |
| POST | `/pipeline/theme-scaffold-plan` | Map templates/*.json → cms_pages |
| POST | `/pipeline/liquid-to-html` | Liquid section → HTML (v1 converter) |

## When to use

1. **Prototype new content:** `cms_pipeline_prototype({ goal, page_id })` before save
2. **Theme import:** automatic audit on upload; re-run via `agentsam_site_package_audit`
3. **Section extraction:** pasted HTML → structured sections

## Agent flow with pipeline

```
agentsam_cms_read → cms_pipeline_prototype → agentsam_cms_save_page_html
→ agentsam_cms_publish → agentsam_cms_verify_live
```

## Local ops

```bash
./scripts/setup_cms_python_worker.sh
cd vendor/inneranimalmedia-cms/services/cms-pipeline-service
uv run pywrangler deploy
```

Python modules vendored under `python_modules/` (BeautifulSoup, workers SDK).
