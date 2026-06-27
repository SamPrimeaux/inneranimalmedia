# CMS Agent Runtime Contract

**Version:** 1  
**Bucket:** `cms` (R2 binding `CMS_BUCKET`, public origin `https://cms.inneranimalmedia.com`)  
**Route key:** `cms_edit`  
**Skill:** `skill_iam_cms_edit`

Agents working on CMS pages MUST follow this contract. Load the full index from R2 `instructions/manifest.json` or call `agentsam_cms_runtime_contract` / `GET /api/cms/runtime-contract`.

## Mandatory loop (PrimeTech)

```
agentsam_cms_read({ page_id })
→ save (cms_pipeline_prototype | agentsam_cms_save_page_html | agentsam_cms_save_injected | agentsam_cms_write)
→ agentsam_cms_publish({ page_id })
→ agentsam_cms_verify_live({ page_id })
```

**Success criteria:** `verify_live` returns HTTP 200, byte_length ≥ 500, `is_clean_canvas: false`, title matches when provided.

## Planes

| Plane | Binding | CMS use |
|-------|---------|---------|
| D1 | `DB` | Page/section metadata, templates registry |
| R2 | `CMS_BUCKET` | `cms/{ws}/{project}/{slug}/draft|published.html`, sections, templates, instructions |
| KV | `SESSION_CACHE` | Draft hot cache, bootstrap cache |
| DO | `IAM_COLLAB` | Live edit sessions |
| Worker | `CMS_PIPELINE` | Python HTML intelligence (`iam-cms-pipeline`) |

## Default page templates (R2)

| Template | R2 key | D1 id |
|----------|--------|-------|
| Blank canvas (default) | `templates/blank-canvas/index.html` | `tpl_blank_canvas_v1` |
| Starter page | `templates/starter-page/index.html` | `tpl_starter_page_v1` |

Registry: `templates/manifest.json`. Apply via dashboard wizard or `POST /api/cms/templates/:id/apply`.

## Instruction files (this bucket)

| File | Purpose |
|------|---------|
| `instructions/RUNTIME_CONTRACT.md` | This document |
| `instructions/manifest.json` | Machine index of all instruction assets |
| `instructions/database-schema.md` | D1 tables + columns agents may read/write |
| `instructions/agent-tools.md` | Tool names, params, risk levels |
| `instructions/python-pipeline.md` | `iam-cms-pipeline` endpoints + Python tools |
| `instructions/liquid-remaster.md` | Shopify zip → HTML section mapping |
| `instructions/r2-key-conventions.md` | Key prefixes and copy rules |
| `instructions/scripts.md` | Operator scripts (upload, verify, audit) |

## R2 read API (agents)

```
GET /api/cms/runtime-contract              → manifest + contract excerpt
GET /api/cms/runtime-contract?path=instructions/database-schema.md
```

Public (no auth): `https://cms.inneranimalmedia.com/instructions/{path}` when bucket public access enabled.

## Never

- Invent `page_id` — always from `agentsam_cms_read` or studio context
- Claim publish success without `agentsam_cms_verify_live`
- Treat `?cms=1` preview URL as the live storefront URL
- Demote published pages to draft on HTML save (Worker preserves `published` status)

## Types (TypeScript)

Canonical shapes: `src/types/cms.ts` — `CmsPage`, `CmsPublishResponse`, `CmsAgentReadResponse`, `ExecuteCmsPagePublishResult`.
