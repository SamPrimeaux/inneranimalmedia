# CMS R2 key conventions

**Default bucket:** `cms` (`CMS_DEFAULT_R2_BUCKET`)  
**Public origin:** `https://cms.inneranimalmedia.com`  
**Fallback:** `inneranimalmedia` on `ASSETS` for legacy marketing templates

## Page HTML

```
cms/{workspace_id}/{project_id}/{slug}/draft.html
cms/{workspace_id}/{project_id}/{slug}/published.html
cms/{workspace_id}/{project_id}/{slug}/snapshots/{timestamp}.html
```

Rule: **R2 write before D1 write.** Publish copies draft → published (get + put).

## Section injections

```
cms/sections/{pageSlug}/{sectionName}/{hash}.html
```

Rendered via `renderCmsSectionTreeHtmlWithInjections` when sections exist.

## Templates & instructions (this bucket root)

```
templates/manifest.json
templates/blank-canvas/index.html
templates/starter-page/index.html
instructions/manifest.json
instructions/RUNTIME_CONTRACT.md
instructions/*.md
```

## Liquid imports

```
cms/liquid-imports/uploads/{importId}/...
cms/liquid-imports/{importId}/extracted/...
cms/liquid-imports/{importId}/audit/report.json
```

## Dashboard static (ASSETS bucket `inneranimalmedia`)

```
static/dashboard/app/cms/cms-editor.js
static/dashboard/app/cms/cms-studio-shell.html
static/pages/marketing/{slug}/index.html
static/templates/ui/{slug}/index.html
```

## KV keys

```
cms:bootstrap:{workspace_id}:{project_slug}
cms:draft:{page_id}:{user_id}
cms:publish-lock:{workspace_id}:{project_slug}
```

Code: `src/core/cms-kv-cache.js`, `src/core/cms-r2-binding.js`
