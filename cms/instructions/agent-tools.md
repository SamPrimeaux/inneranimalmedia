# CMS agent tools (D1 + Worker)

**Route:** `cms_edit` · **Max tools:** 14 · **Optional:** terminal, email, CMS pipeline, browser inspect · **Blocked:** secret_write only

## PrimeTech loop (host Worker)

| Tool | Params | Action |
|------|--------|--------|
| `agentsam_cms_read` | `page_id?`, `project_slug?`, `include_html?` | Page list or detail + HTML excerpts |
| `agentsam_cms_write` | `section_id`, `section_data` | Update section JSON + draft |
| `agentsam_cms_save_page_html` | `page_id`, `html` | Full-page HTML → draft R2 |
| `agentsam_cms_save_injected` | `page_id`, `section_name`, `html` | Section fragment → R2 inject |
| `agentsam_cms_publish` | `page_id` | Gates + draft→published (shared `executeCmsPagePublish`) |
| `agentsam_cms_verify_live` | `page_id`, `url?`, `expect_title?`, `expect_snippet?` | HTTP check on live URL |
| `agentsam_cms_runtime_contract` | `path?` | Load R2 instructions manifest or single file |

## Python pipeline (`CMS_PIPELINE` binding)

| Tool | Endpoint | Risk |
|------|----------|------|
| `cms_pipeline_bootstrap` | `GET /pipeline/bootstrap` | low |
| `cms_pipeline_prototype` | `POST /agent/prototype` | medium |
| `cms_pipeline_extract` | `POST /pipeline/extract-sections` | low |
| `cms_pipeline_inject` | `POST /pipeline/inject` | medium |
| `cms_pipeline_theme_audit` | theme audit on import | low |
| `cms_pipeline_liquid_to_html` | Liquid section → HTML proposal | medium |

## Site package (Shopify zip)

| Tool | Phase |
|------|-------|
| `agentsam_site_package_inventory` | A — parse zip, no live writes |
| `agentsam_site_package_proceed` | B — materialize to D1/R2 |
| `agentsam_site_package_audit` | Re-run Python theme audit |

## HTTP API (dashboard / same auth)

- `GET /api/cms/bootstrap?project_slug=`
- `GET /api/cms/pages/:id`
- `PUT /api/cms/pages/:id` (content → draft R2)
- `POST /api/cms/pages/:id/publish`
- `POST /api/cms/templates/:id/apply`
- `GET /api/cms/runtime-contract?path=`

Implementation: `src/tools/builtin/cms.js`, `src/core/cms-agent-publish.ts`, `src/api/cms.js`.
