---
title: Pattern — CMS fragment publish pipeline
doc_type: platform_pattern
topic: cms_fragment_publish
lane_key: docs_knowledge_search
pattern_key: cms_fragment_publish_pipeline
vertical: nonprofit
stack: cloudflare-workers
tags:
  - cms
  - d1
  - r2
  - kv
  - publish
updated: 2026-06-19
---

# Pattern — CMS fragment publish pipeline

Sectionalized public site: **D1 is SSOT**, R2 holds per-section HTML fragments, Worker assembles full pages, KV caches assembled HTML.

## Mental model

```
Dashboard edit → D1 (cms_page_sections + cms_page_content_blocks)
       ↓ save / publish / sync
Section renderers → R2 static/pages/{route}/{section_key}.html
       ↓ assemble (Worker on request or publish)
Full page → KV page:{route} + optional R2 index.html artifact
       ↓
Public URL (custom domain)
```

## Canonical tables

| Table | Role |
|---|---|
| `cms_pages` | Route meta, `status`, `theme` |
| `cms_page_sections` | Section content keyed by `page_route` + `section_key` |
| `cms_page_content_blocks` | Repeating blocks within sections |
| `cms_brand_settings` | Header, footer, **navigation_json** (nav SSOT) |
| `cms_assets` | Media metadata + CDN URLs |
| `cms_publish_jobs` | Publish audit |

## Public request order

1. KV hit on `page:{route}` → return immediately
2. Fragment assembly from R2 section files + brand shell
3. R2 baked `index.html` fallback
4. Legacy full D1 render fallback

## API surface (typical)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/cms/bootstrap` | Pages + brand snapshot |
| `GET` | `/api/cms/page` | Editor load |
| `POST` | `/api/cms/section/save` | Section write |
| `POST` | `/api/cms/block/save` | Block write |
| `POST` | `/api/cms/publish` | Publish one route |

## Non-negotiable rules

- Never hand-edit R2 page HTML for permanent fixes — edit D1, then publish/sync.
- `image_url` fields must be **absolute CDN URLs**, not relative paths.
- Bust KV after every publish affecting public HTML.
- Sync dashboard/static assets to R2 when JS/CSS changes.

## Client overlay

Per-site: route registry, custom section renderers, fragment sync scripts, CDN hostname. See client `project-brief.md` + repo `docs/features/public-publish-pipeline.md`.

## Vectorization notes

**Synonyms:** sectionalized CMS, fragment pipeline, D1 to R2 publish, KV page cache, CMS publish contract, live website editor, page assembly.
